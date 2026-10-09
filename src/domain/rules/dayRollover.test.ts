import { describe, expect, test } from 'vitest'
import {
  DAY_START_MINUTES,
  addDays,
  dateFromDay,
  dayKeyOf,
  dayMinutesOf,
  formatDayMinutes,
  toDayMinutes,
  weekdayOf,
} from './dayRollover'

describe('day rollover at 04:00', () => {
  test('the day starts at minute 240', () => {
    expect(DAY_START_MINUTES).toBe(240)
  })

  test('17:45 belongs to the same calendar day at minute 1065', () => {
    const at = new Date(2026, 9, 12, 17, 45)
    expect(dayKeyOf(at)).toBe('2026-10-12')
    expect(dayMinutesOf(at)).toBe(1065)
  })

  test('00:15 belongs to the previous calendar day at minute 1455', () => {
    const at = new Date(2026, 9, 13, 0, 15)
    expect(dayKeyOf(at)).toBe('2026-10-12')
    expect(dayMinutesOf(at)).toBe(1455)
  })

  test('03:59 still belongs to the previous day at minute 1679', () => {
    const at = new Date(2026, 9, 13, 3, 59)
    expect(dayKeyOf(at)).toBe('2026-10-12')
    expect(dayMinutesOf(at)).toBe(1679)
  })

  test('04:00 starts the new day at minute 240', () => {
    const at = new Date(2026, 9, 13, 4, 0)
    expect(dayKeyOf(at)).toBe('2026-10-13')
    expect(dayMinutesOf(at)).toBe(240)
  })

  test('00:15 on the 1st belongs to the last day of the previous month', () => {
    expect(dayKeyOf(new Date(2026, 9, 1, 0, 15))).toBe('2026-09-30')
  })
})

describe('weekdayOf (0 = Monday)', () => {
  test('2026-10-12 is a Monday', () => {
    expect(weekdayOf('2026-10-12')).toBe(0)
  })

  test('2026-10-18 is a Sunday', () => {
    expect(weekdayOf('2026-10-18')).toBe(6)
  })
})

describe('addDays', () => {
  test('crosses a month end', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
  })

  test('steps back across a month start', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('dateFromDay', () => {
  test('minute 1065 is 17:45 on that calendar day', () => {
    expect(dateFromDay('2026-10-12', 1065)).toEqual(new Date(2026, 9, 12, 17, 45))
  })

  test('minute 1455 is 00:15 on the following calendar day', () => {
    expect(dateFromDay('2026-10-12', 1455)).toEqual(new Date(2026, 9, 13, 0, 15))
  })

  test('round-trips with dayKeyOf and dayMinutesOf for a 17:45 moment', () => {
    const at = new Date(2026, 9, 12, 17, 45)
    expect(dateFromDay(dayKeyOf(at), dayMinutesOf(at))).toEqual(at)
  })

  test('round-trips with dayKeyOf and dayMinutesOf for a 00:15 moment', () => {
    const at = new Date(2026, 9, 13, 0, 15)
    expect(dateFromDay(dayKeyOf(at), dayMinutesOf(at))).toEqual(at)
  })
})

describe('hh:mm and day minutes', () => {
  test('toDayMinutes maps 17:30 to 1050 and 00:30 to 1470', () => {
    expect(toDayMinutes('17:30')).toBe(1050)
    expect(toDayMinutes('00:30')).toBe(1470)
  })

  test('formatDayMinutes maps 1050 to 17:30 and 1470 to 00:30', () => {
    expect(formatDayMinutes(1050)).toBe('17:30')
    expect(formatDayMinutes(1470)).toBe('00:30')
  })

  test('round-trips for 17:30 and 00:30', () => {
    expect(formatDayMinutes(toDayMinutes('17:30'))).toBe('17:30')
    expect(formatDayMinutes(toDayMinutes('00:30'))).toBe('00:30')
  })
})
