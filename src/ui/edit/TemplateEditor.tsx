import { useId } from 'react'
import {
  addItem, deleteItem, formatDayMinutes, itemsOf, renameTemplate, setTemplateLabel, toDayMinutes,
  updateItem, type Id, type TemplateItem,
} from '@/domain'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/ui/NativeSelect'
import { useSnapshot, useWatodo } from '@/ui/hooks'
import { EditableText } from './fields'

/** 03:59 the next morning: the latest minute a day can hold. */
const LATEST_MINUTES = 1679
const NEW_STEP_MINUTES = 60
const EMPTY_DAY_START = toDayMinutes('09:00')

export function TemplateEditor({ templateId, onClose }: { templateId: Id; onClose(): void }) {
  const { store } = useWatodo()
  const snap = useSnapshot()
  const formId = useId()
  const template = snap.templates.find(t => t.id === templateId)
  if (template === undefined) return <></>

  const items = itemsOf(snap, templateId)
  const firstSection = snap.sections[0]

  const addStep = () => {
    const last = items.at(-1)
    const start = Math.min(last ? last.end : EMPTY_DAY_START, LATEST_MINUTES - 1)
    const end = Math.min(start + NEW_STEP_MINUTES, LATEST_MINUTES)
    addItem(store, templateId, { kind: 'fixed', name: 'New step', start, end })
  }

  // Switching to a slot gives it the first section when it has none.
  const changeKind = (item: TemplateItem, value: string) => {
    if (value === 'slot' && item.sectionId === undefined && firstSection !== undefined) {
      updateItem(store, item.id, { kind: 'slot', sectionId: firstSection.id })
    } else {
      updateItem(store, item.id, { kind: value === 'slot' ? 'slot' : 'fixed' })
    }
  }

  // An empty time is not a time: the field keeps showing the stored value.
  const changeTime = (item: TemplateItem, field: 'start' | 'end', value: string) => {
    if (value === '') return
    const minutes = toDayMinutes(value)
    updateItem(store, item.id, field === 'start' ? { start: minutes } : { end: minutes })
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent aria-describedby={undefined} className="max-h-[85svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit template</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${formId}-name`}>Name</Label>
          <EditableText
            id={`${formId}-name`}
            value={template.name}
            onCommit={name => renameTemplate(store, templateId, name)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${formId}-label`}>Label</Label>
          <NativeSelect
            id={`${formId}-label`}
            value={template.labelId}
            onChange={event => setTemplateLabel(store, templateId, event.target.value)}
          >
            {snap.labels.map(label => (
              <option key={label.id} value={label.id}>{label.name}</option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Steps</h3>
          <ul className="flex flex-col gap-3">
            {items.map(item => (
              <li key={item.id} className="flex flex-col gap-2 rounded-xl p-3 ring-1 ring-foreground/10">
                <div className="flex gap-2">
                  <NativeSelect
                    aria-label="Kind"
                    className="w-32 shrink-0"
                    value={item.kind}
                    onChange={event => changeKind(item, event.target.value)}
                  >
                    <option value="fixed">Fixed step</option>
                    <option value="slot">Slot</option>
                  </NativeSelect>
                  <EditableText
                    aria-label="Step name"
                    value={item.name}
                    onCommit={name => updateItem(store, item.id, { name })}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    aria-label="Start"
                    value={formatDayMinutes(item.start)}
                    onChange={event => changeTime(item, 'start', event.target.value)}
                  />
                  <Input
                    type="time"
                    aria-label="End"
                    value={formatDayMinutes(item.end)}
                    onChange={event => changeTime(item, 'end', event.target.value)}
                  />
                </div>

                {item.kind === 'slot' && (
                  <NativeSelect
                    aria-label="Section"
                    value={item.sectionId ?? ''}
                    onChange={event => updateItem(store, item.id, { sectionId: event.target.value })}
                  >
                    {item.sectionId === undefined && <option value="" disabled>Choose a section</option>}
                    {snap.sections.map(section => (
                      <option key={section.id} value={section.id}>{section.name}</option>
                    ))}
                  </NativeSelect>
                )}

                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => deleteItem(store, item.id)}>Delete step</Button>
                </div>
              </li>
            ))}
          </ul>
          <div>
            <Button variant="outline" onClick={addStep}>Add step</Button>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
