import type { Id, JournalEntry } from './types'

export function lastDone(journal: JournalEntry[], activityId: Id): JournalEntry | null {
  let latest: JournalEntry | null = null
  for (const entry of journal) {
    if (entry.activityId !== activityId) continue
    if (latest === null || entry.loggedAt > latest.loggedAt) latest = entry
  }
  return latest
}
