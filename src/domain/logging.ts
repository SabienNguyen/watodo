import { dayKeyOf, noonOf, nowView, type DayKey, type Id } from './rules';
import type { Clock } from './clock';
import { readSnapshot, type WatodoStore } from './store';
import { TABLE, writeJournalRow } from './schema';

const ONE_MINUTE_MS = 60 * 1000;

export interface PendingLog { activityId: Id; sectionId: Id; itemId: Id }

export type LogResult =
  | { status: 'logged'; entryId: Id }
  | { status: 'needs-template'; pending: PendingLog; guessTemplateId: Id }
  | { status: 'not-available' };                              // no slot now, or activity not listed in it

export function logActivity(store: WatodoStore, clock: Clock, activityId: Id): LogResult {
  const now = clock();
  const view = nowView(readSnapshot(store), now);
  const position = view.position;
  if (position === null || view.template === null) return { status: 'not-available' };

  const { id: itemId, sectionId } = position.item;
  const listed = view.activities.some(({ activity }) => activity.id === activityId);
  if (sectionId === undefined || !listed) return { status: 'not-available' };

  if (!view.guess.confirmed) {
    return {
      status: 'needs-template',
      pending: { activityId, sectionId, itemId },
      guessTemplateId: view.template.id,
    };
  }
  const entryId = writeJournalRow(store, { activityId, sectionId, itemId, loggedAt: now.getTime() });
  return { status: 'logged', entryId };
}

/** Sets today's template, keeping its note. Logs the pending tap when one is given. */
export function confirmDay(store: WatodoStore, clock: Clock, templateId: Id, pending?: PendingLog): Id | null {
  const now = clock();
  const day = dayKeyOf(now);
  return store.transaction(() => {
    store.setCell(TABLE.days, day, 'templateId', templateId);

    // A slot picked by hand belongs to one template; confirming another template drops it.
    const chosenItemId = store.getCell(TABLE.days, day, 'chosenItemId');
    if (typeof chosenItemId === 'string'
      && store.getCell(TABLE.items, chosenItemId, 'templateId') !== templateId) {
      store.delCell(TABLE.days, day, 'chosenItemId');
      if (store.hasCell(TABLE.days, day, 'chosenAt')) store.delCell(TABLE.days, day, 'chosenAt');
    }

    if (pending === undefined) return null;
    return writeJournalRow(store, {
      activityId: pending.activityId,
      sectionId: pending.sectionId,
      itemId: pending.itemId,
      loggedAt: now.getTime(),
    });
  });
}

/** Deletes today's most recent entry. Today stays confirmed. */
export function undoLast(store: WatodoStore, clock: Clock): Id | null {
  const today = dayKeyOf(clock());
  let latest: { id: Id; loggedAt: number } | null = null;
  for (const entry of readSnapshot(store).journal) {
    if (dayKeyOf(new Date(entry.loggedAt)) !== today) continue;
    if (latest === null || entry.loggedAt > latest.loggedAt) latest = { id: entry.id, loggedAt: entry.loggedAt };
  }
  if (latest === null) return null;
  store.delRow(TABLE.journal, latest.id);
  return latest.id;
}

/** Picks a slot by hand for today. Does nothing unless `itemId` is an existing slot. */
export function goToSlot(store: WatodoStore, clock: Clock, itemId: Id): void {
  if (store.getCell(TABLE.items, itemId, 'kind') !== 'slot') return;
  const now = clock();
  store.transaction(() => {
    const day = dayKeyOf(now);
    store.setCell(TABLE.days, day, 'chosenItemId', itemId);
    store.setCell(TABLE.days, day, 'chosenAt', now.getTime());
  });
}

export function deleteEntry(store: WatodoStore, entryId: Id): void {
  store.delRow(TABLE.journal, entryId);
}

/**
 * Adds an entry to an earlier day. It goes one minute after that day's latest entry,
 * so entries keep the order they were added in; the first one of a day is at noon.
 */
export function addPastEntry(
  store: WatodoStore,
  input: { activityId: Id; sectionId: Id; day: DayKey; note?: string; durationMinutes?: number },
): Id {
  let latest: number | undefined;
  for (const entry of readSnapshot(store).journal) {
    if (dayKeyOf(new Date(entry.loggedAt)) !== input.day) continue;
    if (latest === undefined || entry.loggedAt > latest) latest = entry.loggedAt;
  }
  const loggedAt = latest === undefined ? noonOf(input.day).getTime() : latest + ONE_MINUTE_MS;
  return writeJournalRow(store, {
    activityId: input.activityId,
    sectionId: input.sectionId,
    loggedAt,
    note: input.note,
    durationMinutes: input.durationMinutes,
  });
}

/** An empty note removes it; a null duration removes it. */
export function editEntry(
  store: WatodoStore,
  entryId: Id,
  patch: { note?: string; durationMinutes?: number | null },
): void {
  if (!store.hasRow(TABLE.journal, entryId)) return;
  store.transaction(() => {
    if (patch.note !== undefined) {
      if (patch.note === '') store.delCell(TABLE.journal, entryId, 'note');
      else store.setCell(TABLE.journal, entryId, 'note', patch.note);
    }
    if (patch.durationMinutes !== undefined) {
      if (patch.durationMinutes === null) store.delCell(TABLE.journal, entryId, 'durationMinutes');
      else store.setCell(TABLE.journal, entryId, 'durationMinutes', patch.durationMinutes);
    }
  });
}

/** An empty text removes the note. The day record is created when needed. */
export function setDayNote(store: WatodoStore, day: DayKey, text: string): void {
  if (text === '') {
    if (store.hasCell(TABLE.days, day, 'note')) store.delCell(TABLE.days, day, 'note');
    return;
  }
  store.setCell(TABLE.days, day, 'note', text);
}
