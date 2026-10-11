import { expect, test } from 'vitest';
import {
  addPastEntry, confirmDay, deleteEntry, editEntry, goToSlot, logActivity, setDayNote, undoLast,
  type LogResult, type PendingLog,
} from './logging';
import { setActivityCommitted } from './menu';
import { journalByDay, nowView, noonOf, type Id } from './rules';
import { readSnapshot } from './store';
import { saveTemplate } from './templates';
import { at, basicDay } from './testing';

function pendingOf(result: LogResult): PendingLog {
  if (result.status !== 'needs-template') throw new Error(`expected needs-template, got ${result.status}`);
  return result.pending;
}

function loggedIdOf(result: LogResult): Id {
  if (result.status !== 'logged') throw new Error(`expected logged, got ${result.status}`);
  return result.entryId;
}

test('the first log of the day asks which template, the answer logs it in its slot, later logs do not ask', () => {
  const { store, templateId, sectionId, activityId, itemId } = basicDay();
  let now = at(17, 45);
  const clock = () => now;

  const first = logActivity(store, clock, activityId('Gym'));
  expect(first).toEqual({
    status: 'needs-template',
    pending: { activityId: activityId('Gym'), sectionId: sectionId('Post work'), itemId: itemId('Post work') },
    guessTemplateId: templateId,
  });
  expect(readSnapshot(store).journal).toHaveLength(0);

  const entryId = confirmDay(store, clock, templateId, pendingOf(first));
  expect(entryId).toEqual(expect.any(String));
  const snap = readSnapshot(store);
  expect(snap.journal).toEqual([
    expect.objectContaining({
      id: entryId, activityId: activityId('Gym'), sectionId: sectionId('Post work'), itemId: itemId('Post work'),
    }),
  ]);
  expect(nowView(snap, now).guess).toMatchObject({ templateId, confirmed: true, reason: 'confirmed' });

  now = at(17, 50);
  expect(logActivity(store, clock, activityId('Walk'))).toMatchObject({ status: 'logged' });
  const snapAfter = readSnapshot(store);
  expect(snapAfter.journal).toHaveLength(2);
  expect(snapAfter.journal[1]).toMatchObject({ activityId: activityId('Walk'), itemId: itemId('Post work') });
});

test('confirming without a pending log writes no entry and returns null', () => {
  const { store, templateId } = basicDay();
  const clock = () => at(17, 45);
  expect(confirmDay(store, clock, templateId)).toBeNull();
  expect(readSnapshot(store).journal).toHaveLength(0);
});

test('an activity not listed in the current slot, or a template with no slots, is not available', () => {
  const { store, activityId, labelId, templateId } = basicDay();
  const clock = () => at(17, 45);
  confirmDay(store, clock, templateId);
  expect(logActivity(store, clock, activityId('Journal'))).toEqual({ status: 'not-available' });
  expect(readSnapshot(store).journal).toHaveLength(0);

  const empty = saveTemplate(store, { name: 'Empty', label: { id: labelId }, steps: [] });
  confirmDay(store, clock, empty);
  expect(logActivity(store, clock, activityId('Gym'))).toEqual({ status: 'not-available' });
});

test('the current slot follows the last log: it stays for an hour, then moves to the next slot', () => {
  const { store, templateId, activityId, itemId } = basicDay();
  let now = at(17, 45);
  const clock = () => now;
  const first = logActivity(store, clock, activityId('Gym'));
  confirmDay(store, clock, templateId, pendingOf(first));

  now = at(18, 0);
  expect(nowView(readSnapshot(store), now).position)
    .toMatchObject({ reason: 'stayed', item: { name: 'Post work' } });

  now = at(19, 30);
  expect(nowView(readSnapshot(store), now).position)
    .toMatchObject({ reason: 'advanced', item: { name: 'Post dinner' } });
  expect(logActivity(store, clock, activityId('Guitar'))).toMatchObject({ status: 'logged' });
  expect(readSnapshot(store).journal.at(-1))
    .toMatchObject({ activityId: activityId('Guitar'), itemId: itemId('Post dinner') });

  expect(logActivity(store, clock, activityId('Gym'))).toEqual({ status: 'not-available' });
});

