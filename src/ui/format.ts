import { dayKeyOf, weekdayOf, type DayKey, type JournalEntry } from '@/domain'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MS_PER_DAY = 24 * 60 * 60 * 1000

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Whole days from one day key to another (to minus from), using calendar days in UTC so DST cannot skew it. */
function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY)
}

export function lastDoneText(entry: JournalEntry | null, now: Date): string {
  if (entry === null) return 'never'
  const days = daysBetween(dayKeyOf(new Date(entry.loggedAt)), dayKeyOf(now))
  if (days <= 0) return `today ${timeOf(entry)}`
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

/** '2026-10-12' -> 'Mon 12 Oct'. */
export function dayLabel(day: DayKey): string {
  const [, month, date] = day.split('-').map(Number)
  const weekday = WEEKDAYS[weekdayOf(day)]
  return `${weekday} ${date} ${MONTHS[month - 1]}`
}

/** Local HH:MM of when the entry was logged. */
export function timeOf(entry: JournalEntry): string {
  const at = new Date(entry.loggedAt)
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`
}
