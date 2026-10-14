import { describe, expect, test } from 'vitest'
import {
  dotStrip, entrySlotName, fullDayView, journalByDay, journalDay, nowView, progress, sectionActivities,
  sectionsOfActivity, templatesUsingSection,
} from './views'
import type { NowView } from './views'
import type {
  Activity, DayRecord, JournalEntry, Listing, Section, Snapshot, Template, TemplateDraft, TemplateItem,
} from './types'
import { draftFromStarter } from './starters'
import { confirmDay, goToSlot } from '../logging'
import { finishSetup, setUpStarter } from '../setup'
import { createWatodoStore, readSnapshot, type WatodoStore } from '../store'
import { saveTemplate } from '../templates'

const at = (year: number, month: number, day: number, hours: number, minutes: number) =>
  new Date(year, month, day, hours, minutes)
const OCT = 9 // monthIndex for October

const sections: Section[] = [
  { id: 'postWork', name: 'Post work', position: 0 },
  { id: 'postDinner', name: 'Post dinner', position: 1 },
  { id: 'bedtime', name: 'Bedtime', position: 2 },
]

const activities: Activity[] = [
  { id: 'gym', name: 'Gym', committed: false },
  { id: 'walk', name: 'Walk', committed: false },
  { id: 'read', name: 'Read', committed: false },
  { id: 'guitar', name: 'Guitar', committed: false },
  { id: 'call', name: 'Call family', committed: false },
  { id: 'journal', name: 'Journal', committed: false },
  { id: 'stretch', name: 'Stretch', committed: false },
]

const listings: Listing[] = [
  { sectionId: 'postWork', activityId: 'gym', position: 0 },
  { sectionId: 'postWork', activityId: 'walk', position: 1 },
  { sectionId: 'postWork', activityId: 'read', position: 2 },
  { sectionId: 'postDinner', activityId: 'guitar', position: 0 },
  { sectionId: 'postDinner', activityId: 'call', position: 1 },
  { sectionId: 'postDinner', activityId: 'read', position: 2 },
  { sectionId: 'bedtime', activityId: 'journal', position: 0 },
  { sectionId: 'bedtime', activityId: 'stretch', position: 1 },
  { sectionId: 'bedtime', activityId: 'read', position: 2 },
]

function fixed(id: string, position: number, name: string, templateId = 'basic'): TemplateItem {
  return { id, templateId, kind: 'fixed', name, position }
}

function slot(id: string, position: number, name: string, sectionId: string, templateId = 'basic'): TemplateItem {
  return { id, templateId, kind: 'slot', name, position, sectionId }
}

const wake = fixed('wake', 0, 'Wake up')
const work = fixed('work', 1, 'Work')
const postWork = slot('postWork', 2, 'Post work', 'postWork')
const dinner = fixed('dinner', 3, 'Dinner')
const postDinner = slot('postDinner', 4, 'Post dinner', 'postDinner')
const bedtime = slot('bedtime', 5, 'Bedtime', 'bedtime')
const nightSnack = slot('nightSnack', 0, 'Night snack', 'bedtime', 'late')

const basicItems = [wake, work, postWork, dinner, postDinner, bedtime]

function fixture(parts: Partial<Snapshot> = {}): Snapshot {
  return {
    labels: [{ id: 'work', name: 'Work day', weekdays: [0, 1, 2, 3, 4], position: 0 }],
    templates: [
      { id: 'basic', name: 'Basic day', labelId: 'work', position: 0 },
      { id: 'late', name: 'Late', labelId: 'work', position: 1 },
    ],
    items: [...basicItems, nightSnack],
    sections,
    activities,
    listings,
    journal: [],
    days: [],
    defaultTemplateId: 'basic',
    removed: { activities: [], sections: [], templates: [] },
    ...parts,
  }
}

function entry(id: string, activityId: string, sectionId: string, loggedAt: Date, itemId?: string): JournalEntry {
  return { id, activityId, sectionId, loggedAt: loggedAt.getTime(), itemId }
}

function weekendDraft(snap: Snapshot): TemplateDraft {
  const draft = draftFromStarter(snap, 'weekend')
  if (draft === null) throw new Error('no weekend starter')
  return draft
}

/** The starter store with the Weekend starter saved and confirmed for Mon 12 Oct. Its Free time slot repeats. */
function weekendStore(): WatodoStore {
  const store = createWatodoStore()
  setUpStarter(store)
  finishSetup(store)
  saveTemplate(store, weekendDraft(readSnapshot(store)))
  const weekend = readSnapshot(store).templates.find(template => template.name === 'Weekend')
  if (weekend === undefined) throw new Error('no weekend template')
  confirmDay(store, () => at(2026, OCT, 12, 9, 0), weekend.id)
  return store
}

function freeTimes(snap: Snapshot): TemplateItem[] {
  return snap.items.filter(item => item.name === 'Free time')
}

