import { expect, test } from 'vitest';
import { confirmDay, logActivity } from './logging';
import { deleteSection } from './menu';
import {
  draftFromStarter, draftFromTemplate, moveStep, nowView, sectionActivities, templateName, type DraftStep, type Id,
} from './rules';
import { createWatodoStore, readSnapshot } from './store';
import {
  addLabel, deleteLabel, deleteTemplate, saveTemplate, setDefaultTemplate, setLabelWeekdays,
} from './templates';
import { at, basicDay } from './testing';

const BASIC_ORDER = [
  'Wake up', 'Brush teeth', 'Change clothes', 'Work', 'Post work', 'Dinner', 'Post dinner', 'Bedtime',
  'Brush teeth', 'Sleep',
];

function orderOf(store: ReturnType<typeof basicDay>['store'], templateId: string): string[] {
  return readSnapshot(store).items.filter(item => item.templateId === templateId).map(item => item.name);
}

function editDraftOf(store: ReturnType<typeof basicDay>['store'], templateId: Id) {
  const draft = draftFromTemplate(readSnapshot(store), templateId, 'edit');
  if (draft === null) throw new Error('no such template');
  return draft;
}

/** The id of the item at a position in a template. Two steps are named Brush teeth, so they are told apart by position. */
function itemIdAt(store: ReturnType<typeof basicDay>['store'], templateId: Id, position: number): Id {
  const item = readSnapshot(store).items.find(row => row.templateId === templateId && row.position === position);
  if (item === undefined) throw new Error(`no item at position ${position}`);
  return item.id;
}

test('the first template becomes the default, later ones do not take it', () => {
  const { store, labelId, templateId } = basicDay();
  saveTemplate(store, { name: 'Short', label: { id: labelId }, steps: [] });
  expect(readSnapshot(store).defaultTemplateId).toBe(templateId);
});

test('deleting the default with another template present asks for a new default and changes nothing', () => {
  const { store, labelId, templateId } = basicDay();
  saveTemplate(store, { name: 'Short', label: { id: labelId }, steps: [] });

  expect(deleteTemplate(store, templateId)).toBe('needs-new-default');
  const snap = readSnapshot(store);
  expect(snap.templates).toHaveLength(2);
  expect(snap.defaultTemplateId).toBe(templateId);
  expect(snap.items).toHaveLength(10);
});

test('deleting the default with a new default names the replacement and deletes the template', () => {
  const { store, labelId, templateId } = basicDay();
  const short = saveTemplate(store, { name: 'Short', label: { id: labelId }, steps: [] });

  expect(deleteTemplate(store, templateId, short)).toBe('deleted');
  const snap = readSnapshot(store);
  expect(snap.templates.map(template => template.id)).toEqual([short]);
  expect(snap.removed.templates.map(template => template.id)).toEqual([templateId]);
  expect(snap.defaultTemplateId).toBe(short);
  expect(snap.items).toHaveLength(0);
});

test('deleting the only template restores the basic day without duplicating sections or activities', () => {
  const { store, labelId, templateId } = basicDay();

  expect(deleteTemplate(store, templateId)).toBe('restored-basic');
  const snap = readSnapshot(store);
  expect(snap.templates).toHaveLength(1);
  expect(snap.templates[0]).toMatchObject({ name: 'Basic day', labelId });
  expect(snap.templates[0].id).not.toBe(templateId);
  expect(snap.defaultTemplateId).toBe(snap.templates[0].id);
  expect(snap.removed.templates.map(template => template.name)).toEqual(['Basic day']);
  expect(snap.items).toHaveLength(10);
  expect(snap.sections).toHaveLength(3);
  expect(snap.activities).toHaveLength(7);
  expect(snap.listings).toHaveLength(9);
});

