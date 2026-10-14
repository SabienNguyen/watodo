# watodo phase 1 plan

Spec: `docs/spec.md`. One task per executor. Each task is test-first: write a failing test, implement, all tests green. Contracts below are pinned: file paths, exported names and signatures must match exactly.

Commands (after Task 1): `npm test` (Vitest, run once), `npm run typecheck` (`tsc -b --noEmit` or equivalent), `npm run build`, `npm run dev`.

Do not create git commits.

## Shared contracts

### `src/domain/rules/types.ts`

```ts
export type Id = string;
/** 'YYYY-MM-DD'. The day a moment belongs to; days run 04:00 to 04:00 local time. */
export type DayKey = string;
/** Minutes since that day's local midnight: 240 (04:00) up to 1679 (03:59 next morning). */
export type DayMinutes = number;

export interface Label { id: Id; name: string; weekdays: number[]; position: number } // weekdays: 0=Mon .. 6=Sun
export interface Template { id: Id; name: string; labelId: Id; position: number }
export interface TemplateItem {
  id: Id; templateId: Id; kind: 'fixed' | 'slot'; name: string;
  start: DayMinutes; end: DayMinutes; sectionId?: Id; // sectionId only on slots
}
export interface Section { id: Id; name: string; position: number }
export interface Activity { id: Id; name: string }
export interface Listing { sectionId: Id; activityId: Id; position: number }
export interface JournalEntry {
  id: Id; activityId: Id; sectionId: Id; loggedAt: number; // epoch ms
  note?: string; durationMinutes?: number;
}
/** One row per day that has been touched. Confirmed means templateId is set. */
export interface DayRecord { day: DayKey; templateId?: Id; earlyItemId?: Id; note?: string }

export interface Snapshot {
  labels: Label[]; templates: Template[]; items: TemplateItem[];
  sections: Section[]; activities: Activity[]; listings: Listing[];
  journal: JournalEntry[]; days: DayRecord[]; defaultTemplateId: Id | null;
}
```

Arrays in a `Snapshot` are sorted by `position` where the type has one.

### `src/domain/rules/dayRollover.ts`

```ts
export const DAY_START_MINUTES = 240;
export function dayKeyOf(at: Date): DayKey;            // local time; 00:15 on the 13th -> the 12th
export function dayMinutesOf(at: Date): DayMinutes;    // 00:15 -> 1455; 17:45 -> 1065
export function weekdayOf(day: DayKey): number;        // 0=Mon .. 6=Sun
export function addDays(day: DayKey, n: number): DayKey;
export function dateFromDay(day: DayKey, minutes: DayMinutes): Date; // inverse of the two above
export function toDayMinutes(hhmm: string): DayMinutes;   // '17:30' -> 1050; '00:30' -> 1470
export function formatDayMinutes(m: DayMinutes): string;  // 1050 -> '17:30'; 1470 -> '00:30'
```

### `src/domain/rules/guess.ts`

```ts
export interface TemplateGuess {
  templateId: Id | null;                 // null only when there are no templates at all
  confirmed: boolean;
  reason: 'confirmed' | 'label' | 'label-empty' | 'default';
  labelId?: Id;                          // set for 'label' and 'label-empty'
}
export function guessTemplate(snap: Snapshot, day: DayKey): TemplateGuess;
```

Order: (1) a `DayRecord` for `day` whose `templateId` names an existing template -> `confirmed`. (2) the first label (by position) whose `weekdays` include `weekdayOf(day)`: among templates with that `labelId`, the one whose most recent confirmed `DayRecord` (any day other than `day`) is latest; if none of them was ever confirmed, the lowest `position` -> `label`. (3) that label has no templates -> `defaultTemplateId`, `label-empty`. (4) no label covers the weekday -> `defaultTemplateId`, `default`.

### `src/domain/rules/currentSlot.ts`

```ts
export type Position =
  | { kind: 'slot'; item: TemplateItem; early: boolean }
  | { kind: 'fixed'; item: TemplateItem; next: TemplateItem | null }
  | { kind: 'gap'; next: TemplateItem | null };
export function itemsOf(snap: Snapshot, templateId: Id): TemplateItem[]; // sorted by start
export function positionAt(items: TemplateItem[], minutes: DayMinutes, earlyItemId?: Id): Position;
```

`positionAt`: if `earlyItemId` names a slot in `items` and `minutes < that.end`, return that slot with `early: minutes < that.start`. Otherwise the item with `start <= minutes < end`: a slot -> `slot` (`early: false`); a fixed step -> `fixed`. No item -> `gap`. `next` is the first slot with `start > minutes`, or `null`.

### `src/domain/rules/lastDone.ts`

```ts
export function lastDone(journal: JournalEntry[], activityId: Id): JournalEntry | null; // greatest loggedAt
```

### `src/domain/rules/views.ts`

