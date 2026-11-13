import { expect, test } from 'vitest';
import { DEFAULT_NOTIFY } from './rules';
import { setDailyCap, setNotifyKind, setQuietHours } from './notify';
import { VALUE } from './schema';
import { createWatodoStore, readSnapshot } from './store';

test('nothing stored reads as the defaults', () => {
  const store = createWatodoStore();
  expect(readSnapshot(store).notify).toEqual(DEFAULT_NOTIFY);
});

test('turning a kind on and off round-trips', () => {
  const store = createWatodoStore();
  setNotifyKind(store, 'slot', false);
  setNotifyKind(store, 'recap', false);
  setNotifyKind(store, 'checkIn', false);
  expect(readSnapshot(store).notify?.kinds).toEqual({
    slot: false, committed: true, checkIn: false, rested: true, recap: false,
  });
  setNotifyKind(store, 'slot', true);
  expect(readSnapshot(store).notify?.kinds.slot).toBe(true);
});

test('each kind is stored under its own value', () => {
  const store = createWatodoStore();
  setNotifyKind(store, 'committed', false);
  setNotifyKind(store, 'rested', false);
  expect(store.getValue(VALUE.notifyCommitted)).toBe(false);
  expect(store.getValue(VALUE.notifyRested)).toBe(false);
  expect(store.getValue(VALUE.notifySlot)).toBeUndefined();
});

test('the daily cap round-trips', () => {
  const store = createWatodoStore();
  setDailyCap(store, 5);
  expect(readSnapshot(store).notify?.dailyCap).toBe(5);
});

test('the daily cap is clamped to 1..10 and rounded', () => {
  const store = createWatodoStore();
  setDailyCap(store, 0);
  expect(readSnapshot(store).notify?.dailyCap).toBe(1);
  setDailyCap(store, 11);
  expect(readSnapshot(store).notify?.dailyCap).toBe(10);
  setDailyCap(store, 2.6);
  expect(readSnapshot(store).notify?.dailyCap).toBe(3);
});

test('quiet hours round-trip', () => {
  const store = createWatodoStore();
  setQuietHours(store, 600, 120);
  expect(readSnapshot(store).notify).toMatchObject({ quietStart: 600, quietEnd: 120 });
});

test('quiet hours are rounded and clamped to 0..1439', () => {
  const store = createWatodoStore();
  setQuietHours(store, -5, 2000);
  expect(readSnapshot(store).notify).toMatchObject({ quietStart: 0, quietEnd: 1439 });
  setQuietHours(store, 90.4, 90.6);
  expect(readSnapshot(store).notify).toMatchObject({ quietStart: 90, quietEnd: 91 });
});

test('NaN leaves the previous value in place', () => {
  const store = createWatodoStore();
  setDailyCap(store, 7);
  setDailyCap(store, NaN);
  expect(readSnapshot(store).notify?.dailyCap).toBe(7);

  setQuietHours(store, 300, 400);
  setQuietHours(store, NaN, NaN);
  expect(readSnapshot(store).notify).toMatchObject({ quietStart: 300, quietEnd: 400 });

  setQuietHours(store, NaN, 500);
  expect(readSnapshot(store).notify).toMatchObject({ quietStart: 300, quietEnd: 500 });
});

test('garbage stored values read as the defaults', () => {
  const store = createWatodoStore();
  store.setValue(VALUE.notifyDailyCap, 'many');
  store.setValue(VALUE.notifySlot, 'no');
  store.setValue(VALUE.quietStart, 'late');
  store.setValue(VALUE.quietEnd, NaN);
  expect(readSnapshot(store).notify).toEqual(DEFAULT_NOTIFY);
});
