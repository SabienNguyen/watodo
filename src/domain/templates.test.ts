import { expect, test } from 'vitest';
import { confirmDay } from './logging';
import { deleteSection } from './menu';
import { nowView, type TemplateItem } from './rules';
import { readSnapshot } from './store';
import {
  addItem, addLabel, createTemplate, deleteItem, deleteLabel, deleteTemplate, moveItem, renameTemplate,
  setDefaultTemplate, setLabelWeekdays, setTemplateLabel, updateItem,
} from './templates';
import { at, basicDay } from './testing';

const BASIC_ORDER = [
  'Wake up, brush teeth, get ready', 'Work', 'Post work', 'Dinner', 'Post dinner', 'Bedtime',
];

function shape(items: TemplateItem[]) {
  return items.map(({ kind, name, position, sectionId }) => ({ kind, name, position, sectionId }));
}

function orderOf(store: ReturnType<typeof basicDay>['store'], templateId: string): string[] {
  return readSnapshot(store).items.filter(item => item.templateId === templateId).map(item => item.name);
}

test('createTemplate with copyFrom copies every item with new ids, the same positions and sections', () => {
  const { store, labelId, templateId } = basicDay();
  const copy = createTemplate(store, { name: 'Copy', labelId, copyFrom: templateId });

  const items = readSnapshot(store).items;
  const original = items.filter(item => item.templateId === templateId);
  const copied = items.filter(item => item.templateId === copy);
  expect(copied).toHaveLength(6);
  expect(copied.some(item => original.some(o => o.id === item.id))).toBe(false);
  expect(shape(copied)).toEqual(shape(original));
  expect(copied.map(item => item.name)).toEqual(BASIC_ORDER);
});

test('the first template becomes the default, later ones do not take it', () => {
  const { store, labelId, templateId } = basicDay();
  createTemplate(store, { name: 'Short', labelId });
  expect(readSnapshot(store).defaultTemplateId).toBe(templateId);
});

test('deleting the default with another template present asks for a new default and changes nothing', () => {
  const { store, labelId, templateId } = basicDay();
  createTemplate(store, { name: 'Short', labelId });

  expect(deleteTemplate(store, templateId)).toBe('needs-new-default');
  const snap = readSnapshot(store);
  expect(snap.templates).toHaveLength(2);
  expect(snap.defaultTemplateId).toBe(templateId);
  expect(snap.items).toHaveLength(6);
});

