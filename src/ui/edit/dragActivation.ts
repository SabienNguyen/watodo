import { PointerSensor } from '@dnd-kit/react'

/**
 * The rule that decides when a press starts a drag. Derived from the PointerSensor's option type, so it
 * names no dnd-kit type that @dnd-kit/react does not export.
 */
type ActivationRule = Extract<
  NonNullable<Parameters<typeof PointerSensor.configure>[0]['activationConstraints']>,
  (...args: never[]) => unknown
>

/** The library's own rule, used for every press that does not land on the handle. */
const libraryRule = PointerSensor.defaults.activationConstraints as ActivationRule

/** Whether the press landed on the handle or on something inside it. */
function isOnHandle(target: EventTarget | null, handle: Element | undefined): boolean {
  return target instanceof Node && handle !== undefined && handle.contains(target)
}

/**
 * A press on the handle starts the drag at once, for every pointer type. A finger has no hover and
 * usually moves straight away, so the library's touch delay (250 ms at rest) would swallow the drag.
 * Anywhere else the library's rule applies unchanged.
 */
export const dragActivation: ActivationRule = (event, source) =>
  isOnHandle(event.target, source.handle) ? undefined : libraryRule(event, source)