function sectionIdNamed(snap: Snapshot, name: string): string {
  const section = snap.sections.find(candidate => candidate.name === name)
  if (section === undefined) throw new Error(`no section ${name}`)
  return section.id
}

describe('nowView', () => {
  test('lists the day slots, and with nothing logged today the first slot with its section activities', () => {
    const journal = [
      entry('gymLast', 'gym', 'postWork', at(2026, OCT, 9, 18, 0)),
      entry('readBedtime', 'read', 'bedtime', at(2026, OCT, 11, 21, 0)),
      entry('readDinner', 'read', 'postDinner', at(2026, OCT, 5, 19, 40)),
    ]
    const view = nowView(fixture({ journal }), at(2026, OCT, 12, 18, 0))

    expect(view.day).toBe('2026-10-12')
    expect(view.template?.id).toBe('basic')
    expect(view.slots.map(s => s.item.id)).toEqual(['postWork', 'postDinner', 'bedtime'])
    expect(view.slots.map(s => s.displayName)).toEqual(['Post work', 'Post dinner', 'Bedtime'])
    expect(view.positionName).toBe('Post work')
    expect(view.position).toEqual({ item: postWork, reason: 'first', spentBy: null })
    expect(view.activities.map(a => [a.activity.name, a.lastDone?.id ?? null])).toEqual([
      ['Gym', 'gymLast'],
      ['Walk', null],
      ['Read', 'readBedtime'],
    ])
  })

  test('a log more than an hour old moves on: the next slot and its activities', () => {
    const journal = [
      entry('readBedtime', 'read', 'bedtime', at(2026, OCT, 11, 21, 0)),
      entry('gymToday', 'gym', 'postWork', at(2026, OCT, 12, 16, 30), 'postWork'),
    ]
    const view = nowView(fixture({ journal }), at(2026, OCT, 12, 18, 0))

    expect(view.position).toEqual({ item: postDinner, reason: 'advanced', spentBy: null })
    expect(view.activities.map(a => [a.activity.name, a.lastDone?.id ?? null])).toEqual([
      ['Guitar', null],
      ['Call family', null],
      ['Read', 'readBedtime'],
    ])
  })

  test('a log at 00:15 belongs to the previous day, so a 00:30 view is that day\'s position', () => {
    const days: DayRecord[] = [{ day: '2026-10-12', templateId: 'basic' }]
    const journal = [entry('lateLog', 'read', 'bedtime', at(2026, OCT, 13, 0, 15))]
    const view = nowView(fixture({ journal, days }), at(2026, OCT, 13, 0, 30))

    expect(view.day).toBe('2026-10-12')
    expect(view.position).toEqual({ item: bedtime, reason: 'stayed', spentBy: null })
    // Read was logged in Bedtime today (the 00:15 belongs to 10-12), so it is hidden there
    expect(view.activities.map(a => a.activity.name)).toEqual(['Journal', 'Stretch'])
  })

  test('a slot chosen by hand today is the position', () => {
    const days: DayRecord[] = [
      { day: '2026-10-12', templateId: 'basic', chosenItemId: 'bedtime', chosenAt: at(2026, OCT, 12, 17, 0).getTime() },
    ]
    const view = nowView(fixture({ days }), at(2026, OCT, 12, 18, 0))

    expect(view.position).toEqual({ item: bedtime, reason: 'chosen', spentBy: null })
    expect(view.activities.map(a => a.activity.name)).toEqual(['Journal', 'Stretch', 'Read'])
  })

  test('a template with no slots has no position and no activities', () => {
    const view = nowView(fixture({ items: [wake, work, dinner] }), at(2026, OCT, 12, 18, 0))

    expect(view.template?.id).toBe('basic')
    expect(view.slots).toEqual([])
    expect(view.position).toBeNull()
    expect(view.positionName).toBeNull()
    expect(view.activities).toEqual([])
  })

  test('with no template, there are no slots, no position and no activities', () => {
    const view = nowView(fixture({ labels: [], templates: [], defaultTemplateId: null }), at(2026, OCT, 12, 18, 0))
    expect(view.template).toBeNull()
    expect(view.slots).toEqual([])
    expect(view.position).toBeNull()
    expect(view.positionName).toBeNull()
    expect(view.activities).toEqual([])
  })

  test('on a Weekend template the repeated Free time slots are numbered, and positionName follows the position', () => {
    const store = weekendStore()
    const snap = readSnapshot(store)
    const [first, second] = freeTimes(snap)

    const fresh = nowView(snap, at(2026, OCT, 12, 18, 0))
    expect(fresh.slots.map(s => s.displayName)).toEqual(['Free time #1', 'Free time #2', 'Post dinner', 'Bedtime'])
    expect(fresh.position?.item.id).toBe(first.id)
    expect(fresh.positionName).toBe('Free time #1')

    goToSlot(store, () => at(2026, OCT, 12, 18, 0), second.id)
    const moved = nowView(readSnapshot(store), at(2026, OCT, 12, 18, 5))
    expect(moved.positionName).toBe('Free time #2')
  })

  test('on the basic day the position name is the plain slot name', () => {
    expect(nowView(fixture(), at(2026, OCT, 12, 18, 0)).positionName).toBe('Post work')
  })
})