test('deleting the default with a new default names the replacement and deletes the template', () => {
  const { store, labelId, templateId } = basicDay();
  const short = createTemplate(store, { name: 'Short', labelId });

  expect(deleteTemplate(store, templateId, short)).toBe('deleted');
  const snap = readSnapshot(store);
  expect(snap.templates.map(template => template.id)).toEqual([short]);
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
  expect(snap.items).toHaveLength(6);
  expect(snap.sections).toHaveLength(3);
  expect(snap.activities).toHaveLength(7);
  expect(snap.listings).toHaveLength(9);
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

test('labels keep their weekdays, sorted and without repeats', () => {
  const { store, labelId } = basicDay();
  setLabelWeekdays(store, labelId, [6, 5, 5]);
  expect(readSnapshot(store).labels[0].weekdays).toEqual([5, 6]);
});

test('templates can be renamed and moved to another label', () => {
  const { store, templateId } = basicDay();
  const weekend = addLabel(store, 'Weekend');
  renameTemplate(store, templateId, 'Office day');
  setTemplateLabel(store, templateId, weekend);

  expect(readSnapshot(store).templates[0]).toMatchObject({ name: 'Office day', labelId: weekend });
});

test('setDefaultTemplate moves the default', () => {
  const { store, labelId, templateId } = basicDay();
  const short = createTemplate(store, { name: 'Short', labelId });
  setDefaultTemplate(store, short);
  expect(readSnapshot(store).defaultTemplateId).toBe(short);
  expect(readSnapshot(store).defaultTemplateId).not.toBe(templateId);
});

test('addItem appends the item after the highest position in its template, with the name trimmed', () => {
  const { store, templateId, labelId, sectionId } = basicDay();
  const late = addItem(store, templateId, { kind: 'slot', name: ' Late ', sectionId: sectionId('Bedtime') });
  expect(readSnapshot(store).items.filter(item => item.templateId === templateId).at(-1)).toEqual({
    id: late, templateId, kind: 'slot', name: 'Late', position: 6, sectionId: sectionId('Bedtime'),
  });

  const empty = createTemplate(store, { name: 'Empty', labelId });
  const first = addItem(store, empty, { kind: 'fixed', name: 'Rest' });
  expect(readSnapshot(store).items.find(item => item.id === first)).toMatchObject({ position: 0 });
});

test('moveItem swaps an item with its neighbour, up or down', () => {
  const { store, templateId, itemId } = basicDay();

  moveItem(store, itemId('Work'), 'up');
  expect(orderOf(store, templateId).slice(0, 2)).toEqual(['Work', 'Wake up, brush teeth, get ready']);

  moveItem(store, itemId('Work'), 'down');
  expect(orderOf(store, templateId)).toEqual(BASIC_ORDER);

  moveItem(store, itemId('Post work'), 'down');
  expect(orderOf(store, templateId)).toEqual([
    'Wake up, brush teeth, get ready', 'Work', 'Dinner', 'Post work', 'Post dinner', 'Bedtime',
  ]);
});

test('moveItem at either end of the template does nothing', () => {
  const { store, templateId, itemId } = basicDay();
  const before = readSnapshot(store).items;

  moveItem(store, itemId('Wake up, brush teeth, get ready'), 'up');
  moveItem(store, itemId('Bedtime'), 'down');

  expect(readSnapshot(store).items).toEqual(before);
  expect(orderOf(store, templateId)).toEqual(BASIC_ORDER);
});

test('moveItem never swaps with an item of another template', () => {
  const { store, templateId, labelId } = basicDay();
  const other = createTemplate(store, { name: 'Short', labelId });
  const solo = addItem(store, other, { kind: 'fixed', name: 'Solo' });
  addItem(store, other, { kind: 'fixed', name: 'Two' });

  moveItem(store, solo, 'down');
  expect(orderOf(store, other)).toEqual(['Two', 'Solo']);
  expect(orderOf(store, templateId)).toEqual(BASIC_ORDER);

  moveItem(store, solo, 'down');
  expect(orderOf(store, other)).toEqual(['Two', 'Solo']);
  expect(orderOf(store, templateId)).toEqual(BASIC_ORDER);
});

test('updateItem renames an item, and making a slot fixed removes its section', () => {
  const { store, itemId, sectionId } = basicDay();
  const postWork = itemId('Post work');
  updateItem(store, postWork, { name: 'Commute home' });
  expect(readSnapshot(store).items.find(item => item.id === postWork)).toMatchObject({
    name: 'Commute home', kind: 'slot', sectionId: sectionId('Post work'),
  });

  updateItem(store, postWork, { kind: 'fixed' });
  expect(readSnapshot(store).items.find(item => item.id === postWork)?.sectionId).toBeUndefined();
});

test('updateItem with sectionId null removes the section of a slot', () => {
  const { store, itemId } = basicDay();
  const bedtime = itemId('Bedtime');
  updateItem(store, bedtime, { sectionId: null });
  expect(readSnapshot(store).items.find(item => item.id === bedtime))
    .toMatchObject({ kind: 'slot' });
  expect(readSnapshot(store).items.find(item => item.id === bedtime)?.sectionId).toBeUndefined();
});

test('deleteItem removes one item from the template', () => {
  const { store, templateId, itemId } = basicDay();
  deleteItem(store, itemId('Bedtime'));
  expect(orderOf(store, templateId)).toHaveLength(5);
});

test('guessing: a second template under Work day is guessed on Tuesday once it was confirmed on Monday', () => {
  const { store, labelId, templateId } = basicDay();
  const second = createTemplate(store, { name: 'Short day', labelId, copyFrom: templateId });

  const monday = () => at(9, 0);
  confirmDay(store, monday, second);

  const tuesday = at(9, 0, 1);
  const view = nowView(readSnapshot(store), tuesday);
  expect(view.guess).toMatchObject({ templateId: second, confirmed: false, reason: 'label' });
  expect(view.template?.id).toBe(second);
});
