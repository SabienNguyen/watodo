import { expect, test } from 'vitest';
import { addBond, deleteBond, renameBond, setBondCatchUp, setEntryBond } from './bonds';
import { addPastEntry, deleteEntry } from './logging';
import { bondSummaries, entryBonds } from './rules';
import { readSnapshot } from './store';
import { basicDay } from './testing';

/** A store with the starter menu and one past entry of Gym in Post work. */
function withEntry() {
  const fixture = basicDay();
  const { store, activityId, sectionId } = fixture;
  const entryId = addPastEntry(store, { activityId: activityId('Gym'), sectionId: sectionId('Post work'), day: '2026-10-12' });
  return { store, entryId };
}

test('addBond creates a new bond with the next position', () => {
  const { store } = basicDay();
  const alex = addBond(store, 'Alex');
  const sam = addBond(store, 'Sam');
  expect(alex.created).toBe(true);
  expect(sam.created).toBe(true);
  expect(readSnapshot(store).bonds).toEqual([
    { id: alex.id, name: 'Alex', position: 0 },
    { id: sam.id, name: 'Sam', position: 1 },
  ]);
});

test('addBond reuses a live bond with the same name key', () => {
  const { store } = basicDay();
  const first = addBond(store, 'Alex');
  expect(addBond(store, 'alex')).toEqual({ id: first.id, created: false });
  expect(addBond(store, 'Alex.')).toEqual({ id: first.id, created: false });
  expect(readSnapshot(store).bonds).toHaveLength(1);
});

test('addBond brings back a deleted bond with the same id and clears its catch-up', () => {
  const { store } = basicDay();
  const first = addBond(store, 'Alex');
  setBondCatchUp(store, first.id, 21);
  deleteBond(store, first.id);

  const back = addBond(store, 'Alex');
  expect(back).toEqual({ id: first.id, created: true });
  const bond = readSnapshot(store).bonds.find(row => row.id === first.id);
  expect(bond?.name).toBe('Alex');
  expect(bond?.catchUpDays).toBeUndefined();
});

test('addBond with a blank name creates nothing', () => {
  const { store } = basicDay();
  expect(addBond(store, '   ')).toEqual({ id: '', created: false });
  expect(readSnapshot(store).bonds).toEqual([]);
});

test('one entry can have three bonds, and each bond counts it once', () => {
  const { store, entryId } = withEntry();
  const alex = addBond(store, 'Alex').id;
  const sam = addBond(store, 'Sam').id;
  const priya = addBond(store, 'Priya').id;
  setEntryBond(store, entryId, alex, true);
  setEntryBond(store, entryId, sam, true);
  setEntryBond(store, entryId, priya, true);

  const snap = readSnapshot(store);
  expect(snap.company).toHaveLength(3);
  expect(entryBonds(snap, entryId).map(bond => bond.name)).toEqual(['Alex', 'Sam', 'Priya']);
  expect(bondSummaries(snap).map(summary => summary.count)).toEqual([1, 1, 1]);
});

test('taking one bond off an entry leaves the other two', () => {
  const { store, entryId } = withEntry();
  const alex = addBond(store, 'Alex').id;
  const sam = addBond(store, 'Sam').id;
  const priya = addBond(store, 'Priya').id;
  setEntryBond(store, entryId, alex, true);
  setEntryBond(store, entryId, sam, true);
  setEntryBond(store, entryId, priya, true);

  setEntryBond(store, entryId, sam, false);

  const snap = readSnapshot(store);
  expect(snap.company).toHaveLength(2);
  expect(entryBonds(snap, entryId).map(bond => bond.name)).toEqual(['Alex', 'Priya']);
});

test('the same pair twice is one company row', () => {
  const { store, entryId } = withEntry();
  const alex = addBond(store, 'Alex').id;
  setEntryBond(store, entryId, alex, true);
  setEntryBond(store, entryId, alex, true);
  expect(readSnapshot(store).company).toEqual([{ entryId, bondId: alex }]);
});

