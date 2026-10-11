import { describe, expect, test } from 'vitest';
import * as domain from './index';
import type { Clock } from './clock';
import { seedDemoMonth } from './demo';
import {
  addDays, dayKeyOf, lastDone, progress, sectionActivities, weekdayOf, type Activity, type Id, type Snapshot,
} from './rules';
import { setupState, setUpStarter } from './setup';
import { createWatodoStore, readSnapshot, type WatodoStore } from './store';

const MONDAY: Clock = () => new Date(2026, 9, 12, 17, 45);
const TODAY = '2026-10-12';
const THIRTY_MINUTES = 30 * 60 * 1000;

function seed(clock: Clock = MONDAY): { store: WatodoStore; snap: Snapshot } {
  const store = createWatodoStore();
  seedDemoMonth(store, clock);
  return { store, snap: readSnapshot(store) };
}

function templateNamed(snap: Snapshot, name: string) {
  const template = snap.templates.find(candidate => candidate.name === name);
  if (template === undefined) throw new Error(`no template named ${name}`);
  return template;
}

const dayOf = (loggedAt: number) => dayKeyOf(new Date(loggedAt));

function recordOf(snap: Snapshot, day: string) {
  return snap.days.find(record => record.day === day);
}

function nameOf(rows: Activity[] | { id: Id; name: string }[], id: Id): string {
  return rows.find(row => row.id === id)?.name ?? '?';
}

/** The past 29 days, oldest first. */
const PAST_DAYS = Array.from({ length: 29 }, (_, i) => addDays(TODAY, i - 29));

