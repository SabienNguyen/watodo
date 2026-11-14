import type { Id } from '@/domain'
import { Button } from '@/components/ui/button'

/**
 * The Through row of a committed activity: one button per slot it can run through, the chosen one and those
 * before it filled. Tapping a slot runs it through that slot; tapping the last filled slot takes it off, so
 * the span ends one slot earlier. The first slot always stays. Shown only with more than one choice.
 */
export function ThroughChoice({ choices, throughId, onThroughChange }: {
  choices: { id: Id; name: string }[]
  throughId: Id
  onThroughChange(id: Id): void
}) {
  if (choices.length < 2) return null
  const chosenIndex = choices.findIndex(choice => choice.id === throughId)

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Through</p>
      <div role="group" aria-label="Through" className="flex flex-wrap gap-2">
        {choices.map((choice, index) => (
          <Button
            key={choice.id}
            type="button"
            size="sm"
            variant={index <= chosenIndex ? 'default' : 'outline'}
            aria-pressed={choice.id === throughId}
            onClick={() => {
              if (index === chosenIndex && index > 0) onThroughChange(choices[index - 1].id)
              else if (index !== chosenIndex) onThroughChange(choice.id)
            }}
          >
            {choice.name}
          </Button>
        ))}
      </div>
    </div>
  )
}
