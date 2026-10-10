import type { DayKey } from './types'

/** A day starts at 04:00 local time; minutes before it belong to the previous day. */
export const DAY_START_MINUTES = 240

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

function parseDay(day: DayKey): { year: number; monthIndex: number; date: number } {
  const [year, month, date] = day.split('-').map(Number)
  return { year, monthIndex: month - 1, date }
}

function formatDay(year: number, monthIndex: number, date: number): DayKey {
  return `${pad(year, 4)}-${pad(monthIndex + 1)}-${pad(date)}`
}

export function dayKeyOf(at: Date): DayKey {
  const clockMinutes = at.getHours() * 60 + at.getMinutes()
  const beforeDayStart = clockMinutes < DAY_START_MINUTES ? 1 : 0
  return addDays(formatDay(at.getFullYear(), at.getMonth(), at.getDate()), -beforeDayStart)
}

/** 0 = Monday .. 6 = Sunday. */
export function weekdayOf(day: DayKey): number {
  const { year, monthIndex, date } = parseDay(day)
  return (new Date(year, monthIndex, date).getDay() + 6) % 7
}

export function addDays(day: DayKey, n: number): DayKey {
  const { year, monthIndex, date } = parseDay(day)
  const shifted = new Date(year, monthIndex, date + n)
  return formatDay(shifted.getFullYear(), shifted.getMonth(), shifted.getDate())
}

/** Local 12:00 on the calendar day: well inside the day, so dayKeyOf(noonOf(day)) is day. */
export function noonOf(day: DayKey): Date {
  const { year, monthIndex, date } = parseDay(day)
  return new Date(year, monthIndex, date, 12, 0)
}
