import { useId, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import {
  addBond, bondPage, bondSummaries, deleteBond, renameBond, setBondCatchUp,
  type BondPage, type BondSummary, type Id,
} from '@/domain'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AddField, EditableText } from '@/ui/edit/fields'
import { dayLabel, lastDoneText } from '@/ui/format'
import { useNowDate, useSnapshot, useWatodo } from '@/ui/hooks'

const PART = 'flex flex-col gap-4'
const LIST = 'flex flex-col divide-y'
const HEADING = 'text-xs font-medium tracking-wide text-muted-foreground uppercase'

/** The Bonds tab: the list of bonds, and one bond's page once it is opened. */
export function BondsScreen() {
  const { store } = useWatodo()
  const snap = useSnapshot()
  const now = useNowDate()
  // The bond whose page is open, or null for the list. Plain component state: it resets when the tab is left.
  const [openId, setOpenId] = useState<Id | null>(null)

  // Going into or out of a page takes the view to the top.
  const open = (id: Id | null) => {
    window.scrollTo(0, 0)
    setOpenId(id)
  }

  const page = openId === null ? null : bondPage(snap, openId)
  if (page !== null) {
    return <BondPageView key={page.bond.id} page={page} now={now} onBack={() => open(null)} />
  }

  const summaries = bondSummaries(snap)
  return (
    <div className={PART}>
      {summaries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bonds yet.</p>
      ) : (
        <ul className={LIST}>
          {summaries.map(summary => (
            <BondRow key={summary.bond.id} summary={summary} now={now} onOpen={() => open(summary.bond.id)} />
          ))}
        </ul>
      )}

      <AddField
        label="Bond name"
        placeholder="Name"
        button="Add bond"
        existing={snap.bonds}
        onAdd={name => {
          const { id } = addBond(store, name)
          if (id !== '') open(id)
        }}
      />
    </div>
  )
}

/** One bond in the list: its name, then its rank and when it was last seen, as far as they are known. */
function BondRow({ summary, now, onOpen }: { summary: BondSummary; now: Date; onOpen(): void }) {
  const { bond, rank, lastSeen } = summary
  return (
    <li>
      <button
        type="button"
        aria-label={bond.name}
        onClick={onOpen}
        className="flex min-h-12 w-full items-center justify-between gap-2 rounded-md py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{bond.name}</span>
          <span className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
            {rank > 0 && <span>{`Rank ${rank}`}</span>}
            {lastSeen !== null && <span>{`last: ${lastDoneText(lastSeen, now)}`}</span>}
          </span>
        </span>
        <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  )
}

/** A bond's page: its name, rank and progress, what is done together, recent times, catch-up, and deleting it. */
function BondPageView({ page, now, onBack }: { page: BondPage; now: Date; onBack(): void }) {
  const { store } = useWatodo()
  const snap = useSnapshot()
  // Whether the delete dialog is open.
  const [deleting, setDeleting] = useState(false)
  const togetherHeading = useId()
  const recentHeading = useId()
  const { bond, rank, next, lastSeen, together, recent } = page

  return (
    <div className={PART}>
      <Button variant="ghost" className="-ml-2 self-start" aria-label="Back to Bonds" onClick={onBack}>
        <ChevronLeftIcon aria-hidden="true" />
        Bonds
      </Button>
      <h2 className="text-xl font-semibold">{bond.name}</h2>

      <EditableText
        aria-label="Bond name"
        value={bond.name}
        existing={snap.bonds}
        selfId={bond.id}
        onCommit={name => renameBond(store, bond.id, name)}
      />

      <div className="flex flex-col gap-2">
        {rank > 0 && <p className="font-medium">{`Rank ${rank}`}</p>}
        {next !== null && (
          <>
            <div
              role="progressbar"
              aria-label="Progress to next rank"
              aria-valuemin={0}
              aria-valuemax={next.need}
              aria-valuenow={next.have}
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full bg-primary" style={{ width: `${(next.have / next.need) * 100}%` }} />
            </div>
            <p className="text-sm text-muted-foreground">{`${next.have} of ${next.need}`}</p>
          </>
        )}
        {lastSeen !== null && <p className="text-sm text-muted-foreground">{`last: ${lastDoneText(lastSeen, now)}`}</p>}
      </div>

      {together.length > 0 && (
        <div role="group" aria-labelledby={togetherHeading} className="flex flex-col gap-2">
          <h3 id={togetherHeading} className={HEADING}>Together</h3>
          <ul className={LIST}>
            {together.map(row => (
              <li key={row.activityName} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate">{row.activityName}</span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {row.count === 1 ? '1 time' : `${row.count} times`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recent.length > 0 && (
        <div role="group" aria-labelledby={recentHeading} className="flex flex-col gap-2">
          <h3 id={recentHeading} className={HEADING}>Recent</h3>
          <ul className={LIST}>
            {recent.map(row => (
              <li key={row.entry.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate">{row.activityName}</span>
                <span className="shrink-0 text-sm text-muted-foreground">{dayLabel(row.day)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <CatchUpField
        value={bond.catchUpDays}
        onCommit={days => setBondCatchUp(store, bond.id, days)}
      />

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setDeleting(true)}>
          Delete bond
        </Button>
      </div>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{`Delete "${bond.name}"?`}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteBond(store, bond.id)
                setDeleting(false)
                onBack()
              }}
            >
              Delete bond
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * The days after which a bond is caught up on, as a whole number, or blank for never. Like the
 * rest days field, typing keeps a draft that is committed on blur or Enter; blank, zero, or anything below 1 removes it.
 */
function CatchUpField({ value, onCommit }: { value: number | undefined; onCommit(days: number): void }) {
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
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={id}>Catch up after</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          min={0}
          inputMode="numeric"
          className="w-20"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={event => {
            if (event.key === 'Enter') commit()
          }}
        />
        <span className="text-sm text-muted-foreground">days</span>
      </div>
    </div>
  )
}

/** A catch-up in days as the field shows it: blank for none. */
function daysText(days: number | undefined): string {
  return days === undefined || days < 1 ? '' : String(days)
}
