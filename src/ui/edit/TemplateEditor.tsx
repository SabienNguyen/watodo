import { useId, useState } from 'react'
import { DragDropProvider, KeyboardSensor, PointerSensor, type DragEndEvent } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { GripVerticalIcon, XIcon } from 'lucide-react'
import {
  moveStep, saveTemplate, type DraftStep, type Id, type Section, type TemplateDraft,
} from '@/domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/ui/NativeSelect'
import { useSnapshot, useWatodo } from '@/ui/hooks'

const NEW_LABEL = '__new-label__'
const NEW_SLOT = '__new-slot__'

/** Names match the way save resolves them: trimmed and case-insensitive. */
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** A step being edited, with the local key its sortable row needs and whether its slot is being typed. */
type Row = DraftStep & { key: string; typingNew: boolean }

/**
 * The template editor in a dialog: a fixed title and footer, with the steps scrolling between them.
 * Cancel (or closing the dialog) discards the copy.
 */
export function TemplateEditor({ draft, onSaved, onCancel }: {
  draft: TemplateDraft
  onSaved(templateId: Id): void
  onCancel(): void
}) {
  return (
    <Dialog open onOpenChange={next => { if (!next) onCancel() }}>
      {/* The steps region scrolls only inside the dialog, where the dialog's height is capped. */}
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[90svh] flex-col gap-0 overflow-hidden p-0 [&_[data-slot=template-steps]]:overflow-y-auto"
      >
        <DialogHeader className="shrink-0 p-4 pb-0">
          <DialogTitle>{draft.templateId === undefined ? 'New template' : 'Edit template'}</DialogTitle>
        </DialogHeader>
        <TemplateEditorForm draft={draft} onSaved={onSaved} onCancel={onCancel} />
      </DialogContent>
    </Dialog>
  )
}

/**
 * The editor's fields, steps and Cancel / Save, with no dialog or title around it. It flows in the
 * page; inside the dialog it fills the dialog's height, with the fields and footer kept in view.
 * Edits a copy of the draft. Nothing is written until Save, which calls saveTemplate once.
 */
