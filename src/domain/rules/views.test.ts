import { describe, expect, test } from 'vitest'
import {
  dotStrip, entrySlotName, fullDayView, journalByDay, journalDay, nowView, progress, sectionActivities,
  templatesUsingSection,
} from './views'
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
  { id: 'gym', name: 'Gym' },
  { id: 'walk', name: 'Walk' },
  { id: 'read', name: 'Read' },
  { id: 'guitar', name: 'Guitar' },
  { id: 'call', name: 'Call family' },
  { id: 'journal', name: 'Journal' },
  { id: 'stretch', name: 'Stretch' },
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
    expect(view.position).toEqual({ item: postWork, reason: 'first' })
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

    expect(view.position).toEqual({ item: postDinner, reason: 'advanced' })
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
    expect(view.position).toEqual({ item: bedtime, reason: 'stayed' })
    expect(view.activities.map(a => [a.activity.name, a.lastDone?.id ?? null])).toEqual([
      ['Journal', null],
      ['Stretch', null],
      ['Read', 'lateLog'],
    ])
  })

  test('a slot chosen by hand today is the position', () => {
    const days: DayRecord[] = [
      { day: '2026-10-12', templateId: 'basic', chosenItemId: 'bedtime', chosenAt: at(2026, OCT, 12, 17, 0).getTime() },
    ]
    const view = nowView(fixture({ days }), at(2026, OCT, 12, 18, 0))

    expect(view.position).toEqual({ item: bedtime, reason: 'chosen' })
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
      'Morning routine', 'Free time #1', 'Lunch', 'Free time #2', 'Dinner', 'Post dinner', 'Bedtime',
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
    }
    expect(templatesUsingSection(snap, 'x').map(template => template.id)).toEqual(['a', 'c'])
    expect(templatesUsingSection(snap, 'y').map(template => template.id)).toEqual(['b'])
    expect(templatesUsingSection(snap, 'nowhere')).toEqual([])
  })
})
