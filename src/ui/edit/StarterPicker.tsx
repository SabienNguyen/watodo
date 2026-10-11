import {
  blankDraft, draftFromStarter, draftFromTemplate, STARTERS, type TemplateDraft,
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
            <Button
              key={starter.key}
              variant="outline"
              className="h-12 justify-start text-base"
              onClick={() => pick(draftFromStarter(snap, starter.key))}
            >
              {starter.name}
            </Button>
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
