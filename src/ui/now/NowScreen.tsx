import { useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import {
  deleteEntry, editEntry, endStepEarly, formatDayMinutes, logActivity, nowView,
  type Id, type PendingLog, type TemplateItem,
} from '@/domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { lastDoneText } from '@/ui/format'
import { useNowDate, useSnapshot, useWatodo } from '@/ui/hooks'
import { DayPicker } from './DayPicker'

const AFTER_LOG_MS = 6000

interface NoteTarget { entryId: Id; activityName: string }

function nextLine(next: TemplateItem | null): string {
  return next ? `Next: ${next.name} at ${formatDayMinutes(next.start)}` : 'Nothing more planned today.'
}

export function NowScreen() {
  const { store, clock } = useWatodo()
  const snap = useSnapshot()
  const now = useNowDate()
  const view = nowView(snap, now)

  // null: picker closed. An object with no pending: switch mode.
  const [picker, setPicker] = useState<{ pending?: PendingLog } | null>(null)
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null)

  const showAfterLog = (entryId: Id, activityName: string) => {
    toast.custom(id => (
      <AfterLogBar
        activityName={activityName}
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

  const tapActivity = (activityId: Id, activityName: string) => {
    const result = logActivity(store, clock, activityId)
    if (result.status === 'logged') showAfterLog(result.entryId, activityName)
    else if (result.status === 'needs-template') setPicker({ pending: result.pending })
  }

  const pickerDone = (entryId: Id | null) => {
    const pending = picker?.pending
    if (entryId === null || pending === undefined) return
    const activityName = snap.activities.find(a => a.id === pending.activityId)?.name ?? ''
    showAfterLog(entryId, activityName)
  }

  const position = view.position
  const template = view.template

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

      {position === null && <p className="text-muted-foreground">No template yet.</p>}

      {position?.kind === 'slot' && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">{position.item.name}</h2>
            <p className="text-sm text-muted-foreground">
              {`${formatDayMinutes(position.item.start)} to ${formatDayMinutes(position.item.end)}`}
            </p>
            {position.early && <p className="text-sm">Started early</p>}
          </div>

          {view.activities.length === 0 && (
            <p className="text-muted-foreground">No activities in this section yet.</p>
          )}
          {view.activities.map(({ activity, lastDone }) => (
            <Button
              key={activity.id}
              variant="outline"
              className="h-14 w-full justify-between px-4 text-base"
              onClick={() => tapActivity(activity.id, activity.name)}
            >
              <span>{activity.name}</span>
              <span className="text-sm text-muted-foreground">{`last: ${lastDoneText(lastDone, now)}`}</span>
            </Button>
          ))}
        </section>
      )}

      {position?.kind === 'fixed' && (
        <section className="flex flex-col gap-3">
          <p className="text-xl font-semibold">{`Now: ${position.item.name}`}</p>
          <p className="text-sm text-muted-foreground">{nextLine(position.next)}</p>
          {position.next && (
            <Button
              variant="outline"
              className="h-14 w-full text-base"
              onClick={() => endStepEarly(store, clock)}
            >
              {`Done with ${position.item.name}`}
            </Button>
          )}
        </section>
      )}

      {position?.kind === 'gap' && (
        <section className="flex flex-col gap-3">
          <p className="text-xl font-semibold">Nothing planned right now.</p>
          <p className="text-sm text-muted-foreground">{nextLine(position.next)}</p>
          {position.next && (
            <Button
              variant="outline"
              className="h-14 w-full text-base"
              onClick={() => endStepEarly(store, clock)}
            >
              {`Start ${position.next.name} now`}
            </Button>
          )}
        </section>
      )}

      <DayPicker
        open={picker !== null}
        pending={picker?.pending}
        onClose={() => setPicker(null)}
        onDone={pickerDone}
      />

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

function AfterLogBar({ activityName, onUndo, onAddNote }: {
  activityName: string
  onUndo(): void
  onAddNote(): void
}): ReactNode {
  return (
    <div className="flex w-full items-center justify-between gap-2 rounded-xl bg-popover px-3 py-2 text-sm text-popover-foreground ring-1 ring-foreground/10">
      <span>{`Logged ${activityName}`}</span>
      <div className="flex shrink-0 gap-1">
        <Button size="sm" variant="ghost" onClick={onUndo}>Undo</Button>
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
