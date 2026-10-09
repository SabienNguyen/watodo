# watodo spec (phase 1)

watodo is an activity menu, not a planner. When you finish something and wonder what to do next, it shows the options for that moment, each with when you last did it, and one tap logs your choice.

Phase 1 is the whole app in the computer's browser. Phase 2 (not in this spec) adds the hub, sync through Tailscale, and the phone as a home-screen web app.

## Stack

TypeScript, React + Vite, Tailwind, shadcn/ui, TinyBase (`MergeableStore`, saved in browser local storage), Vitest. Package manager: npm.

## Concepts

- **Template**: the shape of one type of day. An ordered list of items, each with a time window. An item is a **fixed step** (Work, Dinner: nothing to choose, display only, never logged) or a **slot** (Post work: points at exactly one section).
- **Section**: a named group in the activities menu. Sections are shared: every template whose slot points at a section offers the same activities. No per-template overrides.
- **Activity**: defined once, can be listed in several sections. "Last done" is shared across sections.
- **Label**: a user-created name for a kind of day (Work day, Weekend) with the weekdays it usually covers. Each template has exactly one label; a label can have several templates.
- **Default template**: one template is always the default, used when no label covers today.
- **Journal**: one entry per logged activity (activity, section, time, optional note and duration).
- **Day**: a day runs from 04:00 to 04:00. A log at 00:15 belongs to the evening before.

## Behaviour

### Today's template
On opening, the app guesses today's template, in this order:
1. The template already confirmed for today.
2. Otherwise the first label that covers today's weekday: among that label's templates, the one confirmed most recently on any earlier day; if none was ever confirmed, the first created.
3. If that label has no templates, or no label covers today: the default template.

The first log of each day always asks which template today is, with the guess highlighted, even when only one template exists. That page can also open the template editor to create a new template; the pending tap is kept and logged once a template is chosen. Later logs that day do not ask. Today's template can be switched at any time from the Now screen; entries already logged are kept.

### Now screen
- In a slot: the slot name and its section's activities in stable order, each with "last: today 17:45 / yesterday / 3 days ago / never". Tapping one logs it.
- In a fixed step: says where you are and what slot is next, with a button to end the step early, which shows the next slot before its usual time.
- In a gap between items: says nothing is planned, shows the next slot, with a button to start it now.
- After a log: a bar for 6 seconds with **Undo** and **Add note** (note and duration, both optional).

### Other screens
- **Full day**: today's template in order, fixed steps and slots, current item highlighted. Fixed steps cannot be tapped.
- **Journal**: entries by day, newest first, with the day's template. Entries can be deleted, have their time, note and duration edited, and be added for earlier days. Each day has a free-text note.
- **Progress**: counts per activity and per section over 7, 30 or 90 days, and a 4-week dot strip per activity.
- **Edit**: sections and their activities; labels and their weekdays; templates (create, copy, rename, delete, set default, edit items).
- **First launch**: a required short tutorial. It creates a basic day (one label, one template, a starter menu), lets you adjust it, and only then opens the Now screen.

### Deleting
- Deleting the default template asks which template becomes the default. Deleting the last template restores the basic day as the default. No other template delete is restricted.
- A label can only be deleted when no template uses it.
- Deleting an activity from a section keeps its journal history.

## Code structure

```
src/
  domain/         the only code that touches TinyBase; plain functions taking (store, clock, ...)
    rules/        pure functions: data and a time in, an answer out. No storage, no React.
  ui/             screens, components, thin hooks. Never imports tinybase.
  sync/           saving the store locally (phase 1); hub connection (phase 2)
hub/              phase 2
```

Rules for the code:
- Screens call domain functions and render what they return. They work nothing out themselves.
- Rules never read the system clock; the time is passed in.
- `src/ui` imports from `@/domain` only (its `index.ts`), never from `tinybase`.

## Out of scope for phase 1

Sync, hub, Tailscale, phone install, Electron, "Pick one for me", a sync status indicator, tracking fixed steps.
