import { useState } from 'react'
import type { ComponentType } from 'react'
import { setupState } from '@/domain'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { useSnapshot, useWatodo } from '@/ui/hooks'
import { NowScreen } from '@/ui/now/NowScreen'
import { FullDayScreen } from '@/ui/day/FullDayScreen'
import { JournalScreen } from '@/ui/journal/JournalScreen'
import { ProgressScreen } from '@/ui/progress/ProgressScreen'
import { EditScreen } from '@/ui/edit/EditScreen'
import { Tutorial } from '@/ui/tutorial/Tutorial'

const SCREENS = {
  Now: NowScreen,
  Day: FullDayScreen,
  Journal: JournalScreen,
  Progress: ProgressScreen,
  Edit: EditScreen,
} satisfies Record<string, ComponentType>

type Tab = keyof typeof SCREENS
const TABS = Object.keys(SCREENS) as Tab[]

// The tab bar is 3.5rem tall; keep toasts 4.5rem up so they sit just above it.
const TOAST_OFFSET = { bottom: '4.5rem' }

export default function App() {
  const { store } = useWatodo()
  // Subscribes to store changes, so the app re-renders when setup finishes.
  useSnapshot()
  const [tab, setTab] = useState<Tab>('Now')

  if (setupState(store) !== 'done') {
    return (
      <div className="mx-auto flex min-h-svh w-full max-w-[28rem] flex-col gap-6 p-4">
        <h1 className="text-sm font-medium text-muted-foreground">watodo</h1>
        <Tutorial />
      </div>
    )
  }

  const Screen = SCREENS[tab]
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[28rem] flex-col">
      <header className="px-4 pt-4">
        <h1 className="text-sm font-medium text-muted-foreground">watodo</h1>
      </header>
      <main className="flex-1 p-4 pb-24">
        <Screen />
      </main>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 border-t bg-background">
        <div className="mx-auto grid max-w-[28rem] grid-cols-5">
          {TABS.map(name => (
            <Button
              key={name}
              variant="ghost"
              className={`h-14 rounded-none text-sm ${tab === name ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
              aria-current={tab === name ? 'page' : undefined}
              onClick={() => setTab(name)}
            >
              {name}
            </Button>
          ))}
        </div>
      </nav>
      <Toaster position="bottom-center" offset={TOAST_OFFSET} mobileOffset={TOAST_OFFSET} />
    </div>
  )
}