test('goToSlot makes that slot current with reason chosen, and a later log in it keeps it there', () => {
  const { store, templateId, activityId, itemId } = basicDay();
  let now = at(17, 45);
  const clock = () => now;
  confirmDay(store, clock, templateId);

  now = at(20, 0);
  goToSlot(store, clock, itemId('Bedtime'));
  expect(nowView(readSnapshot(store), now).position)
    .toMatchObject({ reason: 'chosen', item: { name: 'Bedtime' } });

  now = at(20, 5);
  expect(logActivity(store, clock, activityId('Journal'))).toMatchObject({ status: 'logged' });

  now = at(20, 10);
  expect(nowView(readSnapshot(store), now).position)
    .toMatchObject({ reason: 'stayed', item: { name: 'Bedtime' } });
});

test('goToSlot records the choice for today without confirming a template', () => {
  const { store, itemId } = basicDay();
  const now = at(20, 0);
  goToSlot(store, () => now, itemId('Bedtime'));

  const snap = readSnapshot(store);
  expect(snap.days).toEqual([{ day: '2026-10-12', chosenItemId: itemId('Bedtime'), chosenAt: now.getTime() }]);
  expect(nowView(snap, now).guess.confirmed).toBe(false);
});

test('goToSlot ignores a fixed step and an unknown id', () => {
  const { store, templateId, itemId } = basicDay();
  const now = at(20, 0);
  const clock = () => now;
  confirmDay(store, clock, templateId);
  goToSlot(store, clock, itemId('Post dinner'));
  const before = readSnapshot(store).days;

  goToSlot(store, clock, itemId('Work'));
  goToSlot(store, clock, 'no-such-item');

  expect(readSnapshot(store).days).toEqual(before);
  expect(nowView(readSnapshot(store), now).position)
    .toMatchObject({ reason: 'chosen', item: { name: 'Post dinner' } });
});

test('confirming a different template clears a chosen slot that belongs to the old one', () => {
  const { store, templateId, labelId, itemId } = basicDay();
  const clock = () => at(18, 0);
  confirmDay(store, clock, templateId);
  goToSlot(store, clock, itemId('Bedtime'));

  confirmDay(store, clock, templateId);
  expect(readSnapshot(store).days[0].chosenItemId).toBe(itemId('Bedtime'));

  const short = saveTemplate(store, { name: 'Short', label: { id: labelId }, steps: [] });
  confirmDay(store, clock, short);
  expect(readSnapshot(store).days).toEqual([{ day: '2026-10-12', templateId: short }]);
});

test('undo removes only the latest entry logged today and the day stays confirmed', () => {
  const { store, templateId, activityId, sectionId, itemId } = basicDay();
  let now = at(17, 45);
  const clock = () => now;
  confirmDay(store, clock, templateId, {
    activityId: activityId('Gym'), sectionId: sectionId('Post work'), itemId: itemId('Post work'),
  });

  now = at(18, 0);
  const walkId = loggedIdOf(logActivity(store, clock, activityId('Walk')));

  now = at(18, 5);
  expect(undoLast(store, clock)).toBe(walkId);
  const snap = readSnapshot(store);
  expect(snap.journal.map(entry => entry.activityId)).toEqual([activityId('Gym')]);
  expect(nowView(snap, now).guess.confirmed).toBe(true);
});

test('undo returns null when nothing was logged today', () => {
  const { store, activityId, sectionId } = basicDay();
  const clock = () => at(17, 45);
  addPastEntry(store, { activityId: activityId('Gym'), sectionId: sectionId('Post work'), day: '2026-10-11' });

  expect(undoLast(store, clock)).toBeNull();
  expect(readSnapshot(store).journal).toHaveLength(1);
});

test('a log at 00:15 belongs to the previous day, so the template is not asked again', () => {
  const { store, templateId, activityId, sectionId, itemId } = basicDay();
  let now = at(17, 45);
  const clock = () => now;
  confirmDay(store, clock, templateId, {
    activityId: activityId('Gym'), sectionId: sectionId('Post work'), itemId: itemId('Post work'),
  });

  now = at(0, 15, 1);
  // Gym was the last log of the 12th, so the next slot is Post dinner.
  expect(logActivity(store, clock, activityId('Guitar'))).toMatchObject({ status: 'logged' });
  expect(journalByDay(readSnapshot(store)).map(day => [day.day, day.entries.length])).toEqual([['2026-10-12', 2]]);
});