```ts
export interface NowView {
  day: DayKey; minutes: DayMinutes;
  guess: TemplateGuess; template: Template | null;
  position: Position | null;                                     // null when there is no template
  activities: { activity: Activity; lastDone: JournalEntry | null }[]; // listing order; empty unless in a slot
}
export function nowView(snap: Snapshot, at: Date): NowView;

export interface FullDayView {
  template: Template | null;
  items: { item: TemplateItem; current: boolean; activities: Activity[] }[]; // activities empty for fixed steps
}
export function fullDayView(snap: Snapshot, at: Date): FullDayView;

export interface JournalDay { day: DayKey; templateId: Id | null; note: string; entries: JournalEntry[] }
export function journalByDay(snap: Snapshot): JournalDay[];      // newest day first; entries oldest first

export interface ProgressView {
  byActivity: { activityId: Id; count: number }[];               // count desc, zero counts omitted
  bySection: { sectionId: Id; count: number }[];
}
export function progress(snap: Snapshot, fromDay: DayKey, toDay: DayKey): ProgressView; // inclusive
export function dotStrip(snap: Snapshot, activityId: Id, endDay: DayKey, days?: number): boolean[]; // default 28, oldest first
export function sectionActivities(snap: Snapshot, sectionId: Id): Activity[]; // the section's activities in listing position order
```

`nowView` uses `guessTemplate`, then `positionAt(itemsOf(...), dayMinutesOf(at), dayRecord?.earlyItemId)`.

### `src/domain/` (the interface the UI uses, all re-exported from `src/domain/index.ts`, along with every type and function under `rules/`)

```ts
// clock.ts
export type Clock = () => Date;
export const systemClock: Clock;

// store.ts
import type { MergeableStore } from 'tinybase';
export type WatodoStore = MergeableStore;
export function createWatodoStore(): WatodoStore;
export function readSnapshot(store: WatodoStore): Snapshot;   // rows missing a required cell are skipped
export interface SnapshotSource { subscribe(listener: () => void): () => void; get(): Snapshot }
export function createSnapshotSource(store: WatodoStore): SnapshotSource; // get() returns the same object until the store changes

// setup.ts
export type SetupState = 'new' | 'customising' | 'done';
export function setupState(store: WatodoStore): SetupState;
export function setUpStarter(store: WatodoStore): void;       // 'new' -> 'customising'
export function finishSetup(store: WatodoStore): void;        // -> 'done'

// logging.ts
export interface PendingLog { activityId: Id; sectionId: Id }
export type LogResult =
  | { status: 'logged'; entryId: Id }
  | { status: 'needs-template'; pending: PendingLog; guessTemplateId: Id }
  | { status: 'not-available' };                              // not in a slot, or activity not listed in it
export function logActivity(store: WatodoStore, clock: Clock, activityId: Id): LogResult;
export function confirmDay(store: WatodoStore, clock: Clock, templateId: Id, pending?: PendingLog): Id | null; // entry id when pending was logged
export function undoLast(store: WatodoStore, clock: Clock): Id | null;   // deletes today's most recent entry
export function endStepEarly(store: WatodoStore, clock: Clock): boolean; // false when there is no later slot
export function deleteEntry(store: WatodoStore, entryId: Id): void;
export function addPastEntry(store: WatodoStore, input: { activityId: Id; sectionId: Id; at: Date; note?: string; durationMinutes?: number }): Id;
export function editEntry(store: WatodoStore, entryId: Id, patch: { at?: Date; note?: string; durationMinutes?: number | null }): void;
export function setDayNote(store: WatodoStore, day: DayKey, text: string): void;

// menu.ts
export function addSection(store: WatodoStore, name: string): Id;
export function renameSection(store: WatodoStore, id: Id, name: string): void;
export function deleteSection(store: WatodoStore, id: Id): void;          // also removes its listings
export function addActivityToSection(store: WatodoStore, sectionId: Id, name: string): Id; // reuses an activity with the same name, case-insensitive
export function removeActivityFromSection(store: WatodoStore, sectionId: Id, activityId: Id): void;
export function renameActivity(store: WatodoStore, id: Id, name: string): void;

// templates.ts
export function addLabel(store: WatodoStore, name: string): Id;
export function renameLabel(store: WatodoStore, id: Id, name: string): void;
export function setLabelWeekdays(store: WatodoStore, id: Id, weekdays: number[]): void;
export function deleteLabel(store: WatodoStore, id: Id): boolean;         // false, nothing deleted, when a template uses it
export function createTemplate(store: WatodoStore, input: { name: string; labelId: Id; copyFrom?: Id }): Id; // copies items when copyFrom is set
export function renameTemplate(store: WatodoStore, id: Id, name: string): void;
export function setTemplateLabel(store: WatodoStore, id: Id, labelId: Id): void;
export function setDefaultTemplate(store: WatodoStore, id: Id): void;
export type DeleteTemplateResult = 'deleted' | 'needs-new-default' | 'restored-basic';
export function deleteTemplate(store: WatodoStore, id: Id, newDefaultId?: Id): DeleteTemplateResult;
export function addItem(store: WatodoStore, templateId: Id, item: { kind: 'fixed' | 'slot'; name: string; start: DayMinutes; end: DayMinutes; sectionId?: Id }): Id;
export function updateItem(store: WatodoStore, itemId: Id, patch: Partial<{ kind: 'fixed' | 'slot'; name: string; start: DayMinutes; end: DayMinutes; sectionId: Id | null }>): void;
export function deleteItem(store: WatodoStore, itemId: Id): void;
```

`logActivity`: build `nowView(readSnapshot(store), clock())`. Not in a slot, or the activity is not listed in that slot's section -> `not-available`. Day not confirmed -> `needs-template` and nothing is written. Otherwise add a journal row with `loggedAt = clock().getTime()`.

