// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import {
  addPastEntry, confirmDay, createWatodoStore, dayKeyOf, draftFromStarter, finishSetup, goToSlot, logActivity,
  readSnapshot, saveTemplate, setUpStarter, type Clock, type Id, type WatodoStore,
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

function itemId(store: WatodoStore, name: string): Id {
  const item = readSnapshot(store).items.find(i => i.name === name)
  if (!item) throw new Error(`no item ${name}`)
  return item.id
}

function basicTemplateId(store: WatodoStore): Id {
  return readSnapshot(store).templates[0].id
}

/**
 * Today (Mon 12 Oct) has a Gym entry; Sun 11 Oct has a Walk entry; Sat 10 Oct is confirmed as the
 * basic day with a Guitar entry; Fri 9 Oct has a Call family entry and no day record.
 */
function seededStore(): WatodoStore {
  const store = finishedStore()
  confirmDay(store, () => new Date(2026, 9, 10, 12, 0), basicTemplateId(store))
  addPastEntry(store, { activityId: activityId(store, 'Gym'), sectionId: sectionId(store, 'Post work'), day: '2026-10-12' })
  addPastEntry(store, { activityId: activityId(store, 'Walk'), sectionId: sectionId(store, 'Post work'), day: '2026-10-11' })
  addPastEntry(store, { activityId: activityId(store, 'Guitar'), sectionId: sectionId(store, 'Post dinner'), day: '2026-10-10' })
  addPastEntry(store, { activityId: activityId(store, 'Call family'), sectionId: sectionId(store, 'Post dinner'), day: '2026-10-09' })
  return store
}

/** The row for this activity name. */
function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest('li') as HTMLElement
}

function previousDay() {
  fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
}

function nextDay() {
  fireEvent.click(screen.getByRole('button', { name: 'Next day' }))
}

function backToToday() {
  fireEvent.click(screen.getByRole('button', { name: 'Back to today' }))
}

