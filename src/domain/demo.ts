// Demo mode: a month of plausible history, built from the date alone so the same day always gives the same data.
import type { Clock } from './clock';
import { setDayNote } from './logging';
import { TABLE, writeJournalRow } from './schema';
import { finishSetup } from './setup';
import { readSnapshot, type WatodoStore } from './store';
import { saveTemplate } from './templates';
import {
  addDays, dayKeyOf, draftFromStarter, itemsOf, sectionActivities, slotsOf, weekdayOf,
  type Activity, type DayKey, type Id, type Snapshot,
} from './rules';

const STARTER_KEYS = ['office', 'wfh', 'weekend'] as const;
type StarterKey = (typeof STARTER_KEYS)[number];

const PAST_DAYS = 29;                // the days before today; today is seeded separately
const EMPTY_DAYS = 4;
const EMPTY_DAY_GAP = 4;             // empty days are at least this many days apart
const DAY_NOTE_DAYS = 5;
const WORK_FROM_HOME_SHARE = 0.25;   // about one weekday in four
const NOTE_CHANCE = 0.2;
const DURATION_CHANCE = 1 / 3;
const MIN_GAP_MINUTES = 5;           // entries on one day are at least this far apart
const DAY_START_MINUTES = 4 * 60;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

const ENTRY_NOTES = ['felt good', 'short one today', 'with Sam', 'finally finished the chapter', 'legs day'];
const DAY_NOTES = ['Long day at work.', 'Slept badly.', 'Good energy today.', 'Rainy day, stayed in.', 'Busy evening.'];

/** How often an activity is picked from its slot, relative to the others there. Unlisted activities weigh 1. */
const WEIGHTS: Partial<Record<string, number>> = { Gym: 14, Read: 2, Walk: 2, Guitar: 0.5, 'Call family': 0.25 };

/** When a slot is usually logged, as [earliest, latest] minutes after midnight. */
const WINDOWS: Partial<Record<string, [number, number]>> = {
  'Lunch break': [12 * 60, 13 * 60],
  'Post work': [17 * 60 + 30, 18 * 60 + 30],
  'Post dinner': [19 * 60 + 30, 20 * 60 + 30],
  'Bedtime': [21 * 60 + 30, 22 * 60 + 30],
  'After school': [15 * 60, 16 * 60 + 30],
  'Post-shower': [21 * 60, 22 * 60],
  'Pre-sleep': [22 * 60, 23 * 60],
};
/** Free time, and any slot without a window of its own. */
const DAYTIME: [number, number] = [10 * 60, 17 * 60];

type Rng = () => number;

/** FNV-1a: a number for a text, the same every time. */
function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash;
}

/** mulberry32: a small seeded generator. Returns numbers in [0, 1). */
function mulberry32(seed: number): Rng {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function pickWeighted(rng: Rng, activities: Activity[]): Activity {
  const weight = (activity: Activity) => WEIGHTS[activity.name] ?? 1;
  const total = activities.reduce((sum, activity) => sum + weight(activity), 0);
  let roll = rng() * total;
  for (const activity of activities) {
    roll -= weight(activity);
    if (roll < 0) return activity;
  }
  return activities[activities.length - 1];
}

/** Up to `count` different items, in random order. */
function pickDistinct<T>(rng: Rng, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    picked.push(...pool.splice(Math.floor(rng() * pool.length), 1));
  }
  return picked;
}

/** Indexes of the empty days, counted from the oldest (0) to yesterday (28). None is next to another. */
function pickEmptyDays(rng: Rng): Set<number> {
  const chosen: number[] = [];
  while (chosen.length < EMPTY_DAYS) {
    const candidate = Math.floor(rng() * PAST_DAYS);
    if (chosen.every(index => Math.abs(index - candidate) >= EMPTY_DAY_GAP)) chosen.push(candidate);
  }
  return new Set(chosen);
}

/** Local time on a watodo day, `minutes` after midnight. */
function localTime(day: DayKey, minutes: number): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, Math.floor(minutes / 60), minutes % 60);
}

/** A slot of a template, with the activities its section lists. */
interface SlotPlan { itemId: Id; sectionId: Id; name: string; activities: Activity[] }

function slotPlansOf(snap: Snapshot, templateId: Id): SlotPlan[] {
  return slotsOf(itemsOf(snap, templateId)).flatMap(item => {
    if (item.sectionId === undefined) return [];
    const activities = sectionActivities(snap, item.sectionId);
    return activities.length === 0
      ? []
      : [{ itemId: item.id, sectionId: item.sectionId, name: item.name, activities }];
  });
}

