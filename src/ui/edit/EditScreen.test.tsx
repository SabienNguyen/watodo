// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  addLabel, addSection, blankDraft, createWatodoStore, deleteLabel, deleteSection, deleteTemplate,
  finishSetup, readSnapshot, saveTemplate, setUpStarter, type Id, type WatodoStore,
} from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { EditScreen } from './EditScreen'

beforeEach(() => {
  // jsdom does not scroll; the spy lets the tests see when the page is asked to go to the top.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function finishedStore(): WatodoStore {
  const store = createWatodoStore()
  setUpStarter(store)
  finishSetup(store)
  return store
}

function renderEdit(store: WatodoStore = finishedStore()) {
  return renderWithWatodo(<EditScreen />, { store })
}

/** Presses one of the Edit screen's tabs. */
function pressTab(name: 'Slots' | 'Labels' | 'Templates') {
  fireEvent.click(screen.getByRole('tab', { name }))
}

/** Taps a list row's name, which opens that item's editing view. */
function tapRow(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
}

/** Presses the back button of the editing view that is open. */
function goBack(part: 'Slots' | 'Labels' | 'Templates') {
  fireEvent.click(screen.getByRole('button', { name: `Back to ${part}` }))
}

/** Adds a template with no steps under the first label. */
function addTemplate(store: WatodoStore, name: string): Id {
  return saveTemplate(store, { ...blankDraft(readSnapshot(store)), name })
}

/** The li that holds the field showing this value. */
function rowOf(displayValue: string): HTMLElement {
  return screen.getByDisplayValue(displayValue).closest('li') as HTMLElement
}

function listedNames(store: WatodoStore, sectionName: string): string[] {
  const snap = readSnapshot(store)
  const section = snap.sections.find(s => s.name === sectionName)
  if (!section) throw new Error(`no section ${sectionName}`)
  return snap.listings
    .filter(listing => listing.sectionId === section.id)
    .map(listing => snap.activities.find(a => a.id === listing.activityId)?.name ?? '')
}

/** The li of a template row, found by its name, which is a text node rather than a field. */
function templateRow(name: string): HTMLElement {
  const row = screen.getAllByText(name).map(el => el.closest('li')).find(li => li !== null)
  if (!row) throw new Error(`no row for ${name}`)
  return row
}

/** Chooses a starter in the New template dialog, which opens the template view for it. */
function pickStarter(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'New template' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name }))
}

