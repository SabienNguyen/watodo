import type { Id } from './rules';
import type { WatodoStore } from './store';
import {
  ensureActivity, ensureListing, findIdByName, listingId, newId, nextPosition, TABLE,
} from './schema';

export function addSection(store: WatodoStore, name: string): Id {
  const id = newId();
  store.setRow(TABLE.sections, id, { name: name.trim(), position: nextPosition(store, TABLE.sections) });
  return id;
}

export function renameSection(store: WatodoStore, id: Id, name: string): void {
  if (store.hasRow(TABLE.sections, id)) store.setCell(TABLE.sections, id, 'name', name.trim());
}

/**
 * Also removes the section's listings, and the slots that point at it in every template.
 * Journal entries and activities are kept.
 */
export function deleteSection(store: WatodoStore, id: Id): void {
  store.transaction(() => {
    for (const listing of store.getRowIds(TABLE.listings)) {
      if (store.getCell(TABLE.listings, listing, 'sectionId') === id) {
        store.delRow(TABLE.listings, listing);
      }
    }
    for (const item of store.getRowIds(TABLE.items)) {
      if (store.getCell(TABLE.items, item, 'kind') === 'slot' && store.getCell(TABLE.items, item, 'sectionId') === id) {
        store.delRow(TABLE.items, item);
      }
    }
    store.delRow(TABLE.sections, id);
  });
}

/**
 * Reuses an activity with the same name (case-insensitive), and leaves its committed setting as it is.
 * A new activity is quick unless `options.committed` is true. Listing it twice adds nothing.
 */
export function addActivityToSection(store: WatodoStore, sectionId: Id, name: string, options?: { committed?: boolean }): Id {
  return store.transaction(() => {
    const isNew = findIdByName(store, TABLE.activities, name) === undefined;
    const activityId = ensureActivity(store, name);
    if (isNew && (options?.committed ?? false)) setActivityCommitted(store, activityId, true);
    ensureListing(store, sectionId, activityId);
    return activityId;
  });
}

export function removeActivityFromSection(store: WatodoStore, sectionId: Id, activityId: Id): void {
  store.delRow(TABLE.listings, listingId(sectionId, activityId));
}

/** Creates a quick activity in no slot, or reuses the activity with this name (case-insensitive). A blank name creates nothing and returns ''. */
export function addActivity(store: WatodoStore, name: string): Id {
  if (name.trim() === '') return '';
  return store.transaction(() => ensureActivity(store, name));
}

/** Lists the activity at the end of the slot, or removes its listing there. Does nothing for an unknown activity or slot. */
export function setActivityInSection(store: WatodoStore, activityId: Id, sectionId: Id, listed: boolean): void {
  if (!store.hasRow(TABLE.activities, activityId) || !store.hasRow(TABLE.sections, sectionId)) return;
  if (listed) ensureListing(store, sectionId, activityId);
  else store.delRow(TABLE.listings, listingId(sectionId, activityId));
}

/** Also removes the activity's listings in every slot. Journal entries are kept. */
export function deleteActivity(store: WatodoStore, activityId: Id): void {
  store.transaction(() => {
    for (const listing of store.getRowIds(TABLE.listings)) {
      if (store.getCell(TABLE.listings, listing, 'activityId') === activityId) {
        store.delRow(TABLE.listings, listing);
      }
    }
    store.delRow(TABLE.activities, activityId);
  });
}

export function renameActivity(store: WatodoStore, id: Id, name: string): void {
  if (store.hasRow(TABLE.activities, id)) store.setCell(TABLE.activities, id, 'name', name.trim());
}

/** Committed activities spend their slot when logged. The kind belongs to the activity, in every slot. */
export function setActivityCommitted(store: WatodoStore, activityId: Id, committed: boolean): void {
  if (store.hasRow(TABLE.activities, activityId)) store.setCell(TABLE.activities, activityId, 'committed', committed);
}
