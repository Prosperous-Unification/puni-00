<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 0. Ordering

- [ ] 0.1 **After `project-config-modal`** (design D5): the setting's UI is a section of that modal, and running first would add a dialog that change deletes.
- [ ] 0.2 Write the ADR — a dependency's reach is a project's choice — in `docs/adr/`, per `.agents/skills/domain-modeling/ADR-FORMAT.md`. It supersedes nothing; `dep-waits-on-first-role`'s reasoning becomes the `anchor-slice` arm's justification and is cited.

## 1. The column and the read

- [ ] 1.1 Migration: `ALTER TABLE project ADD COLUMN dep_reach TEXT NOT NULL DEFAULT 'whole-item';` with `down.sql` dropping it — test: `migrate-down.test.ts` round trip; migration lint green (additive forward, destructive down in its own file).
- [ ] 1.2 The repository read parses the stored value into the two-member enum and **throws** on anything else — test: `project.test.ts` `an unrecognised stored reach is refused`; negative: the throw replaced by `?? 'whole-item'`, watched failing on that case. R5: unknown is not OK, and this is the arm that would otherwise schedule a plan by a rule nobody chose.

## 2. The engine

- [ ] 2.1 `reachedSliceOf(reach, leaf, slices)` with the two arms; `anchorSliceOf` becomes the `anchor-slice` arm and keeps its tests — test: `schedule.test.ts` `a project's reach decides what a successor waits for`, `the anchor reach is still available and still means what it did`, `a predecessor nobody estimated is reached at its own finish under either reach`; negative: the `whole-item` arm returning the anchor, watched failing on the QA-finish assertion.
- [ ] 2.2 Edge expansion calls it; parent expansion, successor attachment, floors, cycles and the arithmetic untouched — test: `a parent predecessor expands to its leaves under either reach`; negative: the reach applied to the successor's end as well, watched failing.
- [ ] 2.3 The reach is read from the project being scheduled, beside the ladder and capacity — test: `schedule.test.ts` two projects on different reaches in one run; negative: the read hoisted, watched failing on the second taking the first's rule.

## 3. Identity, re-derived honestly

- [ ] 3.1 `schedule-identity.test.ts` split: plans with no dependencies and single-step plans assert **unchanged** dates under both reaches; multi-step dependency fixtures are re-derived under `whole-item` **and** the pre-change figures kept as the `anchor-slice` cases — test: `a single-step plan schedules identically under both reaches`; negative: the `anchor-slice` fixtures deleted rather than kept, leaving the second arm with no oracle — caught by review, recorded here so it is not.
- [ ] 3.2 `existing plans move to the whole-item rule` — a fixture created before this change, scheduled after, asserting the successor waits for the last slice. This is the change's headline and the assertion that proves the column default reached existing rows.

## 4. Payload, arrows, UI

- [ ] 4.1 The plan payload carries the project's reach — test: payload shape case.
- [ ] 4.2 `gantt-geometry.ts`'s arrow origin keyed on the same reach — test: `gantt-geometry.test.ts` `the arrow leaves the finish under the whole-item reach`; negative: the origin left at the anchor while the schedule is `whole-item`, watched failing on an arrow that starts before the bar it leaves.
- [ ] 4.3 Two radio options with a sentence each in the settings modal's steps section, writing the project — test: `project-settings-modal.test.tsx` `the reach is chosen and written`; negative: the write dropped, watched failing on the unchanged project.

## 5. In a browser

- [ ] 5.1 A Chromium spec: a three-item chain with two steps, reach flipped, the successor bar measured moving — negative: the flip not re-fetching the plan, watched failing on a chart that did not move. Find the bar through its own row and assert non-zero width first (`AGENTS.md`, the gantt-calendar-axis vacuity).

## 6. Gate

- [ ] 6.1 `bin/h2puni-gate.sh`, `openspec validate --all --json`, migration lint, the whole `CI=1` Playwright gate on shifted ports.
