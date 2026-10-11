import { createMergeableStore, type MergeableStore, type Row } from 'tinybase';
import type {
  DayRecord, Id, JournalEntry, Label, Listing, Section, Snapshot, Template, TemplateItem, Activity,
} from './rules';
import { decodeWeekdays, TABLE, VALUE } from './schema';

export type WatodoStore = MergeableStore;

export function createWatodoStore(): WatodoStore {
  return createMergeableStore();
}

type RowReader<T> = (id: Id, row: Row) => T | undefined;

function text(row: Row, cellId: string): string | undefined {
  const cell = row[cellId];
  return typeof cell === 'string' ? cell : undefined;
}

function num(row: Row, cellId: string): number | undefined {
  const cell = row[cellId];
  return typeof cell === 'number' ? cell : undefined;
}

function readRows<T>(store: WatodoStore, tableId: string, read: RowReader<T>): T[] {
  return store.getRowIds(tableId).flatMap(id => {
    const value = read(id, store.getRow(tableId, id));
    return value === undefined ? [] : [value];
  });
}

const readLabel: RowReader<Label> = (id, row) => {
  const name = text(row, 'name');
  const weekdays = text(row, 'weekdays');
  const position = num(row, 'position');
  if (name === undefined || weekdays === undefined || position === undefined) return undefined;
  return { id, name, weekdays: decodeWeekdays(weekdays), position };
};

const readTemplate: RowReader<Template> = (id, row) => {
  const name = text(row, 'name');
  const labelId = text(row, 'labelId');
  const position = num(row, 'position');
  if (name === undefined || labelId === undefined || position === undefined) return undefined;
  return { id, name, labelId, position };
};

/** A slot is named by its section, so it needs the section names; a slot whose section is missing is skipped. */
const readItem = (sectionNames: ReadonlyMap<Id, string>): RowReader<TemplateItem> => (id, row) => {
  const templateId = text(row, 'templateId');
  const kind = text(row, 'kind');
  // Rows saved before positions existed kept their order in `start`.
  const position = num(row, 'position') ?? num(row, 'start');
  if (templateId === undefined || (kind !== 'fixed' && kind !== 'slot') || position === undefined) {
    return undefined;
  }
  const sectionId = text(row, 'sectionId');
  if (kind === 'slot') {
    const name = sectionId === undefined ? undefined : sectionNames.get(sectionId);
    if (sectionId === undefined || name === undefined) return undefined;
    return { id, templateId, kind, name, position, sectionId };
  }
  const name = text(row, 'name');
  if (name === undefined) return undefined;
  return { id, templateId, kind, name, position, ...(sectionId === undefined ? {} : { sectionId }) };
};

const readSection: RowReader<Section> = (id, row) => {
  const name = text(row, 'name');
  const position = num(row, 'position');
  if (name === undefined || position === undefined) return undefined;
  return { id, name, position };
};

const readActivity: RowReader<Activity> = (id, row) => {
  const name = text(row, 'name');
  if (name === undefined) return undefined;
  return { id, name };
};

const readListing: RowReader<Listing> = (_id, row) => {
  const sectionId = text(row, 'sectionId');
  const activityId = text(row, 'activityId');
  const position = num(row, 'position');
  if (sectionId === undefined || activityId === undefined || position === undefined) return undefined;
  return { sectionId, activityId, position };
};

const readJournalEntry: RowReader<JournalEntry> = (id, row) => {
  const activityId = text(row, 'activityId');
  const sectionId = text(row, 'sectionId');
  const loggedAt = num(row, 'loggedAt');
  if (activityId === undefined || sectionId === undefined || loggedAt === undefined) return undefined;
  const itemId = text(row, 'itemId');
  const note = text(row, 'note');
  const durationMinutes = num(row, 'durationMinutes');
  return {
    id, activityId, sectionId, loggedAt,
    ...(itemId === undefined ? {} : { itemId }),
    ...(note === undefined ? {} : { note }),
    ...(durationMinutes === undefined ? {} : { durationMinutes }),
  };
};

const readDayRecord: RowReader<DayRecord> = (day, row) => {
  const templateId = text(row, 'templateId');
  const note = text(row, 'note');
  const chosenItemId = text(row, 'chosenItemId');
  const chosenAt = num(row, 'chosenAt');
  return {
    day,
    ...(templateId === undefined ? {} : { templateId }),
    ...(note === undefined ? {} : { note }),
    ...(chosenItemId === undefined ? {} : { chosenItemId }),
    ...(chosenAt === undefined ? {} : { chosenAt }),
  };
};

function byPosition<T extends { position: number }>(a: T, b: T): number {
  return a.position - b.position;
}

/** Everything in the store as plain data. Rows missing a required cell are skipped. */
export function readSnapshot(store: WatodoStore): Snapshot {
  const defaultTemplateId = store.getValue(VALUE.defaultTemplateId);
  const sections = readRows(store, TABLE.sections, readSection).sort(byPosition);
  const sectionNames = new Map<Id, string>(sections.map(section => [section.id, section.name]));
  return {
    labels: readRows(store, TABLE.labels, readLabel).sort(byPosition),
    templates: readRows(store, TABLE.templates, readTemplate).sort(byPosition),
    items: readRows(store, TABLE.items, readItem(sectionNames)).sort(byPosition),
    sections,
    activities: readRows(store, TABLE.activities, readActivity),
    listings: readRows(store, TABLE.listings, readListing).sort(byPosition),
    journal: readRows(store, TABLE.journal, readJournalEntry).sort((a, b) => a.loggedAt - b.loggedAt),
    days: readRows(store, TABLE.days, readDayRecord).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)),
    defaultTemplateId: typeof defaultTemplateId === 'string' ? defaultTemplateId : null,
  };
}

export interface SnapshotSource {
  subscribe(listener: () => void): () => void;
  get(): Snapshot;
}

/**
 * Keeps one cached snapshot. The cache is dropped on every change, whether or not
 * anyone subscribed, so get() is always current and returns the same object until then.
 */
export function createSnapshotSource(store: WatodoStore): SnapshotSource {
  const listeners = new Set<() => void>();
  let cached: Snapshot | null = null;

  const changed = () => {
    cached = null;
    for (const listener of [...listeners]) listener();
  };
  store.addTablesListener(changed);
  store.addValuesListener(changed);

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get() {
      cached ??= readSnapshot(store);
      return cached;
    },
  };
}
