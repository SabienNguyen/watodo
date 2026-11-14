import type { Id } from './rules';
import type { WatodoStore } from './store';
import {
  companyId, findByKey, isLive, newId, nextPosition, renameRow, TABLE,
} from './schema';

/**
 * Reuses the live bond with the same name key, brings back a deleted one (its catch-up is cleared), or
 * adds a new one at the end. A blank name creates nothing and returns { id: '', created: false }.
 */
export function addBond(store: WatodoStore, name: string): { id: Id; created: boolean } {
  if (name.trim() === '') return { id: '', created: false };
  return store.transaction(() => {
    const found = findByKey(store, TABLE.bonds, name);
    if (found === undefined) {
      const id = newId();
      store.setRow(TABLE.bonds, id, { name: name.trim(), position: nextPosition(store, TABLE.bonds) });
      return { id, created: true };
    }
    if (!found.deleted) return { id: found.id, created: false };
    store.delCell(TABLE.bonds, found.id, 'deleted');
    store.delCell(TABLE.bonds, found.id, 'catchUpDays');
    return { id: found.id, created: true };
  });
}

/** False, and nothing changed, when `id` is not a live bond or another live bond has the same name key (or the name is blank). */
export function renameBond(store: WatodoStore, id: Id, name: string): boolean {
  if (name.trim() === '') return false;
  return renameRow(store, TABLE.bonds, id, name);
}

/** Marks the bond deleted. Its name stays for the history, and its entries keep their links. */
export function deleteBond(store: WatodoStore, id: Id): void {
  if (!store.hasRow(TABLE.bonds, id)) return;
  store.setCell(TABLE.bonds, id, 'deleted', true);
}

/**
 * A whole number of days >= 1 is stored (2.5 becomes 2). Anything else (0, negative, NaN, Infinity) removes
 * the cell, so the bond is never caught up on. Live bonds only.
 */
export function setBondCatchUp(store: WatodoStore, id: Id, days: number): void {
  if (!isLive(store, TABLE.bonds, id)) return;
  const whole = Math.floor(days);
  if (Number.isFinite(whole) && whole >= 1) store.setCell(TABLE.bonds, id, 'catchUpDays', whole);
  else store.delCell(TABLE.bonds, id, 'catchUpDays');
}

/**
 * Puts the bond on the journal entry, or takes it off. Adding needs an existing entry and a live bond;
 * taking off is always allowed, so a deleted bond can still be removed from an entry. Linking the same
 * pair twice keeps one row.
 */
export function setEntryBond(store: WatodoStore, entryId: Id, bondId: Id, together: boolean): void {
  const rowId = companyId(entryId, bondId);
  if (!together) {
    if (store.hasRow(TABLE.company, rowId)) store.delRow(TABLE.company, rowId);
    return;
  }
  if (!store.hasRow(TABLE.journal, entryId) || !isLive(store, TABLE.bonds, bondId)) return;
  store.setRow(TABLE.company, rowId, { entryId, bondId });
}
