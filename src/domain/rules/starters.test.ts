import { describe, expect, test } from 'vitest'
import {
  STARTERS, SUGGESTED_ACTIVITIES, blankDraft, draftFromStarter, draftFromTemplate, moveStep,
} from './starters'
import type { DraftStep, Label, Snapshot, Template, TemplateItem } from './types'

function snap(parts: Partial<Snapshot> = {}): Snapshot {
  return {
    labels: [], templates: [], items: [], sections: [], activities: [],
    listings: [], journal: [], days: [], defaultTemplateId: null,
    ...parts,
  }
}

const F = (name: string) => ({ kind: 'fixed' as const, name })
const S = (slotName: string) => ({ kind: 'slot' as const, slotName })

describe('STARTERS', () => {
  test('has the five starters in order, with their names and labels', () => {
    expect(STARTERS.map(starter => starter.key)).toEqual(['office', 'wfh', 'school', 'weekend', 'dayoff'])
    expect(STARTERS.map(({ name, labelName, labelWeekdays }) => [name, labelName, labelWeekdays])).toEqual([
      ['Office day', 'Work day', [0, 1, 2, 3, 4]],
      ['Work from home', 'Work day', [0, 1, 2, 3, 4]],
      ['School day', 'School day', []],
      ['Weekend', 'Weekend', [5, 6]],
      ['Day off', 'Day off', []],
    ])
  })

  test('each starter has the agreed steps', () => {
    const stepsOf = (key: string) => STARTERS.find(starter => starter.key === key)?.steps
    expect(stepsOf('office')).toEqual([
      F('Morning routine'), F('Commute'), F('Work'), S('Post work'), F('Dinner'), S('Post dinner'), S('Bedtime'),
    ])
    expect(stepsOf('wfh')).toEqual([
      F('Morning routine'), F('Work'), S('Lunch break'), F('Work'), S('Post work'), F('Dinner'), S('Post dinner'), S('Bedtime'),
    ])
    expect(stepsOf('school')).toEqual([
      F('Morning routine'), F('School'), S('After school'), F('Dinner'), F('Homework'), S('Post dinner'), S('Bedtime'),
    ])
    expect(stepsOf('weekend')).toEqual([
      F('Morning routine'), S('Free time'), F('Lunch'), S('Free time'), F('Dinner'), S('Post dinner'), S('Bedtime'),
    ])
    expect(stepsOf('dayoff')).toEqual([
      F('Morning routine'), S('Free time'), F('Dinner'), S('Post dinner'), S('Bedtime'),
    ])
  })
})

describe('SUGGESTED_ACTIVITIES', () => {
  test('suggests activities for each slot name the starters use', () => {
    expect(SUGGESTED_ACTIVITIES).toEqual({
      'Post work': ['Gym', 'Walk', 'Read'],
      'Post dinner': ['Guitar', 'Call family', 'Read'],
      'Bedtime': ['Journal', 'Stretch', 'Read'],
      'Lunch break': ['Walk', 'Read'],
      'After school': ['Sports', 'Walk', 'Read'],
      'Free time': ['Hike', 'Cook something new', 'Read', 'Call family'],
    })
  })
})

describe('draftFromStarter', () => {
  test('on an empty snapshot the label is new, named and weekdayed by the starter', () => {
    expect(draftFromStarter(snap(), 'office')).toStrictEqual({
      name: 'Office day',
      label: { newName: 'Work day', weekdays: [0, 1, 2, 3, 4] },
      steps: STARTERS[0].steps,
    });
  })

  test('an existing label with the same name, in any case, is used by id', () => {
    const work: Label = { id: 'work', name: 'work day', weekdays: [0, 1, 2, 3, 4], position: 0 };
    const draft = draftFromStarter(snap({ labels: [work] }), 'wfh');
    expect(draft?.label).toEqual({ id: 'work' });
    expect(draft?.name).toBe('Work from home');
  })

  test('the steps are copies with no item ids and no template id', () => {
    const draft = draftFromStarter(snap(), 'weekend');
    expect(draft).not.toHaveProperty('templateId');
    expect(draft?.steps.every(step => !('itemId' in step))).toBe(true);
    expect(draft?.steps).not.toBe(STARTERS[3].steps);
  })

  test('an unknown key gives null', () => {
    expect(draftFromStarter(snap(), 'nope')).toBeNull();
  })
})

