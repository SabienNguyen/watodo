import { describe, expect, test } from 'vitest'
import { STAY_MS, itemsOf, positionAt, slotDisplayNames, slotsOf } from './currentSlot'
import type { DayRecord, JournalEntry, Snapshot, TemplateItem } from './types'

const NOW = new Date(2026, 9, 12, 18, 0)
const minutesAgo = (minutes: number): Date => new Date(NOW.getTime() - minutes * 60 * 1000)

function fixed(id: string, position: number, name: string): TemplateItem {
  return { id, templateId: 'basic', kind: 'fixed', name, position }
}

function slot(id: string, position: number, name: string, sectionId: string): TemplateItem {
  return { id, templateId: 'basic', kind: 'slot', name, position, sectionId }
}

const morning = fixed('morning', 0, 'Morning')
const work = fixed('work', 1, 'Work')
const postWork = slot('postWork', 2, 'Post work', 'postWork')
const dinner = fixed('dinner', 3, 'Dinner')
const postDinner = slot('postDinner', 4, 'Post dinner', 'postDinner')
const bedtime = slot('bedtime', 5, 'Bedtime', 'bedtime')
const basic: TemplateItem[] = [morning, work, postWork, dinner, postDinner, bedtime]

function entry(id: string, sectionId: string, loggedAt: Date, itemId?: string): JournalEntry {
  return { id, activityId: 'some-activity', sectionId, loggedAt: loggedAt.getTime(), itemId }
}

function record(parts: Partial<DayRecord> = {}): DayRecord {
  return { day: '2026-10-12', ...parts }
}

function snapWith(items: TemplateItem[]): Snapshot {
  return {
    labels: [], templates: [], items, sections: [], activities: [],
    listings: [], journal: [], days: [], defaultTemplateId: null,
  }
}

describe('STAY_MS', () => {
  test('is one hour', () => {
    expect(STAY_MS).toBe(60 * 60 * 1000)
  })
})

describe('itemsOf', () => {
  test('returns only the template items, sorted by position', () => {
    const other: TemplateItem = { ...work, id: 'elsewhere', templateId: 'other', position: 0 }
    const shuffled = [bedtime, other, morning, postWork, work, dinner, postDinner]
    expect(itemsOf(snapWith(shuffled), 'basic').map(i => i.id)).toEqual([
      'morning', 'work', 'postWork', 'dinner', 'postDinner', 'bedtime',
    ])
  })
})

describe('slotsOf', () => {
  test('returns only the slots, sorted by position', () => {
    expect(slotsOf([bedtime, morning, postDinner, work, postWork, dinner]).map(i => i.id)).toEqual([
      'postWork', 'postDinner', 'bedtime',
    ])
  })
})

