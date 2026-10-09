import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import {
  createWatodoStore, finishSetup, setUpStarter, type Clock, type WatodoStore,
} from '@/domain'
import { WatodoProvider } from './hooks'

/** Monday 12 Oct 2026, 17:45 local. */
const MONDAY_EVENING: Clock = () => new Date(2026, 9, 12, 17, 45)

function finishedStore(): WatodoStore {
  const store = createWatodoStore()
  setUpStarter(store)
  finishSetup(store)
  return store
}

export function renderWithWatodo(
  ui: ReactElement,
  options: { store?: WatodoStore; clock?: Clock } = {},
): { store: WatodoStore } & ReturnType<typeof render> {
  const store = options.store ?? finishedStore()
  const clock = options.clock ?? MONDAY_EVENING
  return {
    store,
    ...render(<WatodoProvider store={store} clock={clock}>{ui}</WatodoProvider>),
  }
}
