import { useId, useRef, useState } from 'react'
import type { ComponentProps, FormEvent, ReactNode } from 'react'
import { closeNames, nameKey, type Id } from '@/domain'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type InputProps = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'onBlur' | 'onKeyDown'>

/** How many close names are offered under a name field. */
const SUGGESTIONS = 3

/**
 * Up to three close names as small outline buttons, each naming its row. Tapping one calls onPick
 * with that name. Nothing is shown when there are none.
 */
export function NameSuggestions({ rows, onPick, className }: {
  rows: { name: string }[]
  onPick(name: string): void
  className?: string
}) {
  if (rows.length === 0) return null
  return (
    <div role="group" aria-label="Similar names" className={`flex flex-wrap gap-2 ${className ?? ''}`}>
      {rows.slice(0, SUGGESTIONS).map(row => (
        <Button key={row.name} variant="outline" size="sm" onClick={() => onPick(row.name)}>
          {row.name}
        </Button>
      ))}
    </div>
  )
}

/**
 * A text field for a name that is already stored. Typing keeps a draft; the change is
 * committed on blur or Enter. A blank draft is discarded, and a value that did not change is not committed.
 * With `existing`, a name that another row already has is refused, and a close one is asked about first.
 * `selfId` is the row being edited, which is left out of that check.
 */
export function EditableText({ value, onCommit, existing, selfId, ...props }: InputProps & {
  value: string
  onCommit(text: string): void
  existing?: { id: Id; name: string }[]
  selfId?: Id
}) {
  const [draft, setDraft] = useState(value)
  const [shown, setShown] = useState(value)
  // The name of the row the draft repeats, shown under the field until the next keystroke.
  const [taken, setTaken] = useState<string | null>(null)
  // The close name that the rename dialog asks about, or null while it is closed.
  const [asking, setAsking] = useState<string | null>(null)
  // True while the dialog is open. Opening it moves focus out of the field, and that blur must not commit again.
  const askingRef = useRef(false)
  // The stored value changed (from here or elsewhere): show it, dropping any unsaved draft.
  if (value !== shown) {
    setShown(value)
    setDraft(value)
  }

  const others = (existing ?? []).filter(row => row.id !== selfId)

  const commit = () => {
    if (askingRef.current) return
    const text = draft.trim()
    if (text === '') {
      setDraft(value)
      return
    }
    if (text === value) return
    const same = others.find(row => nameKey(row.name) === nameKey(text))
    if (same !== undefined) {
      setDraft(value)
      setTaken(same.name)
      return
    }
    const close = closeNames(text, others)[0]
    if (close !== undefined) {
      askingRef.current = true
      setAsking(close.name)
      return
    }
    onCommit(text)
  }

  // Cancel, or dismissing the dialog, reverts the draft.
  const keep = () => {
    askingRef.current = false
    setAsking(null)
    setDraft(value)
  }
  const rename = () => {
    const text = draft.trim()
    askingRef.current = false
    setAsking(null)
    onCommit(text)
  }

  return (
    <div className="flex flex-col gap-1">
      <Input
        {...props}
        value={draft}
        onChange={event => {
          setDraft(event.target.value)
          setTaken(null)
        }}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') commit()
        }}
      />
      {taken !== null && <p role="alert" className="text-sm text-destructive">{`You already have ${taken}.`}</p>}

      {asking !== null && (
        <Dialog open onOpenChange={open => { if (!open) keep() }}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{`You already have ${asking}. Rename anyway?`}</DialogTitle>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={keep}>Cancel</Button>
              <Button onClick={rename}>Rename</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

/**
 * A text field and an Add button. Blank names are ignored; the field clears after each add.
 * `extra`, such as a checkbox, sits between the field and the button. When the row is too narrow
 * for all three, `extra` moves to its own line under the field.
 * With `existing`, close names are offered under the field while typing, and an add whose name is close
 * but not the same as one of them asks first: use that one, or add the new name.
 */
export function AddField({ label, placeholder, button, extra, onAdd, existing }: {
  label: string
  placeholder: string
  button: string
  extra?: ReactNode
  onAdd(name: string): void
  existing?: { name: string }[]
}) {
  const [text, setText] = useState('')
  // The close name that the dialog asks about, or null while it is closed.
  const [asking, setAsking] = useState<string | null>(null)

  // Adds a name and clears the field.
  const add = (name: string) => {
    onAdd(name)
    setText('')
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const name = text.trim()
    if (name === '') return
    const best = existing === undefined ? undefined : closeNames(name, existing)[0]
    if (best === undefined || nameKey(best.name) === nameKey(name)) add(name)
    else setAsking(best.name)
  }

  const field = (
    <Input
      className={extra === undefined ? undefined : 'col-start-1 row-start-1'}
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={event => setText(event.target.value)}
    />
  )

  const form = extra === undefined ? (
    <form onSubmit={submit} className="flex items-center gap-2">
      {field}
      <Button type="submit" variant="outline" className="shrink-0">{button}</Button>
    </form>
  ) : (
    // Lays out by the form's own width (a container query), at 20rem or more for three columns.
    <form onSubmit={submit} className="@container">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 @xs:grid-cols-[minmax(8rem,1fr)_auto_auto]">
        {field}
        <div className="col-start-1 row-start-2 @xs:col-start-2 @xs:row-start-1">{extra}</div>
        <Button type="submit" variant="outline" className="col-start-2 row-start-1 @xs:col-start-3">{button}</Button>
      </div>
    </form>
  )

  return (
    <div className="flex flex-col gap-2">
      {form}
      {existing !== undefined && <NameSuggestions rows={closeNames(text, existing)} onPick={add} />}

      {asking !== null && (
        <Dialog open onOpenChange={open => { if (!open) setAsking(null) }}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{`You already have ${asking}. Use it?`}</DialogTitle>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setAsking(null); add(text.trim()) }}>Add new</Button>
              <Button onClick={() => { setAsking(null); add(asking) }}>{`Use ${asking}`}</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

/**
 * An activity's rest days, a whole number, or blank for none. Like EditableText, typing keeps a draft that
 * is committed on blur or Enter. A blank draft, zero, or anything below 1 means no rest days.
 */
export function RestDaysField({ value, onCommit }: {
  value: number | undefined
  onCommit(days: number): void
}) {
  const id = useId()
  const [draft, setDraft] = useState(daysText(value))
  const [shown, setShown] = useState(value)
  // The stored value changed (from here or elsewhere): show it, dropping any unsaved draft.
  if (value !== shown) {
    setShown(value)
    setDraft(daysText(value))
  }

  const commit = () => {
    const typed = draft.trim() === '' ? 0 : Math.floor(Number(draft))
    const days = typed >= 1 ? typed : 0
    if (days !== (value ?? 0)) onCommit(days)
    setDraft(daysText(days))
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Rest days</Label>
      <Input
        id={id}
        aria-label="Rest days"
        type="number"
        min={0}
        inputMode="numeric"
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') commit()
        }}
      />
    </div>
  )
}

/** The rest days as a field shows them: blank for none. */
function daysText(days: number | undefined): string {
  return days === undefined || days < 1 ? '' : String(days)
}