test('deleting the last live template restores the basic day even when deleted templates exist', () => {
  const { store, labelId, templateId } = basicDay();
  const short = saveTemplate(store, { name: 'Short', label: { id: labelId }, steps: [] });
  expect(deleteTemplate(store, short)).toBe('deleted');

  expect(deleteTemplate(store, templateId)).toBe('restored-basic');
  const snap = readSnapshot(store);
  expect(snap.templates).toHaveLength(1);
  expect(snap.templates[0]).toMatchObject({ name: 'Basic day', labelId });
  expect(snap.templates[0].id).not.toBe(templateId);
  expect(snap.defaultTemplateId).toBe(snap.templates[0].id);
  expect(snap.removed.templates.map(template => template.name)).toEqual(['Basic day', 'Short']);
  expect(snap.items).toHaveLength(10);
});

test('the day record of a deleted template still resolves to its name', () => {
  const { store, labelId } = basicDay();
  const short = saveTemplate(store, { name: 'Short', label: { id: labelId }, steps: [] });
  confirmDay(store, () => at(9, 0), short);
  expect(deleteTemplate(store, short)).toBe('deleted');

  const snap = readSnapshot(store);
  expect(snap.days.map(day => day.templateId)).toEqual([short]);
  expect(templateName(snap, short)).toBe('Short');
  expect(snap.templates.some(template => template.id === short)).toBe(false);
});

test('restoring the basic day recreates only the sections that are missing', () => {
  const { store, templateId, sectionId } = basicDay();
  expect(deleteTemplate(store, templateId)).toBe('restored-basic');
  const restored = readSnapshot(store).templates[0].id;

  deleteSection(store, sectionId('Bedtime'));
  expect(deleteTemplate(store, restored)).toBe('restored-basic');
  const snap = readSnapshot(store);
  expect(snap.sections.map(section => section.name).sort()).toEqual(['Bedtime', 'Post dinner', 'Post work']);
  expect(snap.activities).toHaveLength(7);
});

test('deleteLabel refuses while a template uses the label', () => {
  const { store, labelId } = basicDay();
  expect(deleteLabel(store, labelId)).toBe(false);
  expect(readSnapshot(store).labels).toHaveLength(1);

  const weekend = addLabel(store, 'Weekend');
  expect(deleteLabel(store, weekend)).toBe(true);
  expect(readSnapshot(store).labels.map(label => label.name)).toEqual(['Work day']);
});

test('deleteLabel succeeds when only deleted templates used the label', () => {
  const { store } = basicDay();
  const weekend = addLabel(store, 'Weekend');
  const weekendDay = saveTemplate(store, { name: 'Weekend day', label: { id: weekend }, steps: [] });
  expect(deleteLabel(store, weekend)).toBe(false);

  expect(deleteTemplate(store, weekendDay)).toBe('deleted');
  expect(deleteLabel(store, weekend)).toBe(true);
  expect(readSnapshot(store).labels.map(label => label.name)).toEqual(['Work day']);
});

test('labels keep their weekdays, sorted and without repeats', () => {
  const { store, labelId } = basicDay();
  setLabelWeekdays(store, labelId, [6, 5, 5]);
  expect(readSnapshot(store).labels[0].weekdays).toEqual([5, 6]);
});

test('a template can be renamed and moved to another label by saving its edit draft', () => {
  const { store, templateId } = basicDay();
  const weekend = addLabel(store, 'Weekend');

  const id = saveTemplate(store, { ...editDraftOf(store, templateId), name: 'Office day', label: { id: weekend } });

  expect(id).toBe(templateId);
  expect(readSnapshot(store).templates[0]).toMatchObject({ name: 'Office day', labelId: weekend });
});

test('setDefaultTemplate moves the default', () => {
  const { store, labelId, templateId } = basicDay();
  const short = saveTemplate(store, { name: 'Short', label: { id: labelId }, steps: [] });
  setDefaultTemplate(store, short);
  expect(readSnapshot(store).defaultTemplateId).toBe(short);
  expect(readSnapshot(store).defaultTemplateId).not.toBe(templateId);
});

