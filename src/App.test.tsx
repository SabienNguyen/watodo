// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from '@/App'
import { createWatodoStore } from '@/domain'
import { renderWithWatodo } from '@/ui/testing'

test('renders the watodo heading', () => {
  renderWithWatodo(<App />)
  expect(screen.getByRole('heading', { level: 1, name: 'watodo' })).toBeInTheDocument()
})

test('a new store shows the tutorial and no tab bar until Done, open watodo, then the four tabs with Now current', () => {
  renderWithWatodo(<App />, { store: createWatodoStore() })

  expect(screen.getByRole('heading', { level: 1, name: 'watodo' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Start with the basic day' }))

  expect(screen.getByRole('heading', { name: 'Make it yours' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Done, open watodo' }))

  const tabs = within(screen.getByRole('navigation'))
  const buttons = tabs.getAllByRole('button')
  expect(buttons.map(button => button.textContent)).toEqual(['Now', 'Journal', 'Progress', 'Edit'])
  expect(tabs.getByRole('button', { name: 'Now' })).toHaveAttribute('aria-current', 'page')
  expect(tabs.getByRole('button', { name: 'Journal' })).not.toHaveAttribute('aria-current')
  expect(tabs.queryByRole('button', { name: 'Day' })).toBeNull()
})
