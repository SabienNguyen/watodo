import { useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import {
  activityName, addDays, addPastEntry, dayKeyOf, deleteEntry, editEntry, entrySlotName, journalDay, nowView,
  sectionActivities, setDayNote, templateName, type DayKey, type Id, type JournalEntry,
} from '@/domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/ui/NativeSelect'
import { dayLabel } from '@/ui/format'
import { useNowDate, useSnapshot, useWatodo } from '@/ui/hooks'
import { UndoCommitDialog } from '@/ui/UndoCommitDialog'
import { FullDay } from './FullDay'

/** One day at a time, starting today. The day can be moved back freely but not forward past today. */
export function JournalScreen() {
  const snap = useSnapshot()
  const now = useNowDate()
  const today = dayKeyOf(now)
  const [viewed, setViewed] = useState<DayKey>(today)
  const [editingId, setEditingId] = useState<Id | null>(null)
  const [adding, setAdding] = useState(false)
  const editing = snap.journal.find(entry => entry.id === editingId)

  const isToday = viewed === today
  const day = journalDay(snap, viewed)
  const dayTemplate = day.templateId === null ? 'Template not chosen' : templateName(snap, day.templateId)
  const hasFullDay = isToday && nowView(snap, now).guess.confirmed

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            aria-label="Previous day"
            onClick={() => setViewed(addDays(viewed, -1))}
          >
            <ChevronLeftIcon />
          </Button>
          <h2 className="flex-1 text-center text-lg font-semibold">{dayLabel(viewed)}</h2>
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            aria-label="Next day"
            disabled={viewed >= today}
            onClick={() => setViewed(addDays(viewed, 1))}
          >
            <ChevronRightIcon />
          </Button>
        </div>
        {isToday
          ? <p className="text-center text-sm text-muted-foreground">Today</p>
          : (
            <div className="flex justify-center">
              <Button variant="link" size="sm" onClick={() => setViewed(today)}>Back to today</Button>
            </div>
          )}
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{dayTemplate}</p>

        {hasFullDay && <FullDayToggle />}

        {day.entries.length === 0
          ? <p className="text-muted-foreground">Nothing logged.</p>
          : (
            <ul className="flex flex-col divide-y">
              {day.entries.map(entry => (
                <EntryRow key={entry.id} entry={entry} onEdit={() => setEditingId(entry.id)} />
              ))}
            </ul>
          )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setAdding(true)}>Add entry</Button>
        </div>

        <DayNote key={viewed} day={viewed} note={day.note} />
      </div>

      {editing !== undefined && (
        <EditEntryDialog key={editing.id} entry={editing} onClose={() => setEditingId(null)} />
      )}

      {adding && (
        <AddEntryDialog today={today} initialDay={viewed} onClose={() => setAdding(false)} />
      )}
    </div>
  )
}

/** Collapsed by default. Shows today's whole template beneath the button when open. */
function FullDayToggle() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        className="self-start text-muted-foreground"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >
        {open ? 'Hide full day' : 'Show full day'}
      </Button>
      {open && <FullDay />}
    </>
  )
}

function EntryRow({ entry, onEdit }: { entry: JournalEntry; onEdit(): void }) {
  const { store } = useWatodo()
  const snap = useSnapshot()
  // Whether the Undo dialog is open for this committed entry.
  const [undoing, setUndoing] = useState(false)
  const entryActivity = activityName(snap, entry.activityId)
  const slotName = entrySlotName(snap, entry)
  const committed = entry.committed === true

  // A quick entry is deleted at once. A committed one is only deleted through the slow Undo.
  const remove = () => {
    if (committed) setUndoing(true)
    else deleteEntry(store, entry.id)
  }

  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex flex-wrap items-baseline gap-x-2 font-medium">
          <span>{entryActivity}</span>
          <span className="text-sm font-normal text-muted-foreground">{slotName}</span>
          {committed && <Badge variant="secondary">committed</Badge>}
        </p>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
          <Button variant="ghost" size="sm" onClick={remove}>Delete</Button>
        </div>
      </div>
      {entry.note ? <p className="text-sm">{entry.note}</p> : null}
      {entry.durationMinutes !== undefined && (
        <p className="text-sm text-muted-foreground">{`${entry.durationMinutes} min`}</p>
      )}
      {undoing && (
        <UndoCommitDialog
          activityName={entryActivity}
          slotName={slotName}
          onUndo={() => deleteEntry(store, entry.id)}
          onCancel={() => setUndoing(false)}
        />
      )}
    </li>
  )
}

