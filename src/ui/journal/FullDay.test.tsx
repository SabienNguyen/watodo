// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { createWatodoStore } from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { FullDay } from './FullDay'

describe('FullDay', () => {
  test('lists the basic day items in order, with no heading and no numbers', () => {
    renderWithWatodo(<FullDay />)

    expect(screen.queryByRole('heading')).toBeNull()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(6)
    const names = [
      'Wake up, brush teeth, get ready',
      'Work',
      'Post work',
      'Dinner',
      'Post dinner',
      'Bedtime',
    ]
    rows.forEach((row, index) => {
      expect(row).toHaveTextContent(names[index])
    })
    const list = rows[0].closest('ol') as HTMLElement
    expect(within(list).queryAllByText(/^\d+\.$/)).toHaveLength(0)
  })

  test('marks the current slot and lists its activities', () => {
    renderWithWatodo(<FullDay />)

    const postWork = screen.getByText('Post work').closest('li') as HTMLElement
    expect(postWork).toHaveAttribute('aria-current', 'true')
    expect(postWork).toHaveTextContent('Gym, Walk, Read')
    expect(screen.getByText('Work').closest('li')).not.toHaveAttribute('aria-current')
  })

  test('fixed steps carry the fixed badge and slots carry the slot badge', () => {
    renderWithWatodo(<FullDay />)

    const work = screen.getByText('Work').closest('li') as HTMLElement
    expect(within(work).getByText('fixed')).toBeInTheDocument()
    const postWork = screen.getByText('Post work').closest('li') as HTMLElement
    expect(within(postWork).getByText('slot')).toBeInTheDocument()
  })

  test('shows no clock time anywhere', () => {
    renderWithWatodo(<FullDay />)

    expect(document.body.textContent).not.toMatch(/\d{1,2}:\d{2}/)
  })

  test('has no buttons and shows the footer note', () => {
    renderWithWatodo(<FullDay />)

    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText("Fixed steps are shown here only. They can't be tapped or logged.")).toBeInTheDocument()
  })

  test('with no template renders nothing', () => {
    const { container } = renderWithWatodo(<FullDay />, { store: createWatodoStore() })

    expect(container).toBeEmptyDOMElement()
  })
})
