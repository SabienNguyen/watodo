# watodo spec (phase 1)

watodo is an activity menu, not a planner. When you finish something and wonder what to do next, it shows the options for that moment, each with when you last did it, and one tap logs your choice.

Phase 1 is the whole app in the computer's browser. Phase 2 (not in this spec) adds the hub, sync through Tailscale, and the phone as a home-screen web app.

## Stack

TypeScript, React + Vite, Tailwind, shadcn/ui, TinyBase (`MergeableStore`, saved in browser local storage), Vitest. Package manager: npm.

## Concepts

- **Template**: the shape of one type of day. An ordered list of items with no times. An item is a **fixed step** (Work, Dinner: nothing to choose, display only, never logged) or a **slot** (Post work).
- **Slot**: a named list of activities, such as Post work with Gym, Walk and Read. A slot and its activity list are one thing: every template that includes the Post work slot shows the same activities, so a list is only ever filled out once. Renaming a slot renames it in every template. The same slot can appear more than once in a template. When it does, each occurrence is shown with a number in template order (Free time #1, Free time #2, Free time #3) wherever a particular occurrence is meant: the Now screen's slot row and heading, the full day list, and journal entries. A slot that appears once has no number. The slot itself, its activity list, and Progress totals are not numbered. (In the code and stored data a slot's list is called a section.)
- **Activity**: defined once, can be listed in several slots. "Last done" is shared across slots.
- **Label**: a user-created name for a kind of day (Work day, Weekend) with the weekdays it usually covers. Each template has exactly one label; a label can have several templates.
- **Default template**: one template is always the default, used when no label covers today.
- **Journal**: one entry per logged activity (activity, slot: the slot it was logged in, optional note and duration). The moment of each log is recorded but never shown.
- **No clock times anywhere on screen.** Templates have no times, and the app never displays the time of a log. Dates are shown; times are not.
- **Day**: a day runs from 04:00 to 04:00. A log at 00:15 belongs to the evening before.

## Quick and committed activities

Some things you do use up the slot they are done in; others do not.

- Every activity is **quick** or **committed**. New and existing activities are quick. The kind belongs to the activity, so it is the same in every slot that lists it. It is set in the slot's editing view.
- Tapping a **quick** activity logs it at once, as before. The slot stays open.
- Tapping a **committed** activity asks first: `Spend {slot} on {activity}?` with `Spend it` and `Cancel`. Confirming logs it and **spends the slot**: nothing more can be logged in that slot today, and the Now screen moves straight to the next slot that is not spent. On a day's first log this question comes before the "which kind of day" question.
- A spent slot stays in the slot row, marked as spent. Tapping it shows what it was spent on, not its activities.
- When every slot is spent, the Now screen says `That's today.`
- **Undoing a commitment is possible but slow on purpose.** From the spent slot on the Now screen, or by deleting that entry in the Journal, an `Undo` dialog opens whose button is disabled for five seconds, counting down, before it can be pressed. Undoing removes the entry and reopens the slot. There is no instant Undo for a committed activity.
- Entries added by hand in the Journal never spend a slot.
- If only quick activities are logged in a slot, it moves on as before: by tapping another slot, or an hour after the last log.

## Behaviour

### Today's template
On opening, the app guesses today's template, in this order:
1. The template already confirmed for today.
2. Otherwise the first label that covers today's weekday: among that label's templates, the one confirmed most recently on any earlier day; if none was ever confirmed, the first created.
3. If that label has no templates, or no label covers today: the default template.

The first log of each day always asks which template today is, with the guess highlighted, even when only one template exists. That page can also open the template editor to create a new template; the pending tap is kept and logged once a template is chosen. Later logs that day do not ask. Today's template can be switched at any time from the Now screen; entries already logged are kept.

### Which slot you are in
The app works out the current slot from what you last did, not from the clock. Fixed steps are never "current"; they are skipped over.
1. If you picked a slot by hand today, and have not logged since, that slot.
2. Otherwise, if you logged something today: the slot you logged in while that log is less than an hour old (so a second activity can be added), and after that the next slot in the template. After the last slot it stays on the last slot.
3. Otherwise the first slot in today's template.

### Now screen
- A row of today's slots with the current one marked; tapping one makes it the current slot.
- The current slot's name and its slot's activities in stable order, each with "last: today / yesterday / 3 days ago / never". Tapping one logs it.
- After a log: a bar for 6 seconds with **Undo** and **Add note** (note and duration, both optional).
- A template with no slots says so and points to Edit.

### Other screens
- **Full day**: in the Journal, when viewing today, a `Show full day` control that expands today's whole template in order, fixed steps and slots, with no times and the current slot highlighted. Nothing in it can be tapped. It is collapsed by default. There is no separate Day tab and the Now screen does not show it; the tabs are Now, Journal, Progress, Edit. The control is shown only once today's template has been confirmed (recorded at the first log or by switching template). Before that the Journal says `Template not chosen` for today and offers no full day.
- **Journal**: one day at a time. The date is centred at the top with an arrow on each side: left goes to the day before, right to the day after, and right is disabled on today. It opens on today. Every day can be visited, including days with nothing logged. The day shows its template, its entries in the order they were logged (no times), and its note. Entries can be deleted, have their note and duration edited, and be added to the day being viewed. A `Back to today` control appears on any other day.
- **Progress**: counts per activity and per slot over 7, 30 or 90 days, and a 4-week dot strip per activity.
- **Edit**: four tabs across the top, `Slots`, `Activities`, `Templates` and `Labels`, showing one part at a time instead of one long page. Each tab is a plain list of names (for example Post work, Post dinner, Free time). Tapping a name goes to that item's own editing view, which replaces the list and has a control to go back. A slot's view has its name and activities; a label's view has its name and weekdays; a template's view is the template editor (name, label, steps) with Save and Cancel, plus Copy, Make default and Delete. Slots and their activities; labels and their weekdays; templates (new from a starter, copy, edit, delete, set default).
- **Activities tab**: every activity is listed once, by name. An activity's editing view has its name, whether it is committed, and a checklist of all slots: ticking a slot lists the activity there, unticking removes it. This is where an activity is created and attached to several slots in one go, instead of adding it to each slot separately. Deleting an activity removes it from every slot; its journal history is kept. A slot's editing view lists that slot's activities by name, with `Remove` for each and a field to add one; an activity's name and committed setting are edited only in its own view.
- **Creating a template**: `New template` offers starters (Office day, Work from home, School day, Weekend, Day off), a copy of any of your own templates, or Blank. Picking one adds nothing to your templates: it opens the template editor on a draft. The template exists only once you press Save; Cancel discards the draft. Copy and Edit work the same way: changes apply on Save. A starter's slots reuse your existing slots of the same name; slots you do not have yet are created on Save with a few suggested activities.
- **Template editor**: name, label, and the ordered steps. Steps are reordered by dragging. A step is a fixed step with a name, or a slot chosen from your slots or created by typing a new name.
- **First launch**: a required short tutorial. You pick a starter, adjust it in the template editor, and Save; only then does the Now screen open.

### Deleting
- Deleting the default template asks which template becomes the default. Deleting the last template restores the basic day as the default. No other template delete is restricted.
- A label can only be deleted when no template uses it.
- Deleting a slot asks for confirmation, naming the templates that use it, and removes it from those templates. Journal entries logged in it are kept.
- Removing an activity from a slot keeps its journal history.

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

## Phase 2: hub, sync and the phone

watodo runs on the computer and the iPhone and keeps both in step, with no cloud service holding the data.

- **Hub**: a small Node program on the computer. It serves the built app over HTTP and runs TinyBase's WebSocket sync server at `/sync/watodo`. It keeps its own copy of the data in one JSON file in the user's data directory, so a device can sync even when the other device is off. It listens on `127.0.0.1` only; Tailscale Serve puts it on the user's private network over HTTPS. It starts at login as a systemd user service.
- **Sync**: each device still saves locally first (browser storage). When the hub is reachable the app connects and the two copies merge; when it is not, the app keeps working and reconnects by itself. There is no sync status indicator.
- **First launch on a second device**: the app loads from the hub, so it waits briefly for the first sync before deciding. If the hub already has a set-up day, the tutorial is skipped and the data appears. If the hub is empty, the tutorial runs.
- **Phone**: a home-screen web app. It has a manifest and icons, opens standalone, and a service worker keeps the app itself available when the hub cannot be reached. The app asks the browser to keep its storage.
- **Clocks**: sync relies on the devices' clocks roughly agreeing. On connecting, the app compares its clock with the hub's and shows a warning bar when they differ by more than two minutes.
- **Demo mode** stays development-only and never syncs.

Not in phase 2: Electron, a sync status indicator, sync between devices without the hub, user accounts.

## Out of scope for phase 1 and 2

Electron, "Pick one for me", a sync status indicator, tracking fixed steps.
