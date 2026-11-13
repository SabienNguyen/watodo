// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  createWatodoStore, finishSetup, readSnapshot, setUpStarter, type Clock, type Id, type WatodoStore,
} from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { WeekRecap } from './WeekRecap'

/** Monday 12 Oct 2026, 17:45 local. The current week is 12 to 18 Oct. */
const MONDAY_1745: Clock = () => new Date(2026, 9, 12, 17, 45)

const STEP_MS = 500
let logged = 0

function finishedStore(): WatodoStore {
  const store = createWatodoStore()
  setUpStarter(store)
  finishSetup(store)
  return store
}

function activityId(store: WatodoStore, name: string): Id {
  const activity = readSnapshot(store).activities.find(a => a.name === name)
  if (!activity) throw new Error(`no activity ${name}`)
  return activity.id
}

function sectionId(store: WatodoStore, name: string): Id {
  const section = readSnapshot(store).sections.find(s => s.name === name)
  if (!section) throw new Error(`no section ${name}`)
  return section.id
}

/** Writes an entry at an exact time, so the test controls loggedAt and the committed flag. */
function logAt(store: WatodoStore, name: string, at: Date, slot: string, committed = false): void {
  logged += 1
  store.setRow('journal', `test-entry-${logged}`, {
    activityId: activityId(store, name),
    sectionId: sectionId(store, slot),
    loggedAt: at.getTime(),
    ...(committed ? { committed: true } : {}),
  })
}

/** Last week, 5 to 11 Oct: Gym, Read (committed), Walk on Wednesday, Stretch (committed) on Sunday. */
function lastWeekStore(): WatodoStore {
  const store = finishedStore()
  logAt(store, 'Gym', new Date(2026, 9, 5, 9, 0), 'Post work')
  logAt(store, 'Read', new Date(2026, 9, 5, 18, 0), 'Bedtime', true)
  logAt(store, 'Walk', new Date(2026, 9, 7, 8, 0), 'Post dinner')
  logAt(store, 'Stretch', new Date(2026, 9, 11, 21, 0), 'Bedtime', true)
  return store
}

function goPrevious(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))
}

function watch(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Watch recap' }))
}

/** Advances in steps, each flushed by React, since every row schedules the next one when it renders. */
function advance(ms: number): void {
  for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) {
    act(() => {
      vi.advanceTimersByTime(Math.min(STEP_MS, ms - elapsed))
    })
  }
}

function rows(): HTMLElement[] {
  return screen.queryAllByRole('listitem')
}

function rowFor(name: string): HTMLElement {
  const row = screen.getByText(name).closest('li')
  if (!row) throw new Error(`no row for ${name}`)
  return row
}

