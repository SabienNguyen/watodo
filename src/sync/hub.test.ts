import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { WebSocket as NodeWebSocket } from 'ws';
import {
  createWatodoStore, finishSetup, readSnapshot, setupState, setUpStarter, type WatodoStore,
} from '@/domain';
import { startHub, type Hub } from '../../hub/server.ts';
import { connectToHub, hubSyncUrl, type HubConnection } from './hub';

// Tests use a short retry so reconnects happen quickly. Each test's options override these.
const TEST_RETRY_MS = 50;

let base: string;
let staticDir: string;
let dataDir: string;
let hubs: Hub[];
let connections: HubConnection[];

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'watodo-sync-'));
  staticDir = path.join(base, 'static');
  dataDir = path.join(base, 'data');
  await mkdir(staticDir, { recursive: true });
  await writeFile(path.join(staticDir, 'index.html'), '<!doctype html><title>watodo</title>');
  hubs = [];
  connections = [];
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const connection of connections) {
    connection.stop();
  }
  await Promise.allSettled(hubs.map((hub) => hub.close()));
  await rm(base, { recursive: true, force: true });
});

async function startTestHub(port = 0): Promise<Hub> {
  const hub = await startHub({ port, dataDir, staticDir });
  hubs.push(hub);
  return hub;
}

function urlFor(port: number): string {
  return hubSyncUrl({ protocol: 'http:', host: `127.0.0.1:${port}` });
}

// A port that nothing listens on: a hub was listening there a moment ago and has closed.
async function closedPort(): Promise<number> {
  const hub = await startTestHub();
  await hub.close();
  return hub.port;
}

function connect(store: WatodoStore, url: string, options: { retryMs?: number; firstSyncTimeoutMs?: number } = {}): HubConnection {
  const connection = connectToHub(store, {
    url,
    retryMs: TEST_RETRY_MS,
    createSocket: (address) => new NodeWebSocket(address) as unknown as WebSocket,
    ...options,
  });
  connections.push(connection);
  return connection;
}