/** The three starter templates, in order. Office day comes first, so it is the default. */
function seedTemplates(store: WatodoStore): Record<StarterKey, Id> {
  const ids = {} as Record<StarterKey, Id>;
  for (const key of STARTER_KEYS) {
    const draft = draftFromStarter(readSnapshot(store), key);
    if (draft === null) throw new Error(`no starter named ${key}`);
    ids[key] = saveTemplate(store, draft);
  }
  return ids;
}

function seedPastDay(store: WatodoStore, rng: Rng, day: DayKey, templateId: Id, plans: SlotPlan[]): void {
  store.setCell(TABLE.days, day, 'templateId', templateId);
  if (plans.length === 0) return;

  const entryCount = 1 + Math.floor(rng() * 4);
  // Slot indexes in template order, so the day's entries follow the template.
  const slotIndexes = Array.from({ length: entryCount }, () => Math.floor(rng() * plans.length))
    .sort((a, b) => a - b);

  const used = new Set<string>();
  let previous = -Infinity;
  for (const index of slotIndexes) {
    const plan = plans[index];
    const fresh = plan.activities.filter(activity => !used.has(`${plan.sectionId}/${activity.id}`));
    const activity = pickWeighted(rng, fresh.length > 0 ? fresh : plan.activities);
    used.add(`${plan.sectionId}/${activity.id}`);

    const [earliest, latest] = WINDOWS[plan.name] ?? DAYTIME;
    const drawn = earliest + Math.floor(rng() * (latest - earliest + 1));
    const minutes = Math.max(drawn, previous + MIN_GAP_MINUTES);
    previous = minutes;

    const note = rng() < NOTE_CHANCE ? pick(rng, ENTRY_NOTES) : undefined;
    const durationMinutes = rng() < DURATION_CHANCE ? 15 + 5 * Math.floor(rng() * 16) : undefined;
    writeJournalRow(store, {
      activityId: activity.id,
      sectionId: plan.sectionId,
      itemId: plan.itemId,
      loggedAt: localTime(day, minutes).getTime(),
      note,
      durationMinutes,
    });
  }
}

/** Today: its starter template, confirmed, with one entry at the template's first slot, 30 minutes before the clock (or at 04:00 if that is before today). */
function seedToday(store: WatodoStore, rng: Rng, now: Date, today: DayKey, templateId: Id, plans: SlotPlan[]): void {
  store.setCell(TABLE.days, today, 'templateId', templateId);
  const plan = plans[0]; // Post work on Office day, Free time on Weekend
  const activity = pickWeighted(rng, plan.activities);

  const thirtyMinutesAgo = new Date(now.getTime() - THIRTY_MINUTES_MS);
  const loggedAt = dayKeyOf(thirtyMinutesAgo) === today ? thirtyMinutesAgo : localTime(today, DAY_START_MINUTES);
  writeJournalRow(store, {
    activityId: activity.id,
    sectionId: plan.sectionId,
    itemId: plan.itemId,
    loggedAt: loggedAt.getTime(),
  });
}

/**
 * Fills an empty store with the three starter templates and about a month of history
 * ending today, then finishes setup. Does nothing when the store already has templates.
 * Deterministic: the same day gives the same data.
 */
export function seedDemoMonth(store: WatodoStore, clock: Clock): void {
  if (store.getRowCount(TABLE.templates) > 0) return;

  const now = clock();
  const today = dayKeyOf(now);
  store.transaction(() => {
    const templateIds = seedTemplates(store);
    finishSetup(store);

    const snap = readSnapshot(store);
    const plans: Record<StarterKey, SlotPlan[]> = {
      office: slotPlansOf(snap, templateIds.office),
      wfh: slotPlansOf(snap, templateIds.wfh),
      weekend: slotPlansOf(snap, templateIds.weekend),
    };

    const rng = mulberry32(hashText(today));
    const empty = pickEmptyDays(rng);
    const activeDays: DayKey[] = [];
    for (let index = 0; index < PAST_DAYS; index++) {
      if (!empty.has(index)) activeDays.push(addDays(today, index - PAST_DAYS));
    }
    const weekdays = activeDays.filter(day => weekdayOf(day) < 5);
    const wfhDays = new Set(pickDistinct(rng, weekdays, Math.round(weekdays.length * WORK_FROM_HOME_SHARE)));
    for (const day of activeDays) {
      const key: StarterKey = weekdayOf(day) >= 5 ? 'weekend' : wfhDays.has(day) ? 'wfh' : 'office';
      seedPastDay(store, rng, day, templateIds[key], plans[key]);
    }

    for (const day of pickDistinct(rng, activeDays, DAY_NOTE_DAYS)) {
      setDayNote(store, day, pick(rng, DAY_NOTES));
    }

    const todayKey: StarterKey = weekdayOf(today) >= 5 ? 'weekend' : 'office';
    seedToday(store, rng, now, today, templateIds[todayKey], plans[todayKey]);
  });
}
