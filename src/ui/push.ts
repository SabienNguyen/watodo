/** This device's web push subscription, and the hub endpoints that hold it. */

export type PushState = 'unsupported' | 'denied' | 'off' | 'on'

/** What the push functions touch. The app passes the browser's; tests pass fakes. */
export interface PushEnv {
  navigator: Navigator
  win: Window & typeof globalThis
  fetch: typeof fetch
}

export function browserEnv(): PushEnv {
  return {
    navigator,
    win: window,
    fetch: (input, init) => fetch(input, init),
  }
}

function supported(env: PushEnv): boolean {
  return 'serviceWorker' in env.navigator && 'PushManager' in env.win && 'Notification' in env.win
}

/** Whether the browser currently allows notifications. Used to tell a failed subscribe from a dismissed prompt. */
export function permissionGranted(env: PushEnv = browserEnv()): boolean {
  return supported(env) && env.win.Notification.permission === 'granted'
}

/**
 * The state of this device. `getRegistration` rather than `ready`: with no service worker (dev mode),
 * `ready` never resolves.
 */
export async function pushState(env: PushEnv = browserEnv()): Promise<PushState> {
  if (!supported(env)) return 'unsupported'
  if (env.win.Notification.permission === 'denied') return 'denied'
  try {
    const registration = await env.navigator.serviceWorker.getRegistration()
    if (registration === undefined) return 'off'
    const subscription = await registration.pushManager.getSubscription()
    return subscription === null ? 'off' : 'on'
  } catch {
    return 'off'
  }
}

/** Decodes the hub's base64url VAPID public key into the bytes `pushManager.subscribe` takes. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0))
}

/** Throws when the hub does not answer with success. */
async function postToHub(env: PushEnv, path: string, body?: unknown): Promise<void> {
  const response = await env.fetch(path, body === undefined ? { method: 'POST' } : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${path} answered ${response.status}`)
}

/**
 * Asks for permission, then subscribes and tells the hub. Must run straight from a click handler,
 * because the browser only shows the permission prompt for a user gesture. Network failures return
 * 'off' without throwing; check `permissionGranted()` afterwards to tell them from a refused prompt.
 */
export async function turnOnPush(env: PushEnv = browserEnv()): Promise<PushState> {
  if (!supported(env)) return 'unsupported'
  const permission = await env.win.Notification.requestPermission()
  if (permission === 'denied') return 'denied'
  if (permission !== 'granted') return 'off'
  try {
    const keyResponse = await env.fetch('/hub/push/key')
    if (!keyResponse.ok) throw new Error(`key answered ${keyResponse.status}`)
    const { publicKey } = (await keyResponse.json()) as { publicKey: string }
    const registration = await env.navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    })
    await postToHub(env, '/hub/push/subscribe', subscription.toJSON())
    return 'on'
  } catch {
    return 'off'
  }
}

/**
 * Tells the hub first, then drops the local subscription, so a failed hub call leaves both in place.
 * Returns 'off' when done, and 'on' when nothing changed.
 */
export async function turnOffPush(env: PushEnv = browserEnv()): Promise<PushState> {
  try {
    const registration = await env.navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription === null || subscription === undefined) return 'off'
    await postToHub(env, '/hub/push/unsubscribe', { endpoint: subscription.endpoint })
    await subscription.unsubscribe()
    return 'off'
  } catch {
    return 'on'
  }
}

/** Asks the hub to send a test notification to every subscribed device. */
export async function sendTestPush(env: PushEnv = browserEnv()): Promise<boolean> {
  try {
    await postToHub(env, '/hub/push/test')
    return true
  } catch {
    return false
  }
}
