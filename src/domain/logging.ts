import { dayKeyOf, nowView, type DayKey, type Id } from './rules';
import type { Clock } from './clock';
import { readSnapshot, type WatodoStore } from './store';
import { TABLE, writeJournalRow } from './schema';

export interface PendingLog { activityId: Id; sectionId: Id }

export type LogResult =
  | { status: 'logged'; entryId: Id }
  | { status: 'needs-template'; pending: PendingLog; guessTemplateId: Id }
  | { status: 'not-available' };                              // not in a slot, or activity not listed in it

export function logActivity(store: WatodoStore, clock: Clock, activityId: Id): LogResult {
  const now = clock();
  const view = nowView(readSnapshot(store), now);
  const position = view.position;
  if (position === null || position.kind !== 'slot' || view.template === null) {
    return { status: 'not-available' };
  }
  const sectionId = position.item.sectionId;
  const listed = view.activities.some(({ activity }) => activity.id === activityId);
  if (sectionId === undefined || !listed) return { status: 'not-available' };

  if (!view.guess.confirmed) {
    return {
      status: 'needs-template',
      pending: { activityId, sectionId },
      guessTemplateId: view.template.id,
    };
  }
  const entryId = writeJournalRow(store, { activityId, sectionId, loggedAt: now.getTime() });
  return { status: 'logged', entryId };
}

/** Sets today's template, keeping its note. Logs the pending tap when one is given. */
export function confirmDay(store: WatodoStore, clock: Clock, templateId: Id, pending?: PendingLog): Id | null {
  const now = clock();
  const day = dayKeyOf(now);
  return store.transaction(() => {
    store.setCell(TABLE.days, day, 'templateId', templateId);

    const earlyItemId = store.getCell(TABLE.days, day, 'earlyItemId');
    const earlyStillInTemplate = typeof earlyItemId === 'string'
      && store.getCell(TABLE.items, earlyItemId, 'templateId') === templateId;
    if (earlyItemId !== undefined && !earlyStillInTemplate) {
      store.delCell(TABLE.days, day, 'earlyItemId');
    }

    if (pending === undefined) return null;
    return writeJournalRow(store, {
      activityId: pending.activityId, sectionId: pending.sectionId, loggedAt: now.getTime(),
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

/** In a fixed step or a gap, starts the next slot early for today. */
export function endStepEarly(store: WatodoStore, clock: Clock): boolean {
  const view = nowView(readSnapshot(store), clock());
  const position = view.position;
  if (position === null || position.kind === 'slot' || position.next === null) return false;
  store.setCell(TABLE.days, view.day, 'earlyItemId', position.next.id);
  return true;
}

export function deleteEntry(store: WatodoStore, entryId: Id): void {
  store.delRow(TABLE.journal, entryId);
}

export function addPastEntry(
  store: WatodoStore,
  input: { activityId: Id; sectionId: Id; at: Date; note?: string; durationMinutes?: number },
): Id {
  return writeJournalRow(store, {
    activityId: input.activityId,
    sectionId: input.sectionId,
    loggedAt: input.at.getTime(),
    note: input.note,
    durationMinutes: input.durationMinutes,
  });
}

export function editEntry(
  store: WatodoStore,
  entryId: Id,
  patch: { at?: Date; note?: string; durationMinutes?: number | null },
): void {
  if (!store.hasRow(TABLE.journal, entryId)) return;
  store.transaction(() => {
    if (patch.at !== undefined) store.setCell(TABLE.journal, entryId, 'loggedAt', patch.at.getTime());
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
