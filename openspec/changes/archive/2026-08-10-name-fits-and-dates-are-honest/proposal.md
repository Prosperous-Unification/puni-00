# The name fits, and the date fields stop lying

## Why

Dany looked at dev, 2026-08-06, and three things were wrong. All three are
mine, and all three are the same failure: the tests asserted behaviour that
jsdom could see, and the part a person actually looks at was never checked.

1. **A long name is still cut off at rest.** The ask was "must wrap instead of
   cutting text". A one-row `<textarea>` wraps and then hides everything past
   the first line — the same crop with extra steps. It only opened up while it
   had the focus.
2. **A per-item "Not before" date saved and did nothing.** Without a project
   start date there is no day zero, so be-01 skips every constraint. The field
   took the date, stored it, showed it, and the row's start never moved.
3. **"Starts" and "Ends" printed day offsets under date-shaped headers.** A
   bare `2.5` under "Starts" reads as a date that failed to load.

## What Changes

**The name box is as tall as its name**

- The Name cell grows to fit its content, focused or not, capped at four lines
  at rest so one essay cannot push the table off the screen. In the cell, the
  cap lifts.
- The cap is `max-height` in `em`, not arithmetic on `scrollHeight`. The first
  attempt divided `scrollHeight` by `rows` to get a line height — at one row
  that is the whole content, so the cap computed to four times the text and
  capped nothing. A test caught it.
- **Notes are unchanged**: cropped at rest, grown while written in. That is
  what was asked for there, and it is the field with a rendered hover.

**A constraint that cannot be honoured cannot be set**

- The "Not before" cell is disabled while the project has no start date, and
  says why: "Set the project start date first — without one there are no dates
  to constrain."
- The Starts and Ends headers read "(day)" while the plan is off the calendar,
  and drop it once dates exist.

## Non-Goals

- **No change to how the schedule works.** be-01 was right; the UI was
  offering something it could not deliver.
- **No auto-sizing for Notes.** Cropped is deliberate there.
- **The table is still too wide.** Separate problem, separate change.
