import { addDays, dayKeyOf, weekdayOf } from './dayRollover'
import { activityName } from './names'
import type { DayKey, JournalEntry, Snapshot } from './types'

/** The Monday that starts the week a day belongs to. */
export function weekStartOf(day: DayKey): DayKey {
  return addDays(day, -weekdayOf(day))
}

export interface WeekView {
  start: DayKey; end: DayKey;                                 // end = start + 6
  entries: { entry: JournalEntry; day: DayKey; activityName: string }[]; // every entry whose day is in the week, oldest first
}

/** The entries of the seven days from `start` (a Monday). An entry's day is its day after the 04:00 rollover. */
export function weekView(snap: Snapshot, start: DayKey): WeekView {
  const end = addDays(start, 6)
  const entries = snap.journal.flatMap(entry => {
    const day = dayKeyOf(new Date(entry.loggedAt))
    if (day < start || day > end) return []
    return [{ entry, day, activityName: activityName(snap, entry.activityId) }]
  })
  entries.sort((a, b) => a.entry.loggedAt - b.entry.loggedAt)
  return { start, end, entries }
}
