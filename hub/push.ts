import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateVAPIDKeys, sendNotification } from 'web-push';

// The hub's side of notifications. Types are declared here, not imported from src/, because the hub
// runs as plain TypeScript under Node and must not reach into the app's source.

export const DATA_FILE = 'watodo.json';
export const DEFAULT_PUSH_SUBJECT = 'https://github.com/SabienNguyen/watodo';

const VAPID_FILE = 'vapid.json';
const SUBSCRIPTIONS_FILE = 'subscriptions.json';
const SENT_FILE = 'sent.json';
const SENT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const PUSH_TTL_SECONDS = 60 * 60;
const SEND_TIMEOUT_MS = 15_000;
const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_PLAN_PATH = fileURLToPath(new URL('../dist-hub/notify-entry.js', import.meta.url));

export interface VapidKeys { publicKey: string; privateKey: string }
export interface Subscription { endpoint: string; keys: { p256dh: string; auth: string } }
export interface PushPayload { title: string; body: string; url: string; tag?: string }
export interface SentRecord { kind: string; key: string; at: number }
export interface DueRecord { kind: string; key: string; title: string; body: string; url: string }
export type PlanFn = (json: string, at: Date, sent: SentRecord[]) => DueRecord | null;
export type SendFn = (subscription: Subscription, payload: PushPayload) => Promise<{ statusCode: number }>;

export interface NotifierOptions {
  intervalMs?: number;
  now?: () => Date;
  send?: SendFn;
  planPath?: string;
  plan?: PlanFn;
  disabled?: boolean;
}

export interface Push {
  publicKey(): Promise<string>;
  subscribe(subscription: Subscription): Promise<void>;
  unsubscribe(endpoint: string): Promise<void>;
  test(): Promise<void>;
  close(): Promise<void>;
}

/** Checks a subscription body from the browser. Returns undefined when it is not one. */
export function parseSubscription(value: unknown): Subscription | undefined {
  if (!isRecord(value)) return undefined;
  const endpoint = parseEndpoint(value.endpoint);
  if (endpoint === undefined || !isRecord(value.keys)) return undefined;
  const { p256dh, auth } = value.keys;
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return undefined;
  return { endpoint, keys: { p256dh, auth } };
}

/** A push service endpoint: an https URL. Returns undefined for anything else. */
export function parseEndpoint(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('https://')) return undefined;
  try {
    new URL(value);
    return value;
  } catch {
    return undefined;
  }
}

