import { itemsOf } from './currentSlot'
import type { DraftStep, Id, Snapshot, TemplateDraft } from './types'

export interface Starter {
  key: string; name: string; labelName: string; labelWeekdays: number[];
  steps: ({ kind: 'fixed'; name: string } | { kind: 'slot'; slotName: string })[];
}

const WORK_DAYS = [0, 1, 2, 3, 4]

const fixed = (name: string) => ({ kind: 'fixed' as const, name })
const slot = (slotName: string) => ({ kind: 'slot' as const, slotName })

export const STARTERS: Starter[] = [
  {
    key: 'office', name: 'Office day', labelName: 'Work day', labelWeekdays: WORK_DAYS,
    steps: [
      fixed('Morning routine'), fixed('Commute'), fixed('Work'), slot('Post work'),
      fixed('Dinner'), slot('Post dinner'), slot('Bedtime'),
    ],
  },
  {
    key: 'wfh', name: 'Work from home', labelName: 'Work day', labelWeekdays: WORK_DAYS,
    steps: [
      fixed('Morning routine'), fixed('Work'), slot('Lunch break'), fixed('Work'), slot('Post work'),
      fixed('Dinner'), slot('Post dinner'), slot('Bedtime'),
    ],
  },
  {
    key: 'school', name: 'School day', labelName: 'School day', labelWeekdays: [],
    steps: [
      fixed('Morning routine'), fixed('School'), slot('After school'), fixed('Dinner'),
      fixed('Homework'), slot('Post dinner'), slot('Bedtime'),
    ],
  },
  {
    key: 'weekend', name: 'Weekend', labelName: 'Weekend', labelWeekdays: [5, 6],
    steps: [
      fixed('Morning routine'), slot('Free time'), fixed('Lunch'), slot('Free time'),
      fixed('Dinner'), slot('Post dinner'), slot('Bedtime'),
    ],
  },
  {
    key: 'dayoff', name: 'Day off', labelName: 'Day off', labelWeekdays: [],
    steps: [
      fixed('Morning routine'), slot('Free time'), fixed('Dinner'), slot('Post dinner'), slot('Bedtime'),
    ],
  },
]

/** Activities a new section starts with, keyed by slot name. */
export const SUGGESTED_ACTIVITIES: Record<string, string[]> = {
  'Post work': ['Gym', 'Walk', 'Read'],
  'Post dinner': ['Guitar', 'Call family', 'Read'],
  'Bedtime': ['Journal', 'Stretch', 'Read'],
  'Lunch break': ['Walk', 'Read'],
  'After school': ['Sports', 'Walk', 'Read'],
  'Free time': ['Hike', 'Cook something new', 'Read', 'Call family'],
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function byPosition<T extends { position: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.position - b.position)
}

/** A draft for a starter. Its label is an existing one of the same name, else a new one. Null for an unknown key. */
export function draftFromStarter(snap: Snapshot, key: string): TemplateDraft | null {
  const starter = STARTERS.find(candidate => candidate.key === key)
  if (starter === undefined) return null
  const existing = byPosition(snap.labels).find(label => sameName(label.name, starter.labelName))
  return {
    name: starter.name,
    label: existing === undefined
      ? { newName: starter.labelName, weekdays: [...starter.labelWeekdays] }
      : { id: existing.id },
    steps: starter.steps.map(step => ({ ...step })),
  }
}

/**
 * A draft of an existing template. `edit` keeps its id and each step's item id; `copy` has neither
 * and is named "{name} copy". Slots are named by their section. Null for an unknown template.
 */
export function draftFromTemplate(snap: Snapshot, templateId: Id, mode: 'edit' | 'copy'): TemplateDraft | null {
  const template = snap.templates.find(candidate => candidate.id === templateId)
  if (template === undefined) return null
  const steps = itemsOf(snap, templateId).map((item): DraftStep => {
    const origin = mode === 'edit' ? { itemId: item.id } : {}
    if (item.kind === 'fixed') return { kind: 'fixed', name: item.name, ...origin }
    const sectionName = snap.sections.find(section => section.id === item.sectionId)?.name ?? item.name
    return { kind: 'slot', slotName: sectionName, ...origin }
  })
  const label = { id: template.labelId }
  if (mode === 'edit') return { templateId, name: template.name, label, steps }
  return { name: `${template.name} copy`, label, steps }
}

/** A new template with no steps, under the first label, or under a new Work day label when there is none. */
export function blankDraft(snap: Snapshot): TemplateDraft {
  const [first] = byPosition(snap.labels)
  return {
    name: 'New template',
    label: first === undefined ? { newName: 'Work day', weekdays: [...WORK_DAYS] } : { id: first.id },
    steps: [],
  }
}

/** The step at `from` moved so that it ends up at index `to`. Out-of-range indexes change nothing. Returns a new array. */
export function moveStep(steps: DraftStep[], from: number, to: number): DraftStep[] {
  const next = [...steps]
  const inRange = (index: number) => Number.isInteger(index) && index >= 0 && index < steps.length
  if (!inRange(from) || !inRange(to)) return next
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
