// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import {
  addDays, addPastEntry, addSection, createWatodoStore, deleteActivity, deleteSection, finishSetup, readSnapshot,
  setUpStarter, type Clock, type Id, type WatodoStore,
} from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { ProgressScreen } from './ProgressScreen'

const MONDAY_1745: Clock = () => new Date(2026, 9, 12, 17, 45)

function finishedStore(): WatodoStore {
  const store = createWatodoStore()
  setUpStarter(store)
  finishSetup(store)
  return store
}

function sectionId(store: WatodoStore, name: string): Id {
  const section = readSnapshot(store).sections.find(s => s.name === name)
  if (!section) throw new Error(`no section ${name}`)
  return section.id
}

function activityId(store: WatodoStore, name: string): Id {
  const activity = readSnapshot(store).activities.find(a => a.name === name)
  if (!activity) throw new Error(`no activity ${name}`)
  return activity.id
}

/** Two Gym (Post work) and one Read (Bedtime) in the last week. */
function lastWeekStore(): WatodoStore {
  const store = finishedStore()
  addPastEntry(store, {
    activityId: activityId(store, 'Gym'), sectionId: sectionId(store, 'Post work'), day: '2026-10-10',
  })
  addPastEntry(store, {
    activityId: activityId(store, 'Gym'), sectionId: sectionId(store, 'Post work'), day: '2026-10-11',
  })
  addPastEntry(store, {
    activityId: activityId(store, 'Read'), sectionId: sectionId(store, 'Bedtime'), day: '2026-10-12',
  })
  return store
}

