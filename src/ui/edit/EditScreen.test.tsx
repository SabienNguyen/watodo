// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import {
  addLabel, addSection, createTemplate, createWatodoStore, finishSetup, readSnapshot,
  setUpStarter, type WatodoStore,
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

describe('Activities menu', () => {
  test('shows each section with its activities and that Basic day uses Post work', () => {
    renderEdit()

    expect(screen.getByRole('heading', { name: 'Activities menu' })).toBeInTheDocument()
    const postWork = within(screen.getByRole('region', { name: 'Post work' }))
    for (const name of ['Gym', 'Walk', 'Read']) {
      expect(postWork.getByDisplayValue(name)).toBeInTheDocument()
    }
    expect(postWork.getByText('Used by: Basic day')).toBeInTheDocument()
  })

  test('a section no slot points at says so', () => {
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

  test('Remove takes the activity out of the section', () => {
    const { store } = renderEdit()
    const walk = rowOf('Walk')

    fireEvent.click(within(walk).getByRole('button', { name: 'Remove' }))

    expect(screen.queryByDisplayValue('Walk')).toBeNull()
    expect(listedNames(store, 'Post work')).not.toContain('Walk')
  })

  test('renaming the section changes its name in the snapshot', () => {
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

  test('Add section creates a section at the end of the menu', () => {
    const { store } = renderEdit()
    const field = screen.getByRole('textbox', { name: 'New section name' })

    fireEvent.change(field, { target: { value: 'Morning' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add section' }))

    expect(readSnapshot(store).sections.map(s => s.name)).toEqual(['Post work', 'Post dinner', 'Bedtime', 'Morning'])
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
  test('Copy on Basic day creates a second template with the same items and opens the editor', () => {
    const { store } = renderEdit()
    const basicCount = readSnapshot(store).items.length
    const basic = templateRow('Basic day')

    fireEvent.click(within(basic).getByRole('button', { name: 'Copy' }))

    const snap = readSnapshot(store)
    expect(snap.templates.map(t => t.name)).toEqual(['Basic day', 'Basic day copy'])
    const copy = snap.templates.find(t => t.name === 'Basic day copy')
    expect(snap.items.filter(item => item.templateId === copy?.id)).toHaveLength(basicCount)
    expect(screen.getByRole('heading', { name: 'Edit template' })).toBeInTheDocument()
  })

  test('Make default moves the default badge to that template', () => {
    const store = finishedStore()
    const workDay = readSnapshot(store).labels[0].id
    createTemplate(store, { name: 'Weekend', labelId: workDay })
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
    const workDay = readSnapshot(store).labels[0].id
    const weekendId = createTemplate(store, { name: 'Weekend', labelId: workDay })
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
