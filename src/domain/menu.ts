import type { Id } from './rules';
import type { WatodoStore } from './store';
import {
  ensureActivity, ensureListing, listingId, newId, nextPosition, TABLE,
} from './schema';

export function addSection(store: WatodoStore, name: string): Id {
  const id = newId();
  store.setRow(TABLE.sections, id, { name: name.trim(), position: nextPosition(store, TABLE.sections) });
  return id;
}

export function renameSection(store: WatodoStore, id: Id, name: string): void {
  if (store.hasRow(TABLE.sections, id)) store.setCell(TABLE.sections, id, 'name', name.trim());
}

/** Also removes the section's listings. Journal entries and activities are kept. */
export function deleteSection(store: WatodoStore, id: Id): void {
  store.transaction(() => {
    for (const listing of store.getRowIds(TABLE.listings)) {
      if (store.getCell(TABLE.listings, listing, 'sectionId') === id) {
        store.delRow(TABLE.listings, listing);
      }
    }
    store.delRow(TABLE.sections, id);
  });
}

/** Reuses an activity with the same name (case-insensitive). Listing it twice adds nothing. */
export function addActivityToSection(store: WatodoStore, sectionId: Id, name: string): Id {
  return store.transaction(() => {
    const activityId = ensureActivity(store, name);
    ensureListing(store, sectionId, activityId);
    return activityId;
  });
}

export function removeActivityFromSection(store: WatodoStore, sectionId: Id, activityId: Id): void {
  store.delRow(TABLE.listings, listingId(sectionId, activityId));
}

export function renameActivity(store: WatodoStore, id: Id, name: string): void {
  if (store.hasRow(TABLE.activities, id)) store.setCell(TABLE.activities, id, 'name', name.trim());
}