describe('nowView with committed activities', () => {
  const gymDone = { ...entry('gymDone', 'gym', 'postWork', at(2026, OCT, 12, 17, 45), 'postWork'), committed: true }
  const guitarDone = { ...entry('guitarDone', 'guitar', 'postDinner', at(2026, OCT, 12, 19, 45), 'postDinner'), committed: true }
  const journalDone = { ...entry('journalDone', 'journal', 'bedtime', at(2026, OCT, 12, 21, 45), 'bedtime'), committed: true }

  test('after Gym is committed in Post work: that slot names Gym, and the position is Post dinner with its activities', () => {
    const view = nowView(fixture({ journal: [gymDone] }), at(2026, OCT, 12, 18, 0))

    expect(view.slots.map(s => s.spentBy)).toEqual([{ entry: gymDone, activityName: 'Gym' }, null, null])
    expect(view.position).toEqual({ item: postDinner, reason: 'advanced', spentBy: null })
    expect(view.positionName).toBe('Post dinner')
    expect(view.activities.map(a => a.activity.name)).toEqual(['Guitar', 'Call family', 'Read'])
    expect(view.dayDone).toBe(false)
  })

  test('viewing the spent slot gives no activities, and the position names what spent it', () => {
    const days: DayRecord[] = [
      { day: '2026-10-12', templateId: 'basic', chosenItemId: 'postWork', chosenAt: at(2026, OCT, 12, 17, 50).getTime() },
    ]
    const view = nowView(fixture({ journal: [gymDone], days }), at(2026, OCT, 12, 18, 0))

    expect(view.position).toEqual({ item: postWork, reason: 'chosen', spentBy: gymDone })
    expect(view.positionName).toBe('Post work')
    expect(view.activities).toEqual([])
    expect(view.dayDone).toBe(false)
  })

  test('a spending entry whose activity no longer exists is named (removed)', () => {
    const gone = { ...entry('gone', 'gone', 'postWork', at(2026, OCT, 12, 17, 45), 'postWork'), committed: true }
    const view = nowView(fixture({ journal: [gone] }), at(2026, OCT, 12, 18, 0))

    expect(view.slots[0].spentBy?.activityName).toBe('(removed)')
  })

  test('dayDone is true once every slot is spent, with no position and no activities', () => {
    const view = nowView(fixture({ journal: [gymDone, guitarDone, journalDone] }), at(2026, OCT, 12, 22, 0))

    expect(view.dayDone).toBe(true)
    expect(view.position).toBeNull()
    expect(view.positionName).toBeNull()
    expect(view.activities).toEqual([])
    expect(view.slots.every(s => s.spentBy !== null)).toBe(true)
  })

  test('dayDone is false while only some slots are spent', () => {
    const view = nowView(fixture({ journal: [gymDone, guitarDone] }), at(2026, OCT, 12, 22, 0))
    expect(view.dayDone).toBe(false)
  })

  test('dayDone is false while a spent slot is being viewed, even when every slot is spent', () => {
    const days: DayRecord[] = [
      { day: '2026-10-12', templateId: 'basic', chosenItemId: 'postWork', chosenAt: at(2026, OCT, 12, 21, 50).getTime() },
    ]
    const view = nowView(fixture({ journal: [gymDone, guitarDone, journalDone], days }), at(2026, OCT, 12, 22, 0))

    expect(view.position?.item.id).toBe('postWork')
    expect(view.position?.spentBy).toBe(gymDone)
    expect(view.dayDone).toBe(false)
  })

  test('a template with no slots is never dayDone', () => {
    const view = nowView(fixture({ items: [wake, work, dinner] }), at(2026, OCT, 12, 18, 0))
    expect(view.dayDone).toBe(false)
  })

  test('with no template, dayDone is false', () => {
    const view = nowView(fixture({ labels: [], templates: [], defaultTemplateId: null }), at(2026, OCT, 12, 18, 0))
    expect(view.dayDone).toBe(false)
  })
})

