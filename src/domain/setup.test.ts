import { expect, test } from 'vitest';
import { createWatodoStore, readSnapshot } from './store';
import { finishSetup, setupState, setUpStarter } from './setup';

test('a new store is new', () => {
  expect(setupState(createWatodoStore())).toBe('new');
});

test('the starter menu is customising until finished', () => {
  const store = createWatodoStore();
  setUpStarter(store);
  expect(setupState(store)).toBe('customising');

  const snap = readSnapshot(store);
  expect(snap.labels).toHaveLength(1);
  expect(snap.labels[0]).toMatchObject({ name: 'Work day', weekdays: [0, 1, 2, 3, 4] });
  expect(snap.templates).toHaveLength(1);
  expect(snap.defaultTemplateId).toBe(snap.templates[0].id);
  expect(snap.items).toHaveLength(6);
  expect(snap.sections).toHaveLength(3);
  expect(snap.activities).toHaveLength(7);
  expect(snap.listings).toHaveLength(9);

  finishSetup(store);
  expect(setupState(store)).toBe('done');
});

test('the starter items have the agreed names and times', () => {
  const store = createWatodoStore();
  setUpStarter(store);
  const items = readSnapshot(store).items
    .sort((a, b) => a.start - b.start)
    .map(({ kind, name, start, end }) => [kind, name, start, end]);
  expect(items).toEqual([
    ['fixed', 'Wake up, brush teeth, get ready', 390, 510],
    ['fixed', 'Work', 540, 1050],
    ['slot', 'Post work', 1050, 1140],
    ['fixed', 'Dinner', 1140, 1170],
    ['slot', 'Post dinner', 1170, 1290],
    ['slot', 'Bedtime', 1290, 1380],
  ]);
});

test('setting up again does not add a second basic day', () => {
  const store = createWatodoStore();
  setUpStarter(store);
  setUpStarter(store);
  expect(readSnapshot(store).templates).toHaveLength(1);
});
