import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { createWatodoStore, setupState, systemClock } from '@/domain'
import { connectToHub, hubSyncUrl } from '@/sync/hub'
import { startLocalSave } from '@/sync/local'
import { ClockWarning } from '@/ui/ClockWarning'
import { WatodoProvider } from '@/ui/hooks'

// Demo mode (?demo) is development-only: a seeded month that is never saved, rebuilt on every load.
// Only `npm run dev` turns it on. In a production build import.meta.env.DEV is false, so this branch
// and its dynamic imports are dropped, a production build ignores ?demo, and the demo code is not shipped.
async function start() {
  const store = createWatodoStore()
  let demoBar: ReactNode = null
  let clockWarning: ReactNode = null
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo')) {
    const { seedDemoMonth } = await import('@/domain/demo')
    const { DemoBar } = await import('@/ui/DemoBar')
    seedDemoMonth(store, systemClock)
    demoBar = <DemoBar />
  } else {
    await startLocalSave(store)
    // Asked for, not awaited: the browser may refuse, and the app works either way.
    navigator.storage?.persist?.()?.catch(() => {})
    const hub = connectToHub(store, { url: hubSyncUrl(window.location) })
    // A device with nothing set up waits for the first sync, so the hub's data appears instead of the tutorial.
    if (setupState(store) === 'new') {
      await hub.firstSync
    }
    clockWarning = <ClockWarning />
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <WatodoProvider store={store} clock={systemClock}>
        {demoBar}
        {clockWarning}
        <App />
      </WatodoProvider>
    </StrictMode>,
  )
}

void start()
