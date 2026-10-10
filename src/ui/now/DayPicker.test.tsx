// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import {
  createWatodoStore, finishSetup, readSnapshot, setUpStarter, type Clock, type PendingLog,
} from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { DayPicker } from './DayPicker'

const MONDAY_1745: Clock = () => new Date(2026, 9, 12, 17, 45)

test('New template opens the editor, and Done confirms today with it and logs the pending Gym tap', () => {
  const store = createWatodoStore()
  setUpStarter(store)
  finishSetup(store)
  const snap = readSnapshot(store)
  const pending: PendingLog = {
    activityId: snap.activities.find(a => a.name === 'Gym')!.id,
    sectionId: snap.sections.find(s => s.name === 'Post work')!.id,
    itemId: snap.items.find(i => i.name === 'Post work')!.id,
  }
  const onClose = vi.fn()
  const onDone = vi.fn()
  renderWithWatodo(<DayPicker open pending={pending} onClose={onClose} onDone={onDone} />, {
    store,
    clock: MONDAY_1745,
  })

  fireEvent.click(screen.getByRole('button', { name: 'New template' }))

  const editor = screen.getByRole('dialog')
  expect(within(editor).getByRole('heading', { name: 'Edit template' })).toBeInTheDocument()
  expect(readSnapshot(store).templates.map(t => t.name)).toEqual(['Basic day', 'New template'])
  expect(readSnapshot(store).journal).toHaveLength(0)

  fireEvent.click(within(editor).getByRole('button', { name: 'Done' }))

  const after = readSnapshot(store)
  const newTemplate = after.templates.find(t => t.name === 'New template')
  expect(after.days.find(d => d.day === '2026-10-12')?.templateId).toBe(newTemplate?.id)
  expect(after.journal).toHaveLength(1)
  expect(after.journal[0].activityId).toBe(pending.activityId)
  expect(onDone).toHaveBeenCalledWith(after.journal[0].id)
  expect(onClose).toHaveBeenCalled()
})