describe('ProgressScreen', () => {
  test('defaults to 30 days', () => {
    renderWithWatodo(<ProgressScreen />, { clock: MONDAY_1745 })

    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('by activity lists the most used first, with the count in words and a dot strip', () => {
    renderWithWatodo(<ProgressScreen />, { store: lastWeekStore(), clock: MONDAY_1745 })

    const byActivity = within(screen.getByRole('region', { name: 'By activity' }))
    const rows = byActivity.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Gym')
    expect(rows[0]).toHaveTextContent('2 times')
    expect(rows[1]).toHaveTextContent('Read')
    expect(rows[1]).toHaveTextContent('1 time')
    expect(byActivity.getByRole('img', { name: '2 of the last 28 days' }).children).toHaveLength(28)
    expect(byActivity.getByRole('img', { name: '1 of the last 28 days' })).toBeInTheDocument()
  })

  test('by section counts entries per section', () => {
    renderWithWatodo(<ProgressScreen />, { store: lastWeekStore(), clock: MONDAY_1745 })

    const bySection = within(screen.getByRole('region', { name: 'By slot' }))
    const rows = bySection.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Post work')
    expect(rows[0]).toHaveTextContent('2 times')
    expect(rows[1]).toHaveTextContent('Bedtime')
    expect(rows[1]).toHaveTextContent('1 time')
  })

  test('an entry 40 days ago is counted in 90 days but not in 30', () => {
    const store = finishedStore()
    addPastEntry(store, {
      activityId: activityId(store, 'Stretch'), sectionId: sectionId(store, 'Bedtime'), day: '2026-09-02',
    })
    renderWithWatodo(<ProgressScreen />, { store, clock: MONDAY_1745 })

    expect(screen.queryByText('Stretch')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '90 days' }))
    expect(screen.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Stretch').closest('li')).toHaveTextContent('1 time')
  })

  test('7 days leaves out entries older than the last week', () => {
    const store = lastWeekStore()
    addPastEntry(store, {
      activityId: activityId(store, 'Walk'), sectionId: sectionId(store, 'Post work'), day: '2026-10-01',
    })
    renderWithWatodo(<ProgressScreen />, { store, clock: MONDAY_1745 })

    fireEvent.click(screen.getByRole('button', { name: '7 days' }))

    expect(screen.queryByText('Walk')).toBeNull()
    expect(screen.getByText('Gym').closest('li')).toHaveTextContent('2 times')
  })

  test('the dot strip covers the last 28 days, today included', () => {
    const store = finishedStore()
    const today = '2026-10-12'
    // 27 days before today is the oldest day in the strip; 28 days before is outside it.
    expect(addDays(today, -27)).toBe('2026-09-15')
    addPastEntry(store, {
      activityId: activityId(store, 'Walk'), sectionId: sectionId(store, 'Post work'), day: '2026-09-15',
    })
    addPastEntry(store, {
      activityId: activityId(store, 'Walk'), sectionId: sectionId(store, 'Post work'), day: '2026-09-14',
    })
    renderWithWatodo(<ProgressScreen />, { store, clock: MONDAY_1745 })

    expect(screen.getByText('Walk').closest('li')).toHaveTextContent('2 times')
    expect(screen.getByRole('img', { name: '1 of the last 28 days' })).toBeInTheDocument()
  })

  test('with nothing logged says so', () => {
    renderWithWatodo(<ProgressScreen />, { store: finishedStore(), clock: MONDAY_1745 })

    expect(screen.getByText('Nothing logged in this range yet.')).toBeInTheDocument()
  })
})

const ACTIVITY_NAMES = ['Gym', 'Walk', 'Read', 'Guitar', 'Call family', 'Journal', 'Stretch']
const SLOT_NAMES = ['Post work', 'Post dinner', 'Bedtime', 'Morning', 'Lunch', 'Evening']

/** Each named activity logged in Post work on Sat 10 Oct: the first 7 times, the next 6, and so on down to 1. */
function activitiesLogged(store: WatodoStore, names: string[]): void {
  names.forEach((name, i) => {
    for (let n = 0; n < names.length - i; n++) {
      addPastEntry(store, { activityId: activityId(store, name), sectionId: sectionId(store, 'Post work'), day: '2026-10-10' })
    }
  })
}

/** Gym logged in each named slot on Sat 10 Oct, the first 6 times, the next 5, and so on down to 1. Adds the slot if needed. */
function slotsLogged(store: WatodoStore, names: string[]): void {
  names.forEach((name, i) => {
    const slot = addSection(store, name)
    for (let n = 0; n < names.length - i; n++) {
      addPastEntry(store, { activityId: activityId(store, 'Gym'), sectionId: slot, day: '2026-10-10' })
    }
  })
}

describe('caps', () => {
  test('By activity shows five of seven, Show all reveals them, and Show fewer hides the last two again', () => {
    const store = finishedStore()
    activitiesLogged(store, ACTIVITY_NAMES)
    renderWithWatodo(<ProgressScreen />, { store, clock: MONDAY_1745 })
    const byActivity = within(screen.getByRole('region', { name: 'By activity' }))

    expect(byActivity.getAllByRole('listitem')).toHaveLength(5)
    expect(byActivity.getByText('Call family')).toBeInTheDocument()
    expect(byActivity.queryByText('Journal')).toBeNull()
    expect(byActivity.queryByText('Stretch')).toBeNull()

    fireEvent.click(byActivity.getByRole('button', { name: 'Show all' }))

    expect(byActivity.getAllByRole('listitem')).toHaveLength(7)
    expect(byActivity.getByText('Stretch')).toBeInTheDocument()

    fireEvent.click(byActivity.getByRole('button', { name: 'Show fewer' }))

    expect(byActivity.getAllByRole('listitem')).toHaveLength(5)
    expect(byActivity.queryByText('Stretch')).toBeNull()
    expect(byActivity.getByRole('button', { name: 'Show all' })).toBeInTheDocument()
  })

  test('By slot shows five of six, and Show all and Show fewer work the same way', () => {
    const store = finishedStore()
    slotsLogged(store, SLOT_NAMES)
    renderWithWatodo(<ProgressScreen />, { store, clock: MONDAY_1745 })
    const bySlot = within(screen.getByRole('region', { name: 'By slot' }))

    expect(bySlot.getAllByRole('listitem')).toHaveLength(5)
    expect(bySlot.queryByText('Evening')).toBeNull()

    fireEvent.click(bySlot.getByRole('button', { name: 'Show all' }))

    expect(bySlot.getAllByRole('listitem')).toHaveLength(6)
    expect(bySlot.getByText('Evening')).toBeInTheDocument()

    fireEvent.click(bySlot.getByRole('button', { name: 'Show fewer' }))

    expect(bySlot.getAllByRole('listitem')).toHaveLength(5)
    expect(bySlot.queryByText('Evening')).toBeNull()
  })

  test('each list has its own toggle', () => {
    const store = finishedStore()
    activitiesLogged(store, ACTIVITY_NAMES)
    slotsLogged(store, SLOT_NAMES)
    renderWithWatodo(<ProgressScreen />, { store, clock: MONDAY_1745 })
    const byActivity = within(screen.getByRole('region', { name: 'By activity' }))
    const bySlot = within(screen.getByRole('region', { name: 'By slot' }))

    fireEvent.click(bySlot.getByRole('button', { name: 'Show all' }))

    expect(bySlot.getAllByRole('listitem')).toHaveLength(6)
    expect(byActivity.getAllByRole('listitem')).toHaveLength(5)
    expect(byActivity.getByRole('button', { name: 'Show all' })).toBeInTheDocument()
  })

  test('lists of five or fewer have no Show all button', () => {
    const store = finishedStore()
    activitiesLogged(store, ACTIVITY_NAMES.slice(0, 5))
    slotsLogged(store, SLOT_NAMES.slice(0, 5))
    renderWithWatodo(<ProgressScreen />, { store, clock: MONDAY_1745 })

    expect(screen.getByRole('region', { name: 'By activity' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'By slot' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull()
  })

  test('a deleted activity still counts under its real name', () => {
    const store = finishedStore()
    activitiesLogged(store, ['Gym', 'Walk'])
    deleteActivity(store, activityId(store, 'Gym'))
    renderWithWatodo(<ProgressScreen />, { store, clock: MONDAY_1745 })

    const rows = within(screen.getByRole('region', { name: 'By activity' })).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Gym')
    expect(rows[0]).toHaveTextContent('2 times')
    expect(rows[1]).toHaveTextContent('Walk')
    expect(screen.queryByText('(removed)')).toBeNull()
  })

  test('a deleted slot still counts under its real name', () => {
    const store = lastWeekStore()
    deleteSection(store, sectionId(store, 'Post work'))
    renderWithWatodo(<ProgressScreen />, { store, clock: MONDAY_1745 })

    const rows = within(screen.getByRole('region', { name: 'By slot' })).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Post work')
    expect(rows[0]).toHaveTextContent('2 times')
    expect(screen.queryByText('(removed)')).toBeNull()
  })
})
