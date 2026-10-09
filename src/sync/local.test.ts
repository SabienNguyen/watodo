// @vitest-environment jsdom
import { beforeEach, expect, test } from 'vitest';
import { createWatodoStore, readSnapshot, setUpStarter } from '@/domain';
import { startLocalSave } from './local';

beforeEach(() => {
  localStorage.clear();
});

test('changes are saved to local storage and loaded back by the next start', async () => {
  const store = createWatodoStore();
  await startLocalSave(store);
  setUpStarter(store);

  const reloaded = createWatodoStore();
  await startLocalSave(reloaded);
  expect(readSnapshot(reloaded).templates).toHaveLength(1);
  expect(readSnapshot(reloaded).activities).toHaveLength(7);
});
