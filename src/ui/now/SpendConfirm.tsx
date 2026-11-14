import type { Id } from '@/domain'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ThroughChoice } from '@/ui/ThroughChoice'

/**
 * Asked before a committed activity is logged, since logging it spends the slot for the day. `choices` are the
 * slots it can spend, the current one first; with more than one, a Through row picks the last slot it covers.
 */
export function SpendConfirm({ choices, throughId, activityName, onThroughChange, onConfirm, onCancel }: {
  choices: { id: Id; name: string }[]
  throughId: Id
  activityName: string
  onThroughChange(id: Id): void
  onConfirm(): void
  onCancel(): void
}) {
  const first = choices[0]?.name ?? ''
  const chosen = choices.find(choice => choice.id === throughId)
  const through = chosen !== undefined && chosen.name !== first ? ` – ${chosen.name}` : ''

  return (
    <Dialog open onOpenChange={open => { if (!open) onCancel() }}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="pr-6">{`Spend ${first}${through} on ${activityName}?`}</DialogTitle>
        </DialogHeader>
        <ThroughChoice choices={choices} throughId={throughId} onThroughChange={onThroughChange} />
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm}>Spend it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
