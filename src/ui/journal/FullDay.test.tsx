// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import {
  confirmDay, createWatodoStore, draftFromStarter, finishSetup, readSnapshot, saveTemplate, setUpStarter,
  type WatodoStore,
} from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { FullDay } from './FullDay'

/** The starter store with the Weekend starter saved (its Free time slot repeats) and confirmed for Mon 12 Oct. */
function weekendStore(): WatodoStore {
  const store = createWatodoStore()
  setUpStarter(store)
  finishSetup(store)
  const draft = draftFromStarter(readSnapshot(store), 'weekend')
  if (draft === null) throw new Error('no weekend starter')
  saveTemplate(store, draft)
  const weekend = readSnapshot(store).templates.find(template => template.name === 'Weekend')
  if (weekend === undefined) throw new Error('no weekend template')
  confirmDay(store, () => new Date(2026, 9, 12, 9, 0), weekend.id)
  return store
}

describe('FullDay', () => {
  test('numbers the repeated Free time: row 2 is Free time #1 and row 4 is Free time #2', () => {
    renderWithWatodo(<FullDay />, { store: weekendStore() })

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(7)
    expect(rows[1]).toHaveTextContent('Free time #1')
    expect(rows[3]).toHaveTextContent('Free time #2')
    expect(screen.queryByText('Free time')).toBeNull()
  })

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