`deleteTemplate`: deleting the default while other templates exist and no `newDefaultId` given -> `needs-new-default`, nothing deleted. Deleting the only template -> delete it, create the basic day template under the same label, make it the default, return `restored-basic`. Otherwise delete the template and its items (and set the default when `newDefaultId` is given) -> `deleted`.

The basic day (used by `setUpStarter` and `restored-basic`): label "Work day" (Mon to Fri); template "Basic day", the default; items: fixed "Wake up, brush teeth, get ready" 06:30-08:30, fixed "Work" 09:00-17:30, slot "Post work" 17:30-19:00, fixed "Dinner" 19:00-19:30, slot "Post dinner" 19:30-21:30, slot "Bedtime" 21:30-23:00; sections Post work (Gym, Walk, Read), Post dinner (Guitar, Call family, Read), Bedtime (Journal, Stretch, Read). "Read" is one activity listed in three sections.

Ids are `crypto.randomUUID()`. TinyBase cells hold only strings, numbers and booleans; how weekdays and positions are stored is the domain's private choice.

### `src/sync/local.ts`

```ts
export function startLocalSave(store: WatodoStore): Promise<void>; // load what is saved, then save every change (browser local storage, key 'watodo')
```

### `src/ui/hooks.tsx`

```tsx
export function WatodoProvider(props: { store: WatodoStore; clock: Clock; children: React.ReactNode }): JSX.Element;
export function useWatodo(): { store: WatodoStore; clock: Clock };
export function useSnapshot(): Snapshot;      // re-renders when the store changes
export function useNowDate(): Date;           // clock(), refreshed every 30 seconds and on store change
```

`src/ui` never imports `tinybase`; `WatodoStore` comes from `@/domain`.

## Tasks

### Task 1: project setup
Scaffold Vite + React + TypeScript in the repo root with npm, keeping the existing `prototype/`, `learn/`, `docs/` and the `learn/` line in `.gitignore`. Add Tailwind (Vite plugin), shadcn/ui (with the `@/` alias to `src/`), TinyBase, Vitest with jsdom and React Testing Library. Use the install commands published on each project's own documentation site, not from memory, and run `npm audit signatures` afterwards. Add shadcn components: button, card, dialog, input, label, select, badge, textarea, sonner. Create empty folders with a `.gitkeep`: `src/domain/rules`, `src/ui`, `src/sync`, `hub`. Scripts: `dev`, `build`, `test` (vitest run), `typecheck`. `src/App.tsx` renders a heading "watodo"; one test asserts it. Remove the scaffold's demo assets and styles.

### Task 2: rules
Implement `src/domain/rules/` exactly as in the contracts: `types.ts`, `dayRollover.ts`, `guess.ts`, `currentSlot.ts`, `lastDone.ts`, `views.ts`, and `index.ts` re-exporting all of them. Pure functions only: no `tinybase`, no React, no `Date.now()` or `new Date()` without arguments. One test file per rule file.

### Task 3: domain
Implement `src/domain/` (`clock.ts`, `store.ts`, `setup.ts`, `logging.ts`, `menu.ts`, `templates.ts`, `index.ts`) and `src/sync/local.ts` exactly as in the contracts. Tests use a real in-memory store from `createWatodoStore()` and a fixed clock; no mocks of TinyBase.

### Task 4: app shell and Now screen
`src/ui/hooks.tsx` as in the contracts. `src/main.tsx` creates the store, awaits `startLocalSave`, renders `<WatodoProvider store clock={systemClock}>`. `src/App.tsx`: if `setupState` is not `done`, render `<Tutorial />`; else a phone-first layout (centred column, max width about 28rem) with a bottom tab bar: Now, Day, Journal, Progress, Edit. Create every screen file so later tasks only fill their own: `src/ui/now/NowScreen.tsx`, `src/ui/now/DayPicker.tsx`, `src/ui/day/FullDayScreen.tsx`, `src/ui/journal/JournalScreen.tsx`, `src/ui/progress/ProgressScreen.tsx`, `src/ui/edit/EditScreen.tsx`, `src/ui/edit/TemplateEditor.tsx`, `src/ui/tutorial/Tutorial.tsx`. Build NowScreen and DayPicker fully per the spec; the others are placeholders showing their name, except Tutorial, which for now has one button "Start with the basic day" that calls `setUpStarter` then `finishSetup`.

### Task 5: tutorial and Edit
`EditScreen`, `TemplateEditor`, `Tutorial`, and the "New template" path in `DayPicker`, per the spec.

### Task 6: Journal, Full day, Progress
`JournalScreen`, `FullDayScreen`, `ProgressScreen` per the spec.

---

# Change 1: no times in templates or on screen

Decided after phase 1 shipped. Templates lose their time windows, the app never shows a clock time, and the current slot is worked out from what the user last did. See the updated `docs/spec.md` ("Which slot you are in"). The contracts below replace the matching ones above; anything not mentioned is unchanged.

## Changed contracts

### `src/domain/rules/types.ts`
```ts
export interface TemplateItem {
  id: Id; templateId: Id; kind: 'fixed' | 'slot'; name: string;
  position: number; sectionId?: Id; // sectionId only on slots. No start/end.
}
export interface JournalEntry {
  id: Id; activityId: Id; sectionId: Id; loggedAt: number; // epoch ms, recorded but never shown
  itemId?: Id;                     // the slot it was logged in, when known
  note?: string; durationMinutes?: number;
}
/** One row per day that has been touched. Confirmed means templateId is set. */
export interface DayRecord {
  day: DayKey; templateId?: Id; note?: string;
  chosenItemId?: Id; chosenAt?: number; // a slot picked by hand, and when (epoch ms)
}
```
`DayMinutes` and `DayRecord.earlyItemId` are removed. `Snapshot.items` is sorted by `position`.

