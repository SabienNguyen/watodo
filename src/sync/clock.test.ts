import { describe, expect, test, vi } from 'vitest';
import { CLOCK_WARNING_MS, clockSkewMs } from './clock';

const TOLERANCE_MS = 1000;

function hubReply(now: number): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify({ now }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })) as unknown as typeof fetch;
}

describe('clockSkewMs', () => {
  test('is the device clock minus the hub clock', async () => {
    const skew = await clockSkewMs(hubReply(Date.now() - 300_000));
    expect(skew).not.toBeNull();
    expect(Math.abs((skew as number) - 300_000)).toBeLessThan(TOLERANCE_MS);
  });

  test('is negative when the device is behind', async () => {
    const skew = await clockSkewMs(hubReply(Date.now() + 180_000));
    expect(Math.abs((skew as number) + 180_000)).toBeLessThan(TOLERANCE_MS);
  });

  test('asks for the relative /hub/time path, never cached', async () => {
    const fetchImpl = hubReply(Date.now());
    await clockSkewMs(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith('/hub/time', { cache: 'no-store' });
  });

  test('a non-200 reply gives null', async () => {
    const fetchImpl = vi.fn(async () => new Response('gone', { status: 404 })) as unknown as typeof fetch;
    expect(await clockSkewMs(fetchImpl)).toBeNull();
  });

  test('a thrown error gives null', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    expect(await clockSkewMs(fetchImpl)).toBeNull();
  });

  test('a reply that is not JSON gives null', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>not the hub</html>', { status: 200 })) as unknown as typeof fetch;
    expect(await clockSkewMs(fetchImpl)).toBeNull();
  });
});

describe('CLOCK_WARNING_MS', () => {
  test('is two minutes', () => {
    expect(CLOCK_WARNING_MS).toBe(120_000);
  });
});