test('guessing: a second template under Work day is guessed on Tuesday once it was confirmed on Monday', () => {
  const { store, templateId } = basicDay();
  const draft = draftFromTemplate(readSnapshot(store), templateId, 'copy');
  if (draft === null) throw new Error('no such template');
  const second = saveTemplate(store, { ...draft, name: 'Short day' });

  const monday = () => at(9, 0);
  confirmDay(store, monday, second);

  const tuesday = at(9, 0, 1);
  const view = nowView(readSnapshot(store), tuesday);
  expect(view.guess).toMatchObject({ templateId: second, confirmed: false, reason: 'label' });
  expect(view.template?.id).toBe(second);
});

test('saving the office starter next to the basic day reuses the Work day label and the existing sections', () => {
  const { store, labelId, templateId, sectionId, activityId } = basicDay();
  const draft = draftFromStarter(readSnapshot(store), 'office');
  if (draft === null) throw new Error('no such starter');
  expect(draft.label).toEqual({ id: labelId });

  const office = saveTemplate(store, draft);

  const snap = readSnapshot(store);
  expect(snap.labels).toHaveLength(1);
  expect(snap.templates.find(template => template.id === office)).toMatchObject({ name: 'Office day', labelId });
  expect(snap.sections.map(section => section.name)).toEqual([
    'Post work', 'Post dinner', 'Bedtime', 'Post-shower', 'Pre-sleep',
  ]);
  expect(snap.sections.slice(0, 3).map(section => section.id)).toEqual([
    sectionId('Post work'), sectionId('Post dinner'), sectionId('Bedtime'),
  ]);
  expect(snap.activities).toHaveLength(9);
  const reused = snap.activities.filter(activity => ['Read', 'Stretch', 'Journal'].includes(activity.name));
  expect(reused.map(activity => activity.id).sort())
    .toEqual([activityId('Journal'), activityId('Read'), activityId('Stretch')].sort());
  expect(snap.listings).toHaveLength(15);
  expect(orderOf(store, office)).toEqual([
    'Wake up', 'Brush teeth', 'Change clothes', 'Commute', 'Work', 'Post work',
    'Dinner', 'Post dinner', 'Shower', 'Post-shower', 'Pre-sleep', 'Brush teeth', 'Sleep',
  ]);
  expect(snap.defaultTemplateId).toBe(templateId);
});

test('saving the weekend starter creates the Weekend label, a Free time section, and a Free time slot twice', () => {
  const { store, activityId } = basicDay();
  const weekend = saveTemplate(store, draftFromStarter(readSnapshot(store), 'weekend')!);

  const snap = readSnapshot(store);
  expect(snap.labels.find(label => label.name === 'Weekend')).toMatchObject({ weekdays: [5, 6] });

  const freeTime = snap.sections.find(section => section.name === 'Free time');
  expect(freeTime).toBeDefined();
  expect(sectionActivities(snap, freeTime!.id).map(activity => activity.name))
    .toEqual(['Hike', 'Cook something new', 'Read', 'Call family']);
  expect(snap.activities.filter(activity => activity.name === 'Read')).toEqual([
    { id: activityId('Read'), name: 'Read', committed: false },
  ]);
  expect(snap.activities).toHaveLength(9);

  const freeSlots = snap.items.filter(item => item.templateId === weekend && item.name === 'Free time');
  expect(freeSlots).toHaveLength(2);
  expect(freeSlots[0].id).not.toBe(freeSlots[1].id);
  expect(orderOf(store, weekend)).toEqual([
    'Wake up', 'Brush teeth', 'Change clothes', 'Free time', 'Lunch', 'Free time', 'Dinner', 'Post dinner', 'Bedtime',
    'Brush teeth', 'Sleep',
  ]);
});

