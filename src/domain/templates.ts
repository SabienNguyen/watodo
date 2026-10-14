import { SUGGESTED_ACTIVITIES, type Id, type TemplateDraft } from './rules';
import type { WatodoStore } from './store';
import { addBasicDayTemplate } from './basicDay';
import {
  defaultTemplateIsValid, deleteTemplateRows, encodeWeekdays, ensureActivity, ensureListing, ensureSection,
  findByKey, findIdByName, itemIdsOf, liveRowIds, newId, nextPosition, sameName, templateExists, TABLE, VALUE,
} from './schema';

export function addLabel(store: WatodoStore, name: string): Id {
  const id = newId();
  store.setRow(TABLE.labels, id, {
    name: name.trim(), weekdays: '', position: nextPosition(store, TABLE.labels),
  });
  return id;
}

export function renameLabel(store: WatodoStore, id: Id, name: string): void {
  if (store.hasRow(TABLE.labels, id)) store.setCell(TABLE.labels, id, 'name', name.trim());
}

export function setLabelWeekdays(store: WatodoStore, id: Id, weekdays: number[]): void {
  if (store.hasRow(TABLE.labels, id)) {
    store.setCell(TABLE.labels, id, 'weekdays', encodeWeekdays(weekdays));
  }
}

/** False, and nothing deleted, while a live template uses the label. */
export function deleteLabel(store: WatodoStore, id: Id): boolean {
  const used = liveRowIds(store, TABLE.templates).some(
    templateId => store.getCell(TABLE.templates, templateId, 'labelId') === id,
  );
  if (used) return false;
  store.delRow(TABLE.labels, id);
  return true;
}

export function setDefaultTemplate(store: WatodoStore, id: Id): void {
  if (templateExists(store, id)) store.setValue(VALUE.defaultTemplateId, id);
}

export type DeleteTemplateResult = 'deleted' | 'needs-new-default' | 'restored-basic';

/**
 * Deleting the only live template restores the basic day under the same label, as the default.
 * Deleting the default while others exist needs `newDefaultId`; without a valid one nothing changes.
 */
export function deleteTemplate(store: WatodoStore, id: Id, newDefaultId?: Id): DeleteTemplateResult {
  if (!templateExists(store, id)) return 'deleted';

  if (liveRowIds(store, TABLE.templates).length === 1) {
    return store.transaction(() => {
      const labelId = store.getCell(TABLE.templates, id, 'labelId');
      let restoreLabelId: Id;
      if (typeof labelId === 'string') {
        restoreLabelId = labelId;
      } else {
        restoreLabelId = addLabel(store, 'Work day');
        setLabelWeekdays(store, restoreLabelId, [0, 1, 2, 3, 4]);
      }
      deleteTemplateRows(store, id);
      const restoredId = addBasicDayTemplate(store, restoreLabelId);
      store.setValue(VALUE.defaultTemplateId, restoredId);
      return 'restored-basic' as const;
    });
  }

  const replacement = newDefaultId !== undefined && newDefaultId !== id && templateExists(store, newDefaultId)
    ? newDefaultId
    : undefined;
  const isDefault = store.getValue(VALUE.defaultTemplateId) === id;
  if (isDefault && replacement === undefined) return 'needs-new-default';

  return store.transaction(() => {
    deleteTemplateRows(store, id);
    if (replacement !== undefined) store.setValue(VALUE.defaultTemplateId, replacement);
    return 'deleted' as const;
  });
}

/** `{ id }` is used as is. `{ newName }` reuses the label of that name (case-insensitive) or creates it. */
function labelIdFor(store: WatodoStore, label: TemplateDraft['label']): Id {
  if ('id' in label) return label.id;
  const existing = findIdByName(store, TABLE.labels, label.newName);
  if (existing !== undefined) return existing;
  const id = newId();
  store.setRow(TABLE.labels, id, {
    name: label.newName.trim(),
    weekdays: encodeWeekdays(label.weekdays),
    position: nextPosition(store, TABLE.labels),
  });
  return id;
}

/**
 * The section with this name's key: a live one, or a deleted one brought back. Only a new section gets
 * its suggested activities, if it has any.
 */
function sectionIdFor(store: WatodoStore, slotName: string): Id {
  const name = slotName.trim();
  const isNew = findByKey(store, TABLE.sections, name) === undefined;
  const id = ensureSection(store, name);
  if (!isNew) return id;

  const suggestedFor = Object.keys(SUGGESTED_ACTIVITIES).find(key => sameName(key, name));
  for (const activity of suggestedFor === undefined ? [] : SUGGESTED_ACTIVITIES[suggestedFor]) {
    ensureListing(store, id, ensureActivity(store, activity));
  }
  return id;
}

/**
 * Creates the template, or updates it when `draft.templateId` names one. Its steps become its items,
 * in order. A step that names one of the template's items updates that item, so journal entries that
 * point at it stay linked. The template's items that no step refers to are deleted. Blank steps are
 * skipped. The template becomes the default only when no valid default exists.
 */
export function saveTemplate(store: WatodoStore, draft: TemplateDraft): Id {
  return store.transaction(() => {
    const labelId = labelIdFor(store, draft.label);
    const name = draft.name.trim();

    let templateId: Id;
    if (draft.templateId !== undefined && templateExists(store, draft.templateId)) {
      templateId = draft.templateId;
      store.setCell(TABLE.templates, templateId, 'name', name);
      store.setCell(TABLE.templates, templateId, 'labelId', labelId);
    } else {
      templateId = newId();
      store.setRow(TABLE.templates, templateId, { name, labelId, position: nextPosition(store, TABLE.templates) });
    }

    const existingItems = new Set(itemIdsOf(store, templateId));
    const kept = new Set<Id>();
    const itemIdFor = (candidate: Id | undefined): Id => {
      if (candidate === undefined || !existingItems.has(candidate) || kept.has(candidate)) return newId();
      kept.add(candidate);
      return candidate;
    };

    for (const [position, step] of draft.steps.entries()) {
      if (step.kind === 'fixed') {
        const stepName = step.name.trim();
        if (stepName === '') continue;
        store.setRow(TABLE.items, itemIdFor(step.itemId), {
          templateId, kind: 'fixed', name: stepName, position,
        });
      } else {
        if (step.slotName.trim() === '') continue;
        const sectionId = sectionIdFor(store, step.slotName);
        store.setRow(TABLE.items, itemIdFor(step.itemId), {
          templateId, kind: 'slot', sectionId, position,
        });
      }
    }

    for (const itemId of existingItems) {
      if (!kept.has(itemId)) store.delRow(TABLE.items, itemId);
    }

    if (!defaultTemplateIsValid(store)) store.setValue(VALUE.defaultTemplateId, templateId);
    return templateId;
  });
}