export function TemplateEditorForm({ draft, onSaved, onCancel }: {
  draft: TemplateDraft
  onSaved(templateId: Id): void
  onCancel(): void
}) {
  const { store } = useWatodo()
  const snap = useSnapshot()
  const formId = useId()
  const [name, setName] = useState(draft.name)
  const [label, setLabel] = useState(draft.label)
  // A label the draft proposes as new stays pickable, even after another label was chosen.
  const [proposedLabel] = useState(() => ('id' in draft.label ? null : draft.label))
  const [rows, setRows] = useState<Row[]>(() =>
    draft.steps.map(step => ({ ...step, key: crypto.randomUUID(), typingNew: false })))

  const trimmedName = name.trim()
  // A proposed new label whose name matches an existing label is that label: save reuses it, so it is shown once.
  const matchingLabel = proposedLabel === null
    ? undefined
    : snap.labels.find(item => sameName(item.name, proposedLabel.newName))

  const onDragEnd = (event: DragEndEvent) => {
    if (event.canceled) return
    const source = event.operation.source
    if (!source || !isSortable(source)) return
    // moveStep only reorders the array it is given, so each row keeps its key and fields.
    setRows(current => moveStep(current, source.initialIndex, source.index) as Row[])
  }

  const replaceRow = (key: string, next: Row) =>
    setRows(current => current.map(row => (row.key === key ? next : row)))
  const removeRow = (key: string) => setRows(current => current.filter(row => row.key !== key))

  const addFixed = () =>
    setRows(current => [...current, { kind: 'fixed', name: '', key: crypto.randomUUID(), typingNew: false }])
  const addSlot = () => {
    const first = snap.sections[0]
    setRows(current => [...current, {
      kind: 'slot',
      slotName: first?.name ?? '',
      key: crypto.randomUUID(),
      typingNew: first === undefined,
    }])
  }

  const chooseLabel = (value: string) => {
    if (value === NEW_LABEL && proposedLabel !== null) setLabel(proposedLabel)
    else setLabel({ id: value })
  }

  const save = () => {
    const templateId = saveTemplate(store, {
      templateId: draft.templateId,
      name: trimmedName,
      label,
      steps: rows.map(toStep),
    })
    onSaved(templateId)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-4 border-b p-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${formId}-name`}>Name</Label>
          <Input id={`${formId}-name`} value={name} onChange={event => setName(event.target.value)} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${formId}-label`}>Label</Label>
          <NativeSelect
            id={`${formId}-label`}
            value={'id' in label ? label.id : (matchingLabel?.id ?? NEW_LABEL)}
            onChange={event => chooseLabel(event.target.value)}
          >
            {snap.labels.map(item => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
            {proposedLabel !== null && matchingLabel === undefined && (
              <option value={NEW_LABEL}>{proposedLabel.newName}</option>
            )}
          </NativeSelect>
        </div>
      </div>

      <div data-slot="template-steps" className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-1">
        <h3 className="text-sm font-medium">Steps</h3>
        <DragDropProvider sensors={[PointerSensor, KeyboardSensor]} onDragEnd={onDragEnd}>
          <ul className="flex flex-col gap-2">
            {rows.map((row, index) => (
              <StepRow
                key={row.key}
                row={row}
                index={index}
                sections={snap.sections}
                onChange={next => replaceRow(row.key, next)}
                onRemove={() => removeRow(row.key)}
              />
            ))}
          </ul>
        </DragDropProvider>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={addFixed}>Add fixed step</Button>
          <Button variant="outline" onClick={addSlot}>Add slot</Button>
        </div>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t p-4">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button disabled={trimmedName === ''} onClick={save}>Save</Button>
      </div>
    </div>
  )
}

function StepRow({ row, index, sections, onChange, onRemove }: {
  row: Row
  index: number
  sections: Section[]
  onChange(next: Row): void
  onRemove(): void
}) {
  const { ref, handleRef, isDragging } = useSortable({ id: row.key, index })
  const shownName = stepName(row)
  // A slot name that matches an existing slot is that slot: save reuses it, so it is shown once.
  const matchingSection = row.kind === 'slot'
    ? sections.find(section => sameName(section.name, row.slotName))
    : undefined

  // One grid line: handle | kind badge | field | remove. The field column is the only flexible one.
  // The typed slot name, when shown, sits on a second line under the select, in the field column.
  return (
    <li
      ref={ref}
      className={`grid grid-cols-[3rem_2.75rem_minmax(0,1fr)_3rem] items-center gap-2 rounded-xl ${isDragging ? 'bg-muted' : ''}`}
    >
      <Button
        ref={handleRef}
        variant="ghost"
        size="icon"
        className="size-12 touch-none cursor-grab"
        aria-label={`Drag to reorder ${shownName}`}
      >
        <GripVerticalIcon />
      </Button>
      <Badge variant="outline" className="w-11 px-0 text-muted-foreground">{row.kind}</Badge>

      {row.kind === 'fixed' ? (
        <Input
          aria-label="Step name"
          value={row.name}
          onChange={event => onChange({ ...row, name: event.target.value })}
        />
      ) : (
        <>
          <NativeSelect
            aria-label="Slot"
            value={row.typingNew ? NEW_SLOT : (matchingSection?.name ?? row.slotName)}
            onChange={event => {
              const value = event.target.value
              if (value === NEW_SLOT) onChange({ ...row, slotName: '', typingNew: true })
              else onChange({ ...row, slotName: value, typingNew: false })
            }}
          >
            {sections.map(section => (
              <option key={section.id} value={section.name}>{section.name}</option>
            ))}
            {!row.typingNew && row.slotName !== '' && matchingSection === undefined && (
              <option value={row.slotName}>{row.slotName}</option>
            )}
            <option value={NEW_SLOT}>New slot…</option>
          </NativeSelect>
          {row.typingNew && (
            <Input
              aria-label="New slot name"
              className="col-start-3 row-start-2"
              value={row.slotName}
              onChange={event => onChange({ ...row, slotName: event.target.value })}
            />
          )}
        </>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="size-12"
        aria-label={`Remove ${shownName}`}
        onClick={onRemove}
      >
        <XIcon />
      </Button>
    </li>
  )
}

/** The name a row is shown and labelled by. A blank one reads as a placeholder. */
function stepName(row: Row): string {
  if (row.kind === 'fixed') return row.name.trim() || 'new step'
  return row.slotName.trim() || 'new slot'
}

/** The row's step as the draft holds it: without its local key or typing flag. */
function toStep({ key: _key, typingNew: _typingNew, ...step }: Row): DraftStep {
  return step
}
