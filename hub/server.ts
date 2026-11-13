import { createReadStream, realpathSync, type Stats } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createMergeableStore } from 'tinybase';
import { createFilePersister, type FilePersister } from 'tinybase/persisters/persister-file';
import { createWsServer } from 'tinybase/synchronizers/synchronizer-ws-server';
import { createPush, DATA_FILE, DEFAULT_PUSH_SUBJECT, parseEndpoint, parseSubscription, type NotifierOptions, type Push } from './push.ts';

export interface HubOptions {
  port: number;
  host?: string;
  dataDir: string;
  staticDir: string;
  /** The VAPID subject; defaults to DEFAULT_PUSH_SUBJECT. */
  pushSubject?: string;
  notifier?: NotifierOptions;
}
export interface Hub { port: number; close(): Promise<void> }
export const SYNC_PATH = '/sync/watodo';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = '4780';
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
const REVALIDATE_CACHE = 'no-cache';
const PUSH_KEY_PATH = '/hub/push/key';
const PUSH_SUBSCRIBE_PATH = '/hub/push/subscribe';
const PUSH_UNSUBSCRIBE_PATH = '/hub/push/unsubscribe';
const PUSH_TEST_PATH = '/hub/push/test';
const PUSH_POST_PATHS = new Set([PUSH_SUBSCRIBE_PATH, PUSH_UNSUBSCRIBE_PATH, PUSH_TEST_PATH]);
const MAX_BODY_BYTES = 16 * 1024;

const CONTENT_TYPES = new Map<string, string>([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

export async function startHub(options: HubOptions): Promise<Hub> {
  const host = options.host ?? DEFAULT_HOST;
  const dataDir = path.resolve(options.dataDir);
  const staticDir = path.resolve(options.staticDir);
  await mkdir(dataDir, { recursive: true });

  const push = createPush(dataDir, options.pushSubject || DEFAULT_PUSH_SUBJECT, options.notifier);
  // The VAPID keys are made on the first start. A failure is logged, not fatal: sync works without notifications.
  await push.publicKey().catch((error: unknown) => {
    console.error('watodo push: could not load the VAPID keys', error);
  });

  // One persister exists while clients are on the path; keep the latest so close() can flush it.
  let persister: FilePersister | undefined;
  const wss = new WebSocketServer({ noServer: true });
  const wsServer = createWsServer(wss, () => {
    persister = createFilePersister(createMergeableStore(), path.join(dataDir, DATA_FILE));
    return persister;
  });

  const sockets = new Set<Socket>();
  const server = createServer((req, res) => {
    handleRequest(req, res, staticDir, push).catch(() => {
      if (res.headersSent) {
        res.destroy();
      } else {
        sendText(res, 500, 'Internal Server Error');
      }
    });
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  server.on('upgrade', (req, socket, head) => {
    if (requestPath(req.url) !== SYNC_PATH) {
      socket.on('error', () => socket.destroy());
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port, host, () => {
        server.off('error', reject);
        resolve();
      });
    });
  } catch (error) {
    await push.close();
    await wsServer.destroy();
    throw error;
  }

  const { port } = server.address() as AddressInfo;

  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closing ??= (async () => {
      // Stop the notifier first, so no send or write is still running when the data is flushed.
      await push.close();
      // Stop listening, then drop every open connection so the server can finish closing.
      const serverClosed = new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      // The persister is destroyed once the last client leaves the path, and a destroyed persister
      // cannot save. So flush while clients are still connected. If the server has already destroyed
      // it, there is nothing left to flush through it, and the error is ignored.
      if (persister && wss.clients.size > 0) {
        await persister.save().catch(() => {});
      }
      for (const client of [...wss.clients]) {
        client.terminate();
      }
      for (const socket of sockets) {
        socket.destroy();
      }
      await wsServer.destroy();
      await serverClosed;
    })();
    return closing;
  };

  return { port, close };
}

// The request path without the query string. Raw, so callers decide what to decode.
function requestPath(url: string | undefined): string {
  return (url ?? '/').split('?')[0];
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, staticDir: string, push: Push): Promise<void> {
  const method = req.method ?? '';
  if (method === 'POST' && PUSH_POST_PATHS.has(requestPath(req.url))) {
    await handlePushPost(req, res, requestPath(req.url), push);
    return;
  }
  if (method !== 'GET' && method !== 'HEAD') {
    sendText(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    return;
  }

  const raw = requestPath(req.url);
  if (!raw.startsWith('/')) {
    sendText(res, 400, 'Bad Request');
    return;
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(raw);
  } catch {
    sendText(res, 400, 'Bad Request');
    return;
  }
  if (pathname.includes('\0')) {
    sendText(res, 400, 'Bad Request');
    return;
  }

  if (pathname === '/hub/time') {
    const body = JSON.stringify({ now: Date.now() });
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(Buffer.byteLength(body)),
      'Cache-Control': 'no-store',
    });
    res.end(method === 'HEAD' ? undefined : body);
    return;
  }

  if (pathname === PUSH_KEY_PATH) {
    const body = JSON.stringify({ publicKey: await push.publicKey() });
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(Buffer.byteLength(body)),
      'Cache-Control': 'no-store',
    });
    res.end(method === 'HEAD' ? undefined : body);
    return;
  }

  if (pathname.startsWith('/sync/')) {
    sendText(res, 426, 'Upgrade Required', { Upgrade: 'websocket' });
    return;
  }

  await serveStatic(req, res, staticDir, pathname);
}

