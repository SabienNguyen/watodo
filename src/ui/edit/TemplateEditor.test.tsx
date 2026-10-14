// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import {
  blankDraft, createWatodoStore, draftFromStarter, draftFromTemplate, finishSetup, readSnapshot,
  setUpStarter, type Id, type TemplateDraft, type WatodoStore,
} from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { TemplateEditor, TemplateEditorForm } from './TemplateEditor'

function finishedStore(): WatodoStore {
  const store = createWatodoStore()
  setUpStarter(store)
  finishSetup(store)
  return store
}

function open(draft: TemplateDraft, store: WatodoStore = finishedStore()) {
  const onSaved = vi.fn()
  const onCancel = vi.fn()
  renderWithWatodo(<TemplateEditor draft={draft} onSaved={onSaved} onCancel={onCancel} />, { store })
  return { store, onSaved, onCancel }
}

function starter(key: string, store: WatodoStore = finishedStore()): TemplateDraft {
  const draft = draftFromStarter(readSnapshot(store), key)
  if (draft === null) throw new Error(`no starter ${key}`)
  return draft
}

function basicCopy(store: WatodoStore = finishedStore()): TemplateDraft {
  const snap = readSnapshot(store)
  const draft = draftFromTemplate(snap, snap.defaultTemplateId as Id, 'copy')
  if (draft === null) throw new Error('no default template')
  return draft
}

function basicEdit(store: WatodoStore): TemplateDraft {
  const snap = readSnapshot(store)
  const draft = draftFromTemplate(snap, snap.defaultTemplateId as Id, 'edit')
  if (draft === null) throw new Error('no default template')
  return draft
}

const nameField = () => screen.getByRole('textbox', { name: 'Name' })
const saveButton = () => screen.getByRole('button', { name: 'Save' })
/** The visible text of every option in the document. */
const optionTexts = () => Array.from(document.querySelectorAll('option'), option => option.textContent ?? '')
const fixedNames = () =>screen.getAllByRole('textbox', { name: 'Step name' }).map(f => (f as HTMLInputElement).value)

/** The row (li) of the step whose drag handle is labelled with this name. */
function rowNamed(stepName: string): HTMLElement {
  const handle = screen.getByRole('button', { name: `Drag to reorder ${stepName}` })
  return handle.closest('li') as HTMLElement
}

/** Chooses the option with this visible text in a select. */
function choose(select: HTMLElement, optionText: string) {
  const option = within(select).getByRole('option', { name: optionText }) as HTMLOptionElement
  fireEvent.change(select, { target: { value: option.value } })
}

function itemsOf(store: WatodoStore, templateId: Id) {
  return readSnapshot(store).items.filter(item => item.templateId === templateId)
}

