import { useState } from 'react'
import type { ComponentProps, FormEvent } from 'react'
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

/** A text field and an Add button. Blank names are ignored; the field clears after each add. */
export function AddField({ label, placeholder, button, onAdd }: {
  label: string
  placeholder: string
  button: string
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