### `src/domain/rules/dayRollover.ts`
```ts
export const DAY_START_MINUTES = 240;
export function dayKeyOf(at: Date): DayKey;
export function weekdayOf(day: DayKey): number;
export function addDays(day: DayKey, n: number): DayKey;
export function noonOf(day: DayKey): Date;   // local 12:00 on that calendar day; a moment that is safely inside the day
```
Removed: `dayMinutesOf`, `dateFromDay`, `toDayMinutes`, `formatDayMinutes`.

### `src/domain/rules/currentSlot.ts`
```ts
export const STAY_MS = 60 * 60 * 1000;
export interface Position { item: TemplateItem; reason: 'chosen' | 'stayed' | 'advanced' | 'first' }
export function itemsOf(snap: Snapshot, templateId: Id): TemplateItem[];   // sorted by position
export function slotsOf(items: TemplateItem[]): TemplateItem[];            // the slots, in order
export function positionAt(
  items: TemplateItem[], todaysEntries: JournalEntry[], record: DayRecord | undefined, at: Date,
): Position | null;                                                         // null when the template has no slots
```
`positionAt`, with `slots = slotsOf(items)`:
- The entry's slot is the slot whose `id` equals `entry.itemId`; if there is no such slot, the first slot whose `sectionId` equals `entry.sectionId`; if neither, the entry is ignored. `lastLog` is the considered entry with the greatest `loggedAt`.
- `chosen` is the slot whose `id` equals `record.chosenItemId`, when it exists.
1. `chosen` exists and (`lastLog` is absent or `record.chosenAt > lastLog.loggedAt`) -> that slot, `reason: 'chosen'`.
2. `lastLog` exists: if `at.getTime() - lastLog.loggedAt < STAY_MS` -> its slot, `'stayed'`; otherwise the slot after it in `slots` (or the same slot when it is the last), `'advanced'`.
3. Otherwise the first slot, `'first'`.

### `src/domain/rules/views.ts`
```ts
export interface NowView {
  day: DayKey;
  guess: TemplateGuess; template: Template | null;
  slots: TemplateItem[];                 // today's slots in order; empty when there is no template
  position: Position | null;             // null when there is no template or it has no slots
  activities: { activity: Activity; lastDone: JournalEntry | null }[]; // of the current slot's section
}
export interface FullDayView {
  template: Template | null;
  items: { item: TemplateItem; current: boolean; activities: Activity[] }[];
}
```
`nowView(snap, at)` passes `positionAt` the entries whose `dayKeyOf(new Date(loggedAt))` equals `dayKeyOf(at)`, and that day's `DayRecord`. `NowView.minutes` is removed. `fullDayView` marks the current slot. `journalByDay`, `progress`, `dotStrip`, `sectionActivities` keep their signatures.

### `src/domain/logging.ts`
```ts
export interface PendingLog { activityId: Id; sectionId: Id; itemId: Id }
export function goToSlot(store: WatodoStore, clock: Clock, itemId: Id): void;  // sets today's chosenItemId and chosenAt = clock().getTime()
export function addPastEntry(store: WatodoStore, input: { activityId: Id; sectionId: Id; day: DayKey; note?: string; durationMinutes?: number }): Id;
export function editEntry(store: WatodoStore, entryId: Id, patch: { note?: string; durationMinutes?: number | null }): void;
```
Removed: `endStepEarly`. `logActivity` and a logged `pending` write `itemId` on the journal row. `confirmDay` clears `chosenItemId`/`chosenAt` when the chosen item is not in the confirmed template. `addPastEntry` sets `loggedAt` to one minute after that day's latest existing entry, or `noonOf(day)` when the day has none, so entries keep the order they were added.

### `src/domain/templates.ts`
```ts
export function addItem(store: WatodoStore, templateId: Id, item: { kind: 'fixed' | 'slot'; name: string; sectionId?: Id }): Id; // appended last
export function updateItem(store: WatodoStore, itemId: Id, patch: Partial<{ kind: 'fixed' | 'slot'; name: string; sectionId: Id | null }>): void;
export function moveItem(store: WatodoStore, itemId: Id, direction: 'up' | 'down'): void; // swaps position with its neighbour in the same template; no-op at either end
```
The basic day keeps the same six items in the same order, without times.

### Stored data
Item rows store `position` instead of `start`/`end`. When reading, an item row with no `position` cell but a numeric `start` cell (data saved before this change) uses `start` as its position, so existing templates keep their order. Day rows no longer use `earlyItemId`; ignore it if present.

### `src/ui/format.ts`
```ts
export function lastDoneText(entry: JournalEntry | null, now: Date): string; // 'never' | 'today' | 'yesterday' | 'N days ago'
export function dayLabel(day: DayKey): string;
```
Removed: `timeOf`.

## Tasks

### Task 7: rules without times
Update `src/domain/rules/` to the changed contracts, with tests.

### Task 8: domain without times
Update `src/domain/` (store, schema, logging, templates, basic day) to the changed contracts, with tests.

