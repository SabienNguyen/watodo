import { DAY_START_MINUTES, addDays, dayKeyOf, daysBetween, weekdayOf } from './dayRollover'
import { entriesBySlot, itemsOf, type Position } from './currentSlot'
import { activityName } from './names'
import { bondSummaries } from './bonds'
import { lastDone } from './lastDone'
import { nowView, sectionsOfActivity, type NowView } from './views'
import { weekStartOf, weekView } from './week'
import type { DayKey, JournalEntry, Snapshot, Template, TemplateItem } from './types'

export type NotifyKind = 'slot' | 'committed' | 'checkIn' | 'rested' | 'bond' | 'recap';

export interface NotifySettings {
  kinds: Record<NotifyKind, boolean>;
  dailyCap: number;                    // 1..10
  quietStart: number; quietEnd: number; // minutes after local midnight, 0..1439; start > end wraps midnight; equal = no quiet hours
}

export const DEFAULT_NOTIFY: NotifySettings = {
  kinds: { slot: true, committed: true, checkIn: true, rested: true, bond: true, recap: true },
  dailyCap: 3,
  quietStart: 1380,
  quietEnd: 480,
}

export interface SentNotification { kind: NotifyKind; key: string; at: number }
export interface DueNotification { kind: NotifyKind; key: string; title: string; body: string; url: string } // url '/', '/?tab=progress' (recap) or '/?tab=bonds'

const MINUTE_MS = 60 * 1000
/** Notifications are spaced at least this far apart, and kinds 1-3 wait this long after a log. */
const SPACING_MS = 20 * MINUTE_MS
/** The same kind of day is looked for this many days back. */
const LOOKBACK_DAYS = 28
/** Fewer samples than this and there is no usual time. */
const MIN_SAMPLES = 3
const SLOT_LATE_MINUTES = 30
const CHECK_IN_LATE_MINUTES = 60
/** A resting activity is due back from its rest days up to this many days past. */
const REST_GRACE_DAYS = 2

interface Context {
  snap: Snapshot; at: Date; today: DayKey; now: NowView; sent: SentNotification[];
  items: TemplateItem[];               // today's template items; empty when there is no template
  sameKind: DayKey[];                  // same kind of day; empty when there is no template today
}

/** The one notification to send now, or null. Pure: `sent` is what was already sent (any age). */
export function dueNotification(snap: Snapshot, at: Date, sent: SentNotification[]): DueNotification | null {
  const settings = snap.notify ?? DEFAULT_NOTIFY
  const today = dayKeyOf(at)
  if (isQuietHour(settings, at)) return null
  if (sent.filter(item => dayKeyOf(new Date(item.at)) === today).length >= settings.dailyCap) return null
  if (sent.some(item => isRecent(at, item.at))) return null

  const now = nowView(snap, at)
  const context: Context = {
    snap, at, today, now, sent,
    items: now.template === null ? [] : itemsOf(snap, now.template.id),
    sameKind: sameKindDays(snap, today, now.template),
  }
  const open = openSlot(now)
  // Kinds 1-3 wait 20 minutes after any log.
  const logJustNow = snap.journal.some(entry => isRecent(at, entry.loggedAt))
  const timed = !logJustNow

  const candidates: [NotifyKind, () => DueNotification[]][] = [
    ['committed', () => (timed ? committedDue(context, open) : [])],
    ['slot', () => (timed ? slotDue(context, open) : [])],
    ['checkIn', () => (timed ? checkInDue(context, open) : [])],
    ['rested', () => restedDue(context)],
    ['bond', () => bondDue(context)],
    ['recap', () => recapDue(context)],
  ]
  const sentKeys = new Set(sent.map(item => item.key))
  for (const [kind, due] of candidates) {
    if (!settings.kinds[kind]) continue
    const found = due().find(item => !sentKeys.has(item.key))
    if (found !== undefined) return found
  }
  return null
}

