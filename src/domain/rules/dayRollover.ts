import type { DayKey, DayMinutes } from './types'

/** A day starts at 04:00 local time; minutes before it belong to the previous day. */
export const DAY_START_MINUTES = 240
const MINUTES_PER_DAY = 1440

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

/** Minutes since local midnight of the calendar day, before the 04:00 rollover is applied. */
function clockMinutes(at: Date): number {
  return at.getHours() * 60 + at.getMinutes()
}

function rollover(minutes: number): DayMinutes {
  return minutes < DAY_START_MINUTES ? minutes + MINUTES_PER_DAY : minutes
}

export function dayKeyOf(at: Date): DayKey {
  const before4am = clockMinutes(at) < DAY_START_MINUTES ? 1 : 0
  return addDays(formatDay(at.getFullYear(), at.getMonth(), at.getDate()), -before4am)
}

export function dayMinutesOf(at: Date): DayMinutes {
  return rollover(clockMinutes(at))
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

export function dateFromDay(day: DayKey, minutes: DayMinutes): Date {
  const { year, monthIndex, date } = parseDay(day)
  const nextCalendarDay = minutes >= MINUTES_PER_DAY ? 1 : 0
  const clock = minutes % MINUTES_PER_DAY
  return new Date(year, monthIndex, date + nextCalendarDay, Math.floor(clock / 60), clock % 60)
}

export function toDayMinutes(hhmm: string): DayMinutes {
  const [hours, minutes] = hhmm.split(':').map(Number)
  return rollover(hours * 60 + minutes)
}

export function formatDayMinutes(m: DayMinutes): string {
  const clock = m % MINUTES_PER_DAY
  return `${pad(Math.floor(clock / 60))}:${pad(clock % 60)}`
}
