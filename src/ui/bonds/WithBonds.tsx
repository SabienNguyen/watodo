import { toast } from 'sonner'
import {
  addBond, bondName, bondSummaries, entryBonds, readSnapshot, recentBonds, rankOf, setEntryBond,
  type Id, type WatodoStore,
} from '@/domain'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AddField } from '@/ui/edit/fields'
import { useSnapshot, useWatodo } from '@/ui/hooks'

interface WithBondsProps {
  entryId: Id
  activityName: string
  onClose(): void
}

/** How many journal entries the bond has now, read from a fresh snapshot. */
function countOf(store: WatodoStore, bondId: Id): number {
  return bondSummaries(readSnapshot(store)).find(row => row.bond.id === bondId)?.count ?? 0
}

/** A compact card: a small uppercase label, then the name in larger semibold text. Same styling as the after-log bar. */
function bondToast(label: string, name: string) {
  toast.custom(() => (
    <div className="flex w-full flex-col gap-0.5 rounded-xl bg-popover px-3 py-2 text-popover-foreground ring-1 ring-foreground/10">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="text-lg font-semibold">{name}</span>
    </div>
  ))
}

/**
 * A bond that was just added to the entry says it is new. An existing bond says its rank when putting it on
 * raised that rank. Taking a bond off says nothing, so this is never called for it.
 */
function announcePut(store: WatodoStore, bondId: Id, before: number, created: boolean) {
  const snap = readSnapshot(store)
  const name = bondName(snap, bondId)
  if (created) {
    bondToast('New bond', name)
    return
  }
  const rank = rankOf(countOf(store, bondId))
  if (rank > rankOf(before)) bondToast(`Rank ${rank}`, name)
}

/** The With… dialog for one journal entry: its recent bonds as toggles, and a field to add a new one. */
export function WithBonds({ entryId, activityName, onClose }: WithBondsProps) {
  const { store } = useWatodo()
  const snap = useSnapshot()
  const onEntry = new Set(entryBonds(snap, entryId).map(bond => bond.id))

  const toggle = (bondId: Id) => {
    const putOn = !onEntry.has(bondId)
    const before = countOf(store, bondId)
    setEntryBond(store, entryId, bondId, putOn)
    if (putOn) announcePut(store, bondId, before, false)
  }

  const add = (name: string) => {
    const { id, created } = addBond(store, name)
    if (id === '') return
    const before = countOf(store, id)
    setEntryBond(store, entryId, id, true)
    announcePut(store, id, before, created)
  }

  const bonds = recentBonds(snap)

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{`${activityName} with…`}</DialogTitle>
        </DialogHeader>
        {bonds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {bonds.map(bond => {
              const pressed = onEntry.has(bond.id)
              return (
                <Button
                  key={bond.id}
                  size="sm"
                  variant={pressed ? 'default' : 'outline'}
                  aria-pressed={pressed}
                  onClick={() => toggle(bond.id)}
                >
                  {bond.name}
                </Button>
              )
            })}
          </div>
        )}
        <AddField
          label="New bond"
          placeholder="Name"
          button="Add"
          existing={snap.bonds}
          onAdd={add}
        />
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