export function createPush(dataDir: string, subject: string, options: NotifierOptions = {}): Push {
  const now = options.now ?? (() => new Date());
  const planPath = options.planPath ?? DEFAULT_PLAN_PATH;
  const subscriptionsFile = path.join(dataDir, SUBSCRIPTIONS_FILE);
  const sentFile = path.join(dataDir, SENT_FILE);

  let vapid: Promise<VapidKeys> | undefined;
  const keys = (): Promise<VapidKeys> => {
    // A failed load is not kept, so the next call tries again.
    vapid ??= loadVapid(path.join(dataDir, VAPID_FILE)).catch((error: unknown) => {
      vapid = undefined;
      throw error;
    });
    return vapid;
  };

  const send: SendFn = options.send ?? (async (subscription, payload) => {
    const { publicKey, privateKey } = await keys();
    const result = await sendNotification(subscription, JSON.stringify(payload), {
      TTL: PUSH_TTL_SECONDS,
      timeout: SEND_TIMEOUT_MS,
      vapidDetails: { subject, publicKey, privateKey },
    });
    return { statusCode: result.statusCode };
  });

  // Every write to the subscription and sent files goes through one queue, so a tick that removes
  // a dead subscription cannot overwrite one a device added in the meantime.
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  };

  const subscribe = (subscription: Subscription): Promise<void> => exclusive(async () => {
    const others = (await readSubscriptions(subscriptionsFile)).filter(s => s.endpoint !== subscription.endpoint);
    await writeJsonAtomic(subscriptionsFile, [...others, subscription]);
  });

  const removeSubscriptions = (endpoints: string[]): Promise<void> => exclusive(async () => {
    const kept = (await readSubscriptions(subscriptionsFile)).filter(s => !endpoints.includes(s.endpoint));
    await writeJsonAtomic(subscriptionsFile, kept);
  });

  const recordSent = (record: SentRecord): Promise<void> => exclusive(async () => {
    const cutoff = record.at - SENT_RETENTION_MS;
    const kept = (await readSent(sentFile)).filter(r => r.at >= cutoff);
    await writeJsonAtomic(sentFile, [...kept, record]);
  });

  async function deliver(subscriptions: Subscription[], payload: PushPayload): Promise<void> {
    const gone: string[] = [];
    for (const subscription of subscriptions) {
      try {
        const result = await send(subscription, payload);
        if (isGone(result.statusCode)) gone.push(subscription.endpoint);
      } catch (error) {
        const status = statusOf(error);
        if (status !== undefined && isGone(status)) {
          gone.push(subscription.endpoint);
        } else {
          // Not the endpoint: it is a credential-bearing URL, and the log is kept.
          console.error('watodo push: a notification failed to send', { status, message: messageOf(error) });
        }
      }
    }
    if (gone.length > 0) {
      await removeSubscriptions(gone);
    }
  }

  let plan: PlanFn | undefined = options.plan;
  let missingLogged = false;
  async function loadPlan(): Promise<PlanFn | undefined> {
    if (plan) return plan;
    try {
      const mod = await import(pathToFileURL(planPath).href) as { planFromContent?: unknown };
      if (typeof mod.planFromContent !== 'function') {
        throw new Error(`${planPath} does not export planFromContent`);
      }
      plan = mod.planFromContent as PlanFn;
      return plan;
    } catch (error) {
      if (!missingLogged) {
        missingLogged = true;
        console.error(`watodo push: notifications are paused, ${planPath} cannot be loaded (run npm run build)`, error);
      }
      return undefined;
    }
  }

  async function tick(): Promise<void> {
    const subscriptions = await readSubscriptions(subscriptionsFile);
    if (subscriptions.length === 0) return;

    let json: string;
    try {
      json = await readFile(path.join(dataDir, DATA_FILE), 'utf8');
    } catch (error) {
      if (isNotFound(error)) return;
      throw error;
    }

    const planner = await loadPlan();
    if (!planner) return;

    const at = now();
    const due = planner(json, at, await readSent(sentFile));
    if (!due) return;

    await deliver(subscriptions, { title: due.title, body: due.body, url: due.url, tag: due.key });
    await recordSent({ kind: due.kind, key: due.key, at: at.getTime() });
  }

  let timer: ReturnType<typeof setInterval> | undefined;
  let running: Promise<void> | undefined;
  const runTick = (): void => {
    if (running) return;
    running = tick()
      .catch((error: unknown) => {
        console.error('watodo push: notifier tick failed', error);
      })
      .finally(() => {
        running = undefined;
      });
  };

  if (!options.disabled) {
    timer = setInterval(runTick, options.intervalMs ?? DEFAULT_INTERVAL_MS);
  }

  return {
    async publicKey() {
      return (await keys()).publicKey;
    },
    subscribe,
    unsubscribe(endpoint) {
      return removeSubscriptions([endpoint]);
    },
    async test() {
      await deliver(await readSubscriptions(subscriptionsFile), {
        title: 'watodo',
        body: 'Notifications are on',
        url: '/',
      });
    },
    async close() {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      await running;
    },
  };
}

async function loadVapid(file: string): Promise<VapidKeys> {
  const existing = await readJsonFile(file);
  if (existing !== undefined) {
    if (isRecord(existing) && typeof existing.publicKey === 'string' && typeof existing.privateKey === 'string') {
      return { publicKey: existing.publicKey, privateKey: existing.privateKey };
    }
    throw new Error(`${file} does not hold VAPID keys`);
  }
  const keys = generateVAPIDKeys();
  await writeJsonAtomic(file, keys, 0o600);
  return keys;
}

async function readSubscriptions(file: string): Promise<Subscription[]> {
  const value = await readJsonFile(file);
  if (!Array.isArray(value)) return [];
  return value.map(parseSubscription).filter((s): s is Subscription => s !== undefined);
}

async function readSent(file: string): Promise<SentRecord[]> {
  const value = await readJsonFile(file);
  if (!Array.isArray(value)) return [];
  return value.filter((r): r is SentRecord =>
    isRecord(r) && typeof r.kind === 'string' && typeof r.key === 'string' && typeof r.at === 'number');
}

async function readJsonFile(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

// Written beside the target and renamed over it, so a reader sees the old file or the new one.
async function writeJsonAtomic(file: string, value: unknown, mode?: number): Promise<void> {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode });
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

function isGone(status: number): boolean {
  return status === 404 || status === 410;
}

function statusOf(error: unknown): number | undefined {
  if (isRecord(error) && typeof error.statusCode === 'number') return error.statusCode;
  return undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNotFound(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
