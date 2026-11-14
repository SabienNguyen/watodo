import { dayKeyOf } from './dayRollover'
import { activityName } from './names'
import type { Bond, DayKey, Id, JournalEntry, Snapshot } from './types'

export const MAX_RANK = 10
const RECENT_LIMIT = 10

/** The number of entries that reaches a rank: n(n+1)/2. */
export function rankThreshold(rank: number): number {
  return rank * (rank + 1) / 2
}

/** The largest rank n (at most MAX_RANK) with n(n+1)/2 entries or fewer. 0 for no entries. */
export function rankOf(count: number): number {
  let rank = 0
  while (rank < MAX_RANK && rankThreshold(rank + 1) <= count) rank++
  return rank
}

/** The journal entries a bond has. Company rows for deleted entries are ignored, and a repeated row counts once. */
function entriesOfBond(snap: Snapshot, bondId: Id): JournalEntry[] {
  const journal = new Map(snap.journal.map(entry => [entry.id, entry]))
  const entries = new Map<Id, JournalEntry>()
  for (const row of snap.company) {
    if (row.bondId !== bondId) continue
    const entry = journal.get(row.entryId)
    if (entry !== undefined) entries.set(entry.id, entry)
  }
  return [...entries.values()]
}

function latestOf(entries: JournalEntry[]): JournalEntry | null {
  let latest: JournalEntry | null = null
  for (const entry of entries) {
    if (latest === null || entry.loggedAt > latest.loggedAt) latest = entry
  }
  return latest
}

function byPosition(a: Bond, b: Bond): number {
  return a.position - b.position
}

function byName(a: Bond, b: Bond): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

/** Newest first; a bond never seen goes after every seen one. Two never seen are equal. */
function bySeen(a: BondSummary, b: BondSummary): number {
  if (a.lastSeen === null || b.lastSeen === null) {
    if (a.lastSeen === null && b.lastSeen === null) return 0
    return a.lastSeen === null ? 1 : -1
  }
  return b.lastSeen.loggedAt - a.lastSeen.loggedAt
}

/** The live or deleted bonds of the entry, by bond position. A repeated row gives the bond once. */
export function entryBonds(snap: Snapshot, entryId: Id): Bond[] {
  const bondIds = new Set(snap.company.filter(row => row.entryId === entryId).map(row => row.bondId))
  return [...bondIds].flatMap(bondId => {
    const bond = snap.bonds.find(row => row.id === bondId) ?? snap.removed.bonds.find(row => row.id === bondId)
    return bond === undefined ? [] : [bond]
  }).sort(byPosition)
}

export interface BondSummary {
  bond: Bond
  count: number
  rank: number
  /** Entries since this rank's threshold, and entries from this rank to the next. Null at MAX_RANK. */
  next: { have: number; need: number } | null
  /** The bond's latest entry. */
  lastSeen: JournalEntry | null
}

function summarize(snap: Snapshot, bond: Bond): BondSummary {
  const entries = entriesOfBond(snap, bond.id)
  const count = entries.length
  const rank = rankOf(count)
  const next = rank === MAX_RANK
    ? null
    : { have: count - rankThreshold(rank), need: rankThreshold(rank + 1) - rankThreshold(rank) }
  return { bond, count, rank, next, lastSeen: latestOf(entries) }
}

/** Live bonds by rank (highest first), then most recently seen, then name. */
export function bondSummaries(snap: Snapshot): BondSummary[] {
  return snap.bonds
    .map(bond => summarize(snap, bond))
    .sort((a, b) => b.rank - a.rank || bySeen(a, b) || byName(a.bond, b.bond))
}

export interface BondPage extends BondSummary {
  /** Activities done with the bond, by count (most first), then name. */
  together: { activityName: string; count: number }[]
  /** Newest first, at most RECENT_LIMIT. */
  recent: { entry: JournalEntry; day: DayKey; activityName: string }[]
}

/** The page of a live bond, or null when there is no live bond with that id. */
export function bondPage(snap: Snapshot, bondId: Id): BondPage | null {
  const bond = snap.bonds.find(row => row.id === bondId)
  if (bond === undefined) return null
  const entries = entriesOfBond(snap, bond.id)
  const counts = new Map<Id, number>()
  for (const entry of entries) counts.set(entry.activityId, (counts.get(entry.activityId) ?? 0) + 1)
  const together = [...counts].map(([activityId, count]) => ({ activityName: activityName(snap, activityId), count }))
  together.sort((a, b) => b.count - a.count || a.activityName.localeCompare(b.activityName, undefined, { sensitivity: 'base' }))
  const recent = [...entries]
    .sort((a, b) => b.loggedAt - a.loggedAt)
    .slice(0, RECENT_LIMIT)
    .map(entry => ({ entry, day: dayKeyOf(new Date(entry.loggedAt)), activityName: activityName(snap, entry.activityId) }))
  return { ...summarize(snap, bond), together, recent }
}

/** Live bonds, most recently seen first; never seen last, by position. */
export function recentBonds(snap: Snapshot): Bond[] {
  return snap.bonds
    .map(bond => summarize(snap, bond))
    .sort((a, b) => bySeen(a, b) || byPosition(a.bond, b.bond))
    .map(summary => summary.bond)
}