describe('fullDayView', () => {
  test('marks only the current slot, lists activities for slots only', () => {
    const view = fullDayView(fixture(), at(2026, OCT, 12, 18, 0))

    expect(view.template?.id).toBe('basic')
    expect(view.items.map(i => [i.item.id, i.current])).toEqual([
      ['wake', false],
      ['work', false],
      ['postWork', true],
      ['dinner', false],
      ['postDinner', false],
      ['bedtime', false],
    ])
    expect(view.items[0].activities).toEqual([])
    expect(view.items[2].activities.map(a => a.name)).toEqual(['Gym', 'Walk', 'Read'])
    expect(view.items[4].activities.map(a => a.name)).toEqual(['Guitar', 'Call family', 'Read'])
  })

  test('the slot the day has moved on to is the current one', () => {
    const journal = [entry('gymToday', 'gym', 'postWork', at(2026, OCT, 12, 16, 30), 'postWork')]
    const view = fullDayView(fixture({ journal }), at(2026, OCT, 12, 18, 0))
    expect(view.items.filter(i => i.current).map(i => i.item.id)).toEqual(['postDinner'])
  })

  test('a template with no slots marks nothing as current', () => {
    const view = fullDayView(fixture({ items: [wake, work, dinner] }), at(2026, OCT, 12, 18, 0))
    expect(view.items.map(i => i.item.id)).toEqual(['wake', 'work', 'dinner'])
    expect(view.items.some(i => i.current)).toBe(false)
  })

  test('with no template, there are no items', () => {
    const view = fullDayView(fixture({ labels: [], templates: [], defaultTemplateId: null }), at(2026, OCT, 12, 18, 0))
    expect(view).toEqual({ template: null, items: [] })
  })

  test('items carry display names, with the repeated Free time numbered in template order', () => {
    const view = fullDayView(readSnapshot(weekendStore()), at(2026, OCT, 12, 18, 0))

    expect(view.items.map(i => i.displayName)).toEqual([
      'Wake up', 'Brush teeth', 'Change clothes', 'Free time #1', 'Lunch', 'Free time #2', 'Dinner', 'Post dinner',
      'Bedtime', 'Brush teeth', 'Sleep',
    ])
    expect(view.items.filter(i => i.current).map(i => i.displayName)).toEqual(['Free time #1'])
  })
})

describe('entrySlotName', () => {
  test('an entry logged in the second Free time is named Free time #2', () => {
    const snap = readSnapshot(weekendStore())
    const [, second] = freeTimes(snap)
    const logged = entry('e1', 'hike', sectionIdNamed(snap, 'Free time'), at(2026, OCT, 12, 18, 0), second.id)

    expect(entrySlotName(snap, logged)).toBe('Free time #2')
  })

  test('an entry logged in the basic day is named by its plain slot name', () => {
    expect(entrySlotName(fixture(), entry('e1', 'gym', 'postWork', at(2026, OCT, 12, 18, 0), 'postWork')))
      .toBe('Post work')
  })

  test('numbering is per template: a section used once in each of two templates is not numbered', () => {
    const snap = fixture()
    const bedtimeOfBasic = entry('e1', 'read', 'bedtime', at(2026, OCT, 12, 18, 0), 'bedtime')
    expect(entrySlotName(snap, bedtimeOfBasic)).toBe('Bedtime')
  })

  test('an entry with no itemId is named by its section', () => {
    const snap = readSnapshot(weekendStore())
    const unlinked = entry('e1', 'hike', sectionIdNamed(snap, 'Free time'), at(2026, OCT, 12, 18, 0))

    expect(entrySlotName(snap, unlinked)).toBe('Free time')
  })

  test('an entry whose item and section are both gone is named (removed)', () => {
    const gone = entry('e1', 'gym', 'nowhere', at(2026, OCT, 12, 18, 0), 'deletedItem')

    expect(entrySlotName(fixture(), gone)).toBe('(removed)')
  })

  test('an entry whose item was deleted but whose section still exists is named by the section', () => {
    const deleted = entry('e1', 'gym', 'postWork', at(2026, OCT, 12, 18, 0), 'deletedItem')

    expect(entrySlotName(fixture(), deleted)).toBe('Post work')
  })
})

describe('journalByDay', () => {
  const e1 = entry('e1', 'gym', 'postWork', at(2026, OCT, 9, 18, 0))
  const e2 = entry('e2', 'walk', 'postWork', at(2026, OCT, 9, 19, 0))
  const e3 = entry('e3', 'read', 'bedtime', at(2026, OCT, 13, 0, 15)) // belongs to 10-12
  const e4 = entry('e4', 'gym', 'postWork', at(2026, OCT, 12, 18, 0))

  test('newest day first, entries oldest first, with the day template and note', () => {
    const days: DayRecord[] = [
      { day: '2026-10-12', templateId: 'basic', note: 'Tired' },
      { day: '2026-10-10', note: 'Rest day' },
      { day: '2026-10-11', templateId: 'basic' }, // touched but no entries and no note: not listed
    ]
    expect(journalByDay(fixture({ journal: [e1, e2, e3, e4], days }))).toEqual([
      { day: '2026-10-12', templateId: 'basic', note: 'Tired', entries: [e4, e3] },
      { day: '2026-10-10', templateId: null, note: 'Rest day', entries: [] },
      { day: '2026-10-09', templateId: null, note: '', entries: [e1, e2] },
    ])
  })
})

