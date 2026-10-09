import { weekdayOf } from './dayRollover'
import type { DayKey, Id, Snapshot, Template } from './types'

export interface TemplateGuess {
  templateId: Id | null;                 // null only when there are no templates at all
  confirmed: boolean;
  reason: 'confirmed' | 'label' | 'label-empty' | 'default';
  labelId?: Id;                          // set for 'label' and 'label-empty'
}

function byPosition<T extends { position: number }>(a: T, b: T): number {
  return a.position - b.position
}

/** The default template if it still exists, else the lowest-position template, else null. */
function defaultTemplateId(snap: Snapshot, templates: Template[]): Id | null {
  if (templates.some(t => t.id === snap.defaultTemplateId)) return snap.defaultTemplateId
  return templates[0]?.id ?? null
}

/** Latest day, other than `excludeDay`, on which the template was confirmed. */
function lastConfirmedDay(snap: Snapshot, templateId: Id, excludeDay: DayKey): DayKey | undefined {
  let latest: DayKey | undefined
  for (const record of snap.days) {
    if (record.templateId !== templateId || record.day === excludeDay) continue
    if (latest === undefined || record.day > latest) latest = record.day
  }
  return latest
}

/** Among candidates (sorted by position), the most recently confirmed; the lowest position if none was. */
function mostRecentlyUsed(snap: Snapshot, candidates: Template[], day: DayKey): Template {
  let best = candidates[0]
  let bestDay = lastConfirmedDay(snap, best.id, day)
  for (const candidate of candidates.slice(1)) {
    const candidateDay = lastConfirmedDay(snap, candidate.id, day)
    if (candidateDay !== undefined && (bestDay === undefined || candidateDay > bestDay)) {
      best = candidate
      bestDay = candidateDay
    }
  }
  return best
}

export function guessTemplate(snap: Snapshot, day: DayKey): TemplateGuess {
  const templates = [...snap.templates].sort(byPosition)

  const confirmedId = snap.days.find(record => record.day === day)?.templateId
  if (confirmedId !== undefined && templates.some(t => t.id === confirmedId)) {
    return { templateId: confirmedId, confirmed: true, reason: 'confirmed' }
  }

  const weekday = weekdayOf(day)
  const label = [...snap.labels].sort(byPosition).find(l => l.weekdays.includes(weekday))
  if (!label) {
    return { templateId: defaultTemplateId(snap, templates), confirmed: false, reason: 'default' }
  }

  const candidates = templates.filter(t => t.labelId === label.id)
  if (candidates.length === 0) {
    return { templateId: defaultTemplateId(snap, templates), confirmed: false, reason: 'label-empty', labelId: label.id }
  }

  return {
    templateId: mostRecentlyUsed(snap, candidates, day).id,
    confirmed: false,
    reason: 'label',
    labelId: label.id,
  }
}
