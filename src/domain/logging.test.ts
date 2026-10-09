import { expect, test } from 'vitest';
import {
  addPastEntry, confirmDay, deleteEntry, editEntry, endStepEarly, logActivity, setDayNote, undoLast,
  type LogResult, type PendingLog,
} from './logging';
import { nowView, journalByDay, toDayMinutes, type Id } from './rules';
import { readSnapshot } from './store';
import { addItem, createTemplate } from './templates';
import { at, basicDay } from './testing';

function pendingOf(result: LogResult): PendingLog {
  if (result.status !== 'needs-template') throw new Error(`expected needs-template, got ${result.status}`);
  return result.pending;
}

function loggedIdOf(result: LogResult): Id {
  if (result.status !== 'logged') throw new Error(`expected logged, got ${result.status}`);
  return result.entryId;
}

test('the first log of the day asks which template, the answer logs it, later logs do not ask', () => {
  const { store, templateId, sectionId, activityId } = basicDay();
  let now = at(17, 45);
  const clock = () => now;

  const first = logActivity(store, clock, activityId('Gym'));
  expect(first).toEqual({
    status: 'needs-template',
    pending: { activityId: activityId('Gym'), sectionId: sectionId('Post work') },
    guessTemplateId: templateId,
  });
  expect(readSnapshot(store).journal).toHaveLength(0);

  const entryId = confirmDay(store, clock, templateId, pendingOf(first));
  expect(entryId).toEqual(expect.any(String));
  const snap = readSnapshot(store);
  expect(snap.journal).toEqual([
    expect.objectContaining({ id: entryId, activityId: activityId('Gym'), sectionId: sectionId('Post work') }),
  ]);
  expect(nowView(snap, now).guess).toMatchObject({ templateId, confirmed: true, reason: 'confirmed' });

  expect(logActivity(store, clock, activityId('Walk'))).toMatchObject({ status: 'logged' });
  expect(readSnapshot(store).journal).toHaveLength(2);
});

test('confirming without a pending log writes no entry and returns null', () => {
  const { store, templateId } = basicDay();
  const clock = () => at(17, 45);
  expect(confirmDay(store, clock, templateId)).toBeNull();
  expect(readSnapshot(store).journal).toHaveLength(0);
});

test('logging during a fixed step, or an activity not listed in the slot, is not available', () => {
  const { store, activityId } = basicDay();
  let now = at(10, 0);
  const clock = () => now;
  expect(logActivity(store, clock, activityId('Gym'))).toEqual({ status: 'not-available' });

  now = at(17, 45);
  expect(logActivity(store, clock, activityId('Journal'))).toEqual({ status: 'not-available' });
  expect(readSnapshot(store).journal).toHaveLength(0);
});

test('ending a fixed step early starts the next slot early, without confirming a template', () => {
  const { store } = basicDay();
  const now = at(16, 0);
  const clock = () => now;

  expect(endStepEarly(store, clock)).toBe(true);
  const view = nowView(readSnapshot(store), now);
  expect(view.guess.confirmed).toBe(false);
  expect(view.position).toMatchObject({ kind: 'slot', early: true, item: { name: 'Post work' } });
});

test('ending a step early after the last slot does nothing', () => {
  const { store } = basicDay();
  const clock = () => at(23, 30);
  expect(endStepEarly(store, clock)).toBe(false);
});

test('confirming a template without the early item clears the early start', () => {
  const { store, labelId } = basicDay();
  const empty = createTemplate(store, { name: 'Empty', labelId });
  let now = at(16, 0);
  const clock = () => now;
  endStepEarly(store, clock);

  confirmDay(store, clock, empty);
  now = at(16, 0);
  expect(readSnapshot(store).days[0].earlyItemId).toBeUndefined();
  expect(nowView(readSnapshot(store), now).position).toMatchObject({ kind: 'gap' });
});

test('undo removes only the latest entry logged today and the day stays confirmed', () => {
  const { store, templateId, activityId, sectionId } = basicDay();
  let now = at(17, 45);
  const clock = () => now;
  confirmDay(store, clock, templateId, { activityId: activityId('Gym'), sectionId: sectionId('Post work') });

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
  addPastEntry(store, { activityId: activityId('Gym'), sectionId: sectionId('Post work'), at: at(19, 0, -1) });

  expect(undoLast(store, clock)).toBeNull();
  expect(readSnapshot(store).journal).toHaveLength(1);
});

test('a log at 00:15 belongs to the previous day, so the template is not asked again', () => {
  const { store, templateId, activityId, sectionId } = basicDay();
  // The basic day has no slot at 00:15, so this test adds a late one.
  addItem(store, templateId, {
    kind: 'slot', name: 'Late', start: toDayMinutes('23:30'), end: toDayMinutes('00:30'), sectionId: sectionId('Bedtime'),
  });
  let now = at(17, 45);
  const clock = () => now;
  confirmDay(store, clock, templateId, { activityId: activityId('Gym'), sectionId: sectionId('Post work') });

  now = at(0, 15, 1);
  expect(logActivity(store, clock, activityId('Stretch'))).toMatchObject({ status: 'logged' });
  expect(journalByDay(readSnapshot(store)).map(day => [day.day, day.entries.length])).toEqual([['2026-10-12', 2]]);
});

test('a past entry shows under its own day and can be edited and deleted', () => {
  const { store, activityId, sectionId } = basicDay();
  const id = addPastEntry(store, { activityId: activityId('Gym'), sectionId: sectionId('Post work'), at: at(19, 30, -3) });
  expect(journalByDay(readSnapshot(store)).map(day => day.day)).toEqual(['2026-10-09']);

  editEntry(store, id, { at: at(20, 0, -3), note: 'legs', durationMinutes: 45 });
  expect(readSnapshot(store).journal[0]).toMatchObject({
    id, loggedAt: at(20, 0, -3).getTime(), note: 'legs', durationMinutes: 45,
  });

  editEntry(store, id, { note: '', durationMinutes: null });
  const edited = readSnapshot(store).journal[0];
  expect(edited.note).toBeUndefined();
  expect(edited.durationMinutes).toBeUndefined();

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