describe('journalDay', () => {
  const e1 = entry('e1', 'gym', 'postWork', at(2026, OCT, 9, 18, 0))
  const e2 = entry('e2', 'walk', 'postWork', at(2026, OCT, 12, 19, 0))
  const e3 = entry('e3', 'read', 'bedtime', at(2026, OCT, 13, 0, 15)) // belongs to 10-12
  const e4 = entry('e4', 'gym', 'postWork', at(2026, OCT, 12, 18, 0))

  test('only that day\'s entries, oldest first, with the day record\'s template and note', () => {
    const days: DayRecord[] = [
      { day: '2026-10-12', templateId: 'basic', note: 'Tired' },
      { day: '2026-10-09', templateId: 'late', note: 'Other day' },
    ]
    expect(journalDay(fixture({ journal: [e2, e3, e4, e1], days }), '2026-10-12')).toEqual({
      day: '2026-10-12', templateId: 'basic', note: 'Tired', entries: [e4, e2, e3],
    })
  })

  test('a day with nothing recorded has no entries, an empty note and no template', () => {
    expect(journalDay(fixture({ journal: [e1] }), '2026-10-11')).toEqual({
      day: '2026-10-11', templateId: null, note: '', entries: [],
    })
  })

  test('an entry at 00:15 on the next morning belongs to the earlier day', () => {
    const snap = fixture({ journal: [e3] })
    expect(journalDay(snap, '2026-10-12').entries).toEqual([e3])
    expect(journalDay(snap, '2026-10-13').entries).toEqual([])
  })
})

describe('progress', () => {
  const journal: JournalEntry[] = [
    entry('p1', 'gym', 'postWork', at(2026, OCT, 6, 18, 0)), // in: first day of range
    entry('p2', 'gym', 'postWork', at(2026, OCT, 12, 18, 0)), // in: last day of range
    entry('p3', 'gym', 'postWork', at(2026, OCT, 13, 0, 15)), // in: belongs to 10-12
    entry('p4', 'walk', 'postWork', at(2026, OCT, 6, 19, 0)), // in
    entry('p5', 'walk', 'postWork', at(2026, OCT, 5, 23, 30)), // out: before range
    entry('p6', 'read', 'bedtime', at(2026, OCT, 13, 4, 0)), // out: after range
    entry('p7', 'read', 'bedtime', at(2026, OCT, 6, 21, 0)), // in
    entry('p8', 'walk', 'postWork', at(2026, OCT, 7, 18, 0)), // in
    entry('p9', 'call', 'postDinner', at(2026, OCT, 20, 20, 0)), // out: nothing in range for call
  ]

  test('counts within an inclusive range, sorted by count, omitting zero counts', () => {
    expect(progress(fixture({ journal }), '2026-10-06', '2026-10-12')).toEqual({
      byActivity: [
        { activityId: 'gym', count: 3 },
        { activityId: 'walk', count: 2 },
        { activityId: 'read', count: 1 },
      ],
      bySection: [
        { sectionId: 'postWork', count: 5 },
        { sectionId: 'bedtime', count: 1 },
      ],
    })
  })
})

describe('dotStrip', () => {
  const journal: JournalEntry[] = [
    entry('a', 'gym', 'postWork', at(2026, 8, 15, 18, 0)), // 2026-09-15
    entry('b', 'gym', 'postWork', at(2026, OCT, 11, 18, 0)), // 2026-10-11
    entry('c', 'gym', 'postWork', at(2026, OCT, 13, 0, 15)), // belongs to 2026-10-12
    entry('d', 'walk', 'postWork', at(2026, OCT, 12, 18, 0)), // other activity
  ]

  test('returns one value per day ending at endDay, oldest first', () => {
    expect(dotStrip(fixture({ journal }), 'gym', '2026-10-12', 3)).toEqual([false, true, true])
  })

  test('defaults to 28 days', () => {
    const strip = dotStrip(fixture({ journal }), 'gym', '2026-10-12')
    expect(strip).toHaveLength(28)
    expect(strip[0]).toBe(true) // 2026-09-15
    expect(strip[26]).toBe(true) // 2026-10-11
    expect(strip[27]).toBe(true) // 2026-10-12
    expect(strip.filter(Boolean)).toHaveLength(3)
  })
})

describe('sectionActivities', () => {
  test('lists the section activities in listing position order, whatever the array order', () => {
    const shuffled: Snapshot = fixture({
      listings: [
        { sectionId: 'postWork', activityId: 'read', position: 2 },
        { sectionId: 'postWork', activityId: 'gym', position: 0 },
        { sectionId: 'postDinner', activityId: 'guitar', position: 0 },
        { sectionId: 'postWork', activityId: 'walk', position: 1 },
      ],
    })
    expect(sectionActivities(shuffled, 'postWork').map(a => a.name)).toEqual(['Gym', 'Walk', 'Read'])
  })

  test('an unknown section gives an empty array', () => {
    expect(sectionActivities(fixture(), 'nope')).toEqual([])
  })
})