async function handlePushPost(req: IncomingMessage, res: ServerResponse, route: string, push: Push): Promise<void> {
  if (route === PUSH_TEST_PATH) {
    req.resume();
    await push.test();
    sendEmpty(res);
    return;
  }

  const text = await readBody(req, MAX_BODY_BYTES);
  if (text === undefined) {
    sendText(res, 400, 'Bad Request', { Connection: 'close' });
    return;
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    sendText(res, 400, 'Bad Request');
    return;
  }

  if (route === PUSH_SUBSCRIBE_PATH) {
    const subscription = parseSubscription(body);
    if (!subscription) {
      sendText(res, 400, 'Bad Request');
      return;
    }
    await push.subscribe(subscription);
  } else {
    const endpoint = parseEndpoint(typeof body === 'object' && body !== null ? (body as { endpoint?: unknown }).endpoint : undefined);
    if (endpoint === undefined) {
      sendText(res, 400, 'Bad Request');
      return;
    }
    await push.unsubscribe(endpoint);
  }
  sendEmpty(res);
}

// Resolves undefined when the body is over the limit. The rest of it is read and dropped.
function readBody(req: IncomingMessage, limit: number): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
        resolve(undefined);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(tooLarge ? undefined : Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendEmpty(res: ServerResponse): void {
  res.writeHead(204, { 'Cache-Control': 'no-store' });
  res.end();
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, staticDir: string, pathname: string): Promise<void> {
  const target = path.join(staticDir, pathname);
  if (!isInside(staticDir, target)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  const found = await statFile(target);
  if (found) {
    sendFile(req, res, staticDir, target, found);
    return;
  }

  // The app is a single page: an extensionless path that matches no file gets the shell.
  if (path.posix.extname(pathname) === '') {
    const index = path.join(staticDir, 'index.html');
    const indexStat = await statFile(index);
    if (indexStat) {
      sendFile(req, res, staticDir, index, indexStat);
      return;
    }
  }

  sendText(res, 404, 'Not Found');
}

function sendFile(req: IncomingMessage, res: ServerResponse, staticDir: string, file: string, info: Stats): void {
  const underAssets = path.relative(staticDir, file).split(path.sep)[0] === 'assets';
  res.writeHead(200, {
    'Content-Type': CONTENT_TYPES.get(path.extname(file).toLowerCase()) ?? 'application/octet-stream',
    'Content-Length': String(info.size),
    'Cache-Control': underAssets ? IMMUTABLE_CACHE : REVALIDATE_CACHE,
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

async function statFile(file: string): Promise<Stats | undefined> {
  try {
    const info = await stat(file);
    return info.isFile() ? info : undefined;
  } catch {
    return undefined;
  }
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function sendText(res: ServerResponse, status: number, message: string, extra: Record<string, string> = {}): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extra,
  });
  res.end(message);
}

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`WATODO_PORT must be a port number, got "${value}"`);
  }
  return port;
}

async function runFromCommandLine(): Promise<void> {
  const port = parsePort(process.env.WATODO_PORT || DEFAULT_PORT);
  const dataDir = process.env.WATODO_DATA_DIR
    || path.join(process.env.XDG_DATA_HOME || path.join(homedir(), '.local', 'share'), 'watodo');
  const staticDir = process.env.WATODO_STATIC_DIR || fileURLToPath(new URL('../dist', import.meta.url));

  const hub = await startHub({ port, dataDir, staticDir, pushSubject: process.env.WATODO_PUSH_SUBJECT });
  console.log(`watodo hub listening on http://${DEFAULT_HOST}:${hub.port}`);
  console.log(`  data:   ${dataDir}`);
  console.log(`  static: ${staticDir}`);

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      console.log(`${signal} received, stopping`);
      hub.close().then(
        () => process.exit(0),
        (error: unknown) => {
          console.error(error);
          process.exit(1);
        },
      );
    });
  }
}

if (isEntryPoint()) {
  runFromCommandLine().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
