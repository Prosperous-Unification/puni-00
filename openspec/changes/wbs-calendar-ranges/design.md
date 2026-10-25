## Context

Read on 2026-10-25 on `origin/main` at `830e774d2`.

| Need                 | Exists today                                                                                                                                                                                                                                                                                                                                                          | Missing                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| A marker             | `calendar_marker(id, project_id, date, name, color, created_at)` (`20260905090000_add_calendar_marker`; schema `libs/wbs/adapters/store-sqlite/src/schema.ts`); the id is supplied by the composer because the automatic colour derives from it, `color NULL` means automatic; index `calendar_marker_project_date`                                                   | more than one day; scopes above the project  |
| The term             | `CONTEXT.md` **Calendar marker**: "A named annotation on an absolute calendar date … Not a work item and not visible to the scheduler."                                                                                                                                                                                                                               | a kind the scheduler reads                   |
| The undated plan     | ADR 0017 refuses a marker click on a workday-axis cell, naming the missing start date                                                                                                                                                                                                                                                                                 | the same rule for ranges                     |
| The chart            | `apps/wbs/fe-01/src/components/wbs/gantt-panel.tsx` draws markers as chips in a marker band; `marker-rule-density.ts` thins rules; `@wbs/domain/marker-color` derives colours                                                                                                                                                                                         | bands across days                            |
| Weekends             | `libs/wbs/domain/domain/src/workday.ts`: `isWeekend`, closed-form `addWorkdays`, `workdayOrdinalOf`, `deadlineOffsetOf`; its JSDoc refuses holidays "guessed", asking for "a calendar it owns". `schedule.ts` (around line 3212): "Everything here is an offset from day zero, in working days … weekends are counted in exactly one place." No holiday concept.      | a set of non-working dates                   |
| Two calendars        | ADR 0043 (proposed; `agent-calendar-instant-axis`, 1 of 31 tasks done, no `executor_kind` in code): human- and either-kind slices occupy a per-project working window (09:00–17:00, project timezone, weekends off) on an instant axis, agent-kind slices run continuously                                                                                            | non-working days in the window               |
| Rounding             | ADR 0011 (final days are whole days, rounded per step), ADR 0042 (rounding follows the step's estimate unit)                                                                                                                                                                                                                                                          | nothing; unchanged                           |
| Re-schedule trigger  | `changesScheduleInput` in `libs/wbs/application/core/src/service/optimizer-trigger-broadcaster.ts` (allowlist: `project_settings_changed`, `tree_replaced`, `elsewhere_changed`, …); `calendar_markers_changed` is deliberately absent and fe-01 `plan-refresh.ts` routes it to `['markers']` only; `committed-fanout.ts` sends `elsewhere_changed` to other projects | an event that moves the schedule             |
| Layers               | `wbs-work-packages` E18 (catalogue over organization → space → project → work package with provenance), E19 (markers are a set that adds, never hides); `ScopeChain` shared with `wbs-permissions`                                                                                                                                                                    | ranges above the project                     |
| Permissions          | `wbs-permissions`: `project.manage_settings`, `package.manage_settings`, `organization.manage_spaces`; PR #723 adds `organization.manage_settings` (P19)                                                                                                                                                                                                              | nothing new                                  |
| Versions             | `PLAN_DOCUMENT_VERSION = 11`, `CANONICAL_PLAN_INPUT_SCHEMA_VERSION = 9`; `wbs-work-packages` takes plan documents 12–14 and saved-plan inputs 10–11                                                                                                                                                                                                                   | the next one after those                     |
| A name already taken | `CalendarRangeError` (`workday.ts`, 14 uses) and the refusal reason `calendar_range` (79 uses in contracts, core, fe-01) mean a date outside the ECMAScript range                                                                                                                                                                                                     | a different word for one of the two concepts |

## Goals / Non-Goals

**Goals:** one concept for annotated days, from one day to many; a `non_working` kind that
moves human work at any scope; reproducible re-schedules; provenance on every inherited
range; every existing marker kept.

**Non-Goals:** per-person absences (CR8); `freeze` and `deadline` (Q1); working through an
inherited range (Q2); recurrence (each year's holiday is its own row); holiday feeds; any
change to agent-kind calendars or to rounding.

## Decisions

Each is assumed by the planner on 2026-10-25, overrulable by id. Q1–Q3 await Dany.

- **CR1. A calendar range replaces the calendar marker.** `(scope_kind organization | space |
project | work_package, scope_id, start_date, end_date inclusive, name, color, kind)`. A point
  marker is a one-day range of kind `note`. **Calendar marker is retired**: the term becomes
  **Calendar range** in `CONTEXT.md`, and "calendar marker" and "marker" go to its _Avoid_
  (they would otherwise name a second concept for the same row). The composer still supplies
  the id and `color NULL` still means automatic, so `marker-color` is renamed and reused, not
  rewritten.
- **CR2. Two kinds now.** `note`: no scheduling effect (today's behaviour). `non_working`: the
  range's days are off for human-kind and either-kind slices of every work package beneath
  the scope (an organization holiday, a department's off-days, a project freeze on human
  work); agent-kind slices are unaffected (ADR 0043). Weekend days inside a range are already
  off and count once. **Q1 (Dany):** add `freeze` (no step of a bound type scheduled inside;
  needs `wbs-step-catalogue`) or `deadline` (one date the critical path is compared with)
  here? Recommended: neither now. `deadline` overlaps the work item deadline that
  `deadlineOffsetOf` already serves, and `freeze` has no step-type binding to read yet; both
  fit as later kinds because `kind` is a CHECK-constrained column.
- **CR3. Scopes add, never hide (E19).** A work package's effective ranges are the union along
  its `ScopeChain` (organization, every space of the chain, project, work package), each with
  provenance `{ level, id }`. A lower scope cannot remove, edit or shorten a higher scope's
  range; that is a write at the owning scope. Two spaces of one chain both contribute (union,
  so E24's ambiguity cannot arise). **Q2 (Dany):** may a project declare an inherited
  `non_working` range as working for itself ("we work through the company holiday")?
  Recommended: no now; if needed, a later `calendar_range_exclusion(scope, range_id)` row,
  visible with its own provenance, rather than an edit of the inherited range.
- **CR4. The scheduler reads a work calendar.** `@wbs/domain` gains `WorkCalendar` (the sorted,
  de-duplicated weekday dates of the effective `non_working` ranges) and the `workday.ts`
  functions take it: `isWorkday(date, calendar)` replaces the weekend-only test at its call
  sites, and `addWorkdays`, `workdaysBetween`, `nextWorkday`, `previousWorkday` and
  `deadlineOffsetOf` skip its dates. The pass in `schedule.ts` stays in working-day offsets
  and does not change; durations in working days skip non-working dates because the offset →
  date projection does. Rounding (ADR 0011, 0042) is unchanged. Under ADR 0043 the working
  window's day set is the same `WorkCalendar`; the agent-kind calendar ignores it. Until
  `agent-calendar-instant-axis` lands every slice is on the day calendar, so every slice
  skips. A saved plan records the effective ranges (id, kind, dates, provenance) so a
  re-schedule is reproducible: plan document and saved-plan input each take the next version
  after `wbs-work-packages`' (numbered at slice time), older versions converted on read with
  an empty range set, which is what they meant (no holiday concept existed). **Trigger:**
  today's `calendar_markers_changed` is replaced by `calendar_ranges_changed { movesSchedule }`,
  `movesSchedule` true when the old or new row is `non_working`; `changesScheduleInput` admits
  it only then, as it admits `project_settings_changed` for a calendar setting today; a range
  above the work package is announced to every work package beneath through the
  committed fan-out `elsewhere_changed` uses.
- **CR5. fe-01 draws bands.** A range is a band across its days in the marker band (renamed
  range band), a one-day `note` stays a chip; `non_working` days are greyed like weekends on
  the calendar axis. A range is created by dragging across axis cells (a click is a one-day
  range). ADR 0017's refusal holds for ranges: a drag on a workday-axis cell is refused naming
  the missing start date. Provenance shows on hover ("Organization holiday · from
  organization Acme"); an inherited range opens read-only with the owning scope named. The
  density rule (`marker-rule-density.ts`) applies per day cell.
- **CR6. Routes per scope.** See Routes. A range is never "in use": delete just re-schedules,
  so there is no `409 range_in_use`.
- **CR7. Migration additive, routes breaking.** `calendar_range` is created and every
  `calendar_marker` row copied (start = end = date, kind `note`, scope as stored, id kept);
  `calendar_marker` stays, unread by new code, mirrored by triggers for the blue/green
  overlap, and is dropped by a later migration under the lint's destructive-change waiver.
  The marker routes and MCP tools are replaced, not aliased (E8).
- **CR8. Per-person absences are not ranges.** A vacation belongs to a person's availability
  (the capacity model of `share-people-across-projects` and `wbs-resources`, beside person
  load), because it moves one person, not a scope's calendar. Out of scope. **Q3 (Dany):**
  confirm.
- **CR9. The old meaning of "calendar range" is renamed** (added by the planner beyond the
  brief): `CalendarRangeError` becomes `CalendarOverflowError`, the refusal reason
  `calendar_range` becomes `calendar_overflow`, and `CONTEXT.md` gains **Calendar overflow**.
  One mechanical slice before any range code; breaking is allowed (E8). Alternative if
  overruled: name the new concept "calendar period" and leave the error alone.

## Tables

```sql
CREATE TABLE calendar_range (
  id          TEXT PRIMARY KEY,                -- composer-supplied v4 UUID (colour derives from it)
  scope_kind  TEXT NOT NULL CHECK (scope_kind IN ('organization','space','project','work_package')),
  scope_id    TEXT NOT NULL,
  start_date  TEXT NOT NULL,                   -- IsoDate
  end_date    TEXT NOT NULL,                   -- IsoDate, inclusive
  name        TEXT NOT NULL,
  color       TEXT,                            -- NULL = automatic
  kind        TEXT NOT NULL CHECK (kind IN ('note','non_working')),
  created_at  INTEGER NOT NULL,
  created_by  TEXT,
  CHECK (end_date >= start_date),
  CHECK (julianday(end_date) - julianday(start_date) < 366)
);
CREATE INDEX calendar_range_scope_start ON calendar_range(scope_kind, scope_id, start_date);
```

`scope_id` has no foreign key (it names one of four tables); deletion of a scope deletes its
ranges in the same unit of work, proven per scope kind. The 366-day bound (planner's
assumption) keeps one row's date set small and makes a typo of a year visible as `422`.

## Scheduler

1. The chain is built once per request (`ScopeChain`); `effectiveRanges(chain)` reads the
   union with provenance; `workCalendarOf(ranges)` keeps `non_working` weekday dates.
2. `addWorkdays(from, n, calendar)` keeps the weekend closed form and corrects for calendar
   dates by binary search over the sorted set (no per-day walk, the 2026-09-02 performance
   reason stands). The property test equates it with a per-day loop that skips both.
3. Cross-package bookings (`shared-people.ts`, `person-load.ts`) compare dates, not offsets;
   each work package projects through its own calendar.
4. The canonical plan input carries the effective ranges, so its hash and the optimizer's
   input change with a `non_working` edit and not with a `note` edit.

## Routes

| Route                                                          | Permission                           | Answers                                                              |
| -------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| `GET /api/organization/calendar-ranges`                        | organization member                  | own ranges                                                           |
| `POST`, `PATCH …/:rangeId`, `DELETE …/:rangeId` (organization) | `organization.manage_settings` (P19) | `201`/`200`/`204`; `422 end_before_start`, `422 range_too_long`      |
| `GET /api/spaces/:id/calendar-ranges`                          | space reader                         | own and inherited, with provenance                                   |
| writes (space)                                                 | `organization.manage_spaces`         | as above                                                             |
| `GET /api/projects/:id/calendar-ranges`                        | project reader                       | own and inherited, with provenance                                   |
| writes (project)                                               | `project.manage_settings`            | as above                                                             |
| `GET /api/work-packages/:id/calendar-ranges`                   | package reader                       | effective set, with provenance                                       |
| writes (work package)                                          | `package.manage_settings`            | as above, plus `422 undated_plan` (ADR 0017)                         |
| any `PATCH`/`DELETE` of a range owned by another scope         | —                                    | `409 inherited_range` naming the owning scope (planner's assumption) |

`404` for an unknown scope or range; `403` from the permission check. No `409 range_in_use`
(CR6). The project and space `GET`s answer inherited ranges from above only.

## fe-01

Range band replaces marker band; drag to create; composer gains start, end and kind; hover
shows provenance; greyed `non_working` cells; ADR 0017 refusal on a workday axis;
`plan-refresh.ts` routes `calendar_ranges_changed` to `['ranges']`, adding `'tree'` when
`movesSchedule`. UI reviewed by eye.

## Migration

`<date>_add_calendar_range/migration.sql`: the table, the copy, and three mirror triggers on
`calendar_marker` (insert, update, delete) so a blue instance's marker write during the swap
lands in `calendar_range`; a `CHECK (violations = 0)` guard compares counts after the copy.
`down.sql` drops the triggers and table, refusing while any row is not a one-day `note` with
a marker of the same id (it would lose a range created after the forward migration). The drop
of `calendar_marker` is a separate later migration.

## Risks

- **Closed-form drift.** A correction loop that miscounts a holiday on a weekend shifts every
  date; the property test against the per-day loop is the guard.
- **Cross-package calendars differ.** A person shared by two work packages with different
  holidays is booked by date; an offset-based comparison would double-book. Proven by a
  fixture with two calendars.
- **Fan-out cost.** An organization range re-schedules every work package; debounced by the
  existing optimizer debounce, announced once per work package.
- **Name churn.** CR9 touches 93 identifiers before any feature lands.
- **Landing order.** Needs `wbs-work-packages` slice 3a (scopes, `ScopeChain`); the
  agent-kind exemption is proven only after `agent-calendar-instant-axis` adds executor kind.
