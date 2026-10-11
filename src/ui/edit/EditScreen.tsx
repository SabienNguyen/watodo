import { useState } from 'react'
import { toast } from 'sonner'
import {
  addLabel, addSection, addActivityToSection, deleteLabel, deleteSection, deleteTemplate,
  draftFromTemplate, removeActivityFromSection, renameActivity, renameLabel, renameSection,
  setDefaultTemplate, setLabelWeekdays, templatesUsingSection, type Id, type Template, type TemplateDraft,
} from '@/domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSnapshot, useWatodo } from '@/ui/hooks'
import { AddField, EditableText } from './fields'
import { StarterPicker } from './StarterPicker'
import { TemplateEditor } from './TemplateEditor'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const HEADING = 'text-lg font-semibold'
const PART = 'flex flex-col gap-4'

export function EditScreen() {
  return (
    <div className="flex flex-col gap-10">
      <SlotsPart />
      <LabelsPart />
      <TemplatesPart />
    </div>
  )
}

function SlotsPart() {
  const { store } = useWatodo()
  const snap = useSnapshot()
  const activityNames = new Map(snap.activities.map(activity => [activity.id, activity.name]))
  // The slot whose delete dialog is open.
  const [deletingId, setDeletingId] = useState<Id | null>(null)
  const deleting = snap.sections.find(section => section.id === deletingId)
  const usedBy = deleting === undefined ? [] : templatesUsingSection(snap, deleting.id)

  return (
    <section aria-labelledby="slots-heading" className={PART}>
      <div className="flex flex-col gap-1">
        <h2 id="slots-heading" className={HEADING}>Slots</h2>
        <p className="text-sm text-muted-foreground">
          Each slot has one list of activities, shared by every template that uses it.
        </p>
      </div>

      {snap.sections.map(section => {
        const using = templatesUsingSection(snap, section.id)
        return (
          <Card key={section.id} role="region" aria-label={section.name}>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <EditableText
                  aria-label="Section name"
                  value={section.name}
                  onCommit={name => renameSection(store, section.id, name)}
                />
                <p className="text-sm text-muted-foreground">
                  {using.length > 0 ? `Used by: ${using.map(template => template.name).join(', ')}` : 'Not used by any template'}
                </p>
              </div>

              <ul className="flex flex-col gap-2">
                {snap.listings
                  .filter(listing => listing.sectionId === section.id)
                  .flatMap(listing => {
                    const name = activityNames.get(listing.activityId)
                    return name === undefined ? [] : [{ activityId: listing.activityId, name }]
                  })
                  .map(({ activityId, name }) => (
                    <li key={activityId} className="flex items-center gap-2">
                      <EditableText
                        aria-label="Activity name"
                        value={name}
                        onCommit={text => renameActivity(store, activityId, text)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        onClick={() => removeActivityFromSection(store, section.id, activityId)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
              </ul>

              <AddField
                label={`New activity in ${section.name}`}
                placeholder="Activity name"
                button="Add"
                onAdd={name => addActivityToSection(store, section.id, name)}
              />

              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => setDeletingId(section.id)}>
                  Delete slot
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}

      <AddField
        label="Slot name"
        placeholder="Slot name"
        button="Add slot"
        onAdd={name => addSection(store, name)}
      />

      <Dialog open={deleting !== undefined} onOpenChange={open => { if (!open) setDeletingId(null) }}>
        {deleting !== undefined && (
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{`Delete "${deleting.name}"?`}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {usedBy.length > 0
                ? `It will be removed from: ${usedBy.map(template => template.name).join(', ')}.`
                : 'No template uses it.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeletingId(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  deleteSection(store, deleting.id)
                  setDeletingId(null)
                }}
              >
                Delete slot
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </section>
  )
}

function LabelsPart() {
  const { store } = useWatodo()
  const snap = useSnapshot()

  return (
    <section aria-labelledby="labels-heading" className={PART}>
      <h2 id="labels-heading" className={HEADING}>Labels</h2>

      <ul className="flex flex-col gap-4">
        {snap.labels.map(label => {
          const inUse = snap.templates.some(template => template.labelId === label.id)
          return (
            <li key={label.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <EditableText
                  aria-label="Label name"
                  value={label.name}
                  onCommit={name => renameLabel(store, label.id, name)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  disabled={inUse}
                  onClick={() => deleteLabel(store, label.id)}
                >
                  Delete
                </Button>
                {inUse && <span className="shrink-0 text-xs text-muted-foreground">Used by a template</span>}
              </div>

              <div className="flex gap-1">
                {WEEKDAYS.map((name, weekday) => {
                  const pressed = label.weekdays.includes(weekday)
                  const next = pressed
                    ? label.weekdays.filter(day => day !== weekday)
                    : [...label.weekdays, weekday]
                  return (
                    <Button
                      key={name}
                      variant={pressed ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1 px-0"
                      aria-pressed={pressed}
                      onClick={() => setLabelWeekdays(store, label.id, next)}
                    >
                      {name}
                    </Button>
                  )
                })}
              </div>
            </li>
          )
        })}
      </ul>

      <AddField
        label="New label name"
        placeholder="Label name"
        button="Add label"
        onAdd={name => addLabel(store, name)}
      />
    </section>
  )
}

function TemplatesPart() {
  const { store } = useWatodo()
  const snap = useSnapshot()
  // Set while the starter picker is open for a new template.
  const [picking, setPicking] = useState(false)
  // The draft in the template editor. Nothing is stored until the editor saves.
  const [editing, setEditing] = useState<TemplateDraft | null>(null)
  // The template being deleted while it is the default: the dialog asks who takes over.
  const [deletingId, setDeletingId] = useState<Id | null>(null)
  const deleting = snap.templates.find(template => template.id === deletingId)

  const open = (draft: TemplateDraft | null) => {
    if (draft !== null) setEditing(draft)
  }

  const remove = (template: Template) => {
    const result = deleteTemplate(store, template.id)
    if (result === 'needs-new-default') setDeletingId(template.id)
    else if (result === 'restored-basic') toast('That was your last template, so the Basic day was restored.')
  }

  return (
    <section aria-labelledby="templates-heading" className={PART}>
      <h2 id="templates-heading" className={HEADING}>Templates</h2>

      {snap.labels.map(label => {
        const templates = snap.templates.filter(template => template.labelId === label.id)
        return (
          <div key={label.id} className="flex flex-col gap-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label.name}</h3>
            {templates.length === 0 && <p className="text-sm text-muted-foreground">No templates yet.</p>}
            <ul className="flex flex-col gap-3">
              {templates.map(template => {
                const isDefault = template.id === snap.defaultTemplateId
                return (
                  <li key={template.id} className="flex flex-col gap-2 rounded-xl p-3 ring-1 ring-foreground/10">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{template.name}</span>
                      {isDefault && <Badge variant="secondary">default</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button variant="outline" size="sm" onClick={() => open(draftFromTemplate(snap, template.id, 'edit'))}>
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => open(draftFromTemplate(snap, template.id, 'copy'))}>
                        Copy
                      </Button>
                      {!isDefault && (
                        <Button variant="outline" size="sm" onClick={() => setDefaultTemplate(store, template.id)}>
                          Make default
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => remove(template)}>Delete</Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

      <div>
        <Button variant="outline" onClick={() => setPicking(true)}>New template</Button>
      </div>

      <StarterPicker
        open={picking}
        onPick={draft => {
          setPicking(false)
          setEditing(draft)
        }}
        onClose={() => setPicking(false)}
      />

      <Dialog open={deleting !== undefined} onOpenChange={next => { if (!next) setDeletingId(null) }}>
        {deleting !== undefined && (
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{`"${deleting.name}" is your default template`}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Which template takes over as the default?</p>
            <div className="flex flex-col gap-2">
              {snap.templates
                .filter(template => template.id !== deleting.id)
                .map(template => (
                  <Button
                    key={template.id}
                    variant="outline"
                    className="h-12 justify-start text-base"
                    onClick={() => {
                      deleteTemplate(store, deleting.id, template.id)
                      setDeletingId(null)
                    }}
                  >
                    {template.name}
                  </Button>
                ))}
            </div>
          </DialogContent>
        )}
      </Dialog>

      {editing !== null && (
        <TemplateEditor
          draft={editing}
          onSaved={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      )}
    </section>
  )
}
