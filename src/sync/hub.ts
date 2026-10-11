import { createWsSynchronizer, type WsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client';
import type { WatodoStore } from '@/domain';

export interface HubConnection {
  /** True once the first sync with the hub has completed; false if it did not within firstSyncTimeoutMs. */
  firstSync: Promise<boolean>;
  /** Stops syncing and stops reconnecting. */
  stop(): void;
}

const SYNC_PATH = '/sync/watodo';
const MAX_RETRY_MS = 15_000;

export function hubSyncUrl(location: { protocol: string; host: string }): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}${SYNC_PATH}`;
}

/** One socket and the synchronizer on it. */
interface Attempt {
  socket: WebSocket;
  synchronizer?: WsSynchronizer<WebSocket>;
  synced: boolean;
}

/**
 * Keeps the store in step with the hub, reconnecting by itself. Never throws or rejects: with no hub
 * it retries quietly, doubling the delay up to 15 seconds, and retries at once when the browser comes
 * online or the page becomes visible.
 */
export function connectToHub(store: WatodoStore, options: {
  url: string;
  firstSyncTimeoutMs?: number;
  retryMs?: number;
  createSocket?: (url: string) => WebSocket;
}): HubConnection {
  const {
    url,
    firstSyncTimeoutMs = 2500,
    retryMs = 2000,
    createSocket = (address: string) => new WebSocket(address),
  } = options;
  const retryCeilingMs = Math.max(retryMs, MAX_RETRY_MS);

  let resolveFirstSync!: (synced: boolean) => void;
  const firstSync = new Promise<boolean>((resolve) => {
    resolveFirstSync = resolve;
  });
  let firstSyncPending = true;
  const settleFirstSync = (synced: boolean) => {
    if (!firstSyncPending) return;
    firstSyncPending = false;
    clearTimeout(firstSyncTimer);
    resolveFirstSync(synced);
  };
  const firstSyncTimer = setTimeout(() => settleFirstSync(false), firstSyncTimeoutMs);

  let stopped = false;
  let current: Attempt | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryDelayMs = retryMs;

  // Closes the attempt's synchronizer and socket. Does nothing if the attempt is no longer current.
  const teardown = (attempt: Attempt): void => {
    if (current !== attempt) return;
    current = undefined;
    attempt.synchronizer?.destroy().catch(() => {});
    attempt.socket.close();
  };

  const cancelRetry = () => {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  };

  const scheduleRetry = () => {
    if (stopped) return;
    cancelRetry();
    retryTimer = setTimeout(attempt, retryDelayMs);
    retryDelayMs = Math.min(retryDelayMs * 2, retryCeilingMs);
  };

  function attempt(): void {
    retryTimer = undefined;
    if (stopped) return;

    let socket: WebSocket;
    try {
      socket = createSocket(url);
    } catch {
      scheduleRetry();
      return;
    }

    const next: Attempt = { socket, synced: false };
    current = next;
    // A socket that fails before it opens also makes createWsSynchronizer reject, so both paths land here.
    // The first one tears the attempt down; the second finds it no longer current and does nothing.
    const down = () => {
      if (current !== next) return;
      teardown(next);
      scheduleRetry();
    };
    socket.addEventListener('close', down);
    socket.addEventListener('error', down);

    createWsSynchronizer(store, socket)
      .then(async (synchronizer) => {
        if (current !== next) {
          await synchronizer.destroy();
          return;
        }
        next.synchronizer = synchronizer;
        await synchronizer.startSync();
        // startSync can resolve a few milliseconds before this store's own content has reached the hub. A
        // load is a round trip on the same socket, so its reply comes after that content has been handled.
        await synchronizer.load();
        if (current !== next) return;
        next.synced = true;
        retryDelayMs = retryMs;
        settleFirstSync(true);
      })
      .catch(down);
  }

  // Retry now, unless a sync is already running. A connection attempt still in progress is replaced.
  const retryNow = () => {
    if (stopped || current?.synced) return;
    cancelRetry();
    if (current) teardown(current);
    attempt();
  };

  const onOnline = () => retryNow();
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') retryNow();
  };
  // The globals are missing under node, where there is no browser to reconnect for.
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    cancelRetry();
    settleFirstSync(false);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
    if (current) teardown(current);
  };

  attempt();
  return { firstSync, stop };
}
