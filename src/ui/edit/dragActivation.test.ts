// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import { dragActivation } from './dragActivation'

type RuleEvent = Parameters<typeof dragActivation>[0]
type RuleSource = Parameters<typeof dragActivation>[1]

/** Runs the rule on plain objects standing in for the pointer event and the dragged source. */
function press(pointerType: string, target: EventTarget | null, handle: Element | undefined) {
  const event = { pointerType, target } as unknown as RuleEvent
  const source = { handle } as unknown as RuleSource
  return dragActivation(event, source)
}

describe('dragActivation', () => {
  test('a touch on the handle starts the drag at once', () => {
    const handle = document.createElement('button')

    expect(press('touch', handle, handle)).toBeUndefined()
  })

  test('a touch on something inside the handle starts the drag at once', () => {
    const handle = document.createElement('button')
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    handle.append(icon)

    expect(press('touch', icon, handle)).toBeUndefined()
  })

  test('a touch elsewhere keeps the library rule, which is a non-empty list of constraints', () => {
    const handle = document.createElement('button')
    const row = document.createElement('li')

    const constraints = press('touch', row, handle)
    expect(Array.isArray(constraints)).toBe(true)
    expect(constraints).not.toHaveLength(0)
  })

  test('a mouse on the handle starts the drag at once', () => {
    const handle = document.createElement('button')

    expect(press('mouse', handle, handle)).toBeUndefined()
  })
})
