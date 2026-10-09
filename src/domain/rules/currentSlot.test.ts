import { describe, expect, test } from 'vitest'
import { toDayMinutes } from './dayRollover'
import { itemsOf, positionAt } from './currentSlot'
import type { Snapshot, TemplateItem } from './types'

function fixedStep(id: string, from: string, to: string): TemplateItem {
  return { id, templateId: 'basic', kind: 'fixed', name: id, start: toDayMinutes(from), end: toDayMinutes(to) }
}

function slotItem(id: string, from: string, to: string, sectionId: string): TemplateItem {
  return { id, templateId: 'basic', kind: 'slot', name: id, start: toDayMinutes(from), end: toDayMinutes(to), sectionId }
}

const basic: TemplateItem[] = [
  fixedStep('wake', '06:30', '08:30'),
  fixedStep('work', '09:00', '17:30'),
  slotItem('postWork', '17:30', '19:00', 'postWork'),
  fixedStep('dinner', '19:00', '19:30'),
  slotItem('postDinner', '19:30', '21:30', 'postDinner'),
  slotItem('bedtime', '21:30', '23:00', 'bedtime'),
]

const [wake, work, postWork, dinner, postDinner, bedtime] = basic

function at(items: TemplateItem[], hhmm: string, earlyItemId?: string) {
  return positionAt(items, toDayMinutes(hhmm), earlyItemId)
}

function snapWith(items: TemplateItem[]): Snapshot {
  return {
    labels: [], templates: [], items, sections: [], activities: [],
    listings: [], journal: [], days: [], defaultTemplateId: null,
  }
}

describe('itemsOf', () => {
  test('returns only the template items, sorted by start', () => {
    const other: TemplateItem = { ...fixedStep('elsewhere', '12:00', '13:00'), templateId: 'other' }
    const shuffled = [bedtime, other, wake, postWork, work]
    expect(itemsOf(snapWith(shuffled), 'basic').map(i => i.id)).toEqual(['wake', 'work', 'postWork', 'bedtime'])
  })
})

describe('positionAt', () => {
  test('inside a slot is a slot, not early', () => {
    expect(at(basic, '18:00')).toEqual({ kind: 'slot', item: postWork, early: false })
  })

  test('inside a fixed step reports the next slot', () => {
    expect(at(basic, '10:00')).toEqual({ kind: 'fixed', item: work, next: postWork })
  })

  test('in a gap between items reports the next slot', () => {
    expect(at(basic, '08:45')).toEqual({ kind: 'gap', next: postWork })
  })

  test('after the last item the next slot is null', () => {
    expect(at(basic, '23:30')).toEqual({ kind: 'gap', next: null })
  })

  test('a fixed step with no later slot has next null', () => {
    expect(at(basic.slice(0, 4), '19:10')).toEqual({ kind: 'fixed', item: dinner, next: null })
  })

  test('an early jump shows a later slot before its start, with early true', () => {
    expect(at(basic, '20:00', 'bedtime')).toEqual({ kind: 'slot', item: bedtime, early: true })
  })

  test('an early jump shows the slot as not early once inside it', () => {
    expect(at(basic, '21:45', 'bedtime')).toEqual({ kind: 'slot', item: bedtime, early: false })
  })

  test('an earlyItemId that is not in the items is ignored', () => {
    expect(at(basic, '20:00', 'nope')).toEqual({ kind: 'slot', item: postDinner, early: false })
  })

  test('an earlyItemId naming a fixed step is ignored', () => {
    expect(at(basic, '18:00', 'dinner')).toEqual({ kind: 'slot', item: postWork, early: false })
  })

  test('an early slot whose end has passed is ignored', () => {
    expect(at(basic, '23:30', 'bedtime')).toEqual({ kind: 'gap', next: null })
  })
})
