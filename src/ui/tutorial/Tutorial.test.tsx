// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { createWatodoStore, setupState } from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { Tutorial } from './Tutorial'

test('a brand-new store shows the welcome', () => {
  renderWithWatodo(<Tutorial />, { store: createWatodoStore() })

  expect(screen.getByRole('heading', { name: 'Welcome to watodo' })).toBeInTheDocument()
})

test('starting with the basic day shows the customising step with the Post work section', () => {
  const { store } = renderWithWatodo(<Tutorial />, { store: createWatodoStore() })

  fireEvent.click(screen.getByRole('button', { name: 'Start with the basic day' }))

  expect(screen.getByRole('heading', { name: 'Make it yours' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Activities menu' })).toBeInTheDocument()
  const postWork = within(screen.getByRole('region', { name: 'Post work' }))
  expect(postWork.getByDisplayValue('Post work')).toBeInTheDocument()
  expect(setupState(store)).toBe('customising')
})

test('Done, open watodo finishes setup', () => {
  const { store } = renderWithWatodo(<Tutorial />, { store: createWatodoStore() })
  fireEvent.click(screen.getByRole('button', { name: 'Start with the basic day' }))

  fireEvent.click(screen.getByRole('button', { name: 'Done, open watodo' }))

  expect(setupState(store)).toBe('done')
})
