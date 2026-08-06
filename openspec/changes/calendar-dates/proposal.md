# The plan sits on a calendar of working days

## Why

Dany, 2026-08-06: "allow to select a start date or the whole project that moves
start dates for all items", "allow to move the start date of the work item
manually that will shift the entire deps tree start times", "dates must account
for only workdays as days available for execution".

The schedule answers in offsets from an unnamed day zero. "Starts on day 11" is
not a date anyone can put in a calendar, and counting eleven days forward by
hand gets weekends wrong. The plan knows the shape of the work and refuses to
say when it happens.

## What Changes

**A project can begin on a day**

- New `project.start_date`, nullable. Null is an ordinary state — an estimate
  nobody has committed to a date — and the table then shows day offsets exactly
  as it always has. Set it and every date follows, because every date is an
  offset from it; there is nothing stored per row to drag along.
- Refused unless it is a real day. `2026-02-31` matches the shape and is not a
  date; the column is text, and a stored non-day would throw on every later
  read of the project. 422 on one request instead.

**Dates are working days**

- Weekends are skipped: a two-day task starting Thursday ends Friday, and the
  next one starts Monday. `endsOn` is the last day the work is still on, not
  the day after.
- Public holidays are **not** modelled. They differ by country, company and
  year; inventing them would put dates in a plan nobody can account for.
- The pass itself stays in numbers. `addWorkdays`/`workdaysBetween` in
  `libs/domain` are the only place a weekend is counted.

**A work item can be told not to start before a day**

- New `work_item.start_no_earlier_than`, nullable — a **floor, never a pin**
  (Dany's call: "keeps systems independent"). The schedule takes the later of
  it and what the dependencies allow, so a predecessor that slips still pushes
  the item along and the calendar cannot contradict the dependency tree.
- It shifts everything downstream, because everything downstream already
  follows this row's finish.

## Non-Goals

- **No holidays, no per-person calendars, no part-days.** Each is a real
  feature with its own storage; none was asked for.
- **No "must finish by" constraint.** A deadline that the schedule cannot meet
  needs a way to report the conflict, which is a design conversation.
- **No timezones.** A date is `YYYY-MM-DD`; a plan read in Kyiv and in London
  must agree on which day a work item starts.