test('a past entry lands on its day, and a second one on that day comes after the first', () => {
  const { store, activityId, sectionId } = basicDay();
  const gym = { activityId: activityId('Gym'), sectionId: sectionId('Post work') };
  const first = addPastEntry(store, { ...gym, day: '2026-10-09', note: 'legs', durationMinutes: 45 });
  const second = addPastEntry(store, { ...gym, day: '2026-10-09' });

  const days = journalByDay(readSnapshot(store));
  expect(days.map(day => day.day)).toEqual(['2026-10-09']);
  expect(days[0].entries.map(entry => entry.id)).toEqual([first, second]);
  expect(days[0].entries[0].loggedAt).toBe(noonOf('2026-10-09').getTime());
  expect(days[0].entries[1].loggedAt).toBe(noonOf('2026-10-09').getTime() + 60_000);
  expect(days[0].entries[0]).toMatchObject({ note: 'legs', durationMinutes: 45 });
  expect(days[0].entries[0]).not.toHaveProperty('itemId');
});

test('a past entry for a day comes after that day\'s late-night logs, which belong to the day before', () => {
  const { store, templateId, activityId, sectionId, itemId } = basicDay();
  let now = at(17, 45);
  const clock = () => now;
  confirmDay(store, clock, templateId, {
    activityId: activityId('Gym'), sectionId: sectionId('Post work'), itemId: itemId('Post work'),
  });
  now = at(0, 15, 1);
  logActivity(store, clock, activityId('Guitar'));

  addPastEntry(store, { activityId: activityId('Walk'), sectionId: sectionId('Post work'), day: '2026-10-12' });

  const [day] = journalByDay(readSnapshot(store));
  expect(day.day).toBe('2026-10-12');
  expect(day.entries.at(-1)?.loggedAt).toBe(at(0, 16, 1).getTime());
});

test('editEntry sets and clears the note and the duration of an entry', () => {
  const { store, activityId, sectionId } = basicDay();
  const id = addPastEntry(store, { activityId: activityId('Gym'), sectionId: sectionId('Post work'), day: '2026-10-09' });

  editEntry(store, id, { note: 'legs', durationMinutes: 45 });
  expect(readSnapshot(store).journal[0]).toMatchObject({ id, note: 'legs', durationMinutes: 45 });

  editEntry(store, id, { note: '', durationMinutes: null });
  const cleared = readSnapshot(store).journal[0];
  expect(cleared.note).toBeUndefined();
  expect(cleared.durationMinutes).toBeUndefined();
});

test('deleteEntry removes a past entry', () => {
  const { store, activityId, sectionId } = basicDay();
  const id = addPastEntry(store, { activityId: activityId('Gym'), sectionId: sectionId('Post work'), day: '2026-10-09' });
  deleteEntry(store, id);
  expect(readSnapshot(store).journal).toEqual([]);
});

test('setDayNote sets and clears a day note', () => {
  const { store } = basicDay();
  setDayNote(store, '2026-10-12', 'slow start');
  expect(readSnapshot(store).days).toEqual([{ day: '2026-10-12', note: 'slow start' }]);
  expect(journalByDay(readSnapshot(store))[0].note).toBe('slow start');

  setDayNote(store, '2026-10-12', '');
  expect(readSnapshot(store).days).toEqual([]);
});

