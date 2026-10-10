import { expect, test } from 'vitest';
import {
  addActivityToSection, addSection, deleteSection, removeActivityFromSection, renameActivity, renameSection,
} from './menu';
import { addPastEntry } from './logging';
import { readSnapshot } from './store';
import { basicDay } from './testing';

test('adding an existing activity name in another section reuses the activity', () => {
  const { store, activityId, sectionId } = basicDay();
  const id = addActivityToSection(store, sectionId('Post work'), 'stretch');

  expect(id).toBe(activityId('Stretch'));
  const snap = readSnapshot(store);
  expect(snap.activities).toHaveLength(7);
  expect(snap.listings).toContainEqual(expect.objectContaining({ sectionId: sectionId('Post work'), activityId: id }));
});

test('adding a new activity creates it and lists it in the section', () => {
  const { store, sectionId } = basicDay();
  const id = addActivityToSection(store, sectionId('Bedtime'), 'Meditate');

  const snap = readSnapshot(store);
  expect(snap.activities).toContainEqual({ id, name: 'Meditate' });
  expect(snap.listings.filter(listing => listing.sectionId === sectionId('Bedtime'))).toHaveLength(4);
});

test('listing an activity already in the section adds no second listing', () => {
  const { store, sectionId } = basicDay();
  addActivityToSection(store, sectionId('Bedtime'), 'Stretch');
  expect(readSnapshot(store).listings).toHaveLength(9);
});

test('removing an activity from a section keeps its journal entries', () => {
  const { store, activityId, sectionId } = basicDay();
  addPastEntry(store, { activityId: activityId('Gym'), sectionId: sectionId('Post work'), day: '2026-10-11' });

  removeActivityFromSection(store, sectionId('Post work'), activityId('Gym'));

  const snap = readSnapshot(store);
  expect(snap.listings.some(listing => listing.activityId === activityId('Gym') && listing.sectionId === sectionId('Post work'))).toBe(false);
  expect(snap.journal).toHaveLength(1);
  expect(snap.activities.some(activity => activity.id === activityId('Gym'))).toBe(true);
});

test('deleting a section removes its listings only', () => {
  const { store, sectionId } = basicDay();
  deleteSection(store, sectionId('Bedtime'));

  const snap = readSnapshot(store);
  expect(snap.sections.map(section => section.name)).toEqual(['Post work', 'Post dinner']);
  expect(snap.listings).toHaveLength(6);
  expect(snap.activities).toHaveLength(7);
});

test('sections and activities can be renamed', () => {
  const { store, activityId, sectionId } = basicDay();
  renameSection(store, sectionId('Bedtime'), 'Night');
  renameActivity(store, activityId('Journal'), 'Diary');

  const snap = readSnapshot(store);
  expect(snap.sections.find(section => section.id === sectionId('Bedtime'))?.name).toBe('Night');
  expect(snap.activities.find(activity => activity.id === activityId('Journal'))?.name).toBe('Diary');
});

test('addSection puts the new section last', () => {
  const { store } = basicDay();
  const id = addSection(store, 'Weekend');
  const snap = readSnapshot(store);
  expect(snap.sections.at(-1)).toEqual({ id, name: 'Weekend', position: 3 });
});
