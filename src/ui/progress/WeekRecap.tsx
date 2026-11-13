import { useEffect, useRef, useState } from 'react'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { addDays, dayKeyOf, weekStartOf, weekView, type DayKey } from '@/domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { shortDayLabel, weekRangeLabel } from '@/ui/format'
import { useNowDate, useSnapshot } from '@/ui/hooks'

/** Time between one entry appearing and the next. */
const STEP_MS = 500

function thingsText(count: number): string {
  return count === 1 ? '1 thing done' : `${count} things done`
}

/** Whether the system asks for less motion. jsdom may have no matchMedia. */
function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** A week at a time: its entries can be watched appearing one by one. */
export function WeekRecap() {
  const snap = useSnapshot()
  const now = useNowDate()
  const currentWeek = weekStartOf(dayKeyOf(now))
  const [start, setStart] = useState<DayKey>(currentWeek)
  // How many rows are showing, or null while the list is hidden.
  const [shown, setShown] = useState<number | null>(null)
  const view = weekView(snap, start)
  const total = view.entries.length

  // One row at a time. Changing the week or unmounting clears the pending step.
  useEffect(() => {
    if (shown === null || shown >= total) return
    const id = setTimeout(() => setShown(n => (n === null ? null : n + 1)), STEP_MS)
    return () => clearTimeout(id)
  }, [shown, total])

  // Moving to another week hides the list, so coming back to a week starts hidden too.
  function moveWeek(days: number) {
    setStart(addDays(start, days))
    setShown(null)
  }

  function watch() {
    setShown(prefersReducedMotion() ? total : 1)
  }

  return (
    <section aria-label="Weekly recap" className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-11"
          aria-label="Previous week"
          onClick={() => moveWeek(-7)}
        >
          <ChevronLeftIcon />
        </Button>
        <h2 className="flex-1 text-center text-lg font-semibold">{weekRangeLabel(view.start, view.end)}</h2>
        <Button
          variant="outline"
          size="icon"
          className="size-11"
          aria-label="Next week"
          disabled={start >= currentWeek}
          onClick={() => moveWeek(7)}
        >
          <ChevronRightIcon />
        </Button>
      </div>

      {total === 0 ? (
        <p className="text-muted-foreground">Nothing logged this week.</p>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p>{thingsText(total)}</p>
          {shown === null && <Button variant="outline" size="sm" onClick={watch}>Watch recap</Button>}
        </div>
      )}

      {shown !== null && (
        <>
          <ol className="flex flex-col gap-3">
            {view.entries.slice(0, shown).map(({ entry, day, activityName }, i) => {
              const startsDay = i === 0 || view.entries[i - 1].day !== day
              return (
                <RecapRow
                  key={entry.id}
                  name={activityName}
                  committed={entry.committed === true}
                  dayLabel={startsDay ? shortDayLabel(day) : null}
                />
              )
            })}
          </ol>
          {shown < total && (
            <Button variant="ghost" size="sm" className="self-start" onClick={() => setShown(total)}>
              Show the rest
            </Button>
          )}
        </>
      )}
    </section>
  )
}

/** One entry of the recap. It fades in and scrolls into view when it appears. */
function RecapRow({ name, committed, dayLabel }: { name: string; committed: boolean; dayLabel: string | null }) {
  const ref = useRef<HTMLLIElement>(null)

  useEffect(() => {
    // jsdom has no scrollIntoView.
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [])

  return (
    <li ref={ref} className="flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
      {dayLabel !== null && (
        <p className="pt-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{dayLabel}</p>
      )}
      <div className="flex items-center gap-2">
        <CheckIcon className="size-4 shrink-0 text-primary" />
        <span className="font-medium">{name}</span>
        {committed && <Badge variant="secondary">committed</Badge>}
      </div>
    </li>
  )
}