describe('seedDemoMonth', () => {
  test('an empty store is set up with three templates and Office day as the default', () => {
    const { store, snap } = seed();

    expect(setupState(store)).toBe('done');
    expect(snap.templates.map(template => template.name)).toEqual(['Office day', 'Work from home', 'Weekend']);
    expect(snap.defaultTemplateId).toBe(templateNamed(snap, 'Office day').id);
  });

  test('the journal has 40 to 110 entries, none after the clock, the earliest on or after 29 days before today', () => {
    const { snap } = seed();

    expect(snap.journal.length).toBeGreaterThanOrEqual(40);
    expect(snap.journal.length).toBeLessThanOrEqual(110);
    const now = MONDAY().getTime();
    for (const entry of snap.journal) expect(entry.loggedAt).toBeLessThanOrEqual(now);
    expect(dayOf(snap.journal[0].loggedAt) >= addDays(TODAY, -29)).toBe(true);
  });

  test('every entry is an activity listed in its section, at a slot of the template recorded for its day', () => {
    const { snap } = seed();

    for (const entry of snap.journal) {
      const day = dayOf(entry.loggedAt);
      const record = recordOf(snap, day);
      expect(record?.templateId, day).toBeDefined();
      const item = snap.items.find(candidate => candidate.id === entry.itemId);
      expect(item, day).toMatchObject({ kind: 'slot', templateId: record?.templateId, sectionId: entry.sectionId });
      const listed = sectionActivities(snap, entry.sectionId).map(activity => activity.id);
      expect(listed).toContain(entry.activityId);
    }
  });

  test('within each day, entries in loggedAt order never move back through the template', () => {
    const { snap } = seed();
    const positionOf = (itemId: Id | undefined) => snap.items.find(item => item.id === itemId)?.position ?? -1;

    const byDay = new Map<string, number[]>();
    for (const entry of snap.journal) {
      const day = dayOf(entry.loggedAt);
      byDay.set(day, [...(byDay.get(day) ?? []), positionOf(entry.itemId)]);
    }
    for (const [day, positions] of byDay) {
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i], day).toBeGreaterThanOrEqual(positions[i - 1]);
      }
    }
  });

  test('entries cover 22 to 26 past days, at least 3 past days are empty, and no two empty days are consecutive', () => {
    const { snap } = seed();

    const covered = new Set(snap.journal.map(entry => dayOf(entry.loggedAt)));
    expect(covered.size).toBeGreaterThanOrEqual(22);
    expect(covered.size).toBeLessThanOrEqual(26);

    const emptyIndexes = PAST_DAYS.flatMap((day, index) => (
      !covered.has(day) && recordOf(snap, day) === undefined ? [index] : []
    ));
    expect(emptyIndexes.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < emptyIndexes.length; i++) {
      expect(emptyIndexes[i] - emptyIndexes[i - 1]).toBeGreaterThan(1);
    }
  });

  test('weekend days use Weekend, weekdays use Office day or Work from home, with at least 3 Work from home days', () => {
    const { snap } = seed();
    const office = templateNamed(snap, 'Office day').id;
    const wfh = templateNamed(snap, 'Work from home').id;
    const weekend = templateNamed(snap, 'Weekend').id;

    const pastRecords = snap.days.filter(record => record.day < TODAY);
    for (const record of pastRecords) {
      if (weekdayOf(record.day) >= 5) expect(record.templateId, record.day).toBe(weekend);
      else expect([office, wfh], record.day).toContain(record.templateId);
    }
    expect(pastRecords.filter(record => record.templateId === wfh).length).toBeGreaterThanOrEqual(3);
  });

  test('some entries have notes and some have durations, each a multiple of 5 from 15 to 90, and there are at least 4 day notes', () => {
    const { snap } = seed();

    const withNote = snap.journal.filter(entry => entry.note !== undefined);
    const withDuration = snap.journal.filter(entry => entry.durationMinutes !== undefined);
    expect(withNote.length).toBeGreaterThanOrEqual(5);
    expect(withDuration.length).toBeGreaterThanOrEqual(5);
    for (const entry of withDuration) {
      const minutes = entry.durationMinutes ?? 0;
      expect(minutes % 5, String(minutes)).toBe(0);
      expect(minutes, String(minutes)).toBeGreaterThanOrEqual(15);
      expect(minutes, String(minutes)).toBeLessThanOrEqual(90);
    }
    expect(snap.days.filter(record => record.note !== undefined).length).toBeGreaterThanOrEqual(4);
  });

  test('today is confirmed as Office day, has exactly one entry 30 minutes before the clock, and that is its last done', () => {
    const { snap } = seed();

    expect(recordOf(snap, TODAY)?.templateId).toBe(templateNamed(snap, 'Office day').id);
    const todays = snap.journal.filter(entry => dayOf(entry.loggedAt) === TODAY);
    expect(todays).toHaveLength(1);
    expect(todays[0].loggedAt).toBe(MONDAY().getTime() - THIRTY_MINUTES);
    expect(lastDone(snap.journal, todays[0].activityId)).toEqual(todays[0]);
  });

  test('on a Saturday, today uses Weekend and has one entry at a slot of the Weekend template', () => {
    const SATURDAY_DAY = '2026-10-10';
    const SATURDAY: Clock = () => new Date(2026, 9, 10, 14, 0);
    const { snap } = seed(SATURDAY);

    const weekend = templateNamed(snap, 'Weekend').id;
    expect(recordOf(snap, SATURDAY_DAY)?.templateId).toBe(weekend);
    const todays = snap.journal.filter(entry => dayOf(entry.loggedAt) === SATURDAY_DAY);
    expect(todays).toHaveLength(1);
    const item = snap.items.find(candidate => candidate.id === todays[0].itemId);
    expect(item).toMatchObject({ kind: 'slot', templateId: weekend });
  });

  test('over the 30 days, Gym and Read are among the top three activities', () => {
    const { snap } = seed();

    const top = progress(snap, addDays(TODAY, -29), TODAY).byActivity.slice(0, 3);
    const names = top.map(({ activityId }) => nameOf(snap.activities, activityId));
    expect(names).toEqual(expect.arrayContaining(['Gym', 'Read']));
  });

  test('the same date gives the same journal, and the next day gives a different one', () => {
    const journalOf = (snap: Snapshot) => snap.journal.map(entry => [
      nameOf(snap.activities, entry.activityId),
      nameOf(snap.sections, entry.sectionId),
      entry.loggedAt,
    ]);

    const first = journalOf(seed().snap);
    expect(journalOf(seed().snap)).toEqual(first);

    const nextDay: Clock = () => new Date(2026, 9, 13, 17, 45);
    expect(journalOf(seed(nextDay).snap)).not.toEqual(first);
  });

  test('calling it on a store that already has a template changes nothing', () => {
    const store = createWatodoStore();
    setUpStarter(store);
    const before = readSnapshot(store);

    seedDemoMonth(store, MONDAY);

    expect(readSnapshot(store)).toEqual(before);
  });

  test('is re-exported from the domain index', () => {
    expect(domain.seedDemoMonth).toBe(seedDemoMonth);
  });
});