### Task 9: screens without times
Update `src/ui/` to the changed contracts and the updated spec: NowScreen (slot row, no fixed-step or gap states), FullDayScreen, JournalScreen, TemplateEditor, format, and their tests.

---

# Change 2: full day folds into the Now screen

The Day tab is removed. The full day view becomes an expandable part of the Now screen, as the original design notes described it (a default view of choices and a "Full day" view of everything).

## Changed contracts
```tsx
// src/ui/now/FullDay.tsx  (replaces src/ui/day/FullDayScreen.tsx, which is deleted along with its folder)
export function FullDay(): JSX.Element;   // the numbered list of today's items; no heading, no toggle
```
`src/App.tsx` tabs, in order: `Now`, `Journal`, `Progress`, `Edit`.

### Task 10: fold the full day into Now
Move the full day list into `src/ui/now/FullDay.tsx`, show it from NowScreen behind a `Show full day` / `Hide full day` button, and remove the Day tab.

---

# Change 3: the full day belongs in the Journal, not the Now screen

Correction to Change 2: the user wanted the full day folded into the Journal screen.

## Changed contracts
```tsx
// src/ui/journal/FullDay.tsx  (moved from src/ui/now/FullDay.tsx; same component, same behaviour)
export function FullDay(): JSX.Element;
```

### Task 11: move the full day toggle to the Journal
Remove the `Show full day` button and `<FullDay />` from NowScreen. Move `FullDay` and its test to `src/ui/journal/`. In JournalScreen, today's section gets the `Show full day` / `Hide full day` button.

---

# Change 4: slots own their activities, starters, and a draft template editor

Three linked changes. (1) A slot and its activity list become one thing: a slot item has no name of its own; its name is its section's name. (2) New templates start from a starter, a copy, or blank. (3) Creating, copying and editing a template all happen on a draft that is only written on Save. See the updated `docs/spec.md`.

## Changed contracts

### `src/domain/rules/types.ts` (additions)
```ts
export type DraftStep =
  | { kind: 'fixed'; name: string; itemId?: Id }
  | { kind: 'slot'; slotName: string; itemId?: Id };   // itemId: the existing item this step came from, when editing
export interface TemplateDraft {
  templateId?: Id;                                      // set when editing an existing template
  name: string;
  label: { id: Id } | { newName: string; weekdays: number[] };
  steps: DraftStep[];
}
```
`TemplateItem` is unchanged; for a slot, `name` is always its section's name.

### `src/domain/rules/starters.ts` (new, pure)
```ts
export interface Starter {
  key: string; name: string; labelName: string; labelWeekdays: number[];
  steps: ({ kind: 'fixed'; name: string } | { kind: 'slot'; slotName: string })[];
}
export const STARTERS: Starter[];
export const SUGGESTED_ACTIVITIES: Record<string, string[]>;   // keyed by slot name
export function draftFromStarter(snap: Snapshot, key: string): TemplateDraft | null;
export function draftFromTemplate(snap: Snapshot, templateId: Id, mode: 'edit' | 'copy'): TemplateDraft | null;
export function blankDraft(snap: Snapshot): TemplateDraft;
export function moveStep(steps: DraftStep[], from: number, to: number): DraftStep[];   // returns a new array
```
`STARTERS`, in this order:
- `office`: "Office day", label "Work day" [0,1,2,3,4]: fixed Morning routine, fixed Commute, fixed Work, slot Post work, fixed Dinner, slot Post dinner, slot Bedtime
- `wfh`: "Work from home", label "Work day" [0,1,2,3,4]: fixed Morning routine, fixed Work, slot Lunch break, fixed Work, slot Post work, fixed Dinner, slot Post dinner, slot Bedtime
- `school`: "School day", label "School day" []: fixed Morning routine, fixed School, slot After school, fixed Dinner, fixed Homework, slot Post dinner, slot Bedtime
- `weekend`: "Weekend", label "Weekend" [5,6]: fixed Morning routine, slot Free time, fixed Lunch, slot Free time, fixed Dinner, slot Post dinner, slot Bedtime
- `dayoff`: "Day off", label "Day off" []: fixed Morning routine, slot Free time, fixed Dinner, slot Post dinner, slot Bedtime

`SUGGESTED_ACTIVITIES`: Post work: Gym, Walk, Read. Post dinner: Guitar, Call family, Read. Bedtime: Journal, Stretch, Read. Lunch break: Walk, Read. After school: Sports, Walk, Read. Free time: Hike, Cook something new, Read, Call family.

- `draftFromStarter`: `name` is the starter's name; `label` is `{ id }` of an existing label whose name matches the starter's label name (case-insensitive), else `{ newName, weekdays }`; steps copied, no `itemId`s, no `templateId`. Unknown key -> `null`.
- `draftFromTemplate`: steps from `itemsOf`, slots as `{ kind: 'slot', slotName: <section name> }`. Mode `edit`: `templateId` set and each step carries its `itemId`. Mode `copy`: no `templateId`, no `itemId`s, name `"{name} copy"`. Unknown template -> `null`.
- `blankDraft`: name `New template`, no steps, `label` the first existing label, else `{ newName: 'Work day', weekdays: [0,1,2,3,4] }`.

### `src/domain/rules/views.ts` (addition)
```ts
export function templatesUsingSection(snap: Snapshot, sectionId: Id): Template[]; // templates with a slot of that section, by position
```

