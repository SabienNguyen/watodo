import { createLocalPersister } from 'tinybase/persisters/persister-browser';
import type { WatodoStore } from '@/domain';

/** Loads what is saved in local storage, then saves every change back to it. */
export async function startLocalSave(store: WatodoStore): Promise<void> {
  const persister = createLocalPersister(store, 'watodo');
  await persister.startAutoLoad();
  await persister.startAutoSave();
}
