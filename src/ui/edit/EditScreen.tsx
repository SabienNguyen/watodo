import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronLeftIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  addActivity, addLabel, addSection, addActivityToSection, deleteActivity, deleteLabel, deleteSection, deleteTemplate,
  draftFromTemplate, removeActivityFromSection, renameActivity, renameLabel, renameSection, sectionsOfActivity,
  setActivityCommitted, setActivityInSection, setDefaultTemplate, setLabelWeekdays, templatesUsingSection,
  type Activity, type Id, type Label, type Section, type Snapshot, type TemplateDraft,
} from '@/domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useSnapshot, useWatodo } from '@/ui/hooks'
import { AddField, EditableText } from './fields'
import { NameRow } from './NameRow'
import { StarterPicker } from './StarterPicker'
import { TemplateEditorForm } from './TemplateEditor'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const PARTS = ['Slots', 'Activities', 'Templates', 'Labels'] as const
type Part = (typeof PARTS)[number]

const PART = 'flex flex-col gap-4'
const LIST = 'flex flex-col divide-y'

/**
 * The item an editing view is open on. A template draft has no templateId when it is new or a
 * copy. `session` is new for each draft opened, so the template editor starts afresh.
 */
type Editing =
  | { kind: 'slot'; id: Id }
  | { kind: 'activity'; id: Id }
  | { kind: 'label'; id: Id }
  | { kind: 'template'; draft: TemplateDraft; session: string }

/** An editing view as the snapshot holds it now. */
type Shown =
  | { kind: 'slot'; section: Section }
  | { kind: 'activity'; activity: Activity }
  | { kind: 'label'; label: Label }
  | Extract<Editing, { kind: 'template' }>

/** The view to show, or null when there is none, or when its item has gone (for example, deleted elsewhere). */
function resolve(snap: Snapshot, editing: Editing | null): Shown | null {
  if (editing === null) return null
  if (editing.kind === 'slot') {
    const section = snap.sections.find(candidate => candidate.id === editing.id)
    return section === undefined ? null : { kind: 'slot', section }
  }
  if (editing.kind === 'activity') {
    const activity = snap.activities.find(candidate => candidate.id === editing.id)
    return activity === undefined ? null : { kind: 'activity', activity }
  }
  if (editing.kind === 'label') {
    const label = snap.labels.find(candidate => candidate.id === editing.id)
    return label === undefined ? null : { kind: 'label', label }
  }
  const { templateId } = editing.draft
  const gone = templateId !== undefined && !snap.templates.some(template => template.id === templateId)
  return gone ? null : editing
}

