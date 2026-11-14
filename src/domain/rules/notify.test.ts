import { describe, expect, test } from 'vitest'
import { DEFAULT_NOTIFY, dueNotification, type NotifyKind, type NotifySettings, type SentNotification } from './notify'
import { dayKeyOf } from './dayRollover'
import { at } from '../testing'
import type {
  Activity, Bond, DayRecord, JournalEntry, Label, Listing, Section, Snapshot, Template, TemplateItem,
} from './types'

// Today is Monday 12 Oct 2026. Work days are the three days before it, Mon 5 to Wed 7 Oct.
const WORKDAYS = [-7, -6, -5]
const KINDS: NotifyKind[] = ['slot', 'committed', 'checkIn', 'rested', 'bond', 'recap']

const labels: Label[] = [
  { id: 'weekday', name: 'Weekdays', weekdays: [0, 1, 2, 3, 4], position: 0 },
  { id: 'weekend', name: 'Weekend', weekdays: [5, 6], position: 1 },
]
const work: Template = { id: 'work', name: 'Work day', labelId: 'weekday', position: 0 }
const weekendDay: Template = { id: 'weekend-day', name: 'Weekend day', labelId: 'weekend', position: 1 }
const items: TemplateItem[] = [
  { id: 'morning', templateId: 'work', kind: 'slot', name: 'Morning', position: 0, sectionId: 'morning' },
  { id: 'evening', templateId: 'work', kind: 'slot', name: 'Evening', position: 1, sectionId: 'evening' },
]
const sections: Section[] = [
  { id: 'morning', name: 'Morning', position: 0 },
  { id: 'evening', name: 'Evening', position: 1 },
]
const activities: Activity[] = [
  { id: 'walk', name: 'Walk', committed: false },
  { id: 'gym', name: 'Gym', committed: true },
  { id: 'read', name: 'Read', committed: false },
  { id: 'stretch', name: 'Stretch', committed: false, restDays: 2 },
]
const listings: Listing[] = [
  { sectionId: 'morning', activityId: 'walk', position: 0 },
  { sectionId: 'morning', activityId: 'read', position: 1 },
  { sectionId: 'evening', activityId: 'gym', position: 0 },
  { sectionId: 'evening', activityId: 'stretch', position: 1 },
]

function logged(
  id: string, activityId: string, sectionId: string, when: Date, extra: Partial<JournalEntry> = {},
): JournalEntry {
  return { id, activityId, sectionId, itemId: sectionId, loggedAt: when.getTime(), ...extra }
}

/** A work day: a morning walk at 09:00, then a committed gym at 18:00 that lasted `gymMinutes`. */
function workdayEntries(offset: number, gymMinutes = 60): JournalEntry[] {
  return [
    logged(`w${offset}-walk`, 'walk', 'morning', at(9, 0, offset)),
    logged(`w${offset}-gym`, 'gym', 'evening', at(18, 0, offset), { committed: true, durationMinutes: gymMinutes }),
  ]
}

function dayRecords(offsets: number[], templateId = 'work'): DayRecord[] {
  return offsets.map(offset => ({ day: dayKeyOf(at(12, 0, offset)), templateId }))
}

function snapWith(parts: Partial<Snapshot> = {}): Snapshot {
  return {
    labels, templates: [work, weekendDay], items, sections, activities, listings,
    journal: WORKDAYS.flatMap(offset => workdayEntries(offset)),
    days: dayRecords(WORKDAYS),
    defaultTemplateId: 'work',
    bonds: [], company: [],
    removed: { activities: [], sections: [], templates: [], bonds: [] },
    ...parts,
  }
}

/** Settings with only these kinds on. */
function onlyKinds(...on: NotifyKind[]): NotifySettings {
  return { ...DEFAULT_NOTIFY, kinds: Object.fromEntries(KINDS.map(kind => [kind, on.includes(kind)])) as Record<NotifyKind, boolean> }
}

function sentAt(kind: NotifyKind, key: string, when: Date): SentNotification {
  return { kind, key, at: when.getTime() }
}

describe('DEFAULT_NOTIFY', () => {
  test('has every kind on, 3 a day, and quiet from 23:00 to 08:00', () => {
    expect(DEFAULT_NOTIFY).toEqual({
      kinds: { slot: true, committed: true, checkIn: true, rested: true, bond: true, recap: true },
      dailyCap: 3,
      quietStart: 1380,
      quietEnd: 480,
    })
  })
})

