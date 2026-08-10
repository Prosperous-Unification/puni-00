## 1. One place decides the final figure

- [x] 1.1 `finalDays`, `EstimateMethod`, `isEstimateMethod` in `libs/domain`,
      with tests: PERT agrees with `expectedDays` on every trio, the other
      three return the named point, and an unknown method throws rather than
      returning `NaN`.
- [x] 1.2 `project.estimate_method` column, migration + `down.sql` (additive,
      defaulted so every existing project keeps PERT).
- [x] 1.3 `toProject` at the repository boundary: a stored method that is not
      one of the four throws. **Negative test:** written past the repository
      with raw SQL, then read back.
- [x] 1.4 `durationsOf` and the tree read take the project's method; each row
      reports `finalDays` per role and `finalTotal`. **Negative test:** pin
      the schedule to PERT and watch "plans the dates with the same figure it
      prints" fail.
- [x] 1.5 Controller accepts `estimateMethod` on the project patch, as a
      union of the four literals rather than a string.

## 2. The table stops editing estimates

- [x] 2.1 Failing tests for a pure `trioProblem`/`sendableTrio` in
      `estimate-draft.ts`: empty is fine, ordered is fine, a broken pair names
      both members, a half-filled trio names the empty boxes, and nothing is
      ever repaired.
- [x] 2.2 Failing tests in `wbs-table.test.tsx`: one point typed sends
      nothing and keeps its value; a broken trio marks the pair; completing it
      sends exactly what was typed; the final columns show be-01's figures and
      follow the method selector.
- [x] 2.3 Delete `keepOrdered`; drafts held in the table, boxes at `4.5em`
      with `aria-invalid` and a reason; `<role> days` and `Total days`
      columns; the "Plan with" selector.
- [x] 2.4 A row holding a draft refuses the empty-row Backspace.

## 3. Gate and verification

- [x] 3.1 Format, the run-many gate, `openspec validate`, migration lint —
      recorded in `verify.md` with the fault table.
- [x] 3.2 Deploy to dev and check the migration applied against the real
      database. The red fields and the narrower boxes need Dany's screen.
