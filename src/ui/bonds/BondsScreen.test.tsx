// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import {
  addBond, addPastEntry, createWatodoStore, finishSetup, readSnapshot, setEntryBond, setUpStarter, type Id, type WatodoStore,
} from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { BondsScreen } from './BondsScreen'

function finishedStore(): WatodoStore {
  const store = createWatodoStore()
  setUpStarter(store)
  finishSetup(store)
  return store
}

function activityId(store: WatodoStore, name: string): Id {
  const activity = readSnapshot(store).activities.find(row => row.name === name)
  if (!activity) throw new Error(`no activity ${name}`)
  return activity.id
}

function sectionId(store: WatodoStore, name: string): Id {
  const section = readSnapshot(store).sections.find(row => row.name === name)
  if (!section) throw new Error(`no section ${name}`)
  return section.id
}

/** Logs an activity in Post work on each day, with the bond on every entry. */
function doneWith(store: WatodoStore, bondId: Id, activity: string, days: string[]) {
  for (const day of days) {
    const entryId = addPastEntry(store, {
      activityId: activityId(store, activity), sectionId: sectionId(store, 'Post work'), day,
    })
    setEntryBond(store, entryId, bondId, true)
  }
}

/**
 * Alex with four entries (Gym three times, Read once): rank 2, one of three toward rank 3, last
 * seen Sunday 11 Oct. Sam with one entry today: rank 1. Priya with none: no rank, never seen.
 */
function bondsStore(): WatodoStore {
  const store = finishedStore()
  const alex = addBond(store, 'Alex').id
  const sam = addBond(store, 'Sam').id
  addBond(store, 'Priya')
  doneWith(store, alex, 'Gym', ['2026-10-08', '2026-10-09', '2026-10-11'])
  doneWith(store, alex, 'Read', ['2026-10-10'])
  doneWith(store, sam, 'Gym', ['2026-10-12'])
  return store
}

function bondId(store: WatodoStore, name: string): Id {
  const bond = readSnapshot(store).bonds.find(row => row.name === name)
  if (!bond) throw new Error(`no bond ${name}`)
  return bond.id
}

function listedNames(): string[] {
  return within(screen.getByRole('list')).getAllByRole('button').map(button => button.getAttribute('aria-label') ?? '')
}

function openBond(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
}

