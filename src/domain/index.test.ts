import { expect, test } from 'vitest';
import * as domain from './index';

test('re-exports the domain interface and the rules', () => {
  const names: (keyof typeof domain)[] = [
    'systemClock', 'createWatodoStore', 'readSnapshot', 'createSnapshotSource',
    'setupState', 'setUpStarter', 'finishSetup',
    'logActivity', 'confirmDay', 'undoLast', 'goToSlot', 'deleteEntry', 'addPastEntry', 'editEntry', 'setDayNote',
    'addSection', 'renameSection', 'deleteSection', 'addActivityToSection', 'removeActivityFromSection', 'renameActivity',
    'addLabel', 'renameLabel', 'setLabelWeekdays', 'deleteLabel', 'saveTemplate',
    'setDefaultTemplate', 'deleteTemplate',
    'nowView', 'fullDayView', 'journalByDay', 'progress', 'dotStrip', 'guessTemplate', 'positionAt', 'spentSlots', 'lastDone',
    'dayKeyOf', 'noonOf', 'templatesUsingSection', 'STARTERS', 'draftFromStarter', 'draftFromTemplate',
    'blankDraft', 'moveStep',
  ];
  for (const name of names) {
    expect(domain[name], name).toBeDefined();
  }
});

test('no longer exports the item-by-item template functions that saveTemplate replaces', () => {
  const removed = ['createTemplate', 'renameTemplate', 'setTemplateLabel', 'addItem', 'updateItem', 'moveItem', 'deleteItem']
  for (const name of removed) {
    expect(name in domain, name).toBe(false)
  }
})
