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

## One activity across several slots

Some things, like dinner out in the city, take up more than one slot. A committed activity can spend the current slot and the slots right after it.

- The spend question (`Spend {slot} on {activity}?`) has a `Through` row of buttons: the current slot, then each following slot up to the first one that is already spent. The current slot is chosen by default, so an ordinary spend is unchanged. Choosing a later slot spends every slot from the current one through it. The question then reads `Spend {first slot} – {last slot} on {activity}?`. With only one slot to offer, the row is not shown.
- Every slot it covers is marked spent by that activity, and the Now screen moves to the first open slot after them.
- The Journal names the span (`Post work – Post dinner`). In the full day the activity is one step that replaces the slots it covered and the fixed steps between them.
- Undo (the slow, five-second one) reopens every slot it covered.
- Only committed activities can cover several slots. The slots are always consecutive.
- **Changing it later**: a committed entry's edit view in the Journal has the same `Through` row (its own slot, then the following slots up to the first one another entry that day spent), and saving changes the span. On today's entries the Now screen follows.

## Resting, and what is left in a slot

- **Resting**: an activity can have a number of rest days, set in its editing view (`Rest days`; blank means none). After it is logged it is hidden from the Now screen until that many days have passed: an activity with 30 rest days logged on 1 October comes back on 31 October. Logging it early anyway is done by adding it in the Journal.
- **Done in this slot**: once a quick activity is logged in a slot, it is hidden from that slot for the rest of the day. This is per slot: it still shows in other slots that list it, and each numbered occurrence of a repeated slot counts separately. Undo, or deleting the entry in the Journal, brings it back. An entry added by hand in the Journal counts toward the first occurrence of its slot.
- When a slot lists activities but none is left to show, the Now screen shows a `Next slot` button that moves to the next slot that is not spent. Nothing moves on by itself.
- **Adding from the Now screen**: a `+` button under the current slot's activities opens a field to add an activity to that slot, with a `Committed` checkbox, the same as in the slot's editing view. Adding does not log it.

## Temporary activities

For days that do not follow the usual routine, an activity can be put in a slot for a while instead of for good.

- The Now screen's add field has a choice next to `Committed`: `Keep` (the default: in the slot for good, as before), `Today` (in the slot until the day ends), or `Until` with a date (in the slot through that day; it starts on the coming Sunday, or the Sunday after when today is Sunday).
- When the time is up, the activity leaves that slot by itself. Its entries stay in the Journal, the weekly recap and Progress, which count it like any other activity.
- An activity created this way is temporary: once it is in no slot any more, it is not listed in Edit's Activities tab. Adding it again with `Keep`, or ticking a slot for it in its editing view, makes it a regular activity.
- Adding an activity you already have with `Today` or `Until` only puts it in that slot for that time; the activity itself is unchanged, and a slot it is already in for good keeps it for good. Adding it again with a later date extends the time; `Keep` makes the placement permanent.
- In a slot's editing view, a temporary placement shows `until {day}` next to the activity's name, and can be removed like any other.
- The Journal's add-entry form for a day offers the activities that were in the slot on that day.

## Names and deleting

- **Deleted things keep their names.** Deleting an activity, a slot or a template removes it from every menu, list and picker, but its name is kept so the Journal and Progress still show it. A deleted activity still counts in Progress `By activity`, and a deleted slot in `By slot`. Adding an activity or slot with the same name as a deleted one brings that one back, with its history.
- **No duplicate names** for activities or slots. Names that differ only in capitals, spacing, punctuation, hyphens, or a plural `s` (`Gym`, `gym.`, `Gyms`) are the same name: adding one reuses the existing one without asking, and renaming to one is refused with `You already have {name}.`
- Names that are only close (`Gym session` for Gym, or one letter apart) are offered as suggestions under the field while typing; tapping one uses it. Adding the new name anyway asks `You already have {name}. Use it?` with `Use {name}` and `Add new`. Renaming to a close name asks `You already have {name}. Rename anyway?` with `Rename` and `Cancel`. In the template editor, typing a new slot name shows the suggestions but asks nothing.

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
- **Full day**: in the Journal, when viewing today, a `Show full day` control that expands today's whole template in order, fixed steps and slots, with no times and the current slot highlighted. A slot where something was logged today is replaced by what was logged there, one step per entry in the order logged, each like any other step; a committed entry has the committed badge. A slot with nothing logged shows its name and activities as before. Nothing in it can be tapped. It is collapsed by default. There is no separate Day tab and the Now screen does not show it; the tabs are Now, Journal, Progress, Edit. The control is shown only once today's template has been confirmed (recorded at the first log or by switching template). Before that the Journal says `Template not chosen` for today and offers no full day.
- **Journal**: one day at a time. The date is centred at the top with an arrow on each side: left goes to the day before, right to the day after, and right is disabled on today. It opens on today. Every day can be visited, including days with nothing logged. The day shows its template, its entries in the order they were logged (no times), and its note. Entries can be deleted, have their note and duration edited, and be added to the day being viewed. A `Back to today` control appears on any other day.
- **Progress**: counts per activity and per slot over 7, 30 or 90 days, and a 4-week dot strip per activity. Each list shows its top 5; a `Show all` button under a longer list expands it, and `Show fewer` collapses it again.
- **Edit**: four tabs across the top, `Slots`, `Activities`, `Templates` and `Labels`, showing one part at a time instead of one long page. Each tab is a plain list of names (for example Post work, Post dinner, Free time). Tapping a name goes to that item's own editing view, which replaces the list and has a control to go back. A slot's view has its name and activities; a label's view has its name and weekdays; a template's view is the template editor (name, label, steps) with Save and Cancel, plus Copy, Make default and Delete. Slots and their activities; labels and their weekdays; templates (new from a starter, copy, edit, delete, set default).
- **Activities tab**: every activity is listed once, by name. An activity's editing view has its name, whether it is committed, its rest days, and a checklist of all slots: ticking a slot lists the activity there, unticking removes it. This is where an activity is created and attached to several slots in one go, instead of adding it to each slot separately. Deleting an activity removes it from every slot; its journal history is kept. A slot's editing view lists that slot's activities by name, with `Remove` for each and a field to add one; an activity's name and committed setting are edited only in its own view.
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