describe('templatesUsingSection', () => {
  test('lists the templates with a slot of the section by position, each once even when it uses it twice', () => {
    const templates: Template[] = [
      { id: 'c', name: 'C', labelId: 'work', position: 2 },
      { id: 'b', name: 'B', labelId: 'work', position: 1 },
      { id: 'a', name: 'A', labelId: 'work', position: 0 },
    ]
    const items: TemplateItem[] = [
      { id: 'c1', templateId: 'c', kind: 'slot', name: 'Free time', position: 0, sectionId: 'x' },
      { id: 'b1', templateId: 'b', kind: 'slot', name: 'Other', position: 0, sectionId: 'y' },
      { id: 'a1', templateId: 'a', kind: 'slot', name: 'Free time', position: 0, sectionId: 'x' },
      { id: 'a2', templateId: 'a', kind: 'slot', name: 'Free time', position: 1, sectionId: 'x' },
      { id: 'a3', templateId: 'a', kind: 'fixed', name: 'Dinner', position: 2 },
    ]
    const snap: Snapshot = {
      labels: [], templates, items, sections: [], activities: [],
      listings: [], journal: [], days: [], defaultTemplateId: null,
      removed: { activities: [], sections: [], templates: [] },
    }
    expect(templatesUsingSection(snap, 'x').map(template => template.id)).toEqual(['a', 'c'])
    expect(templatesUsingSection(snap, 'y').map(template => template.id)).toEqual(['b'])
    expect(templatesUsingSection(snap, 'nowhere')).toEqual([])
  })
})

describe('sectionsOfActivity', () => {
  test('lists the slots that list the activity in section position order, whatever the array order', () => {
    const snap = fixture({ sections: [...sections].reverse() })
    expect(sectionsOfActivity(snap, 'read').map(section => section.name)).toEqual(['Post work', 'Post dinner', 'Bedtime'])
  })

  test('an activity no slot lists gives an empty array', () => {
    const snap = fixture({ activities: [...activities, { id: 'yoga', name: 'Yoga', committed: false }] })
    expect(sectionsOfActivity(snap, 'yoga')).toEqual([])
  })
})

function activityNamed(snap: Snapshot, name: string): Activity {
  const activity = snap.activities.find(candidate => candidate.name === name)
  if (activity === undefined) throw new Error(`no activity ${name}`)
  return activity
}

function namesIn(view: NowView): string[] {
  return view.activities.map(row => row.activity.name)
}

