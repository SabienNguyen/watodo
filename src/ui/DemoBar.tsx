import type { JSX } from 'react'

/** The current address without the demo parameter: the same page, on real data. */
function exitHref(): string {
  const url = new URL(window.location.href)
  url.searchParams.delete('demo')
  return `${url.pathname}${url.search}${url.hash}`
}

/** A thin bar shown above the app in demo mode. */
export function DemoBar(): JSX.Element {
  return (
    <div className="border-b bg-muted">
      <div className="mx-auto flex w-full max-w-[28rem] items-center justify-between gap-3 px-4 py-1.5 text-xs text-muted-foreground">
        <span>Demo data. Nothing here is saved.</span>
        <a href={exitHref()} className="shrink-0 underline underline-offset-2 hover:text-foreground">
          Exit demo
        </a>
      </div>
    </div>
  )
}