### `src/domain/templates.ts`
```ts
export function saveTemplate(store: WatodoStore, draft: TemplateDraft): Id;   // creates or updates; returns the template id
```
Removed: `createTemplate`, `renameTemplate`, `setTemplateLabel`, `addItem`, `updateItem`, `moveItem`, `deleteItem`. Unchanged: label functions, `setDefaultTemplate`, `deleteTemplate`.

`saveTemplate`, in one transaction:
1. Label: `{ id }` is used as is; `{ newName, weekdays }` reuses an existing label with that name (case-insensitive) or creates it with those weekdays.
2. Template: with `templateId` naming an existing template, update its name and label; otherwise create one (next position). Names are trimmed.
3. Steps in order, `position` = index. A fixed step with a blank name and a slot step with a blank `slotName` are skipped. A slot step resolves its section by name (trimmed, case-insensitive); if none exists, create the section and, when `SUGGESTED_ACTIVITIES` has that name (case-insensitive), list those activities in it, reusing existing activities by name. A step whose `itemId` names an item of this template updates that item (kind, name, section, position), so journal entries that reference it stay linked; otherwise a new item is created.
4. Delete this template's items that no step refers to.
5. If no valid default template exists, make this one the default.

### `src/domain/menu.ts`
`deleteSection` also deletes every slot item that points at the section.

### `src/domain/store.ts`
`readSnapshot`: a slot item's `name` is its section's name (any stored name cell is ignored). A slot item whose section does not exist is skipped.

### UI
```tsx
// src/ui/edit/StarterPicker.tsx
export function StarterPicker(props: { open: boolean; onPick(draft: TemplateDraft): void; onClose(): void }): JSX.Element;
// src/ui/edit/TemplateEditor.tsx
export function TemplateEditor(props: { draft: TemplateDraft; onSaved(templateId: Id): void; onCancel(): void }): JSX.Element;
```

## Tasks

### Task 12: slots, starters and drafts in the rules and domain
Implement the rules and domain contracts of Change 4, with tests.

### Task 13: starter picker, draft editor with dragging, and the screens that use them
Implement the UI of Change 4: `StarterPicker`, the draft `TemplateEditor` with drag-to-reorder, and the changes to EditScreen, DayPicker and Tutorial.

---

# Change 5: demo data

A way to see the app as it looks after a month of use, without touching real data. Opening the app with `?demo` in the address shows a seeded, unsaved store.

## Contracts
```ts
// src/domain/demo.ts (re-exported from src/domain/index.ts)
export function seedDemoMonth(store: WatodoStore, clock: Clock): void;
```
Fills an empty store with three templates and about a month of plausible history ending today. Does nothing if the store already has templates. Deterministic: the same date gives the same data.

### Task 14: demo data
Implement `seedDemoMonth` with tests, and the `?demo` mode in `src/main.tsx`.

---

# Change 6: the Journal shows one day at a time

The scrolling list of days is replaced by a single day with the date centred at the top and arrows to move a day back or forward. Kept deliberately lightweight.

## Contracts
```ts
// src/domain/rules/views.ts (addition)
export function journalDay(snap: Snapshot, day: DayKey): JournalDay; // that one day; entries [] and note '' and templateId null when nothing is recorded
```
`journalByDay` stays (other code and tests use it).

### Task 15: one-day Journal
Add `journalDay`, and rebuild `JournalScreen` around a single viewed day with previous/next arrows.

---

# Change 7: tabs on the Edit screen

The Edit screen's three parts (Slots, Labels, Templates) become tabs across the top, one shown at a time, instead of one long scrolling page.

### Task 16: Edit screen tabs
Put the three parts of `EditScreen` behind tabs `Slots`, `Labels`, `Templates`.

---

# Change 8: Edit tabs are lists of names

Each Edit tab shows a plain list of names. An item's form appears only when its name is tapped.

### Task 17: name lists in the Edit tabs
In each of the three Edit tabs, show a list of names; tapping a name expands that item's existing controls beneath it, one at a time.

---

# Change 9: tapping a name opens its own editing view

Correction to Change 8: an item's controls do not unfold beneath its row. Tapping a name navigates to a dedicated editing view for that item, replacing the list, with a way back. The same pattern applies to slots, labels and templates.

## Contracts
```tsx
// src/ui/edit/TemplateEditor.tsx
export function TemplateEditorForm(props: { draft: TemplateDraft; onSaved(templateId: Id): void; onCancel(): void }): JSX.Element; // the editor's fields, steps and Cancel/Save, with no dialog around it
export function TemplateEditor(props: { draft: TemplateDraft; onSaved(templateId: Id): void; onCancel(): void }): JSX.Element;     // unchanged for callers: TemplateEditorForm inside a Dialog
```

### Task 18: editing views in the Edit screen
Replace the expand-beneath behaviour with a dedicated editing view per item.

Change 5 addendum: demo mode is development-only (`import.meta.env.DEV`); a production build ignores `?demo` and does not include the demo code.

---

# Change 10: number repeated slots

When a template contains the same slot more than once, each occurrence is labelled `#1`, `#2`, … in template order so it is clear which one is meant.