describe('the Bonds list', () => {
  test('lists bonds by rank, then most recently seen, with their rank and last seen', () => {
    const store = bondsStore()
    renderWithWatodo(<BondsScreen />, { store })

    expect(listedNames()).toEqual(['Alex', 'Sam', 'Priya'])
    const alex = screen.getByRole('button', { name: 'Alex' })
    expect(within(alex).getByText('Rank 2')).toBeInTheDocument()
    expect(within(alex).getByText('last: yesterday')).toBeInTheDocument()
    const sam = screen.getByRole('button', { name: 'Sam' })
    expect(within(sam).getByText('Rank 1')).toBeInTheDocument()
    expect(within(sam).getByText('last: today')).toBeInTheDocument()
  })

  test('a bond with no entries shows neither a rank nor a last seen', () => {
    renderWithWatodo(<BondsScreen />, { store: bondsStore() })

    const priya = screen.getByRole('button', { name: 'Priya' })
    expect(within(priya).queryByText(/Rank/)).toBeNull()
    expect(within(priya).queryByText(/last:/)).toBeNull()
  })

  test('says so when there are no bonds', () => {
    renderWithWatodo(<BondsScreen />, { store: finishedStore() })

    expect(screen.getByText('No bonds yet.')).toBeInTheDocument()
  })

  test('adding a bond opens its page', () => {
    const store = finishedStore()
    renderWithWatodo(<BondsScreen />, { store })

    fireEvent.change(screen.getByRole('textbox', { name: 'Bond name' }), { target: { value: 'Jordan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add bond' }))

    expect(screen.getByRole('heading', { level: 2, name: 'Jordan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to Bonds' })).toBeInTheDocument()
    expect(readSnapshot(store).bonds.map(row => row.name)).toEqual(['Jordan'])
  })

  test('adding a name that Alex already has opens Alex, with no second bond', () => {
    const store = bondsStore()
    renderWithWatodo(<BondsScreen />, { store })

    fireEvent.change(screen.getByRole('textbox', { name: 'Bond name' }), { target: { value: 'alex' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add bond' }))

    expect(screen.getByRole('heading', { level: 2, name: 'Alex' })).toBeInTheDocument()
    expect(readSnapshot(store).bonds.filter(row => row.name === 'Alex')).toHaveLength(1)
  })
})

describe("a bond's page", () => {
  test('shows the rank, progress to the next rank, what is done together, and recent times', () => {
    renderWithWatodo(<BondsScreen />, { store: bondsStore() })
    openBond('Alex')

    expect(screen.getByText('Rank 2')).toBeInTheDocument()
    const progress = screen.getByRole('progressbar', { name: 'Progress to next rank' })
    expect(progress).toHaveAttribute('aria-valuenow', '1')
    expect(progress).toHaveAttribute('aria-valuemax', '3')
    expect(screen.getByText('1 of 3')).toBeInTheDocument()

    const together = screen.getByRole('group', { name: 'Together' })
    expect(within(together).getByText('Gym')).toBeInTheDocument()
    expect(within(together).getByText('3 times')).toBeInTheDocument()
    expect(within(together).getByText('Read')).toBeInTheDocument()
    expect(within(together).getByText('1 time')).toBeInTheDocument()

    const recent = screen.getByRole('group', { name: 'Recent' })
    expect(within(recent).getByText('Sun 11 Oct')).toBeInTheDocument()
    expect(within(recent).getByText('Sat 10 Oct')).toBeInTheDocument()
  })

  test('a bond with no entries shows progress from zero and no together or recent groups', () => {
    renderWithWatodo(<BondsScreen />, { store: bondsStore() })
    openBond('Priya')

    expect(screen.getByRole('progressbar', { name: 'Progress to next rank' })).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByText('0 of 1')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Together' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Recent' })).toBeNull()
  })

  test('renaming to a name another bond has shows the existing alert and keeps the name', () => {
    const store = bondsStore()
    renderWithWatodo(<BondsScreen />, { store })
    openBond('Sam')

    const name = screen.getByRole('textbox', { name: 'Bond name' })
    fireEvent.change(name, { target: { value: 'alex' } })
    fireEvent.blur(name)

    expect(screen.getByRole('alert')).toHaveTextContent('You already have Alex.')
    expect(readSnapshot(store).bonds.find(row => row.id === bondId(store, 'Sam'))?.name).toBe('Sam')
  })

  test('the catch-up days are stored on blur, and a blank removes them', () => {
    const store = bondsStore()
    renderWithWatodo(<BondsScreen />, { store })
    openBond('Alex')

    const catchUp = screen.getByRole('spinbutton', { name: 'Catch up after' })
    fireEvent.change(catchUp, { target: { value: '21' } })
    fireEvent.blur(catchUp)
    expect(readSnapshot(store).bonds.find(row => row.id === bondId(store, 'Alex'))?.catchUpDays).toBe(21)

    fireEvent.change(catchUp, { target: { value: '' } })
    fireEvent.blur(catchUp)
    expect(readSnapshot(store).bonds.find(row => row.id === bondId(store, 'Alex'))?.catchUpDays).toBeUndefined()
  })

  test('deleting asks first, and confirming returns to the list without the bond', () => {
    const store = bondsStore()
    renderWithWatodo(<BondsScreen />, { store })
    openBond('Sam')

    fireEvent.click(screen.getByRole('button', { name: 'Delete bond' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Delete "Sam"?')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete bond' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(listedNames()).toEqual(['Alex', 'Priya'])
    expect(readSnapshot(store).bonds.map(row => row.name)).toEqual(['Alex', 'Priya'])
  })

  test('cancelling the delete keeps the bond on its page', () => {
    const store = bondsStore()
    renderWithWatodo(<BondsScreen />, { store })
    openBond('Sam')

    fireEvent.click(screen.getByRole('button', { name: 'Delete bond' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('heading', { level: 2, name: 'Sam' })).toBeInTheDocument()
    expect(readSnapshot(store).bonds.map(row => row.name)).toContain('Sam')
  })
})