describe('draftFromTemplate', () => {
  const work: Label = { id: 'work', name: 'Work day', weekdays: [0, 1, 2, 3, 4], position: 0 };
  const basic: Template = { id: 'basic', name: 'Basic day', labelId: 'work', position: 0 };
  const items: TemplateItem[] = [
    { id: 'morning', templateId: 'basic', kind: 'fixed', name: 'Morning', position: 0 },
    { id: 'postWork', templateId: 'basic', kind: 'slot', name: 'Post work', position: 1, sectionId: 'postWork' },
    { id: 'dinner', templateId: 'basic', kind: 'fixed', name: 'Dinner', position: 2 },
  ];
  const basicSnap = snap({
    labels: [work],
    templates: [basic],
    items,
    sections: [{ id: 'postWork', name: 'Post work', position: 0 }],
  });

  test('edit mode keeps the template id and each step\'s item id, with slots named by their section', () => {
    expect(draftFromTemplate(basicSnap, 'basic', 'edit')).toStrictEqual({
      templateId: 'basic',
      name: 'Basic day',
      label: { id: 'work' },
      steps: [
        { kind: 'fixed', name: 'Morning', itemId: 'morning' },
        { kind: 'slot', slotName: 'Post work', itemId: 'postWork' },
        { kind: 'fixed', name: 'Dinner', itemId: 'dinner' },
      ],
    });
  })

  test('copy mode has no template id and no item ids, and the name gets " copy"', () => {
    expect(draftFromTemplate(basicSnap, 'basic', 'copy')).toStrictEqual({
      name: 'Basic day copy',
      label: { id: 'work' },
      steps: [
        { kind: 'fixed', name: 'Morning' },
        { kind: 'slot', slotName: 'Post work' },
        { kind: 'fixed', name: 'Dinner' },
      ],
    });
  })

  test('an unknown template gives null', () => {
    expect(draftFromTemplate(basicSnap, 'gone', 'edit')).toBeNull();
    expect(draftFromTemplate(basicSnap, 'gone', 'copy')).toBeNull();
  })
})

describe('blankDraft', () => {
  test('with no labels, a new Work day label Monday to Friday', () => {
    expect(blankDraft(snap())).toStrictEqual({
      name: 'New template',
      label: { newName: 'Work day', weekdays: [0, 1, 2, 3, 4] },
      steps: [],
    });
  })

  test('with labels, the first one by position, by id', () => {
    const weekend: Label = { id: 'weekend', name: 'Weekend', weekdays: [5, 6], position: 1 };
    const work: Label = { id: 'work', name: 'Work day', weekdays: [0, 1, 2, 3, 4], position: 0 };
    expect(blankDraft(snap({ labels: [weekend, work] }))).toStrictEqual({
      name: 'New template',
      label: { id: 'work' },
      steps: [],
    });
  })
})

describe('moveStep', () => {
  const a: DraftStep = { kind: 'fixed', name: 'a' };
  const b: DraftStep = { kind: 'slot', slotName: 'b' };
  const c: DraftStep = { kind: 'fixed', name: 'c' };

  test('moves a step forward and backward', () => {
    expect(moveStep([a, b, c], 0, 2)).toEqual([b, c, a]);
    expect(moveStep([a, b, c], 2, 0)).toEqual([c, a, b]);
    expect(moveStep([a, b, c], 1, 1)).toEqual([a, b, c]);
  })

  test('an out-of-range move returns an unchanged copy', () => {
    const steps = [a, b, c];
    for (const [from, to] of [[0, 3], [3, 0], [-1, 0], [0, -1], [1.5, 0]]) {
      const moved = moveStep(steps, from, to);
      expect(moved).toEqual([a, b, c]);
      expect(moved).not.toBe(steps);
    }
  })

  test('does not mutate its input', () => {
    const steps = [a, b, c];
    moveStep(steps, 0, 2);
    expect(steps).toEqual([a, b, c]);
  })
})
