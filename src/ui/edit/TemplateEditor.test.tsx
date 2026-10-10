// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import {
  createWatodoStore, finishSetup, readSnapshot, setUpStarter, type Id, type WatodoStore,
} from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { TemplateEditor } from './TemplateEditor'

const BASIC_DAY_STEPS = [
  'Wake up, brush teeth, get ready',
  'Work',
  'Post work',
  'Dinner',
  'Post dinner',
  'Bedtime',
]

function basicStore(): WatodoStore {
  const store = createWatodoStore()
  setUpStarter(store)
  finishSetup(store)
  return store
}

function setup() {
  const store = basicStore()
  const templateId = readSnapshot(store).defaultTemplateId as Id
  const onClose = vi.fn()
  renderWithWatodo(<TemplateEditor templateId={templateId} onClose={onClose} />, { store })
  return { store, templateId, onClose }
}

/** The step names as the screen lists them, top to bottom. */
function stepNames(): string[] {
  return screen.getAllByRole('textbox', { name: 'Step name' }).map(field => (field as HTMLInputElement).value)
}

/** The li of the step whose name field shows this value. Section selects can show the same text, so only name fields count. */
function stepRow(name: string): HTMLElement {
  const field = screen.getAllByRole('textbox', { name: 'Step name' })
    .find(candidate => (candidate as HTMLInputElement).value === name)
  if (field === undefined) throw new Error(`no step ${name}`)
  return field.closest('li') as HTMLElement
}

function itemNamed(store: WatodoStore, name: string) {
  const item = readSnapshot(store).items.find(i => i.name === name)
  if (!item) throw new Error(`no item ${name}`)
  return item
}

describe('TemplateEditor', () => {
  test('is a dialog titled Edit template', () => {
    setup()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Edit template' })).toBeInTheDocument()
  })

  test('has no time inputs', () => {
    setup()

    expect(document.querySelector('input[type="time"]')).toBeNull()
    expect(screen.queryByLabelText('Start')).toBeNull()
    expect(screen.queryByLabelText('End')).toBeNull()
  })

  test('lists the steps in position order', () => {
    setup()

    expect(stepNames()).toEqual(BASIC_DAY_STEPS)
  })

  test('switching Work to Slot gives it the first section', () => {
    const { store } = setup()
    const work = stepRow('Work')

    fireEvent.change(within(work).getByRole('combobox', { name: 'Kind' }), { target: { value: 'slot' } })

    const snap = readSnapshot(store)
    const item = itemNamed(store, 'Work')
    expect(item.kind).toBe('slot')
    expect(item.sectionId).toBe(snap.sections[0].id)
    expect(within(work).getByRole('combobox', { name: 'Section' })).toHaveDisplayValue('Post work')
  })

  test('Move down on the first step makes it the second', () => {
    const { store } = setup()

    fireEvent.click(within(stepRow('Wake up, brush teeth, get ready')).getByRole('button', { name: 'Move down' }))

    expect(stepNames().slice(0, 2)).toEqual(['Work', 'Wake up, brush teeth, get ready'])
    expect(readSnapshot(store).items.map(item => item.name).slice(0, 2))
      .toEqual(['Work', 'Wake up, brush teeth, get ready'])
  })

  test('Move up on the second step makes it the first', () => {
    const { store } = setup()

    fireEvent.click(within(stepRow('Work')).getByRole('button', { name: 'Move up' }))

    expect(stepNames()[0]).toBe('Work')
    expect(readSnapshot(store).items[0].name).toBe('Work')
  })

  test('Move up is disabled on the first step, and Move down on the last', () => {
    setup()

    expect(within(stepRow('Wake up, brush teeth, get ready')).getByRole('button', { name: 'Move up' })).toBeDisabled()
    expect(within(stepRow('Bedtime')).getByRole('button', { name: 'Move down' })).toBeDisabled()
    expect(within(stepRow('Work')).getByRole('button', { name: 'Move up' })).toBeEnabled()
  })

  test('Add step appends a fixed step after the last one', () => {
    const { store } = setup()
    const before = readSnapshot(store).items.length

    fireEvent.click(screen.getByRole('button', { name: 'Add step' }))

    const snap = readSnapshot(store)
    expect(snap.items).toHaveLength(before + 1)
    const added = itemNamed(store, 'New step')
    expect(added.kind).toBe('fixed')
    expect(snap.items.at(-1)?.name).toBe('New step')
    expect(stepNames().at(-1)).toBe('New step')
  })

  test('Delete step removes that step', () => {
    const { store } = setup()
    const before = readSnapshot(store).items.length

    fireEvent.click(within(stepRow('Dinner')).getByRole('button', { name: 'Delete step' }))

    const snap = readSnapshot(store)
    expect(snap.items).toHaveLength(before - 1)
    expect(snap.items.map(i => i.name)).not.toContain('Dinner')
  })

  test('renaming the template updates the snapshot', () => {
    const { store } = setup()
    const name = screen.getByLabelText('Name')

    fireEvent.change(name, { target: { value: 'Weekend' } })
    fireEvent.blur(name)

    expect(readSnapshot(store).templates.map(t => t.name)).toEqual(['Weekend'])
  })

  test('Done calls onClose', () => {
    const { onClose } = setup()

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