describe('positionAt', () => {
  test('no entries and no record: the first slot, first', () => {
    expect(positionAt(basic, [], undefined, NOW)).toEqual({ item: postWork, reason: 'first' })
  })

  test('a log in Post work 10 minutes ago: Post work, stayed', () => {
    const entries = [entry('e1', 'postWork', minutesAgo(10), 'postWork')]
    expect(positionAt(basic, entries, undefined, NOW)).toEqual({ item: postWork, reason: 'stayed' })
  })

  test('a log 59 minutes ago is still stayed', () => {
    const entries = [entry('e1', 'postWork', minutesAgo(59), 'postWork')]
    expect(positionAt(basic, entries, undefined, NOW)).toEqual({ item: postWork, reason: 'stayed' })
  })

  test('a log exactly 60 minutes ago advances past the fixed Dinner to Post dinner', () => {
    const entries = [entry('e1', 'postWork', minutesAgo(60), 'postWork')]
    expect(positionAt(basic, entries, undefined, NOW)).toEqual({ item: postDinner, reason: 'advanced' })
  })

  test('a log in Bedtime 3 hours ago stays on Bedtime, advanced', () => {
    const entries = [entry('e1', 'bedtime', minutesAgo(180), 'bedtime')]
    expect(positionAt(basic, entries, undefined, NOW)).toEqual({ item: bedtime, reason: 'advanced' })
  })

  test('two logs: the latest one is used, whatever the order', () => {
    const entries = [
      entry('older', 'bedtime', minutesAgo(300), 'bedtime'),
      entry('latest', 'postDinner', minutesAgo(10), 'postDinner'),
      entry('middle', 'postWork', minutesAgo(90), 'postWork'),
    ]
    expect(positionAt(basic, entries, undefined, NOW)).toEqual({ item: postDinner, reason: 'stayed' })
  })

  test('a chosen slot with no logs: that slot, chosen', () => {
    const rec = record({ chosenItemId: 'bedtime', chosenAt: minutesAgo(5).getTime() })
    expect(positionAt(basic, [], rec, NOW)).toEqual({ item: bedtime, reason: 'chosen' })
  })

  test('a chosen slot with no chosenAt counts as chosen at 0, so a later log wins', () => {
    const rec = record({ chosenItemId: 'bedtime' })
    expect(positionAt(basic, [], rec, NOW)).toEqual({ item: bedtime, reason: 'chosen' })

    const entries = [entry('e1', 'postWork', minutesAgo(10), 'postWork')]
    expect(positionAt(basic, entries, rec, NOW)).toEqual({ item: postWork, reason: 'stayed' })
  })

  test('chosen Post dinner, then a later log in Post work: the log wins, stayed', () => {
    const rec = record({ chosenItemId: 'postDinner', chosenAt: minutesAgo(30).getTime() })
    const entries = [entry('e1', 'postWork', minutesAgo(10), 'postWork')]
    expect(positionAt(basic, entries, rec, NOW)).toEqual({ item: postWork, reason: 'stayed' })
  })

  test('a log in Post work 2 hours ago, then Post work chosen afterwards: chosen', () => {
    const rec = record({ chosenItemId: 'postWork', chosenAt: minutesAgo(5).getTime() })
    const entries = [entry('e1', 'postWork', minutesAgo(120), 'postWork')]
    expect(positionAt(basic, entries, rec, NOW)).toEqual({ item: postWork, reason: 'chosen' })
  })

  test('a chosenItemId naming a fixed step, or nothing in the template, is ignored', () => {
    expect(positionAt(basic, [], record({ chosenItemId: 'work', chosenAt: minutesAgo(5).getTime() }), NOW))
      .toEqual({ item: postWork, reason: 'first' })
    expect(positionAt(basic, [], record({ chosenItemId: 'nope', chosenAt: minutesAgo(5).getTime() }), NOW))
      .toEqual({ item: postWork, reason: 'first' })
  })

  test('an entry with no itemId is matched by its section', () => {
    const entries = [entry('e1', 'postDinner', minutesAgo(10))]
    expect(positionAt(basic, entries, undefined, NOW)).toEqual({ item: postDinner, reason: 'stayed' })
  })

  test('with two slots sharing a section, an itemId picks the named slot', () => {
    const evening: TemplateItem[] = [
      morning,
      slot('eveningA', 1, 'Evening A', 'evening'),
      slot('eveningB', 2, 'Evening B', 'evening'),
    ]
    const byItem = [entry('e1', 'evening', minutesAgo(10), 'eveningB')]
    expect(positionAt(evening, byItem, undefined, NOW)).toEqual({
      item: evening[2], reason: 'stayed',
    })

    const bySection = [entry('e2', 'evening', minutesAgo(10))]
    expect(positionAt(evening, bySection, undefined, NOW)).toEqual({
      item: evening[1], reason: 'stayed',
    })
  })

  test('an entry whose itemId and sectionId match no slot is ignored, even when it is the latest', () => {
    const entries = [
      entry('ghost', 'nowhere', minutesAgo(5), 'nope'),
      entry('real', 'postWork', minutesAgo(90), 'postWork'),
    ]
    expect(positionAt(basic, entries, undefined, NOW)).toEqual({ item: postDinner, reason: 'advanced' })
  })

  test('an itemId naming a fixed step falls back to the section match', () => {
    const entries = [entry('e1', 'postWork', minutesAgo(10), 'dinner')]
    expect(positionAt(basic, entries, undefined, NOW)).toEqual({ item: postWork, reason: 'stayed' })
  })

  test('a template with no slots has no position', () => {
    expect(positionAt([morning, work, dinner], [], undefined, NOW)).toBeNull()
  })
})

describe('slotDisplayNames', () => {
  test('numbers each repeated slot in position order, and leaves fixed steps and single slots plain', () => {
    const items: TemplateItem[] = [
      fixed('morning', 0, 'Morning'),
      slot('a1', 1, 'A', 'a'),
      fixed('lunch', 2, 'Lunch'),
      slot('b1', 3, 'B', 'b'),
      slot('a2', 4, 'A', 'a'),
      fixed('dinner', 5, 'Dinner'),
      slot('a3', 6, 'A', 'a'),
    ]
    expect(Object.fromEntries(slotDisplayNames(items))).toEqual({
      morning: 'Morning',
      a1: 'A #1',
      lunch: 'Lunch',
      b1: 'B',
      a2: 'A #2',
      dinner: 'Dinner',
      a3: 'A #3',
    })
  })

  test('a list with no repeats keeps every plain name', () => {
    expect(Object.fromEntries(slotDisplayNames(basic))).toEqual({
      morning: 'Morning',
      work: 'Work',
      postWork: 'Post work',
      dinner: 'Dinner',
      postDinner: 'Post dinner',
      bedtime: 'Bedtime',
    })
  })

  test('numbering follows position even when the input array is shuffled', () => {
    const shuffled: TemplateItem[] = [
      slot('a3', 6, 'A', 'a'),
      fixed('lunch', 2, 'Lunch'),
      slot('a1', 1, 'A', 'a'),
      slot('a2', 4, 'A', 'a'),
    ]
    expect(Object.fromEntries(slotDisplayNames(shuffled))).toEqual({
      a1: 'A #1',
      lunch: 'Lunch',
      a2: 'A #2',
      a3: 'A #3',
    })
  })
})