export function EditScreen() {
  const snap = useSnapshot()
  // Plain component state: it resets when the Edit screen unmounts.
  const [part, setPart] = useState<Part>('Slots')
  // The editing view that replaces the list, or null for the list.
  const [editing, setEditing] = useState<Editing | null>(null)
  const baseId = useId()
  const tabRefs = useRef<Partial<Record<Part, HTMLButtonElement | null>>>({})
  const tabId = (name: Part) => `${baseId}-tab-${name}`
  const panelId = `${baseId}-panel`

  // Left and right arrows move to the neighbouring tab, wrapping at the ends, and select it.
  const moveWithArrows = (event: KeyboardEvent<HTMLButtonElement>, name: Part) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const next = PARTS[(PARTS.indexOf(name) + step + PARTS.length) % PARTS.length]
    setPart(next)
    tabRefs.current[next]?.focus()
  }

  // Going into or out of an editing view takes the page to the top.
  const edit = (next: Editing | null) => {
    window.scrollTo(0, 0)
    setEditing(next)
  }
  const back = () => edit(null)
  const openDraft = (draft: TemplateDraft) => edit({ kind: 'template', draft, session: crypto.randomUUID() })

  const shown = resolve(snap, editing)
  if (shown?.kind === 'slot') {
    return <SlotView key={shown.section.id} part={part} section={shown.section} onBack={back} />
  }
  if (shown?.kind === 'activity') {
    return <ActivityView key={shown.activity.id} part={part} activity={shown.activity} onBack={back} />
  }
  if (shown?.kind === 'label') {
    return <LabelView key={shown.label.id} part={part} label={shown.label} onBack={back} />
  }
  if (shown?.kind === 'template') {
    return (
      <TemplateView
        key={shown.session}
        part={part}
        draft={shown.draft}
        onBack={back}
        onOpenDraft={openDraft}
      />
    )
  }

  return (
    <div className="flex flex-col">
      <div role="tablist" aria-label="Edit parts" className="grid grid-cols-4 border-b">
        {PARTS.map(name => {
          const selected = name === part
          return (
            <button
              key={name}
              ref={element => { tabRefs.current[name] = element }}
              type="button"
              role="tab"
              id={tabId(name)}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => setPart(name)}
              onKeyDown={event => moveWithArrows(event, name)}
              className={`-mb-px min-h-11 rounded-t-lg border px-1 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                selected
                  ? 'border-border bg-background font-semibold text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {name}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={tabId(part)} className="rounded-b-xl border border-t-0 p-4">
        {part === 'Slots' && <SlotsPart onOpen={id => edit({ kind: 'slot', id })} />}
        {part === 'Activities' && <ActivitiesPart onOpen={id => edit({ kind: 'activity', id })} />}
        {part === 'Labels' && <LabelsPart onOpen={id => edit({ kind: 'label', id })} />}
        {part === 'Templates' && <TemplatesPart onOpenDraft={openDraft} />}
      </div>
    </div>
  )
}

/** The frame of every editing view: a back button to the tab the item came from, then the heading. */
function EditingFrame({ part, heading, onBack, children }: {
  part: Part
  heading: string
  onBack(): void
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" className="-ml-2 self-start" aria-label={`Back to ${part}`} onClick={onBack}>
        <ChevronLeftIcon aria-hidden="true" />
        {part}
      </Button>
      <h2 className="text-xl font-semibold">{heading}</h2>
      {children}
    </div>
  )
}

function SlotsPart({ onOpen }: { onOpen(id: Id): void }) {
  const { store } = useWatodo()
  const snap = useSnapshot()

  return (
    <div className={PART}>
      <ul className={LIST}>
        {snap.sections.map(section => (
          <NameRow key={section.id} name={section.name} onOpen={() => onOpen(section.id)} />
        ))}
      </ul>

      <AddField
        label="Slot name"
        placeholder="Slot name"
        button="Add slot"
        onAdd={name => onOpen(addSection(store, name))}
      />
    </div>
  )
}

/** A slot's editing view: its name, its activities, and deleting it. */
function SlotView({ part, section, onBack }: { part: Part; section: Section; onBack(): void }) {
  const { store } = useWatodo()
  const snap = useSnapshot()
  // Whether the delete dialog is open.
  const [deleting, setDeleting] = useState(false)
  // Whether the activity added next is committed. Unticked after each add.
  const [committed, setCommitted] = useState(false)
  const using = templatesUsingSection(snap, section.id)
  const activities = snap.listings
    .filter(listing => listing.sectionId === section.id)
    .flatMap(listing => {
      const activity = snap.activities.find(candidate => candidate.id === listing.activityId)
      return activity === undefined ? [] : [activity]
    })

  return (
    <EditingFrame part={part} heading={section.name} onBack={onBack}>
      <div className="flex flex-col gap-1">
        <EditableText
          aria-label="Slot name"
          value={section.name}
          onCommit={name => renameSection(store, section.id, name)}
        />
        <p className="text-sm text-muted-foreground">
          {using.length > 0 ? `Used by: ${using.map(template => template.name).join(', ')}` : 'Not used by any template'}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {activities.map(activity => (
          <li key={activity.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{activity.name}</span>
            {activity.committed && <Badge variant="secondary" className="shrink-0">committed</Badge>}
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => removeActivityFromSection(store, section.id, activity.id)}
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
        extra={(
          <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
            <input
              type="checkbox"
              aria-label="New activity is committed"
              checked={committed}
              onChange={event => setCommitted(event.target.checked)}
            />
            Committed
          </label>
        )}
        onAdd={name => {
          addActivityToSection(store, section.id, name, { committed })
          setCommitted(false)
        }}
      />

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setDeleting(true)}>
          Delete slot
        </Button>
      </div>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{`Delete "${section.name}"?`}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {using.length > 0
              ? `It will be removed from: ${using.map(template => template.name).join(', ')}.`
              : 'No template uses it.'}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteSection(store, section.id)
                setDeleting(false)
                onBack()
              }}
            >
              Delete slot
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </EditingFrame>
  )
}

/**
 * Every activity once, by name without regard to case. The search keeps the activities whose names
 * contain its text, ignoring case and surrounding spaces. Adding one opens its view; a blank name is ignored.
 */
function ActivitiesPart({ onOpen }: { onOpen(id: Id): void }) {
  const { store } = useWatodo()
  const snap = useSnapshot()
  // The search text is plain component state: it resets when the tab or an activity's view is left.
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const activities = [...snap.activities]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .filter(activity => activity.name.toLowerCase().includes(query))

  return (
    <div className={PART}>
      <Input
        type="search"
        aria-label="Search activities"
        placeholder="Search"
        value={search}
        onChange={event => setSearch(event.target.value)}
      />

      {activities.length === 0 && query !== '' ? (
        <p className="text-sm text-muted-foreground">No activities match.</p>
      ) : (
        <ul className={LIST}>
          {activities.map(activity => (
            <NameRow
              key={activity.id}
              name={activity.name}
              badge={activity.committed ? 'committed' : undefined}
              onOpen={() => onOpen(activity.id)}
            />
          ))}
        </ul>
      )}

      <AddField
        label="Activity name"
        placeholder="Activity name"
        button="Add activity"
        onAdd={name => {
          const id = addActivity(store, name)
          if (id !== '') onOpen(id)
        }}
      />
    </div>
  )
}

/** An activity's editing view: its name, whether it is committed, the slots it is listed in, and deleting it. */
function ActivityView({ part, activity, onBack }: { part: Part; activity: Activity; onBack(): void }) {
  const { store } = useWatodo()
  const snap = useSnapshot()
  // Whether the delete dialog is open.
  const [deleting, setDeleting] = useState(false)
  const slotsHeading = useId()
  const listed = new Set(sectionsOfActivity(snap, activity.id).map(section => section.id))

  return (
    <EditingFrame part={part} heading={activity.name} onBack={onBack}>
      <EditableText
        aria-label="Activity name"
        value={activity.name}
        onCommit={name => renameActivity(store, activity.id, name)}
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          aria-label={`${activity.name} is committed`}
          checked={activity.committed}
          onChange={event => setActivityCommitted(store, activity.id, event.target.checked)}
        />
        Committed
      </label>

      <div role="group" aria-labelledby={slotsHeading} className="flex flex-col gap-2">
        <h3 id={slotsHeading} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Slots</h3>
        {snap.sections.map(section => (
          <label key={section.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={listed.has(section.id)}
              onChange={event => setActivityInSection(store, activity.id, section.id, event.target.checked)}
            />
            {section.name}
          </label>
        ))}
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setDeleting(true)}>
          Delete activity
        </Button>
      </div>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{`Delete "${activity.name}"?`}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteActivity(store, activity.id)
                setDeleting(false)
                onBack()
              }}
            >
              Delete activity
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </EditingFrame>
  )
}

function LabelsPart({ onOpen }: { onOpen(id: Id): void }) {
  const { store } = useWatodo()
  const snap = useSnapshot()

  return (
    <div className={PART}>
      <ul className={LIST}>
        {snap.labels.map(label => (
          <NameRow key={label.id} name={label.name} onOpen={() => onOpen(label.id)} />
        ))}
      </ul>

      <AddField
        label="New label name"
        placeholder="Label name"
        button="Add label"
        onAdd={name => onOpen(addLabel(store, name))}
      />
    </div>
  )
}

/** A label's editing view: its name, its weekdays, and deleting it. */
function LabelView({ part, label, onBack }: { part: Part; label: Label; onBack(): void }) {
  const { store } = useWatodo()
  const snap = useSnapshot()
  const inUse = snap.templates.some(template => template.labelId === label.id)

  return (
    <EditingFrame part={part} heading={label.name} onBack={onBack}>
      <EditableText
        aria-label="Label name"
        value={label.name}
        onCommit={name => renameLabel(store, label.id, name)}
      />

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

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={inUse}
          onClick={() => { if (deleteLabel(store, label.id)) onBack() }}
        >
          Delete
        </Button>
        {inUse && <span className="text-xs text-muted-foreground">Used by a template</span>}
      </div>
    </EditingFrame>
  )
}

function TemplatesPart({ onOpenDraft }: { onOpenDraft(draft: TemplateDraft): void }) {
  const snap = useSnapshot()
  // Whether the starter picker is open for a new template.
  const [picking, setPicking] = useState(false)

  const open = (draft: TemplateDraft | null) => {
    if (draft !== null) onOpenDraft(draft)
  }

  return (
    <div className={PART}>
      {snap.labels.map(label => {
        const templates = snap.templates.filter(template => template.labelId === label.id)
        return (
          <div key={label.id} className="flex flex-col gap-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label.name}</h3>
            {templates.length === 0 && <p className="text-sm text-muted-foreground">No templates yet.</p>}
            <ul className={LIST}>
              {templates.map(template => (
                <NameRow
                  key={template.id}
                  name={template.name}
                  badge={template.id === snap.defaultTemplateId ? 'default' : undefined}
                  onOpen={() => open(draftFromTemplate(snap, template.id, 'edit'))}
                />
              ))}
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
          onOpenDraft(draft)
        }}
        onClose={() => setPicking(false)}
      />
    </div>
  )
}

/**
 * A template's editing view: the actions for a saved template, then the editor. A draft with no
 * templateId is a new template, or a copy of one, and has no actions. Nothing is written until Save.
 */
function TemplateView({ part, draft, onBack, onOpenDraft }: {
  part: Part
  draft: TemplateDraft
  onBack(): void
  onOpenDraft(draft: TemplateDraft): void
}) {
  const { store } = useWatodo()
  const snap = useSnapshot()
  // Whether the dialog is open that asks who takes over when the default is deleted.
  const [choosingDefault, setChoosingDefault] = useState(false)
  const { templateId } = draft
  const saved = templateId === undefined ? undefined : snap.templates.find(template => template.id === templateId)
  const isDefault = templateId !== undefined && templateId === snap.defaultTemplateId

  const copy = () => {
    if (templateId === undefined) return
    const next = draftFromTemplate(snap, templateId, 'copy')
    if (next !== null) onOpenDraft(next)
  }

  const remove = () => {
    if (templateId === undefined) return
    const result = deleteTemplate(store, templateId)
    // The default needs a new one first: the dialog asks which template takes over.
    if (result === 'needs-new-default') {
      setChoosingDefault(true)
      return
    }
    if (result === 'restored-basic') toast('That was your last template, so the Basic day was restored.')
    onBack()
  }

  return (
    <EditingFrame part={part} heading={templateId === undefined ? 'New template' : 'Edit template'} onBack={onBack}>
      {templateId !== undefined && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={copy}>Copy</Button>
          {isDefault ? (
            <Badge variant="secondary">default</Badge>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setDefaultTemplate(store, templateId)}>
              Make default
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={remove}>Delete</Button>
        </div>
      )}

      <TemplateEditorForm draft={draft} onSaved={() => onBack()} onCancel={onBack} />

      {templateId !== undefined && (
        <Dialog open={choosingDefault} onOpenChange={setChoosingDefault}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{`"${saved?.name ?? draft.name}" is your default template`}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Which template takes over as the default?</p>
            <div className="flex flex-col gap-2">
              {snap.templates
                .filter(template => template.id !== templateId)
                .map(template => (
                  <Button
                    key={template.id}
                    variant="outline"
                    className="h-12 justify-start text-base"
                    onClick={() => {
                      deleteTemplate(store, templateId, template.id)
                      setChoosingDefault(false)
                      onBack()
                    }}
                  >
                    {template.name}
                  </Button>
                ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </EditingFrame>
  )
}
