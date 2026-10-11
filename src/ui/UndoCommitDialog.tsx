import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * Undoing a committed activity is slow on purpose: the Undo button stays disabled while the seconds count
 * down, so it can only be pressed once the countdown reaches zero.
 */
export function UndoCommitDialog({ activityName, slotName, waitSeconds = 5, onUndo, onCancel }: {
  activityName: string
  slotName: string
  waitSeconds?: number
  onUndo(): void
  onCancel(): void
}) {
  const [remaining, setRemaining] = useState(waitSeconds)

  useEffect(() => {
    const id = setInterval(() => setRemaining(seconds => Math.max(0, seconds - 1)), 1000)
    return () => clearInterval(id)
  }, [])

  const ready = remaining === 0
  const undo = () => {
    if (ready) onUndo()
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onCancel() }}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{`Undo ${activityName}?`}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{`This reopens ${slotName}.`}</p>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" disabled={!ready} onClick={undo}>
            {ready ? 'Undo' : `Undo in ${remaining}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