describe('dueNotification gates', () => {
  test('quiet hours that wrap midnight hold from 23:00 to 08:00, and 08:00 itself is not quiet', () => {
    const snap = snapWith({ notify: onlyKinds('recap') })
    expect(dueNotification(snap, at(23, 30), [])).toBeNull()
    expect(dueNotification(snap, at(7, 59), [])).toBeNull()
    expect(dueNotification(snap, at(22, 59), [])?.kind).toBe('recap')
    expect(dueNotification(snap, at(8, 0), [])?.kind).toBe('recap')
  })

  test('quiet hours that do not wrap hold from the start up to the end', () => {
    const snap = snapWith({ notify: { ...onlyKinds('recap'), quietStart: 600, quietEnd: 780 } })
    expect(dueNotification(snap, at(9, 59), [])?.kind).toBe('recap')
    expect(dueNotification(snap, at(10, 0), [])).toBeNull()
    expect(dueNotification(snap, at(12, 59), [])).toBeNull()
    expect(dueNotification(snap, at(13, 0), [])?.kind).toBe('recap')
  })

  test('equal quiet start and end means no quiet hours', () => {
    const snap = snapWith({ notify: { ...onlyKinds('recap'), quietStart: 1380, quietEnd: 1380 } })
    expect(dueNotification(snap, at(23, 30), [])?.kind).toBe('recap')
  })

  test('the daily cap counts what was sent today', () => {
    const sent = [sentAt('recap', 'a', at(5, 0)), sentAt('recap', 'b', at(6, 0)), sentAt('recap', 'c', at(7, 0))]
    expect(dueNotification(snapWith({ notify: onlyKinds('recap') }), at(8, 0), sent)).toBeNull()
    expect(dueNotification(snapWith({ notify: { ...onlyKinds('recap'), dailyCap: 4 } }), at(8, 0), sent)?.kind)
      .toBe('recap')
  })

  test('yesterday does not count towards the daily cap', () => {
    const sent = [sentAt('recap', 'old', at(23, 0, -1))]
    const snap = snapWith({ notify: { ...onlyKinds('recap'), dailyCap: 1 } })
    expect(dueNotification(snap, at(8, 0), sent)?.kind).toBe('recap')
  })

  test('nothing is sent within 20 minutes of the previous one', () => {
    const snap = snapWith({ notify: onlyKinds('recap') })
    expect(dueNotification(snap, at(8, 0), [sentAt('recap', 'x', at(7, 50))])).toBeNull()
    expect(dueNotification(snap, at(8, 0), [sentAt('recap', 'x', at(7, 40))])?.kind).toBe('recap')
  })

  test('an already sent key is skipped, and the next candidate is returned', () => {
    // Rested (4) comes before recap (5). Stretch was last done Thu 8 Oct, two rest days ago.
    const journal = [...WORKDAYS.flatMap(offset => workdayEntries(offset)), logged('stretch-1', 'stretch', 'evening', at(10, 0, -4))]
    const snap = snapWith({ journal, notify: onlyKinds('rested', 'recap') })
    expect(dueNotification(snap, at(10, 0), [])?.key).toBe('rested:stretch:stretch-1')
    const sent = [sentAt('rested', 'rested:stretch:stretch-1', at(9, 0))]
    expect(dueNotification(snap, at(10, 0), sent)?.key).toBe('recap:2026-10-05')
  })

  test('a disabled kind is skipped', () => {
    const journal = WORKDAYS.flatMap(offset => workdayEntries(offset))
    const snap = snapWith({ journal, days: [], notify: { ...onlyKinds('recap'), kinds: { ...onlyKinds('recap').kinds, recap: false } } })
    expect(dueNotification(snap, at(10, 0), [])).toBeNull()
  })

  test('priority: slot before check-in, check-in before rested, rested before recap', () => {
    const journal = [...WORKDAYS.flatMap(offset => workdayEntries(offset)), logged('stretch-1', 'stretch', 'evening', at(10, 0, -4))]
    const snap = snapWith({ journal })
    // 10:00 is past both the slot (09:30) and check-in (10:00) marks, and it is Monday with last-week entries.
    expect(dueNotification(snap, at(10, 0), [])?.kind).toBe('slot')
    // Sent at 09:40, so 20 minutes before 10:00 and clear of the spacing gate.
    const slotSent = [sentAt('slot', 'slot:2026-10-12:morning', at(9, 40))]
    expect(dueNotification(snap, at(10, 0), slotSent)?.kind).toBe('rested')
    const restedSent = [...slotSent, sentAt('rested', 'rested:stretch:stretch-1', at(9, 40))]
    expect(dueNotification(snap, at(10, 0), restedSent)?.kind).toBe('recap')
  })
})