describe('TemplateEditor', () => {
  test('a draft without a template id is a dialog titled New template', () => {
    open(starter('office'))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'New template' })).toBeInTheDocument()
  })

  test('a draft of an existing template is titled Edit template', () => {
    const store = finishedStore()
    open(basicEdit(store), store)

    expect(screen.getByRole('heading', { name: 'Edit template' })).toBeInTheDocument()
  })

  test('has no time inputs', () => {
    open(starter('office'))

    expect(document.querySelector('input[type="time"]')).toBeNull()
  })

  test('lists the steps in order, fixed steps as name fields and slots as selects', () => {
    open(starter('office'))

    expect(fixedNames()).toEqual([
      'Wake up', 'Brush teeth', 'Change clothes', 'Commute', 'Work', 'Dinner', 'Shower', 'Brush teeth', 'Sleep',
    ])
    const slots = screen.getAllByRole('combobox', { name: 'Slot' }) as HTMLSelectElement[]
    expect(slots.map(select => select.value)).toEqual(['Post work', 'Post dinner', 'Post-shower', 'Pre-sleep'])
    expect(screen.getAllByText('fixed')).toHaveLength(9)
    expect(screen.getAllByText('slot')).toHaveLength(4)
  })

  test('the Label select lists the labels, and a new label is an extra selected option', () => {
    open(starter('weekend'))

    const label = screen.getByRole('combobox', { name: 'Label' })
    expect(label).toHaveDisplayValue('Weekend')
    expect(within(label).getByRole('option', { name: 'Work day' })).toBeInTheDocument()
  })

  test('no option in the editor is marked (new), and a new slot is an extra selected option', () => {
    open(starter('weekend'))

    expect(optionTexts().filter(text => text.includes('(new)'))).toEqual([])
    expect(optionTexts()).toContain('Weekend')
    expect(screen.getAllByRole('combobox', { name: 'Slot' })[0]).toHaveDisplayValue('Free time')
  })

  test('a new label or slot whose name matches an existing one is shown once, as that one', () => {
    const store = finishedStore()
    open({
      name: 'Copy of work',
      label: { newName: 'work DAY', weekdays: [0] },
      steps: [{ kind: 'slot', slotName: 'bedtime' }],
    }, store)

    const label = screen.getByRole('combobox', { name: 'Label' })
    expect(label).toHaveDisplayValue('Work day')
    expect(within(label).getAllByRole('option')).toHaveLength(1)
    const slot = screen.getByRole('combobox', { name: 'Slot' })
    expect(slot).toHaveDisplayValue('Bedtime')
    expect(within(slot).getAllByRole('option', { name: 'Bedtime' })).toHaveLength(1)
    expect(optionTexts().filter(text => text.includes('(new)'))).toEqual([])
  })

  test('each row has a drag handle labelled with its step name, in order', () => {
    open(starter('office'))

    // Two steps are named Brush teeth, so the handles are checked as a list, not looked up one name at a time.
    const officeStepNames = [
      'Wake up', 'Brush teeth', 'Change clothes', 'Commute', 'Work', 'Post work',
      'Dinner', 'Post dinner', 'Shower', 'Post-shower', 'Pre-sleep', 'Brush teeth', 'Sleep',
    ]
    const handles = screen.getAllByRole('button', { name: /^Drag to reorder / })
    expect(handles.map(handle => handle.getAttribute('aria-label')))
      .toEqual(officeStepNames.map(name => `Drag to reorder ${name}`))
  })

  test('each drag handle stops touch scrolling and text selection, and has no long-press menu', () => {
    open(starter('office'))

    const handles = screen.getAllByRole('button', { name: /^Drag to reorder / })
    for (const handle of handles) {
      expect(handle).toHaveClass('touch-none', 'select-none')
      expect(fireEvent.contextMenu(handle)).toBe(false)
    }
  })

  test('Cancel calls onCancel and leaves the store unchanged', () => {
    const { store, onCancel, onSaved } = open(starter('office'))
    const before = readSnapshot(store)

    fireEvent.change(nameField(), { target: { value: 'Changed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSaved).not.toHaveBeenCalled()
    expect(readSnapshot(store)).toEqual(before)
  })

  test('nothing is written while the draft is edited; only Save writes', () => {
    const store = finishedStore()
    const before = readSnapshot(store)
    open(basicEdit(store), store)

    fireEvent.change(nameField(), { target: { value: 'Weekend' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add fixed step' }))
    fireEvent.click(screen.getAllByRole('button', { name: /^Remove / })[0])

    expect(readSnapshot(store)).toEqual(before)
  })

  test('Save creates exactly one template and calls onSaved with its id', () => {
    const { store, onSaved } = open(starter('office'))
    const before = readSnapshot(store).templates.length

    fireEvent.click(saveButton())

    const snap = readSnapshot(store)
    expect(snap.templates).toHaveLength(before + 1)
    const created = snap.templates.find(template => template.name === 'Office day')
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalledWith(created?.id)
  })

  test('Save is disabled while the name is blank', () => {
    open(starter('office'))

    fireEvent.change(nameField(), { target: { value: '   ' } })
    expect(saveButton()).toBeDisabled()

    fireEvent.change(nameField(), { target: { value: 'Office' } })
    expect(saveButton()).toBeEnabled()
  })

  test('removing a step and adding a fixed step are reflected after Save', () => {
    const { store, onSaved } = open(starter('office'))

    fireEvent.click(within(rowNamed('Commute')).getByRole('button', { name: 'Remove Commute' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add fixed step' }))
    fireEvent.change(screen.getAllByRole('textbox', { name: 'Step name' }).at(-1)!, {
      target: { value: 'Stretch' },
    })
    fireEvent.click(saveButton())

    const templateId = onSaved.mock.calls[0][0] as Id
    const names = itemsOf(store, templateId).map(item => item.name)
    expect(names).toEqual([
      'Wake up', 'Brush teeth', 'Change clothes', 'Work', 'Post work', 'Dinner', 'Post dinner',
      'Shower', 'Post-shower', 'Pre-sleep', 'Brush teeth', 'Sleep', 'Stretch',
    ])
  })

  test('Add slot uses the first existing slot, and it shares that slot and its activities', () => {
    const store = finishedStore()
    const postWork = readSnapshot(store).sections.find(section => section.name === 'Post work')!.id
    const listingsBefore = readSnapshot(store).listings.length
    const sectionsBefore = readSnapshot(store).sections.length
    const { onSaved } = open(blankDraft(readSnapshot(store)), store)

    fireEvent.click(screen.getByRole('button', { name: 'Add slot' }))
    fireEvent.click(saveButton())

    const snap = readSnapshot(store)
    const templateId = onSaved.mock.calls[0][0] as Id
    expect(itemsOf(store, templateId).map(item => item.sectionId)).toEqual([postWork])
    expect(snap.sections).toHaveLength(sectionsBefore)
    expect(snap.listings).toHaveLength(listingsBefore)
  })

  test('choosing an existing slot in a slot row uses that slot', () => {
    const store = finishedStore()
    const bedtime = readSnapshot(store).sections.find(section => section.name === 'Bedtime')!.id
    const sectionsBefore = readSnapshot(store).sections.length
    const { onSaved } = open(blankDraft(readSnapshot(store)), store)

    fireEvent.click(screen.getByRole('button', { name: 'Add slot' }))
    choose(screen.getByRole('combobox', { name: 'Slot' }), 'Bedtime')
    fireEvent.click(saveButton())

    const templateId = onSaved.mock.calls[0][0] as Id
    expect(itemsOf(store, templateId).map(item => item.sectionId)).toEqual([bedtime])
    expect(readSnapshot(store).sections).toHaveLength(sectionsBefore)
  })

  test('New slot with a typed name creates that slot on Save', () => {
    const store = finishedStore()
    const { onSaved } = open(blankDraft(readSnapshot(store)), store)

    fireEvent.click(screen.getByRole('button', { name: 'Add slot' }))
    choose(screen.getByRole('combobox', { name: 'Slot' }), 'New slot…')
    fireEvent.change(screen.getByRole('textbox', { name: 'New slot name' }), { target: { value: 'Yoga class' } })
    fireEvent.click(saveButton())

    const snap = readSnapshot(store)
    const yoga = snap.sections.find(section => section.name === 'Yoga class')
    expect(yoga).toBeDefined()
    const templateId = onSaved.mock.calls[0][0] as Id
    expect(itemsOf(store, templateId).map(item => item.sectionId)).toEqual([yoga?.id])
  })

  test('a typed new slot name close to an existing slot offers it, and tapping it uses that slot with nothing asked', () => {
    const store = finishedStore()
    const bedtime = readSnapshot(store).sections.find(section => section.name === 'Bedtime')!.id
    const sectionsBefore = readSnapshot(store).sections.length
    const { onSaved } = open(blankDraft(readSnapshot(store)), store)

    fireEvent.click(screen.getByRole('button', { name: 'Add slot' }))
    choose(screen.getByRole('combobox', { name: 'Slot' }), 'New slot…')
    fireEvent.change(screen.getByRole('textbox', { name: 'New slot name' }), { target: { value: 'Bedtime routine' } })
    fireEvent.click(within(screen.getByRole('group', { name: 'Similar names' })).getByRole('button', { name: 'Bedtime' }))

    expect(screen.queryByRole('textbox', { name: 'New slot name' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Slot' })).toHaveDisplayValue('Bedtime')
    fireEvent.click(saveButton())

    const templateId = onSaved.mock.calls[0][0] as Id
    expect(itemsOf(store, templateId).map(item => item.sectionId)).toEqual([bedtime])
    expect(readSnapshot(store).sections).toHaveLength(sectionsBefore)
  })

  test('with no slots at all, Add slot gives an empty New slot name field', () => {
    const store = createWatodoStore()
    open(blankDraft(readSnapshot(store)), store)

    fireEvent.click(screen.getByRole('button', { name: 'Add slot' }))

    expect(screen.getByRole('textbox', { name: 'New slot name' })).toHaveValue('')
  })

  test('editing an existing template and saving keeps its id and the kept items ids', () => {
    const store = finishedStore()
    const snap = readSnapshot(store)
    const templateId = snap.defaultTemplateId as Id
    const itemIds = itemsOf(store, templateId).map(item => item.id).sort()
    const { onSaved } = open(basicEdit(store), store)

    fireEvent.change(nameField(), { target: { value: 'Weekend' } })
    fireEvent.click(saveButton())

    expect(onSaved).toHaveBeenCalledWith(templateId)
    expect(readSnapshot(store).templates.map(template => template.name)).toEqual(['Weekend'])
    expect(itemsOf(store, templateId).map(item => item.id).sort()).toEqual(itemIds)
  })

  test('a copy draft saves as a new template and leaves the original alone', () => {
    const store = finishedStore()
    const original = readSnapshot(store).defaultTemplateId as Id
    const { onSaved } = open(basicCopy(store), store)

    fireEvent.click(saveButton())

    const snap = readSnapshot(store)
    expect(snap.templates.map(template => template.name)).toEqual(['Basic day', 'Basic day copy'])
    expect(onSaved.mock.calls[0][0]).not.toBe(original)
    expect(itemsOf(store, original)).toHaveLength(10)
  })
})

describe('TemplateEditorForm', () => {
  test('is the editor with no dialog around it, and its Save calls onSaved with the new template', () => {
    const store = finishedStore()
    const onSaved = vi.fn()
    const onCancel = vi.fn()
    renderWithWatodo(<TemplateEditorForm draft={starter('office', store)} onSaved={onSaved} onCancel={onCancel} />, { store })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(nameField()).toHaveValue('Office day')

    fireEvent.click(saveButton())

    const created = readSnapshot(store).templates.find(template => template.name === 'Office day')
    expect(onSaved).toHaveBeenCalledWith(created?.id)
    expect(onCancel).not.toHaveBeenCalled()
  })
})
