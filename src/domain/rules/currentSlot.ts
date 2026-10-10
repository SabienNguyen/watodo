import type { DayRecord, Id, JournalEntry, Snapshot, TemplateItem } from './types'

/** A log this recent keeps the position on the slot it was logged in. */
export const STAY_MS = 60 * 60 * 1000

export interface Position { item: TemplateItem; reason: 'chosen' | 'stayed' | 'advanced' | 'first' }

function byPosition(a: TemplateItem, b: TemplateItem): number {
  return a.position - b.position
}

export function itemsOf(snap: Snapshot, templateId: Id): TemplateItem[] {
  return snap.items.filter(item => item.templateId === templateId).sort(byPosition)
}

export function slotsOf(items: TemplateItem[]): TemplateItem[] {
  return items.filter(item => item.kind === 'slot').sort(byPosition)
}

/** The slot an entry was logged in: the one named by its itemId, else the first slot of its section. */
function slotOf(slots: TemplateItem[], entry: JournalEntry): TemplateItem | undefined {
  return slots.find(slot => slot.id === entry.itemId)
    ?? slots.find(slot => slot.sectionId === entry.sectionId)
}

/**
 * Where the user is in today's template, worked out from what they last did, not from the clock.
 * `todaysEntries` are the journal entries of the day; `record` is that day's record, if any.
 */
export function positionAt(
  items: TemplateItem[], todaysEntries: JournalEntry[], record: DayRecord | undefined, at: Date,
): Position | null {
  const slots = slotsOf(items)
  if (slots.length === 0) return null

  let lastLog: { entry: JournalEntry; slot: TemplateItem } | undefined
  for (const entry of todaysEntries) {
    const slot = slotOf(slots, entry)
    if (slot === undefined) continue
    if (lastLog === undefined || entry.loggedAt > lastLog.entry.loggedAt) lastLog = { entry, slot }
  }

  const chosen = slots.find(slot => slot.id === record?.chosenItemId)
  if (chosen !== undefined && (lastLog === undefined || (record?.chosenAt ?? 0) > lastLog.entry.loggedAt)) {
    return { item: chosen, reason: 'chosen' }
  }

  if (lastLog !== undefined) {
    if (at.getTime() - lastLog.entry.loggedAt < STAY_MS) return { item: lastLog.slot, reason: 'stayed' }
    const index = slots.indexOf(lastLog.slot)
    const next = index + 1 < slots.length ? slots[index + 1] : lastLog.slot
    return { item: next, reason: 'advanced' }
  }

  return { item: slots[0], reason: 'first' }
}