describe('nowView: what is left in a slot', () => {
  test('an activity logged in this slot today is hidden from it', () => {
    const journal = [entry('gymHere', 'gym', 'postWork', at(2026, OCT, 12, 17, 45), 'postWork')]
    const view = nowView(fixture({ journal }), at(2026, OCT, 12, 18, 0))

    expect(view.position?.item.id).toBe('postWork')
    expect(namesIn(view)).toEqual(['Walk', 'Read'])
  })

  test('an activity logged in one section still shows in another section', () => {
    const journal = [entry('readHere', 'read', 'postWork', at(2026, OCT, 12, 17, 45), 'postWork')]
    expect(namesIn(nowView(fixture({ journal }), at(2026, OCT, 12, 18, 0)))).toEqual(['Gym', 'Walk'])

    const days: DayRecord[] = [
      { day: '2026-10-12', templateId: 'basic', chosenItemId: 'postDinner', chosenAt: at(2026, OCT, 12, 17, 50).getTime() },
    ]
    expect(namesIn(nowView(fixture({ journal, days }), at(2026, OCT, 12, 18, 0)))).toEqual(['Guitar', 'Call family', 'Read'])
  })

  test('in a repeated slot, an activity logged in one occurrence still shows in the other', () => {
    const store = weekendStore()
    const snap = readSnapshot(store)
    const [first, second] = freeTimes(snap)
    const hike = activityNamed(snap, 'Hike')
    const hikedInFirst = entry('hike1', hike.id, sectionIdNamed(snap, 'Free time'), at(2026, OCT, 12, 16, 30), first.id)

    goToSlot(store, () => at(2026, OCT, 12, 17, 0), first.id)
    const inFirst = nowView({ ...readSnapshot(store), journal: [hikedInFirst] }, at(2026, OCT, 12, 17, 5))
    expect(inFirst.positionName).toBe('Free time #1')
    expect(inFirst.activities.map(row => row.activity.id)).not.toContain(hike.id)

    goToSlot(store, () => at(2026, OCT, 12, 17, 10), second.id)
    const inSecond = nowView({ ...readSnapshot(store), journal: [hikedInFirst] }, at(2026, OCT, 12, 17, 15))
    expect(inSecond.positionName).toBe('Free time #2')
    expect(inSecond.activities.map(row => row.activity.id)).toContain(hike.id)
  })

  test('a hand-added entry with no itemId counts toward the first occurrence of its slot', () => {
    const store = weekendStore()
    const snap = readSnapshot(store)
    const [, second] = freeTimes(snap)
    const hike = activityNamed(snap, 'Hike')
    const handAdded = entry('hand', hike.id, sectionIdNamed(snap, 'Free time'), at(2026, OCT, 12, 16, 30))

    const inFirst = nowView({ ...snap, journal: [handAdded] }, at(2026, OCT, 12, 17, 0))
    expect(inFirst.positionName).toBe('Free time #1')
    expect(inFirst.activities.map(row => row.activity.id)).not.toContain(hike.id)

    goToSlot(store, () => at(2026, OCT, 12, 16, 45), second.id)
    const inSecond = nowView({ ...readSnapshot(store), journal: [handAdded] }, at(2026, OCT, 12, 17, 0))
    expect(inSecond.positionName).toBe('Free time #2')
    expect(inSecond.activities.map(row => row.activity.id)).toContain(hike.id)
  })

  test('a resting activity is hidden until its rest days have passed', () => {
    const resting = activities.map(activity => (activity.id === 'gym' ? { ...activity, restDays: 30 } : activity))
    const journal = [entry('gymOct1', 'gym', 'postWork', at(2026, OCT, 1, 18, 0), 'postWork')]

    // 29 days after 1 October: still resting
    const days: DayRecord[] = [
      { day: '2026-10-30', templateId: 'basic', chosenItemId: 'postWork', chosenAt: at(2026, OCT, 30, 17, 0).getTime() },
    ]
    expect(namesIn(nowView(fixture({ activities: resting, journal, days }), at(2026, OCT, 30, 18, 0))))
      .toEqual(['Walk', 'Read'])

    // 30 days after 1 October: back
    expect(namesIn(nowView(fixture({ activities: resting, journal }), at(2026, OCT, 31, 18, 0))))
      .toEqual(['Gym', 'Walk', 'Read'])
  })

  test('a resting activity that was never logged is shown', () => {
    const resting = activities.map(activity => (activity.id === 'gym' ? { ...activity, restDays: 30 } : activity))
    expect(namesIn(nowView(fixture({ activities: resting }), at(2026, OCT, 12, 18, 0)))).toEqual(['Gym', 'Walk', 'Read'])
  })

  test('emptied is true when every activity of the open slot is logged in it today', () => {
    const journal = [
      entry('g', 'gym', 'postWork', at(2026, OCT, 12, 17, 30), 'postWork'),
      entry('w', 'walk', 'postWork', at(2026, OCT, 12, 17, 40), 'postWork'),
      entry('r', 'read', 'postWork', at(2026, OCT, 12, 17, 50), 'postWork'),
    ]
    const view = nowView(fixture({ journal }), at(2026, OCT, 12, 18, 0))

    expect(view.activities).toEqual([])
    expect(view.emptied).toBe(true)
    expect(view.nextSlot?.displayName).toBe('Post dinner')
  })

  test('emptied is false when the section lists no activities', () => {
    const view = nowView(fixture({ listings: listings.filter(listing => listing.sectionId !== 'postWork') }), at(2026, OCT, 12, 18, 0))

    expect(view.position?.item.id).toBe('postWork')
    expect(view.activities).toEqual([])
    expect(view.emptied).toBe(false)
  })

  test('emptied is false while a spent slot is being viewed', () => {
    const gymDone = { ...entry('gymDone', 'gym', 'postWork', at(2026, OCT, 12, 17, 45), 'postWork'), committed: true }
    const days: DayRecord[] = [
      { day: '2026-10-12', templateId: 'basic', chosenItemId: 'postWork', chosenAt: at(2026, OCT, 12, 17, 50).getTime() },
    ]
    const view = nowView(fixture({ journal: [gymDone], days }), at(2026, OCT, 12, 18, 0))

    expect(view.position?.spentBy).toBe(gymDone)
    expect(view.emptied).toBe(false)
  })

  test('emptied is false when every slot is spent', () => {
    const journal = [
      { ...entry('g', 'gym', 'postWork', at(2026, OCT, 12, 17, 0), 'postWork'), committed: true },
      { ...entry('gu', 'guitar', 'postDinner', at(2026, OCT, 12, 19, 0), 'postDinner'), committed: true },
      { ...entry('j', 'journal', 'bedtime', at(2026, OCT, 12, 21, 0), 'bedtime'), committed: true },
    ]
    expect(nowView(fixture({ journal }), at(2026, OCT, 12, 22, 0)).emptied).toBe(false)
  })

  test('nextSlot skips a spent slot and is the first unspent one after the current slot', () => {
    const guitarDone = { ...entry('guitarDone', 'guitar', 'postDinner', at(2026, OCT, 12, 17, 20), 'postDinner'), committed: true }
    const days: DayRecord[] = [
      { day: '2026-10-12', templateId: 'basic', chosenItemId: 'postWork', chosenAt: at(2026, OCT, 12, 17, 50).getTime() },
    ]
    const view = nowView(fixture({ journal: [guitarDone], days }), at(2026, OCT, 12, 18, 0))

    expect(view.position?.item.id).toBe('postWork')
    expect(view.nextSlot).toEqual({ item: bedtime, displayName: 'Bedtime' })
  })

  test('nextSlot is null after the last slot', () => {
    const days: DayRecord[] = [
      { day: '2026-10-12', templateId: 'basic', chosenItemId: 'bedtime', chosenAt: at(2026, OCT, 12, 17, 50).getTime() },
    ]
    expect(nowView(fixture({ days }), at(2026, OCT, 12, 18, 0)).nextSlot).toBeNull()
  })

  test('nextSlot is null when every slot is spent', () => {
    const journal = [
      { ...entry('g', 'gym', 'postWork', at(2026, OCT, 12, 17, 0), 'postWork'), committed: true },
      { ...entry('gu', 'guitar', 'postDinner', at(2026, OCT, 12, 19, 0), 'postDinner'), committed: true },
      { ...entry('j', 'journal', 'bedtime', at(2026, OCT, 12, 21, 0), 'bedtime'), committed: true },
    ]
    expect(nowView(fixture({ journal }), at(2026, OCT, 12, 22, 0)).nextSlot).toBeNull()
  })

  test('an activity whose name was deleted is still named when it spends a slot', () => {
    const gym = activityNamed(fixture(), 'Gym')
    const gymDone = { ...entry('gymDone', 'gym', 'postWork', at(2026, OCT, 12, 17, 45), 'postWork'), committed: true }
    const view = nowView(fixture({
      activities: activities.filter(activity => activity.id !== 'gym'),
      removed: { activities: [gym], sections: [], templates: [] },
      journal: [gymDone],
    }), at(2026, OCT, 12, 18, 0))

    expect(view.slots[0].spentBy?.activityName).toBe('Gym')
  })
})

