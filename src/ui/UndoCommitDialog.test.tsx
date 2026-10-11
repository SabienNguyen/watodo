// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { UndoCommitDialog } from './UndoCommitDialog'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
})

afterEach(() => {
  vi.useRealTimers()
})

function renderDialog(props: { waitSeconds?: number } = {}) {
  const onUndo = vi.fn()
  const onCancel = vi.fn()
  const view = render(
    <UndoCommitDialog activityName="Gym" slotName="Post work" onUndo={onUndo} onCancel={onCancel} {...props} />,
  )
  return { ...view, onUndo, onCancel }
}

function tick(seconds: number) {
  act(() => { vi.advanceTimersByTime(seconds * 1000) })
}

test('the title names the activity, and the text says which slot it reopens', () => {
  renderDialog()

  expect(screen.getByRole('heading', { name: 'Undo Gym?' })).toBeInTheDocument()
  expect(screen.getByText('This reopens Post work.')).toBeInTheDocument()
})

test('at first the Undo button is disabled and reads Undo in 5', () => {
  renderDialog()

  expect(screen.getByRole('button', { name: 'Undo in 5' })).toBeDisabled()
})

test('after one second it reads Undo in 4, and after five seconds it reads Undo and is enabled', () => {
  renderDialog()

  tick(1)
  expect(screen.getByRole('button', { name: 'Undo in 4' })).toBeDisabled()

  tick(4)
  expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()
})

test('pressing Undo after the countdown calls onUndo once', () => {
  const { onUndo } = renderDialog()

  tick(5)
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

  expect(onUndo).toHaveBeenCalledTimes(1)
})

test('pressing the disabled Undo button before the countdown ends does not call onUndo', () => {
  const { onUndo } = renderDialog()

  fireEvent.click(screen.getByRole('button', { name: 'Undo in 5' }))
  tick(2)
  fireEvent.click(screen.getByRole('button', { name: 'Undo in 3' }))

  expect(onUndo).not.toHaveBeenCalled()
})

test('Cancel calls onCancel before the countdown, and is enabled throughout', () => {
  const { onCancel, onUndo } = renderDialog()

  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(onCancel).toHaveBeenCalledTimes(1)
  expect(onUndo).not.toHaveBeenCalled()
})

test('with waitSeconds 0 the Undo button is enabled at once', () => {
  const { onUndo } = renderDialog({ waitSeconds: 0 })

  const undo = screen.getByRole('button', { name: 'Undo' })
  expect(undo).toBeEnabled()
  fireEvent.click(undo)

  expect(onUndo).toHaveBeenCalledTimes(1)
})

test('unmounting clears the countdown interval', () => {
  const { unmount } = renderDialog()
  expect(vi.getTimerCount()).toBeGreaterThan(0)

  unmount()

  expect(vi.getTimerCount()).toBe(0)
})
