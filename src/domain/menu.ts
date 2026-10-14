import { nameKey, type Id } from './rules';
import type { WatodoStore } from './store';
import {
  ensureActivity, ensureListing, ensureSection, findByKey, isLive, liveRowIds, listingId, TABLE,
} from './schema';

/** The live section with this name's key, else a deleted one brought back (with no listings), else a new one last. */
export function addSection(store: WatodoStore, name: string): Id {
  return ensureSection(store, name);
}

/** False, and nothing changed, when `id` is not a live section or another live section has the same name key. */
export function renameSection(store: WatodoStore, id: Id, name: string): boolean {
  return renameRow(store, TABLE.sections, id, name);
}

/**
 * Removes the section's listings, and the slots that point at it in every template, then marks the
 * section deleted. Its name stays for the Journal and Progress. Journal entries and activities are kept.
 */
export function deleteSection(store: WatodoStore, id: Id): void {
  if (!store.hasRow(TABLE.sections, id)) return;
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
    store.setCell(TABLE.sections, id, 'deleted', true);
  });
}

/**
 * Reuses the live activity with the same name key, and brings back a deleted one. Its committed setting
 * is kept when it was live. An activity that was not live before the call is quick unless
 * `options.committed` is true. Listing it twice adds nothing.
 */
export function addActivityToSection(store: WatodoStore, sectionId: Id, name: string, options?: { committed?: boolean }): Id {
  return store.transaction(() => {
    const found = findByKey(store, TABLE.activities, name);
    const wasLive = found !== undefined && !found.deleted;
    const activityId = ensureActivity(store, name);
    if (!wasLive && (options?.committed ?? false)) setActivityCommitted(store, activityId, true);
    ensureListing(store, sectionId, activityId);
    return activityId;
  });
}

export function removeActivityFromSection(store: WatodoStore, sectionId: Id, activityId: Id): void {
  store.delRow(TABLE.listings, listingId(sectionId, activityId));
}

/**
 * Creates a quick activity in no slot, or reuses the activity with this name key, bringing a deleted one back.
 * A blank name creates nothing and returns ''.
 */
export function addActivity(store: WatodoStore, name: string): Id {
  if (name.trim() === '') return '';
  return store.transaction(() => ensureActivity(store, name));
}

/** Lists the activity at the end of the slot, or removes its listing there. Does nothing for a deleted or unknown activity or slot. */
export function setActivityInSection(store: WatodoStore, activityId: Id, sectionId: Id, listed: boolean): void {
  if (!isLive(store, TABLE.activities, activityId) || !isLive(store, TABLE.sections, sectionId)) return;
  if (listed) ensureListing(store, sectionId, activityId);
  else store.delRow(TABLE.listings, listingId(sectionId, activityId));
}

/**
 * Removes the activity's listings in every slot, then marks the activity deleted. Its name stays for the
 * Journal and Progress. Journal entries are kept.
 */
export function deleteActivity(store: WatodoStore, activityId: Id): void {
  if (!store.hasRow(TABLE.activities, activityId)) return;
  store.transaction(() => {
    for (const listing of store.getRowIds(TABLE.listings)) {
      if (store.getCell(TABLE.listings, listing, 'activityId') === activityId) {
        store.delRow(TABLE.listings, listing);
      }
    }
    store.setCell(TABLE.activities, activityId, 'deleted', true);
  });
}

/** False, and nothing changed, when `id` is not a live activity or another live activity has the same name key. */
export function renameActivity(store: WatodoStore, id: Id, name: string): boolean {
  return renameRow(store, TABLE.activities, id, name);
}

/** Committed activities spend their slot when logged. The kind belongs to the activity, in every slot. Live activities only. */
export function setActivityCommitted(store: WatodoStore, activityId: Id, committed: boolean): void {
  if (isLive(store, TABLE.activities, activityId)) store.setCell(TABLE.activities, activityId, 'committed', committed);
}

/**
 * A whole number of days >= 1 is stored. Anything else (0, negative, NaN, Infinity) removes the cell,
 * so the activity never rests. Live activities only.
 */
export function setActivityRestDays(store: WatodoStore, activityId: Id, days: number): void {
  if (!isLive(store, TABLE.activities, activityId)) return;
  const whole = Math.floor(days);
  if (Number.isFinite(whole) && whole >= 1) store.setCell(TABLE.activities, activityId, 'restDays', whole);
  else store.delCell(TABLE.activities, activityId, 'restDays');
}

/** Renames a live row, unless another live row of the table has the same name key. */
function renameRow(store: WatodoStore, tableId: string, id: Id, name: string): boolean {
  if (!isLive(store, tableId, id)) return false;
  const key = nameKey(name);
  const clash = liveRowIds(store, tableId).some(other => {
    if (other === id) return false;
    const existing = store.getCell(tableId, other, 'name');
    return typeof existing === 'string' && nameKey(existing) === key;
  });
  if (clash) return false;
  store.setCell(tableId, id, 'name', name.trim());
  return true;
}
