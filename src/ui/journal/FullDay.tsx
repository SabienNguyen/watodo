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
    <div className="flex flex-col gap-6">
      <ol className="flex list-none flex-col gap-3">
        {view.items.map(({ item, displayName, current, activities }) => (
          <li
            key={item.id}
            aria-current={current ? 'true' : undefined}
            className={cn(
              'flex flex-col gap-2 rounded-xl p-4 ring-1',
              current ? 'bg-muted ring-foreground/20' : 'ring-foreground/10',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{displayName}</p>
              <Badge variant={item.kind === 'slot' ? 'default' : 'secondary'}>{item.kind}</Badge>
            </div>
            {item.kind === 'slot' && (
              <p className="text-sm text-muted-foreground">
                {activities.length > 0 ? activities.map(activity => activity.name).join(', ') : 'No activities yet'}
              </p>
            )}
          </li>
        ))}
      </ol>

      <p className="text-sm text-muted-foreground">
        Fixed steps are shown here only. They can&apos;t be tapped or logged.
      </p>
    </div>
  )
}