describe('WeekRecap', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    delete (Element.prototype as Partial<Element>).scrollIntoView
  })

  test('opens on the current week, which has nothing logged, so no button', () => {
    renderWithWatodo(<WeekRecap />, { store: lastWeekStore(), clock: MONDAY_1745 })

    expect(screen.getByRole('heading', { name: '12 – 18 Oct' })).toBeInTheDocument()
    expect(screen.getByText('Nothing logged this week.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Watch recap' })).toBeNull()
  })

  test('counts the week, with the dates in one line', () => {
    renderWithWatodo(<WeekRecap />, { store: lastWeekStore(), clock: MONDAY_1745 })
    goPrevious()

    expect(screen.getByRole('heading', { name: '5 – 11 Oct' })).toBeInTheDocument()
    expect(screen.getByText('4 things done')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Watch recap' })).toBeInTheDocument()
  })

  test('one entry says 1 thing done', () => {
    const store = finishedStore()
    logAt(store, 'Gym', new Date(2026, 9, 5, 9, 0), 'Post work')
    renderWithWatodo(<WeekRecap />, { store, clock: MONDAY_1745 })
    goPrevious()

    expect(screen.getByText('1 thing done')).toBeInTheDocument()
  })

  test('the list is hidden until Watch recap is pressed', () => {
    renderWithWatodo(<WeekRecap />, { store: lastWeekStore(), clock: MONDAY_1745 })
    goPrevious()

    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByText('Gym')).toBeNull()
  })

  test('rows appear one every 500 ms, in the order they were logged', () => {
    renderWithWatodo(<WeekRecap />, { store: lastWeekStore(), clock: MONDAY_1745 })
    goPrevious()
    watch()

    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toHaveTextContent('Gym')

    advance(499)
    expect(rows()).toHaveLength(1)
    advance(1)
    expect(rows()).toHaveLength(2)
    expect(rows()[1]).toHaveTextContent('Read')

    advance(500)
    expect(rows()).toHaveLength(3)
    expect(rows()[2]).toHaveTextContent('Walk')

    advance(500)
    expect(rows()).toHaveLength(4)
    expect(rows()[3]).toHaveTextContent('Stretch')

    advance(5000)
    expect(rows()).toHaveLength(4)
  })

  test('the Watch recap button goes once the recap starts', () => {
    renderWithWatodo(<WeekRecap />, { store: lastWeekStore(), clock: MONDAY_1745 })
    goPrevious()
    watch()

    expect(screen.queryByRole('button', { name: 'Watch recap' })).toBeNull()
    advance(5000)
    expect(screen.queryByRole('button', { name: 'Watch recap' })).toBeNull()
  })

  test('a day label appears with the first entry of each day', () => {
    renderWithWatodo(<WeekRecap />, { store: lastWeekStore(), clock: MONDAY_1745 })
    goPrevious()
    watch()

    expect(screen.getByText('Mon 5')).toBeInTheDocument()

    advance(500)
    expect(rows()[1]).toHaveTextContent('Read')
    expect(rows()[1]).not.toHaveTextContent('Mon 5')

    advance(500)
    expect(screen.getByText('Wed 7')).toBeInTheDocument()

    advance(500)
    expect(screen.getByText('Sun 11')).toBeInTheDocument()
    expect(screen.getAllByText(/^Mon 5$/)).toHaveLength(1)
  })

  test('committed entries have the committed badge', () => {
    renderWithWatodo(<WeekRecap />, { store: lastWeekStore(), clock: MONDAY_1745 })
    goPrevious()
    watch()
    advance(5000)

    expect(within(rowFor('Read')).getByText('committed')).toBeInTheDocument()
    expect(within(rowFor('Stretch')).getByText('committed')).toBeInTheDocument()
    expect(within(rowFor('Gym')).queryByText('committed')).toBeNull()
    expect(screen.getAllByText('committed')).toHaveLength(2)
  })

  test('Show the rest reveals everything at once and stops the timer', () => {
    renderWithWatodo(<WeekRecap />, { store: lastWeekStore(), clock: MONDAY_1745 })
    goPrevious()
    watch()
    advance(500)
    expect(rows()).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Show the rest' }))

    expect(rows()).toHaveLength(4)
    expect(screen.queryByRole('button', { name: 'Show the rest' })).toBeNull()
    advance(2000)
    expect(rows()).toHaveLength(4)
  })

  test('with reduced motion the whole list appears at once', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    renderWithWatodo(<WeekRecap />, { store: lastWeekStore(), clock: MONDAY_1745 })
    goPrevious()
    watch()

    expect(rows()).toHaveLength(4)
    expect(screen.queryByRole('button', { name: 'Show the rest' })).toBeNull()
    expect(vi.getTimerCount()).toBe(1)
  })

  test('moving to another week hides the list, and coming back starts hidden', () => {
    renderWithWatodo(<WeekRecap />, { store: lastWeekStore(), clock: MONDAY_1745 })
    goPrevious()
    watch()
    advance(5000)
    expect(rows()).toHaveLength(4)

    fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
    expect(screen.queryByRole('list')).toBeNull()

    goPrevious()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getByRole('button', { name: 'Watch recap' })).toBeInTheDocument()
  })

  test('changing week while playing stops the step timer', () => {
    renderWithWatodo(<WeekRecap />, { store: lastWeekStore(), clock: MONDAY_1745 })
    goPrevious()
    watch()
    // The step timer and the clock's 30 second refresh.
    expect(vi.getTimerCount()).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
    expect(vi.getTimerCount()).toBe(1)
  })

  test('next week is disabled on the current week and moves forward otherwise', () => {
    renderWithWatodo(<WeekRecap />, { store: lastWeekStore(), clock: MONDAY_1745 })
    expect(screen.getByRole('button', { name: 'Next week' })).toBeDisabled()

    goPrevious()
    expect(screen.getByRole('button', { name: 'Next week' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }))

    expect(screen.getByRole('heading', { name: '12 – 18 Oct' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next week' })).toBeDisabled()
  })

  test('an entry at 00:30 on Monday belongs to the week before', () => {
    const store = finishedStore()
    logAt(store, 'Gym', new Date(2026, 9, 12, 0, 30), 'Post work')
    renderWithWatodo(<WeekRecap />, { store, clock: MONDAY_1745 })

    expect(screen.getByText('Nothing logged this week.')).toBeInTheDocument()

    goPrevious()
    expect(screen.getByText('1 thing done')).toBeInTheDocument()
    watch()
    expect(rows()[0]).toHaveTextContent('Gym')
    expect(rows()[0]).toHaveTextContent('Sun 11')
  })

  test('unmounting stops the timers', () => {
    const { unmount } = renderWithWatodo(<WeekRecap />, { store: lastWeekStore(), clock: MONDAY_1745 })
    goPrevious()
    watch()
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  test('each new row is scrolled into view, when the browser can scroll', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    renderWithWatodo(<WeekRecap />, { store: lastWeekStore(), clock: MONDAY_1745 })
    goPrevious()
    watch()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' })

    advance(500)
    expect(scrollIntoView).toHaveBeenCalledTimes(2)
  })
})