// Polls until check() is true, failing at the deadline. Sync is asynchronous, so tests never sleep for a fixed time.
async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('timed out waiting for sync');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// Polls for the whole window and fails if check() ever becomes true.
async function staysFalse(check: () => boolean, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) {
      throw new Error('sync happened when it should not have');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// A socket that never opens on its own. Tests use it to drive the retry and timer paths without a hub.
function fakeSocket(): WebSocket {
  return Object.assign(new EventTarget(), {
    readyState: 0,
    OPEN: 1,
    CLOSED: 3,
    send() {},
    close() {},
  }) as unknown as WebSocket;
}

describe('hubSyncUrl', () => {
  test('an https page syncs over wss', () => {
    expect(hubSyncUrl({ protocol: 'https:', host: 'computer.tail1234.ts.net' }))
      .toBe('wss://computer.tail1234.ts.net/sync/watodo');
  });

  test('an http page syncs over ws, keeping the port', () => {
    expect(hubSyncUrl({ protocol: 'http:', host: '127.0.0.1:4780' }))
      .toBe('ws://127.0.0.1:4780/sync/watodo');
  });
});

describe('firstSync', () => {
  test('resolves true with a running hub', async () => {
    const hub = await startTestHub();
    const connection = connect(createWatodoStore(), urlFor(hub.port));
    expect(await connection.firstSync).toBe(true);
  });

  test('a second empty store gets the set-up day another client put on the hub', async () => {
    const hub = await startTestHub();
    const url = urlFor(hub.port);

    const first = createWatodoStore();
    setUpStarter(first);
    finishSetup(first);
    const firstConnection = connect(first, url);
    expect(await firstConnection.firstSync).toBe(true);

    // The first store's push can still be on its way to the hub when its firstSync resolves. A third
    // client sees the set-up day only once the hub holds it, so wait for that before the second store joins.
    const probe = createWatodoStore();
    connect(probe, url);
    await waitFor(() => setupState(probe) === 'done');

    const second = createWatodoStore();
    const secondConnection = connect(second, url);
    expect(await secondConnection.firstSync).toBe(true);
    expect(setupState(second)).toBe('done');
    expect(readSnapshot(second).templates).toEqual(readSnapshot(first).templates);
  });

  test('with no hub listening, resolves false after firstSyncTimeoutMs and logs nothing', async () => {
    const logs = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
    ];
    const port = await closedPort();
    const started = Date.now();
    const connection = connect(createWatodoStore(), urlFor(port), { firstSyncTimeoutMs: 150 });

    expect(await connection.firstSync).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(() => connection.stop()).not.toThrow();
    for (const spy of logs) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});

describe('syncing through a connection', () => {
  test('a change on one store reaches the other, and a delete propagates', async () => {
    const hub = await startTestHub();
    const url = urlFor(hub.port);
    const a = createWatodoStore();
    const b = createWatodoStore();
    expect(await connect(a, url).firstSync).toBe(true);
    expect(await connect(b, url).firstSync).toBe(true);

    a.setRow('activities', 'x', { name: 'Gym' });
    await waitFor(() => b.hasRow('activities', 'x'));
    expect(b.getRow('activities', 'x')).toEqual({ name: 'Gym' });

    a.delRow('activities', 'x');
    await waitFor(() => !b.hasRow('activities', 'x'));
  });

  test('after the hub restarts, an edit made while it was down reaches a second client', async () => {
    const first = await startTestHub();
    const { port } = first;
    const url = urlFor(port);
    const a = createWatodoStore();
    const b = createWatodoStore();
    expect(await connect(a, url).firstSync).toBe(true);
    expect(await connect(b, url).firstSync).toBe(true);
    a.setRow('activities', 'x', { name: 'Gym' });
    await waitFor(() => b.hasRow('activities', 'x'));

    await first.close();
    a.setRow('activities', 'z', { name: 'Offline walk' });

    const second = await startTestHub(port);
    expect(second.port).toBe(port);
    await waitFor(() => b.hasRow('activities', 'z'), 10_000);
    expect(b.getRow('activities', 'z')).toEqual({ name: 'Offline walk' });
  });

  test('a hub that starts after connectToHub was called is picked up by the retries', async () => {
    const port = await closedPort();
    const url = urlFor(port);
    const a = createWatodoStore();
    a.setRow('activities', 'x', { name: 'Gym' });
    const connection = connect(a, url, { firstSyncTimeoutMs: 150 });
    expect(await connection.firstSync).toBe(false);

    await startTestHub(port);
    // Only store a holds the row, so b can have it only if a's retries reached the new hub.
    const b = createWatodoStore();
    connect(b, url);
    await waitFor(() => b.hasRow('activities', 'x'), 10_000);
  });
});

describe('stop()', () => {
  test('after stop, a later hub start gives no connection from that store', async () => {
    const hub = await startTestHub();
    const port = hub.port;
    const url = urlFor(port);
    const a = createWatodoStore();
    const connection = connect(a, url);
    expect(await connection.firstSync).toBe(true);

    connection.stop();
    await hub.close();
    await startTestHub(port);

    const b = createWatodoStore();
    expect(await connect(b, url).firstSync).toBe(true);
    b.setRow('activities', 'y', { name: 'Walk' });
    await staysFalse(() => a.hasRow('activities', 'y'), 500);
  });

  test('clears the first-sync timer and any pending retry, and no later attempt opens a socket', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const sockets: WebSocket[] = [];
    const connection = connectToHub(createWatodoStore(), {
      url: 'ws://127.0.0.1:1/sync/watodo',
      retryMs: 50,
      firstSyncTimeoutMs: 150,
      createSocket: () => {
        const socket = fakeSocket();
        sockets.push(socket);
        return socket;
      },
    });
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(150);
    expect(await connection.firstSync).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    // The socket closing schedules a retry.
    sockets[0].dispatchEvent(new Event('close'));
    expect(vi.getTimerCount()).toBe(1);

    connection.stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1);
  });
});
