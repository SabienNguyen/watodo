// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import {
  addPastEntry, confirmDay, createWatodoStore, dayKeyOf, finishSetup, readSnapshot, setUpStarter,
  type Clock, type Id, type WatodoStore,
} from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { JournalScreen } from './JournalScreen'

const MONDAY_1745: Clock = () => new Date(2026, 9, 12, 17, 45)
const TUESDAY_0900: Clock = () => new Date(2026, 9, 13, 9, 0)

function finishedStore(): WatodoStore {
  const store = createWatodoStore()
  setUpStarter(store)
  finishSetup(store)
  return store
}

function sectionId(store: WatodoStore, name: string): Id {
  const section = readSnapshot(store).sections.find(s => s.name === name)
  if (!section) throw new Error(`no section ${name}`)
  return section.id
}

function activityId(store: WatodoStore, name: string): Id {
  const activity = readSnapshot(store).activities.find(a => a.name === name)
  if (!activity) throw new Error(`no activity ${name}`)
  return activity.id
}

function basicTemplateId(store: WatodoStore): Id {
  return readSnapshot(store).templates[0].id
}

/** Today (Mon 12 Oct) has a Gym entry; Sat 10 Oct is confirmed as the basic day with a Guitar entry; Fri 9 Oct has a Call family entry and no day record. */
function seededStore(): WatodoStore {
  const store = finishedStore()
  confirmDay(store, () => new Date(2026, 9, 10, 12, 0), basicTemplateId(store))
  addPastEntry(store, {
    activityId: activityId(store, 'Gym'), sectionId: sectionId(store, 'Post work'), at: new Date(2026, 9, 12, 17, 50),
  })
  addPastEntry(store, {
    activityId: activityId(store, 'Guitar'), sectionId: sectionId(store, 'Post dinner'), at: new Date(2026, 9, 10, 19, 45),
  })
  addPastEntry(store, {
    activityId: activityId(store, 'Call family'), sectionId: sectionId(store, 'Post dinner'), at: new Date(2026, 9, 9, 20, 0),
  })
  return store
}

/** The section that holds this day heading. */
function daySection(heading: string): HTMLElement {
  return screen.getByRole('heading', { name: heading }).closest('section') as HTMLElement
}

/** The row for this activity name. */
function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest('li') as HTMLElement
}