## Contracts
```ts
// src/domain/rules/currentSlot.ts (addition)
export function slotDisplayNames(items: TemplateItem[]): Map<Id, string>;
// For every item in `items` (one template's items): its name. Slots whose sectionId occurs more than once among the slots get ' #1', ' #2', … appended in position order. Fixed steps and slots that occur once keep their plain name.

// src/domain/rules/views.ts (changes)
export interface NowView {
  day: DayKey;
  guess: TemplateGuess; template: Template | null;
  slots: { item: TemplateItem; displayName: string }[];
  position: Position | null;
  positionName: string | null;           // display name of position.item
  activities: { activity: Activity; lastDone: JournalEntry | null }[];
}
export interface FullDayView {
  template: Template | null;
  items: { item: TemplateItem; displayName: string; current: boolean; activities: Activity[] }[];
}
export function entrySlotName(snap: Snapshot, entry: JournalEntry): string;
// The display name of the slot the entry was logged in: when entry.itemId names an existing item, that item's display name within its own template; otherwise the entry's section name; '(removed)' when neither exists.
```

### Task 19: number repeated slots
Implement the contracts above and show the numbered names on the Now screen, in the full day list and on journal entries.

---

# Phase 2: hub, sync and the phone

Spec: the "Phase 2" section of `docs/spec.md`. Facts below were verified on this machine with a scratch script (Node v26.4.0, tinybase 10.0.1, ws 8):
- `node file.ts` runs TypeScript directly when it uses only erasable syntax; relative imports need the `.ts` extension.
- `createWsServer` from `tinybase/synchronizers/synchronizer-ws-server` works with `new WebSocketServer({ noServer: true })` attached to a `node:http` server through its `upgrade` event; the path id is the URL path without the leading slash (`/sync/watodo` gives `sync/watodo`).
- `createFilePersister` from `tinybase/persisters/persister-file` persists the hub's `MergeableStore`; data survives a hub restart.
- A browser-side `createWsSynchronizer(store, webSocket)` from `tinybase/synchronizers/synchronizer-ws-client` has the hub's data by the time `await startSync()` resolves.
- After a dropped connection, destroying the old synchronizer and creating a new socket and a new synchronizer on the same store resumes syncing, including edits made while offline. No reconnect library is needed.

## Contracts

