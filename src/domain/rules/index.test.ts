import { expect, test } from 'vitest'
import * as rules from './index'

test('re-exports every rule function and constant', () => {
  const names: (keyof typeof rules)[] = [
    'DAY_START_MINUTES', 'dayKeyOf', 'weekdayOf', 'addDays', 'noonOf',
    'guessTemplate',
    'STAY_MS', 'itemsOf', 'slotsOf', 'spentSlots', 'positionAt',
    'lastDone', 'nowView', 'fullDayView',
    'journalByDay', 'progress', 'dotStrip', 'templatesUsingSection', 'sectionsOfActivity',
    'STARTERS', 'SUGGESTED_ACTIVITIES', 'draftFromStarter', 'draftFromTemplate', 'blankDraft', 'moveStep',
  ]
  for (const name of names) {
    expect(rules[name], name).toBeDefined()
  }
})

test('no longer re-exports the clock-time helpers', () => {
  const removed = ['dayMinutesOf', 'dateFromDay', 'toDayMinutes', 'formatDayMinutes']
  for (const name of removed) {
    expect(name in rules, name).toBe(false)
  }
})