describe('JournalScreen', () => {
  test('with nothing logged shows today and Nothing logged yet.', () => {
    renderWithWatodo(<JournalScreen />, { clock: MONDAY_1745 })

    expect(screen.getByRole('heading', { name: 'Mon 12 Oct' })).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Nothing logged yet.')).toBeInTheDocument()
  })

  test('today comes first, and each entry shows its time, activity and section', () => {
    renderWithWatodo(<JournalScreen />, { store: seededStore(), clock: MONDAY_1745 })

    const headings = screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)
    expect(headings).toEqual(['Mon 12 Oct', 'Sat 10 Oct', 'Fri 9 Oct'])

    const today = daySection('Mon 12 Oct')
    expect(within(today).getByText('17:50')).toBeInTheDocument()
    expect(within(today).getByText('Gym')).toBeInTheDocument()
    expect(within(today).getByText('Post work')).toBeInTheDocument()
  })

  test('an earlier day shows its template when a day record exists, else No template recorded', () => {
    renderWithWatodo(<JournalScreen />, { store: seededStore(), clock: MONDAY_1745 })

    expect(within(daySection('Sat 10 Oct')).getByText('Basic day')).toBeInTheDocument()
    expect(within(daySection('Fri 9 Oct')).getByText('No template recorded')).toBeInTheDocument()
  })

  test('an entry logged at 00:15 on Tuesday appears under Monday', () => {
    const store = finishedStore()
    addPastEntry(store, {
      activityId: activityId(store, 'Journal'), sectionId: sectionId(store, 'Bedtime'), at: new Date(2026, 9, 13, 0, 15),
    })
    renderWithWatodo(<JournalScreen />, { store, clock: TUESDAY_0900 })

    const monday = daySection('Mon 12 Oct')
    expect(within(monday).getByText('00:15')).toBeInTheDocument()
    expect(within(monday).getByText('Journal')).toBeInTheDocument()
    expect(within(daySection('Tue 13 Oct')).queryByText('Journal')).toBeNull()
  })

  test('Delete removes the entry from the snapshot', () => {
    const { store } = renderWithWatodo(<JournalScreen />, { store: seededStore(), clock: MONDAY_1745 })

    fireEvent.click(within(rowOf('Gym')).getByRole('button', { name: 'Delete' }))

    expect(screen.queryByText('Gym')).toBeNull()
    expect(readSnapshot(store).journal.map(e => e.activityId)).not.toContain(activityId(store, 'Gym'))
  })

  test('Edit changes time, note and minutes and keeps the entry on its day', () => {
    const { store } = renderWithWatodo(<JournalScreen />, { store: seededStore(), clock: MONDAY_1745 })

    fireEvent.click(within(rowOf('Gym')).getByRole('button', { name: 'Edit' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Edit entry')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Time')).toHaveValue('17:50')

    fireEvent.change(within(dialog).getByLabelText('Time'), { target: { value: '18:30' } })
    fireEvent.change(within(dialog).getByLabelText('Note'), { target: { value: 'felt good' } })
    fireEvent.change(within(dialog).getByLabelText('Minutes'), { target: { value: '40' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    const entry = readSnapshot(store).journal.find(e => e.activityId === activityId(store, 'Gym'))
    expect(entry?.loggedAt).toBe(new Date(2026, 9, 12, 18, 30).getTime())
    expect(entry?.note).toBe('felt good')
    expect(entry?.durationMinutes).toBe(40)
    expect(entry && dayKeyOf(new Date(entry.loggedAt))).toBe('2026-10-12')
    expect(within(daySection('Mon 12 Oct')).getByText('18:30')).toBeInTheDocument()
    expect(within(daySection('Mon 12 Oct')).getByText('felt good')).toBeInTheDocument()
    expect(within(daySection('Mon 12 Oct')).getByText('40 min')).toBeInTheDocument()
  })

  test('the day note saves on blur and clearing it removes it', () => {
    const { store } = renderWithWatodo(<JournalScreen />, { store: seededStore(), clock: MONDAY_1745 })
    const note = within(daySection('Mon 12 Oct')).getByRole('textbox', { name: 'Day note' })

    fireEvent.change(note, { target: { value: 'Slow start' } })
    fireEvent.blur(note)
    expect(readSnapshot(store).days.find(d => d.day === '2026-10-12')?.note).toBe('Slow start')

    fireEvent.change(note, { target: { value: '' } })
    fireEvent.blur(note)
    expect(readSnapshot(store).days.find(d => d.day === '2026-10-12')?.note).toBeUndefined()
  })
})

describe('Add entry', () => {
  function openAddEntry(): HTMLElement {
    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }))
    return screen.getByRole('dialog')
  }

  /** The option labels of a select, without the empty placeholder. */
  function optionNames(select: HTMLElement): string[] {
    return within(select).getAllByRole('option')
      .filter(option => (option as HTMLOptionElement).value !== '')
      .map(option => option.textContent ?? '')
  }

  test('Day and Time default to today and now, and Save waits for a section and an activity', () => {
    const { store } = renderWithWatodo(<JournalScreen />, { clock: MONDAY_1745 })

    const dialog = openAddEntry()
    expect(within(dialog).getByText('Add an entry')).toBeInTheDocument()
    const day = within(dialog).getByLabelText('Day')
    expect(day).toHaveAttribute('type', 'date')
    expect(day).toHaveValue('2026-10-12')
    expect(day).toHaveAttribute('max', '2026-10-12')
    expect(within(dialog).getByLabelText('Time')).toHaveValue('17:45')
    const save = within(dialog).getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()

    fireEvent.change(within(dialog).getByLabelText('Section'), { target: { value: sectionId(store, 'Post work') } })
    expect(save).toBeDisabled()
  })

  test('the Activity list offers only the chosen section activities', () => {
    const { store } = renderWithWatodo(<JournalScreen />, { clock: MONDAY_1745 })
    const dialog = openAddEntry()
    const section = within(dialog).getByLabelText('Section')
    const activity = within(dialog).getByLabelText('Activity')

    fireEvent.change(section, { target: { value: sectionId(store, 'Post work') } })
    expect(optionNames(activity)).toEqual(['Gym', 'Walk', 'Read'])

    fireEvent.change(section, { target: { value: sectionId(store, 'Post dinner') } })
    expect(optionNames(activity)).toEqual(['Guitar', 'Call family', 'Read'])
  })

  test('saving adds an entry on the chosen day, at the chosen time, in the chosen section', () => {
    const { store } = renderWithWatodo(<JournalScreen />, { clock: MONDAY_1745 })
    const dialog = openAddEntry()

    fireEvent.change(within(dialog).getByLabelText('Day'), { target: { value: '2026-10-10' } })
    fireEvent.change(within(dialog).getByLabelText('Time'), { target: { value: '19:45' } })
    fireEvent.change(within(dialog).getByLabelText('Section'), { target: { value: sectionId(store, 'Post dinner') } })
    fireEvent.change(within(dialog).getByLabelText('Activity'), { target: { value: activityId(store, 'Guitar') } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    const added = readSnapshot(store).journal
    expect(added).toHaveLength(1)
    expect(added[0].activityId).toBe(activityId(store, 'Guitar'))
    expect(added[0].sectionId).toBe(sectionId(store, 'Post dinner'))
    expect(added[0].loggedAt).toBe(new Date(2026, 9, 10, 19, 45).getTime())
    expect(added[0].note).toBeUndefined()
    expect(added[0].durationMinutes).toBeUndefined()
    expect(within(daySection('Sat 10 Oct')).getByText('Guitar')).toBeInTheDocument()
  })

  test('an optional note and minutes are saved when given', () => {
    const { store } = renderWithWatodo(<JournalScreen />, { clock: MONDAY_1745 })
    const dialog = openAddEntry()

    fireEvent.change(within(dialog).getByLabelText('Section'), { target: { value: sectionId(store, 'Post work') } })
    fireEvent.change(within(dialog).getByLabelText('Activity'), { target: { value: activityId(store, 'Walk') } })
    fireEvent.change(within(dialog).getByLabelText('Note'), { target: { value: 'by the river' } })
    fireEvent.change(within(dialog).getByLabelText('Minutes'), { target: { value: '25' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    const added = readSnapshot(store).journal[0]
    expect(added.note).toBe('by the river')
    expect(added.durationMinutes).toBe(25)
  })
})
