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
