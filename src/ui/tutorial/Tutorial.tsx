import { finishSetup, setupState, setUpStarter } from '@/domain'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { EditScreen } from '@/ui/edit/EditScreen'
import { useSnapshot, useWatodo } from '@/ui/hooks'

export function Tutorial() {
  const { store } = useWatodo()
  // Subscribes to the store, so the steps change as setup moves on.
  useSnapshot()

  if (setupState(store) === 'new') {
    return (
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Welcome to watodo</h2>
          <p className="text-muted-foreground">watodo shows what you can do right now, and logs your pick with one tap.</p>
          <p className="text-muted-foreground">It needs one day set up first.</p>
        </div>
        <Button className="h-14 w-full text-base" onClick={() => setUpStarter(store)}>
          Start with the basic day
        </Button>
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
