// Private to src/domain: the starter template used by setup and by restoring the last template.
import type { Id } from './rules';
import type { WatodoStore } from './store';
import {
  ensureActivity, ensureListing, ensureSection, newId, nextPosition, TABLE,
} from './schema';

const SECTIONS: { name: string; activities: string[] }[] = [
  { name: 'Post work', activities: ['Gym', 'Walk', 'Read'] },
  { name: 'Post dinner', activities: ['Guitar', 'Call family', 'Read'] },
  { name: 'Bedtime', activities: ['Journal', 'Stretch', 'Read'] },
];

const ITEMS: { kind: 'fixed' | 'slot'; name: string; section?: string }[] = [
  { kind: 'fixed', name: 'Wake up, brush teeth, get ready' },
  { kind: 'fixed', name: 'Work' },
  { kind: 'slot', name: 'Post work', section: 'Post work' },
  { kind: 'fixed', name: 'Dinner' },
  { kind: 'slot', name: 'Post dinner', section: 'Post dinner' },
  { kind: 'slot', name: 'Bedtime', section: 'Bedtime' },
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

  ITEMS.forEach((item, position) => {
    store.setRow(TABLE.items, newId(), {
      templateId,
      kind: item.kind,
      name: item.name,
      position,
      ...(item.section === undefined ? {} : { sectionId: ensureSection(store, item.section) }),
    });
  });
  return templateId;
}