describe('fullDayView: logged', () => {
  test('a repeated slot lists its entries per occurrence, oldest first, with activity names', () => {
    const snap = readSnapshot(weekendStore())
    const [first, second] = freeTimes(snap)
    const section = sectionIdNamed(snap, 'Free time')
    const hike = activityNamed(snap, 'Hike')
    const read = activityNamed(snap, 'Read')
    const callFamily = activityNamed(snap, 'Call family')

    const hikeFirst = entry('hikeFirst', hike.id, section, at(2026, OCT, 12, 14, 0), first.id)
    const readSecond = entry('readSecond', read.id, section, at(2026, OCT, 12, 15, 0), second.id)
    const callNoItem = entry('callNoItem', callFamily.id, section, at(2026, OCT, 12, 13, 0))
    const hikeSecond = entry('hikeSecond', hike.id, section, at(2026, OCT, 12, 16, 0), second.id)

    const view = fullDayView({ ...snap, journal: [hikeSecond, hikeFirst, readSecond, callNoItem] }, at(2026, OCT, 12, 18, 0))
    const logged = (displayName: string) => view.items.find(item => item.displayName === displayName)?.logged

    expect(logged('Free time #1')).toEqual([
      { entry: callNoItem, activityName: 'Call family' },
      { entry: hikeFirst, activityName: 'Hike' },
    ])
    expect(logged('Free time #2')).toEqual([
      { entry: readSecond, activityName: 'Read' },
      { entry: hikeSecond, activityName: 'Hike' },
    ])
    expect(logged('Post dinner')).toEqual([])
    expect(logged('Dinner')).toEqual([])
  })

  test('a log of a deleted activity keeps its name', () => {
    const journal = [entry('g', 'gym', 'postWork', at(2026, OCT, 12, 17, 0), 'postWork')]
    const snap = fixture({
      activities: activities.filter(activity => activity.id !== 'gym'),
      removed: { activities: [{ id: 'gym', name: 'Gym', committed: false }], sections: [], templates: [] },
      journal,
    })
    const view = fullDayView(snap, at(2026, OCT, 12, 18, 0))
    expect(view.items.find(item => item.item.id === 'postWork')?.logged.map(row => row.activityName)).toEqual(['Gym'])
  })
})

describe('deleted names in the Journal', () => {
  test('an entry with no item, in a deleted section, keeps the section name', () => {
    const postWork = sections.find(section => section.id === 'postWork')
    if (postWork === undefined) throw new Error('no postWork section')
    const snap = fixture({
      sections: sections.filter(section => section.id !== 'postWork'),
      removed: { activities: [], sections: [postWork], templates: [] },
    })
    expect(entrySlotName(snap, entry('e1', 'gym', 'postWork', at(2026, OCT, 12, 18, 0)))).toBe('Post work')
  })
})
