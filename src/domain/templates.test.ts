import { expect, test } from 'vitest';
import { confirmDay } from './logging';
import { deleteSection } from './menu';
import { nowView, type TemplateItem } from './rules';
import { readSnapshot } from './store';
import {
  addItem, addLabel, createTemplate, deleteItem, deleteLabel, deleteTemplate, renameTemplate,
  setDefaultTemplate, setLabelWeekdays, setTemplateLabel, updateItem,
} from './templates';
import { at, basicDay } from './testing';

function shape(items: TemplateItem[]) {
  return items
    .sort((a, b) => a.start - b.start)
    .map(({ kind, name, start, end, sectionId }) => ({ kind, name, start, end, sectionId }));
}

test('createTemplate with copyFrom copies every item with new ids and the same sections', () => {
  const { store, labelId, templateId } = basicDay();
  const copy = createTemplate(store, { name: 'Copy', labelId, copyFrom: templateId });

  const items = readSnapshot(store).items;
  const original = items.filter(item => item.templateId === templateId);
  const copied = items.filter(item => item.templateId === copy);
  expect(copied).toHaveLength(6);
  expect(copied.some(item => original.some(o => o.id === item.id))).toBe(false);
  expect(shape(copied)).toEqual(shape(original));
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

test('items can be added, updated and deleted', () => {
  const { store, templateId, sectionId } = basicDay();
  const itemId = addItem(store, templateId, {
    kind: 'slot', name: 'Late', start: 1380, end: 1440, sectionId: sectionId('Bedtime'),
  });

  updateItem(store, itemId, { name: 'Late reading', end: 1450 });
  expect(readSnapshot(store).items.find(item => item.id === itemId)).toMatchObject({
    name: 'Late reading', start: 1380, end: 1450, sectionId: sectionId('Bedtime'),
  });

  updateItem(store, itemId, { kind: 'fixed' });
  expect(readSnapshot(store).items.find(item => item.id === itemId)?.sectionId).toBeUndefined();

  deleteItem(store, itemId);
  expect(readSnapshot(store).items).toHaveLength(6);
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
