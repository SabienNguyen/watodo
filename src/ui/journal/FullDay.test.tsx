// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import {
  confirmDay, createWatodoStore, draftFromStarter, finishSetup, goToSlot, logActivity, readSnapshot, saveTemplate,
  setActivityCommitted, setUpStarter, type Clock, type Id, type WatodoStore,
} from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { FullDay } from './FullDay'

const MONDAY_1745: Clock = () => new Date(2026, 9, 12, 17, 45)

function activityId(store: WatodoStore, name: string): Id {
  const activity = readSnapshot(store).activities.find(a => a.name === name)
  if (!activity) throw new Error(`no activity ${name}`)
  return activity.id
}

/** The basic day confirmed for Mon 12 Oct at 17:45, so the first slot, Post work, is current. */
function basicDayStore(): WatodoStore {
  const store = createWatodoStore()
  setUpStarter(store)
  finishSetup(store)
  confirmDay(store, MONDAY_1745, readSnapshot(store).templates[0].id)
  return store
}

/** Basic day with Gym and Walk logged quick in Post work, then Read logged committed, which spends it. */
function postWorkLoggedStore(): WatodoStore {
  const store = basicDayStore()
  logActivity(store, MONDAY_1745, activityId(store, 'Gym'))
  logActivity(store, () => new Date(2026, 9, 12, 17, 46), activityId(store, 'Walk'))
  setActivityCommitted(store, activityId(store, 'Read'), true)
  logActivity(store, () => new Date(2026, 9, 12, 17, 47), activityId(store, 'Read'))
  return store
}

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
  test('numbers the repeated Free time: row 4 is Free time #1 and row 6 is Free time #2', () => {
    renderWithWatodo(<FullDay />, { store: weekendStore() })

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(11)
    expect(rows[3]).toHaveTextContent('Free time #1')
    expect(rows[5]).toHaveTextContent('Free time #2')
    expect(screen.queryByText('Free time')).toBeNull()
  })

  test('lists the basic day items in order, with no heading and no numbers', () => {
    renderWithWatodo(<FullDay />)

    expect(screen.queryByRole('heading')).toBeNull()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(10)
    const names = [
      'Wake up',
      'Brush teeth',
      'Change clothes',
      'Work',
      'Post work',
      'Dinner',
      'Post dinner',
      'Bedtime',
      'Brush teeth',
      'Sleep',
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

  test('has no buttons and no footer note', () => {
    renderWithWatodo(<FullDay />)

    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByText("Fixed steps are shown here only. They can't be tapped or logged.")).not.toBeInTheDocument()
  })

  test('a slot with entries shows one step per entry in the order logged, the committed one badged, and not the slot name', () => {
    renderWithWatodo(<FullDay />, { store: postWorkLoggedStore(), clock: MONDAY_1745 })

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(12)
    expect(rows[4]).toHaveTextContent('Gym')
    expect(rows[5]).toHaveTextContent('Walk')
    expect(rows[6]).toHaveTextContent('Read')
    for (const row of rows.slice(4, 7)) {
      expect(within(row).queryByText('slot')).toBeNull()
      expect(within(row).queryByText('fixed')).toBeNull()
    }
    expect(within(rows[4]).queryByText('committed')).toBeNull()
    expect(within(rows[5]).queryByText('committed')).toBeNull()
    expect(within(rows[6]).getByText('committed')).toBeInTheDocument()
    expect(screen.queryByText('Post work')).toBeNull()
  })

  test('a slot with nothing logged still shows its name and activities', () => {
    renderWithWatodo(<FullDay />, { store: postWorkLoggedStore(), clock: MONDAY_1745 })

    const postDinner = screen.getByText('Post dinner').closest('li') as HTMLElement
    expect(postDinner).toHaveTextContent('Guitar, Call family, Read')
    expect(within(postDinner).getByText('slot')).toBeInTheDocument()
  })

  test('logged steps of the current slot carry the current highlight', () => {
    const store = basicDayStore()
    logActivity(store, MONDAY_1745, activityId(store, 'Gym'))
    logActivity(store, () => new Date(2026, 9, 12, 17, 46), activityId(store, 'Walk'))
    renderWithWatodo(<FullDay />, { store, clock: () => new Date(2026, 9, 12, 17, 47) })

    const rows = screen.getAllByRole('listitem')
    expect(rows[4]).toHaveAttribute('aria-current', 'true')
    expect(rows[5]).toHaveAttribute('aria-current', 'true')
    expect(rows[6]).toHaveTextContent('Dinner')
    expect(rows[6]).not.toHaveAttribute('aria-current')
  })

  test('a repeated slot shows its logs under the occurrence they were logged in', () => {
    const store = weekendStore()
    const [firstFreeTime, secondFreeTime] = readSnapshot(store).items.filter(item => item.name === 'Free time')
    goToSlot(store, () => new Date(2026, 9, 12, 9, 0), firstFreeTime.id)
    logActivity(store, () => new Date(2026, 9, 12, 9, 1), activityId(store, 'Hike'))
    goToSlot(store, () => new Date(2026, 9, 12, 9, 2), secondFreeTime.id)
    logActivity(store, () => new Date(2026, 9, 12, 9, 3), activityId(store, 'Call family'))
    renderWithWatodo(<FullDay />, { store, clock: () => new Date(2026, 9, 12, 9, 4) })

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(11)
    expect(rows[3]).toHaveTextContent('Hike')
    expect(rows[3]).not.toHaveAttribute('aria-current')
    expect(rows[5]).toHaveTextContent('Call family')
    expect(rows[5]).toHaveAttribute('aria-current', 'true')
    expect(screen.queryByText(/Free time/)).toBeNull()
  })

  test('with no template renders nothing', () => {
    const { container } = renderWithWatodo(<FullDay />, { store: createWatodoStore() })

    expect(container).toBeEmptyDOMElement()
  })
})
