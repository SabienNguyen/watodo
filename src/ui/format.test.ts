// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import type { JournalEntry } from '@/domain'
import { dayLabel, lastDoneText } from './format'

function entryAt(date: Date): JournalEntry {
  return { id: 'entry', activityId: 'gym', sectionId: 'post-work', loggedAt: date.getTime() }
}

// Monday 12 Oct 2026 is the reference "now" for these tests.
const NOW = new Date(2026, 9, 12, 18, 30)

describe('lastDoneText', () => {
  test('never when there is no entry', () => {
    expect(lastDoneText(null, NOW)).toBe('never')
  })

  test('today when the entry is on the same watodo day, with no clock time', () => {
    expect(lastDoneText(entryAt(new Date(2026, 9, 12, 17, 45)), NOW)).toBe('today')
  })

  test('yesterday when the entry is one day earlier', () => {
    expect(lastDoneText(entryAt(new Date(2026, 9, 11, 20, 0)), NOW)).toBe('yesterday')
  })

  test('N days ago for older entries', () => {
    expect(lastDoneText(entryAt(new Date(2026, 9, 9, 12, 0)), NOW)).toBe('3 days ago')
  })

  test('an entry at 00:15 the next calendar morning is today when now is that same watodo day', () => {
    // 00:15 on Tue 13 Oct belongs to Mon 12 Oct, so on Mon 12 Oct at 23:00 it is today.
    const mondayLate = new Date(2026, 9, 12, 23, 0)
    expect(lastDoneText(entryAt(new Date(2026, 9, 13, 0, 15)), mondayLate)).toBe('today')
  })

  test('a 00:15 entry is yesterday once the next watodo day has started', () => {
    // 00:15 on Tue 13 Oct belongs to Mon 12 Oct, so on Tue 13 Oct at 10:00 it is yesterday.
    const tuesdayMorning = new Date(2026, 9, 13, 10, 0)
    expect(lastDoneText(entryAt(new Date(2026, 9, 13, 0, 15)), tuesdayMorning)).toBe('yesterday')
  })
})

describe('dayLabel', () => {
  test('formats a day key as weekday, day, month', () => {
    expect(dayLabel('2026-10-12')).toBe('Mon 12 Oct')
  })
})
