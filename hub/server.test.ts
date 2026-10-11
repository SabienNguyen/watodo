import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { request, type IncomingHttpHeaders } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { WebSocket } from 'ws';
import { createMergeableStore, type MergeableStore } from 'tinybase';
import { createWsSynchronizer, type WsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client';
import * as hubModule from './server.ts';
import { SYNC_PATH, startHub, type Hub } from './server.ts';

const INDEX_HTML = '<!doctype html><title>watodo</title><div id="root"></div>';
const APP_JS = 'console.log("app");';
const SECRET = 'TOP SECRET';

interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

interface Client {
  store: MergeableStore;
  ws: WebSocket;
  sync: WsSynchronizer<WebSocket>;
}

let base: string;
let staticDir: string;
let dataDir: string;
let hubs: Hub[];
let clients: Client[];

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'watodo-hub-'));
  staticDir = path.join(base, 'static');
  dataDir = path.join(base, 'data');
  await writeSite(staticDir);
  // Lives next to staticDir, so any escape from staticDir would reach it.
  await writeFile(path.join(base, 'secret'), SECRET);
  hubs = [];
  clients = [];
});

afterEach(async () => {
  await Promise.allSettled(clients.map(async (client) => {
    client.ws.terminate();
    await client.sync.destroy();
  }));
  await Promise.allSettled(hubs.map((hub) => hub.close()));
  await rm(base, { recursive: true, force: true });
});

async function writeSite(dir: string): Promise<void> {
  await mkdir(path.join(dir, 'assets'), { recursive: true });
  await writeFile(path.join(dir, 'index.html'), INDEX_HTML);
  await writeFile(path.join(dir, 'assets', 'app.js'), APP_JS);
  await writeFile(path.join(dir, 'sw.js'), 'self.addEventListener("install", () => {});');
  await writeFile(path.join(dir, 'manifest.webmanifest'), '{"name":"watodo"}');
  await writeFile(path.join(dir, 'icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
}

async function startTestHub(port = 0): Promise<Hub> {
  const hub = await startHub({ port, dataDir, staticDir });
  hubs.push(hub);
  return hub;
}

// Raw node:http, so paths such as /assets/../../secret reach the server unnormalised.
function rawRequest(port: number, method: string, requestPath: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path: requestPath }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function syncUrl(port: number): string {
  return `ws://127.0.0.1:${port}${SYNC_PATH}`;
}

// Polls until check() is true, failing at the deadline. Sync is asynchronous, so tests never sleep for a fixed time.
async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('timed out waiting for sync');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function connectClient(id: string, url: string, store = createMergeableStore(id)): Promise<Client> {
  const ws = new WebSocket(url);
  const sync = await createWsSynchronizer(store, ws);
  await sync.startSync();
  const client = { store, ws, sync };
  clients.push(client);
  return client;
}

// A dropped connection gets a new socket and a new synchronizer on the same store.
async function reconnect(client: Client, url: string): Promise<void> {
  await client.sync.destroy();
  client.ws = new WebSocket(url);
  client.sync = await createWsSynchronizer(client.store, client.ws);
  await client.sync.startSync();
}

async function disconnect(client: Client): Promise<void> {
  await client.sync.destroy();
  if (client.ws.readyState !== WebSocket.CLOSED) {
    await new Promise<void>((resolve) => {
      client.ws.once('close', () => resolve());
      client.ws.close();
    });
  }
}

// Resolves 'open' if the upgrade succeeds, 'refused' on any error or close before it.
function tryOpen(url: string): Promise<'open' | 'refused'> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    ws.once('open', () => {
      ws.terminate();
      resolve('open');
    });
    ws.once('error', () => resolve('refused'));
    ws.once('close', () => resolve('refused'));
  });
}

describe('importing the module', () => {
  test('exports only the contract and starts no server', () => {
    expect(Object.keys(hubModule).sort()).toEqual(['SYNC_PATH', 'startHub']);
    expect(SYNC_PATH).toBe('/sync/watodo');
  });
});

