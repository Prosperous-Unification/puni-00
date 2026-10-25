## 0. Decisions

- [x] 0.1 **Q1 settled 2026-10-25 (recommendation adopted):** further kinds (`freeze`, `deadline`) in this change? Planned
      without them (CR2).
- [x] 0.2 **Q2 settled 2026-10-25 (recommendation adopted):** may a project work through an inherited `non_working`
      period? Planned as no (CR3).
- [x] 0.3 **Q3 settled 2026-10-25 (recommendation adopted):** per-person absences stay out of periods (CR8)?
- [x] 0.4 **Q4 settled 2026-10-25 (recommendation adopted):** release 1 is a uniform calendar, the agent exemption waits
      for release 2 (CR15)? Recommended: yes.
- [x] 0.5 **Q5 settled 2026-10-25 (recommendation adopted):** may a shared person work in B on A's closed day (CR12)?
      Recommended: yes.
- [x] 0.6 **Q6 settled 2026-10-25 (recommendation adopted):** explicit-date writes on an undated package accepted, the axis
      drag refused (CR19)? Recommended: yes.
- [x] 0.7 CR1–CR19 stand, overrulable by id; Q1–Q6 settled 2026-10-25 by adopting the recommendations (Dany, 2026-10-25: "go with your best assumptions"); CR10 settled 2026-10-25; CR9 stays withdrawn.
- [ ] 0.8 Landing order: `wbs-work-packages` slice 3a on `main` (scope kinds, the chain, the
      scoped marker table, the stop-the-world window) before slice 3 here; #723 (one space or
      none, P19 `organization.manage_settings`) before slices 2 and 4; the `wbs-permissions`
      matrix supplies the project, package and space permissions.

## 1. The work calendar (CR4, CR17, domain)

- [ ] 1.1 Red: `workday.property.test.ts` equates `addWorkdays(from, n, calendar)`,
      `workdaysBetween`, `nextWorkday`, `previousWorkday` and `deadlineOffsetOf` with a
      per-day loop that skips weekends and the calendar's dates, for offsets 0..500, weekday,
      weekend and holiday starts, fractional offsets, deadlines projected before day zero, and
      a thousand fast-check calendars (holidays on weekends and duplicates included). Green:
      `WorkCalendar`, `isWorkday`, the binary-search correction. R5 faults: a holiday on a
      Saturday counted twice; the correction's last round skipped; each fails the property;
      watched.
- [ ] 1.2 Red: the correction loop's bound: a calendar forcing the maximum number of rounds
      converges; a stubbed calendar that keeps reporting new dates throws after the bound.
      R5 fault: the bound removed; the stub hangs the test past its timeout; watched.
- [ ] 1.3 Red: a correction that carries a date beyond the ECMAScript range throws
      `CalendarRangeError`. R5 fault: the guard after the correction removed; the test sees an
      untyped `RangeError`; watched.

## 2. The chain (CR3, CR16)

- [ ] 2.1 Red: `effectivePeriods(chain)` answers the union with provenance for a zero-space
      and a one-space chain; `workCalendarOf` keeps only de-duplicated `non_working` weekdays.
      R5 fault: the space level dropped from the union; the one-space case fails; watched.
- [ ] 2.2 Red: a project moving space loses the old space's periods and gains the new one's.
      R5 fault: the chain cached across the move; the old period is still effective; watched.

## 3. Storage and migration (CR1, CR11, CR17)

- [ ] 3.1 Red: `calendar_period` schema tests: `garbage`, `2027-02-30`, `2027-3-10` and a
      timestamp refused; 366 inclusive days accepted, 367 refused; an end before the start
      refused. Green: the table, store-sqlite and store-memory adapters, conformance suite. R5
      fault: a date check rewritten with `=`; the `garbage` insert succeeds; watched.
- [ ] 3.2 Red: a stored row with an invalid date or unknown kind (written past the CHECK in a
      fixture) throws on read. R5 fault: the read parser replaced by a cast; the row is
      returned; watched.
- [ ] 3.3 Red: `add-calendar-period.db.test.ts` over a dev-shaped fixture, once per shape
      3a may leave: the count is equal and every period equals its marker field by field; the
      marker table is gone; `down.sql` refuses while a non-copy period exists and otherwise
      returns the markers losslessly. R5 faults: the copy's colour column dropped; the
      `down.sql` guard removed; each watched.
- [ ] 3.4 Red: deleting a scope of each kind deletes its periods in the same unit of work. R5
      fault: the space deletion's period delete removed; the orphan is observed; watched.

## 4. Routes (CR6, CR17, CR18, CR19)

- [ ] 4.1 Red: route tests per scope for `GET/POST/PATCH/DELETE` with the four permissions;
      `422 invalid_date`, `invalid_kind`, `end_before_start`, `period_too_long`; marker routes
      gone; mcp-01 tool count updated and asserted by `openapi-tools.test.ts`. R5 fault: the
      boundary date parser loosened to `Date.parse`; `2027-02-30` is accepted; watched.
