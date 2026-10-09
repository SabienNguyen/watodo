import { formatDayMinutes, fullDayView } from '@/domain'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useNowDate, useSnapshot } from '@/ui/hooks'

export function FullDayScreen() {
  const snap = useSnapshot()
  const now = useNowDate()
  const view = fullDayView(snap, now)

  if (view.template === null) {
    return <p className="text-muted-foreground">No template yet.</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">{view.template.name}</h2>

      <ol className="flex flex-col gap-3">
        {view.items.map(({ item, current, activities }) => (
          <li
            key={item.id}
            aria-current={current ? 'true' : undefined}
            className={cn(
              'flex flex-col gap-2 rounded-xl p-4 ring-1',
              current ? 'bg-muted ring-foreground/20' : 'ring-foreground/10',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">
                {`${formatDayMinutes(item.start)} to ${formatDayMinutes(item.end)}`}
              </span>
              <Badge variant={item.kind === 'slot' ? 'default' : 'secondary'}>{item.kind}</Badge>
            </div>
            <p className="font-medium">{item.name}</p>
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
