import { addDays, dayKeyOf, daysBetween } from './dayRollover'
import { guessTemplate, type TemplateGuess } from './guess'
import {
  entriesBySlot, itemsOf, positionAt, slotDisplayNames, slotOf, slotsOf, spanOf, spentSlots, type Position,
} from './currentSlot'
import { activityName, sectionName } from './names'
import { lastDone } from './lastDone'
import type {
  Activity, DayKey, DayRecord, Id, JournalEntry, Listing, Section, Snapshot, Template, TemplateItem,
} from './types'

export interface NowView {
  day: DayKey;
  guess: TemplateGuess; template: Template | null;
  // today's slots in order; empty when there is no template. spentBy is set on a slot that a committed entry spent.
  slots: { item: TemplateItem; displayName: string; spentBy: { entry: JournalEntry; activityName: string } | null }[];
  position: Position | null;             // null when there is no template, it has no slots, or every slot is spent
  positionName: string | null;           // display name of position.item
  dayDone: boolean;                      // the template has slots and position is null: every slot is spent
  // of the current slot's section, minus what is logged in this slot occurrence today and what is resting; empty when it is spent
  activities: { activity: Activity; lastDone: JournalEntry | null }[];
  emptied: boolean;                     // the current slot is open, its section lists activities, and `activities` is empty
  nextSlot: { item: TemplateItem; displayName: string } | null; // first unspent slot after the current one; null when none or no position
  // when the position is an open slot: it, then each following slot until the first spent one; else empty
  spanChoices: { item: TemplateItem; displayName: string }[];
}

export interface FullDayView {
  template: Template | null
  items: {
    item: TemplateItem; displayName: string; current: boolean;
    insideSpan: boolean;                                     // after the first slot of a committed span, up to and including its last slot
    activities: Activity[];                                  // listed activities; empty for fixed steps
    logged: { entry: JournalEntry; activityName: string }[]; // today's entries in this slot occurrence, oldest first; empty for fixed steps
  }[];
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

/** True when the listing is in its slot on `day`: it is for good, or `day` is no later than its until. */
export function listingActive(listing: Listing, day: DayKey): boolean {
  return listing.until === undefined || day <= listing.until
}

/** The activities listed in a section, in listing position order. With `day`, only the listings active on that day. */
export function sectionActivities(snap: Snapshot, sectionId: Id, day?: DayKey): Activity[] {
  return snap.listings
    .filter(listing => listing.sectionId === sectionId && (day === undefined || listingActive(listing, day)))
    .sort((a, b) => a.position - b.position)
    .flatMap(listing => {
      const activity = snap.activities.find(a => a.id === listing.activityId)
      return activity ? [activity] : []
    })
}

/** The slots that list an activity, in section position order. With `day`, only the listings active on that day. */
export function sectionsOfActivity(snap: Snapshot, activityId: Id, day?: DayKey): Section[] {
  const listed = new Set(
    snap.listings
      .filter(listing => listing.activityId === activityId && (day === undefined || listingActive(listing, day)))
      .map(listing => listing.sectionId),
  )
  return snap.sections
    .filter(section => listed.has(section.id))
    .sort((a, b) => a.position - b.position)
}

/** The activities active in a section on `day`, in listing order, each with the day it leaves the slot (null for good). */
export function sectionListings(snap: Snapshot, sectionId: Id, day: DayKey): { activity: Activity; until: DayKey | null }[] {
  return snap.listings
    .filter(listing => listing.sectionId === sectionId && listingActive(listing, day))
    .sort((a, b) => a.position - b.position)
    .flatMap(listing => {
      const activity = snap.activities.find(a => a.id === listing.activityId)
      return activity ? [{ activity, until: listing.until ?? null }] : []
    })
}

/** The live activities, minus the temporary ones that no listing has active on `day`. */
export function shownActivities(snap: Snapshot, day: DayKey): Activity[] {
  return snap.activities.filter(activity => !activity.temporary
    || snap.listings.some(listing => listing.activityId === activity.id && listingActive(listing, day)))
}

function dayRecordFor(snap: Snapshot, day: DayKey): DayRecord | undefined {
  return snap.days.find(record => record.day === day)
}

function dayOfEntry(entry: JournalEntry): DayKey {
  return dayKeyOf(new Date(entry.loggedAt))
}

/** The activity a spent slot was spent on, by name (a deleted activity keeps its name). */
function spentByOf(snap: Snapshot, entry: JournalEntry | undefined): NowView['slots'][number]['spentBy'] {
  if (entry === undefined) return null
  return { entry, activityName: activityName(snap, entry.activityId) }
}

/** A resting activity: it was last logged less than its rest days ago, as of `day`. */
function isResting(activity: Activity, last: JournalEntry | null, day: DayKey): boolean {
  return activity.restDays !== undefined && last !== null && daysBetween(dayOfEntry(last), day) < activity.restDays
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
      emptied: false, nextSlot: null, spanChoices: [],
    }
  }

  const items = itemsOf(snap, template.id)
  const names = slotDisplayNames(items)
  const displayName = (item: TemplateItem) => names.get(item.id) ?? item.name
  const todaysEntries = snap.journal.filter(entry => dayOfEntry(entry) === day)
  const spent = spentSlots(items, todaysEntries)
  const position = positionAt(items, todaysEntries, dayRecordFor(snap, day), at)
  const open = position !== null && !spent.has(position.item.id)

  const sectionId = position?.item.sectionId
  const listed = open && sectionId !== undefined ? sectionActivities(snap, sectionId, day) : []
  const loggedHere = new Set(
    (position === null ? [] : entriesBySlot(items, todaysEntries).get(position.item.id) ?? [])
      .map(entry => entry.activityId),
  )
  const activities = listed
    .filter(activity => !loggedHere.has(activity.id))
    .map(activity => ({ activity, lastDone: lastDone(snap.journal, activity.id) }))
    .filter(({ activity, lastDone: last }) => !isResting(activity, last, day))
  const emptied = open && listed.length > 0 && activities.length === 0

  const orderedSlots = slotsOf(items)
  const slots = orderedSlots.map(item => ({
    item,
    displayName: displayName(item),
    spentBy: spentByOf(snap, spent.get(item.id)),
  }))
  const positionName = position === null ? null : displayName(position.item)
  const dayDone = slots.length > 0 && position === null
  const after = position === null
    ? undefined
    : orderedSlots.slice(orderedSlots.findIndex(slot => slot.id === position.item.id) + 1)
      .find(slot => !spent.has(slot.id))
  const nextSlot = after === undefined ? null : { item: after, displayName: displayName(after) }
  const spanChoices: NowView['spanChoices'] = []
  if (open) {
    for (const slot of orderedSlots.slice(orderedSlots.findIndex(candidate => candidate.id === position.item.id))) {
      if (spent.has(slot.id)) break
      spanChoices.push({ item: slot, displayName: displayName(slot) })
    }
  }
  return {
    day, guess, template, slots, position, positionName, dayDone, activities, emptied, nextSlot, spanChoices,
  }
}

