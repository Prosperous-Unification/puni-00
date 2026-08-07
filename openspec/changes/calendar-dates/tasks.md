## 1. Working-day arithmetic, in one place

- [x] 1.1 `libs/domain/workday.ts`: `isIsoDate`, `isWeekend`, `nextWorkday`,
      `addWorkdays`, `workdaysBetween`, with tests — the weekend step, a plan
      starting on a Saturday, a fractional offset, a month and year boundary,
      and `workdaysBetween` inverting `addWorkdays`.
- [x] 1.2 Negative behaviour: a negative offset throws rather than counting
      backwards; a date before the start is zero rather than negative.

## 2. be-01

- [x] 2.1 `project.start_date` and `work_item.start_no_earlier_than`,
      migration + `down.sql` (additive, both nullable).
- [x] 2.2 `schedule` takes `notBefore` offsets and uses them as a floor
      alongside the predecessors' finishes. **Negative test:** drop the
      argument and watch the constraint test fail.
- [x] 2.3 The tree read converts dates to offsets before the pass and offsets
      to dates after it; no dates when the project has no start date or the
      schedule failed. **Negative test:** make `addWorkdays` count calendar
      days and watch six tests fail.
- [x] 2.4 Both patch routes validate a day; a shape-valid non-day is 422.

## 3. fe-01

- [x] 3.1 A project start date input in the toolbar; a "Not before" date cell
      per row; Starts and Ends show dates when there are any and offsets when
      there are not.
- [x] 3.2 Failing tests first: offsets until a start date, dates after, and
      the constraint sent and cleared.

## 4. Gate and verification

- [x] 4.1 Format, the run-many gate, `openspec validate`, migration lint —
      recorded in `verify.md` with the fault table.
- [x] 4.2 Deploy to dev and exercise the dates against the real database.
