import type { DayRecord, Id, JournalEntry, Snapshot, TemplateItem } from './types'

/** A log this recent keeps the position on the slot it was logged in. */
export const STAY_MS = 60 * 60 * 1000

export interface Position {
  item: TemplateItem;
  reason: 'chosen' | 'stayed' | 'advanced' | 'first';
  spentBy: JournalEntry | null;          // set only when a spent slot is chosen: the entry that spent it
}

function byPosition(a: TemplateItem, b: TemplateItem): number {
  return a.position - b.position
}

export function itemsOf(snap: Snapshot, templateId: Id): TemplateItem[] {
  return snap.items.filter(item => item.templateId === templateId).sort(byPosition)
}

export function slotsOf(items: TemplateItem[]): TemplateItem[] {
  return items.filter(item => item.kind === 'slot').sort(byPosition)
}

/**
 * The name each item of one template is shown by. A slot whose section is used by more than one slot
 * of the template gets ' #1', ' #2', … in position order. Fixed steps and single slots keep their name.
 */
export function slotDisplayNames(items: TemplateItem[]): Map<Id, string> {
  const ordered = [...items].sort(byPosition)
  const uses = new Map<Id, number>()
  for (const slot of slotsOf(ordered)) {
    if (slot.sectionId !== undefined) uses.set(slot.sectionId, (uses.get(slot.sectionId) ?? 0) + 1)
  }

  const numbered = new Map<Id, number>()
  const names = new Map<Id, string>()
  for (const item of ordered) {
    const sectionId = item.kind === 'slot' ? item.sectionId : undefined
    if (sectionId === undefined || (uses.get(sectionId) ?? 0) < 2) {
      names.set(item.id, item.name)
      continue
    }
    const n = (numbered.get(sectionId) ?? 0) + 1
    numbered.set(sectionId, n)
    names.set(item.id, `${item.name} #${n}`)
  }
  return names
}

/** The slot an entry was logged in: the one named by its itemId, else the first slot of its section. */
export function slotOf(slots: TemplateItem[], entry: JournalEntry): TemplateItem | undefined {
  return slots.find(slot => slot.id === entry.itemId)
    ?? slots.find(slot => slot.sectionId === entry.sectionId)
}

/**
 * Today's entries by the slot item they belong to (via slotOf), each list oldest first. Entries that map to no
 * slot are left out.
 */
export function entriesBySlot(items: TemplateItem[], todaysEntries: JournalEntry[]): Map<Id, JournalEntry[]> {
  const slots = slotsOf(items)
  const bySlot = new Map<Id, JournalEntry[]>()
  for (const entry of [...todaysEntries].sort((a, b) => a.loggedAt - b.loggedAt)) {
    const slot = slotOf(slots, entry)
    if (slot === undefined) continue
    const list = bySlot.get(slot.id)
    if (list) list.push(entry)
    else bySlot.set(slot.id, [entry])
  }
  return bySlot
}

/**
 * The committed entry that spent each slot, by slot item id. Where several committed entries are in one
 * slot, the latest is reported.
 */
export function spentSlots(items: TemplateItem[], todaysEntries: JournalEntry[]): Map<Id, JournalEntry> {
  const slots = slotsOf(items)
  const spent = new Map<Id, JournalEntry>()
  for (const entry of todaysEntries) {
    if (entry.committed !== true) continue
    const slot = slotOf(slots, entry)
    if (slot === undefined) continue
    const current = spent.get(slot.id)
    if (current === undefined || entry.loggedAt > current.loggedAt) spent.set(slot.id, entry)
  }
  return spent
}

/**
 * Where a log that moves the position on lands, from the slot it was logged in (`base`): the first unspent
 * slot after it; else `base` itself while unspent (a quick log with nothing unspent after it stays put);
 * else the first unspent slot anywhere; else null.
 */
function advanceFrom(slots: TemplateItem[], spent: Map<Id, JournalEntry>, base: TemplateItem): TemplateItem | null {
  const index = slots.indexOf(base)
  const after = slots.slice(index + 1).find(slot => !spent.has(slot.id))
  if (after !== undefined) return after
  if (!spent.has(base.id)) return base
  return slots.find(slot => !spent.has(slot.id)) ?? null
}

/**
 * Where the user is in today's template, worked out from what they last did, not from the clock.
 * `todaysEntries` are the journal entries of the day; `record` is that day's record, if any.
 * A committed log moves the position on at once; a quick log moves it on after an hour. Spent slots are skipped.
 */
export function positionAt(
  items: TemplateItem[], todaysEntries: JournalEntry[], record: DayRecord | undefined, at: Date,
): Position | null {
  const slots = slotsOf(items)
  if (slots.length === 0) return null

  const spent = spentSlots(items, todaysEntries)

  let lastLog: { entry: JournalEntry; slot: TemplateItem } | undefined
  for (const entry of todaysEntries) {
    const slot = slotOf(slots, entry)
    if (slot === undefined) continue
    if (lastLog === undefined || entry.loggedAt > lastLog.entry.loggedAt) lastLog = { entry, slot }
  }

  const chosen = slots.find(slot => slot.id === record?.chosenItemId)
  if (chosen !== undefined && (lastLog === undefined || (record?.chosenAt ?? 0) > lastLog.entry.loggedAt)) {
    return { item: chosen, reason: 'chosen', spentBy: spent.get(chosen.id) ?? null }
  }

  if (lastLog !== undefined) {
    const { entry, slot: base } = lastLog
    if (entry.committed === true || at.getTime() - entry.loggedAt >= STAY_MS) {
      const next = advanceFrom(slots, spent, base)
      return next === null ? null : { item: next, reason: 'advanced', spentBy: null }
    }
    return { item: base, reason: 'stayed', spentBy: null }
  }

  const first = slots.find(slot => !spent.has(slot.id))
  return first === undefined ? null : { item: first, reason: 'first', spentBy: null }
}
