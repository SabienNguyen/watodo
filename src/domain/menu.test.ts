import { expect, test } from 'vitest';
import {
  addActivity, addActivityToSection, addSection, deleteActivity, deleteSection, removeActivityFromSection,
  renameActivity, renameSection, setActivityCommitted, setActivityInSection,
} from './menu';
import { addPastEntry } from './logging';
import { nowView, sectionActivities } from './rules';
import { readSnapshot } from './store';
import { saveTemplate } from './templates';
import { at, basicDay } from './testing';

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
  expect(snap.activities).toContainEqual({ id, name: 'Meditate', committed: false });
  expect(snap.listings.filter(listing => listing.sectionId === sectionId('Bedtime'))).toHaveLength(4);
});

test('listing an activity already in the section adds no second listing', () => {
  const { store, sectionId } = basicDay();
  addActivityToSection(store, sectionId('Bedtime'), 'Stretch');
  expect(readSnapshot(store).listings).toHaveLength(9);
});

test('adding a new name with committed true creates a committed activity listed in that section', () => {
  const { store, sectionId } = basicDay();
  const id = addActivityToSection(store, sectionId('Bedtime'), 'Meditate', { committed: true });

  const snap = readSnapshot(store);
  expect(snap.activities).toContainEqual({ id, name: 'Meditate', committed: true });
  expect(snap.listings).toContainEqual(expect.objectContaining({ sectionId: sectionId('Bedtime'), activityId: id }));
});

test('adding a new name without options, or with committed false, creates a quick activity', () => {
  const { store, sectionId } = basicDay();
  const plain = addActivityToSection(store, sectionId('Bedtime'), 'Meditate');
  const explicit = addActivityToSection(store, sectionId('Bedtime'), 'Stretch later', { committed: false });

  const snap = readSnapshot(store);
  expect(snap.activities).toContainEqual({ id: plain, name: 'Meditate', committed: false });
  expect(snap.activities).toContainEqual({ id: explicit, name: 'Stretch later', committed: false });
});

test('adding a quick existing name with committed true reuses it, lists it, and leaves it quick', () => {
  const { store, activityId, sectionId } = basicDay();

  const id = addActivityToSection(store, sectionId('Bedtime'), 'gym', { committed: true });

  expect(id).toBe(activityId('Gym'));
  const snap = readSnapshot(store);
  expect(snap.activities).toHaveLength(7);
  expect(snap.activities.find(activity => activity.id === id)?.committed).toBe(false);
  expect(sectionActivities(snap, sectionId('Bedtime')).map(activity => activity.name)).toContain('Gym');
});

