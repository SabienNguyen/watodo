// @vitest-environment jsdom
import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { SpendConfirm } from './SpendConfirm'

const ONE_SLOT = [{ id: 'post-work', name: 'Post work' }]
const THREE_SLOTS = [
  { id: 'post-work', name: 'Post work' },
  { id: 'post-dinner', name: 'Post dinner' },
  { id: 'bedtime', name: 'Bedtime' },
]

function renderConfirm() {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <SpendConfirm
      choices={ONE_SLOT}
      throughId="post-work"
      activityName="Gym"
      onThroughChange={vi.fn()}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  )
  return { onConfirm, onCancel }
}

/** Keeps the through choice in state, as NowScreen does, so the title follows the buttons. */
function StatefulConfirm({ onThroughChange }: { onThroughChange(id: string): void }) {
  const [throughId, setThroughId] = useState('post-work')
  return (
    <SpendConfirm
      choices={THREE_SLOTS}
      throughId={throughId}
      activityName="X"
      onThroughChange={id => {
        onThroughChange(id)
        setThroughId(id)
      }}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />
  )
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

test('with one slot to offer there is no Through row', () => {
  renderConfirm()

  expect(screen.queryByText('Through')).toBeNull()
  expect(screen.queryByRole('group', { name: 'Through' })).toBeNull()
})

test('with three slots, Through shows a button per slot, the first pressed, and choosing Bedtime retitles and reports it', () => {
  const onThroughChange = vi.fn()
  render(<StatefulConfirm onThroughChange={onThroughChange} />)

  const group = screen.getByRole('group', { name: 'Through' })
  expect(within(group).getByRole('button', { name: 'Post work' })).toHaveAttribute('aria-pressed', 'true')
  expect(within(group).getByRole('button', { name: 'Post dinner' })).toHaveAttribute('aria-pressed', 'false')
  expect(within(group).getByRole('button', { name: 'Bedtime' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('heading', { name: 'Spend Post work on X?' })).toBeInTheDocument()

  fireEvent.click(within(group).getByRole('button', { name: 'Bedtime' }))

  expect(onThroughChange).toHaveBeenCalledWith('bedtime')
  expect(screen.getByRole('heading', { name: 'Spend Post work – Bedtime on X?' })).toBeInTheDocument()
  expect(within(group).getByRole('button', { name: 'Bedtime' })).toHaveAttribute('aria-pressed', 'true')
  expect(within(group).getByRole('button', { name: 'Post work' })).toHaveAttribute('aria-pressed', 'false')
})
