import { dayKeyOf, daysBetween, weekdayOf, type DayKey, type JournalEntry } from '@/domain'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** When the activity was last done, by watodo day. Never a clock time. */
export function lastDoneText(entry: JournalEntry | null, now: Date): string {
  if (entry === null) return 'never'
  const days = daysBetween(dayKeyOf(new Date(entry.loggedAt)), dayKeyOf(now))
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

/** '2026-10-12' -> 'Mon 12 Oct'. */
export function dayLabel(day: DayKey): string {
  const [, month, date] = day.split('-').map(Number)
  const weekday = WEEKDAYS[weekdayOf(day)]
  return `${weekday} ${date} ${MONTHS[month - 1]}`
}

/** '2026-11-03' -> 'Tue 3'. */
export function shortDayLabel(day: DayKey): string {
  const date = Number(day.split('-')[2])
  return `${WEEKDAYS[weekdayOf(day)]} ${date}`
}

/** '2026-11-02', '2026-11-08' -> '2 – 8 Nov'. Across months: '27 Oct – 2 Nov'. */
export function weekRangeLabel(start: DayKey, end: DayKey): string {
  const [, startMonth, startDate] = start.split('-').map(Number)
  const [, endMonth, endDate] = end.split('-').map(Number)
  const startText = startMonth === endMonth ? `${startDate}` : `${startDate} ${MONTHS[startMonth - 1]}`
  return `${startText} – ${endDate} ${MONTHS[endMonth - 1]}`
}
