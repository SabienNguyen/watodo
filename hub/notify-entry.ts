import { createMergeableStore } from 'tinybase';
import { dueNotification, readSnapshot, type DueNotification, type SentNotification } from '@/domain';

// Bundled by vite.hub.config.ts into dist-hub/notify-entry.js. The hub loads that file, because Node
// cannot run the domain's extensionless imports or the `@/` alias itself.
export function planFromContent(json: string, at: Date, sent: SentNotification[]): DueNotification | null {
  const store = createMergeableStore();
  store.setMergeableContent(JSON.parse(json));
  return dueNotification(readSnapshot(store), at, sent);
}