/** Blank minutes, or minutes that are not a number, mean no duration. */
function parseMinutes(text: string): number | null {
  const parsed = Number(text)
  return text.trim() === '' || !Number.isFinite(parsed) ? null : parsed
}

function EditEntryDialog({ entry, onClose }: { entry: JournalEntry; onClose(): void }) {
  const { store } = useWatodo()
  const [note, setNote] = useState(entry.note ?? '')
  const [minutes, setMinutes] = useState(entry.durationMinutes === undefined ? '' : String(entry.durationMinutes))

  const save = () => {
    editEntry(store, entry.id, { note: note.trim(), durationMinutes: parseMinutes(minutes) })
    onClose()
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Edit entry</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-entry-note">Note</Label>
          <Textarea id="edit-entry-note" value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-entry-minutes">Minutes</Label>
          <Input
            id="edit-entry-minutes"
            type="number"
            min={0}
            inputMode="numeric"
            value={minutes}
            onChange={e => setMinutes(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddEntryDialog({ today, initialDay, onClose }: {
  today: DayKey
  initialDay: DayKey
  onClose(): void
}) {
  const { store } = useWatodo()
  const snap = useSnapshot()
  const [day, setDay] = useState(initialDay)
  const [sectionId, setSectionId] = useState<Id | ''>('')
  const [activityId, setActivityId] = useState<Id | ''>('')
  const [note, setNote] = useState('')
  const [minutes, setMinutes] = useState('')

  const activities = sectionId === '' ? [] : sectionActivities(snap, sectionId)
  const canSave = day !== '' && day <= today && sectionId !== '' && activityId !== ''

  const chooseSection = (next: Id | '') => {
    setSectionId(next)
    setActivityId('')
  }

  const save = () => {
    if (!canSave) return
    const trimmedNote = note.trim()
    const durationMinutes = parseMinutes(minutes)
    addPastEntry(store, {
      activityId,
      sectionId,
      day,
      note: trimmedNote === '' ? undefined : trimmedNote,
      durationMinutes: durationMinutes ?? undefined,
    })
    onClose()
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Add an entry</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="add-entry-day">Day</Label>
          <Input
            id="add-entry-day"
            type="date"
            max={today}
            value={day}
            onChange={e => setDay(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="add-entry-section">Slot</Label>
          <NativeSelect
            id="add-entry-section"
            value={sectionId}
            onChange={e => chooseSection(e.target.value)}
          >
            <option value="">Choose a slot</option>
            {snap.sections.map(section => (
              <option key={section.id} value={section.id}>{section.name}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="add-entry-activity">Activity</Label>
          <NativeSelect
            id="add-entry-activity"
            value={activityId}
            disabled={sectionId === ''}
            onChange={e => setActivityId(e.target.value)}
          >
            <option value="">Choose an activity</option>
            {activities.map(activity => (
              <option key={activity.id} value={activity.id}>{activity.name}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="add-entry-note">Note</Label>
          <Textarea id="add-entry-note" value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="add-entry-minutes">Minutes</Label>
          <Input
            id="add-entry-minutes"
            type="number"
            min={0}
            inputMode="numeric"
            value={minutes}
            onChange={e => setMinutes(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={!canSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Saves on blur. Clearing the text removes the note. Keyed by day, so each day has its own draft. */
function DayNote({ day, note }: { day: DayKey; note: string }) {
  const { store } = useWatodo()
  const [draft, setDraft] = useState(note)
  const [shown, setShown] = useState(note)
  // The stored note changed (from here or elsewhere): show it, dropping any unsaved draft.
  if (note !== shown) {
    setShown(note)
    setDraft(note)
  }

  const commit = () => {
    const text = draft.trim()
    setDraft(text)
    if (text !== note) setDayNote(store, day, text)
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`day-note-${day}`}>Day note</Label>
      <Textarea
        id={`day-note-${day}`}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
      />
    </div>
  )
}
