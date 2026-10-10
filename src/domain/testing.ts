import type { Id } from './rules';
import { setUpStarter } from './setup';
import { createWatodoStore, readSnapshot, type WatodoStore } from './store';

/** Local time on Monday 12 Oct 2026, moved by `dayOffset` days. */
export function at(hours: number, minutes: number, dayOffset = 0): Date {
  return new Date(2026, 9, 12 + dayOffset, hours, minutes);
}

export interface BasicDayFixture {
  store: WatodoStore;
  labelId: Id;
  templateId: Id;
  sectionId(name: string): Id;
  activityId(name: string): Id;
  itemId(name: string): Id;
}

/** A store with the starter menu set up (customising, not finished). */
export function basicDay(): BasicDayFixture {
  const store = createWatodoStore();
  setUpStarter(store);
  const snap = readSnapshot(store);
  const named = <T extends { id: Id; name: string }>(rows: T[], name: string): Id => {
    const row = rows.find(r => r.name === name);
    if (!row) throw new Error(`no row named ${name}`);
    return row.id;
  };
  return {
    store,
    labelId: snap.labels[0].id,
    templateId: snap.templates[0].id,
    sectionId: (name: string) => named(snap.sections, name),
    activityId: (name: string) => named(snap.activities, name),
    itemId: (name: string) => named(snap.items, name),
  };
}
