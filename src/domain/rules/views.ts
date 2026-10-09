import { addDays, dayKeyOf, dayMinutesOf } from './dayRollover'
import { guessTemplate, type TemplateGuess } from './guess'
import { itemsOf, positionAt, type Position } from './currentSlot'
import { lastDone } from './lastDone'
import type {
  Activity, DayKey, DayMinutes, DayRecord, Id, JournalEntry, Snapshot, Template, TemplateItem,
} from './types'

export interface NowView {
  day: DayKey; minutes: DayMinutes
  guess: TemplateGuess; template: Template | null
  position: Position | null;                                     // null when there is no template
  activities: { activity: Activity; lastDone: JournalEntry | null }[]; // listing order; empty unless in a slot
}

export interface FullDayView {
  template: Template | null
  items: { item: TemplateItem; current: boolean; activities: Activity[] }[]; // activities empty for fixed steps
}

export interface JournalDay { day: DayKey; templateId: Id | null; note: string; entries: JournalEntry[] }

export interface ProgressView {
  byActivity: { activityId: Id; count: number }[];               // count desc, zero counts omitted
  bySection: { sectionId: Id; count: number }[]
}

/** The activities listed in a section, in listing position order. */
export function sectionActivities(snap: Snapshot, sectionId: Id): Activity[] {
  return snap.listings
    .filter(listing => listing.sectionId === sectionId)
    .sort((a, b) => a.position - b.position)
    .flatMap(listing => {
      const activity = snap.activities.find(a => a.id === listing.activityId)
      return activity ? [activity] : []
    })
}

function dayRecordFor(snap: Snapshot, day: DayKey): DayRecord | undefined {
  return snap.days.find(record => record.day === day)
}

function dayOfEntry(entry: JournalEntry): DayKey {
  return dayKeyOf(new Date(entry.loggedAt))
}

export function nowView(snap: Snapshot, at: Date): NowView {
  const day = dayKeyOf(at)
  const minutes = dayMinutesOf(at)
  const guess = guessTemplate(snap, day)
  const template = guess.templateId === null
    ? null
    : (snap.templates.find(t => t.id === guess.templateId) ?? null)
  if (template === null) {
    return { day, minutes, guess, template: null, position: null, activities: [] }
  }

  const earlyItemId = dayRecordFor(snap, day)?.earlyItemId
  const position = positionAt(itemsOf(snap, template.id), minutes, earlyItemId)
  const sectionId = position.kind === 'slot' ? position.item.sectionId : undefined
  const activities = sectionId === undefined
    ? []
    : sectionActivities(snap, sectionId).map(activity => ({
      activity,
      lastDone: lastDone(snap.journal, activity.id),
    }))

  return { day, minutes, guess, template, position, activities }
}

export function fullDayView(snap: Snapshot, at: Date): FullDayView {
  const now = nowView(snap, at)
  if (now.template === null) return { template: null, items: [] }

  const position = now.position
  const currentId = position !== null && position.kind !== 'gap' ? position.item.id : null
  const items = itemsOf(snap, now.template.id).map(item => ({
    item,
    current: item.id === currentId,
    activities: item.kind === 'slot' && item.sectionId !== undefined
      ? sectionActivities(snap, item.sectionId)
      : [],
  }))
  return { template: now.template, items }
}

export function journalByDay(snap: Snapshot): JournalDay[] {
  const entriesByDay = new Map<DayKey, JournalEntry[]>()
  for (const entry of snap.journal) {
    const day = dayOfEntry(entry)
    const list = entriesByDay.get(day)
    if (list) list.push(entry)
    else entriesByDay.set(day, [entry])
  }
  for (const record of snap.days) {
    if (record.note && !entriesByDay.has(record.day)) entriesByDay.set(record.day, [])
  }

  const recordByDay = new Map<DayKey, DayRecord>(snap.days.map(record => [record.day, record]))
  const newestFirst = [...entriesByDay.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  return newestFirst.map(day => {
    const record = recordByDay.get(day)
    const entries = [...entriesByDay.get(day)!].sort((a, b) => a.loggedAt - b.loggedAt)
    return { day, templateId: record?.templateId ?? null, note: record?.note ?? '', entries }
  })
}

function countsDescending(counts: Map<Id, number>): [Id, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

export function progress(snap: Snapshot, fromDay: DayKey, toDay: DayKey): ProgressView {
  const byActivity = new Map<Id, number>()
  const bySection = new Map<Id, number>()
  for (const entry of snap.journal) {
    const day = dayOfEntry(entry)
    if (day < fromDay || day > toDay) continue
    byActivity.set(entry.activityId, (byActivity.get(entry.activityId) ?? 0) + 1)
    bySection.set(entry.sectionId, (bySection.get(entry.sectionId) ?? 0) + 1)
  }
  return {
    byActivity: countsDescending(byActivity).map(([activityId, count]) => ({ activityId, count })),
    bySection: countsDescending(bySection).map(([sectionId, count]) => ({ sectionId, count })),
  }
}

export function dotStrip(snap: Snapshot, activityId: Id, endDay: DayKey, days = 28): boolean[] {
  const doneDays = new Set(
    snap.journal.filter(entry => entry.activityId === activityId).map(dayOfEntry),
  )
  return Array.from({ length: days }, (_, i) => doneDays.has(addDays(endDay, i - (days - 1))))
}
