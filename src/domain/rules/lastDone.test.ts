import { describe, expect, test } from 'vitest'
import { lastDone } from './lastDone'
import type { JournalEntry } from './types'

function entry(id: string, activityId: string, loggedAt: number): JournalEntry {
  return { id, activityId, sectionId: 'postWork', loggedAt }
}

describe('lastDone', () => {
  test('returns the entry with the greatest loggedAt', () => {
    const journal = [entry('mid', 'gym', 200), entry('latest', 'gym', 300), entry('early', 'gym', 100)]
    expect(lastDone(journal, 'gym')).toEqual(entry('latest', 'gym', 300))
  })

  test('ignores entries for other activities', () => {
    const journal = [entry('gym', 'gym', 100), entry('walk', 'walk', 999)]
    expect(lastDone(journal, 'gym')?.id).toBe('gym')
  })

  test('returns null when the activity has never been done', () => {
    expect(lastDone([entry('walk', 'walk', 999)], 'gym')).toBeNull()
    expect(lastDone([], 'gym')).toBeNull()
  })
})
