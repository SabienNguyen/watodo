/** A skew beyond this is shown as a warning. Syncing relies on the clocks roughly agreeing. */
export const CLOCK_WARNING_MS = 120_000;

/**
 * The device's clock minus the hub's, from GET /hub/time. The device time is taken as the midpoint of
 * the request, so the round trip counts for half each way. Null when the hub cannot be asked.
 */
export async function clockSkewMs(fetchImpl: typeof fetch = fetch): Promise<number | null> {
  try {
    const start = Date.now();
    const response = await fetchImpl('/hub/time', { cache: 'no-store' });
    const end = Date.now();
    if (response.status !== 200) return null;
    const body = (await response.json()) as { now?: unknown };
    if (typeof body.now !== 'number' || !Number.isFinite(body.now)) return null;
    const deviceTime = (start + end) / 2;
    return deviceTime - body.now;
  } catch {
    return null;
  }
}
