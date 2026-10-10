## 0. Spec — BLOCKED on 010.4.13.3 (participation, Codex-owned)

- [x] 0.1 Intent, delta spec and ADR 0045. OpenSpec validation green (020.11, 2026-10-11).
      No `design.md`: the shape is ADR 0045 plus `step-node-readings/design.md` D1–D2.
- [ ] 0.2 Unblock check: `configure-project-step-workflows` is on `main` with participation
      stored and `step-node-readings` has landed. Until both, no task below is opened.
- [ ] 0.3 Apply the deferred glossary entries from
      `puni-plan/batch-10/interviews/glossary-delta.md`: rewrite **Status**, add
      **Participation** beside **Progress** in `CONTEXT.md`.

## 1. The fold

- [ ] 1.1 Red: `roll-up.test.ts` "folds over every included node of every project step",
      "a silent included QA keeps a leaf in progress", "a skipped node is absent", "all included
      silent is unknown", "the parent fold is unchanged" (the partition property still holds);
      `node-reading.test.ts` "skipped is produced from stored participation";
      `work-item.resource.test.ts` mounted "the row menu's done still finishes a leaf".
- [ ] 1.2 Green: `includedNodesOf(leaf, steps, participation)` replaces `workedStepsOf` as the
      fold's step set in `rollUpProgress`; the reading's `participation` input wired.
- [ ] 1.3 Negatives: the step set reverted to worked steps → "a silent included QA keeps a
      leaf in progress" reads `done`; skipped nodes left in the fold → "a skipped node is
      absent".

## 2. The last included node

- [ ] 2.1 Red: the participation command's mounted test "refuses to skip the last included
      node with 409 last_included_node and writes nothing".
- [ ] 2.2 Green: the refusal in the stage-8 command's normalizer, counted in the transaction.
- [ ] 2.3 Negative: the count check removed → the case answers `200` and the leaf has no
      included node.

## 3. Dev-store report

- [ ] 3.1 Run the fold before and after on a copy of wbs-dev's database; list every leaf whose
      status moves (project, number, before, after) in `verify.md`; confirm rows marked done
      from the menu are absent from the list.

## 4. Verify

- [ ] 4.1 Affected tests, the format check, `lint:fast`, `typecheck`, OpenSpec validation,
      the host gate; outputs, the moved list and every proof row in `verify.md`.