describe('slot reminders', () => {
  test('due 30 minutes past the usual time: 09:30 learned from 09:00 on three work days', () => {
    const snap = snapWith({ notify: onlyKinds('slot') })
    expect(dueNotification(snap, at(9, 29), [])).toBeNull()
    expect(dueNotification(snap, at(9, 30), [])).toEqual({
      kind: 'slot', key: 'slot:2026-10-12:morning', title: 'Morning', body: 'Walk · Read', url: '/',
    })
  })

  test('needs at least three same-kind days: two days give no usual time', () => {
    const journal = [...workdayEntries(-7), ...workdayEntries(-6)]
    const snap = snapWith({ journal, days: dayRecords([-7, -6]), notify: onlyKinds('slot') })
    expect(dueNotification(snap, at(10, 30), [])).toBeNull()
    const threeDays = snapWith({ notify: onlyKinds('slot') })
    expect(dueNotification(threeDays, at(10, 30), [])?.kind).toBe('slot')
  })

  test('weekend logs do not teach a work day', () => {
    // Weekend walks at 06:00 would pull the median to 08:00 if they counted.
    const weekend = [-2, -8, -9].map(offset => logged(`e${offset}`, 'walk', 'morning', at(6, 0, offset)))
    const snap = snapWith({
      journal: [...WORKDAYS.flatMap(offset => workdayEntries(offset)), ...weekend],
      days: [...dayRecords(WORKDAYS), ...dayRecords([-2, -8, -9], 'weekend-day')],
      notify: onlyKinds('slot'),
    })
    expect(dueNotification(snap, at(8, 30), [])).toBeNull()
    expect(dueNotification(snap, at(9, 30), [])?.kind).toBe('slot')
  })

  test('days more than 28 days back do not count', () => {
    const old = [-35, -36, -37].map(offset => logged(`o${offset}`, 'walk', 'morning', at(6, 0, offset)))
    const snap = snapWith({
      journal: [...WORKDAYS.flatMap(offset => workdayEntries(offset)), ...old],
      days: dayRecords([...WORKDAYS, -35, -36, -37]),
      notify: onlyKinds('slot'),
    })
    expect(dueNotification(snap, at(8, 30), [])).toBeNull()
    expect(dueNotification(snap, at(9, 30), [])?.kind).toBe('slot')
  })

  test('a removed template with the same label still teaches the day', () => {
    // The work days were logged on a template that has since been deleted. It still has the weekday label.
    const oldWork: Template = { id: 'old-work', name: 'Old work', labelId: 'weekday', position: 5 }
    const snap = snapWith({
      removed: { activities: [], sections: [], templates: [oldWork], bonds: [] },
      days: dayRecords(WORKDAYS, 'old-work'),
      notify: onlyKinds('slot'),
    })
    expect(dueNotification(snap, at(9, 30), [])?.kind).toBe('slot')
  })

  test('midnight: a log at 00:30 counts as late, not early', () => {
    // Each work day's first morning walk is at 00:30 of the next calendar day, so its day minutes are 1230.
    const late = WORKDAYS.map(offset => logged(`late${offset}`, 'walk', 'morning', at(0, 30, offset + 1)))
    const snap = snapWith({
      journal: late,
      days: dayRecords(WORKDAYS),
      notify: { ...onlyKinds('slot'), quietStart: 600, quietEnd: 600 },
    })
    // Median 1230 + 30 = 1260 minutes after 04:00, which is 01:00 the next morning.
    expect(dueNotification(snap, at(0, 30, 1), [])).toBeNull()
    expect(dueNotification(snap, at(1, 0, 1), [])?.kind).toBe('slot')
  })

  test('not sent when nothing is listed in the slot', () => {
    const emptied = snapWith({ listings: [], notify: onlyKinds('slot') })
    expect(dueNotification(emptied, at(9, 30), [])).toBeNull()
  })
})

