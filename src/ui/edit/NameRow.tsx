import { useId } from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

/**
 * One row of an Edit list: the item's name as a full-width button, with a chevron, that opens the
 * item's own editing view. The badge is described rather than named, so the button's name is
 * just the item's name.
 */
export function NameRow({ name, badge, onOpen }: {
  name: string
  badge?: string
  onOpen(): void
}) {
  const badgeId = useId()

  return (
    <li>
      <button
        type="button"
        aria-label={name}
        aria-describedby={badge === undefined ? undefined : badgeId}
        onClick={onOpen}
        className="flex min-h-12 w-full items-center justify-between gap-2 rounded-md py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{name}</span>
          {badge !== undefined && <Badge id={badgeId} variant="secondary">{badge}</Badge>}
        </span>
        <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  )
}
