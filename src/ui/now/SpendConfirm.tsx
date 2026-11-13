import type { Id } from '@/domain'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

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
        {choices.length > 1 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Through</p>
            <div role="group" aria-label="Through" className="flex flex-wrap gap-2">
              {choices.map((choice, index) => {
                const pressed = choice.id === throughId
                // Every slot it will spend is filled in, from the current one through the chosen one.
                const covered = index <= choices.findIndex(candidate => candidate.id === throughId)
                return (
                  <Button
                    key={choice.id}
                    size="sm"
                    variant={covered ? 'default' : 'outline'}
                    aria-pressed={pressed}
                    onClick={() => onThroughChange(choice.id)}
                  >
                    {choice.name}
                  </Button>
                )
              })}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm}>Spend it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
