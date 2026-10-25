## 0. Decisions

- [ ] 0.1 **Q1 awaiting Dany:** further kinds (`freeze`, `deadline`) in this change? Planned
      without them (CR2).
- [ ] 0.2 **Q2 awaiting Dany:** may a project work through an inherited `non_working` range?
      Planned as no (CR3).
- [ ] 0.3 **Q3 awaiting Dany:** per-person absences stay out of ranges (CR8)?
- [ ] 0.4 Dany confirms or amends CR1–CR9; CR9 (renaming the old `calendar_range` refusal) is
      the planner's addition beyond the brief.
- [ ] 0.5 Landing order: `wbs-work-packages` slice 3a on `main` (scope kinds, `ScopeChain`,
      `calendar_marker(scope_kind, scope_id, …)`) before slice 2 here; `wbs-permissions` P19
      (`organization.manage_settings`) before the organization routes in slice 4.

## 1. Calendar overflow rename (CR9)

- [ ] 1.1 Mechanical rename `CalendarRangeError` → `CalendarOverflowError`, refusal reason
      `calendar_range` → `calendar_overflow`, `calendarRangeScheduler` → its overflow name,
      across contracts, domain, core, be-01, fe-01; OpenAPI regenerated. Tests: the existing
      overflow tests under the new names. R5 fault: the guard in `addWorkdays` removed;
      `reports an offset beyond Date's range as a calendar-overflow error` fails with an
      untyped `RangeError`; watched. `git grep -n calendar_range` answers nothing outside
      this change's docs.

## 2. The work calendar (CR4, domain)

- [ ] 2.1 Red: `workday.property.test.ts` equates `addWorkdays(from, n, calendar)`,
      `workdaysBetween`, `nextWorkday`, `previousWorkday` and `deadlineOffsetOf` with a
      per-day loop that skips weekends and the calendar's dates, for offsets 0..500, every
      weekday start and a thousand fast-check calendars (holidays on weekends included).
      Green: `WorkCalendar`, `isWorkday`, the binary-search correction. R5 faults: a holiday
      on a Saturday counted twice; the correction's last step skipped; each fails the
      property; watched.
- [ ] 2.2 Red: `effectiveRanges(chain)` answers the union with provenance across organization,
      two spaces, project and work package; `workCalendarOf` keeps only `non_working`
      weekdays. R5 fault: the space level dropped from the union; the three-level scenario
      fails; watched.

## 3. Storage and migration (CR1, CR7)

- [ ] 3.1 Red: `add-calendar-range.db.test.ts` over a dev-shaped fixture: every marker copied
      as a one-day `note` with id, scope, name and colour kept; the count guard refuses an
      injected mismatch; a marker insert, update and delete after migration mirror into
      `calendar_range`; `down.sql` refuses while a non-copy range exists and succeeds
      otherwise. Green: `migration.sql`, `down.sql`, store-sqlite and store-memory adapters,
      conformance suite. R5 faults: the guard replaced by `CHECK (1)`; the delete mirror
      trigger removed; the `down.sql` guard removed; each watched.
- [ ] 3.2 Red: deleting a scope of each kind deletes its ranges in the same unit of work.
      R5 fault: the space deletion's range delete removed; the orphan is observed; watched.

## 4. Routes and events (CR3, CR6)

- [ ] 4.1 Red: route tests per scope for `GET/POST/PATCH/DELETE` with the four permissions,
      `422 end_before_start`, `422 range_too_long`, `422 undated_plan` (work package only),
      `409 inherited_range`, `404`, `403`; marker routes gone; mcp-01 tool count updated and
      asserted by `openapi-tools.test.ts`. R5 faults: the undated-plan check removed; the
      ownership check removed (a work package deletes an organization range); each watched.
- [ ] 4.2 Red: `calendar_ranges_changed { movesSchedule }` replaces
      `calendar_markers_changed`; `optimizer-trigger-broadcaster.test.ts` triggers for a
      `non_working` edit and not for a `note` edit; a space range announces to every work
      package of the space once. R5 faults: `movesSchedule` ignored in `changesScheduleInput`
      (a `note` edit triggers); the fan-out removed (a second work package sees no event);
      each watched.

## 5. Scheduling (CR2, CR4)

- [ ] 5.1 Red: the spec's space-holiday scenario through `work-item.resource` reads; a `note`
      leaves the schedule byte-identical; the live-plan identity oracles are unchanged with no
      ranges. Green: the calendar threaded through `work-item.resource`, `saved-plan-schedule`,
      `person-load`, `shared-people`. R5 fault: the calendar not passed to the projection;
      the human slice finishes Wednesday; watched.
- [ ] 5.2 Red: a person shared by two work packages with different holidays is booked by date
      with no double booking. R5 fault: the second package projected through the first's
      calendar; the overlap is observed; watched.
- [ ] 5.3 Plan document and saved-plan input take the next versions after
      `wbs-work-packages`'; the effective ranges recorded; older versions read with an empty
      set; a saved plan re-schedules to the same dates after a range is added later. R5
      fault: the reader of the new version drops the ranges; the reproducibility test fails;
      watched.
- [ ] 5.4 Blocked on `agent-calendar-instant-axis` executor kind: the agent-kind slice of the
      spec scenario ignores the range, either-kind skips it. R5 fault: the agent calendar
      given the `WorkCalendar`; the agent slice finishes Thursday; watched.

## 6. fe-01 (CR5)

- [ ] 6.1 Range band, drag to create, composer with start, end and kind, provenance on hover,
      read-only inherited ranges, greyed `non_working` cells, density rule per day cell;
      `plan-refresh.ts` routes `calendar_ranges_changed` to `['ranges']` plus `'tree'` when
      `movesSchedule`. Tests: `plan-refresh.test.ts`, component tests, a browser test for the
      drag and the ADR 0017 refusal. R5 faults: the refusal handler removed (the browser test
      naming the missing start date fails); the `'tree'` route removed (a holiday edit leaves
      stale bars); each watched. UI reviewed by eye.

## 7. Docs

- [ ] 7.1 JSDoc on `workday.ts` replaces "Public holidays are deliberately absent" with the
      `WorkCalendar` rule; ADR 0017 gains a line that ranges follow it; `verify.md` records
      commands, results and R5 proofs.
