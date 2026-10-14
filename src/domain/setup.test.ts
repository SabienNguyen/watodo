import { expect, test } from 'vitest';
import { createWatodoStore, readSnapshot } from './store';
import { deleteTemplateRows, TABLE } from './schema';
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
  expect(snap.items).toHaveLength(10);
  expect(snap.sections).toHaveLength(3);
  expect(snap.activities).toHaveLength(7);
  expect(snap.listings).toHaveLength(9);

  finishSetup(store);
  expect(setupState(store)).toBe('done');
});

test('the starter items are in the agreed order, with positions and no times', () => {
  const store = createWatodoStore();
  setUpStarter(store);
  const items = readSnapshot(store).items;
  expect(items.map(({ kind, name, position }) => [kind, name, position])).toEqual([
    ['fixed', 'Wake up', 0],
    ['fixed', 'Brush teeth', 1],
    ['fixed', 'Change clothes', 2],
    ['fixed', 'Work', 3],
    ['slot', 'Post work', 4],
    ['fixed', 'Dinner', 5],
    ['slot', 'Post dinner', 6],
    ['slot', 'Bedtime', 7],
    ['fixed', 'Brush teeth', 8],
    ['fixed', 'Sleep', 9],
  ]);
  for (const itemId of store.getRowIds(TABLE.items)) {
    expect(store.getRow(TABLE.items, itemId)).not.toHaveProperty('start');
    expect(store.getRow(TABLE.items, itemId)).not.toHaveProperty('end');
  }
});

test('setting up again does not add a second basic day', () => {
  const store = createWatodoStore();
  setUpStarter(store);
  setUpStarter(store);
  expect(readSnapshot(store).templates).toHaveLength(1);
});

test('a store whose templates are all deleted is new again, and setting up adds a basic day', () => {
  const store = createWatodoStore();
  setUpStarter(store);
  deleteTemplateRows(store, readSnapshot(store).templates[0].id);
  expect(setupState(store)).toBe('new');

  setUpStarter(store);
  expect(setupState(store)).toBe('customising');
  const snap = readSnapshot(store);
  expect(snap.templates.map(template => template.name)).toEqual(['Basic day']);
  expect(snap.removed.templates.map(template => template.name)).toEqual(['Basic day']);
});
