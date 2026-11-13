// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  createWatodoStore, finishSetup, readSnapshot, setNotifyKind, setUpStarter, type WatodoStore,
} from '@/domain'
import { renderWithWatodo } from '@/ui/testing'
import { permissionGranted, pushState, sendTestPush, turnOffPush, turnOnPush } from '@/ui/push'
import { EditScreen } from './EditScreen'
import { NotificationsPart } from './NotificationsPart'

vi.mock('@/ui/push', () => ({
  pushState: vi.fn(),
  turnOnPush: vi.fn(),
  turnOffPush: vi.fn(),
  sendTestPush: vi.fn(),
  permissionGranted: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(pushState).mockResolvedValue('off')
  vi.mocked(turnOnPush).mockResolvedValue('on')
  vi.mocked(turnOffPush).mockResolvedValue('off')
  vi.mocked(sendTestPush).mockResolvedValue(true)
  vi.mocked(permissionGranted).mockReturnValue(true)
})

function finishedStore(): WatodoStore {
  const store = createWatodoStore()
  setUpStarter(store)
  finishSetup(store)
  return store
}

function renderTab(store: WatodoStore = finishedStore()) {
  return renderWithWatodo(<NotificationsPart />, { store })
}

/** Waits for the device section to load its state, then returns the named control, if shown. */
async function device(name: string): Promise<HTMLElement> {
  return screen.findByRole('button', { name })
}

describe('the Notifications tab', () => {
  test('is the fifth Edit tab and shows the five kinds', async () => {
    renderWithWatodo(<EditScreen />, { store: finishedStore() })

    fireEvent.click(screen.getByRole('tab', { name: 'Notifications' }))

    expect(screen.getByRole('checkbox', { name: 'Slot reminders' })).toBeChecked()
    expect(await device('Turn on notifications')).toBeInTheDocument()
  })

  test('shows each kind as a checkbox, all on by default', () => {
    renderTab()

    for (const name of ['Slot reminders', 'After committed activities', 'Daily check-in', 'Resting activities back', 'Weekly recap']) {
      expect(screen.getByRole('checkbox', { name })).toBeChecked()
    }
  })

  test('reflects the stored settings', () => {
    const store = finishedStore()
    setNotifyKind(store, 'recap', false)

    renderTab(store)

    expect(screen.getByRole('checkbox', { name: 'Weekly recap' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Slot reminders' })).toBeChecked()
  })

  test('toggling a kind stores it', () => {
    const store = finishedStore()
    renderTab(store)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Slot reminders' }))

    expect(readSnapshot(store).notify?.kinds.slot).toBe(false)
    expect(screen.getByRole('checkbox', { name: 'Slot reminders' })).not.toBeChecked()
  })

  test('per day stores a number when the field is left', () => {
    const store = finishedStore()
    renderTab(store)

    const input = screen.getByRole('spinbutton', { name: 'Per day' })
    fireEvent.change(input, { target: { value: '7' } })
    fireEvent.blur(input)

    expect(readSnapshot(store).notify?.dailyCap).toBe(7)
  })

  test('per day stores on Enter, and clamps to 10', () => {
    const store = finishedStore()
    renderTab(store)

    const input = screen.getByRole('spinbutton', { name: 'Per day' })
    input.focus()
    fireEvent.change(input, { target: { value: '42' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(readSnapshot(store).notify?.dailyCap).toBe(10)
    expect(screen.getByRole('spinbutton', { name: 'Per day' })).toHaveValue(10)
  })

  test('quiet hours store minutes after midnight', () => {
    const store = finishedStore()
    renderTab(store)

    fireEvent.change(screen.getByLabelText('Quiet from'), { target: { value: '22:30' } })
    fireEvent.change(screen.getByLabelText('until'), { target: { value: '07:15' } })

    const notify = readSnapshot(store).notify
    expect(notify?.quietStart).toBe(1350)
    expect(notify?.quietEnd).toBe(435)
    expect(screen.getByLabelText('Quiet from')).toHaveValue('22:30')
  })

  test('shows turn on when this device is off', async () => {
    renderTab()

    expect(await device('Turn on notifications')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn off' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send test' })).toBeNull()
  })

  test('shows turn off and send test when this device is on', async () => {
    vi.mocked(pushState).mockResolvedValue('on')
    renderTab()

    expect(await device('Turn off')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send test' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).toBeNull()
  })

  test('says notifications are not available when the browser has no support', async () => {
    vi.mocked(pushState).mockResolvedValue('unsupported')
    renderTab()

    expect(await screen.findByText("Notifications aren't available here.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).toBeNull()
  })

  test('says notifications are blocked when the browser has denied them', async () => {
    vi.mocked(pushState).mockResolvedValue('denied')
    renderTab()

    expect(await screen.findByText('Notifications are blocked in Settings.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).toBeNull()
  })

  test('turning on switches to turn off and send test', async () => {
    renderTab()

    fireEvent.click(await device('Turn on notifications'))

    expect(await device('Turn off')).toBeInTheDocument()
    expect(turnOnPush).toHaveBeenCalledOnce()
  })

  test('a turn-on that cannot reach the hub shows the error and stays off', async () => {
    vi.mocked(turnOnPush).mockResolvedValue('off')
    renderTab()

    fireEvent.click(await device('Turn on notifications'))

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the hub.")
    expect(screen.getByRole('button', { name: 'Turn on notifications' })).toBeInTheDocument()
  })

  test('a refused prompt stays off without an error', async () => {
    vi.mocked(turnOnPush).mockResolvedValue('denied')
    vi.mocked(permissionGranted).mockReturnValue(false)
    renderTab()

    fireEvent.click(await device('Turn on notifications'))

    await vi.waitFor(() => expect(turnOnPush).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('turning off a device that is on switches to turn on', async () => {
    vi.mocked(pushState).mockResolvedValue('on')
    renderTab()

    fireEvent.click(await device('Turn off'))

    expect(await device('Turn on notifications')).toBeInTheDocument()
  })

  test('a turn-off the hub did not take shows the error and stays on', async () => {
    vi.mocked(pushState).mockResolvedValue('on')
    vi.mocked(turnOffPush).mockResolvedValue('on')
    renderTab()

    fireEvent.click(await device('Turn off'))

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the hub.")
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeInTheDocument()
  })

  test('send test calls the hub and shows no error on success', async () => {
    vi.mocked(pushState).mockResolvedValue('on')
    renderTab()

    fireEvent.click(await device('Send test'))

    await vi.waitFor(() => expect(sendTestPush).toHaveBeenCalledOnce())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('a failed send test shows the error', async () => {
    vi.mocked(pushState).mockResolvedValue('on')
    vi.mocked(sendTestPush).mockResolvedValue(false)
    renderTab()

    fireEvent.click(await device('Send test'))

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the hub.")
  })
})
