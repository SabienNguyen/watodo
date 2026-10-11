// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { SpendConfirm } from './SpendConfirm'

function renderConfirm() {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(<SpendConfirm slotName="Post work" activityName="Gym" onConfirm={onConfirm} onCancel={onCancel} />)
  return { onConfirm, onCancel }
}

test('asks Spend Post work on Gym? with Spend it and Cancel', () => {
  renderConfirm()

  expect(screen.getByRole('heading', { name: 'Spend Post work on Gym?' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Spend it' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
})

test('Spend it calls onConfirm only', () => {
  const { onConfirm, onCancel } = renderConfirm()

  fireEvent.click(screen.getByRole('button', { name: 'Spend it' }))

  expect(onConfirm).toHaveBeenCalledTimes(1)
  expect(onCancel).not.toHaveBeenCalled()
})

test('Cancel calls onCancel only', () => {
  const { onConfirm, onCancel } = renderConfirm()

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(onCancel).toHaveBeenCalledTimes(1)
  expect(onConfirm).not.toHaveBeenCalled()
})
