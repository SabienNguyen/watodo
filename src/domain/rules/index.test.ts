import { expect, test } from 'vitest'
import * as rules from './index'

test('re-exports every rule function and constant', () => {
  const names: (keyof typeof rules)[] = [
    'DAY_START_MINUTES', 'dayKeyOf', 'dayMinutesOf', 'weekdayOf', 'addDays',
    'dateFromDay', 'toDayMinutes', 'formatDayMinutes', 'guessTemplate',
    'itemsOf', 'positionAt', 'lastDone', 'nowView', 'fullDayView',
    'journalByDay', 'progress', 'dotStrip',
  ]
  for (const name of names) {
    expect(rules[name], name).toBeDefined()
  }
})