describe('check-in', () => {
  test('due an hour past the usual first log: 10:00', () => {
    const snap = snapWith({ notify: onlyKinds('checkIn') })
    expect(dueNotification(snap, at(9, 59), [])).toBeNull()
    expect(dueNotification(snap, at(10, 0), [])).toEqual({
      kind: 'checkIn', key: 'checkIn:2026-10-12', title: "What's next?", body: 'Morning: Walk · Read', url: '/',
    })
  })

  test('not sent once something is logged today', () => {
    const logToday = logged('today-walk', 'walk', 'morning', at(9, 0))
    const snap = snapWith({ journal: [...WORKDAYS.flatMap(offset => workdayEntries(offset)), logToday], notify: onlyKinds('checkIn') })
    expect(dueNotification(snap, at(10, 30), [])).toBeNull()
  })

  test('not sent after a slot reminder today', () => {
    const snap = snapWith({ notify: onlyKinds('checkIn') })
    const sent = [sentAt('slot', 'slot:2026-10-12:morning', at(9, 30))]
    expect(dueNotification(snap, at(10, 0), sent)).toBeNull()
  })

  test('a slot reminder from another day does not block it', () => {
    const snap = snapWith({ notify: onlyKinds('checkIn') })
    const sent = [sentAt('slot', 'slot:2026-10-11:morning', at(9, 30, -1))]
    expect(dueNotification(snap, at(10, 0), sent)?.kind).toBe('checkIn')
  })

  test('no template today means no check-in', () => {
    const snap = snapWith({ templates: [], items: [], notify: onlyKinds('checkIn') })
    expect(dueNotification(snap, at(10, 0), [])).toBeNull()
  })
})

describe('committed activities', () => {
  test('due when the usual duration has passed, from durationMinutes', () => {
    const today = logged('today-gym', 'gym', 'evening', at(17, 0), { committed: true })
    const snap = snapWith({ journal: [...WORKDAYS.flatMap(offset => workdayEntries(offset)), today], notify: onlyKinds('committed') })
    expect(dueNotification(snap, at(17, 59), [])).toBeNull()
    expect(dueNotification(snap, at(18, 0), [])).toEqual({
      kind: 'committed', key: 'committed:today-gym', title: 'Back from Gym?', body: 'Morning: Walk · Read', url: '/',
    })
  })

  test('the duration falls back to the gap until the next log that day', () => {
    // Gym at 18:00 with no duration, then a log at 18:45: 45 minutes each day.
    const gapDay = (offset: number) => [
      logged(`g${offset}-walk`, 'walk', 'morning', at(9, 0, offset)),
      logged(`g${offset}-gym`, 'gym', 'evening', at(18, 0, offset), { committed: true }),
      logged(`g${offset}-read`, 'read', 'evening', at(18, 45, offset)),
    ]
    const today = logged('today-gym', 'gym', 'evening', at(17, 0), { committed: true })
    const snap = snapWith({ journal: [...WORKDAYS.flatMap(gapDay), today], notify: onlyKinds('committed') })
    expect(dueNotification(snap, at(17, 44), [])).toBeNull()
    expect(dueNotification(snap, at(17, 45), [])?.key).toBe('committed:today-gym')
  })

  test('a log within the last 20 minutes holds kinds 1-3 back', () => {
    // Usual gym is 15 minutes, so the mark is 17:55; the gym log is 15 minutes old then.
    const journal = [...WORKDAYS.flatMap(offset => workdayEntries(offset, 15)), logged('today-gym', 'gym', 'evening', at(17, 40), { committed: true })]
    const snap = snapWith({ journal, notify: onlyKinds('committed') })
    expect(dueNotification(snap, at(17, 55), [])).toBeNull()
    expect(dueNotification(snap, at(18, 0), [])?.kind).toBe('committed')
  })

  test('the last thing logged today must be committed', () => {
    const today = logged('today-walk', 'walk', 'morning', at(17, 0))
    const snap = snapWith({ journal: [...WORKDAYS.flatMap(offset => workdayEntries(offset)), today], notify: onlyKinds('committed') })
    expect(dueNotification(snap, at(18, 30), [])).toBeNull()
  })

  test('needs at least three samples', () => {
    const today = logged('today-gym', 'gym', 'evening', at(17, 0), { committed: true })
    const snap = snapWith({
      journal: [...workdayEntries(-7), ...workdayEntries(-6), today],
      days: dayRecords([-7, -6]),
      notify: onlyKinds('committed'),
    })
    expect(dueNotification(snap, at(20, 0), [])).toBeNull()
  })
})

