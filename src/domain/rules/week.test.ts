import { describe, expect, test } from 'vitest'
import { weekStartOf, weekView } from './week'
import { at } from '../testing'
import { dayKeyOf } from './dayRollover'
import type { Activity, JournalEntry, Snapshot } from './types'

function snapWith(journal: JournalEntry[], activities: Activity[] = [], removed: Activity[] = []): Snapshot {
  return {
    labels: [], templates: [], items: [], sections: [], listings: [], days: [], defaultTemplateId: null,
    activities, journal,
    removed: { activities: removed, sections: [], templates: [] },
  }
}

function entry(id: string, activityId: string, loggedAt: Date): JournalEntry {
  return { id, activityId, sectionId: 'any', loggedAt: loggedAt.getTime() }
}

describe('weekStartOf', () => {
  test('a Monday starts its own week', () => {
    expect(weekStartOf('2026-10-12')).toBe('2026-10-12')
  })

  test('a Sunday belongs to the Monday six days before it', () => {
    expect(weekStartOf('2026-10-18')).toBe('2026-10-12')
  })

  test('a Saturday belongs to the Monday five days before it', () => {
    expect(weekStartOf('2026-10-17')).toBe('2026-10-12')
  })

  test('a log at 00:30 Monday belongs to Sunday, so to last week', () => {
    const day = dayKeyOf(at(0, 30))
    expect(day).toBe('2026-10-11')
    expect(weekStartOf(day)).toBe('2026-10-05')
  })
})

describe('weekView', () => {
  test('starts on the given Monday and ends six days later', () => {
    const view = weekView(snapWith([]), '2026-10-05')
    expect(view.start).toBe('2026-10-05')
    expect(view.end).toBe('2026-10-11')
    expect(view.entries).toEqual([])
  })

  test('keeps the entries of the seven days and no others, oldest first', () => {
    const journal = [
      entry('late-sunday', 'read', at(21, 0, -1)),   // Sun 11 Oct
      entry('before', 'read', at(23, 0, -8)),        // Sun 4 Oct
      entry('monday-early', 'walk', at(5, 0, -7)),   // Mon 5 Oct
      entry('next-monday', 'walk', at(9, 0)),        // Mon 12 Oct
      entry('after-midnight', 'walk', at(0, 30)),    // belongs to Sun 11 Oct
    ]
    const view = weekView(snapWith(journal), '2026-10-05')
    expect(view.entries.map(row => row.entry.id)).toEqual(['monday-early', 'late-sunday', 'after-midnight'])
    expect(view.entries.map(row => row.day)).toEqual(['2026-10-05', '2026-10-11', '2026-10-11'])
  })

  test('names each entry by its activity, including a removed one', () => {
    const journal = [entry('old', 'gone', at(10, 0, -6)), entry('new', 'walk', at(10, 0, -5))]
    const activities: Activity[] = [{ id: 'walk', name: 'Walk', committed: false }]
    const removed: Activity[] = [{ id: 'gone', name: 'Old run', committed: false }]
    const view = weekView(snapWith(journal, activities, removed), '2026-10-05')
    expect(view.entries.map(row => row.activityName)).toEqual(['Old run', 'Walk'])
  })
})
