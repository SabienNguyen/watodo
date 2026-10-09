import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { createWatodoStore, systemClock } from '@/domain'
import { startLocalSave } from '@/sync/local'
import { WatodoProvider } from '@/ui/hooks'

async function start() {
  const store = createWatodoStore()
  await startLocalSave(store)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <WatodoProvider store={store} clock={systemClock}>
        <App />
      </WatodoProvider>
    </StrictMode>,
  )
}

void start()
