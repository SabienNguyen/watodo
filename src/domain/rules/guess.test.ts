import { describe, expect, test } from 'vitest'
import { guessTemplate } from './guess'
import type { DayRecord, Label, Snapshot, Template } from './types'

const WORK_DAYS = [0, 1, 2, 3, 4]
const MONDAY = '2026-10-12'
const SATURDAY = '2026-10-17'

function snap(parts: Partial<Snapshot> = {}): Snapshot {
  return {
    labels: [], templates: [], items: [], sections: [], activities: [],
    listings: [], journal: [], days: [], defaultTemplateId: null,
    removed: { activities: [], sections: [], templates: [] },
    ...parts,
  }
}

function label(id: string, weekdays: number[], position = 0): Label {
  return { id, name: id, weekdays, position }
}

function template(id: string, labelId: string, position: number): Template {
  return { id, name: id, labelId, position }
}

function confirmed(day: string, templateId: string): DayRecord {
  return { day, templateId }
}

describe('guessTemplate', () => {
  test('a template confirmed for the day wins over the label', () => {
    const s = snap({
      labels: [label('work', WORK_DAYS)],
      templates: [template('a', 'work', 0), template('b', 'work', 1)],
      days: [confirmed(MONDAY, 'b')],
      defaultTemplateId: 'a',
    })
    expect(guessTemplate(s, MONDAY)).toEqual({ templateId: 'b', confirmed: true, reason: 'confirmed' })
  })

  test('the weekday label picks the template confirmed most recently under it', () => {
    const s = snap({
      labels: [label('work', WORK_DAYS)],
      templates: [template('a', 'work', 0), template('b', 'work', 1)],
      days: [confirmed('2026-10-01', 'a'), confirmed('2026-10-05', 'b')],
    })
    expect(guessTemplate(s, MONDAY)).toEqual({
      templateId: 'b', confirmed: false, reason: 'label', labelId: 'work',
    })
  })

  test('a later confirmation moves the guess back to the other template', () => {
    const s = snap({
      labels: [label('work', WORK_DAYS)],
      templates: [template('a', 'work', 0), template('b', 'work', 1)],
      days: [confirmed('2026-10-05', 'b'), confirmed('2026-10-07', 'a')],
    })
    expect(guessTemplate(s, MONDAY).templateId).toBe('a')
  })

  test('a template with no confirmation loses to one that was confirmed', () => {
    const s = snap({
      labels: [label('work', WORK_DAYS)],
      templates: [template('a', 'work', 0), template('b', 'work', 1)],
      days: [confirmed('2026-10-05', 'b')],
    })
    expect(guessTemplate(s, MONDAY).templateId).toBe('b')
  })

  test('with no confirmations at all, the lowest position wins', () => {
    const s = snap({
      labels: [label('work', WORK_DAYS)],
      templates: [template('b', 'work', 1), template('c', 'work', 3)],
    })
    expect(guessTemplate(s, MONDAY)).toEqual({
      templateId: 'b', confirmed: false, reason: 'label', labelId: 'work',
    })
  })

  test('a confirmed record for today that names a deleted template is ignored', () => {
    const s = snap({
      labels: [label('work', WORK_DAYS)],
      templates: [template('a', 'work', 0), template('b', 'work', 1)],
      days: [confirmed(MONDAY, 'deleted')],
    })
    expect(guessTemplate(s, MONDAY)).toEqual({
      templateId: 'a', confirmed: false, reason: 'label', labelId: 'work',
    })
  })

  test('a label with no templates falls back to the default, label-empty', () => {
    const s = snap({
      labels: [label('work', WORK_DAYS), label('weekend', [5, 6], 1)],
      templates: [template('home', 'weekend', 0)],
      defaultTemplateId: 'home',
    })
    expect(guessTemplate(s, MONDAY)).toEqual({
      templateId: 'home', confirmed: false, reason: 'label-empty', labelId: 'work',
    })
  })

  test('no label covers the weekday: the default, reason default', () => {
    const s = snap({
      labels: [label('work', WORK_DAYS)],
      templates: [template('a', 'work', 0), template('d', 'work', 1)],
      defaultTemplateId: 'd',
    })
    expect(guessTemplate(s, SATURDAY)).toEqual({ templateId: 'd', confirmed: false, reason: 'default' })
  })

  test('a default that no longer exists falls back to the lowest-position template', () => {
    const s = snap({
      labels: [label('work', WORK_DAYS)],
      templates: [template('a', 'work', 0), template('b', 'work', 1)],
      defaultTemplateId: 'gone',
    })
    expect(guessTemplate(s, SATURDAY)).toEqual({ templateId: 'a', confirmed: false, reason: 'default' })
  })

  test('with no templates at all the templateId is null', () => {
    const withLabel = snap({ labels: [label('work', WORK_DAYS)] })
    expect(guessTemplate(withLabel, MONDAY).templateId).toBeNull()

    const withoutLabel = snap()
    expect(guessTemplate(withoutLabel, SATURDAY)).toEqual({ templateId: null, confirmed: false, reason: 'default' })
  })
})
