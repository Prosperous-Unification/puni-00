<!--
Ordered TDD slices. Only `- [x]` checkboxes are tracked by the apply phase.
-->

## 0. Ordering

- [x] 0.1 **After `project-config-modal`** (design D5): the setting's UI is a section of that modal, and running first would add a dialog that change deletes.
  - **Resolved 2026-08-29 without waiting.** D5's stated cost of running first is "a fourth toolbar dialog that change then deletes". The reach's UI adds **no** dialog: it is a section inside the existing `PhasesDialog`, which is the steps surface `project-config-modal` slice 1.3 extracts wholesale into `StepsPanel`, so the extraction carries it. `toolbarControls` gains no control — the only edit there is two props on the `<PhasesDialog>` already mounted. `project-config-modal` is unimplemented on `main` and is being written in parallel; the two meet as a mechanical merge in one file.
- [x] 0.2 Write the ADR — a dependency's reach is a project's choice — in `docs/adr/`, per `.agents/skills/domain-modeling/ADR-FORMAT.md`. It supersedes nothing; `dep-waits-on-first-role`'s reasoning becomes the `anchor-slice` arm's justification and is cited.

## 1. The column and the read

- [x] 1.1 Migration: `ALTER TABLE project ADD COLUMN dep_reach TEXT NOT NULL DEFAULT 'whole-item';` with `down.sql` dropping it — test: `migrate-down.test.ts` round trip; migration lint green (additive forward, destructive down in its own file).
- [x] 1.2 The repository read parses the stored value into the two-member enum and **throws** on anything else — test: `project.test.ts` `an unrecognised stored reach is refused`; negative: the throw replaced by `?? 'whole-item'`, watched failing on that case. R5: unknown is not OK, and this is the arm that would otherwise schedule a plan by a rule nobody chose.

## 2. The engine

- [x] 2.1 `reachedSliceOf(reach, leaf, slices)` with the two arms; `anchorSliceOf` becomes the `anchor-slice` arm and keeps its tests — test: `schedule.test.ts` `a project's reach decides what a successor waits for`, `the anchor reach is still available and still means what it did`, `a predecessor nobody estimated is reached at its own finish under either reach`; negative: the `whole-item` arm returning the anchor, watched failing on the QA-finish assertion.
- [x] 2.2 Edge expansion calls it; parent expansion, successor attachment, floors, cycles and the arithmetic untouched — test: `a parent predecessor expands to its leaves under either reach`; negative: the reach applied to the successor's end as well, watched failing.
- [x] 2.3 The reach is read from the project being scheduled, beside the ladder and capacity — test: `schedule.test.ts` two projects on different reaches in one run; negative: the read hoisted, watched failing on the second taking the first's rule.

## 3. Identity, re-derived honestly

- [x] 3.1 `schedule-identity.test.ts` split: plans with no dependencies and single-step plans assert **unchanged** dates under both reaches; multi-step dependency fixtures are re-derived under `whole-item` **and** the pre-change figures kept as the `anchor-slice` cases — test: `a single-step plan schedules identically under both reaches`; negative: the `anchor-slice` fixtures deleted rather than kept, leaving the second arm with no oracle — caught by review, recorded here so it is not.
- [x] 3.2 `existing plans move to the whole-item rule` — a fixture created before this change, scheduled after, asserting the successor waits for the last slice. This is the change's headline and the assertion that proves the column default reached existing rows.

## 4. Payload, arrows, UI

- [x] 4.1 The plan payload carries the project's reach — test: payload shape case.
- [x] 4.2 `gantt-geometry.ts`'s arrow origin keyed on the same reach — test: `gantt-geometry.test.ts` `the arrow leaves the finish under the whole-item reach`; negative: the origin left at the anchor while the schedule is `whole-item`, watched failing on an arrow that starts before the bar it leaves.
- [x] 4.3 Two radio options with a sentence each in the settings modal's steps section, writing the project — test: `project-settings-modal.test.tsx` `the reach is chosen and written`; negative: the write dropped, watched failing on the unchanged project.

## 5. In a browser

- [x] 5.1 A Chromium spec: a three-item chain with two steps, reach flipped, the successor bar measured moving — negative: the flip not re-fetching the plan, watched failing on a chart that did not move. Find the bar through its own row and assert non-zero width first (`AGENTS.md`, the gantt-calendar-axis vacuity).

## 6. Gate

- [x] 6.1 `bin/h2puni-gate.sh`, `openspec validate --all --json`, migration lint, the whole `CI=1` Playwright gate on shifted ports.
