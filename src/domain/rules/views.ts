import { addDays, dayKeyOf } from './dayRollover'
import { guessTemplate, type TemplateGuess } from './guess'
import { itemsOf, positionAt, slotDisplayNames, slotsOf, spentSlots, type Position } from './currentSlot'
import { lastDone } from './lastDone'
import type {
  Activity, DayKey, DayRecord, Id, JournalEntry, Snapshot, Template, TemplateItem,
} from './types'

export interface NowView {
  day: DayKey;
  guess: TemplateGuess; template: Template | null;
  // today's slots in order; empty when there is no template. spentBy is set on a slot that a committed entry spent.
  slots: { item: TemplateItem; displayName: string; spentBy: { entry: JournalEntry; activityName: string } | null }[];
  position: Position | null;             // null when there is no template, it has no slots, or every slot is spent
  positionName: string | null;           // display name of position.item
  dayDone: boolean;                      // the template has slots and position is null: every slot is spent
  activities: { activity: Activity; lastDone: JournalEntry | null }[]; // of the current slot's section; empty when it is spent
}

export interface FullDayView {
  template: Template | null
  items: { item: TemplateItem; displayName: string; current: boolean; activities: Activity[] }[]; // activities empty for fixed steps
}

export interface JournalDay { day: DayKey; templateId: Id | null; note: string; entries: JournalEntry[] }

export interface ProgressView {
  byActivity: { activityId: Id; count: number }[];               // count desc, zero counts omitted
  bySection: { sectionId: Id; count: number }[]
}

/** The templates that have a slot of this section, in position order, each once. */
export function templatesUsingSection(snap: Snapshot, sectionId: Id): Template[] {
  const using = new Set(
    snap.items
      .filter(item => item.kind === 'slot' && item.sectionId === sectionId)
      .map(item => item.templateId),
  )
  return snap.templates
    .filter(template => using.has(template.id))
    .sort((a, b) => a.position - b.position)
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

/** The activity a spent slot was spent on, by name; '(removed)' when that activity no longer exists. */
function spentByOf(snap: Snapshot, entry: JournalEntry | undefined): NowView['slots'][number]['spentBy'] {
  if (entry === undefined) return null
  const activityName = snap.activities.find(activity => activity.id === entry.activityId)?.name ?? '(removed)'
  return { entry, activityName }
}

export function nowView(snap: Snapshot, at: Date): NowView {
  const day = dayKeyOf(at)
  const guess = guessTemplate(snap, day)
  const template = guess.templateId === null
    ? null
    : (snap.templates.find(t => t.id === guess.templateId) ?? null)
  if (template === null) {
    return {
      day, guess, template: null, slots: [], position: null, positionName: null, dayDone: false, activities: [],
    }
  }

  const items = itemsOf(snap, template.id)
  const names = slotDisplayNames(items)
  const displayName = (item: TemplateItem) => names.get(item.id) ?? item.name
  const todaysEntries = snap.journal.filter(entry => dayOfEntry(entry) === day)
  const spent = spentSlots(items, todaysEntries)
  const position = positionAt(items, todaysEntries, dayRecordFor(snap, day), at)
  const viewingSpent = position !== null && spent.has(position.item.id)
  const sectionId = position?.item.sectionId
  const activities = sectionId === undefined || viewingSpent
    ? []
    : sectionActivities(snap, sectionId).map(activity => ({
      activity,
      lastDone: lastDone(snap.journal, activity.id),
    }))

  const slots = slotsOf(items).map(item => ({
    item,
    displayName: displayName(item),
    spentBy: spentByOf(snap, spent.get(item.id)),
  }))
  const positionName = position === null ? null : displayName(position.item)
  const dayDone = slots.length > 0 && position === null
  return { day, guess, template, slots, position, positionName, dayDone, activities }
}

export function fullDayView(snap: Snapshot, at: Date): FullDayView {
  const now = nowView(snap, at)
  if (now.template === null) return { template: null, items: [] }

  const currentId = now.position?.item.id
  const items = itemsOf(snap, now.template.id)
  const names = slotDisplayNames(items)
  return {
    template: now.template,
    items: items.map(item => ({
      item,
      displayName: names.get(item.id) ?? item.name,
      current: item.kind === 'slot' && item.id === currentId,
      activities: item.kind === 'slot' && item.sectionId !== undefined
        ? sectionActivities(snap, item.sectionId)
        : [],
    })),
  }
}

/**
 * The slot an entry was logged in, by its display name: its item's name within the item's own template
 * when the item still exists, else its section's name, else '(removed)'.
 */
export function entrySlotName(snap: Snapshot, entry: JournalEntry): string {
  const item = snap.items.find(candidate => candidate.id === entry.itemId)
  if (item !== undefined) {
    return slotDisplayNames(itemsOf(snap, item.templateId)).get(item.id) ?? item.name
  }
  return snap.sections.find(section => section.id === entry.sectionId)?.name ?? '(removed)'
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

/** One day: its entries oldest first, and its template and note. Empty when nothing is recorded. */
export function journalDay(snap: Snapshot, day: DayKey): JournalDay {
  const entries = snap.journal
    .filter(entry => dayOfEntry(entry) === day)
    .sort((a, b) => a.loggedAt - b.loggedAt)
  const record = dayRecordFor(snap, day)
  return { day, templateId: record?.templateId ?? null, note: record?.note ?? '', entries }
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