### `hub/server.ts`
```ts
export interface HubOptions { port: number; host?: string; dataDir: string; staticDir: string }
export interface Hub { port: number; close(): Promise<void> }
export const SYNC_PATH = '/sync/watodo';
export function startHub(options: HubOptions): Promise<Hub>;
```
- `host` defaults to `127.0.0.1`. `port: 0` picks a free port; `Hub.port` is the real one.
- HTTP `GET`/`HEAD`: files from `staticDir`, with content types for html, js, css, json, webmanifest, svg, png, ico, woff2, txt. A path with no file extension that matches no file gets `index.html` (the app is a single page). Any path that escapes `staticDir` gets 403/404, never a file outside it. `index.html`, `sw.js` and `*.webmanifest` are sent with `Cache-Control: no-cache`; files under `/assets/` with `Cache-Control: public, max-age=31536000, immutable`.
- `GET /hub/time` returns JSON `{ "now": <epoch milliseconds> }` with `Cache-Control: no-store`.
- WebSocket upgrades are accepted only on exactly `SYNC_PATH`; any other upgrade is refused. The sync server persists to `<dataDir>/watodo.json` (creating `dataDir` if needed).
- Running the file directly (`node hub/server.ts`) starts a hub with `WATODO_PORT` (default 4780), `WATODO_DATA_DIR` (default `$XDG_DATA_HOME/watodo`, else `~/.local/share/watodo`) and `WATODO_STATIC_DIR` (default the repo's `dist/`), prints the address, and shuts down cleanly on SIGINT and SIGTERM. Importing the file does not start anything.
- Erasable TypeScript only (no enums, namespaces or parameter properties); relative imports carry `.ts`.

### `src/sync/hub.ts`
```ts
export interface HubConnection {
  firstSync: Promise<boolean>;   // true once the first sync with the hub has completed; false if it did not within firstSyncTimeoutMs
  stop(): void;                  // stop syncing and stop reconnecting
}
export function hubSyncUrl(location: { protocol: string; host: string }): string; // 'https:' + 'h' -> 'wss://h/sync/watodo'; 'http:' -> 'ws://…'
export function connectToHub(store: WatodoStore, options: {
  url: string;
  firstSyncTimeoutMs?: number;   // default 2500
  retryMs?: number;              // first retry delay, default 2000, doubling up to 15000
  createSocket?: (url: string) => WebSocket; // default: the global WebSocket
}): HubConnection;
```
`connectToHub` never throws and never rejects: with no hub it keeps retrying quietly. Each attempt uses a new socket and a new synchronizer on the same store; when the socket closes or errors, the synchronizer is destroyed and a retry is scheduled. It also retries at once when the browser fires `online` or the page becomes visible.

### `src/sync/clock.ts`
```ts
export function clockSkewMs(fetchImpl?: typeof fetch): Promise<number | null>; // device time minus hub time, from GET /hub/time; null when unreachable
export const CLOCK_WARNING_MS = 120_000;
```

## Tasks

### Task 20: the hub
`hub/server.ts` as in the contract, with tests, the `ws` dependency, and npm scripts `hub` (`node hub/server.ts`) and `serve` (`npm run build && npm run hub`).

### Task 21: sync from the app
`src/sync/hub.ts` and `src/sync/clock.ts` as in the contracts, with tests against a real hub; start-up wiring in `src/main.tsx`; the dev-server proxy.

### Task 22: installable on the phone
Web app manifest, icons, iOS tags, a service worker for offline loading, safe-area spacing.

### Task 23: setup
A systemd user service for the hub and a guided setup script for Tailscale and the phone.

---

# Change 11: quick and committed activities

See "Quick and committed activities" in `docs/spec.md`.

## Contracts

### `src/domain/rules/types.ts`
```ts
export interface Activity { id: Id; name: string; committed: boolean }   // committed: logging it spends the slot
export interface JournalEntry {
  id: Id; activityId: Id; sectionId: Id; loggedAt: number;
  itemId?: Id; committed?: boolean;      // committed: this entry spent its slot (copied from the activity when logged)
  note?: string; durationMinutes?: number;
}
```
A stored activity with no `committed` cell reads as `committed: false`.

### `src/domain/rules/currentSlot.ts`
```ts
export interface Position { item: TemplateItem; reason: 'chosen' | 'stayed' | 'advanced' | 'first'; spentBy: JournalEntry | null }
export function spentSlots(items: TemplateItem[], todaysEntries: JournalEntry[]): Map<Id, JournalEntry>; // slot item id -> the committed entry that spent it (the latest, if several)
export function positionAt(items: TemplateItem[], todaysEntries: JournalEntry[], record: DayRecord | undefined, at: Date): Position | null;
```
An entry spends a slot when `entry.committed === true` and it maps to that slot (by `itemId`, else by first slot of its section, as today). `positionAt`, with `slots` in order and `spent = spentSlots(...)`:
1. `chosen` exists and (`lastLog` is absent or `record.chosenAt > lastLog.loggedAt`) -> that slot, `'chosen'`, with `spentBy` set when it is spent. (A spent slot can be viewed this way.)
2. `lastLog` exists, where `base` is its slot:
   - if `lastLog.entry.committed`, or `at - loggedAt >= STAY_MS`: the first slot after `base` that is not spent; if there is none, the first slot anywhere that is not spent; reason `'advanced'`. If every slot is spent -> `null`. Exception kept from before: when the log is quick, old, and no other unspent slot exists, stay on `base` if `base` is not spent.
   - otherwise (a quick log less than `STAY_MS` old): `base`, `'stayed'`.
3. No logs: the first slot that is not spent, `'first'` (all are unspent in this case).
`spentBy` is `null` except in rule 1 on a spent slot. `positionAt` returns `null` when the template has no slots or every slot is spent.

### `src/domain/rules/views.ts`
```ts
export interface NowView {
  day: DayKey;
  guess: TemplateGuess; template: Template | null;
  slots: { item: TemplateItem; displayName: string; spentBy: { entry: JournalEntry; activityName: string } | null }[];
  position: Position | null;
  positionName: string | null;
  dayDone: boolean;                      // the template has slots and every one is spent, and no slot is being viewed
  activities: { activity: Activity; lastDone: JournalEntry | null }[]; // empty when the current slot is spent
}
```
`activityName` is the entry's activity name, or `(removed)`.

### `src/domain/menu.ts`
```ts
export function setActivityCommitted(store: WatodoStore, activityId: Id, committed: boolean): void;
```

### `src/domain/logging.ts`
`logActivity` and `confirmDay` (for a pending tap) write `committed: true` on the journal row when the activity is committed at that moment. `logActivity` returns `not-available` when the current slot is spent. `PendingLog` gains nothing: the domain looks the activity up when it writes. `addPastEntry` never writes `committed`. No signature changes.

### UI
```tsx
// src/ui/now/SpendConfirm.tsx
export function SpendConfirm(props: { slotName: string; activityName: string; onConfirm(): void; onCancel(): void }): JSX.Element; // dialog: "Spend {slot} on {activity}?", buttons "Spend it" / "Cancel"
// src/ui/UndoCommitDialog.tsx
export function UndoCommitDialog(props: { activityName: string; slotName: string; waitSeconds?: number; onUndo(): void; onCancel(): void }): JSX.Element;
// dialog titled "Undo {activity}?" with the text "This reopens {slot}."; the confirm button is disabled and reads "Undo in {n}" counting down each second from waitSeconds (default 5), then reads "Undo" and is enabled; "Cancel" is always enabled
```

## Tasks

### Task 24: committed activities in the rules and domain
Implement the rules and domain contracts of Change 11, with tests.

### Task 25: committed activities on screen
The kind switch in the slot editing view, the spend confirmation, spent slots and the day-done state on the Now screen, and the slow undo on the Now screen and in the Journal.

---

# Change 12: an Activities tab

An activity is created once and attached to the slots it belongs in, from its own editing view.

## Contracts
```ts
// src/domain/menu.ts (additions)
export function addActivity(store: WatodoStore, name: string): Id;            // creates a quick activity in no slot; reuses an existing activity with the same name (case-insensitive)
export function setActivityInSection(store: WatodoStore, activityId: Id, sectionId: Id, listed: boolean): void; // true lists it at the end of that slot (no-op if already listed); false removes it
export function deleteActivity(store: WatodoStore, activityId: Id): void;     // removes the activity and all its listings; journal entries are kept

// src/domain/rules/views.ts (addition)
export function sectionsOfActivity(snap: Snapshot, activityId: Id): Section[]; // the slots that list it, by section position
```
Existing functions are unchanged.

### Task 26: the Activities tab
Implement the contracts above with tests, add the `Activities` tab and the activity editing view, and simplify the slot editing view.
