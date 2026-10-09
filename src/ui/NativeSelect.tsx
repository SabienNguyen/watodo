import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** A native select styled like the shadcn Input, so the phone shows its own picker. */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30 md:text-sm',
        className,
      )}
      {...props}
    />
  )
}