describe('JournalScreen', () => {
  test('opens on today: the heading reads Mon 12 Oct, Today is shown, Next day is disabled and Previous day is enabled', () => {
    renderWithWatodo(<JournalScreen />, { clock: MONDAY_1745 })

    expect(screen.getByRole('heading', { name: 'Mon 12 Oct' })).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Back to today' })).toBeNull()
  })

  test('shows only today\'s entries, with their activity and section and no clock time', () => {
    renderWithWatodo(<JournalScreen />, { store: seededStore(), clock: MONDAY_1745 })

    expect(screen.getByText('Gym')).toBeInTheDocument()
    expect(screen.getByText('Post work')).toBeInTheDocument()
    expect(screen.queryByText('Walk')).toBeNull()
    expect(screen.queryByText('Guitar')).toBeNull()
    expect(screen.queryByText('Call family')).toBeNull()
    expect(document.body.textContent).not.toMatch(/\d{1,2}:\d{2}/)
  })

  test('Previous day shows Sun 11 Oct with only that day\'s entries, enables Next day, and offers Back to today', () => {
    renderWithWatodo(<JournalScreen />, { store: seededStore(), clock: MONDAY_1745 })

    previousDay()

    expect(screen.getByRole('heading', { name: 'Sun 11 Oct' })).toBeInTheDocument()
    expect(screen.getByText('Walk')).toBeInTheDocument()
    expect(screen.queryByText('Gym')).toBeNull()
    expect(screen.queryByText('Today')).toBeNull()
    expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Back to today' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\d{1,2}:\d{2}/)
  })

  test('Next day returns to today', () => {
    renderWithWatodo(<JournalScreen />, { store: seededStore(), clock: MONDAY_1745 })

    previousDay()
    nextDay()

    expect(screen.getByRole('heading', { name: 'Mon 12 Oct' })).toBeInTheDocument()
    expect(screen.getByText('Gym')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Back to today' })).toBeNull()
  })

  test('Back to today from three days back returns to today', () => {
    renderWithWatodo(<JournalScreen />, { store: seededStore(), clock: MONDAY_1745 })

    previousDay()
    previousDay()
    previousDay()
    expect(screen.getByRole('heading', { name: 'Fri 9 Oct' })).toBeInTheDocument()
    expect(screen.getByText('Call family')).toBeInTheDocument()

    backToToday()

    expect(screen.getByRole('heading', { name: 'Mon 12 Oct' })).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Gym')).toBeInTheDocument()
  })

  test('an earlier day shows its template when a day record exists, else No template recorded', () => {
    renderWithWatodo(<JournalScreen />, { store: seededStore(), clock: MONDAY_1745 })

    previousDay()
    previousDay()
    expect(screen.getByRole('heading', { name: 'Sat 10 Oct' })).toBeInTheDocument()
    expect(screen.getByText('Basic day')).toBeInTheDocument()

    previousDay()
    expect(screen.getByRole('heading', { name: 'Fri 9 Oct' })).toBeInTheDocument()
    expect(screen.getByText('No template recorded')).toBeInTheDocument()
  })

  test('a day with nothing logged shows Nothing logged. and No template recorded', () => {
    renderWithWatodo(<JournalScreen />, { clock: MONDAY_1745 })

    previousDay()

    expect(screen.getByRole('heading', { name: 'Sun 11 Oct' })).toBeInTheDocument()
    expect(screen.getByText('Nothing logged.')).toBeInTheDocument()
    expect(screen.getByText('No template recorded')).toBeInTheDocument()
  })

  test('an entry logged at 00:15 on Tuesday appears under Monday', () => {
    const store = finishedStore()
    confirmDay(store, MONDAY_1745, basicTemplateId(store))
    goToSlot(store, MONDAY_1745, itemId(store, 'Bedtime'))
    logActivity(store, () => new Date(2026, 9, 13, 0, 15), activityId(store, 'Journal'))

    renderWithWatodo(<JournalScreen />, { store, clock: TUESDAY_0900 })
    expect(screen.queryByText('Journal')).toBeNull()

    previousDay()

    expect(screen.getByRole('heading', { name: 'Mon 12 Oct' })).toBeInTheDocument()
    expect(screen.getByText('Journal')).toBeInTheDocument()
  })

  test('Delete removes the entry from the snapshot', () => {
    const { store } = renderWithWatodo(<JournalScreen />, { store: seededStore(), clock: MONDAY_1745 })

    fireEvent.click(within(rowOf('Gym')).getByRole('button', { name: 'Delete' }))

    expect(screen.queryByText('Gym')).toBeNull()
    expect(readSnapshot(store).journal.map(e => e.activityId)).not.toContain(activityId(store, 'Gym'))
  })

  test('Edit changes the note and minutes only, and keeps the entry on its day and moment', () => {
    const { store } = renderWithWatodo(<JournalScreen />, { store: seededStore(), clock: MONDAY_1745 })
    const before = readSnapshot(store).journal.find(e => e.activityId === activityId(store, 'Gym'))

    fireEvent.click(within(rowOf('Gym')).getByRole('button', { name: 'Edit' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Edit entry')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Time')).toBeNull()

    fireEvent.change(within(dialog).getByLabelText('Note'), { target: { value: 'felt good' } })
    fireEvent.change(within(dialog).getByLabelText('Minutes'), { target: { value: '40' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    const entry = readSnapshot(store).journal.find(e => e.activityId === activityId(store, 'Gym'))
    expect(entry?.loggedAt).toBe(before?.loggedAt)
    expect(entry?.note).toBe('felt good')
    expect(entry?.durationMinutes).toBe(40)
    expect(entry && dayKeyOf(new Date(entry.loggedAt))).toBe('2026-10-12')
    expect(screen.getByText('felt good')).toBeInTheDocument()
    expect(screen.getByText('40 min')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\d{1,2}:\d{2}/)
  })

  test('Edit and Delete work on the entries of an earlier day', () => {
    const { store } = renderWithWatodo(<JournalScreen />, { store: seededStore(), clock: MONDAY_1745 })
    previousDay()

    fireEvent.click(within(rowOf('Walk')).getByRole('button', { name: 'Edit' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Minutes'), { target: { value: '30' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(screen.getByText('30 min')).toBeInTheDocument()

    fireEvent.click(within(rowOf('Walk')).getByRole('button', { name: 'Delete' }))
    expect(screen.queryByText('Walk')).toBeNull()
    expect(screen.getByText('Nothing logged.')).toBeInTheDocument()
    expect(readSnapshot(store).journal.map(e => e.activityId)).not.toContain(activityId(store, 'Walk'))
  })

  test('the day note saves on blur and clearing it removes it', () => {
    const { store } = renderWithWatodo(<JournalScreen />, { store: seededStore(), clock: MONDAY_1745 })
    const note = screen.getByRole('textbox', { name: 'Day note' })

    fireEvent.change(note, { target: { value: 'Slow start' } })
    fireEvent.blur(note)
    expect(readSnapshot(store).days.find(d => d.day === '2026-10-12')?.note).toBe('Slow start')

    fireEvent.change(note, { target: { value: '' } })
    fireEvent.blur(note)
    expect(readSnapshot(store).days.find(d => d.day === '2026-10-12')?.note).toBeUndefined()
  })

  test('the day note switches with the viewed day: typing on yesterday stores it there, and today shows its own', () => {
    const { store } = renderWithWatodo(<JournalScreen />, { store: seededStore(), clock: MONDAY_1745 })

    previousDay()
    const yesterdayNote = screen.getByRole('textbox', { name: 'Day note' })
    fireEvent.change(yesterdayNote, { target: { value: 'Slow start' } })
    fireEvent.blur(yesterdayNote)
    expect(readSnapshot(store).days.find(d => d.day === '2026-10-11')?.note).toBe('Slow start')

    nextDay()
    expect(screen.getByRole('textbox', { name: 'Day note' })).toHaveValue('')

    previousDay()
    expect(screen.getByRole('textbox', { name: 'Day note' })).toHaveValue('Slow start')
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

  test('Day defaults to today, has no Time field, and Save waits for a section and an activity', () => {
    const { store } = renderWithWatodo(<JournalScreen />, { clock: MONDAY_1745 })

    const dialog = openAddEntry()
    expect(within(dialog).getByText('Add an entry')).toBeInTheDocument()
    const day = within(dialog).getByLabelText('Day')
    expect(day).toHaveAttribute('type', 'date')
    expect(day).toHaveValue('2026-10-12')
    expect(day).toHaveAttribute('max', '2026-10-12')
    expect(within(dialog).queryByLabelText('Time')).toBeNull()
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

  test('changing the Day in the dialog files the entry on that day, and the screen stays on today', () => {
    const { store } = renderWithWatodo(<JournalScreen />, { clock: MONDAY_1745 })
    const dialog = openAddEntry()

    fireEvent.change(within(dialog).getByLabelText('Day'), { target: { value: '2026-10-10' } })
    fireEvent.change(within(dialog).getByLabelText('Section'), { target: { value: sectionId(store, 'Post dinner') } })
    fireEvent.change(within(dialog).getByLabelText('Activity'), { target: { value: activityId(store, 'Guitar') } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    const added = readSnapshot(store).journal
    expect(added).toHaveLength(1)
    expect(added[0].activityId).toBe(activityId(store, 'Guitar'))
    expect(added[0].sectionId).toBe(sectionId(store, 'Post dinner'))
    expect(dayKeyOf(new Date(added[0].loggedAt))).toBe('2026-10-10')
    expect(added[0].note).toBeUndefined()
    expect(added[0].durationMinutes).toBeUndefined()
    expect(screen.getByRole('heading', { name: 'Mon 12 Oct' })).toBeInTheDocument()
    expect(screen.queryByText('Guitar')).toBeNull()
  })

  test('Add entry while viewing two days ago: the Day field holds that day, and saving adds the entry without leaving it', () => {
    const { store } = renderWithWatodo(<JournalScreen />, { store: seededStore(), clock: MONDAY_1745 })
    previousDay()
    previousDay()

    const dialog = openAddEntry()
    expect(within(dialog).getByLabelText('Day')).toHaveValue('2026-10-10')
    expect(within(dialog).getByLabelText('Day')).toHaveAttribute('max', '2026-10-12')
    fireEvent.change(within(dialog).getByLabelText('Section'), { target: { value: sectionId(store, 'Post dinner') } })
    fireEvent.change(within(dialog).getByLabelText('Activity'), { target: { value: activityId(store, 'Read') } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Sat 10 Oct' })).toBeInTheDocument()
    expect(screen.getByText('Read')).toBeInTheDocument()
    expect(screen.getByText('Guitar')).toBeInTheDocument()
    const onSaturday = readSnapshot(store).journal.filter(e => dayKeyOf(new Date(e.loggedAt)) === '2026-10-10')
    expect(onSaturday.map(e => e.activityId)).toContain(activityId(store, 'Read'))
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

describe('Show full day', () => {
  test('sits above the entries on today, collapsed by default', () => {
    renderWithWatodo(<JournalScreen />, { store: seededStore(), clock: MONDAY_1745 })

    expect(screen.getAllByRole('button', { name: /full day/ })).toHaveLength(1)
    const button = screen.getByRole('button', { name: 'Show full day' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Wake up, brush teeth, get ready')).toBeNull()
    expect(button.compareDocumentPosition(rowOf('Gym')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('is present when viewing today and absent on another day', () => {
    renderWithWatodo(<JournalScreen />, { store: seededStore(), clock: MONDAY_1745 })

    expect(screen.getByRole('button', { name: 'Show full day' })).toBeInTheDocument()
    previousDay()
    expect(screen.queryByRole('button', { name: /full day/ })).toBeNull()
  })

  test('pressing it shows the six basic-day items in order with Post work current, and pressing again hides them', () => {
    renderWithWatodo(<JournalScreen />, { store: finishedStore(), clock: MONDAY_1745 })

    fireEvent.click(screen.getByRole('button', { name: 'Show full day' }))

    const hide = screen.getByRole('button', { name: 'Hide full day' })
    expect(hide).toHaveAttribute('aria-expanded', 'true')
    const rows = screen.getAllByRole('listitem')
    const names = ['Wake up, brush teeth, get ready', 'Work', 'Post work', 'Dinner', 'Post dinner', 'Bedtime']
    expect(rows).toHaveLength(6)
    rows.forEach((row, index) => {
      expect(row).toHaveTextContent(names[index])
    })
    expect(rows[2]).toHaveAttribute('aria-current', 'true')
    const list = rows[0].closest('ol') as HTMLElement
    expect(within(list).queryAllByRole('button')).toHaveLength(0)
    expect(list.textContent).not.toMatch(/\d{1,2}:\d{2}/)
    expect(within(list).queryAllByText(/^\d+\.$/)).toHaveLength(0)

    fireEvent.click(hide)

    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Show full day' })).toHaveAttribute('aria-expanded', 'false')
  })

  test('with no templates there is no Show full day button', () => {
    renderWithWatodo(<JournalScreen />, { store: createWatodoStore(), clock: MONDAY_1745 })

    expect(screen.queryByRole('button', { name: /full day/ })).toBeNull()
  })
})

describe('repeated slots', () => {
  function templateNamed(store: WatodoStore, name: string): Id {
    const template = readSnapshot(store).templates.find(candidate => candidate.name === name)
    if (!template) throw new Error(`no template ${name}`)
    return template.id
  }

  /** Today (Mon 12 Oct) is the Weekend template, with a Hike logged in the second Free time; Fri 9 Oct is the basic day with a Gym logged in Post work. */
  function repeatedSlotStore(): WatodoStore {
    const store = finishedStore()
    const draft = draftFromStarter(readSnapshot(store), 'weekend')
    if (draft === null) throw new Error('no weekend starter')
    saveTemplate(store, draft)
    confirmDay(store, MONDAY_1745, templateNamed(store, 'Weekend'))
    const [, secondFreeTime] = readSnapshot(store).items.filter(item => item.name === 'Free time')
    goToSlot(store, MONDAY_1745, secondFreeTime.id)
    logActivity(store, MONDAY_1745, activityId(store, 'Hike'))

    const FRIDAY_1800: Clock = () => new Date(2026, 9, 9, 18, 0)
    confirmDay(store, FRIDAY_1800, templateNamed(store, 'Basic day'))
    logActivity(store, FRIDAY_1800, activityId(store, 'Gym'))
    return store
  }

  test('an entry logged in the second Free time shows Free time #2, and a basic-day entry shows plain Post work', () => {
    renderWithWatodo(<JournalScreen />, { store: repeatedSlotStore(), clock: MONDAY_1745 })

    expect(within(rowOf('Hike')).getByText('Free time #2')).toBeInTheDocument()

    previousDay()
    previousDay()
    previousDay()

    expect(screen.getByRole('heading', { name: 'Fri 9 Oct' })).toBeInTheDocument()
    expect(within(rowOf('Gym')).getByText('Post work')).toBeInTheDocument()
  })
})
