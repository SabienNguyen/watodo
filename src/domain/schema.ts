// Private to src/domain: the only place that knows table, value and cell names.
import type { MergeableStore } from 'tinybase';
import { nameKey, type Id } from './rules';

export const TABLE = {
  labels: 'labels',
  templates: 'templates',
  items: 'items',
  sections: 'sections',
  activities: 'activities',
  listings: 'listings', // row id: `${sectionId}:${activityId}`, so a listing cannot be duplicated across devices
  journal: 'journal',
  days: 'days', // row id: the DayKey
} as const;

export const VALUE = {
  defaultTemplateId: 'defaultTemplateId',
  setupFinished: 'setupFinished',
} as const;

export function newId(): Id {
  return crypto.randomUUID();
}

/** One more than the highest `position` in the table, or 0 when there is none. */
export function nextPosition(store: MergeableStore, tableId: string): number {
  let highest = -1;
  for (const rowId of store.getRowIds(tableId)) {
    const position = store.getCell(tableId, rowId, 'position');
    if (typeof position === 'number' && position > highest) highest = position;
  }
  return highest + 1;
}

/** Weekdays are stored as a comma-separated string, sorted, without repeats. */
export function encodeWeekdays(weekdays: number[]): string {
  return [...new Set(weekdays)].sort((a, b) => a - b).join(',');
}

export function decodeWeekdays(text: string): number[] {
  if (text === '') return [];
  return text.split(',').map(Number).filter(Number.isInteger);
}

export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function listingId(sectionId: Id, activityId: Id): Id {
  return `${sectionId}:${activityId}`;
}

export function findIdByName(store: MergeableStore, tableId: string, name: string): Id | undefined {
  return store.getRowIds(tableId).find(id => {
    const existing = store.getCell(tableId, id, 'name');
    return typeof existing === 'string' && sameName(existing, name);
  });
}

/** True when the row exists and is not marked deleted. */
export function isLive(store: MergeableStore, tableId: string, id: Id): boolean {
  return store.hasRow(tableId, id) && store.getCell(tableId, id, 'deleted') !== true;
}

export function liveRowIds(store: MergeableStore, tableId: string): Id[] {
  return store.getRowIds(tableId).filter(id => store.getCell(tableId, id, 'deleted') !== true);
}

/**
 * A row whose name has the same key as `name` (see nameKey), preferring a live row over a deleted one.
 * `deleted` tells the caller whether it has to be brought back.
 */
export function findByKey(store: MergeableStore, tableId: string, name: string): { id: Id; deleted: boolean } | undefined {
  const key = nameKey(name);
  let deletedMatch: Id | undefined;
  for (const id of store.getRowIds(tableId)) {
    const existing = store.getCell(tableId, id, 'name');
    if (typeof existing !== 'string' || nameKey(existing) !== key) continue;
    if (store.getCell(tableId, id, 'deleted') !== true) return { id, deleted: false };
    deletedMatch ??= id;
  }
  return deletedMatch === undefined ? undefined : { id: deletedMatch, deleted: true };
}

/** The live section with this name's key, else a deleted one brought back, else a new one at the end. */
export function ensureSection(store: MergeableStore, name: string): Id {
  const found = findByKey(store, TABLE.sections, name);
  if (found !== undefined) {
    if (found.deleted) store.delCell(TABLE.sections, found.id, 'deleted');
    return found.id;
  }
  const id = newId();
  store.setRow(TABLE.sections, id, { name: name.trim(), position: nextPosition(store, TABLE.sections) });
  return id;
}

/**
 * The live activity with this name's key, else a deleted one brought back (quick, with no rest days),
 * else a new quick one.
 */
export function ensureActivity(store: MergeableStore, name: string): Id {
  const found = findByKey(store, TABLE.activities, name);
  if (found !== undefined) {
    if (found.deleted) {
      store.delCell(TABLE.activities, found.id, 'deleted');
      store.delCell(TABLE.activities, found.id, 'committed');
      store.delCell(TABLE.activities, found.id, 'restDays');
    }
    return found.id;
  }
  const id = newId();
  store.setRow(TABLE.activities, id, { name: name.trim() });
  return id;
}

export function ensureListing(store: MergeableStore, sectionId: Id, activityId: Id): void {
  const id = listingId(sectionId, activityId);
  if (store.hasRow(TABLE.listings, id)) return;
  store.setRow(TABLE.listings, id, { sectionId, activityId, position: nextPosition(store, TABLE.listings) });
}

export function templateExists(store: MergeableStore, templateId: Id): boolean {
  return isLive(store, TABLE.templates, templateId);
}

export function defaultTemplateIsValid(store: MergeableStore): boolean {
  const defaultId = store.getValue(VALUE.defaultTemplateId);
  return typeof defaultId === 'string' && templateExists(store, defaultId);
}

export function itemIdsOf(store: MergeableStore, templateId: Id): Id[] {
  return store.getRowIds(TABLE.items).filter(
    id => store.getCell(TABLE.items, id, 'templateId') === templateId,
  );
}

/**
 * Removes the template's items and marks the template deleted. Its row and name stay, for the day
 * records and the Journal. Does not touch the default.
 */
export function deleteTemplateRows(store: MergeableStore, templateId: Id): void {
  for (const itemId of itemIdsOf(store, templateId)) {
    store.delRow(TABLE.items, itemId);
  }
  if (store.hasRow(TABLE.templates, templateId)) store.setCell(TABLE.templates, templateId, 'deleted', true);
}

export interface JournalFields {
  activityId: Id;
  sectionId: Id;
  loggedAt: number;
  itemId?: Id;
  committed?: boolean;                 // only `true` is written: a quick entry has no committed cell
  note?: string;
  durationMinutes?: number;
}

export function writeJournalRow(store: MergeableStore, fields: JournalFields): Id {
  const id = newId();
  const row: Record<string, string | number | boolean> = {
    activityId: fields.activityId,
    sectionId: fields.sectionId,
    loggedAt: fields.loggedAt,
  };
  if (fields.itemId !== undefined) row.itemId = fields.itemId;
  if (fields.committed === true) row.committed = true;
  if (fields.note) row.note = fields.note;
  if (fields.durationMinutes !== undefined) row.durationMinutes = fields.durationMinutes;
  store.setRow(TABLE.journal, id, row);
  return id;
}
