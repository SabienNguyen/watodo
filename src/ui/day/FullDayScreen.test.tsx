// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { createWatodoStore } from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { FullDayScreen } from './FullDayScreen'

describe('FullDayScreen', () => {
  test('lists the basic day items in order with their time ranges', () => {
    renderWithWatodo(<FullDayScreen />)

    expect(screen.getByRole('heading', { name: 'Basic day' })).toBeInTheDocument()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(6)
    expect(rows[0]).toHaveTextContent('06:30 to 08:30')
    expect(rows[0]).toHaveTextContent('Wake up, brush teeth, get ready')
    expect(rows[1]).toHaveTextContent('09:00 to 17:30')
    expect(rows[1]).toHaveTextContent('Work')
    expect(rows[2]).toHaveTextContent('17:30 to 19:00')
    expect(rows[2]).toHaveTextContent('Post work')
    expect(rows[3]).toHaveTextContent('19:00 to 19:30')
    expect(rows[3]).toHaveTextContent('Dinner')
    expect(rows[4]).toHaveTextContent('19:30 to 21:30')
    expect(rows[4]).toHaveTextContent('Post dinner')
    expect(rows[5]).toHaveTextContent('21:30 to 23:00')
    expect(rows[5]).toHaveTextContent('Bedtime')
  })

  test('marks the current item and lists its activities', () => {
    renderWithWatodo(<FullDayScreen />)

    const postWork = screen.getByText('Post work').closest('li') as HTMLElement
    expect(postWork).toHaveAttribute('aria-current', 'true')
    expect(postWork).toHaveTextContent('Gym, Walk, Read')
    expect(screen.getByText('Work').closest('li')).not.toHaveAttribute('aria-current')
  })

  test('fixed steps carry the fixed badge and slots carry the slot badge', () => {
    renderWithWatodo(<FullDayScreen />)

    const work = screen.getByText('Work').closest('li') as HTMLElement
    expect(within(work).getByText('fixed')).toBeInTheDocument()
    const postWork = screen.getByText('Post work').closest('li') as HTMLElement
    expect(within(postWork).getByText('slot')).toBeInTheDocument()
  })

  test('has no buttons and shows the footer note', () => {
    renderWithWatodo(<FullDayScreen />)

    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText("Fixed steps are shown here only. They can't be tapped or logged.")).toBeInTheDocument()
  })

  test('with no template says so', () => {
    renderWithWatodo(<FullDayScreen />, { store: createWatodoStore() })

    expect(screen.getByText('No template yet.')).toBeInTheDocument()
  })
})
