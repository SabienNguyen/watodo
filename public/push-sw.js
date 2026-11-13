// Imported into the generated service worker (vite.config.ts, workbox.importScripts).

const DEFAULT_NOTICE = { title: 'watodo', body: '', url: '/', tag: undefined };

function readNotice(event) {
  if (!event.data) return DEFAULT_NOTICE;
  let value;
  try {
    value = event.data.json();
  } catch {
    return DEFAULT_NOTICE;
  }
  if (!value || typeof value !== 'object') return DEFAULT_NOTICE;
  return {
    title: typeof value.title === 'string' ? value.title : DEFAULT_NOTICE.title,
    body: typeof value.body === 'string' ? value.body : '',
    url: safeUrl(value.url),
    tag: typeof value.tag === 'string' ? value.tag : undefined,
  };
}

// Only app paths on this origin, never another site.
function safeUrl(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/';
}

self.addEventListener('push', (event) => {
  const notice = readNotice(event);
  event.waitUntil(self.registration.showNotification(notice.title, {
    body: notice.body,
    icon: '/pwa-192.png',
    tag: notice.tag,
    data: { url: notice.url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safeUrl(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => 'focus' in client);
    if (existing) {
      try {
        await existing.focus();
        await existing.navigate(url);
        return;
      } catch {
        // Fall through: a window that cannot be navigated is replaced by a new one.
      }
    }
    await self.clients.openWindow(url);
  })());
});
