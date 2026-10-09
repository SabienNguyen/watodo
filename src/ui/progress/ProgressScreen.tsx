import { useState } from 'react'
import { addDays, dayKeyOf, dotStrip, progress, type DayKey, type Id, type Snapshot } from '@/domain'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useNowDate, useSnapshot } from '@/ui/hooks'

const RANGES = [7, 30, 90]
const DEFAULT_RANGE = 30
const DOT_STRIP_DAYS = 28

function timesText(count: number): string {
  return count === 1 ? '1 time' : `${count} times`
}

export function ProgressScreen() {
  const snap = useSnapshot()
  const now = useNowDate()
  const today = dayKeyOf(now)
  const [range, setRange] = useState(DEFAULT_RANGE)
  const view = progress(snap, addDays(today, -(range - 1)), today)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex gap-2">
        {RANGES.map(days => {
          const pressed = days === range
          return (
            <Button
              key={days}
              variant={pressed ? 'default' : 'outline'}
              className="flex-1"
              aria-pressed={pressed}
              onClick={() => setRange(days)}
            >
              {`${days} days`}
            </Button>
          )
        })}
      </div>

      {view.byActivity.length === 0 && (
        <p className="text-muted-foreground">Nothing logged in this range yet.</p>
      )}

      {view.byActivity.length > 0 && (
        <section aria-labelledby="by-activity-heading" className="flex flex-col gap-4">
          <h2 id="by-activity-heading" className="text-lg font-semibold">By activity</h2>
          <ul className="flex flex-col gap-5">
            {view.byActivity.map(({ activityId, count }) => (
              <ActivityRow key={activityId} snap={snap} activityId={activityId} count={count} today={today} />
            ))}
          </ul>
        </section>
      )}

      {view.bySection.length > 0 && (
        <section aria-labelledby="by-section-heading" className="flex flex-col gap-4">
          <h2 id="by-section-heading" className="text-lg font-semibold">By section</h2>
          <ul className="flex flex-col gap-3">
            {view.bySection.map(({ sectionId, count }) => (
              <li key={sectionId} className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{nameOf(snap.sections, sectionId)}</span>
                <span className="text-sm text-muted-foreground">{timesText(count)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function ActivityRow({ snap, activityId, count, today }: {
  snap: Snapshot
  activityId: Id
  count: number
  today: DayKey
}) {
  const strip = dotStrip(snap, activityId, today, DOT_STRIP_DAYS)
  const doneDays = strip.filter(Boolean).length

  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{nameOf(snap.activities, activityId)}</span>
        <span className="text-sm text-muted-foreground">{timesText(count)}</span>
      </div>
      <div role="img" aria-label={`${doneDays} of the last ${DOT_STRIP_DAYS} days`} className="flex gap-1">
        {strip.map((done, i) => (
          <span key={i} className={cn('size-2 rounded-full', done ? 'bg-primary' : 'bg-muted')} />
        ))}
      </div>
    </li>
  )
}

function nameOf(rows: { id: Id; name: string }[], id: Id): string {
  return rows.find(row => row.id === id)?.name ?? '(removed)'
}
