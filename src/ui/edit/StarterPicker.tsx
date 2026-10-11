import { useId } from 'react'
import {
  blankDraft, draftFromStarter, draftFromTemplate, STARTERS, type Starter, type TemplateDraft,
} from '@/domain'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSnapshot } from '@/ui/hooks'

/** Picks where a new template starts. Writes nothing: the picked draft is only opened in the editor. */
export function StarterPicker({ open, onPick, onClose }: {
  open: boolean
  onPick(draft: TemplateDraft): void
  onClose(): void
}) {
  const snap = useSnapshot()

  const pick = (draft: TemplateDraft | null) => {
    if (draft !== null) onPick(draft)
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose() }}>
      <DialogContent aria-describedby={undefined} className="max-h-[85svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start a new template</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {STARTERS.map(starter => (
            <StarterButton
              key={starter.key}
              starter={starter}
              onClick={() => pick(draftFromStarter(snap, starter.key))}
            />
          ))}
        </div>

        {snap.templates.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Copy one of yours</h3>
            {snap.templates.map(template => (
              <Button
                key={template.id}
                variant="outline"
                className="h-12 justify-start text-base"
                onClick={() => pick(draftFromTemplate(snap, template.id, 'copy'))}
              >
                {`Copy of ${template.name}`}
              </Button>
            ))}
          </section>
        )}

        <Button variant="outline" className="h-12 justify-start text-base" onClick={() => pick(blankDraft(snap))}>
          Blank
        </Button>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function StarterButton({ starter, onClick }: { starter: Starter; onClick(): void }) {
  const stepsId = useId()
  const steps = starter.steps.map(step => (step.kind === 'fixed' ? step.name : step.slotName)).join(' · ')

  return (
    <Button
      variant="outline"
      className="h-auto flex-col items-start gap-1 px-4 py-3 text-left whitespace-normal"
      aria-label={starter.name}
      aria-describedby={stepsId}
      onClick={onClick}
    >
      <span className="text-base">{starter.name}</span>
      <span id={stepsId} className="text-sm font-normal text-muted-foreground">{steps}</span>
    </Button>
  )
}
