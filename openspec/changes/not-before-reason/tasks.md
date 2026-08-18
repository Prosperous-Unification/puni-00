## 1. The rule both apps share

- [x] 1.1 `libs/domain/src/not-before.ts`: `LONGEST_NOT_BEFORE_REASON` (200) and
      `isOrphanedNotBeforeReason`. The JSDoc argues why the pair is refused
      rather than tidied, and why the asymmetry runs the way it does — a reason
      is meaningless without a date, a date is complete without a reason.
      Exported from `index.ts`.
- [x] 1.2 `not-before.test.ts`, five cases: the one refused pair, the three real
      ones, the bound, and an empty string as a reason that still needs a date.
      **Negative:** the predicate written symmetrically, which refuses every
      not-before that exists today — verify.md F2.

## 2. The column, and the migration that adds it

- [x] 2.1 `workItem.startNoEarlierThanReason` in `schema.ts`: nullable `text`, no
      default. The JSDoc says what it is words about, what it is **not** (a
      state, a second constraint, anything the scheduler reads), and why there is
      no `CHECK`.
- [x] 2.2 `drizzle/20260818090000_add_not_before_reason/{migration,down}.sql`.
      **Stamp checked against all twenty folders on disk first**, and against
      `duplicateMigrationStamps`. The forward file argues the refused `CHECK` at
      length; the down file says what the rollback takes (the words) and what it
      leaves (every date).
- [x] 2.3 `migrate.test.ts`, four cases: the outgoing release can still insert a
      work item, **the outgoing release can still clear a not-before on a row the
      new one explained**, a row that predates the column gets no reason, and the
      rollback takes the words and leaves the date. **Negatives:** a
      `NOT NULL DEFAULT ''` on the column, and the refused `CHECK` — verify.md
      F1, F3.
- [x] 2.4 The rollback ordering lists in `migrate.test.ts` and
      `migrate-down.test.ts`, and the case named
      `does nothing when the target is already the newest applied` now names
      this migration.

## 3. The write path

- [x] 3.1 `WorkItemPatch.startNoEarlierThanReason` and
      `WorkItem.startNoEarlierThanReason` in `repository/index.ts`;
      `not_before_reason_needs_a_date` on `WorkItemPatched` and on
      `WorkItemRefusal`, each with the JSDoc that says why it is 400 and not 409.
- [x] 3.2 `WorkItemRepository.patch`: the field in the names-nothing check, and
      the pair rule **inside the update's own transaction**, read through
      `mergedNotBefore` and asked only where the patch names one of the two.
      **Negatives:** the refusal deleted, and the names-nothing line deleted —
      verify.md F4, F5.
- [x] 3.3 `work-item.test.ts`, five cases: words written beside a date, a reason
      with no date refused, a date cleared out from under the words refused, the
      pair taken off together, and a rename on a dateless row still legal.
- [x] 3.4 `inMemoryWorkItems` mirrors both — the merge and the refusal — because
      a fixture laxer than the store it stands for lets a test pass here and fail
      against SQLite.

## 4. The boundary

- [x] 4.1 `asOptionalReason` in `work-item.controller.ts`: text, trimmed, blank
      to `null`, bounded at `LONGEST_NOT_BEFORE_REASON` **after** the trim. The
      JSDoc says why the pair rule is deliberately not here. **Negatives:** the
      bound deleted and the blank normalisation deleted — verify.md F6, F7.
- [x] 4.2 The route's OpenAPI: the field, its refusals, and the sentence a client
      most needs — clearing the date means clearing this in the same request.
- [x] 4.3 `work-item.controller.test.ts`, four cases: the pair taken and given
      back, both halves of the refusal plus the legal double clear, the two
      boundary refusals with the 200-character edge accepted, and the blank/trim
      normalisation.

## 5. What it must not do

- [x] 5.1 `work-item.service.test.ts`: the case
      `moves no date: the plan schedules identically with and without a reason`,
      over a dependency chain, asserting
      the rows' schedules, their dates **and** the slices the chart is drawn
      from. **Negative:** the engine wired to read the reason — verify.md F9.
      `git diff --stat origin/main -- apps/be-01/src/service/schedule.ts` is the
      mechanical half, quoted in verify.md.
- [x] 5.2 `fieldsOf` and `revertTo` in `work-item.service.ts` name the field, and
      the inverse names both halves of any pair the forward named. `undo.test.ts`
      covers a reason undone alone and a pair undone together. **Negatives:** the
      `fieldsOf` line and the `revertTo` line — verify.md F8, F10.
- [x] 5.3 The duplicate carries the pair (the copy is under the same constraint),
      asserted in the existing case
      `copies notes, estimates, assignees, the team label and the date`.

## 6. The two faces

- [x] 6.1 `gantt-geometry.ts`: `GanttRow.notBeforeReason`, `notBeforeFloorWords`,
      and the `notBefore` arm of `floorWordsOf` split out of the shared record.
      **Negatives:** the null arm deleted (the word `null` on every dated bar)
      and the append moved out of the `notBefore` arm — verify.md F11, F12.
- [x] 6.2 `gantt-geometry.test.ts`, four cases: the explained floor, the
      unexplained one, a bar held by something else, and both bars of a two-role
      row saying the same thing.
- [x] 6.3 `plan-export.ts`: `Not before because`, its own column beside the date.
      `plan-export.test.ts` covers the cells, the blanks and the escaping of a
      reason holding a comma, a quote, a pipe, a newline and a formula leader.
- [x] 6.4 `wbs-api.ts` carries the field on the row and on the patch, with the
      client-facing half of the pair rule on it.

## 7. The record

- [x] 7.1 `CONTEXT.md`: **Not-before reason**, beside **Not-before flag**.
- [x] 7.2 `proposal.md`, `design.md`, this file, the spec delta, and `verify.md`
      with its R5 table — **including the three edits owed in `wbs-table.tsx`**,
      which this change did not own and which are named in the proposal, in the
      report and on both optional fields.
