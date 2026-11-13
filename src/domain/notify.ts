import type { NotifyKind } from './rules';
import { NOTIFY_KIND_VALUE, roundedClamp, VALUE } from './schema';
import type { WatodoStore } from './store';

export function setNotifyKind(store: WatodoStore, kind: NotifyKind, on: boolean): void {
  store.setValue(NOTIFY_KIND_VALUE[kind], on);
}

/** Rounded and clamped to 1..10. NaN leaves the stored value unchanged. */
export function setDailyCap(store: WatodoStore, cap: number): void {
  if (Number.isNaN(cap)) return;
  store.setValue(VALUE.notifyDailyCap, roundedClamp(cap, 1, 10));
}

/** Minutes after local midnight, each rounded and clamped to 0..1439. NaN leaves that value unchanged. */
export function setQuietHours(store: WatodoStore, start: number, end: number): void {
  if (!Number.isNaN(start)) store.setValue(VALUE.quietStart, roundedClamp(start, 0, 1439));
  if (!Number.isNaN(end)) store.setValue(VALUE.quietEnd, roundedClamp(end, 0, 1439));
}
