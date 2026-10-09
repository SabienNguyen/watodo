// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { readSnapshot, type Clock } from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { NowScreen } from './NowScreen'

const MONDAY_1745: Clock = () => new Date(2026, 9, 12, 17, 45)

// The Toaster is mounted once in App; here it sits next to the screen so after-log bars show.
function renderNow(options: { clock?: Clock } = {}) {
  return renderWithWatodo(<><NowScreen /><Toaster /></>, options)
}

function activityButton(name: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(name) })
}

describe('NowScreen', () => {
  // Sonner keeps its toast list at module level, so clear it between tests.
  afterEach(() => {
    toast.dismiss()
  })

  test('lists the post-work activities with last: never and a best guess badge', () => {
    renderNow({ clock: MONDAY_1745 })

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

    fireEvent.click(within(dialog).getByRole('button', { name: 'Basic day' }))

    expect(readSnapshot(store).journal).toHaveLength(1)
    expect(screen.getByText('confirmed')).toBeInTheDocument()
    expect(activityButton('Gym')).toHaveTextContent('last: today 17:45')
    expect(await screen.findByText('Logged Gym')).toBeInTheDocument()
  })

  test('once the day is confirmed, a tap logs at once with no dialog', () => {
    const { store } = renderNow({ clock: MONDAY_1745 })
    fireEvent.click(activityButton('Gym'))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Basic day' }))

    fireEvent.click(activityButton('Walk'))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(readSnapshot(store).journal).toHaveLength(2)
    expect(activityButton('Walk')).toHaveTextContent('last: today 17:45')
  })

  test('at 10:00 shows Work now and the next slot, and ending Work early starts Post work', () => {
    renderNow({ clock: () => new Date(2026, 9, 12, 10, 0) })

    expect(screen.getByText('Now: Work')).toBeInTheDocument()
    expect(screen.getByText('Next: Post work at 17:30')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Done with Work' }))

    expect(screen.getByRole('heading', { name: 'Post work' })).toBeInTheDocument()
    expect(screen.getByText('Started early')).toBeInTheDocument()
    expect(activityButton('Gym')).toBeInTheDocument()
  })

  test('at 23:30 says nothing is planned and nothing more is planned today', () => {
    renderNow({ clock: () => new Date(2026, 9, 12, 23, 30) })

    expect(screen.getByText('Nothing planned right now.')).toBeInTheDocument()
    expect(screen.getByText('Nothing more planned today.')).toBeInTheDocument()
  })

  test('switch mode changes today without adding a journal entry', () => {
    const { store } = renderNow({ clock: MONDAY_1745 })

    fireEvent.click(screen.getByRole('button', { name: /Basic day/ }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText("Switch today's template")).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Basic day' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('confirmed')).toBeInTheDocument()
    expect(readSnapshot(store).journal).toHaveLength(0)
  })

  test('Undo on the after-log bar deletes the entry', async () => {
    const { store } = renderNow({ clock: MONDAY_1745 })
    fireEvent.click(activityButton('Gym'))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Basic day' }))
    expect(readSnapshot(store).journal).toHaveLength(1)

    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))

    expect(readSnapshot(store).journal).toHaveLength(0)
  })
})
