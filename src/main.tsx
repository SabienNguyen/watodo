import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { createWatodoStore, systemClock } from '@/domain'
import { startLocalSave } from '@/sync/local'
import { WatodoProvider } from '@/ui/hooks'

// Demo mode (?demo) is development-only: a seeded month that is never saved, rebuilt on every load.
// Only `npm run dev` turns it on. In a production build import.meta.env.DEV is false, so this branch
// and its dynamic imports are dropped, a production build ignores ?demo, and the demo code is not shipped.
async function start() {
  const store = createWatodoStore()
  let demoBar: ReactNode = null
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo')) {
    const { seedDemoMonth } = await import('@/domain/demo')
    const { DemoBar } = await import('@/ui/DemoBar')
    seedDemoMonth(store, systemClock)
    demoBar = <DemoBar />
  } else {
    await startLocalSave(store)
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <WatodoProvider store={store} clock={systemClock}>
        {demoBar}
        <App />
      </WatodoProvider>
    </StrictMode>,
  )
}

void start()
