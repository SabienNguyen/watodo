// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import {
  addBond, confirmDay, createWatodoStore, finishSetup, logActivity, readSnapshot, setEntryBond, setUpStarter,
  type Clock, type Id, type WatodoStore,
} from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { WithBonds } from './WithBonds'

/** Monday 12 Oct 2026 at 17:minutes local. */
const at = (minutes: number): Clock => () => new Date(2026, 9, 12, 17, minutes)

/** The starter store with the basic day confirmed for today, so Post work is the current slot. */
function basicDayStore(): WatodoStore {
  const store = createWatodoStore()
  setUpStarter(store)
  finishSetup(store)
  confirmDay(store, at(45), readSnapshot(store).templates[0].id)
  return store
}

function activityId(store: WatodoStore, name: string): Id {
  const activity = readSnapshot(store).activities.find(a => a.name === name)
  if (activity === undefined) throw new Error(`no activity ${name}`)
  return activity.id
}

/** Logs a quick entry in Post work at the given minute and returns its entry id. */
function logQuick(store: WatodoStore, name: string, minute: number): Id {
  const result = logActivity(store, at(minute), activityId(store, name))
  if (result.status !== 'logged') throw new Error(`could not log ${name}`)
  return result.entryId
}

function bondId(store: WatodoStore, name: string): Id {
  const bond = readSnapshot(store).bonds.find(row => row.name === name)
  if (bond === undefined) throw new Error(`no bond ${name}`)
  return bond.id
}

function companyOf(store: WatodoStore, entryId: Id) {
  return readSnapshot(store).company.filter(row => row.entryId === entryId)
}

/** Types a name into the New bond field and presses Add. */
function addNamed(name: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'New bond' }), { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
}

function renderWith(store: WatodoStore, entryId: Id, onClose = vi.fn()) {
  return renderWithWatodo(
    <>
      <WithBonds entryId={entryId} activityName="Gym" onClose={onClose} />
      <Toaster />
    </>,
    { store, clock: at(50) },
  )
}

describe('WithBonds', () => {
  // Sonner keeps its toast list at module level, so clear it between tests.
  afterEach(() => {
    toast.dismiss()
  })

  test('lists the recent bonds, and tapping one puts it on the entry and off again', () => {
    const store = basicDayStore()
    const gym = logQuick(store, 'Gym', 45)
    addBond(store, 'Alex')
    addBond(store, 'Sam')
    renderWith(store, gym)

    const alex = screen.getByRole('button', { name: 'Alex' })
    expect(alex).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Sam' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(alex)
    expect(alex).toHaveAttribute('aria-pressed', 'true')
    expect(companyOf(store, gym)).toEqual([{ entryId: gym, bondId: bondId(store, 'Alex') }])

    fireEvent.click(alex)
    expect(alex).toHaveAttribute('aria-pressed', 'false')
    expect(companyOf(store, gym)).toEqual([])
  })

  test('several bonds can be on one entry at once', () => {
    const store = basicDayStore()
    const gym = logQuick(store, 'Gym', 45)
    addBond(store, 'Alex')
    addBond(store, 'Sam')
    addBond(store, 'Kim')
    renderWith(store, gym)

    for (const name of ['Alex', 'Sam', 'Kim']) fireEvent.click(screen.getByRole('button', { name }))

    for (const name of ['Alex', 'Sam', 'Kim']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
    }
    expect(companyOf(store, gym)).toHaveLength(3)
  })

  test('a new name creates the bond, puts it on the entry, and shows New bond', async () => {
    const store = basicDayStore()
    const gym = logQuick(store, 'Gym', 45)
    renderWith(store, gym)

    addNamed('Jo')

    expect(readSnapshot(store).bonds.map(bond => bond.name)).toEqual(['Jo'])
    expect(companyOf(store, gym)).toEqual([{ entryId: gym, bondId: bondId(store, 'Jo') }])
    expect(screen.getByRole('button', { name: 'Jo' })).toHaveAttribute('aria-pressed', 'true')
    expect((await screen.findByText('New bond')).parentElement).toHaveTextContent('Jo')
  })

  test('putting a bond on an entry that makes its third entry shows Rank 2', async () => {
    const store = basicDayStore()
    const gym = logQuick(store, 'Gym', 45)
    const walk = logQuick(store, 'Walk', 46)
    const read = logQuick(store, 'Read', 47)
    const sam = addBond(store, 'Sam').id
    setEntryBond(store, walk, sam, true)
    setEntryBond(store, read, sam, true)
    renderWith(store, gym)

    fireEvent.click(screen.getByRole('button', { name: 'Sam' }))

    expect((await screen.findByText('Rank 2')).parentElement).toHaveTextContent('Sam')
    expect(screen.queryByText('New bond')).toBeNull()
  })

  test('adding a name that Alex already has reuses Alex, with no New bond toast', async () => {
    const store = basicDayStore()
    const gym = logQuick(store, 'Gym', 45)
    const alex = addBond(store, 'Alex').id
    renderWith(store, gym)

    addNamed('alex')

    expect(readSnapshot(store).bonds).toHaveLength(1)
    expect(companyOf(store, gym)).toEqual([{ entryId: gym, bondId: alex }])
    expect(screen.getByRole('button', { name: 'Alex' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText('Rank 1')).toBeInTheDocument()
    expect(screen.queryByText('New bond')).toBeNull()
  })

  test('Done closes the dialog', () => {
    const store = basicDayStore()
    const gym = logQuick(store, 'Gym', 45)
    const onClose = vi.fn()
    renderWith(store, gym, onClose)

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
