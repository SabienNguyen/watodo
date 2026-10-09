import { expect, test, vi } from 'vitest';
import { addPastEntry, deleteEntry } from './logging';
import { addActivityToSection, renameActivity } from './menu';
import { readSnapshot, createSnapshotSource, createWatodoStore } from './store';
import { addLabel } from './templates';
import { at, basicDay } from './testing';

test('the snapshot source returns the same object until the store changes', () => {
  const store = createWatodoStore();
  const source = createSnapshotSource(store);
  const first = source.get();
  expect(source.get()).toBe(first);

  addLabel(store, 'Weekend');
  const second = source.get();
  expect(second).not.toBe(first);
  expect(second.labels).toHaveLength(1);
  expect(source.get()).toBe(second);
});

test('subscribers are called after each change, and unsubscribing stops the calls', () => {
  const store = createWatodoStore();
  const source = createSnapshotSource(store);
  const listener = vi.fn();
  const unsubscribe = source.subscribe(listener);

  addLabel(store, 'Weekend');
  expect(listener).toHaveBeenCalledTimes(1);
  expect(source.get().labels.map(label => label.name)).toEqual(['Weekend']);

  unsubscribe();
  addLabel(store, 'Holiday');
  expect(listener).toHaveBeenCalledTimes(1);
  expect(source.get().labels).toHaveLength(2);
});

test('the snapshot source sees changes that arrive by merge', () => {
  const local = createWatodoStore();
  const source = createSnapshotSource(local);
  const before = source.get();

  const remote = createWatodoStore();
  addLabel(remote, 'Weekend');
  local.merge(remote);

  expect(source.get()).not.toBe(before);
  expect(source.get().labels.map(label => label.name)).toEqual(['Weekend']);
});

test('readSnapshot skips a journal row that is missing a required cell', () => {
  const { store, activityId, sectionId } = basicDay();
  store.setRow('journal', 'broken', { activityId: activityId('Gym'), sectionId: sectionId('Post work') });
  store.setRow('journal', 'complete', {
    activityId: activityId('Gym'), sectionId: sectionId('Post work'), loggedAt: at(19, 0).getTime(),
  });

  expect(readSnapshot(store).journal.map(entry => entry.id)).toEqual(['complete']);
});

test('a deleted entry stays deleted after merging both ways', () => {
  const { store: first, activityId, sectionId } = basicDay();
  const other = createWatodoStore();
  other.merge(first);

  const entryId = addPastEntry(first, { activityId: activityId('Gym'), sectionId: sectionId('Post work'), at: at(19, 0, -1) });
  other.merge(first);
  deleteEntry(first, entryId);

  other.merge(first);
  first.merge(other);
  expect(readSnapshot(first).journal).toEqual([]);
  expect(readSnapshot(other).journal).toEqual([]);
});

test('a rename on one side and a new listing on the other both survive a merge both ways', () => {
  const { store: first, activityId, sectionId } = basicDay();
  const other = createWatodoStore();
  other.merge(first);

  const gymId = activityId('Gym');
  renameActivity(first, gymId, 'Gym session');
  addActivityToSection(other, sectionId('Bedtime'), 'Gym');

  first.merge(other);
  other.merge(first);
  for (const store of [first, other]) {
    const snap = readSnapshot(store);
    expect(snap.activities.find(activity => activity.id === gymId)?.name).toBe('Gym session');
    expect(snap.listings).toContainEqual(expect.objectContaining({ sectionId: sectionId('Bedtime'), activityId: gymId }));
  }
});
