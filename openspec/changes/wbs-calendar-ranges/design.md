## Context

Read on 2026-10-25 on `origin/main` at `830e774d2`. The change folder keeps the name
`wbs-calendar-ranges`; the domain term is **Calendar period** (CR10).

| Need                 | Exists today                                                                                                                                                                                                                                                                                                                                                     | Missing                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| A marker             | `calendar_marker(id, project_id, date, name, color, created_at)` (`20260905090000_add_calendar_marker`; schema `libs/wbs/adapters/store-sqlite/src/schema.ts`); the id is supplied by the composer because the automatic colour derives from it, `color NULL` means automatic; index `calendar_marker_project_date`                                              | more than one day; scopes above the project |
| The term             | `CONTEXT.md` **Calendar marker**: "A named annotation on an absolute calendar date … Not a work item and not visible to the scheduler."                                                                                                                                                                                                                          | a kind the scheduler reads                  |
| The undated plan     | ADR 0017 refuses a marker click on a workday-axis cell, naming the missing start date; the marker routes accept explicit dates without a start date                                                                                                                                                                                                              | a decision for explicit-date writes (CR19)  |
| The chart            | `apps/wbs/fe-01/src/components/wbs/gantt-panel.tsx` draws markers as chips in a marker band; `marker-rule-density.ts` thins rules; `@wbs/domain/marker-color` derives colours                                                                                                                                                                                    | bands across days                           |
| Weekends             | `libs/wbs/domain/domain/src/workday.ts`: `isWeekend`, closed-form `addWorkdays`, `workdayOrdinalOf`, `deadlineOffsetOf`; its JSDoc refuses holidays "guessed", asking for "a calendar it owns". `schedule.ts` (around line 3212): "Everything here is an offset from day zero, in working days … weekends are counted in exactly one place." No holiday concept. | a set of excluded dates                     |
| The solver boundary  | The engines never see a date: `saved-plan-schedule.ts:86` converts manual dates to offsets before the pass, and `build-solver-request.ts:203` sends floors and deadlines as offsets on wire v4                                                                                                                                                                   | nothing for one uniform calendar (CR15)     |
| Two calendars        | ADR 0043 is `status: proposed`; `agent-calendar-instant-axis/tasks.md` has 1 of 31 tasks checked; `git grep executor_kind -- libs apps` answers nothing                                                                                                                                                                                                          | the instant axis release 2 needs (CR15)     |
| Shared bookings      | One common weekday ordinal axis: `shared-people.ts:73` subtracts the reader's `workdayOrdinalOf` anchor from other packages' bookings, `:252` adds the anchor to slice offsets; `person-load.feature.ts:146–158` does the same; `shared-people-fanout.ts` compares on that axis                                                                                  | an axis on which two calendars agree (CR12) |
| Re-schedule trigger  | `changesScheduleInput` in `optimizer-trigger-broadcaster.ts`; `calendar_markers_changed` (`ports/project-event.ts:198`) is absent from it and fe-01 `plan-refresh.ts:51` routes it to `['markers']`; `committed-fanout.ts` follows shared-person connections only (`:59` answers none outside `shared` mode)                                                     | a fan-out to every package beneath a scope  |
| The event in fe-01   | `project-stream.ts:62` `onChange(changed?: string \| null, seq?)`; `resourcesFor(changed?: string \| null)` reads only the type word                                                                                                                                                                                                                             | a typed payload (CR13)                      |
| Store scoping        | `calendar-marker.ts:24`: every query is scoped by `projectId` in its `WHERE`, so another project's marker answers `not_found`                                                                                                                                                                                                                                    | the same rule per scope chain (CR18)        |
| Layers               | `wbs-work-packages` E18 (catalogue with provenance), E19 (markers add, never hide), E24 on this tree still allows many spaces; #723 amends the chain to one space or none                                                                                                                                                                                        | periods above the project                   |
| Permissions          | `wbs-permissions` matrix: `project.manage_settings`, `package.manage_settings`, `organization.manage_spaces`; #723 adds `organization.manage_settings` (P19)                                                                                                                                                                                                     | nothing new                                 |
| Identities           | Two canonicalizers: saved-plan input (`canonical-plan-input.ts`, `CANONICAL_PLAN_INPUT_SCHEMA_VERSION = 9`) captures authored content; `canonicalScheduleInput` (`canonical-schedule-input.ts:237`) captures scheduler arguments; `PLAN_DOCUMENT_VERSION = 11`; `wbs-work-packages` takes plan documents 12–14 and saved-plan inputs 10–11                       | which one sees which period field (CR14)    |
| A name already taken | `CalendarRangeError` (`workday.ts`) and the refusal reason `calendar_range` (`calendar-horizon-guard` spec) mean a date outside the ECMAScript range; the review counted 14 and 79 occurrences across `libs` and `apps`                                                                                                                                          | nothing: the new concept is a period (CR10) |

