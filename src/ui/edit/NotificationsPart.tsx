import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import {
  DEFAULT_NOTIFY, setDailyCap, setNotifyKind, setQuietHours, type NotifyKind,
} from '@/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSnapshot, useWatodo } from '@/ui/hooks'
import {
  permissionGranted, pushState, sendTestPush, turnOffPush, turnOnPush, type PushState,
} from '@/ui/push'

const KINDS: { kind: NotifyKind; label: string }[] = [
  { kind: 'slot', label: 'Slot reminders' },
  { kind: 'committed', label: 'After committed activities' },
  { kind: 'checkIn', label: 'Daily check-in' },
  { kind: 'rested', label: 'Resting activities back' },
  { kind: 'recap', label: 'Weekly recap' },
]

const PART = 'flex flex-col gap-4'

/** Minutes after midnight as the HH:MM a time input shows. */
function minutesToClock(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

/** HH:MM as minutes after midnight, or NaN when the input is empty or not a time. */
function clockToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (match === null) return NaN
  return Number(match[1]) * 60 + Number(match[2])
}

export function NotificationsPart() {
  const { store } = useWatodo()
  const snap = useSnapshot()
  const settings = snap.notify ?? DEFAULT_NOTIFY
  const baseId = useId()

  return (
    <div className={PART}>
      <DeviceSection />

      <div className="flex flex-col gap-2">
        {KINDS.map(({ kind, label }) => (
          <Label key={kind} className="gap-2 font-normal">
            <input
              type="checkbox"
              checked={settings.kinds[kind]}
              onChange={event => setNotifyKind(store, kind, event.target.checked)}
            />
            {label}
          </Label>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`${baseId}-cap`}>Per day</Label>
        {/* Keyed by the stored value, so the field shows the stored number again after a clamp or a change elsewhere. */}
        <Input
          key={settings.dailyCap}
          id={`${baseId}-cap`}
          type="number"
          inputMode="numeric"
          min={1}
          max={10}
          defaultValue={settings.dailyCap}
          className="w-20"
          onBlur={event => {
            const field = event.currentTarget
            // An emptied field keeps the stored number rather than storing the lowest cap.
            if (field.value.trim() === '') field.value = String(settings.dailyCap)
            else setDailyCap(store, Number(field.value))
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`${baseId}-from`}>Quiet from</Label>
        <Input
          id={`${baseId}-from`}
          type="time"
          className="w-36"
          value={minutesToClock(settings.quietStart)}
          onChange={event => setQuietHours(store, clockToMinutes(event.currentTarget.value), settings.quietEnd)}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`${baseId}-until`}>until</Label>
        <Input
          id={`${baseId}-until`}
          type="time"
          className="w-36"
          value={minutesToClock(settings.quietEnd)}
          onChange={event => setQuietHours(store, settings.quietStart, clockToMinutes(event.currentTarget.value))}
        />
      </div>
    </div>
  )
}

/**
 * Turning notifications on is per device, so the state lives here, not in the store. The device
 * state is `undefined` until it has loaded.
 */
function DeviceSection() {
  const [state, setState] = useState<PushState>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    pushState().then(next => {
      if (live) setState(next)
    })
    return () => {
      live = false
    }
  }, [])

  // Called from click handlers, so the permission prompt is allowed. The state is only set from the result.
  const onTurnOn = async () => {
    setFailed(false)
    const next = await turnOnPush()
    // 'off' with permission granted means the subscribe failed; 'off' without it means the prompt was dismissed.
    setFailed(next === 'off' && permissionGranted())
    setState(next)
  }

  const onTurnOff = async () => {
    setFailed(false)
    const next = await turnOffPush()
    // 'on' after turning off means the hub did not take the change.
    setFailed(next === 'on')
    setState(next)
  }

  const onSendTest = async () => {
    setFailed(false)
    const ok = await sendTestPush()
    if (ok) toast('Test notification sent')
    setFailed(!ok)
  }

  if (state === undefined) return null
  return (
    <div className="flex flex-col gap-2">
      {state === 'unsupported' && <p className="text-sm text-muted-foreground">Notifications aren't available here.</p>}
      {state === 'denied' && <p className="text-sm text-muted-foreground">Notifications are blocked in Settings.</p>}
      {state === 'off' && (
        <Button variant="outline" className="self-start" onClick={onTurnOn}>Turn on notifications</Button>
      )}
      {state === 'on' && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onTurnOff}>Turn off</Button>
          <Button variant="outline" onClick={onSendTest}>Send test</Button>
        </div>
      )}
      {failed && <p role="alert" className="text-sm text-destructive">Couldn't reach the hub.</p>}
    </div>
  )
}
