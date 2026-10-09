import type { DayMinutes, Id, Snapshot, TemplateItem } from './types'

export type Position =
  | { kind: 'slot'; item: TemplateItem; early: boolean }
  | { kind: 'fixed'; item: TemplateItem; next: TemplateItem | null }
  | { kind: 'gap'; next: TemplateItem | null }

export function itemsOf(snap: Snapshot, templateId: Id): TemplateItem[] {
  return snap.items
    .filter(item => item.templateId === templateId)
    .sort((a, b) => a.start - b.start)
}

/** The slot with the earliest start after `minutes`, or null. */
function nextSlot(items: TemplateItem[], minutes: DayMinutes): TemplateItem | null {
  let next: TemplateItem | null = null
  for (const item of items) {
    if (item.kind !== 'slot' || item.start <= minutes) continue
    if (next === null || item.start < next.start) next = item
  }
  return next
}

export function positionAt(items: TemplateItem[], minutes: DayMinutes, earlyItemId?: Id): Position {
  if (earlyItemId !== undefined) {
    const early = items.find(item => item.id === earlyItemId && item.kind === 'slot')
    if (early && minutes < early.end) {
      return { kind: 'slot', item: early, early: minutes < early.start }
    }
  }

  const current = items.find(item => item.start <= minutes && minutes < item.end)
  const next = nextSlot(items, minutes)
  if (!current) return { kind: 'gap', next }
  if (current.kind === 'slot') return { kind: 'slot', item: current, early: false }
  return { kind: 'fixed', item: current, next }
}
