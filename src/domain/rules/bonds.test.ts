import { describe, expect, test } from 'vitest'
import { at } from '../testing'
import { bondPage, bondSummaries, entryBonds, MAX_RANK, rankOf, rankThreshold, recentBonds } from './bonds'
import { dayKeyOf } from './dayRollover'
import type { Activity, Bond, Company, JournalEntry, Snapshot } from './types'

const activities: Activity[] = [
  { id: 'gym', name: 'Gym', committed: true },
  { id: 'walk', name: 'Walk', committed: false },
  { id: 'read', name: 'Read', committed: false },
]

function snap(parts: Partial<Snapshot> = {}): Snapshot {
  return {
    labels: [], templates: [], items: [], sections: [], activities, listings: [],
    journal: [], days: [], defaultTemplateId: null, bonds: [], company: [],
    removed: { activities: [], sections: [], templates: [], bonds: [] },
    ...parts,
  }
}

function bond(id: string, name: string, position: number): Bond {
  return { id, name, position }
}

/** A journal entry on the day `dayOffset` days from today, at the given local hour. */
function entry(id: string, activityId: string, dayOffset: number, hour = 9): JournalEntry {
  return { id, activityId, sectionId: 'morning', loggedAt: at(hour, 0, dayOffset).getTime() }
}

/** `count` walks with one bond, one a day back from today. */
function walksWith(bondId: string, count: number): { journal: JournalEntry[]; company: Company[] } {
  const journal = Array.from({ length: count }, (_, index) => entry(`${bondId}-${index}`, 'walk', -(index + 1)))
  return { journal, company: journal.map(row => ({ entryId: row.id, bondId })) }
}

describe('rankOf and rankThreshold', () => {
  test('ranks by the triangle numbers, and tops out at MAX_RANK', () => {
    expect(MAX_RANK).toBe(10)
    const ranks = [0, 1, 2, 3, 5, 6, 10, 54, 55, 200].map(count => rankOf(count))
    expect(ranks).toEqual([0, 1, 1, 2, 2, 3, 4, 9, 10, 10])
  })

  test('a rank is reached at n(n+1)/2 entries', () => {
    expect([0, 1, 2, 3, 4, 10].map(rank => rankThreshold(rank))).toEqual([0, 1, 3, 6, 10, 55])
  })
})

describe('bond summaries: next rank', () => {
  test('a bond with no entries has rank 0 and needs 1 more to reach rank 1', () => {
    const [summary] = bondSummaries(snap({ bonds: [bond('alex', 'Alex', 0)] }))
    expect(summary).toMatchObject({ count: 0, rank: 0, next: { have: 0, need: 1 } })
  })

  test('in the middle of a rank, have counts from its threshold and need is the gap to the next', () => {
    // 4 entries: rank 2 (threshold 3), so 1 of the 3 needed for rank 3.
    const { journal, company } = walksWith('alex', 4)
    const [summary] = bondSummaries(snap({ bonds: [bond('alex', 'Alex', 0)], journal, company }))
    expect(summary).toMatchObject({ count: 4, rank: 2, next: { have: 1, need: 3 } })
  })

  test('the top rank has no next', () => {
    const { journal, company } = walksWith('alex', 55)
    const [summary] = bondSummaries(snap({ bonds: [bond('alex', 'Alex', 0)], journal, company }))
    expect(summary).toMatchObject({ count: 55, rank: 10, next: null })
  })
})

describe('one entry with several bonds', () => {
  const jo = bond('jo', 'Jo', 2)
  const alex = bond('alex', 'Alex', 1)
  const sam = bond('sam', 'Sam', 0)
  const oneEntry = snap({
    bonds: [jo, alex, sam],
    journal: [entry('e1', 'gym', -1)],
    company: [{ entryId: 'e1', bondId: 'jo' }, { entryId: 'e1', bondId: 'alex' }, { entryId: 'e1', bondId: 'sam' }],
  })

  test('the entry counts once for each of its three bonds', () => {
    const counts = bondSummaries(oneEntry).map(summary => [summary.bond.id, summary.count])
    expect(counts.sort()).toEqual([['alex', 1], ['jo', 1], ['sam', 1]])
  })

  test('entryBonds returns all three in bond position order', () => {
    expect(entryBonds(oneEntry, 'e1').map(row => row.id)).toEqual(['sam', 'alex', 'jo'])
  })
})

describe('counting entries', () => {
  test('a bond across many entries counts each of them', () => {
    const { journal, company } = walksWith('alex', 3)
    const [summary] = bondSummaries(snap({ bonds: [bond('alex', 'Alex', 0)], journal, company }))
    expect(summary.count).toBe(3)
  })

  test('duplicate company rows for one pair count once', () => {
    const journal = [entry('e1', 'walk', -1)]
    const company = [{ entryId: 'e1', bondId: 'alex' }, { entryId: 'e1', bondId: 'alex' }]
    const alex = bond('alex', 'Alex', 0)
    const s = snap({ bonds: [alex], journal, company })
    expect(bondSummaries(s)[0].count).toBe(1)
    expect(entryBonds(s, 'e1')).toEqual([alex])
  })

  test('company rows pointing at deleted entries are ignored', () => {
    const journal = [entry('e1', 'walk', -1)]
    const company = [{ entryId: 'gone', bondId: 'alex' }, { entryId: 'e1', bondId: 'alex' }]
    const [summary] = bondSummaries(snap({ bonds: [bond('alex', 'Alex', 0)], journal, company }))
    expect(summary.count).toBe(1)
  })
})

