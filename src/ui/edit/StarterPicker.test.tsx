// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { createWatodoStore, finishSetup, readSnapshot, setUpStarter, type WatodoStore } from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { StarterPicker } from './StarterPicker'

const STARTER_NAMES = ['Office day', 'Work from home', 'School day', 'Weekend', 'Day off']

function finishedStore(): WatodoStore {
  const store = createWatodoStore()
  setUpStarter(store)
  finishSetup(store)
  return store
}

function renderPicker(store: WatodoStore = finishedStore()) {
  const onPick = vi.fn()
  const onClose = vi.fn()
  renderWithWatodo(<StarterPicker open onPick={onPick} onClose={onClose} />, { store })
  return { store, onPick, onClose }
}

describe('StarterPicker', () => {
  test('is a dialog titled Start a new template', () => {
    renderPicker()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Start a new template' })).toBeInTheDocument()
  })

  test('lists the five starters, Copy of Basic day, and Blank', () => {
    renderPicker()

    for (const name of STARTER_NAMES) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Copy of Basic day' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Blank' })).toBeInTheDocument()
  })

  test('shows each starter steps under its name, slots by their slot name', () => {
    renderPicker()

    const office = screen.getByRole('button', { name: 'Office day' })
    expect(office).toHaveAccessibleDescription(
      'Morning routine · Commute · Work · Post work · Dinner · Post dinner · Bedtime',
    )
    expect(within(office).getByText('Morning routine · Commute · Work · Post work · Dinner · Post dinner · Bedtime'))
      .toBeInTheDocument()
  })

  test('the copy heading shows when the user has templates', () => {
    renderPicker()

    expect(screen.getByText('Copy one of yours')).toBeInTheDocument()
  })

  test('the copy heading and copy buttons are absent when the user has no templates', () => {
    renderPicker(createWatodoStore())

    expect(screen.queryByText('Copy one of yours')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Copy of/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Blank' })).toBeInTheDocument()
  })

  test('pressing Weekend calls onPick with a Weekend draft whose label is new', () => {
    const { onPick } = renderPicker()

    fireEvent.click(screen.getByRole('button', { name: 'Weekend' }))

    expect(onPick).toHaveBeenCalledTimes(1)
    const draft = onPick.mock.calls[0][0]
    expect(draft.name).toBe('Weekend')
    expect(draft.label).toEqual({ newName: 'Weekend', weekdays: [5, 6] })
  })

  test('picking a starter writes nothing to the store', () => {
    const { store, onPick } = renderPicker()
    const before = readSnapshot(store)

    fireEvent.click(screen.getByRole('button', { name: 'Weekend' }))

    expect(onPick).toHaveBeenCalledTimes(1)
    expect(readSnapshot(store).templates).toHaveLength(before.templates.length)
    expect(readSnapshot(store)).toEqual(before)
  })

  test('Copy of Basic day calls onPick with a copy draft of the Basic day template', () => {
    const { onPick } = renderPicker()

    fireEvent.click(screen.getByRole('button', { name: 'Copy of Basic day' }))

    const draft = onPick.mock.calls[0][0]
    expect(draft.name).toBe('Basic day copy')
    expect(draft.templateId).toBeUndefined()
    expect(draft.steps).toHaveLength(6)
  })

  test('Blank calls onPick with an empty draft', () => {
    const { onPick } = renderPicker()

    fireEvent.click(screen.getByRole('button', { name: 'Blank' }))

    const draft = onPick.mock.calls[0][0]
    expect(draft.name).toBe('New template')
    expect(draft.steps).toEqual([])
  })

  test('Cancel calls onClose and picks nothing', () => {
    const { onPick, onClose } = renderPicker()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onPick).not.toHaveBeenCalled()
  })
})