test('an unknown entry or a deleted bond gets no company row', () => {
  const { store, entryId } = withEntry();
  const alex = addBond(store, 'Alex').id;

  setEntryBond(store, 'no-such-entry', alex, true);
  expect(readSnapshot(store).company).toEqual([]);

  deleteBond(store, alex);
  setEntryBond(store, entryId, alex, true);
  expect(readSnapshot(store).company).toEqual([]);
});

test('a deleted bond can still be taken off an entry', () => {
  const { store, entryId } = withEntry();
  const alex = addBond(store, 'Alex').id;
  setEntryBond(store, entryId, alex, true);
  deleteBond(store, alex);
  setEntryBond(store, entryId, alex, false);
  expect(readSnapshot(store).company).toEqual([]);
});

test('readSnapshot skips company rows without both string cells', () => {
  const { store, entryId } = withEntry();
  const alex = addBond(store, 'Alex').id;
  store.setRow('company', 'broken', { entryId });
  setEntryBond(store, entryId, alex, true);
  expect(readSnapshot(store).company).toEqual([{ entryId, bondId: alex }]);
});

test('renameBond refuses a live name clash and allows the key of a deleted bond', () => {
  const { store } = basicDay();
  const alex = addBond(store, 'Alex').id;
  const sam = addBond(store, 'Sam').id;

  expect(renameBond(store, sam, 'alex.')).toBe(false);
  expect(readSnapshot(store).bonds.find(bond => bond.id === sam)?.name).toBe('Sam');

  expect(renameBond(store, sam, '   ')).toBe(false);

  deleteBond(store, alex);
  expect(renameBond(store, sam, 'Alex')).toBe(true);
  expect(readSnapshot(store).bonds.find(bond => bond.id === sam)?.name).toBe('Alex');
});

test('renameBond refuses a deleted or unknown bond', () => {
  const { store } = basicDay();
  const alex = addBond(store, 'Alex').id;
  deleteBond(store, alex);
  expect(renameBond(store, alex, 'Alexa')).toBe(false);
  expect(renameBond(store, 'no-such-bond', 'Alexa')).toBe(false);
});

test('deleteBond keeps its company rows and its name in removed.bonds', () => {
  const { store, entryId } = withEntry();
  const alex = addBond(store, 'Alex').id;
  setEntryBond(store, entryId, alex, true);

  deleteBond(store, alex);

  const snap = readSnapshot(store);
  expect(snap.bonds).toEqual([]);
  expect(snap.removed.bonds.map(bond => bond.name)).toEqual(['Alex']);
  expect(snap.company).toEqual([{ entryId, bondId: alex }]);
  expect(entryBonds(snap, entryId).map(bond => bond.name)).toEqual(['Alex']);
});

test('setBondCatchUp stores whole days of at least 1, and removes anything else', () => {
  const { store } = basicDay();
  const alex = addBond(store, 'Alex').id;
  const catchUp = () => readSnapshot(store).bonds.find(bond => bond.id === alex)?.catchUpDays;

  setBondCatchUp(store, alex, 21);
  expect(catchUp()).toBe(21);
  setBondCatchUp(store, alex, 2.5);
  expect(catchUp()).toBe(2);
  setBondCatchUp(store, alex, 0);
  expect(catchUp()).toBeUndefined();
  setBondCatchUp(store, alex, 5);
  setBondCatchUp(store, alex, Number.NaN);
  expect(catchUp()).toBeUndefined();
});

test('setBondCatchUp does nothing for a deleted bond', () => {
  const { store } = basicDay();
  const alex = addBond(store, 'Alex').id;
  deleteBond(store, alex);
  setBondCatchUp(store, alex, 7);
  expect(readSnapshot(store).removed.bonds[0].catchUpDays).toBeUndefined();
});

test('deleteEntry removes its company rows and leaves the bonds', () => {
  const { store, entryId } = withEntry();
  const alex = addBond(store, 'Alex').id;
  const sam = addBond(store, 'Sam').id;
  setEntryBond(store, entryId, alex, true);
  setEntryBond(store, entryId, sam, true);

  deleteEntry(store, entryId);

  const snap = readSnapshot(store);
  expect(snap.company).toEqual([]);
  expect(snap.journal).toEqual([]);
  expect(snap.bonds.map(bond => bond.id)).toEqual([alex, sam]);
});