describe('resting activities', () => {
  // Stretch rests for 2 days, so it is back on the 2nd day after its last log.
  function stretchLastOn(offset: number): Snapshot {
    return snapWith({
      journal: [...WORKDAYS.flatMap(o => workdayEntries(o)), logged(`stretch-${-offset}`, 'stretch', 'evening', at(10, 0, offset))],
      notify: onlyKinds('rested'),
    })
  }

  test('not yet back: 3 days after the last log, when it rests 2', () => {
    expect(dueNotification(stretchLastOn(-5), at(10, 0), [])).toBeNull()
  })

  test('back on the day its rest is over, and for two days after', () => {
    expect(dueNotification(stretchLastOn(-4), at(10, 0), [])).toEqual({
      kind: 'rested', key: 'rested:stretch:stretch-4', title: 'Stretch is back', body: 'Evening', url: '/',
    })
    expect(dueNotification(stretchLastOn(-2), at(10, 0), [])?.kind).toBe('rested')
  })

  test('still resting before its rest days are over', () => {
    expect(dueNotification(stretchLastOn(-1), at(10, 0), [])).toBeNull()
  })

  test('is not held back by a recent log', () => {
    const journal = [...WORKDAYS.flatMap(o => workdayEntries(o)), logged('stretch-1', 'stretch', 'evening', at(10, 0, -4)), logged('now-walk', 'walk', 'morning', at(9, 55))]
    const snap = snapWith({ journal, notify: onlyKinds('rested') })
    expect(dueNotification(snap, at(10, 0), [])?.kind).toBe('rested')
  })
})

describe('weekly recap', () => {
  test('due on Monday, with last week having entries: 6 things done, to Progress', () => {
    // Base journal: two entries on each of three work days in last week.
    expect(dueNotification(snapWith({ notify: onlyKinds('recap') }), at(10, 0), [])).toEqual({
      kind: 'recap', key: 'recap:2026-10-05', title: 'Your week is ready', body: '6 things done', url: '/?tab=progress',
    })
  })

  test('one entry says "1 thing done"', () => {
    const snap = snapWith({ journal: [logged('one', 'walk', 'morning', at(9, 0, -7))], days: [], notify: onlyKinds('recap') })
    expect(dueNotification(snap, at(10, 0), [])?.body).toBe('1 thing done')
  })

  test('not due when last week has no entries', () => {
    const snap = snapWith({ journal: [], days: [], notify: onlyKinds('recap') })
    expect(dueNotification(snap, at(10, 0), [])).toBeNull()
  })

  test('not due on any day but Monday', () => {
    expect(dueNotification(snapWith({ notify: onlyKinds('recap') }), at(10, 0, 1), [])).toBeNull()
  })

  test('is not held back by a recent log', () => {
    const journal = [...WORKDAYS.flatMap(o => workdayEntries(o)), logged('now-walk', 'walk', 'morning', at(7, 50))]
    const snap = snapWith({ journal, notify: onlyKinds('recap') })
    expect(dueNotification(snap, at(8, 0), [])?.kind).toBe('recap')
  })
})

describe('no template today', () => {
  test('kinds 1-3 are never due', () => {
    const snap = snapWith({ templates: [], items: [], notify: onlyKinds('slot', 'checkIn', 'committed') })
    expect(dueNotification(snap, at(10, 0), [])).toBeNull()
  })
})