test('adding a committed existing name with committed true reuses it, lists it, and leaves it committed', () => {
  const { store, activityId, sectionId } = basicDay();
  setActivityCommitted(store, activityId('Read'), true);

  const id = addActivityToSection(store, sectionId('Bedtime'), 'read', { committed: true });

  expect(id).toBe(activityId('Read'));
  const snap = readSnapshot(store);
  expect(snap.activities).toHaveLength(7);
  expect(snap.activities.find(activity => activity.id === id)?.committed).toBe(true);
  expect(sectionActivities(snap, sectionId('Bedtime')).map(activity => activity.name)).toContain('Read');
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

test('deleting a section removes its listings and keeps its activities', () => {
  const { store, sectionId } = basicDay();
  deleteSection(store, sectionId('Bedtime'));

  const snap = readSnapshot(store);
  expect(snap.sections.map(section => section.name)).toEqual(['Post work', 'Post dinner']);
  expect(snap.listings).toHaveLength(6);
  expect(snap.activities).toHaveLength(7);
});

test('deleting a section removes its slots from every template, and the day no longer shows them', () => {
  const { store, labelId, templateId, sectionId, activityId } = basicDay();
  saveTemplate(store, {
    name: 'Short', label: { id: labelId }, steps: [{ kind: 'fixed', name: 'Dinner' }, { kind: 'slot', slotName: 'Bedtime' }],
  });
  addPastEntry(store, {
    activityId: activityId('Journal'), sectionId: sectionId('Bedtime'), day: '2026-10-11',
  });

  deleteSection(store, sectionId('Bedtime'));

  const snap = readSnapshot(store);
  expect(snap.items.some(item => item.name === 'Bedtime')).toBe(false);
  expect(snap.items.filter(item => item.templateId === templateId).map(item => item.name))
    .toEqual([
      'Wake up', 'Brush teeth', 'Change clothes', 'Work', 'Post work', 'Dinner', 'Post dinner', 'Brush teeth', 'Sleep',
    ]);
  expect(snap.items.filter(item => item.kind === 'slot').map(item => item.name)).toEqual(['Post work', 'Post dinner']);
  expect(nowView(snap, at(21, 0)).slots.map(slot => slot.item.name)).toEqual(['Post work', 'Post dinner']);
  expect(snap.journal).toHaveLength(1);
  expect(snap.journal[0].sectionId).toBe(sectionId('Bedtime'));
});

test('renaming a section renames its slot in every template that uses it', () => {
  const { store, labelId, templateId, sectionId } = basicDay();
  const short = saveTemplate(store, {
    name: 'Short', label: { id: labelId }, steps: [{ kind: 'slot', slotName: 'Bedtime' }],
  });

  renameSection(store, sectionId('Bedtime'), 'Night');

  const snap = readSnapshot(store);
  expect(snap.items.filter(item => item.name === 'Night').map(item => item.templateId).sort())
    .toEqual([templateId, short].sort());
  expect(snap.items.some(item => item.name === 'Bedtime')).toBe(false);
});

test('sections and activities can be renamed', () => {
  const { store, activityId, sectionId } = basicDay();
  renameSection(store, sectionId('Bedtime'), 'Night');
  renameActivity(store, activityId('Journal'), 'Diary');

  const snap = readSnapshot(store);
  expect(snap.sections.find(section => section.id === sectionId('Bedtime'))?.name).toBe('Night');
  expect(snap.activities.find(activity => activity.id === activityId('Journal'))?.name).toBe('Diary');
});

test('setActivityCommitted flips an activity both ways', () => {
  const { store, activityId } = basicDay();
  const gym = activityId('Gym');
  const committedOf = () => readSnapshot(store).activities.find(activity => activity.id === gym)?.committed;

  setActivityCommitted(store, gym, true);
  expect(committedOf()).toBe(true);
  setActivityCommitted(store, gym, false);
  expect(committedOf()).toBe(false);
});

test('setActivityCommitted does nothing for an unknown activity', () => {
  const { store } = basicDay();
  const before = readSnapshot(store).activities;

  setActivityCommitted(store, 'no-such-activity', true);

  expect(readSnapshot(store).activities).toEqual(before);
  expect(store.hasRow('activities', 'no-such-activity')).toBe(false);
});

test('addSection puts the new section last', () => {
  const { store } = basicDay();
  const id = addSection(store, 'Weekend');
  const snap = readSnapshot(store);
  expect(snap.sections.at(-1)).toEqual({ id, name: 'Weekend', position: 3 });
});

test('addActivity creates a quick activity that is in no slot', () => {
  const { store } = basicDay();
  const id = addActivity(store, 'Yoga');

  const snap = readSnapshot(store);
  expect(snap.activities).toContainEqual({ id, name: 'Yoga', committed: false });
  expect(snap.listings.some(listing => listing.activityId === id)).toBe(false);
});

test('addActivity reuses an activity with the same name, ignoring case and surrounding spaces', () => {
  const { store, activityId } = basicDay();
  const yoga = addActivity(store, 'Yoga');

  expect(addActivity(store, '  yoga ')).toBe(yoga);
  expect(addActivity(store, 'gym')).toBe(activityId('Gym'));
  expect(readSnapshot(store).activities).toHaveLength(8);
});

test('addActivity with a blank name returns an empty string and creates nothing', () => {
  const { store } = basicDay();

  expect(addActivity(store, '   ')).toBe('');
  expect(readSnapshot(store).activities).toHaveLength(7);
});

test('setActivityInSection true lists the activity last in that slot, and a second true changes nothing', () => {
  const { store, sectionId } = basicDay();
  const yoga = addActivity(store, 'Yoga');

  setActivityInSection(store, yoga, sectionId('Bedtime'), true);
  const once = readSnapshot(store).listings;
  expect(sectionActivities(readSnapshot(store), sectionId('Bedtime')).map(activity => activity.name).at(-1)).toBe('Yoga');

  setActivityInSection(store, yoga, sectionId('Bedtime'), true);
  expect(readSnapshot(store).listings).toEqual(once);
});

test('setActivityInSection false removes that listing only and keeps the activity', () => {
  const { store, activityId, sectionId } = basicDay();
  const read = activityId('Read');

  setActivityInSection(store, read, sectionId('Post work'), false);

  const snap = readSnapshot(store);
  expect(snap.listings.some(listing => listing.activityId === read && listing.sectionId === sectionId('Post work'))).toBe(false);
  expect(snap.listings.some(listing => listing.activityId === read && listing.sectionId === sectionId('Post dinner'))).toBe(true);
  expect(snap.listings).toHaveLength(8);
  expect(snap.activities).toHaveLength(7);
});

test('setActivityInSection changes nothing for an unknown activity or section', () => {
  const { store, activityId, sectionId } = basicDay();
  const before = readSnapshot(store);

  setActivityInSection(store, 'no-such-activity', sectionId('Bedtime'), true);
  setActivityInSection(store, activityId('Gym'), 'no-such-section', true);
  setActivityInSection(store, 'no-such-activity', sectionId('Bedtime'), false);

  expect(readSnapshot(store)).toEqual(before);
});

test('deleteActivity removes the activity and every listing of it, and keeps its journal entries', () => {
  const { store, activityId, sectionId } = basicDay();
  const read = activityId('Read');
  addPastEntry(store, { activityId: read, sectionId: sectionId('Post work'), day: '2026-10-11' });

  deleteActivity(store, read);

  const snap = readSnapshot(store);
  expect(snap.activities.some(activity => activity.id === read)).toBe(false);
  expect(snap.listings.some(listing => listing.activityId === read)).toBe(false);
  expect(snap.listings).toHaveLength(6);
  expect(snap.journal).toHaveLength(1);
  expect(snap.journal[0].activityId).toBe(read);
});
