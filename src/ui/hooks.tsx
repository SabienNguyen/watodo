import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { createSnapshotSource, type Clock, type Snapshot, type SnapshotSource, type WatodoStore } from '@/domain'

interface WatodoContextValue {
  store: WatodoStore
  clock: Clock
  source: SnapshotSource
}

const WatodoContext = createContext<WatodoContextValue | null>(null)

const NOW_REFRESH_MS = 30_000

export function WatodoProvider({ store, clock, children }: { store: WatodoStore; clock: Clock; children: ReactNode }) {
  // One source per store: it registers listeners on the store and never removes them.
  const source = useMemo(() => createSnapshotSource(store), [store])
  const value = useMemo<WatodoContextValue>(() => ({ store, clock, source }), [store, clock, source])
  return <WatodoContext.Provider value={value}>{children}</WatodoContext.Provider>
}

function useWatodoContext(): WatodoContextValue {
  const value = useContext(WatodoContext)
  if (value === null) throw new Error('useWatodo must be used inside WatodoProvider')
  return value
}

export function useWatodo(): { store: WatodoStore; clock: Clock } {
  const { store, clock } = useWatodoContext()
  return { store, clock }
}

export function useSnapshot(): Snapshot {
  const { source } = useWatodoContext()
  return useSyncExternalStore(source.subscribe, source.get, source.get)
}

/** The clock's time, recomputed on every store change and every 30 seconds. */
export function useNowDate(): Date {
  const { clock } = useWatodoContext()
  const snapshot = useSnapshot()
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), NOW_REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  // snapshot and tick are not read in the body: they are the reasons to read the clock again.
  return useMemo(() => clock(), [clock, snapshot, tick])
}
