// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import {
  addLabel, addSection, blankDraft, createWatodoStore, finishSetup, readSnapshot, saveTemplate,
  setUpStarter, type Id, type WatodoStore,
} from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { EditScreen } from './EditScreen'

function finishedStore(): WatodoStore {
  const store = createWatodoStore()
  setUpStarter(store)
  finishSetup(store)
  return store
}

function renderEdit(store: WatodoStore = finishedStore()) {
  return renderWithWatodo(<EditScreen />, { store })
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

describe('Slots', () => {
  test('the first part is headed Slots, with the one-sentence explanation', () => {
    renderEdit()

    expect(screen.getByRole('heading', { name: 'Slots' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Activities menu' })).toBeNull()
    expect(screen.getByText('Each slot has one list of activities, shared by every template that uses it.'))
      .toBeInTheDocument()
  })

  test('shows each slot with its activities and that Basic day uses Post work', () => {
    renderEdit()

    const postWork = within(screen.getByRole('region', { name: 'Post work' }))
    for (const name of ['Gym', 'Walk', 'Read']) {
      expect(postWork.getByDisplayValue(name)).toBeInTheDocument()
    }
    expect(postWork.getByText('Used by: Basic day')).toBeInTheDocument()
  })

  test('a slot no template uses says so', () => {
    const store = finishedStore()
    addSection(store, 'Morning')
    renderEdit(store)

    const morning = within(screen.getByRole('region', { name: 'Morning' }))
    expect(morning.getByText('Not used by any template')).toBeInTheDocument()
  })

  test('typing Yoga into the Post work field and pressing Add lists it in the snapshot', () => {
    const { store } = renderEdit()
    const postWork = within(screen.getByRole('region', { name: 'Post work' }))

    fireEvent.change(postWork.getByRole('textbox', { name: 'New activity in Post work' }), { target: { value: 'Yoga' } })
    fireEvent.click(postWork.getByRole('button', { name: 'Add' }))

    expect(postWork.getByDisplayValue('Yoga')).toBeInTheDocument()
    expect(listedNames(store, 'Post work')).toContain('Yoga')
  })

  test('Remove takes the activity out of the slot', () => {
    const { store } = renderEdit()
    const walk = rowOf('Walk')

    fireEvent.click(within(walk).getByRole('button', { name: 'Remove' }))

    expect(screen.queryByDisplayValue('Walk')).toBeNull()
    expect(listedNames(store, 'Post work')).not.toContain('Walk')
  })

  test('renaming the slot changes its name in the snapshot', () => {
    const { store } = renderEdit()
    const postWork = within(screen.getByRole('region', { name: 'Post work' }))
    const nameField = postWork.getByRole('textbox', { name: 'Section name' })

    fireEvent.change(nameField, { target: { value: 'Evening' } })
    fireEvent.blur(nameField)

    expect(readSnapshot(store).sections.map(s => s.name)).toContain('Evening')
    expect(readSnapshot(store).sections.map(s => s.name)).not.toContain('Post work')
  })

  test('renaming an activity commits on Enter', () => {
    const { store } = renderEdit()
    const gym = screen.getByDisplayValue('Gym')

    fireEvent.change(gym, { target: { value: 'Run' } })
    fireEvent.keyDown(gym, { key: 'Enter' })

    expect(readSnapshot(store).activities.map(a => a.name)).toContain('Run')
  })

  test('Add slot creates a slot at the end', () => {
    const { store } = renderEdit()
    const field = screen.getByRole('textbox', { name: 'Slot name' })

    fireEvent.change(field, { target: { value: 'Morning' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add slot' }))

    expect(readSnapshot(store).sections.map(s => s.name)).toEqual(['Post work', 'Post dinner', 'Bedtime', 'Morning'])
  })

  test('Delete slot on Post work opens a dialog naming Basic day', () => {
    renderEdit()

    fireEvent.click(within(screen.getByRole('region', { name: 'Post work' })).getByRole('button', { name: 'Delete slot' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Delete "Post work"?' })).toBeInTheDocument()
    expect(within(dialog).getByText('It will be removed from: Basic day.')).toBeInTheDocument()
  })

  test('confirming Delete slot removes the slot from the snapshot and from the template', () => {
    const { store } = renderEdit()
    fireEvent.click(within(screen.getByRole('region', { name: 'Post work' })).getByRole('button', { name: 'Delete slot' }))

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete slot' }))

    const snap = readSnapshot(store)
    expect(snap.sections.map(s => s.name)).not.toContain('Post work')
    expect(snap.items.some(item => item.kind === 'slot' && item.name === 'Post work')).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('Cancel in the Delete slot dialog keeps the slot', () => {
    const { store } = renderEdit()
    fireEvent.click(within(screen.getByRole('region', { name: 'Post work' })).getByRole('button', { name: 'Delete slot' }))

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(readSnapshot(store).sections.map(s => s.name)).toContain('Post work')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('deleting a slot no template uses says so in its dialog', () => {
    const store = finishedStore()
    addSection(store, 'Morning')
    renderEdit(store)

    fireEvent.click(within(screen.getByRole('region', { name: 'Morning' })).getByRole('button', { name: 'Delete slot' }))

    expect(within(screen.getByRole('dialog')).getByText('No template uses it.')).toBeInTheDocument()
  })
})

describe('Labels', () => {
  test('pressing Sat on Work day adds Saturday to its weekdays', () => {
    const { store } = renderEdit()
    const workDay = rowOf('Work day')

    fireEvent.click(within(workDay).getByRole('button', { name: 'Sat' }))

    expect(within(workDay).getByRole('button', { name: 'Sat' })).toHaveAttribute('aria-pressed', 'true')
    const label = readSnapshot(store).labels.find(l => l.name === 'Work day')
    expect(label?.weekdays).toContain(5)
  })

  test('the Work day Delete button is disabled while Basic day uses it', () => {
    renderEdit()
    const workDay = rowOf('Work day')

    expect(within(workDay).getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(within(workDay).getByText('Used by a template')).toBeInTheDocument()
  })

  test('an unused label can be deleted', () => {
    const store = finishedStore()
    addLabel(store, 'Weekend')
    renderEdit(store)

    fireEvent.click(within(rowOf('Weekend')).getByRole('button', { name: 'Delete' }))

    expect(readSnapshot(store).labels.map(l => l.name)).toEqual(['Work day'])
  })

  test('Add label creates a label', () => {
    const { store } = renderEdit()

    fireEvent.change(screen.getByRole('textbox', { name: 'New label name' }), { target: { value: 'Weekend' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add label' }))

    expect(readSnapshot(store).labels.map(l => l.name)).toEqual(['Work day', 'Weekend'])
  })
})

describe('Templates', () => {
  test('Copy on Basic day opens the editor on a copy, and creates nothing until Save', () => {
    const { store } = renderEdit()
    const before = readSnapshot(store)

    fireEvent.click(within(templateRow('Basic day')).getByRole('button', { name: 'Copy' }))

    expect(screen.getByRole('heading', { name: 'New template' })).toBeInTheDocument()
    expect(readSnapshot(store)).toEqual(before)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    const snap = readSnapshot(store)
    expect(snap.templates.map(t => t.name)).toEqual(['Basic day', 'Basic day copy'])
    const copy = snap.templates.find(t => t.name === 'Basic day copy')
    expect(snap.items.filter(item => item.templateId === copy?.id)).toHaveLength(6)
  })

  test('Edit on Basic day, rename and Save renames the template and keeps its id', () => {
    const { store } = renderEdit()
    const basicId = readSnapshot(store).templates[0].id

    fireEvent.click(within(templateRow('Basic day')).getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('heading', { name: 'Edit template' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Weekend' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(readSnapshot(store).templates).toHaveLength(1)
    expect(readSnapshot(store).templates[0]).toMatchObject({ id: basicId, name: 'Weekend' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('New template, Office day, Save adds one template that reuses the Post work slot', () => {
    const { store } = renderEdit()
    const postWorkId = readSnapshot(store).sections.find(s => s.name === 'Post work')!.id
    const sectionsBefore = readSnapshot(store).sections.length

    fireEvent.click(screen.getByRole('button', { name: 'New template' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Office day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    const snap = readSnapshot(store)
    expect(snap.templates.map(t => t.name)).toEqual(['Basic day', 'Office day'])
    const office = snap.templates.find(t => t.name === 'Office day')
    const postWorkSteps = snap.items.filter(item => item.templateId === office?.id && item.sectionId === postWorkId)
    expect(postWorkSteps).toHaveLength(1)
    expect(snap.sections).toHaveLength(sectionsBefore)
  })

  test('New template is enabled even with no labels', () => {
    const store = createWatodoStore()
    finishSetup(store)
    renderEdit(store)

    expect(screen.getByRole('button', { name: 'New template' })).toBeEnabled()
  })

  test('Make default moves the default badge to that template', () => {
    const store = finishedStore()
    addTemplate(store, 'Weekend')
    renderEdit(store)
    const weekend = templateRow('Weekend')
    const basic = templateRow('Basic day')

    expect(within(basic).getByText('default')).toBeInTheDocument()
    fireEvent.click(within(weekend).getByRole('button', { name: 'Make default' }))

    expect(within(weekend).getByText('default')).toBeInTheDocument()
    expect(within(basic).queryByText('default')).toBeNull()
    expect(readSnapshot(store).defaultTemplateId).toBe(readSnapshot(store).templates.find(t => t.name === 'Weekend')?.id)
  })

  test('deleting the default with another template asks which takes over, then deletes it', () => {
    const store = finishedStore()
    const weekendId = addTemplate(store, 'Weekend')
    renderEdit(store)

    fireEvent.click(within(templateRow('Basic day')).getByRole('button', { name: 'Delete' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('"Basic day" is your default template')).toBeInTheDocument()
    expect(within(dialog).getByText('Which template takes over as the default?')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Weekend' }))

    const snap = readSnapshot(store)
    expect(snap.templates.map(t => t.name)).toEqual(['Weekend'])
    expect(snap.defaultTemplateId).toBe(weekendId)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('deleting the only template leaves exactly one template named Basic day', () => {
    const { store } = renderEdit()

    fireEvent.click(within(templateRow('Basic day')).getByRole('button', { name: 'Delete' }))

    const snap = readSnapshot(store)
    expect(snap.templates.map(t => t.name)).toEqual(['Basic day'])
    expect(snap.defaultTemplateId).toBe(snap.templates[0].id)
  })
})

/** The li of a template row, found by its name, which is a text node rather than a field. */
function templateRow(name: string): HTMLElement {
  const row = screen.getAllByText(name).map(el => el.closest('li')).find(li => li !== null)
  if (!row) throw new Error(`no row for ${name}`)
  return row
}
