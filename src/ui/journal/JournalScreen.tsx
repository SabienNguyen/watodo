import { useState } from 'react'
import {
  addPastEntry, dayKeyOf, deleteEntry, editEntry, fullDayView, journalByDay, nowView, sectionActivities, setDayNote,
  type DayKey, type Id, type JournalDay, type JournalEntry, type Snapshot,
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
import { FullDay } from './FullDay'

/** Today first, even with nothing logged or noted; the other days follow newest first. */
function journalDays(snap: Snapshot, today: DayKey, todayTemplateId: Id | null): JournalDay[] {
  const listed = journalByDay(snap)
  const todayListed = listed.find(day => day.day === today)
  const todayDay: JournalDay = {
    day: today,
    templateId: todayTemplateId,
    note: todayListed?.note ?? '',
    entries: todayListed?.entries ?? [],
  }
  return [todayDay, ...listed.filter(day => day.day !== today)]
}

export function JournalScreen() {
  const snap = useSnapshot()
  const now = useNowDate()
  const today = dayKeyOf(now)
  const todayGuess = nowView(snap, now).guess
  const days = journalDays(snap, today, todayGuess.confirmed ? todayGuess.templateId : null)
  const hasFullDay = fullDayView(snap, now).template !== null
  const [editingId, setEditingId] = useState<Id | null>(null)
  const [adding, setAdding] = useState(false)
  const editing = snap.journal.find(entry => entry.id === editingId)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setAdding(true)}>Add entry</Button>
      </div>

      {days.map(day => (
        <DaySection
          key={day.day}
          day={day}
          isToday={day.day === today}
          hasFullDay={hasFullDay}
          nothingLogged={snap.journal.length === 0}
          onEdit={setEditingId}
        />
      ))}

      {editing !== undefined && (
        <EditEntryDialog key={editing.id} entry={editing} onClose={() => setEditingId(null)} />
      )}

      {adding && (
        <AddEntryDialog today={today} onClose={() => setAdding(false)} />
      )}
    </div>
  )
}

function DaySection({ day, isToday, hasFullDay, nothingLogged, onEdit }: {
  day: JournalDay
  isToday: boolean
  hasFullDay: boolean
  nothingLogged: boolean
  onEdit(entryId: Id): void
}) {
  const snap = useSnapshot()
  const headingId = `day-${day.day}`
  const templateName = day.templateId === null
    ? 'No template recorded'
    : (snap.templates.find(template => template.id === day.templateId)?.name ?? '(removed)')

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 id={headingId} className="text-lg font-semibold">{dayLabel(day.day)}</h2>
          {isToday && <Badge variant="secondary">Today</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">{templateName}</p>
      </div>

      {isToday && hasFullDay && <FullDayToggle />}

      {day.entries.length === 0 && isToday && nothingLogged && (
        <p className="text-muted-foreground">Nothing logged yet.</p>
      )}

      {day.entries.length > 0 && (
        <ul className="flex flex-col divide-y">
          {day.entries.map(entry => (
            <EntryRow key={entry.id} entry={entry} onEdit={() => onEdit(entry.id)} />
          ))}
        </ul>
      )}

      <DayNote day={day.day} note={day.note} />
    </section>
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
  const activityName = snap.activities.find(activity => activity.id === entry.activityId)?.name ?? '(removed)'
  const sectionName = snap.sections.find(section => section.id === entry.sectionId)?.name ?? '(removed)'

  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex flex-wrap items-baseline gap-x-2 font-medium">
          <span>{activityName}</span>
          <span className="text-sm font-normal text-muted-foreground">{sectionName}</span>
        </p>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
          <Button variant="ghost" size="sm" onClick={() => deleteEntry(store, entry.id)}>Delete</Button>
        </div>
      </div>
      {entry.note ? <p className="text-sm">{entry.note}</p> : null}
      {entry.durationMinutes !== undefined && (
        <p className="text-sm text-muted-foreground">{`${entry.durationMinutes} min`}</p>
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

function AddEntryDialog({ today, onClose }: {
  today: DayKey
  onClose(): void
}) {
  const { store } = useWatodo()
  const snap = useSnapshot()
  const [day, setDay] = useState(today)
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
          <Label htmlFor="add-entry-section">Section</Label>
          <NativeSelect
            id="add-entry-section"
            value={sectionId}
            onChange={e => chooseSection(e.target.value)}
          >
            <option value="">Choose a section</option>
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

/** Saves on blur. Clearing the text removes the note. */
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
