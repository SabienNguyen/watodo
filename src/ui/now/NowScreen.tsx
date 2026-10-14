import { useState } from 'react'
import type { ReactNode } from 'react'
import { CheckIcon, PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  activityName, addActivityToSection, deleteEntry, editEntry, entrySlotName, goToSlot, logActivity, nowView,
  readSnapshot, type Activity, type Id, type PendingLog,
} from '@/domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { lastDoneText } from '@/ui/format'
import { AddField } from '@/ui/edit/fields'
import { useNowDate, useSnapshot, useWatodo } from '@/ui/hooks'
import { UndoCommitDialog } from '@/ui/UndoCommitDialog'
import { DayPicker } from './DayPicker'
import { SpendConfirm } from './SpendConfirm'

const AFTER_LOG_MS = 6000

interface NoteTarget { entryId: Id; activityName: string }
/** A committed activity waiting for the user to confirm the spend. */
interface SpendTarget { activityId: Id; activityName: string; slotName: string }
/** A spent slot's commitment waiting for the user to undo it. */
interface UndoTarget { entryId: Id; activityName: string; slotName: string }

export function NowScreen() {
  const { store, clock } = useWatodo()
  const snap = useSnapshot()
  const now = useNowDate()
  const view = nowView(snap, now)
  const { position, positionName, slots, template, dayDone, nextSlot } = view

  // null: picker closed. An object with no pending: switch mode.
  const [picker, setPicker] = useState<{ pending?: PendingLog } | null>(null)
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null)
  const [spending, setSpending] = useState<SpendTarget | null>(null)
  const [undoing, setUndoing] = useState<UndoTarget | null>(null)

  // The spent slot the position is on, with the entry that spent it. Null on an open slot.
  const current = slots.find(({ item }) => item.id === position?.item.id)
  const spentHere = position?.spentBy ? (current?.spentBy ?? null) : null

  const showAfterLog = (entryId: Id, activityName: string) => {
    const fresh = readSnapshot(store)
    const entry = fresh.journal.find(candidate => candidate.id === entryId)
    // A committed log spent its slot: the bar names the slot and offers no Undo.
    const spentSlotName = entry?.committed === true ? entrySlotName(fresh, entry) : null
    toast.custom(id => (
      <AfterLogBar
        activityName={activityName}
        spentSlotName={spentSlotName}
        onUndo={() => {
          deleteEntry(store, entryId)
          toast.dismiss(id)
        }}
        onAddNote={() => {
          toast.dismiss(id)
          setNoteTarget({ entryId, activityName })
        }}
      />
    ), { duration: AFTER_LOG_MS })
  }

  const logTap = (activityId: Id, activityName: string) => {
    const result = logActivity(store, clock, activityId)
    if (result.status === 'logged') showAfterLog(result.entryId, activityName)
    else if (result.status === 'needs-template') setPicker({ pending: result.pending })
  }

  // A quick activity logs at once. A committed one asks first.
  const tapActivity = (activity: Activity) => {
    if (activity.committed) {
      setSpending({ activityId: activity.id, activityName: activity.name, slotName: positionName ?? '' })
    } else {
      logTap(activity.id, activity.name)
    }
  }

  const confirmSpend = (target: SpendTarget) => {
    setSpending(null)
    logTap(target.activityId, target.activityName)
  }

  const pickerDone = (entryId: Id | null) => {
    const pending = picker?.pending
    if (entryId === null || pending === undefined) return
    showAfterLog(entryId, activityName(snap, pending.activityId))
  }

  return (
    <div className="flex flex-col gap-6">
      <Button
        variant="outline"
        className="h-auto justify-between px-4 py-3 text-base"
        onClick={() => setPicker({})}
      >
        {template ? <span>{template.name}</span> : <span>Choose today&apos;s template</span>}
        {template && (
          <Badge variant={view.guess.confirmed ? 'default' : 'secondary'}>
            {view.guess.confirmed ? 'confirmed' : 'best guess'}
          </Badge>
        )}
      </Button>

      {slots.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {slots.map(({ item, displayName, spentBy }) => {
            const pressed = item.id === position?.item.id
            return (
              <Button
                key={item.id}
                variant={pressed ? 'default' : 'outline'}
                className={spentBy ? 'shrink-0 opacity-60' : 'shrink-0'}
                aria-pressed={pressed}
                aria-label={spentBy ? `${displayName}, spent on ${spentBy.activityName}` : undefined}
                onClick={() => goToSlot(store, clock, item.id)}
              >
                {displayName}
                {spentBy && <CheckIcon aria-hidden="true" />}
              </Button>
            )
          })}
        </div>
      )}

      {template === null && <p className="text-muted-foreground">No template yet.</p>}
      {template !== null && slots.length === 0 && (
        <p className="text-muted-foreground">This template has no slots yet. Add one in Edit.</p>
      )}
      {dayDone && <h2 className="text-xl font-semibold">That&apos;s today.</h2>}

      {position !== null && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{positionName}</h2>

          {spentHere !== null ? (
            <>
              <p className="text-muted-foreground">{`Spent on ${spentHere.activityName}.`}</p>
              <div>
                <Button
                  variant="outline"
                  onClick={() => setUndoing({
                    entryId: spentHere.entry.id,
                    activityName: spentHere.activityName,
                    slotName: positionName ?? '',
                  })}
                >
                  Undo
                </Button>
              </div>
            </>
          ) : (
            <>
              {view.activities.length === 0 && !view.emptied && (
                <p className="text-muted-foreground">No activities in this slot yet.</p>
              )}
              {view.activities.map(({ activity, lastDone }) => (
                <Button
                  key={activity.id}
                  variant="outline"
                  className="h-14 w-full justify-between px-4 text-base"
                  onClick={() => tapActivity(activity)}
                >
                  <span className="flex items-center gap-2">
                    <span>{activity.name}</span>
                    {activity.committed && <Badge variant="secondary">committed</Badge>}
                  </span>
                  <span className="text-sm text-muted-foreground">{`last: ${lastDoneText(lastDone, now)}`}</span>
                </Button>
              ))}
              {view.emptied && nextSlot !== null && (
                <div>
                  <Button variant="outline" onClick={() => goToSlot(store, clock, nextSlot.item.id)}>
                    Next slot
                  </Button>
                </div>
              )}
              {position.item.sectionId !== undefined && (
                <AddActivity
                  key={position.item.id}
                  slotName={positionName ?? ''}
                  sectionId={position.item.sectionId}
                />
              )}
            </>
          )}
        </section>
      )}

      <DayPicker
        open={picker !== null}
        pending={picker?.pending}
        onClose={() => setPicker(null)}
        onDone={pickerDone}
      />

      {spending !== null && (
        <SpendConfirm
          slotName={spending.slotName}
          activityName={spending.activityName}
          onConfirm={() => confirmSpend(spending)}
          onCancel={() => setSpending(null)}
        />
      )}

      {undoing !== null && (
        <UndoCommitDialog
          key={undoing.entryId}
          activityName={undoing.activityName}
          slotName={undoing.slotName}
          onUndo={() => {
            deleteEntry(store, undoing.entryId)
            setUndoing(null)
          }}
          onCancel={() => setUndoing(null)}
        />
      )}

      {noteTarget !== null && (
        <AddNoteDialog
          key={noteTarget.entryId}
          target={noteTarget}
          onClose={() => setNoteTarget(null)}
        />
      )}
    </div>
  )
}

