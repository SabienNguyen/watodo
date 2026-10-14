import { expect, test } from 'vitest'
import type { DayRecord, Snapshot } from './types'

test('a Snapshot holds exactly the collections the rules read', () => {
  const snap: Snapshot = {
    labels: [], templates: [], items: [], sections: [], activities: [],
    listings: [], journal: [], days: [], defaultTemplateId: null,
    removed: { activities: [], sections: [], templates: [] },
  }
  expect(Object.keys(snap).sort()).toEqual([
    'activities', 'days', 'defaultTemplateId', 'items', 'journal',
    'labels', 'listings', 'removed', 'sections', 'templates',
  ])
})

test('a DayRecord may carry only its day', () => {
  const record: DayRecord = { day: '2026-10-12' }
  expect(record.templateId).toBeUndefined()
})