/**
 * The ids of the items that a committed span covers after its first slot, up to and including its last
 * slot: the later slots and the fixed steps between them.
 */
function spanInteriorIds(items: TemplateItem[], todaysEntries: JournalEntry[]): Set<Id> {
  const interior = new Set<Id>()
  for (const entry of todaysEntries) {
    if (entry.committed !== true) continue
    const span = spanOf(items, entry)
    if (span.length < 2) continue
    const first = items.indexOf(span[0])
    const last = items.indexOf(span[span.length - 1])
    for (const item of items.slice(first + 1, last + 1)) interior.add(item.id)
  }
  return interior
}

export function fullDayView(snap: Snapshot, at: Date): FullDayView {
  const now = nowView(snap, at)
  if (now.template === null) return { template: null, items: [] }

  const currentId = now.position?.item.id
  const items = itemsOf(snap, now.template.id)
  const names = slotDisplayNames(items)
  const todaysEntries = snap.journal.filter(entry => dayOfEntry(entry) === now.day)
  const loggedBySlot = entriesBySlot(items, todaysEntries)
  const insideSpan = spanInteriorIds(items, todaysEntries)
  return {
    template: now.template,
    items: items.map(item => ({
      item,
      displayName: names.get(item.id) ?? item.name,
      current: item.kind === 'slot' && item.id === currentId,
      insideSpan: insideSpan.has(item.id),
      activities: item.kind === 'slot' && item.sectionId !== undefined
        ? sectionActivities(snap, item.sectionId, now.day)
        : [],
      logged: (loggedBySlot.get(item.id) ?? []).map(entry => ({
        entry,
        activityName: activityName(snap, entry.activityId),
      })),
    })),
  }
}

/**
 * The slot an entry was logged in, by its display name: its item's name within the item's own template
 * when the item still exists, else its section's name (a deleted section keeps its name), else '(removed)'.
 */
export function entrySlotName(snap: Snapshot, entry: JournalEntry): string {
  const item = snap.items.find(candidate => candidate.id === entry.itemId)
  if (item !== undefined) {
    const items = itemsOf(snap, item.templateId)
    const names = slotDisplayNames(items)
    const span = spanOf(items, entry)
    if (span.length > 1) {
      return `${names.get(span[0].id) ?? span[0].name} – ${names.get(span[span.length - 1].id) ?? span[span.length - 1].name}`
    }
    return names.get(item.id) ?? item.name
  }
  return sectionName(snap, entry.sectionId)
}

/**
 * The slots a committed entry may run through, in order: its own slot, then each following slot of its day's
 * template until the first one spent by another entry of that day. Empty for quick entries, entries whose slot
 * cannot be found, and when the entry does not exist.
 */
export function throughChoices(snap: Snapshot, entryId: Id): { item: TemplateItem; displayName: string }[] {
  const entry = snap.journal.find(candidate => candidate.id === entryId)
  if (entry === undefined || entry.committed !== true) return []
  const day = dayOfEntry(entry)
  const named = snap.items.find(item => item.id === entry.itemId)
  const templateId = named?.templateId ?? dayRecordFor(snap, day)?.templateId
  if (templateId === undefined) return []

  const items = itemsOf(snap, templateId)
  const slots = slotsOf(items)
  const own = slotOf(slots, entry)
  if (own === undefined) return []
  const others = snap.journal.filter(other => other.id !== entryId && dayOfEntry(other) === day)
  const spent = spentSlots(items, others)
  const names = slotDisplayNames(items)

  const choices = [{ item: own, displayName: names.get(own.id) ?? own.name }]
  for (const slot of slots.slice(slots.indexOf(own) + 1)) {
    if (spent.has(slot.id)) break
    choices.push({ item: slot, displayName: names.get(slot.id) ?? slot.name })
  }
  return choices
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
