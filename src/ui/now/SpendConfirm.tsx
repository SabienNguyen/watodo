import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/** Asked before a committed activity is logged, since logging it spends the slot for the day. */
export function SpendConfirm({ slotName, activityName, onConfirm, onCancel }: {
  slotName: string
  activityName: string
  onConfirm(): void
  onCancel(): void
}) {
  return (
    <Dialog open onOpenChange={open => { if (!open) onCancel() }}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{`Spend ${slotName} on ${activityName}?`}</DialogTitle>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm}>Spend it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
