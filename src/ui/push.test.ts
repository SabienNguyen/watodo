import { describe, expect, test, vi } from 'vitest'
import {
  base64UrlToBytes, permissionGranted, pushState, sendTestPush, turnOffPush, turnOnPush, type PushEnv,
} from './push'

interface Setup {
  /** False removes the service worker, PushManager and Notification globals. */
  supported?: boolean
  permission?: NotificationPermission
  /** What requestPermission resolves to. */
  requestResult?: NotificationPermission
  /** False: no service worker registration (dev mode). */
  registered?: boolean
  /** True: this device already has a subscription. */
  subscribed?: boolean
  /** Status of the hub answers, other than the key. */
  hubStatus?: number
  /** True: the hub cannot be reached at all. */
  offline?: boolean
}

function makeEnv(setup: Setup = {}) {
  const subscription = {
    endpoint: 'https://push.example/device-1',
    toJSON: () => ({ endpoint: 'https://push.example/device-1', keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: vi.fn(async () => true),
  }
  const pushManager = {
    getSubscription: vi.fn(async () => (setup.subscribed ? subscription : null)),
    subscribe: vi.fn(async () => subscription),
  }
  const registration = { pushManager }
  const serviceWorker = {
    getRegistration: vi.fn(async () => (setup.registered === false ? undefined : registration)),
    ready: Promise.resolve(registration),
  }
  // Like the browser: asking records the answer as the permission.
  const Notification = {
    permission: setup.permission ?? 'default' as NotificationPermission,
    requestPermission: vi.fn(async () => {
      Notification.permission = setup.requestResult ?? Notification.permission
      return Notification.permission
    }),
  }
  const supported = setup.supported ?? true
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (setup.offline) throw new TypeError('Failed to fetch')
    if (String(input) === '/hub/push/key') {
      return new Response(JSON.stringify({ publicKey: '-_8' }), { status: 200 })
    }
    return new Response(null, { status: setup.hubStatus ?? 204 })
  })
  const env: PushEnv = {
    navigator: (supported ? { serviceWorker } : {}) as unknown as Navigator,
    win: (supported ? { PushManager: class {}, Notification } : {}) as unknown as PushEnv['win'],
    fetch: fetch as unknown as typeof globalThis.fetch,
  }
  return { env, subscription, pushManager, Notification, fetch }
}

describe('pushState', () => {
  test('is unsupported without a service worker, PushManager or Notification', async () => {
    const { env } = makeEnv({ supported: false })
    expect(await pushState(env)).toBe('unsupported')
  })

  test('is denied when the browser has blocked notifications', async () => {
    const { env } = makeEnv({ permission: 'denied', subscribed: true })
    expect(await pushState(env)).toBe('denied')
  })

  test('is off when there is no service worker registration, without waiting for one', async () => {
    const { env } = makeEnv({ permission: 'granted', registered: false })
    expect(await pushState(env)).toBe('off')
  })

  test('is off when the registration has no subscription', async () => {
    const { env } = makeEnv({ permission: 'granted' })
    expect(await pushState(env)).toBe('off')
  })

  test('is on when this device has a subscription', async () => {
    const { env } = makeEnv({ permission: 'granted', subscribed: true })
    expect(await pushState(env)).toBe('on')
  })
})

describe('permissionGranted', () => {
  test('is true only when the browser has granted permission', () => {
    expect(permissionGranted(makeEnv({ permission: 'granted' }).env)).toBe(true)
    expect(permissionGranted(makeEnv({ permission: 'default' }).env)).toBe(false)
    expect(permissionGranted(makeEnv({ supported: false }).env)).toBe(false)
  })
})

describe('base64UrlToBytes', () => {
  test('decodes the url-safe alphabet, without padding', () => {
    expect(Array.from(base64UrlToBytes('-_8'))).toEqual([251, 255])
  })
})

describe('turnOnPush', () => {
  test('asks for permission, subscribes with the hub key, posts the subscription, and is on', async () => {
    const { env, pushManager, Notification, fetch } = makeEnv({ permission: 'default', requestResult: 'granted' })

    expect(await turnOnPush(env)).toBe('on')

    expect(Notification.requestPermission).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith('/hub/push/key')
    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([251, 255]),
    })
    expect(fetch).toHaveBeenCalledWith('/hub/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://push.example/device-1', keys: { p256dh: 'p', auth: 'a' } }),
    })
  })

  test('returns denied, and does not subscribe, when the prompt is refused', async () => {
    const { env, pushManager, fetch } = makeEnv({ permission: 'default', requestResult: 'denied' })

    expect(await turnOnPush(env)).toBe('denied')
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  test('returns off, and does not subscribe, when the prompt is dismissed', async () => {
    const { env, pushManager } = makeEnv({ permission: 'default', requestResult: 'default' })

    expect(await turnOnPush(env)).toBe('off')
    expect(pushManager.subscribe).not.toHaveBeenCalled()
  })

  test('returns off, without throwing, when the hub cannot be reached', async () => {
    const { env } = makeEnv({ permission: 'default', requestResult: 'granted', offline: true })

    expect(await turnOnPush(env)).toBe('off')
    expect(permissionGranted(env)).toBe(true)
  })

  test('returns off when the hub refuses the subscription', async () => {
    const { env } = makeEnv({ permission: 'default', requestResult: 'granted', hubStatus: 400 })

    expect(await turnOnPush(env)).toBe('off')
  })
})

describe('turnOffPush', () => {
  test('tells the hub the endpoint, then unsubscribes this device, and is off', async () => {
    const { env, subscription, fetch } = makeEnv({ permission: 'granted', subscribed: true })

    expect(await turnOffPush(env)).toBe('off')

    expect(fetch).toHaveBeenCalledWith('/hub/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://push.example/device-1' }),
    })
    expect(subscription.unsubscribe).toHaveBeenCalledOnce()
  })

  test('keeps the subscription and stays on when the hub cannot be reached', async () => {
    const { env, subscription } = makeEnv({ permission: 'granted', subscribed: true, offline: true })

    expect(await turnOffPush(env)).toBe('on')
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
  })
})

describe('sendTestPush', () => {
  test('is true when the hub answers with success', async () => {
    const { env, fetch } = makeEnv()

    expect(await sendTestPush(env)).toBe(true)
    expect(fetch).toHaveBeenCalledWith('/hub/push/test', { method: 'POST' })
  })

  test('is false when the hub fails or cannot be reached', async () => {
    expect(await sendTestPush(makeEnv({ hubStatus: 500 }).env)).toBe(false)
    expect(await sendTestPush(makeEnv({ offline: true }).env)).toBe(false)
  })
})
