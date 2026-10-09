// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import {
  addDays, addPastEntry, createWatodoStore, finishSetup, readSnapshot, setUpStarter,
  type Clock, type Id, type WatodoStore,
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
    activityId: activityId(store, 'Gym'), sectionId: sectionId(store, 'Post work'), at: new Date(2026, 9, 10, 18, 0),
  })
  addPastEntry(store, {
    activityId: activityId(store, 'Gym'), sectionId: sectionId(store, 'Post work'), at: new Date(2026, 9, 11, 18, 0),
  })
  addPastEntry(store, {
    activityId: activityId(store, 'Read'), sectionId: sectionId(store, 'Bedtime'), at: new Date(2026, 9, 12, 8, 0),
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

    const bySection = within(screen.getByRole('region', { name: 'By section' }))
    const rows = bySection.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Post work')
    expect(rows[0]).toHaveTextContent('2 times')
    expect(rows[1]).toHaveTextContent('Bedtime')
    expect(rows[1]).toHaveTextContent('1 time')
  })

  test('an entry 40 days ago is counted in 90 days but not in 30', () => {
    const store = finishedStore()
    addPastEntry(store, {
      activityId: activityId(store, 'Stretch'), sectionId: sectionId(store, 'Bedtime'), at: new Date(2026, 8, 2, 21, 0),
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
      activityId: activityId(store, 'Walk'), sectionId: sectionId(store, 'Post work'), at: new Date(2026, 9, 1, 18, 0),
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
      activityId: activityId(store, 'Walk'), sectionId: sectionId(store, 'Post work'), at: new Date(2026, 8, 15, 18, 0),
    })
    addPastEntry(store, {
      activityId: activityId(store, 'Walk'), sectionId: sectionId(store, 'Post work'), at: new Date(2026, 8, 14, 18, 0),
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