describe('bondSummaries order', () => {
  test('rank first, then the most recently seen, then name; never seen last', () => {
    const journal = [
      entry('a1', 'walk', -4), entry('a2', 'walk', -3), entry('a3', 'walk', -2), // Alex: rank 2, last seen 2 days ago
      entry('b1', 'walk', -3), entry('b2', 'walk', -2), entry('b3', 'walk', -1), // Bo: rank 2, last seen yesterday
      entry('c1', 'walk', -9), // Cy: rank 1, last seen 9 days ago
      entry('e1', 'walk', -20), // Eli: rank 1, last seen 20 days ago
    ]
    const company = [
      { entryId: 'a1', bondId: 'alex' }, { entryId: 'a2', bondId: 'alex' }, { entryId: 'a3', bondId: 'alex' },
      { entryId: 'b1', bondId: 'bo' }, { entryId: 'b2', bondId: 'bo' }, { entryId: 'b3', bondId: 'bo' },
      { entryId: 'c1', bondId: 'cy' },
      { entryId: 'e1', bondId: 'eli' },
    ]
    // Dee and Ana have no entries: rank 0, never seen, so by name.
    const bonds = [
      bond('dee', 'Dee', 0), bond('alex', 'Alex', 1), bond('cy', 'Cy', 2),
      bond('bo', 'Bo', 3), bond('ana', 'Ana', 4), bond('eli', 'Eli', 5),
    ]
    const order = bondSummaries(snap({ bonds, journal, company })).map(summary => summary.bond.name)
    expect(order).toEqual(['Bo', 'Alex', 'Cy', 'Eli', 'Ana', 'Dee'])
  })
})

describe('bondPage', () => {
  test('together counts activities by count, then name', () => {
    const journal = [
      entry('e1', 'gym', -3), entry('e2', 'gym', -2), entry('e3', 'walk', -1), entry('e4', 'read', -1),
    ]
    const company = journal.map(row => ({ entryId: row.id, bondId: 'alex' }))
    const page = bondPage(snap({ bonds: [bond('alex', 'Alex', 0)], journal, company }), 'alex')
    expect(page?.together).toEqual([
      { activityName: 'Gym', count: 2 },
      { activityName: 'Read', count: 1 },
      { activityName: 'Walk', count: 1 },
    ])
  })

  test('recent is newest first and capped at 10', () => {
    const { journal, company } = walksWith('alex', 12)
    const page = bondPage(snap({ bonds: [bond('alex', 'Alex', 0)], journal, company }), 'alex')
    expect(page?.recent).toHaveLength(10)
    expect(page?.recent[0].entry.id).toBe('alex-0')
    expect(page?.recent[0].day).toBe(dayKeyOf(at(9, 0, -1)))
    expect(page?.recent[9].entry.id).toBe('alex-9')
  })

  test('carries the summary: count, rank and next', () => {
    const { journal, company } = walksWith('alex', 12)
    const page = bondPage(snap({ bonds: [bond('alex', 'Alex', 0)], journal, company }), 'alex')
    expect(page).toMatchObject({ count: 12, rank: 4, next: { have: 2, need: 5 } })
  })

  test('null for an unknown id', () => {
    expect(bondPage(snap(), 'nobody')).toBeNull()
  })
})

describe('removed bonds', () => {
  test('entryBonds includes removed bonds, by position', () => {
    const old = bond('old', 'Old', 0)
    const alex = bond('alex', 'Alex', 1)
    const s = snap({
      bonds: [alex],
      removed: { activities: [], sections: [], templates: [], bonds: [old] },
      journal: [entry('e1', 'walk', -1)],
      company: [{ entryId: 'e1', bondId: 'alex' }, { entryId: 'e1', bondId: 'old' }],
    })
    expect(entryBonds(s, 'e1')).toEqual([old, alex])
    expect(bondSummaries(s).map(summary => summary.bond.id)).toEqual(['alex'])
  })
})

describe('recentBonds', () => {
  test('most recently seen first; never seen last, by position', () => {
    const journal = [entry('a1', 'walk', -1), entry('s1', 'walk', -5)]
    const company = [{ entryId: 'a1', bondId: 'alex' }, { entryId: 's1', bondId: 'sam' }]
    const s = snap({
      bonds: [bond('mo', 'Mo', 3), bond('sam', 'Sam', 1), bond('jo', 'Jo', 0), bond('alex', 'Alex', 2)],
      journal,
      company,
    })
    expect(recentBonds(s).map(row => row.id)).toEqual(['alex', 'sam', 'jo', 'mo'])
  })
})
