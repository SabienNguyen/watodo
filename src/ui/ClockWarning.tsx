import { useEffect, useState, type JSX } from 'react'
import { CLOCK_WARNING_MS, clockSkewMs } from '@/sync/clock'

/** A thin bar above the app, shown when this device's clock is far enough from the hub's to break syncing. */
export function ClockWarning({ check = clockSkewMs }: { check?: () => Promise<number | null> } = {}): JSX.Element | null {
  const [skew, setSkew] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    const run = () => {
      check()
        .catch(() => null)
        .then((value) => {
          if (active) setSkew(value)
        })
    }
    run()
    window.addEventListener('online', run)
    return () => {
      active = false
      window.removeEventListener('online', run)
    }
  }, [check])

  if (skew === null || Math.abs(skew) <= CLOCK_WARNING_MS) return null

  const minutes = Math.round(Math.abs(skew) / 60_000)
  const unit = minutes === 1 ? 'minute' : 'minutes'
  const direction = skew > 0 ? 'ahead of' : 'behind'
  const message = `This device's clock is ${minutes} ${unit} ${direction} your computer's. Fix the time here, or syncing may not work.`

  return (
    <div role="alert" className="border-b bg-destructive/10 pt-[env(safe-area-inset-top)] text-destructive">
      <div className="mx-auto w-full max-w-[28rem] px-4 py-1.5 text-xs">{message}</div>
    </div>
  )
}
