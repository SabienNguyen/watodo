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

test('a journal row can carry the slot it was logged in, and a day row its chosen slot', () => {
  const { store, activityId, sectionId, itemId } = basicDay();
  store.setRow('journal', 'entry', {
    activityId: activityId('Gym'), sectionId: sectionId('Post work'), itemId: itemId('Post work'),
    loggedAt: at(17, 45).getTime(),
  });
  store.setRow('days', '2026-10-12', {
    templateId: 't', chosenItemId: itemId('Bedtime'), chosenAt: at(20, 0).getTime(),
  });

  const snap = readSnapshot(store);
  expect(snap.journal[0]).toMatchObject({ id: 'entry', itemId: itemId('Post work') });
  expect(snap.days).toEqual([{
    day: '2026-10-12', templateId: 't', chosenItemId: itemId('Bedtime'), chosenAt: at(20, 0).getTime(),
  }]);
});

test('an item row saved with start and end and no position keeps its order as its position', () => {
  const store = createWatodoStore();
  store.setRow('sections', 'post-work', { name: 'Post work', position: 0 });
  store.setRow('sections', 'bedtime', { name: 'Bedtime', position: 1 });
  store.setRow('items', 'legacy-bedtime', {
    templateId: 't', kind: 'slot', name: 'Bedtime', start: 1290, end: 1380, sectionId: 'bedtime',
  });
  store.setRow('items', 'legacy-post-work', {
    templateId: 't', kind: 'slot', name: 'Post work', start: 1050, end: 1140, sectionId: 'post-work',
  });
  store.setRow('items', 'new-wake', { templateId: 't', kind: 'fixed', name: 'Wake', position: 0 });

  const items = readSnapshot(store).items;
  expect(items.map(({ id, position }) => [id, position])).toEqual([
    ['new-wake', 0], ['legacy-post-work', 1050], ['legacy-bedtime', 1290],
  ]);
  expect(items[1]).toEqual({
    id: 'legacy-post-work', templateId: 't', kind: 'slot', name: 'Post work', position: 1050, sectionId: 'post-work',
  });
});

test('a slot row with a stale name cell reads with its section\'s name', () => {
  const store = createWatodoStore();
  store.setRow('sections', 'bedtime', { name: 'Night', position: 0 });
  store.setRow('items', 'bedtime-slot', {
    templateId: 't', kind: 'slot', name: 'Old name', position: 0, sectionId: 'bedtime',
  });
  store.setRow('items', 'bedtime-no-name', { templateId: 't', kind: 'slot', position: 1, sectionId: 'bedtime' });

  expect(readSnapshot(store).items).toEqual([
    { id: 'bedtime-slot', templateId: 't', kind: 'slot', name: 'Night', position: 0, sectionId: 'bedtime' },
    { id: 'bedtime-no-name', templateId: 't', kind: 'slot', name: 'Night', position: 1, sectionId: 'bedtime' },
  ]);
});

test('a slot whose section does not exist, or that has no section, is skipped', () => {
  const store = createWatodoStore();
  store.setRow('sections', 'bedtime', { name: 'Bedtime', position: 0 });
  store.setRow('items', 'ghost-section', { templateId: 't', kind: 'slot', name: 'Gone', position: 0, sectionId: 'nowhere' });
  store.setRow('items', 'no-section', { templateId: 't', kind: 'slot', name: 'Lost', position: 1 });
  store.setRow('items', 'kept', { templateId: 't', kind: 'slot', position: 2, sectionId: 'bedtime' });

  expect(readSnapshot(store).items.map(item => item.id)).toEqual(['kept']);
});

test('a day row with only the retired earlyItemId reads as a day without it', () => {
  const store = createWatodoStore();
  store.setRow('days', '2026-10-12', { earlyItemId: 'some-item' });
  expect(readSnapshot(store).days).toEqual([{ day: '2026-10-12' }]);
});

test('readSnapshot skips a journal row that is missing a required cell', () => {
  const { store, activityId, sectionId } = basicDay();
  store.setRow('journal', 'broken', { activityId: activityId('Gym'), sectionId: sectionId('Post work') });
  store.setRow('journal', 'complete', {
    activityId: activityId('Gym'), sectionId: sectionId('Post work'), loggedAt: at(19, 0).getTime(),
  });

  expect(readSnapshot(store).journal.map(entry => entry.id)).toEqual(['complete']);
});

test('an activity row with no committed cell reads as committed false', () => {
  const { store, activityId } = basicDay();
  expect(readSnapshot(store).activities.find(activity => activity.id === activityId('Gym')))
    .toEqual({ id: activityId('Gym'), name: 'Gym', committed: false });
});

test('an activity row with a committed cell reads as that flag', () => {
  const { store, activityId } = basicDay();
  store.setCell('activities', activityId('Gym'), 'committed', true);
  expect(readSnapshot(store).activities.find(activity => activity.id === activityId('Gym'))?.committed).toBe(true);
});

test('a journal row round-trips its committed cell, and a row without one reads without it', () => {
  const { store, activityId, sectionId, itemId } = basicDay();
  const common = { activityId: activityId('Gym'), sectionId: sectionId('Post work'), itemId: itemId('Post work') };
  store.setRow('journal', 'spent', { ...common, loggedAt: at(17, 45).getTime(), committed: true });
  store.setRow('journal', 'quick', { ...common, loggedAt: at(17, 50).getTime() });
  store.setRow('journal', 'unspent', { ...common, loggedAt: at(17, 55).getTime(), committed: false });

  const journal = readSnapshot(store).journal;
  expect(journal.map(entry => [entry.id, entry.committed])).toEqual([
    ['spent', true], ['quick', undefined], ['unspent', false],
  ]);
  expect(journal[1]).not.toHaveProperty('committed');
});

test('a deleted entry stays deleted after merging both ways', () => {
  const { store: first, activityId, sectionId } = basicDay();
  const other = createWatodoStore();
  other.merge(first);

  const entryId = addPastEntry(first, { activityId: activityId('Gym'), sectionId: sectionId('Post work'), day: '2026-10-11' });
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