test('a slot named by the key of a deleted section brings that section back, with no suggested activities', () => {
  const { store, labelId, sectionId } = basicDay();
  const bedtime = sectionId('Bedtime');
  deleteSection(store, bedtime);

  const night = saveTemplate(store, {
    name: 'Night', label: { id: labelId }, steps: [{ kind: 'slot', slotName: 'bedtime' }],
  });

  const snap = readSnapshot(store);
  expect(snap.sections.filter(section => section.name === 'Bedtime')).toEqual([{ id: bedtime, name: 'Bedtime', position: 2 }]);
  expect(snap.listings.some(listing => listing.sectionId === bedtime)).toBe(false);
  expect(snap.items.filter(item => item.templateId === night)).toEqual([
    expect.objectContaining({ kind: 'slot', name: 'Bedtime', sectionId: bedtime }),
  ]);
});

test('a brand-new slot name with no suggestions creates an empty section, with the name trimmed', () => {
  const { store, labelId } = basicDay();
  saveTemplate(store, {
    name: 'Errands day', label: { id: labelId }, steps: [{ kind: 'slot', slotName: '  Errands ' }],
  });

  const snap = readSnapshot(store);
  const errands = snap.sections.find(section => section.name === 'Errands');
  expect(errands).toBeDefined();
  expect(snap.listings.filter(listing => listing.sectionId === errands!.id)).toEqual([]);
  expect(snap.items.find(item => item.sectionId === errands!.id)?.name).toBe('Errands');
});

test('editing keeps the template id and the kept items\' ids, reorders, drops one step and adds one', () => {
  const { store, templateId, itemId } = basicDay();
  const wake = itemId('Wake up');
  const brush = itemIdAt(store, templateId, 1);
  const brushNight = itemIdAt(store, templateId, 8);
  const sleep = itemId('Sleep');
  const change = itemId('Change clothes');
  const work = itemId('Work');
  const postWork = itemId('Post work');
  const postDinner = itemId('Post dinner');
  const bedtime = itemId('Bedtime');
  const dinner = itemId('Dinner');

  const draft = editDraftOf(store, templateId);
  const steps: DraftStep[] = [
    ...moveStep(draft.steps, 3, 5).filter(step => !(step.kind === 'fixed' && step.name === 'Dinner')),
    { kind: 'fixed', name: 'Commute' },
  ];
  const id = saveTemplate(store, { ...draft, name: 'Office day', steps });

  expect(id).toBe(templateId);
  const snap = readSnapshot(store);
  expect(snap.templates[0].name).toBe('Office day');
  expect(snap.items.filter(item => item.templateId === templateId).map(item => item.id)).toEqual([
    wake, brush, change, postWork, work, postDinner, bedtime, brushNight, sleep, expect.any(String),
  ]);
  expect(orderOf(store, templateId)).toEqual([
    'Wake up', 'Brush teeth', 'Change clothes', 'Post work', 'Work', 'Post dinner', 'Bedtime', 'Brush teeth', 'Sleep',
    'Commute',
  ]);
  expect(snap.items.some(item => item.id === dinner)).toBe(false);
});

test('a journal entry logged in a slot before an edit still maps to that slot afterwards', () => {
  const { store, templateId, activityId, sectionId, itemId } = basicDay();
  const clock = () => at(17, 45);
  confirmDay(store, clock, templateId, {
    activityId: activityId('Gym'), sectionId: sectionId('Post work'), itemId: itemId('Post work'),
  });

  const draft = editDraftOf(store, templateId);
  saveTemplate(store, { ...draft, name: 'Office day', steps: moveStep(draft.steps, 4, 0) });

  const snap = readSnapshot(store);
  expect(snap.journal[0].itemId).toBe(itemId('Post work'));
  expect(snap.items.some(item => item.id === snap.journal[0].itemId)).toBe(true);
  expect(nowView(snap, at(17, 50)).position).toMatchObject({
    item: { id: itemId('Post work'), name: 'Post work' }, reason: 'stayed',
  });
  expect(logActivity(store, () => at(17, 50), activityId('Walk'))).toMatchObject({ status: 'logged' });
});

