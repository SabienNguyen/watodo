import type { ReactNode } from 'react'
import { fullDayView } from '@/domain'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useNowDate, useSnapshot } from '@/ui/hooks'

/** The list of today's items. Shown from the Journal screen; no heading, no toggle. */
export function FullDay() {
  const snap = useSnapshot()
  const now = useNowDate()
  const view = fullDayView(snap, now)

  if (view.template === null) return null

  return (
    <ol className="flex list-none flex-col gap-3">
      {view.items.flatMap(({ item, displayName, current, activities, logged }) => {
        // A slot with entries today is replaced by them, one step per entry.
        if (logged.length > 0) {
          return logged.map(({ entry, activityName }) => (
            <Step key={entry.id} current={current}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{activityName}</p>
                {entry.committed === true && <Badge variant="secondary">committed</Badge>}
              </div>
            </Step>
          ))
        }
        return [(
          <Step key={item.id} current={current}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{displayName}</p>
              <Badge variant={item.kind === 'slot' ? 'default' : 'secondary'}>{item.kind}</Badge>
            </div>
            {item.kind === 'slot' && (
              <p className="text-sm text-muted-foreground">
                {activities.length > 0 ? activities.map(activity => activity.name).join(', ') : 'No activities yet'}
              </p>
            )}
          </Step>
        )]
      })}
    </ol>
  )
}

function Step({ current, children }: { current: boolean; children: ReactNode }) {
  return (
    <li
      aria-current={current ? 'true' : undefined}
      className={cn(
        'flex flex-col gap-2 rounded-xl p-4 ring-1',
        current ? 'bg-muted ring-foreground/20' : 'ring-foreground/10',
      )}
    >
      {children}
    </li>
  )
}
