import { useState } from 'react'
import { confirmDay, nowView, type Id, type PendingLog, type TemplateDraft } from '@/domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useNowDate, useSnapshot, useWatodo } from '@/ui/hooks'
import { StarterPicker } from '@/ui/edit/StarterPicker'
import { TemplateEditor } from '@/ui/edit/TemplateEditor'

export function DayPicker({ open, pending, onClose, onDone }: {
  open: boolean
  pending?: PendingLog
  onClose(): void
  onDone?(entryId: Id | null): void
}) {
  const { store, clock } = useWatodo()
  const snap = useSnapshot()
  const now = useNowDate()
  const view = nowView(snap, now)
  const guessId = view.guess.templateId
  // The starter picker and the editor are open over this list, which is hidden meanwhile.
  const [picking, setPicking] = useState(false)
  const [draft, setDraft] = useState<TemplateDraft | null>(null)

  const choose = (templateId: Id) => {
    const entryId = confirmDay(store, clock, templateId, pending)
    onDone?.(entryId)
    onClose()
  }

  // Saved: confirm today with the new template, logging the pending tap, then close.
  const saved = (templateId: Id) => {
    setDraft(null)
    const entryId = confirmDay(store, clock, templateId, pending)
    onDone?.(entryId)
    onClose()
  }

  const groups = snap.labels
    .map(label => ({
      key: label.id,
      name: label.name,
      templates: snap.templates.filter(t => t.labelId === label.id),
    }))
    .concat({
      key: '',
      name: 'No label',
      templates: snap.templates.filter(t => !snap.labels.some(label => label.id === t.labelId)),
    })
    .filter(group => group.templates.length > 0)

  return (
    <>
      <Dialog
        open={open && !picking && draft === null}
        onOpenChange={next => { if (!next) onClose() }}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{pending ? 'Which kind of day is today?' : "Switch today's template"}</DialogTitle>
          </DialogHeader>

          {groups.length === 0 && <p className="text-sm text-muted-foreground">No templates yet.</p>}

          {groups.map(group => (
            <section key={group.key} className="flex flex-col gap-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.name}</h3>
              {group.templates.map(template => {
                const isGuess = template.id === guessId
                return (
                  <div key={template.id} className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="h-12 flex-1 justify-start text-base"
                      onClick={() => choose(template.id)}
                    >
                      {template.name}
                    </Button>
                    {isGuess && (
                      <Badge variant={view.guess.confirmed ? 'default' : 'secondary'}>
                        {view.guess.confirmed ? 'today' : 'guess'}
                      </Badge>
                    )}
                  </div>
                )
              })}
            </section>
          ))}

          <Button variant="outline" onClick={() => setPicking(true)}>New template</Button>

          <div className="flex justify-end">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>

      <StarterPicker
        open={picking}
        onPick={picked => {
          setPicking(false)
          setDraft(picked)
        }}
        onClose={() => setPicking(false)}
      />

      {draft !== null && (
        <TemplateEditor draft={draft} onSaved={saved} onCancel={() => setDraft(null)} />
      )}
    </>
  )
}
