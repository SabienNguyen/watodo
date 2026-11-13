import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createFilePersister } from 'tinybase/persisters/persister-file';
import { addPastEntry, createWatodoStore, readSnapshot, setUpStarter, type WatodoStore } from '@/domain';
import { at } from '@/domain/testing';
import { planFromContent } from './notify-entry.ts';

// Monday 12 Oct 2026 at 10:00. The recap for last week (Monday 5 Oct) is due once a log from that week exists.
function storeWithLastWeekEntry(): WatodoStore {
  const store = createWatodoStore();
  setUpStarter(store);
  const snap = readSnapshot(store);
  addPastEntry(store, { activityId: snap.activities[0].id, sectionId: snap.sections[0].id, day: '2026-10-07' });
  return store;
}

const RECAP = {
  kind: 'recap',
  key: 'recap:2026-10-05',
  title: 'Your week is ready',
  body: '1 thing done',
  url: '/?tab=progress',
};

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'watodo-notify-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('planFromContent', () => {
  test('plans the recap from the JSON of the mergeable content', () => {
    const json = JSON.stringify(storeWithLastWeekEntry().getMergeableContent());
    expect(planFromContent(json, at(10, 0), [])).toEqual(RECAP);
  });

  test('returns null once the notification is in the sent log', () => {
    const json = JSON.stringify(storeWithLastWeekEntry().getMergeableContent());
    const sent = [{ kind: 'recap' as const, key: RECAP.key, at: at(9, 0).getTime() }];
    expect(planFromContent(json, at(10, 0), sent)).toBeNull();
  });

  test('returns null on a day with no recap', () => {
    const json = JSON.stringify(storeWithLastWeekEntry().getMergeableContent());
    expect(planFromContent(json, at(10, 0, 1), [])).toBeNull();
  });

  test('reads the file the hub writes, through the TinyBase file persister', async () => {
    const store = storeWithLastWeekEntry();
    const file = path.join(dir, 'watodo.json');
    const persister = createFilePersister(store, file);
    await persister.save();
    await persister.destroy();

    const json = await readFile(file, 'utf8');
    expect(planFromContent(json, at(10, 0), [])).toEqual(RECAP);
  });
});
