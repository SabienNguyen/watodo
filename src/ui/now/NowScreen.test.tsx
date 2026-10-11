// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import {
  confirmDay, createWatodoStore, draftFromStarter, draftFromTemplate, finishSetup, readSnapshot, saveTemplate,
  setUpStarter, type Clock, type WatodoStore,
} from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { NowScreen } from './NowScreen'

const MONDAY_1745: Clock = () => new Date(2026, 9, 12, 17, 45)

// The Toaster is mounted once in App; here it sits next to the screen so after-log bars show.
function renderNow(options: { clock?: Clock; store?: WatodoStore } = {}) {
  return renderWithWatodo(<><NowScreen /><Toaster /></>, options)
}

function finishedStore(): WatodoStore {
  const store = createWatodoStore()
  setUpStarter(store)
  finishSetup(store)
  return store
}

function activityButton(name: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(name) })
}

/** The button in the slot row. Its name is exactly the slot name. */
function slotButton(name: string): HTMLElement {
  return screen.getByRole('button', { name })
}

function confirmBasicDay() {
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Basic day' }))
}

/** The starter store with the Weekend starter saved (its Free time slot repeats) and confirmed today. */
function weekendConfirmedStore(): WatodoStore {
  const store = finishedStore()
  const draft = draftFromStarter(readSnapshot(store), 'weekend')
  if (draft === null) throw new Error('no weekend starter')
  saveTemplate(store, draft)
  const weekend = readSnapshot(store).templates.find(template => template.name === 'Weekend')
  if (weekend === undefined) throw new Error('no weekend template')
  confirmDay(store, MONDAY_1745, weekend.id)
  return store
}