describe('Tabs', () => {
  test('the screen opens on the Slots tab, which is selected and shows only the Slots list', () => {
    renderEdit()

    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Slots', 'Templates', 'Labels'])
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Slots' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Labels' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'Templates' })).toHaveAttribute('aria-selected', 'false')

    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveAccessibleName('Slots')
    expect(screen.getByRole('tab', { name: 'Slots' })).toHaveAttribute('aria-controls', panel.id)

    expect(screen.getByRole('button', { name: 'Post work' })).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Work day')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New template' })).toBeNull()
  })

  test('the Slots part has no heading of its own and no explanatory sentence', () => {
    renderEdit()

    expect(screen.queryByRole('heading', { name: 'Slots' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Activities menu' })).toBeNull()
    expect(screen.queryByText('Each slot has one list of activities, shared by every template that uses it.'))
      .not.toBeInTheDocument()
  })

  test('pressing Labels shows the label names and hides the slots', () => {
    renderEdit()

    pressTab('Labels')

    expect(screen.getByRole('tab', { name: 'Labels' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Slots' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Labels')
    expect(screen.getByRole('button', { name: 'Work day' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Post work' })).toBeNull()
  })

  test('pressing Templates shows the template names and hides the labels', () => {
    renderEdit()

    pressTab('Templates')

    expect(screen.getByRole('tab', { name: 'Templates' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Templates')
    expect(screen.getByRole('button', { name: 'Basic day' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New template' })).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Work day')).toBeNull()
  })

  test('with Slots focused, the right arrow key selects and focuses Templates, and again goes to Labels', () => {
    renderEdit()
    const slots = screen.getByRole('tab', { name: 'Slots' })

    slots.focus()
    fireEvent.keyDown(slots, { key: 'ArrowRight' })

    expect(screen.getByRole('tab', { name: 'Templates' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Templates' })).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Templates')

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Templates' }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Labels' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Labels' })).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Labels')
  })

  test('the left arrow key moves back, and both arrows wrap at the ends', () => {
    renderEdit()
    const slots = screen.getByRole('tab', { name: 'Slots' })

    slots.focus()
    fireEvent.keyDown(slots, { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'Labels' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Labels' }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Slots' })).toHaveAttribute('aria-selected', 'true')
  })

  test('closing the starter picker from Templates keeps Templates selected', () => {
    renderEdit()
    pressTab('Templates')

    fireEvent.click(screen.getByRole('button', { name: 'New template' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('tab', { name: 'Templates' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('leaving the Edit screen and coming back opens on Slots again', () => {
    const store = finishedStore()
    const { unmount } = renderEdit(store)
    pressTab('Labels')

    unmount()
    renderEdit(store)

    expect(screen.getByRole('tab', { name: 'Slots' })).toHaveAttribute('aria-selected', 'true')
  })

  test('going back from an item returns to the list on the tab it came from, not on Slots', () => {
    renderEdit()
    pressTab('Templates')
    tapRow('Basic day')

    goBack('Templates')

    expect(screen.getByRole('tab', { name: 'Templates' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Basic day' })).toBeInTheDocument()
  })
})

describe('Editing views', () => {
  test('tapping a row replaces the tabs and the list with that item, and the back button is labelled for its tab', () => {
    renderEdit()

    tapRow('Post work')

    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Slots' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Back to Slots' })).toHaveTextContent('Slots')
    expect(screen.getByRole('heading', { name: 'Post work' })).toBeInTheDocument()
    expect(screen.queryByText('Post dinner')).toBeNull()
    expect(screen.queryByText('Bedtime')).toBeNull()
  })

  test('entering an editing view and going back each scroll the page to the top', () => {
    renderEdit()

    tapRow('Post work')
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 0)

    goBack('Slots')
    expect(window.scrollTo).toHaveBeenCalledTimes(2)
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 0)
  })

  test('the Basic day editing view shows the template editor, not the list', () => {
    renderEdit()
    pressTab('Templates')

    tapRow('Basic day')

    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Edit template' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New template' })).toBeNull()
  })
})

describe('Slots', () => {
  test('the Slots list has one plain row per slot, with none of the controls of a slot', () => {
    renderEdit()

    for (const name of ['Post work', 'Post dinner', 'Bedtime']) {
      expect(screen.getByRole('button', { name })).not.toHaveAttribute('aria-expanded')
    }
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Activity name' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete slot' })).toBeNull()
  })

  test('tapping Post work shows its name, its activities and Delete slot, but not the other slots', () => {
    renderEdit()

    tapRow('Post work')

    expect(screen.getByRole('heading', { name: 'Post work' })).toBeInTheDocument()
    for (const name of ['Gym', 'Walk', 'Read']) {
      expect(screen.getByDisplayValue(name)).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Delete slot' })).toBeInTheDocument()
    expect(screen.getByText('Used by: Basic day')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Guitar')).toBeNull()
  })

  test('Back to Slots returns to the list with the Slots tab selected', () => {
    renderEdit()
    tapRow('Post work')

    goBack('Slots')

    expect(screen.queryByRole('heading', { name: 'Post work' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Slots' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Post work' })).toBeInTheDocument()
  })

  test('a slot no template uses says so', () => {
    const store = finishedStore()
    addSection(store, 'Morning')
    renderEdit(store)
    tapRow('Morning')

    expect(screen.getByText('Not used by any template')).toBeInTheDocument()
  })

  test('renaming the slot changes the heading, and after going back the row', () => {
    const { store } = renderEdit()
    tapRow('Post work')
    const nameField = screen.getByRole('textbox', { name: 'Section name' })

    fireEvent.change(nameField, { target: { value: 'Evening' } })
    fireEvent.blur(nameField)

    expect(screen.getByRole('heading', { name: 'Evening' })).toBeInTheDocument()
    expect(readSnapshot(store).sections.map(s => s.name)).not.toContain('Post work')

    goBack('Slots')

    expect(screen.getByRole('button', { name: 'Evening' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Post work' })).toBeNull()
  })

  test('typing Yoga into the Post work field and pressing Add lists it in the snapshot', () => {
    const { store } = renderEdit()
    tapRow('Post work')

    fireEvent.change(screen.getByRole('textbox', { name: 'New activity in Post work' }), { target: { value: 'Yoga' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByDisplayValue('Yoga')).toBeInTheDocument()
    expect(listedNames(store, 'Post work')).toContain('Yoga')
  })

  test('Remove takes the activity out of the slot', () => {
    const { store } = renderEdit()
    tapRow('Post work')

    fireEvent.click(within(rowOf('Walk')).getByRole('button', { name: 'Remove' }))

    expect(screen.queryByDisplayValue('Walk')).toBeNull()
    expect(listedNames(store, 'Post work')).not.toContain('Walk')
  })

  test('renaming an activity commits on Enter', () => {
    const { store } = renderEdit()
    tapRow('Post work')
    const gym = screen.getByDisplayValue('Gym')

    fireEvent.change(gym, { target: { value: 'Run' } })
    fireEvent.keyDown(gym, { key: 'Enter' })

    expect(readSnapshot(store).activities.map(a => a.name)).toContain('Run')
  })

  test('Delete slot on Post work opens a dialog naming Basic day', () => {
    renderEdit()
    tapRow('Post work')

    fireEvent.click(screen.getByRole('button', { name: 'Delete slot' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Delete "Post work"?' })).toBeInTheDocument()
    expect(within(dialog).getByText('It will be removed from: Basic day.')).toBeInTheDocument()
  })

  test('Cancel in the Delete slot dialog keeps the slot open', () => {
    const { store } = renderEdit()
    tapRow('Post work')
    fireEvent.click(screen.getByRole('button', { name: 'Delete slot' }))

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(readSnapshot(store).sections.map(s => s.name)).toContain('Post work')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Post work' })).toBeInTheDocument()
  })

  test('confirming Delete slot returns to the Slots list without it, and removes it from the snapshot', () => {
    const { store } = renderEdit()
    tapRow('Post work')
    fireEvent.click(screen.getByRole('button', { name: 'Delete slot' }))

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete slot' }))

    const snap = readSnapshot(store)
    expect(snap.sections.map(s => s.name)).not.toContain('Post work')
    expect(snap.items.some(item => item.kind === 'slot' && item.name === 'Post work')).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Post work' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Post work' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Slots' })).toHaveAttribute('aria-selected', 'true')
  })

  test('deleting a slot no template uses says so in its dialog', () => {
    const store = finishedStore()
    addSection(store, 'Morning')
    renderEdit(store)
    tapRow('Morning')

    fireEvent.click(screen.getByRole('button', { name: 'Delete slot' }))

    expect(within(screen.getByRole('dialog')).getByText('No template uses it.')).toBeInTheDocument()
  })

  test('Add slot named Morning opens the Morning view directly, with no tabs', () => {
    const { store } = renderEdit()

    fireEvent.change(screen.getByRole('textbox', { name: 'Slot name' }), { target: { value: 'Morning' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add slot' }))

    expect(readSnapshot(store).sections.map(s => s.name)).toEqual(['Post work', 'Post dinner', 'Bedtime', 'Morning'])
    expect(screen.getByRole('heading', { name: 'Morning' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'New activity in Morning' })).toBeInTheDocument()
  })

  test('a slot deleted elsewhere while its view is open returns to the Slots list', () => {
    const { store } = renderEdit()
    tapRow('Post work')
    const postWorkId = readSnapshot(store).sections.find(s => s.name === 'Post work')!.id

    act(() => deleteSection(store, postWorkId))

    expect(screen.queryByRole('heading', { name: 'Post work' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Slots' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Post dinner' })).toBeInTheDocument()
  })
})

describe('Labels', () => {
  test('tapping Work day shows its name, the seven weekday buttons and a Delete that is disabled while in use', () => {
    renderEdit()
    pressTab('Labels')

    tapRow('Work day')

    expect(screen.getByRole('heading', { name: 'Work day' })).toBeInTheDocument()
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByRole('button', { name: day })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(screen.getByText('Used by a template')).toBeInTheDocument()
  })

  test('the Labels list has plain rows with no weekday buttons until one is tapped', () => {
    renderEdit()
    pressTab('Labels')

    expect(screen.getByRole('button', { name: 'Work day' })).not.toHaveAttribute('aria-expanded')
    expect(screen.queryByRole('button', { name: 'Mon' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  test('pressing Sat on Work day adds Saturday to its weekdays', () => {
    const { store } = renderEdit()
    pressTab('Labels')
    tapRow('Work day')

    fireEvent.click(screen.getByRole('button', { name: 'Sat' }))

    expect(screen.getByRole('button', { name: 'Sat' })).toHaveAttribute('aria-pressed', 'true')
    const label = readSnapshot(store).labels.find(l => l.name === 'Work day')
    expect(label?.weekdays).toContain(5)
  })

  test('Back to Labels returns to the list with the Labels tab selected', () => {
    renderEdit()
    pressTab('Labels')
    tapRow('Work day')

    goBack('Labels')

    expect(screen.getByRole('tab', { name: 'Labels' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Work day' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mon' })).toBeNull()
  })

  test('an unused label can be deleted, which returns to the Labels list without it', () => {
    const store = finishedStore()
    addLabel(store, 'Weekend')
    renderEdit(store)
    pressTab('Labels')
    tapRow('Weekend')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(readSnapshot(store).labels.map(l => l.name)).toEqual(['Work day'])
    expect(screen.queryByRole('heading', { name: 'Weekend' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Labels' })).toHaveAttribute('aria-selected', 'true')
  })

  test('Add label creates a label and opens its view, with its weekday buttons', () => {
    const { store } = renderEdit()
    pressTab('Labels')

    fireEvent.change(screen.getByRole('textbox', { name: 'New label name' }), { target: { value: 'Weekend' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add label' }))

    expect(readSnapshot(store).labels.map(l => l.name)).toEqual(['Work day', 'Weekend'])
    expect(screen.getByRole('heading', { name: 'Weekend' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByRole('button', { name: 'Sat' })).toBeInTheDocument()
  })

  test('a label deleted elsewhere while its view is open returns to the Labels list', () => {
    const store = finishedStore()
    const weekendId = addLabel(store, 'Weekend')
    renderEdit(store)
    pressTab('Labels')
    tapRow('Weekend')

    act(() => deleteLabel(store, weekendId))

    expect(screen.queryByRole('heading', { name: 'Weekend' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Labels' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('Templates', () => {
  test('the Basic day row is plain under its label, with the default badge', () => {
    renderEdit()
    pressTab('Templates')

    expect(screen.getByRole('heading', { name: 'Work day' })).toBeInTheDocument()
    const basic = screen.getByRole('button', { name: 'Basic day' })
    expect(basic).not.toHaveAttribute('aria-expanded')
    expect(within(templateRow('Basic day')).getByText('default')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(screen.getByRole('button', { name: 'New template' })).toBeInTheDocument()
  })

  test('tapping Basic day shows Edit template with its name, steps, Copy and Delete, the default badge, and no Make default', () => {
    renderEdit()
    pressTab('Templates')

    tapRow('Basic day')

    expect(screen.getByRole('heading', { name: 'Edit template' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Basic day')
    expect(screen.getAllByRole('textbox', { name: 'Step name' })).toHaveLength(3)
    expect(screen.getAllByRole('combobox', { name: 'Slot' })).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByText('default')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make default' })).toBeNull()
  })

  test('renaming Basic day and pressing Save returns to the Templates list with the new name', () => {
    const { store } = renderEdit()
    pressTab('Templates')
    tapRow('Basic day')
    const basicId = readSnapshot(store).templates[0].id

    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Weekend' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(readSnapshot(store).templates[0]).toMatchObject({ id: basicId, name: 'Weekend' })
    expect(screen.queryByRole('heading', { name: 'Edit template' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Templates' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Weekend' })).toBeInTheDocument()
  })

  test('Cancel in the template view returns to the list with nothing changed', () => {
    const { store } = renderEdit()
    pressTab('Templates')
    tapRow('Basic day')
    const before = readSnapshot(store)

    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Changed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(readSnapshot(store)).toEqual(before)
    expect(screen.queryByRole('heading', { name: 'Edit template' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Basic day' })).toBeInTheDocument()
  })

  test('the back button discards the draft and returns to the Templates list', () => {
    const { store } = renderEdit()
    pressTab('Templates')
    tapRow('Basic day')
    const before = readSnapshot(store)

    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Changed' } })
    goBack('Templates')

    expect(readSnapshot(store)).toEqual(before)
    expect(screen.getByRole('button', { name: 'Basic day' })).toBeInTheDocument()
  })

  test('Copy in the template view switches to New template named Basic day copy, and creates nothing until Save', () => {
    const { store } = renderEdit()
    pressTab('Templates')
    tapRow('Basic day')
    const before = readSnapshot(store)

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    expect(screen.getByRole('heading', { name: 'New template' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Basic day copy')
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(readSnapshot(store)).toEqual(before)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    const snap = readSnapshot(store)
    expect(snap.templates.map(t => t.name)).toEqual(['Basic day', 'Basic day copy'])
    const copy = snap.templates.find(t => t.name === 'Basic day copy')
    expect(snap.items.filter(item => item.templateId === copy?.id)).toHaveLength(6)
    expect(screen.getByRole('button', { name: 'Basic day' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Basic day copy' })).toBeInTheDocument()
  })

  test('New template, Office day opens the New template view, not a dialog', () => {
    const { store } = renderEdit()
    pressTab('Templates')
    const before = readSnapshot(store)

    pickStarter('Office day')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('heading', { name: 'New template' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Office day')
    expect(readSnapshot(store)).toEqual(before)
  })

  test('New template, Office day, Cancel creates nothing; doing it again and Save adds Office day', () => {
    const { store } = renderEdit()
    pressTab('Templates')

    pickStarter('Office day')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(readSnapshot(store).templates.map(t => t.name)).toEqual(['Basic day'])
    expect(screen.getByRole('tab', { name: 'Templates' })).toHaveAttribute('aria-selected', 'true')

    pickStarter('Office day')
    const sectionsBefore = readSnapshot(store).sections.length
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    const snap = readSnapshot(store)
    expect(snap.templates.map(t => t.name)).toEqual(['Basic day', 'Office day'])
    expect(snap.sections).toHaveLength(sectionsBefore)
    expect(screen.getByRole('button', { name: 'Office day' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'New template' })).toBeNull()
  })

  test('New template is enabled even with no labels', () => {
    const store = createWatodoStore()
    finishSetup(store)
    renderEdit(store)
    pressTab('Templates')

    expect(screen.getByRole('button', { name: 'New template' })).toBeEnabled()
  })

  test('Make default in the template view moves the default badge to that template', () => {
    const store = finishedStore()
    addTemplate(store, 'Weekend')
    renderEdit(store)
    pressTab('Templates')
    tapRow('Weekend')

    expect(screen.queryByText('default')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Make default' }))

    expect(screen.getByText('default')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make default' })).toBeNull()
    expect(readSnapshot(store).defaultTemplateId).toBe(readSnapshot(store).templates.find(t => t.name === 'Weekend')?.id)

    goBack('Templates')
    expect(within(templateRow('Weekend')).getByText('default')).toBeInTheDocument()
    expect(within(templateRow('Basic day')).queryByText('default')).toBeNull()
  })

  test('deleting a non-default template from its view returns to the list without it', () => {
    const store = finishedStore()
    addTemplate(store, 'Weekend')
    renderEdit(store)
    pressTab('Templates')
    tapRow('Weekend')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(readSnapshot(store).templates.map(t => t.name)).toEqual(['Basic day'])
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Weekend' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Templates' })).toHaveAttribute('aria-selected', 'true')
  })

  test('deleting the default with another template asks which takes over, then deletes it and returns to the list', () => {
    const store = finishedStore()
    const weekendId = addTemplate(store, 'Weekend')
    renderEdit(store)
    pressTab('Templates')
    tapRow('Basic day')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('"Basic day" is your default template')).toBeInTheDocument()
    expect(within(dialog).getByText('Which template takes over as the default?')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Weekend' }))

    const snap = readSnapshot(store)
    expect(snap.templates.map(t => t.name)).toEqual(['Weekend'])
    expect(snap.defaultTemplateId).toBe(weekendId)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Edit template' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Weekend' })).toBeInTheDocument()
  })

  test('deleting the only template leaves exactly one template named Basic day', () => {
    const { store } = renderEdit()
    pressTab('Templates')
    tapRow('Basic day')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    const snap = readSnapshot(store)
    expect(snap.templates.map(t => t.name)).toEqual(['Basic day'])
    expect(snap.defaultTemplateId).toBe(snap.templates[0].id)
  })

  test('a template deleted elsewhere while its view is open returns to the Templates list', () => {
    const store = finishedStore()
    const weekendId = addTemplate(store, 'Weekend')
    renderEdit(store)
    pressTab('Templates')
    tapRow('Weekend')

    act(() => deleteTemplate(store, weekendId))

    expect(screen.queryByRole('heading', { name: 'Edit template' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Templates' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Basic day' })).toBeInTheDocument()
  })
})
