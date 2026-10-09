import type { WatodoStore } from './store';
import { addBasicDayTemplate } from './basicDay';
import { TABLE, VALUE } from './schema';
import { addLabel, setDefaultTemplate, setLabelWeekdays } from './templates';

export type SetupState = 'new' | 'customising' | 'done';

export function setupState(store: WatodoStore): SetupState {
  if (store.getValue(VALUE.setupFinished) === true) return 'done';
  return store.getRowCount(TABLE.templates) > 0 ? 'customising' : 'new';
}

/** Creates the basic day: a "Work day" label (Mon to Fri) with the "Basic day" template as default. */
export function setUpStarter(store: WatodoStore): void {
  if (setupState(store) !== 'new') return;
  store.transaction(() => {
    const labelId = addLabel(store, 'Work day');
    setLabelWeekdays(store, labelId, [0, 1, 2, 3, 4]);
    const templateId = addBasicDayTemplate(store, labelId);
    setDefaultTemplate(store, templateId);
  });
}

export function finishSetup(store: WatodoStore): void {
  store.setValue(VALUE.setupFinished, true);
}
