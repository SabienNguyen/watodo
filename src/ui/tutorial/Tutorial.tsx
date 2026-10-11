import { useState } from 'react'
import { finishSetup, setupState, type TemplateDraft } from '@/domain'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { EditScreen } from '@/ui/edit/EditScreen'
import { StarterPicker } from '@/ui/edit/StarterPicker'
import { TemplateEditor } from '@/ui/edit/TemplateEditor'
import { useSnapshot, useWatodo } from '@/ui/hooks'

export function Tutorial() {
  const { store } = useWatodo()
  // Subscribes to the store, so the steps change as setup moves on.
  useSnapshot()
  // Set while the starter picker is open; the draft is the template being set up. Nothing is written until Save.
  const [picking, setPicking] = useState(false)
  const [draft, setDraft] = useState<TemplateDraft | null>(null)

  if (setupState(store) === 'new') {
    return (
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Welcome to watodo</h2>
          <Button className="h-14 w-full text-base" onClick={() => setPicking(true)}>
            Choose a starting day
          </Button>
        </div>

        <StarterPicker
          open={picking}
          onPick={picked => {
            setPicking(false)
            setDraft(picked)
          }}
          onClose={() => setPicking(false)}
        />
        {draft !== null && (
          <TemplateEditor
            draft={draft}
            onSaved={() => finishSetup(store)}
            onCancel={() => setDraft(null)}
          />
        )}
      </section>
    )
  }

  if (setupState(store) === 'customising') {
    return (
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Make it yours</h2>
          <p className="text-muted-foreground">You can change this basic day now, or later from Edit.</p>
        </div>
        <EditScreen />
        <Button className="h-14 w-full text-base" onClick={() => finishSetup(store)}>
          Done, open watodo
        </Button>
        {/* App mounts its own Toaster only once setup is done; this step needs one too. */}
        <Toaster position="bottom-center" />
      </section>
    )
  }

  return <></>
}
