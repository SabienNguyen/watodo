import { useId } from 'react'
import {
  addItem, deleteItem, itemsOf, moveItem, renameTemplate, setTemplateLabel, updateItem, type Id, type TemplateItem,
} from '@/domain'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/ui/NativeSelect'
import { useSnapshot, useWatodo } from '@/ui/hooks'
import { EditableText } from './fields'

export function TemplateEditor({ templateId, onClose }: { templateId: Id; onClose(): void }) {
  const { store } = useWatodo()
  const snap = useSnapshot()
  const formId = useId()
  const template = snap.templates.find(t => t.id === templateId)
  if (template === undefined) return <></>

  const items = itemsOf(snap, templateId)
  const firstSection = snap.sections[0]

  const addStep = () => {
    addItem(store, templateId, { kind: 'fixed', name: 'New step' })
  }

  // Switching to a slot gives it the first section when it has none.
  const changeKind = (item: TemplateItem, value: string) => {
    if (value === 'slot' && item.sectionId === undefined && firstSection !== undefined) {
      updateItem(store, item.id, { kind: 'slot', sectionId: firstSection.id })
    } else {
      updateItem(store, item.id, { kind: value === 'slot' ? 'slot' : 'fixed' })
    }
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
            {items.map((item, index) => (
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

                <div className="flex flex-wrap justify-end gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => moveItem(store, item.id, 'up')}
                  >
                    Move up
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={index === items.length - 1}
                    onClick={() => moveItem(store, item.id, 'down')}
                  >
                    Move down
                  </Button>
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
