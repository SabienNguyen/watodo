// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { AddField, EditableText, RestDaysField } from './fields'

/** Renders an AddField for activities. */
function renderAdd(onAdd = vi.fn(), existing?: { name: string }[]) {
  render(<AddField label="Activity name" placeholder="Activity name" button="Add" onAdd={onAdd} existing={existing} />)
  return onAdd
}

const field = (name: string) => screen.getByRole('textbox', { name })

describe('AddField', () => {
  test('without existing, it adds the trimmed name, clears the field, and offers no suggestions', () => {
    const onAdd = renderAdd()

    fireEvent.change(field('Activity name'), { target: { value: '  Gym  ' } })
    expect(screen.queryByRole('group', { name: 'Similar names' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(onAdd).toHaveBeenCalledWith('Gym')
    expect(field('Activity name')).toHaveValue('')
  })

  test('shows at most three close names while typing, and tapping one adds it and clears the field', () => {
    const onAdd = renderAdd(vi.fn(), [{ name: 'Walk' }, { name: 'Walk dog' }, { name: 'Walk fast' }, { name: 'Walk home' }])

    fireEvent.change(field('Activity name'), { target: { value: 'Walk' } })

    const group = screen.getByRole('group', { name: 'Similar names' })
    expect(within(group).getAllByRole('button').map(button => button.textContent))
      .toEqual(['Walk', 'Walk dog', 'Walk fast'])
    fireEvent.click(within(group).getByRole('button', { name: 'Walk dog' }))

    expect(onAdd).toHaveBeenCalledWith('Walk dog')
    expect(field('Activity name')).toHaveValue('')
  })

  test('a blank field offers no suggestions', () => {
    renderAdd(vi.fn(), [{ name: 'Gym' }])

    fireEvent.change(field('Activity name'), { target: { value: '   ' } })

    expect(screen.queryByRole('group', { name: 'Similar names' })).toBeNull()
  })

  test('a name with the same key as an existing one is added as typed, with no question', () => {
    const onAdd = renderAdd(vi.fn(), [{ name: 'Gym' }])

    fireEvent.change(field('Activity name'), { target: { value: 'gyms' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(onAdd).toHaveBeenCalledWith('gyms')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('a close name asks first, and Use adds the existing name and clears the field', () => {
    const onAdd = renderAdd(vi.fn(), [{ name: 'Gym' }])
    fireEvent.change(field('Activity name'), { target: { value: 'Gym session' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'You already have Gym. Use it?' })).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use Gym' }))

    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith('Gym')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(field('Activity name')).toHaveValue('')
  })

  test('a close name asks first, and Add new adds the typed name', () => {
    const onAdd = renderAdd(vi.fn(), [{ name: 'Gym' }])
    fireEvent.change(field('Activity name'), { target: { value: 'Gym session' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add new' }))

    expect(onAdd).toHaveBeenCalledWith('Gym session')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(field('Activity name')).toHaveValue('')
  })

  test('closing the question keeps the typed name and adds nothing', () => {
    const onAdd = renderAdd(vi.fn(), [{ name: 'Gym' }])
    fireEvent.change(field('Activity name'), { target: { value: 'Gym session' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))

    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(field('Activity name')).toHaveValue('Gym session')
  })
})

/** Renders an EditableText for a name in a list of other names. The row being edited is Walk. */
function renderRename(onCommit = vi.fn(), value = 'Walk', existing = [{ id: 'gym', name: 'Gym' }, { id: 'walk', name: 'Walk' }]) {
  render(
    <EditableText
      aria-label="Name"
      value={value}
      existing={existing}
      selfId="walk"
      onCommit={onCommit}
    />,
  )
  return { onCommit, name: screen.getByRole('textbox', { name: 'Name' }) }
}

describe('EditableText', () => {
  test('without existing, a changed name commits on blur', () => {
    const onCommit = vi.fn()
    render(<EditableText aria-label="Name" value="Walk" onCommit={onCommit} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Hike' } })
    fireEvent.blur(screen.getByRole('textbox', { name: 'Name' }))

    expect(onCommit).toHaveBeenCalledWith('Hike')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('a name another row has is refused: the draft reverts, and the alert shows until the next keystroke', () => {
    const { onCommit, name } = renderRename()

    fireEvent.change(name, { target: { value: 'gyms' } })
    fireEvent.blur(name)

    expect(onCommit).not.toHaveBeenCalled()
    expect(name).toHaveValue('Walk')
    expect(screen.getByRole('alert')).toHaveTextContent('You already have Gym.')

    fireEvent.change(name, { target: { value: 'Wal' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('the row being edited is not compared with itself', () => {
    const { onCommit, name } = renderRename()

    fireEvent.change(name, { target: { value: 'walk.' } })
    fireEvent.blur(name)

    expect(onCommit).toHaveBeenCalledWith('walk.')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('a close name asks first; Rename commits once, and the blur that opens the question does not commit', () => {
    const { onCommit, name } = renderRename()
    fireEvent.change(name, { target: { value: 'Gym session' } })

    fireEvent.keyDown(name, { key: 'Enter' })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'You already have Gym. Rename anyway?' })).toBeInTheDocument()
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.blur(name)
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('Gym session')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('Cancel in the question reverts the draft and commits nothing', () => {
    const { onCommit, name } = renderRename()
    fireEvent.change(name, { target: { value: 'Gym session' } })
    fireEvent.blur(name)

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(name).toHaveValue('Walk')
  })
})

describe('RestDaysField', () => {
  test('shows the stored days, and a blank field for none', () => {
    const { rerender } = render(<RestDaysField value={30} onCommit={vi.fn()} />)
    expect(screen.getByRole('spinbutton', { name: 'Rest days' })).toHaveValue(30)

    rerender(<RestDaysField value={undefined} onCommit={vi.fn()} />)
    expect(screen.getByRole('spinbutton', { name: 'Rest days' })).toHaveValue(null)
  })

  test('commits a typed number on blur, and a cleared field as 0, committing nothing when nothing changed', () => {
    const onCommit = vi.fn()
    const { rerender } = render(<RestDaysField value={undefined} onCommit={onCommit} />)
    const days = screen.getByRole('spinbutton', { name: 'Rest days' })

    fireEvent.blur(days)
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.change(days, { target: { value: '30' } })
    fireEvent.blur(days)
    expect(onCommit).toHaveBeenLastCalledWith(30)

    rerender(<RestDaysField value={30} onCommit={onCommit} />)
    fireEvent.change(days, { target: { value: '' } })
    fireEvent.keyDown(days, { key: 'Enter' })
    expect(onCommit).toHaveBeenLastCalledWith(0)
    expect(onCommit).toHaveBeenCalledTimes(2)
  })
})
