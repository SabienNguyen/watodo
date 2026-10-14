import { describe, expect, test } from 'vitest'
import {
  DAY_START_MINUTES,
  addDays,
  dayKeyOf,
  daysBetween,
  noonOf,
  weekdayOf,
} from './dayRollover'

describe('day rollover at 04:00', () => {
  test('the day starts at minute 240', () => {
    expect(DAY_START_MINUTES).toBe(240)
  })

  test('17:45 belongs to the same calendar day', () => {
    expect(dayKeyOf(new Date(2026, 9, 12, 17, 45))).toBe('2026-10-12')
  })

  test('00:15 belongs to the previous calendar day', () => {
    expect(dayKeyOf(new Date(2026, 9, 13, 0, 15))).toBe('2026-10-12')
  })

  test('03:59 still belongs to the previous day', () => {
    expect(dayKeyOf(new Date(2026, 9, 13, 3, 59))).toBe('2026-10-12')
  })

  test('04:00 starts the new day', () => {
    expect(dayKeyOf(new Date(2026, 9, 13, 4, 0))).toBe('2026-10-13')
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

describe('noonOf', () => {
  test('is local 12:00 on that calendar day', () => {
    expect(noonOf('2026-10-12')).toEqual(new Date(2026, 9, 12, 12, 0))
  })

  test('round-trips through dayKeyOf', () => {
    for (const day of ['2026-10-12', '2026-10-01', '2026-02-28', '2026-12-31']) {
      expect(dayKeyOf(noonOf(day))).toBe(day)
    }
  })
})

describe('daysBetween', () => {
  test('counts calendar days, and is 0 for the same day', () => {
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30)
    expect(daysBetween('2026-10-12', '2026-10-12')).toBe(0)
  })

  test('is negative when the second day is earlier', () => {
    expect(daysBetween('2026-10-12', '2026-10-10')).toBe(-2)
  })

  test('crosses a month end, a year end and a leap day', () => {
    expect(daysBetween('2026-12-31', '2027-01-02')).toBe(2)
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
  })

  test('is 2 from 28 March to 30 March 2026', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
  })

  test('is 2 across the US spring clock change (8 March 2026)', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
  })

  test('is 2 across the US autumn clock change (1 November 2026)', () => {
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2)
  })
})