test('a step whose item id names an item of another template gets a new item of its own', () => {
  const { store, templateId, labelId, itemId } = basicDay();
  const other = saveTemplate(store, { name: 'Other', label: { id: labelId }, steps: [] });
  const stranger = itemId('Work');

  saveTemplate(store, {
    templateId: other,
    name: 'Other',
    label: { id: labelId },
    steps: [{ kind: 'fixed', name: 'Work', itemId: stranger }],
  });

  const snap = readSnapshot(store);
  expect(snap.items.find(item => item.id === stranger)?.templateId).toBe(templateId);
  const otherItems = snap.items.filter(item => item.templateId === other);
  expect(otherItems.map(item => item.name)).toEqual(['Work']);
  expect(otherItems[0].id).not.toBe(stranger);
});

test('blank step names are skipped, and the other steps keep their order', () => {
  const { store, labelId } = basicDay();
  const id = saveTemplate(store, {
    name: 'Gappy',
    label: { id: labelId },
    steps: [
      { kind: 'fixed', name: '   ' },
      { kind: 'fixed', name: 'Work' },
      { kind: 'slot', slotName: ' ' },
      { kind: 'slot', slotName: 'Post work' },
    ],
  });

  expect(orderOf(store, id)).toEqual(['Work', 'Post work']);
  expect(readSnapshot(store).items.filter(item => item.templateId === id).map(item => item.kind))
    .toEqual(['fixed', 'slot']);
});

test('the saved template becomes the default only when there was no valid default', () => {
  const { store, labelId, templateId } = basicDay();
  saveTemplate(store, { name: 'Short', label: { id: labelId }, steps: [] });
  expect(readSnapshot(store).defaultTemplateId).toBe(templateId);

  const dangling = basicDay();
  dangling.store.setValue('defaultTemplateId', 'gone');
  const replacement = saveTemplate(dangling.store, {
    name: 'Short', label: { id: dangling.labelId }, steps: [],
  });
  expect(readSnapshot(dangling.store).defaultTemplateId).toBe(replacement);

  const empty = createWatodoStore();
  const first = saveTemplate(empty, {
    name: 'First', label: { newName: 'Work day', weekdays: [0, 1, 2, 3, 4] }, steps: [],
  });
  const snap = readSnapshot(empty);
  expect(snap.defaultTemplateId).toBe(first);
  expect(snap.labels).toEqual([{ id: snap.labels[0].id, name: 'Work day', weekdays: [0, 1, 2, 3, 4], position: 0 }]);
});

test('a label given by name reuses an existing label of that name, in any case', () => {
  const { store, labelId } = basicDay();
  const id = saveTemplate(store, {
    name: 'Short', label: { newName: ' work DAY ', weekdays: [6] }, steps: [],
  });
  const snap = readSnapshot(store);
  expect(snap.labels).toHaveLength(1);
  expect(snap.templates.find(template => template.id === id)?.labelId).toBe(labelId);
});

test('copy mode saves a separate template and leaves the original untouched', () => {
  const { store, templateId } = basicDay();
  const before = readSnapshot(store).items.filter(item => item.templateId === templateId);
  const draft = draftFromTemplate(readSnapshot(store), templateId, 'copy');
  if (draft === null) throw new Error('no such template');

  const copy = saveTemplate(store, draft);

  expect(copy).not.toBe(templateId);
  const snap = readSnapshot(store);
  expect(snap.templates.map(template => template.name)).toEqual(['Basic day', 'Basic day copy']);
  expect(snap.items.filter(item => item.templateId === templateId)).toEqual(before);
  expect(orderOf(store, copy)).toEqual(BASIC_ORDER);
  expect(snap.items.filter(item => item.templateId === copy).some(item => before.some(b => b.id === item.id)))
    .toBe(false);
  expect(snap.defaultTemplateId).toBe(templateId);
  expect(snap.sections).toHaveLength(3);
  expect(snap.activities).toHaveLength(7);
});