## Goals / Non-Goals

**Goals:** one concept for annotated days, from one day to many; a `non_working` kind that
moves work at any scope; correct shared bookings across different calendars; reproducible
re-schedules; provenance on every inherited period; every existing marker kept.

**Non-Goals:** per-person absences (CR8); `freeze` and `deadline` (Q1); working through an
inherited period (Q2); the agent-kind exemption in release 1 (CR15); recurrence (each year's
holiday is its own row); holiday feeds; any change to rounding.

## Decisions

Each is assumed by the planner on 2026-10-25, overrulable by id. Q1–Q6 await Dany. CR1–CR9
are the first draft, amended in place where a later decision changes them.

- **CR1. A calendar period replaces the calendar marker.** Columns: scope kind (organization,
  space, project or work package), scope id, start date, inclusive end date, name, colour,
  kind. A point marker is a one-day period of kind `note`. **Calendar marker is retired**:
  `CONTEXT.md` names the term **Calendar period** (CR10), and "range", "marker" and
  "calendar marker" go to its _Avoid_. The composer still supplies the id and `color NULL`
  still means automatic, so `marker-color` is renamed and reused, not rewritten.
- **CR2. Two kinds now.** `note`: no scheduling effect (today's behaviour). `non_working`:
  the period's days are off for the slices of every dated work package beneath the scope (an
  organization holiday, a department's off-days, a project closure). Which slices: every
  slice in release 1, human-kind and either-kind only in release 2 (CR15). Weekend days inside
  a period are already off and count once. **Q1 (Dany):** add `freeze` (no step of a bound
  type scheduled inside; needs `wbs-step-catalogue`) or `deadline` (one date the critical
  path is compared with) here? Recommended: neither now; both fit later because `kind` is a
  CHECK-constrained column.
- **CR3. Scopes add, never hide (E19).** A work package's effective periods are the union
  along its chain (CR16), each with provenance `{ level, id }`. A lower scope cannot remove,
  edit or shorten a higher scope's period; that is a write at the owning scope (CR18). **Q2
  (Dany):** may a project declare an inherited `non_working` period as working for itself?
  Recommended: no now; if needed, a later `calendar_period_exclusion` row with its own
  provenance, rather than an edit of the inherited period.
- **CR4. The scheduler reads a work calendar.** `@wbs/domain` gains `WorkCalendar`: the
  sorted, de-duplicated set of excluded weekday dates of the effective `non_working` periods
  (weekends stay in the closed form). The `workday.ts` functions take it: `isWorkday`
  replaces the weekend-only test at its call sites, and `addWorkdays`, `workdaysBetween`,
  `nextWorkday`, `previousWorkday` and `deadlineOffsetOf` skip its dates. The pass in
  `schedule.ts` stays in working-day offsets and does not change; dates move because the
  offset → date projection and the date → offset conversion of manual dates and deadlines
  read the calendar. Rounding (ADR 0011, 0042) is unchanged. Identities: CR14. Events: CR13.
- **CR5. fe-01 draws bands.** A period is a band across its days in the marker band (renamed
  period band); a one-day `note` stays a chip; `non_working` days are greyed like weekends on
  the calendar axis. A period is created by dragging across axis cells (a click is a one-day
  period). Provenance shows on hover ("Organization holiday · from organization Acme"); an
  inherited period opens read-only with the owning scope named. The density rule
  (`marker-rule-density.ts`) applies per day cell. Undated packages: CR19.
- **CR6. Routes per scope.** See Routes. A period is never "in use": delete just
  re-schedules, so there is no `409 period_in_use`.
- **CR7. Migration.** _Superseded by CR11:_ the first draft's mirror triggers and count guard
  are dropped.
- **CR8. Per-person absences are not periods.** A vacation belongs to a person's availability
  (the capacity model of `share-people-across-projects` and `wbs-resources`), because it moves
  one person, not a scope's calendar. Out of scope. **Q3 (Dany):** confirm.
- **CR9. Withdrawn by CR10.** The first draft renamed `CalendarRangeError` and the refusal
  reason `calendar_range`; both keep their names and the `calendar-horizon-guard` contract
  stands unamended.

### Decisions after the Codex review

The review (PR #726 comment, 2026-10-25) found 10 findings; each decision names its finding.

- **CR10. The term is Calendar period (F10).** Table `calendar_period`, routes
  `…/calendar-periods`, kinds unchanged, capability `calendar-periods`. Cheaper than renaming
  an established refusal: no existing contract changes, and the glossary gains no Calendar
  overflow term. _Settled by Dany 2026-10-25: "calendar period is FINE"._ CR9 stays withdrawn.
- **CR11. The migration runs inside `wbs-work-packages` slice 3a's stop-the-world window
  (F1).** This change already depends on 3a, which lifts markers to scope kinds under that
  window. Its migration copies every marker into `calendar_period` (id, scope kind, scope id,
  name, colour and created-at kept; start and end equal to the date; kind `note`) and drops the
  marker table under the window's waiver. It reads whichever shape 3a leaves: a
  `calendar_marker` table carrying `scope_kind` and `scope_id` (E19's shape), or, if 3a has
  already rebuilt markers into a differently named scoped table, that table. Rollback is the
  window's snapshot restore (E14 as rewritten by #723's E38; cited by id, the text is not on
  this tree). No old writer runs during the window (both colours are stopped), so no
  coexistence contract, mirror trigger or count guard is needed. `down.sql` exists because
  migration lint and rollback require one; it recreates the marker table from one-day `note`
  rows and refuses while any other period exists.
- **CR12. Shared bookings live on a common date axis (F3).** The draft's "compare dates, not
  offsets" was false: today every booking is an interval on one weekday ordinal axis. An
  occupied segment is a half-open interval of calendar-day ordinals (weekends included) with
  fractional endpoints kept. The booking package projects each slice through its own work
  calendar and splits it at every excluded date and weekend, so a two-day slice from Tuesday
  over a Wednesday holiday becomes Tuesday and Thursday. Each receiving package converts the
  segments into its own working offsets before scheduling, clipping its own excluded dates.
  This replaces the anchor arithmetic at `shared-people.ts:73` and `:252` and
  `person-load.feature.ts:146–158`, and `shared-people-fanout.ts` compares segment sets, so a
  holiday that moves a booking's dates without moving its offsets is announced. Fast, PRI and
  Time receive converted intervals; their code is unchanged. **Q5 (Dany):** may the shared
  person work in B on A's closed day? Recommended: yes (the segments above); if no, A's
  closed days also become segments.
- **CR13. A scope-descendant fan-out (F5).** The event `calendar_periods_changed`, with
  fields `scopeKind`, `scopeId` and `movesSchedule`, replaces `calendar_markers_changed`. It
  is captured in the write's unit of work and delivered after commit to every work package
  beneath the scope, as a fan-out separate from the shared-person one; a rolled-back write
  delivers nothing; it carries the stream sequence and replays like any event.
  `movesSchedule` is true when the old or new row is `non_working`, and `changesScheduleInput`
  admits the event only then, so a note never triggers optimization. Effects on packages
  outside the scope follow only for `non_working` changes, through the existing
  `elsewhere_changed` mechanism once the descendants' bookings move (CR12). `project-stream.ts`
  `onChange` carries a typed event payload parsed at the socket; a period event without a
  boolean `movesSchedule` is an unrecognised event and takes the full read, never `false`.
- **CR14. Two identities (F6).** The saved-plan input snapshot stores the effective periods
  (id, scope, dates, kind, name, colour) captured with the hierarchy in the same read as the
  plan, for historical rendering and provenance; it changes with a note edit.
  `canonicalScheduleInput` includes only the sorted, de-duplicated effective `non_working`
  dates of the package, so overlapping equivalent periods share a scheduling identity and a
  note edit leaves it unchanged. Plan document and saved-plan input take the next versions
  after `wbs-work-packages`' (numbered at slice time); historical versions convert to an empty
  set (no holiday concept existed); a current-version body missing the field or malformed
  throws.
- **CR15. Two releases (F4).** Release 1 is a uniform working calendar: every slice,
  agent-kind included, skips non-working days. It needs no solver change (see Context).
  Release 2 is blocked on `agent-calendar-instant-axis` (ADR 0043 proposed, not in code): it
  adds the agent exemption on the instant axis. The boundary: the host builds each slice's
  calendar (working window with the `WorkCalendar`, or continuous) and the solver request
  carries instants rather than one compressed day axis, so mixed calendars need mixed
  dependency tests (human → agent over a holiday and back) and mixed capacity tests. **Q4
  (Dany):** may release 1 be uniform? Recommended: yes.
- **CR16. One space or none (F2).** The chain is organization → optional single space →
  mandatory project → work package (#723's amendment; E24 on this tree still allows many and
  is #723's to change). Fixtures cover zero-space and one-space chains. A project changing
  space re-resolves its packages' effective periods (the old space's leave, the new space's
  join) and announces `calendar_periods_changed` to every package of the project, with
  `movesSchedule` true when either space holds a `non_working` period.
- **CR17. Validation (F7).** A strict `IsoDate` (four-digit year, two-digit month and day, a
  real calendar date) at the request boundary, `422 invalid_date` otherwise; an unknown kind
  is `422 invalid_kind`; a stored row is parsed on read and a malformed one throws. SQL checks
  each date with `IS date(…)`, not `=`: the `=` form passes `'garbage'`, because
  `date('garbage')` is NULL and a NULL CHECK passes (probed, see Tables). At most 366
  inclusive days: `422 period_too_long` at the route and a CHECK in SQL. The correction loop
  in `addWorkdays` terminates: each round extends the target by the excluded dates newly
  inside the window, and an empty round ends it, so it runs at most one round more than the
  count of distinct excluded dates in the horizon; exceeding that throws. A corrected date
  beyond the ECMAScript range throws `CalendarRangeError`.
- **CR18. Ownership refusal without disclosure (F8).** A write authorizes the addressed scope
  first (404 for an unknown or unreadable scope, 403 without the permission). Then the period
  id is looked up only in that scope's effective chain: its own period proceeds; an ancestor's
  answers `409 inherited_period` naming the owner, which the caller can already read; any
  other id, another project's or another organization's, answers `404` identical to an absent
  id. Permissions: project, work package and space writes from the `wbs-permissions` matrix;
  organization writes from #723's P19.
- **CR19. Undated plans (F9).** ADR 0017's axis refusal stands: a drag on a workday-axis cell
  is refused naming the missing start date. Explicit-date API and MCP writes are accepted on
  an undated package, because a period is absolute dates. An undated package lists its own
  and inherited periods without drawing them, and they move no slice (there is no date to
  project). A package becoming undated keeps its periods; they can still be edited and
  deleted. **Q6 (Dany):** confirm. Recommended: this.

## Tables

```sql
CREATE TABLE calendar_period (
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
  CHECK (start_date IS date(start_date) AND end_date IS date(end_date)),
  CHECK (end_date >= start_date),
  CHECK (julianday(end_date) - julianday(start_date) < 366)
);
CREATE INDEX calendar_period_scope_start ON calendar_period(scope_kind, scope_id, start_date);
```

Probe (2026-10-25, `bun:sqlite`, SQLite 3.53.4, in memory): with the `IS` checks,
`'garbage'`, `'2027-02-30'`, `'2027-3-10'` and `'2027-03-10T00:00'` are refused,
2027-01-01..2028-01-01 (366 days) is accepted, 2027-01-01..2028-01-02 (367) and an end before
its start are refused. With `start_date = date(start_date)` instead, `'garbage'` was accepted.

`scope_id` has no foreign key (it names one of four tables); deletion of a scope deletes its
periods in the same unit of work, proven per scope kind; no old writer exists (CR11).

## Scheduler

1. The chain (CR16) is built once per request; `effectivePeriods(chain)` reads the union with
   provenance; `workCalendarOf(periods)` keeps the de-duplicated weekday dates of
   `non_working` periods.
2. `addWorkdays(from, n, calendar)` keeps the weekend closed form and corrects for calendar
   dates by binary search over the sorted set (no per-day walk); termination per CR17. The
   property test equates it with a per-day loop that skips both, including weekend and
   holiday starts, fractional offsets, and deadlines projected before day zero.
3. Shared bookings: CR12.
4. Identities: CR14.

## Routes

| Route                                                            | Permission                                       | Answers                                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `GET /api/organization/calendar-periods`                         | organization member                              | own periods                                                                                              |
| `POST`, `PATCH …/:periodId`, `DELETE …/:periodId` (organization) | `organization.manage_settings` (#723 P19)        | `201`/`200`/`204`; `422 invalid_date`, `422 invalid_kind`, `422 end_before_start`, `422 period_too_long` |
| `GET /api/spaces/:id/calendar-periods`                           | space reader                                     | own and inherited, with provenance                                                                       |
| writes (space)                                                   | `organization.manage_spaces` (`wbs-permissions`) | as above                                                                                                 |
| `GET /api/projects/:id/calendar-periods`                         | project reader                                   | own and inherited, with provenance                                                                       |
| writes (project)                                                 | `project.manage_settings` (`wbs-permissions`)    | as above                                                                                                 |
| `GET /api/work-packages/:id/calendar-periods`                    | package reader                                   | effective set, with provenance, dated or not (CR19)                                                      |
| writes (work package)                                            | `package.manage_settings` (`wbs-permissions`)    | as above                                                                                                 |
| `PATCH`/`DELETE` of an ancestor's period in the chain            | the addressed scope's write permission           | `409 inherited_period` naming the owner (CR18)                                                           |
| any other foreign period id                                      | —                                                | `404`, identical to an absent id (CR18)                                                                  |

`404` for an unknown or unreadable scope; `403` from the permission check, before the period
lookup. `PATCH` replaces only the fields it names and re-validates the whole row.

## fe-01

Period band replaces marker band; drag to create; composer gains start, end and kind; hover
shows provenance; greyed `non_working` cells; ADR 0017 refusal on a workday axis; undated
packages list periods without drawing them (CR19). `plan-refresh.ts` routes
`calendar_periods_changed` to `['periods']`, adding `'tree'` when `movesSchedule` (CR13). UI
reviewed by eye.

## Migration

`<date>_add_calendar_period/migration.sql`, deployed in slice 3a's window (CR11): the table,
the copy, the drop of the marker table under the window's waiver. `down.sql` recreates the
marker table from one-day `note` rows and refuses while any other period exists. Tests: the
copy's count and field-by-field equality over a dev-shaped fixture for each shape 3a may
leave; `down.sql` refusal and lossless return.

## Risks

- **Closed-form drift.** A correction that miscounts a holiday on a weekend shifts every date;
  the property test against the per-day loop is the guard.
- **Cross-package calendars differ.** Wrong conversion double-books a person or blocks free
  time; CR12's fixtures prove both directions in person load, the fan-out comparison and each
  engine.
- **Fan-out cost.** An organization period re-schedules every work package; debounced by the
  existing optimizer debounce, announced once per work package.
- **Landing order.** Needs `wbs-work-packages` slice 3a and its window (CR11) and #723 (chain,
  P19); release 2 needs `agent-calendar-instant-axis`.