/**
 * The + button under an open slot's activities, and the field it opens. Keyed by the slot,
 * so moving to another slot closes the field.
 */
function AddActivity({ slotName, sectionId }: { slotName: string; sectionId: Id }) {
  const { store } = useWatodo()
  const snap = useSnapshot()
  const [open, setOpen] = useState(false)
  // Whether the activity added next is committed. Unticked after each add.
  const [committed, setCommitted] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Add activity"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <PlusIcon />
        </Button>
      </div>
      {open && (
        <AddField
          label={`New activity in ${slotName}`}
          placeholder="Activity name"
          button="Add"
          existing={snap.activities}
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
            addActivityToSection(store, sectionId, name, { committed })
            setCommitted(false)
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

/** After a quick log: Undo and Add note. After a committed log, the slot is spent: Add note only. */
function AfterLogBar({ activityName, spentSlotName, onUndo, onAddNote }: {
  activityName: string
  spentSlotName: string | null
  onUndo(): void
  onAddNote(): void
}): ReactNode {
  return (
    <div className="flex w-full items-center justify-between gap-2 rounded-xl bg-popover px-3 py-2 text-sm text-popover-foreground ring-1 ring-foreground/10">
      <span>{spentSlotName === null ? `Logged ${activityName}` : `Spent ${spentSlotName} on ${activityName}`}</span>
      <div className="flex shrink-0 gap-1">
        {spentSlotName === null && <Button size="sm" variant="ghost" onClick={onUndo}>Undo</Button>}
        <Button size="sm" variant="outline" onClick={onAddNote}>Add note</Button>
      </div>
    </div>
  )
}

function AddNoteDialog({ target, onClose }: { target: NoteTarget; onClose(): void }) {
  const { store } = useWatodo()
  const [note, setNote] = useState('')
  const [minutes, setMinutes] = useState('')

  const save = () => {
    const parsed = Number(minutes)
    const durationMinutes = minutes.trim() === '' || !Number.isFinite(parsed) ? null : parsed
    editEntry(store, target.entryId, { note, durationMinutes })
    onClose()
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{`Add a note to ${target.activityName}`}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="log-note">Note</Label>
          <Textarea id="log-note" value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="log-minutes">Minutes</Label>
          <Input
            id="log-minutes"
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
