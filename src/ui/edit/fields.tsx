import { useState } from 'react'
import type { ComponentProps, FormEvent, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type InputProps = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'onBlur' | 'onKeyDown'>

/**
 * A text field for a name that is already stored. Typing keeps a draft; the change is
 * committed on blur or Enter. A blank draft is discarded, and a value that did not change is not committed.
 */
export function EditableText({ value, onCommit, ...props }: InputProps & {
  value: string
  onCommit(text: string): void
}) {
  const [draft, setDraft] = useState(value)
  const [shown, setShown] = useState(value)
  // The stored value changed (from here or elsewhere): show it, dropping any unsaved draft.
  if (value !== shown) {
    setShown(value)
    setDraft(value)
  }

  const commit = () => {
    const text = draft.trim()
    if (text === '') setDraft(value)
    else if (text !== value) onCommit(text)
  }

  return (
    <Input
      {...props}
      value={draft}
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter') commit()
      }}
    />
  )
}

/**
 * A text field and an Add button. Blank names are ignored; the field clears after each add.
 * `extra`, such as a checkbox, sits between the field and the button. When the row is too narrow
 * for all three, `extra` moves to its own line under the field.
 */
export function AddField({ label, placeholder, button, extra, onAdd }: {
  label: string
  placeholder: string
  button: string
  extra?: ReactNode
  onAdd(name: string): void
}) {
  const [text, setText] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const name = text.trim()
    if (name === '') return
    onAdd(name)
    setText('')
  }

  if (extra === undefined) {
    return (
      <form onSubmit={submit} className="flex items-center gap-2">
        <Input
          aria-label={label}
          placeholder={placeholder}
          value={text}
          onChange={event => setText(event.target.value)}
        />
        <Button type="submit" variant="outline" className="shrink-0">{button}</Button>
      </form>
    )
  }

  // Lays out by the form's own width (a container query), at 20rem or more for three columns.
  return (
    <form onSubmit={submit} className="@container">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 @xs:grid-cols-[minmax(8rem,1fr)_auto_auto]">
        <Input
          className="col-start-1 row-start-1"
          aria-label={label}
          placeholder={placeholder}
          value={text}
          onChange={event => setText(event.target.value)}
        />
        <div className="col-start-1 row-start-2 @xs:col-start-2 @xs:row-start-1">{extra}</div>
        <Button type="submit" variant="outline" className="col-start-2 row-start-1 @xs:col-start-3">{button}</Button>
      </div>
    </form>
  )
}