- [ ] 4.2 Red: `409 inherited_period` for an ancestor's period; `404` with the absent-id body
      for another project's and another organization's period; `403` before `409` without the
      permission. R5 faults: the chain filter removed from the lookup (another project's
      period answers `409` with its owner); the authorization moved after the lookup; each
      watched.
- [ ] 4.3 Red: an explicit-date `POST` on an undated package answers `201`; a package losing
      its start date keeps its periods. R5 fault: an undated-plan refusal added to the write;
      the scenario fails; watched.

## 5. Events (CR13)

- [ ] 5.1 Red: `calendar_periods_changed` replaces `calendar_markers_changed`; a space period
      reaches every package of two unrelated projects once; a booking dependent outside the
      space hears `elsewhere_changed` only for a `non_working` change; a rolled-back write
      delivers nothing; a resumed stream replays the event with its sequence;
      `optimizer-trigger-broadcaster.test.ts` triggers for a `non_working` edit and not for a
      note edit. R5 faults: the descendant fan-out removed (the second project hears nothing);
      delivery moved before commit (the rollback test sees an event); `movesSchedule` ignored
      in `changesScheduleInput` (a note triggers); each watched.
- [ ] 5.2 Red: `project-stream.ts` parses the event payload; `resourcesFor` routes a period
      event to `['periods']` plus `'tree'` when `movesSchedule`; an absent or non-boolean
      `movesSchedule` takes the full read. R5 fault: the parser defaulting the flag to
      `false`; the malformed case skips `'tree'`; watched.

## 6. Scheduling, release 1 (CR2, CR4, CR15)

- [ ] 6.1 Red: the spec's space-holiday scenario through `work-item.resource` reads, the
      agent-kind slice included; a note leaves the schedule byte-identical; the live-plan
      identity oracles are unchanged with no periods. Green: the calendar threaded through
      `work-item.resource`, `saved-plan-schedule`, manual dates and deadlines. R5 fault: the
      calendar not passed to the projection; the slices finish Wednesday; watched.

## 7. Shared people (CR12)

- [ ] 7.1 Red: the spec's closed-day scenario in `shared-people`, person load and the fan-out
      comparison: no double booking on Thursday, no false block on Wednesday; a holiday that
      moves A's booking dates without moving its offsets is announced to B; Fast, PRI and Time
      each respect the converted segments and use the free day; fractional endpoints survive
      the round trip. Green: segments replace the anchor arithmetic at `shared-people.ts:73`,
      `:252` and `person-load.feature.ts:146–158`. R5 faults: one unsplit interval per slice
      (Wednesday falsely blocked); the receiving package converting through the booking
      package's calendar (Thursday double-booked); each watched.

## 8. Saved plans (CR14)

- [ ] 8.1 Red: plan document and saved-plan input take the next versions after
      `wbs-work-packages`'; the snapshot holds the effective periods with the hierarchy; a
      note edit changes the saved input and not `canonicalScheduleInput`; equivalent
      overlapping periods share a scheduling identity; a historical read renders captured
      periods after the ancestor is edited or deleted; older versions read with an empty set;
      a current-version body missing the field throws. R5 faults: the reader of the new
      version defaulting a missing field to empty; note names fed into the scheduling
      identity; each watched.

## 9. fe-01 (CR5, CR19)

- [ ] 9.1 Period band, drag to create, composer with start, end and kind, provenance on hover,
      read-only inherited periods, greyed `non_working` cells, density rule per day cell; an
      undated package lists periods without drawing them. Tests: `plan-refresh.test.ts`,
      component tests, a browser test for the drag and the ADR 0017 refusal. R5 faults: the
      refusal handler removed (the browser test naming the missing start date fails); the
      `'tree'` route removed (a holiday edit leaves stale bars); each watched. UI reviewed by
      eye.

## 10. Release 2 (CR15), blocked on `agent-calendar-instant-axis`

- [ ] 10.1 The agent exemption: agent-kind slices run through `non_working` periods on the
      instant axis, human-kind and either-kind slices skip them; the host builds each slice's
      calendar and the solver request carries instants. Tests: mixed dependency (human →
      agent over a holiday and back) and mixed capacity. R5 fault: the agent calendar given
      the `WorkCalendar`; the agent slice finishes Thursday; watched. The release-1
      requirement is then modified by its own delta.

## 11. Docs

- [ ] 11.1 JSDoc on `workday.ts` replaces "Public holidays are deliberately absent" with the
      `WorkCalendar` rule (excluded dates, not available days) and the loop's termination
      argument; ADR 0017 gains a line that periods follow it; `verify.md` records commands,
      results and R5 proofs.