describe('NowScreen', () => {
  // Sonner keeps its toast list at module level, so clear it between tests.
  afterEach(() => {
    toast.dismiss()
    vi.useRealTimers()
  })

  test('shows the slot row with Post work pressed, and the post-work activities with last: never', () => {
    renderNow({ clock: MONDAY_1745 })

    expect(slotButton('Post work')).toHaveAttribute('aria-pressed', 'true')
    expect(slotButton('Post dinner')).toHaveAttribute('aria-pressed', 'false')
    expect(slotButton('Bedtime')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('heading', { name: 'Post work' })).toBeInTheDocument()
    for (const name of ['Gym', 'Walk', 'Read']) {
      expect(activityButton(name)).toHaveTextContent('last: never')
    }
    expect(screen.getByText('best guess')).toBeInTheDocument()
  })

  test('tapping an unconfirmed day asks which kind of day it is, then logs the tap', async () => {
    const { store } = renderNow({ clock: MONDAY_1745 })

    fireEvent.click(activityButton('Gym'))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Which kind of day is today?')).toBeInTheDocument()
    expect(readSnapshot(store).journal).toHaveLength(0)

    confirmBasicDay()

    expect(readSnapshot(store).journal).toHaveLength(1)
    expect(screen.getByText('confirmed')).toBeInTheDocument()
    expect(activityButton('Gym')).toHaveTextContent('last: today')
    expect(document.body.textContent).not.toMatch(/\d{1,2}:\d{2}/)
    expect(await screen.findByText('Logged Gym')).toBeInTheDocument()
  })

  test('once the day is confirmed, a tap logs at once with no dialog', () => {
    const { store } = renderNow({ clock: MONDAY_1745 })
    fireEvent.click(activityButton('Gym'))
    confirmBasicDay()

    fireEvent.click(activityButton('Walk'))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(readSnapshot(store).journal).toHaveLength(2)
    expect(activityButton('Walk')).toHaveTextContent('last: today')
  })

  test('Post work stays current 30 minutes after a log, and Post dinner is current 2 hours after', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let now = new Date(2026, 9, 12, 17, 45)
    renderNow({ clock: () => now })
    fireEvent.click(activityButton('Gym'))
    confirmBasicDay()

    now = new Date(2026, 9, 12, 18, 15)
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(screen.getByRole('heading', { name: 'Post work' })).toBeInTheDocument()
    expect(slotButton('Post work')).toHaveAttribute('aria-pressed', 'true')

    now = new Date(2026, 9, 12, 19, 45)
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(screen.getByRole('heading', { name: 'Post dinner' })).toBeInTheDocument()
    expect(slotButton('Post dinner')).toHaveAttribute('aria-pressed', 'true')
    for (const name of ['Guitar', 'Call family', 'Read']) {
      expect(activityButton(name)).toBeInTheDocument()
    }
  })

  test('pressing Bedtime in the slot row shows its activities, and tapping one logs it to Bedtime', () => {
    const { store } = renderNow({ clock: MONDAY_1745 })

    fireEvent.click(slotButton('Bedtime'))

    expect(slotButton('Bedtime')).toHaveAttribute('aria-pressed', 'true')
    expect(slotButton('Post work')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('heading', { name: 'Bedtime' })).toBeInTheDocument()
    for (const name of ['Journal', 'Stretch', 'Read']) {
      expect(activityButton(name)).toBeInTheDocument()
    }

    fireEvent.click(activityButton('Stretch'))
    confirmBasicDay()

    const snap = readSnapshot(store)
    const bedtime = snap.items.find(item => item.name === 'Bedtime')
    expect(snap.journal).toHaveLength(1)
    expect(snap.journal[0].itemId).toBe(bedtime?.id)
    expect(snap.journal[0].sectionId).toBe(bedtime?.sectionId)
    expect(slotButton('Bedtime')).toHaveAttribute('aria-pressed', 'true')
  })

  test('a template with no slots says so and points to Edit', () => {
    const store = finishedStore()
    const snap = readSnapshot(store)
    const draft = draftFromTemplate(snap, snap.defaultTemplateId as string, 'edit')
    if (draft === null) throw new Error('no default template')
    saveTemplate(store, { ...draft, steps: draft.steps.filter(step => step.kind === 'fixed') })

    renderNow({ store, clock: MONDAY_1745 })

    expect(screen.getByText('This template has no slots yet. Add one in Edit.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Post work' })).toBeNull()
  })

  test('no Done with or Start button appears at any hour', () => {
    for (const [hours, minutes] of [[10, 0], [17, 45], [23, 30]]) {
      const { unmount } = renderNow({ clock: () => new Date(2026, 9, 12, hours, minutes) })

      expect(screen.queryByRole('button', { name: /Done with|Start/ })).toBeNull()
      unmount()
    }
  })

  test('Undo on the after-log bar deletes the entry', async () => {
    const { store } = renderNow({ clock: MONDAY_1745 })
    fireEvent.click(activityButton('Gym'))
    confirmBasicDay()
    expect(readSnapshot(store).journal).toHaveLength(1)

    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))

    expect(readSnapshot(store).journal).toHaveLength(0)
  })

  test('switch mode changes today without adding a journal entry', () => {
    const { store } = renderNow({ clock: MONDAY_1745 })

    fireEvent.click(screen.getByRole('button', { name: /Basic day/ }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText("Switch today's template")).toBeInTheDocument()

    confirmBasicDay()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('confirmed')).toBeInTheDocument()
    expect(readSnapshot(store).journal).toHaveLength(0)
  })

  test('a repeated slot is numbered: one row button is pressed, and pressing Free time #2 moves the heading and logs to it', () => {
    const store = weekendConfirmedStore()
    renderNow({ store, clock: MONDAY_1745 })

    expect(slotButton('Free time #1')).toHaveAttribute('aria-pressed', 'true')
    expect(slotButton('Free time #2')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1)
    expect(slotButton('Post dinner')).toBeInTheDocument()
    expect(slotButton('Bedtime')).toBeInTheDocument()

    fireEvent.click(slotButton('Free time #2'))

    expect(screen.getByRole('heading', { name: 'Free time #2' })).toBeInTheDocument()
    expect(slotButton('Free time #2')).toHaveAttribute('aria-pressed', 'true')
    expect(slotButton('Free time #1')).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(activityButton('Hike'))

    const snap = readSnapshot(store)
    const [, secondFreeTime] = snap.items.filter(item => item.name === 'Free time')
    expect(snap.journal).toHaveLength(1)
    expect(snap.journal[0].itemId).toBe(secondFreeTime.id)
  })

  test('has no full day toggle and no full day list', () => {
    renderNow({ clock: MONDAY_1745 })

    expect(screen.queryByRole('button', { name: /full day/ })).toBeNull()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    for (const name of ['Wake up', 'Brush teeth', 'Change clothes']) {
      expect(screen.queryByText(name)).toBeNull()
    }
  })
})