## Bonds

Bonds are the people you do things with. Who you were with is a detail of an entry, so the menu keeps one `Dinner` instead of a `Dinner with …` for each person.

- **Adding who**: the bar after a log has `With…`. It opens your bonds as buttons (most recently seen first) and a field for a new name; tapping a bond adds it to the entry or takes it off; `Done` closes it. A Journal entry's edit view has the same choice. Entries read `{activity} · with {names}` in the Journal, the full day and the weekly recap.
- **Names** follow the activity rules: the same name (ignoring capitals, spacing, punctuation, a plural `s`) is the same bond; close names are suggested; a deleted bond keeps its name in history and comes back if added again.
- **Ranks**: each bond has a rank from its number of entries (each entry counts 1). Rank n is reached at n(n+1)/2 entries: rank 1 at 1, 2 at 3, 3 at 6, 4 at 10, 5 at 15, 6 at 21, 7 at 28, 8 at 36, 9 at 45, 10 at 55, the highest. A bond with no entries has no rank.
- **Unlock and rank up**: adding a name that is not a bond yet creates it and shows `New bond` with the name. Adding a bond to an entry that takes it to a new rank shows `Rank {n}` with the name. Taking it off again shows nothing.
- **Bonds tab** (between Progress and Edit): your bonds, by rank then most recently seen, each with its rank and `last: …`, and a field to add one. A bond's page: its name (renamable), `Rank {n}` with progress to the next rank (`{x} of {y}`), `last: …`, what you do together (activities with counts, most first), recent times together (date and activity), `Catch up after` (a number of days; blank means never), and `Delete bond`.
- **Notification**: a sixth kind, `Catching up with bonds`. For a bond with `Catch up after` set, once that many days have passed since the last entry with them: title `It's been {n} days since you saw {name}` (`{n} weeks` from 14 days, rounded down), text `Last time: {activity}`. Sent once per gap; tapping it opens the Bonds tab. It follows the cap and quiet hours, and is not held back after a log.

## Weekly recap

- Progress has a week section at the top: the week's dates between a left and a right arrow (Monday to Sunday; it opens on the current week; right is disabled on the current week), how many things were done (`12 things done`), and `Watch recap`. A week with nothing logged says `Nothing logged this week.` and has no button.
- The list is not shown until `Watch recap` is pressed. Then the week's entries appear one at a time in the order they were logged, about half a second apart, each ticking off like a checklist, and the list scrolls along. A small day label (`Mon 3`) appears where a new day starts. Committed entries have the committed badge. A `Show the rest` button under the list shows the rest at once. When it finishes, the whole list stays. Moving to another week hides it again. With reduced motion turned on, the whole list appears at once.

## Notifications

The hub sends notifications to devices that turn them on (web push). Tapping one opens the app.

Kinds, each with its own switch (all on by default):
1. **Slot reminders**: the current slot is open and nothing has been logged in it today, and it is 30 minutes past when you usually log that slot. The usual time is learned from the last 4 weeks of the same kind of day (days whose template has the same label as today's), and needs at least 3 such days. Title: the slot; text: its activities.
2. **After committed activities**: the last thing logged today was committed, and as long has passed as that activity usually takes (from its entries' durations, or the time until the next log on that day; at least 3 samples from the last 4 weeks). Title: `Back from {activity}?`; text: the current slot and its activities.
3. **Daily check-in**: nothing logged today, an hour past when you usually make your first log (same learning as 1). Not sent on a day a slot reminder was sent. Title: `What's next?`; text: the current slot and its activities.
4. **Resting activities back**: an activity's rest days are over. Title: `{activity} is back`; text: the slots that list it.
5. **Weekly recap**: on Monday, when last week has entries. Title: `Your week is ready`; text: `{n} things done`. Tapping it opens Progress.

Limits: at most `Per day` notifications per day (default 3); none during quiet hours (default 23:00 to 08:00); none within 20 minutes of the previous one; 1 to 3 are not sent within 20 minutes of a log. Each notification is sent once.

Settings are in a `Notifications` tab in Edit: `Turn on notifications` for this device (then `Turn off` and `Send test`), a checkbox for each kind, `Per day`, and `Quiet from` / `until` times. These are the only clock times in the app. Turning them on is per device; the rest of the settings sync.

## Out of scope for phase 1 and 2

Electron, "Pick one for me", a sync status indicator, tracking fixed steps.
