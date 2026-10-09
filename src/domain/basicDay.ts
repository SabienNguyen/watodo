// Private to src/domain: the starter template used by setup and by restoring the last template.
import type { Id } from './rules';
import { toDayMinutes } from './rules';
import type { WatodoStore } from './store';
import {
  ensureActivity, ensureListing, ensureSection, newId, nextPosition, TABLE,
} from './schema';

const SECTIONS: { name: string; activities: string[] }[] = [
  { name: 'Post work', activities: ['Gym', 'Walk', 'Read'] },
  { name: 'Post dinner', activities: ['Guitar', 'Call family', 'Read'] },
  { name: 'Bedtime', activities: ['Journal', 'Stretch', 'Read'] },
];

const ITEMS: { kind: 'fixed' | 'slot'; name: string; start: string; end: string; section?: string }[] = [
  { kind: 'fixed', name: 'Wake up, brush teeth, get ready', start: '06:30', end: '08:30' },
  { kind: 'fixed', name: 'Work', start: '09:00', end: '17:30' },
  { kind: 'slot', name: 'Post work', start: '17:30', end: '19:00', section: 'Post work' },
  { kind: 'fixed', name: 'Dinner', start: '19:00', end: '19:30' },
  { kind: 'slot', name: 'Post dinner', start: '19:30', end: '21:30', section: 'Post dinner' },
  { kind: 'slot', name: 'Bedtime', start: '21:30', end: '23:00', section: 'Bedtime' },
];

/**
 * Adds the basic day template under a label, with its items, sections and listings.
 * Sections and activities that already exist (matched by name) are reused, and missing
 * listings are added. Does not change the default template. Callers wrap it in a transaction.
 */
export function addBasicDayTemplate(store: WatodoStore, labelId: Id): Id {
  const templateId = newId();
  store.setRow(TABLE.templates, templateId, {
    name: 'Basic day', labelId, position: nextPosition(store, TABLE.templates),
  });

  for (const section of SECTIONS) {
    const sectionId = ensureSection(store, section.name);
    for (const activity of section.activities) {
      ensureListing(store, sectionId, ensureActivity(store, activity));
    }
  }

  for (const item of ITEMS) {
    const itemId = newId();
    store.setRow(TABLE.items, itemId, {
      templateId,
      kind: item.kind,
      name: item.name,
      start: toDayMinutes(item.start),
      end: toDayMinutes(item.end),
      ...(item.section === undefined ? {} : { sectionId: ensureSection(store, item.section) }),
    });
  }
  return templateId;
}