describe('bond reminders', () => {
  const alex: Bond = { id: 'alex', name: 'Alex', position: 0, catchUpDays: 5 }

  /** The entry with Alex, `days` days before today, at 09:00. */
  function alexEntry(days: number, id = 'e-alex'): JournalEntry {
    return logged(id, 'walk', 'morning', at(9, 0, -days))
  }

  /** Only the bond kind on, with Alex's one walk `days` days back. */
  function bondSnap(days: number, parts: Partial<Snapshot> = {}): Snapshot {
    return snapWith({
      journal: [alexEntry(days)],
      days: [],
      notify: onlyKinds('bond'),
      bonds: [alex],
      company: [{ entryId: 'e-alex', bondId: 'alex' }],
      ...parts,
    })
  }

  test('nothing before catchUpDays, and due on the day it is reached', () => {
    expect(dueNotification(bondSnap(4), at(12, 0), [])).toBeNull()
    expect(dueNotification(bondSnap(5), at(12, 0), [])).toEqual({
      kind: 'bond',
      key: 'bond:alex:e-alex',
      title: "It's been 5 days since you saw Alex",
      body: 'Last time: Walk',
      url: '/?tab=bonds',
    })
  })

  test('the gap reads in days up to 13, then in whole weeks from 14', () => {
    const title = (days: number) => dueNotification(bondSnap(days), at(12, 0), [])?.title
    expect(title(13)).toBe("It's been 13 days since you saw Alex")
    expect(title(14)).toBe("It's been 2 weeks since you saw Alex")
    expect(title(20)).toBe("It's been 2 weeks since you saw Alex")
    expect(title(21)).toBe("It's been 3 weeks since you saw Alex")
  })

  test('once per gap: a sent key is skipped', () => {
    const sent = [sentAt('bond', 'bond:alex:e-alex', at(12, 0, -1))]
    expect(dueNotification(bondSnap(5), at(12, 0), sent)).toBeNull()
  })

  test('a new last seen entry is a new gap with a new key', () => {
    const snap = bondSnap(5, {
      journal: [alexEntry(10, 'e-old'), alexEntry(5, 'e-alex')],
      company: [{ entryId: 'e-old', bondId: 'alex' }, { entryId: 'e-alex', bondId: 'alex' }],
    })
    const sent = [sentAt('bond', 'bond:alex:e-old', at(12, 0, -1))]
    expect(dueNotification(snap, at(12, 0), sent)?.key).toBe('bond:alex:e-alex')
  })

  test('no catchUpDays, or never seen, gives nothing', () => {
    expect(dueNotification(bondSnap(9, { bonds: [{ id: 'alex', name: 'Alex', position: 0 }] }), at(12, 0), [])).toBeNull()
    expect(dueNotification(bondSnap(9, { journal: [], company: [] }), at(12, 0), [])).toBeNull()
  })

  test('a disabled kind gives nothing', () => {
    // Recap is off too: today is a Monday, and the recap would otherwise be due.
    const notify: NotifySettings = { ...DEFAULT_NOTIFY, kinds: { ...DEFAULT_NOTIFY.kinds, bond: false, recap: false } }
    expect(dueNotification(bondSnap(5, { notify }), at(12, 0), [])).toBeNull()
  })

  test('not held back by a log within 20 minutes', () => {
    const snap = bondSnap(5, {
      journal: [alexEntry(5), logged('just-now', 'read', 'morning', at(11, 50))],
    })
    expect(dueNotification(snap, at(12, 0), [])?.kind).toBe('bond')
  })

  test('the first due bond in bondSummaries order wins: the higher rank', () => {
    const sam: Bond = { id: 'sam', name: 'Sam', position: 1, catchUpDays: 5 }
    const snap = bondSnap(5, {
      bonds: [alex, sam],
      journal: [alexEntry(5), logged('s1', 'walk', 'morning', at(9, 0, -9)), logged('s2', 'walk', 'morning', at(9, 0, -8)), logged('s3', 'walk', 'morning', at(9, 0, -7))],
      company: [
        { entryId: 'e-alex', bondId: 'alex' },
        { entryId: 's1', bondId: 'sam' }, { entryId: 's2', bondId: 'sam' }, { entryId: 's3', bondId: 'sam' },
      ],
    })
    expect(dueNotification(snap, at(12, 0), [])?.title).toBe("It's been 7 days since you saw Sam")
  })

  test('after rested, and before recap', () => {
    const stretched = logged('stretch-1', 'stretch', 'evening', at(18, 0, -3))
    const withRested = bondSnap(5, { notify: DEFAULT_NOTIFY, journal: [alexEntry(5), stretched] })
    expect(dueNotification(withRested, at(12, 0), [])?.kind).toBe('rested')

    const bondFirst = bondSnap(5, { notify: { ...DEFAULT_NOTIFY, kinds: { ...DEFAULT_NOTIFY.kinds, rested: false } }, journal: [alexEntry(5), stretched] })
    expect(dueNotification(bondFirst, at(12, 0), [])?.kind).toBe('bond')

    const recapFirstWhenNotDue = bondSnap(4, { notify: onlyKinds('bond', 'recap') })
    expect(dueNotification(recapFirstWhenNotDue, at(12, 0), [])?.kind).toBe('recap')
  })
})