/** True when `at` is in the quiet hours. A start equal to the end means there are none. */
function isQuietHour(settings: NotifySettings, at: Date): boolean {
  const { quietStart: start, quietEnd: end } = settings
  if (start === end) return false
  const minute = at.getHours() * 60 + at.getMinutes()
  return start < end ? minute >= start && minute < end : minute >= start || minute < end
}

/** True when `ms` (an epoch time) is less than the spacing before `at`. A later time counts as recent too. */
function isRecent(at: Date, ms: number): boolean {
  return at.getTime() - ms < SPACING_MS
}

/** Minutes since 04:00 of the moment's day, so late-night times sort after the evening. */
function dayMinutesOf(at: Date): number {
  const clockMinutes = at.getHours() * 60 + at.getMinutes()
  return (clockMinutes - DAY_START_MINUTES + 1440) % 1440
}

/** The median of the samples, or null when there are fewer than MIN_SAMPLES. */
function median(values: number[]): number | null {
  if (values.length < MIN_SAMPLES) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function templateOf(snap: Snapshot, id: string): Template | undefined {
  return snap.templates.find(template => template.id === id) ?? snap.removed.templates.find(template => template.id === id)
}

/** The entries of one day, oldest first. */
function entriesOn(snap: Snapshot, day: DayKey): JournalEntry[] {
  return snap.journal
    .filter(entry => dayKeyOf(new Date(entry.loggedAt)) === day)
    .sort((a, b) => a.loggedAt - b.loggedAt)
}

/**
 * The 28 days before today whose template has the same label as today's template (live or removed).
 * Empty when there is no template today.
 */
function sameKindDays(snap: Snapshot, today: DayKey, template: Template | null): DayKey[] {
  if (template === null) return []
  const earliest = addDays(today, -LOOKBACK_DAYS)
  return snap.days.flatMap(record => {
    if (record.day < earliest || record.day >= today || record.templateId === undefined) return []
    const recordTemplate = templateOf(snap, record.templateId)
    return recordTemplate?.labelId === template.labelId ? [record.day] : []
  })
}

/** The open slot the position is on: the position's slot, when nothing has spent it. */
function openSlot(now: NowView): { item: TemplateItem; name: string } | null {
  const position: Position | null = now.position
  if (position === null || now.positionName === null) return null
  const slot = now.slots.find(candidate => candidate.item.id === position.item.id)
  if (slot === undefined || slot.spentBy !== null) return null
  return { item: position.item, name: now.positionName }
}

/** The name of the current slot, then its activities joined: `Name: A · B`, or just the name when none show. */
function withActivities(name: string, now: NowView): string {
  const names = now.activities.map(({ activity }) => activity.name)
  return names.length === 0 ? name : `${name}: ${names.join(' · ')}`
}

/** Minutes each logged activity took on the given days: its duration, else the gap to the next log that day. */
function durationSamples(snap: Snapshot, days: DayKey[], activityId: string): number[] {
  return days.flatMap(day => {
    const entries = entriesOn(snap, day)
    return entries.flatMap((entry, index) => {
      if (entry.activityId !== activityId) return []
      if (entry.durationMinutes !== undefined) return [entry.durationMinutes]
      const next = entries[index + 1]
      return next === undefined ? [] : [(next.loggedAt - entry.loggedAt) / MINUTE_MS]
    })
  })
}

function committedDue(context: Context, open: { name: string } | null): DueNotification[] {
  const { snap, at, today, now, sameKind } = context
  if (open === null) return []
  const todays = entriesOn(snap, today)
  const latest = todays[todays.length - 1]
  if (latest === undefined || latest.committed !== true) return []
  const usual = median(durationSamples(snap, sameKind, latest.activityId))
  if (usual === null || at.getTime() < latest.loggedAt + usual * MINUTE_MS) return []
  return [{
    kind: 'committed',
    key: `committed:${latest.id}`,
    title: `Back from ${activityName(snap, latest.activityId)}?`,
    body: withActivities(open.name, now),
    url: '/',
  }]
}

function slotDue(context: Context, open: { item: TemplateItem; name: string } | null): DueNotification[] {
  const { snap, at, today, now, items, sameKind } = context
  if (open === null || now.activities.length === 0) return []
  const sectionId = open.item.sectionId
  if (sectionId === undefined) return []
  if ((entriesBySlot(items, entriesOn(snap, today)).get(open.item.id) ?? []).length > 0) return []

  // The first entry of the slot's section on each same-kind day.
  const usual = median(sameKind.flatMap(day => {
    const first = entriesOn(snap, day).find(entry => entry.sectionId === sectionId)
    return first === undefined ? [] : [dayMinutesOf(new Date(first.loggedAt))]
  }))
  if (usual === null || dayMinutesOf(at) < usual + SLOT_LATE_MINUTES) return []
  return [{
    kind: 'slot',
    key: `slot:${today}:${open.item.id}`,
    title: open.name,
    body: now.activities.map(({ activity }) => activity.name).join(' · '),
    url: '/',
  }]
}

function checkInDue(context: Context, open: { name: string } | null): DueNotification[] {
  const { snap, at, today, now, sent, sameKind } = context
  if (open === null || entriesOn(snap, today).length > 0) return []
  if (sent.some(item => item.key.startsWith(`slot:${today}:`))) return []

  // The first entry of each same-kind day.
  const usual = median(sameKind.flatMap(day => {
    const first = entriesOn(snap, day)[0]
    return first === undefined ? [] : [dayMinutesOf(new Date(first.loggedAt))]
  }))
  if (usual === null || dayMinutesOf(at) < usual + CHECK_IN_LATE_MINUTES) return []
  return [{ kind: 'checkIn', key: `checkIn:${today}`, title: "What's next?", body: withActivities(open.name, now), url: '/' }]
}

function restedDue(context: Context): DueNotification[] {
  const { snap, today } = context
  return snap.activities.flatMap(activity => {
    if (activity.restDays === undefined) return []
    const last = lastDone(snap.journal, activity.id)
    if (last === null) return []
    const daysPast = daysBetween(dayKeyOf(new Date(last.loggedAt)), today) - activity.restDays
    if (daysPast < 0 || daysPast > REST_GRACE_DAYS) return []
    return [{
      kind: 'rested',
      key: `rested:${activity.id}:${last.id}`,
      title: `${activity.name} is back`,
      body: sectionsOfActivity(snap, activity.id, today).map(section => section.name).join(' · '),
      url: '/',
    }]
  })
}

/** How long a gap reads: days up to 13, then whole weeks (rounded down) from 14 days. */
function gapText(days: number): string {
  if (days >= 14) return `${Math.floor(days / 7)} weeks`
  return days === 1 ? '1 day' : `${days} days`
}

function bondDue(context: Context): DueNotification[] {
  const { snap, today } = context
  return bondSummaries(snap).flatMap(({ bond, lastSeen }) => {
    if (bond.catchUpDays === undefined || lastSeen === null) return []
    const days = daysBetween(dayKeyOf(new Date(lastSeen.loggedAt)), today)
    if (days < bond.catchUpDays) return []
    return [{
      kind: 'bond',
      key: `bond:${bond.id}:${lastSeen.id}`,
      title: `It's been ${gapText(days)} since you saw ${bond.name}`,
      body: `Last time: ${activityName(snap, lastSeen.activityId)}`,
      url: '/?tab=bonds',
    }]
  })
}

function recapDue(context: Context): DueNotification[] {
  const { snap, today } = context
  if (weekdayOf(today) !== 0) return []
  const lastWeek = weekStartOf(addDays(today, -7))
  const count = weekView(snap, lastWeek).entries.length
  if (count === 0) return []
  return [{
    kind: 'recap',
    key: `recap:${lastWeek}`,
    title: 'Your week is ready',
    body: count === 1 ? '1 thing done' : `${count} things done`,
    url: '/?tab=progress',
  }]
}
