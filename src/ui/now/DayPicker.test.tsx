// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import {
  createWatodoStore, finishSetup, readSnapshot, setUpStarter, type Clock, type PendingLog,
} from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { DayPicker } from './DayPicker'

const MONDAY_1745: Clock = () => new Date(2026, 9, 12, 17, 45)
const PICKER_TITLE = 'Which kind of day is today?'

function gymTap(store: ReturnType<typeof createWatodoStore>): PendingLog {
  const snap = readSnapshot(store)
  return {
    activityId: snap.activities.find(a => a.name === 'Gym')!.id,
    sectionId: snap.sections.find(s => s.name === 'Post work')!.id,
    itemId: snap.items.find(i => i.name === 'Post work')!.id,
  }
}

function renderPicker() {
  const store = createWatodoStore()
  setUpStarter(store)
  finishSetup(store)
  const pending = gymTap(store)
  const onClose = vi.fn()
  const onDone = vi.fn()
  renderWithWatodo(<DayPicker open pending={pending} onClose={onClose} onDone={onDone} />, {
    store,
    clock: MONDAY_1745,
  })
  return { store, pending, onClose, onDone }
}

test('New template, Work from home, Save confirms today with the new template and logs the pending Gym tap once', () => {
  const { store, pending, onClose, onDone } = renderPicker()

  fireEvent.click(screen.getByRole('button', { name: 'New template' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Work from home' }))

  const editor = screen.getByRole('dialog')
  expect(within(editor).getByRole('heading', { name: 'New template' })).toBeInTheDocument()
  expect(readSnapshot(store).templates.map(t => t.name)).toEqual(['Basic day'])
  expect(readSnapshot(store).journal).toHaveLength(0)

  fireEvent.click(within(editor).getByRole('button', { name: 'Save' }))

  const after = readSnapshot(store)
  const created = after.templates.find(t => t.name === 'Work from home')
  expect(created).toBeDefined()
  expect(after.days.find(d => d.day === '2026-10-12')?.templateId).toBe(created?.id)
  expect(after.journal).toHaveLength(1)
  expect(after.journal[0].activityId).toBe(pending.activityId)
  expect(onDone).toHaveBeenCalledTimes(1)
  expect(onDone).toHaveBeenCalledWith(after.journal[0].id)
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('while the starter picker or the editor is open, the day picker is hidden', () => {
  renderPicker()

  fireEvent.click(screen.getByRole('button', { name: 'New template' }))
  expect(screen.queryByRole('heading', { name: PICKER_TITLE })).toBeNull()
  expect(screen.getByRole('heading', { name: 'Start a new template' })).toBeInTheDocument()

  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Blank' }))
  expect(screen.queryByRole('heading', { name: PICKER_TITLE })).toBeNull()
  expect(screen.getByRole('heading', { name: 'New template' })).toBeInTheDocument()
})

test('New template, pick, Cancel returns to the list with no new template and no journal entry', () => {
  const { store, onClose, onDone } = renderPicker()
  const before = readSnapshot(store)

  fireEvent.click(screen.getByRole('button', { name: 'New template' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Weekend' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

  expect(screen.getByRole('heading', { name: PICKER_TITLE })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'New template' })).toBeInTheDocument()
  expect(readSnapshot(store)).toEqual(before)
  expect(readSnapshot(store).journal).toHaveLength(0)
  expect(onDone).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
})
