// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import App from '@/App'
import { createWatodoStore } from '@/domain'
import { renderWithWatodo } from '@/ui/testing'

test('renders the watodo heading', () => {
  renderWithWatodo(<App />)
  expect(screen.getByRole('heading', { level: 1, name: 'watodo' })).toBeInTheDocument()
})

test('a new store shows the tutorial and no tab bar until a starting day is saved, then the five tabs with Now current', () => {
  renderWithWatodo(<App />, { store: createWatodoStore() })

  expect(screen.getByRole('heading', { level: 1, name: 'watodo' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Choose a starting day' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Office day' }))

  expect(screen.getByRole('heading', { name: 'New template' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation')).toBeNull()

  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))

  const tabs = within(screen.getByRole('navigation'))
  const buttons = tabs.getAllByRole('button')
  expect(buttons.map(button => button.textContent)).toEqual(['Now', 'Journal', 'Progress', 'Bonds', 'Edit'])
  expect(tabs.getByRole('button', { name: 'Now' })).toHaveAttribute('aria-current', 'page')
  expect(tabs.getByRole('button', { name: 'Journal' })).not.toHaveAttribute('aria-current')
  expect(tabs.queryByRole('button', { name: 'Day' })).toBeNull()
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

test('?tab=progress opens on Progress, and the parameter is taken out of the address, keeping the others', () => {
  window.history.replaceState(null, '', '/?tab=progress&demo')
  renderWithWatodo(<App />)

  const tabs = within(screen.getByRole('navigation'))
  expect(tabs.getByRole('button', { name: 'Progress' })).toHaveAttribute('aria-current', 'page')
  const params = new URLSearchParams(window.location.search)
  expect(params.has('tab')).toBe(false)
  expect(params.has('demo')).toBe(true)
})

test('?tab=bonds opens Bonds, between Progress and Edit in the tab bar', () => {
  window.history.replaceState(null, '', '/?tab=bonds')
  renderWithWatodo(<App />)

  const tabs = within(screen.getByRole('navigation'))
  expect(tabs.getAllByRole('button').map(button => button.textContent)).toEqual(['Now', 'Journal', 'Progress', 'Bonds', 'Edit'])
  expect(tabs.getByRole('button', { name: 'Bonds' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByText('No bonds yet.')).toBeInTheDocument()
})

test('the ?tab= name is matched without case, and an unknown name opens Now', () => {
  window.history.replaceState(null, '', '/?tab=EDIT')
  const { unmount } = renderWithWatodo(<App />)
  expect(within(screen.getByRole('navigation')).getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-current', 'page')
  unmount()

  window.history.replaceState(null, '', '/?tab=nope')
  renderWithWatodo(<App />)
  expect(within(screen.getByRole('navigation')).getByRole('button', { name: 'Now' })).toHaveAttribute('aria-current', 'page')
  expect(window.location.search).toBe('')
})