describe('static files', () => {
  test('GET / and GET /index.html return the html, not cached', async () => {
    const hub = await startTestHub();
    for (const requestPath of ['/', '/index.html']) {
      const reply = await rawRequest(hub.port, 'GET', requestPath);
      expect(reply.status).toBe(200);
      expect(reply.headers['content-type']).toMatch(/^text\/html/);
      expect(reply.headers['cache-control']).toBe('no-cache');
      expect(reply.body).toBe(INDEX_HTML);
    }
  });

  test('files under /assets/ are served as JavaScript with an immutable cache header', async () => {
    const hub = await startTestHub();
    const reply = await rawRequest(hub.port, 'GET', '/assets/app.js');
    expect(reply.status).toBe(200);
    expect(reply.headers['content-type']).toMatch(/javascript/);
    expect(reply.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(reply.body).toBe(APP_JS);
  });

  test('the web app manifest has a manifest content type and no-cache', async () => {
    const hub = await startTestHub();
    const reply = await rawRequest(hub.port, 'GET', '/manifest.webmanifest');
    expect(reply.status).toBe(200);
    expect(reply.headers['content-type']).toMatch(/manifest\+json/);
    expect(reply.headers['cache-control']).toBe('no-cache');
  });

  test('png files get an image content type', async () => {
    const hub = await startTestHub();
    const reply = await rawRequest(hub.port, 'GET', '/icon.png');
    expect(reply.status).toBe(200);
    expect(reply.headers['content-type']).toBe('image/png');
  });

  test('a path with no extension and no file gets index.html', async () => {
    const hub = await startTestHub();
    const reply = await rawRequest(hub.port, 'GET', '/journal');
    expect(reply.status).toBe(200);
    expect(reply.headers['content-type']).toMatch(/^text\/html/);
    expect(reply.body).toBe(INDEX_HTML);
  });

  test('a missing file with an extension is 404', async () => {
    const hub = await startTestHub();
    const reply = await rawRequest(hub.port, 'GET', '/missing.png');
    expect(reply.status).toBe(404);
  });

  test('paths that escape staticDir never return a file from outside it', async () => {
    const hub = await startTestHub();
    for (const requestPath of [
      '/..%2f..%2fetc/passwd',
      '/..%2fsecret',
      '/%2e%2e/secret',
      '/assets/../../secret',
    ]) {
      const reply = await rawRequest(hub.port, 'GET', requestPath);
      expect([403, 404]).toContain(reply.status);
      expect(reply.body).not.toContain(SECRET);
    }
  });

  test('a NUL byte in the path is rejected', async () => {
    const hub = await startTestHub();
    const reply = await rawRequest(hub.port, 'GET', '/index%00.html');
    expect(reply.status).toBe(400);
    expect(reply.body).not.toContain(INDEX_HTML);
  });

  test('HEAD / returns the headers and no body', async () => {
    const hub = await startTestHub();
    const reply = await rawRequest(hub.port, 'HEAD', '/');
    expect(reply.status).toBe(200);
    expect(reply.headers['content-type']).toMatch(/^text\/html/);
    expect(reply.headers['content-length']).toBe(String(Buffer.byteLength(INDEX_HTML)));
    expect(reply.body).toBe('');
  });

  test('POST / is 405', async () => {
    const hub = await startTestHub();
    const reply = await rawRequest(hub.port, 'POST', '/');
    expect(reply.status).toBe(405);
    expect(reply.headers['allow']).toContain('GET');
  });

  test('plain HTTP requests to /sync/ never return a file', async () => {
    const hub = await startTestHub();
    const reply = await rawRequest(hub.port, 'GET', SYNC_PATH);
    expect([404, 426]).toContain(reply.status);
    expect(reply.body).not.toContain(INDEX_HTML);
  });
});

describe('/hub/time', () => {
  test('returns the hub clock as JSON, not cached', async () => {
    const hub = await startTestHub();
    const reply = await rawRequest(hub.port, 'GET', '/hub/time');
    expect(reply.status).toBe(200);
    expect(reply.headers['cache-control']).toBe('no-store');
    const { now } = JSON.parse(reply.body) as { now: number };
    expect(Math.abs(now - Date.now())).toBeLessThanOrEqual(2000);
  });
});

describe('WebSocket upgrades', () => {
  test('refuses upgrades on any path other than /sync/watodo', async () => {
    const hub = await startTestHub();
    for (const pathname of ['/other', '/sync/other', `${SYNC_PATH}/extra`]) {
      expect(await tryOpen(`ws://127.0.0.1:${hub.port}${pathname}`)).toBe('refused');
    }
  });

  test('accepts an upgrade on /sync/watodo', async () => {
    const hub = await startTestHub();
    expect(await tryOpen(syncUrl(hub.port))).toBe('open');
  });
});

describe('sync', () => {
  test('two clients converge on rows set and deleted on either side', async () => {
    const hub = await startTestHub();
    const a = await connectClient('a', syncUrl(hub.port));
    const b = await connectClient('b', syncUrl(hub.port));

    a.store.setRow('activities', 'x', { name: 'Gym' });
    await waitFor(() => b.store.hasRow('activities', 'x'));
    expect(b.store.getRow('activities', 'x')).toEqual({ name: 'Gym' });

    b.store.setCell('activities', 'x', 'name', 'Gym!');
    await waitFor(() => a.store.getCell('activities', 'x', 'name') === 'Gym!');

    a.store.delRow('activities', 'x');
    await waitFor(() => !b.store.hasRow('activities', 'x'));
  });

  test('data survives the hub: a new hub on the same dataDir gives a new client the data', async () => {
    const first = await startTestHub();
    const a = await connectClient('a', syncUrl(first.port));
    a.store.setRow('activities', 'x', { name: 'Gym' });
    await disconnect(a);
    await first.close();

    const saved = await readFile(path.join(dataDir, 'watodo.json'), 'utf8');
    expect(saved).toContain('Gym');

    const second = await startTestHub();
    const c = await connectClient('c', syncUrl(second.port));
    await waitFor(() => c.store.hasRow('activities', 'x'));
    expect(c.store.getRow('activities', 'x')).toEqual({ name: 'Gym' });
  });

  test('rows the hub has received are on disk when it closes with clients still connected', async () => {
    const hub = await startTestHub();
    const a = await connectClient('a', syncUrl(hub.port));
    const b = await connectClient('b', syncUrl(hub.port));
    for (let i = 0; i < 50; i++) {
      a.store.setRow('activities', `row${i}`, { name: `Item ${i}` });
    }
    await waitFor(() => b.store.getRowCount('activities') === 50);

    await hub.close();
    const saved = await readFile(path.join(dataDir, 'watodo.json'), 'utf8');
    expect(saved).toContain('Item 0"');
    expect(saved).toContain('Item 49"');
  });

  test('an edit made while the hub is down reaches another client after reconnecting', async () => {
    const first = await startTestHub();
    const { port } = first;
    const url = syncUrl(port);
    const a = await connectClient('a', url);
    const b = await connectClient('b', url);
    a.store.setRow('activities', 'x', { name: 'Gym' });
    await waitFor(() => b.store.hasRow('activities', 'x'));

    await first.close();
    await waitFor(() => b.ws.readyState === WebSocket.CLOSED);
    b.store.setRow('activities', 'z', { name: 'Offline walk' });

    const second = await startTestHub(port);
    const c = await connectClient('c', url);
    await waitFor(() => c.store.hasRow('activities', 'x'));

    await reconnect(b, url);
    await waitFor(() => c.store.hasRow('activities', 'z'));
    expect(c.store.getRow('activities', 'z')).toEqual({ name: 'Offline walk' });
    expect(second.port).toBe(port);
  });

  test('creates dataDir when it does not exist and writes watodo.json there', async () => {
    const nested = path.join(base, 'nested', 'data');
    const hub = await startHub({ port: 0, dataDir: nested, staticDir });
    hubs.push(hub);
    expect((await stat(nested)).isDirectory()).toBe(true);

    const client = await connectClient('a', syncUrl(hub.port));
    client.store.setRow('activities', 'x', { name: 'Gym' });
    await disconnect(client);
    await hub.close();
    expect(await readFile(path.join(nested, 'watodo.json'), 'utf8')).toContain('Gym');
  });
});

describe('close()', () => {
  test('frees the port, even with a client still connected', async () => {
    const first = await startTestHub();
    const { port } = first;
    await connectClient('a', syncUrl(port));
    await first.close();

    const second = await startHub({ port, dataDir, staticDir });
    hubs.push(second);
    expect(second.port).toBe(port);
    expect(await tryOpen(syncUrl(port))).toBe('open');
  });
});
