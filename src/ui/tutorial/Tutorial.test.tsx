// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import {
  createWatodoStore, readSnapshot, setupState, setUpStarter, type WatodoStore,
} from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { Tutorial } from './Tutorial'

function startChoosing() {
  fireEvent.click(screen.getByRole('button', { name: 'Choose a starting day' }))
}

test('a brand-new store shows the welcome and the Choose a starting day button', () => {
  renderWithWatodo(<Tutorial />, { store: createWatodoStore() })

  expect(screen.getByRole('heading', { name: 'Welcome to watodo' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Choose a starting day' })).toBeInTheDocument()
})

test('picking Office day and pressing Save makes setup done, with one template', () => {
  const store: WatodoStore = createWatodoStore()
  renderWithWatodo(<Tutorial />, { store })

  startChoosing()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Office day' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))

  expect(setupState(store)).toBe('done')
  const snap = readSnapshot(store)
  expect(snap.templates.map(template => template.name)).toEqual(['Office day'])
  expect(snap.defaultTemplateId).toBe(snap.templates[0].id)
})

test('cancelling the editor returns to the welcome step with nothing created', () => {
  const store = createWatodoStore()
  renderWithWatodo(<Tutorial />, { store })

  startChoosing()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Weekend' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

  expect(screen.getByRole('heading', { name: 'Welcome to watodo' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Choose a starting day' })).toBeInTheDocument()
  expect(readSnapshot(store)).toEqual(readSnapshot(createWatodoStore()))
  expect(setupState(store)).toBe('new')
})

test('cancelling the starter picker writes nothing and stays on the welcome step', () => {
  const store = createWatodoStore()
  renderWithWatodo(<Tutorial />, { store })

  startChoosing()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

  expect(screen.getByRole('heading', { name: 'Welcome to watodo' })).toBeInTheDocument()
  expect(setupState(store)).toBe('new')
})

test('a store set up before this change shows Make it yours with the Slots part and Done, open watodo', () => {
  const store = createWatodoStore()
  setUpStarter(store)
  renderWithWatodo(<Tutorial />, { store })

  expect(screen.getByRole('heading', { name: 'Make it yours' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Slots' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Done, open watodo' }))

  expect(setupState(store)).toBe('done')
})
