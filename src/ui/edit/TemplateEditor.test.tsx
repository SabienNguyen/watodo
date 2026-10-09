// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import {
  createWatodoStore, finishSetup, readSnapshot, setUpStarter, type Id, type WatodoStore,
} from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { TemplateEditor } from './TemplateEditor'

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

/** The li of the step whose name field shows this value. */
function stepRow(name: string): HTMLElement {
  return screen.getByDisplayValue(name).closest('li') as HTMLElement
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

  test('changing a step start time to 18:00 stores 1080', () => {
    const { store } = setup()
    const work = stepRow('Work')

    fireEvent.change(within(work).getByLabelText('Start'), { target: { value: '18:00' } })

    expect(itemNamed(store, 'Work').start).toBe(1080)
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

  test('Add step adds a fixed step after the last item', () => {
    const { store } = setup()
    const before = readSnapshot(store).items.length

    fireEvent.click(screen.getByRole('button', { name: 'Add step' }))

    const snap = readSnapshot(store)
    expect(snap.items).toHaveLength(before + 1)
    const added = itemNamed(store, 'New step')
    expect(added.kind).toBe('fixed')
    expect(added.start).toBe(1380)
    expect(added.end).toBe(1440)
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
