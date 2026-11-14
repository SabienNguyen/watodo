// @vitest-environment jsdom
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ThroughChoice } from './ThroughChoice'

const CHOICES = [
  { id: 'work', name: 'Post work' },
  { id: 'dinner', name: 'Post dinner' },
  { id: 'shower', name: 'Post-shower' },
]

/** The row with its choice kept in state, as the dialogs use it. */
function Row({ start }: { start: string }) {
  const [throughId, setThroughId] = useState(start)
  return <ThroughChoice choices={CHOICES} throughId={throughId} onThroughChange={setThroughId} />
}

function pressed(): string[] {
  return screen.getAllByRole('button').filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent ?? '')
}

test('tapping a later slot runs the span through it', () => {
  render(<Row start="work" />)
  fireEvent.click(screen.getByRole('button', { name: 'Post-shower' }))
  expect(pressed()).toEqual(['Post-shower'])
})

test('tapping the last filled slot takes it off, so the span ends one slot earlier', () => {
  render(<Row start="shower" />)
  fireEvent.click(screen.getByRole('button', { name: 'Post-shower' }))
  expect(pressed()).toEqual(['Post dinner'])
  fireEvent.click(screen.getByRole('button', { name: 'Post dinner' }))
  expect(pressed()).toEqual(['Post work'])
})

test('the first slot cannot be taken off', () => {
  render(<Row start="work" />)
  fireEvent.click(screen.getByRole('button', { name: 'Post work' }))
  expect(pressed()).toEqual(['Post work'])
})

test('tapping an earlier filled slot (not the last) ends the span there', () => {
  render(<Row start="shower" />)
  fireEvent.click(screen.getByRole('button', { name: 'Post work' }))
  expect(pressed()).toEqual(['Post work'])
})
