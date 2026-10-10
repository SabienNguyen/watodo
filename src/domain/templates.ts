import { itemsOf, type Id } from './rules';
import { readSnapshot, type WatodoStore } from './store';
import { addBasicDayTemplate } from './basicDay';
import {
  defaultTemplateIsValid, deleteTemplateRows, encodeWeekdays, newId, nextPosition,
  templateExists, TABLE, VALUE,
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

/** False, and nothing deleted, while a template uses the label. */
export function deleteLabel(store: WatodoStore, id: Id): boolean {
  const used = store.getRowIds(TABLE.templates).some(
    templateId => store.getCell(TABLE.templates, templateId, 'labelId') === id,
  );
  if (used) return false;
  store.delRow(TABLE.labels, id);
  return true;
}

function copyItems(store: WatodoStore, fromTemplateId: Id, toTemplateId: Id): void {
  for (const item of itemsOf(readSnapshot(store), fromTemplateId)) {
    store.setRow(TABLE.items, newId(), {
      templateId: toTemplateId,
      kind: item.kind,
      name: item.name,
      position: item.position,
      ...(item.sectionId === undefined ? {} : { sectionId: item.sectionId }),
    });
  }
}

/** Creates a template. It becomes the default only when no valid default exists. */
export function createTemplate(store: WatodoStore, input: { name: string; labelId: Id; copyFrom?: Id }): Id {
  return store.transaction(() => {
    const id = newId();
    store.setRow(TABLE.templates, id, {
      name: input.name.trim(), labelId: input.labelId, position: nextPosition(store, TABLE.templates),
    });
    if (input.copyFrom !== undefined) copyItems(store, input.copyFrom, id);
    if (!defaultTemplateIsValid(store)) store.setValue(VALUE.defaultTemplateId, id);
    return id;
  });
}

export function renameTemplate(store: WatodoStore, id: Id, name: string): void {
  if (templateExists(store, id)) store.setCell(TABLE.templates, id, 'name', name.trim());
}

export function setTemplateLabel(store: WatodoStore, id: Id, labelId: Id): void {
  if (templateExists(store, id)) store.setCell(TABLE.templates, id, 'labelId', labelId);
}

export function setDefaultTemplate(store: WatodoStore, id: Id): void {
  if (templateExists(store, id)) store.setValue(VALUE.defaultTemplateId, id);
}

export type DeleteTemplateResult = 'deleted' | 'needs-new-default' | 'restored-basic';

/**
 * Deleting the only template restores the basic day under the same label, as the default.
 * Deleting the default while others exist needs `newDefaultId`; without a valid one nothing changes.
 */
export function deleteTemplate(store: WatodoStore, id: Id, newDefaultId?: Id): DeleteTemplateResult {
  if (!templateExists(store, id)) return 'deleted';

  if (store.getRowCount(TABLE.templates) === 1) {
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

/** Appends the item after the template's last one. */
export function addItem(
  store: WatodoStore,
  templateId: Id,
  item: { kind: 'fixed' | 'slot'; name: string; sectionId?: Id },
): Id {
  const highest = Math.max(-1, ...itemsOf(readSnapshot(store), templateId).map(existing => existing.position));
  const id = newId();
  store.setRow(TABLE.items, id, {
    templateId,
    kind: item.kind,
    name: item.name.trim(),
    position: highest + 1,
    ...(item.kind === 'slot' && item.sectionId !== undefined ? { sectionId: item.sectionId } : {}),
  });
  return id;
}

export function updateItem(
  store: WatodoStore,
  itemId: Id,
  patch: Partial<{ kind: 'fixed' | 'slot'; name: string; sectionId: Id | null }>,
): void {
  if (!store.hasRow(TABLE.items, itemId)) return;
  store.transaction(() => {
    if (patch.kind !== undefined) store.setCell(TABLE.items, itemId, 'kind', patch.kind);
    if (patch.name !== undefined) store.setCell(TABLE.items, itemId, 'name', patch.name.trim());
    if (patch.sectionId === null) {
      store.delCell(TABLE.items, itemId, 'sectionId');
    } else if (patch.sectionId !== undefined) {
      store.setCell(TABLE.items, itemId, 'sectionId', patch.sectionId);
    }
    // Only slots point at a section.
    if (store.getCell(TABLE.items, itemId, 'kind') === 'fixed') {
      store.delCell(TABLE.items, itemId, 'sectionId');
    }
  });
}

/** Swaps the item's position with its neighbour in the same template. Does nothing at either end. */
export function moveItem(store: WatodoStore, itemId: Id, direction: 'up' | 'down'): void {
  const snap = readSnapshot(store);
  const item = snap.items.find(candidate => candidate.id === itemId);
  if (item === undefined) return;
  const siblings = itemsOf(snap, item.templateId);
  const index = siblings.findIndex(candidate => candidate.id === itemId);
  const neighbour = siblings[direction === 'up' ? index - 1 : index + 1];
  if (neighbour === undefined) return;
  store.transaction(() => {
    store.setCell(TABLE.items, item.id, 'position', neighbour.position);
    store.setCell(TABLE.items, neighbour.id, 'position', item.position);
  });
}

export function deleteItem(store: WatodoStore, itemId: Id): void {
  store.delRow(TABLE.items, itemId);
}