describe('committed activities', () => {
  test('logging a committed activity writes committed true, and the next view is on Post dinner', () => {
    const { store, templateId, activityId, itemId } = basicDay();
    setActivityCommitted(store, activityId('Gym'), true);
    const clock = () => at(17, 45);
    confirmDay(store, clock, templateId);

    const entryId = loggedIdOf(logActivity(store, clock, activityId('Gym')));

    const snap = readSnapshot(store);
    expect(snap.journal).toEqual([
      expect.objectContaining({ id: entryId, activityId: activityId('Gym'), itemId: itemId('Post work'), committed: true }),
    ]);
    expect(nowView(snap, at(17, 46)).position).toEqual({
      item: expect.objectContaining({ name: 'Post dinner' }), reason: 'advanced', spentBy: null,
    });
  });

  test('once the slot is spent, a log for another Post work activity is not available, nor is any log after goToSlot to it', () => {
    const { store, templateId, activityId, itemId } = basicDay();
    setActivityCommitted(store, activityId('Gym'), true);
    let now = at(17, 45);
    const clock = () => now;
    confirmDay(store, clock, templateId);
    loggedIdOf(logActivity(store, clock, activityId('Gym')));

    now = at(17, 50);
    expect(logActivity(store, clock, activityId('Walk'))).toEqual({ status: 'not-available' });
    expect(readSnapshot(store).journal).toHaveLength(1);

    goToSlot(store, clock, itemId('Post work'));
    expect(logActivity(store, clock, activityId('Walk'))).toEqual({ status: 'not-available' });
    expect(logActivity(store, clock, activityId('Gym'))).toEqual({ status: 'not-available' });
    expect(readSnapshot(store).journal).toHaveLength(1);
  });

  test('when every slot is spent, nothing is available', () => {
    const { store, templateId, activityId } = basicDay();
    for (const name of ['Gym', 'Guitar', 'Journal']) setActivityCommitted(store, activityId(name), true);
    let now = at(17, 45);
    const clock = () => now;
    confirmDay(store, clock, templateId);
    loggedIdOf(logActivity(store, clock, activityId('Gym')));
    now = at(19, 45);
    loggedIdOf(logActivity(store, clock, activityId('Guitar')));
    now = at(21, 45);
    loggedIdOf(logActivity(store, clock, activityId('Journal')));

    now = at(22, 0);
    expect(logActivity(store, clock, activityId('Read'))).toEqual({ status: 'not-available' });
    expect(nowView(readSnapshot(store), now).dayDone).toBe(true);
  });

  test('a quick activity writes no committed cell', () => {
    const { store, templateId, activityId } = basicDay();
    const clock = () => at(17, 45);
    confirmDay(store, clock, templateId);

    const entryId = loggedIdOf(logActivity(store, clock, activityId('Walk')));

    expect(store.hasCell('journal', entryId, 'committed')).toBe(false);
    expect(readSnapshot(store).journal[0]).not.toHaveProperty('committed');
  });

  test('the first log of a day, answered with confirmDay, also writes committed true', () => {
    const { store, templateId, activityId } = basicDay();
    setActivityCommitted(store, activityId('Gym'), true);
    const clock = () => at(17, 45);

    const first = logActivity(store, clock, activityId('Gym'));
    const entryId = confirmDay(store, clock, templateId, pendingOf(first));

    expect(readSnapshot(store).journal).toEqual([expect.objectContaining({ id: entryId, committed: true })]);
    expect(nowView(readSnapshot(store), at(17, 46)).positionName).toBe('Post dinner');
  });

  test('marking an activity committed after logging it does not spend the slot retroactively', () => {
    const { store, templateId, activityId } = basicDay();
    const clock = () => at(17, 45);
    confirmDay(store, clock, templateId);
    loggedIdOf(logActivity(store, clock, activityId('Gym')));

    setActivityCommitted(store, activityId('Gym'), true);

    const snap = readSnapshot(store);
    expect(snap.journal[0]).not.toHaveProperty('committed');
    const view = nowView(snap, at(17, 50));
    expect(view.slots[0].spentBy).toBeNull();
    expect(view.position).toEqual({ item: expect.objectContaining({ name: 'Post work' }), reason: 'stayed', spentBy: null });
  });

  test('a committed entry still spends its slot after the activity is un-marked', () => {
    const { store, templateId, activityId } = basicDay();
    setActivityCommitted(store, activityId('Gym'), true);
    const clock = () => at(17, 45);
    confirmDay(store, clock, templateId);
    loggedIdOf(logActivity(store, clock, activityId('Gym')));

    setActivityCommitted(store, activityId('Gym'), false);

    const view = nowView(readSnapshot(store), at(17, 50));
    expect(view.slots[0].spentBy?.activityName).toBe('Gym');
    expect(view.positionName).toBe('Post dinner');
  });

  test('deleting the committed entry reopens its slot, which can be logged in again', () => {
    const { store, templateId, activityId } = basicDay();
    setActivityCommitted(store, activityId('Gym'), true);
    const clock = () => at(17, 45);
    confirmDay(store, clock, templateId);
    const entryId = loggedIdOf(logActivity(store, clock, activityId('Gym')));

    deleteEntry(store, entryId);

    const view = nowView(readSnapshot(store), at(17, 50));
    expect(view.slots[0].spentBy).toBeNull();
    expect(view.position).toMatchObject({ reason: 'first', item: { name: 'Post work' } });
    expect(logActivity(store, clock, activityId('Walk'))).toMatchObject({ status: 'logged' });
  });

  test('a past entry for a committed activity does not spend a slot', () => {
    const { store, templateId, activityId, sectionId } = basicDay();
    setActivityCommitted(store, activityId('Gym'), true);
    const clock = () => at(17, 45);
    confirmDay(store, clock, templateId);

    const entryId = addPastEntry(store, {
      activityId: activityId('Gym'), sectionId: sectionId('Post work'), day: '2026-10-12',
    });

    expect(store.hasCell('journal', entryId, 'committed')).toBe(false);
    expect(nowView(readSnapshot(store), at(17, 50)).slots[0].spentBy).toBeNull();
  });
});
