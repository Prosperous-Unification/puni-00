## 1. Store and validate the project-step policy

- [x] 1.1 Add failing mounted step API and store tests for omitted zero, valid hundredths, malformed/negative/over-1000/overflow values, and current response shape.
- [x] 1.2 Add additive `migration.sql` beside `down.sql`; update step types, store, service and HTTP shapes. Prove migration apply/rollback and refuse unsafe rollback with nonzero policy.
- [x] 1.3 Inject omitted validation and a broken default; watch mounted negatives fail, restore and add adjacent Proof: comments.

## 2. Charge estimates once

- [x] 2.1 Add failing arithmetic golden cases for pre-rounding uplift, two steps, parent roll-up, unknown versus explicit zero, width conversion and overflow.
- [x] 2.2 Derive charged effort at the shared slice seam and update Fast, optimized request/hash/cache and independent publication checks; invalidate cached schedules after policy edits. Bump `SCHEDULER_CONTRACT_VERSION`, regenerate versioned corpora and prove prior cached rows cannot publish.
- [x] 2.3 Inject round-before-uplift and parent double-uplift faults; watch goldens fail, restore and add adjacent Proof: comments.

## 3. Make policy editable and undoable

- [x] 3.1 Add failing settings, concurrent-edit, broadcast, one-undo and stale-undo tests before wiring the project-step editor and journalled update.
- [x] 3.2 Show base, allowance, pre-rounding and charged figures in estimate detail; test totals and live refresh. Keep raw O/R/P and zero-time unknown scheduling intact.
- [x] 3.3 Inject a stale undo and missing schedule invalidation; watch production-path negatives fail, restore and add Proof: comments.

## 4. Preserve policy across boundaries

- [x] 4.1 Add failing new and legacy import/export, project copy, child hand-down, subtree duplication, saved-plan freeze, working-plan batch visibility and generated MCP contract tests.
- [x] 4.2 Version formats with the typed-dependency change; implement explicit legacy zero conversion and required new-format field. Confirm destination policy applies once to copied base estimates.
- [x] 4.3 Inject a dropped export field or live-policy saved-plan leak or stale working-plan read; watch negatives fail, restore and add Proof: comments.

## 5. Verify

- [ ] 5.1 Run focused tests, migration lint/rollback, format, lint, typecheck, build, OpenSpec validation and applicable host gate; record exact results and R5 observations in verify.md.
