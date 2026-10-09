import { expect, test } from 'vitest';
import * as domain from './index';

test('re-exports the domain interface and the rules', () => {
  const names: (keyof typeof domain)[] = [
    'systemClock', 'createWatodoStore', 'readSnapshot', 'createSnapshotSource',
    'setupState', 'setUpStarter', 'finishSetup',
    'logActivity', 'confirmDay', 'undoLast', 'endStepEarly', 'deleteEntry', 'addPastEntry', 'editEntry', 'setDayNote',
    'addSection', 'renameSection', 'deleteSection', 'addActivityToSection', 'removeActivityFromSection', 'renameActivity',
    'addLabel', 'renameLabel', 'setLabelWeekdays', 'deleteLabel', 'createTemplate', 'renameTemplate',
    'setTemplateLabel', 'setDefaultTemplate', 'deleteTemplate', 'addItem', 'updateItem', 'deleteItem',
    'nowView', 'fullDayView', 'journalByDay', 'progress', 'dotStrip', 'guessTemplate', 'positionAt', 'lastDone',
    'dayKeyOf', 'toDayMinutes', 'formatDayMinutes',
  ];
  for (const name of names) {
    expect(domain[name], name).toBeDefined();
  }
});
