# U2 Staffed step cell: the trio yields to an ellipsis

Size: S. Estimate 0.25 / 0.5 / 1.5 days, 600,000 tokens.
Work item: `/home/df/wd/puni/puni-plan/batch-3/items/U2.md`.
Origin: section 13, "Finding for a separate work item", of
[U1, the estimate cell at rest](../2026-09-20-batch-2/u1-estimate-cell-at-rest.md).
Batch contract: [execution batch 1 README](../2026-09-19-batch-1/README.md) — "Execution contract",
"Standard blocks every packet uses", "Hidden constraints every frontend packet must respect",
"Counts are relative, never absolute", "Formatting", "Negative proofs with a restore".
Launcher: `--batch batch-3 --batch-dir docs/superpowers/plans/2026-09-21-batch-3` — `run-executor.sh:24`
exits 64 on any batch but 1 or 2 without `--batch-dir`. No `--network`: nothing here binds a port from the sandbox.

Everything in section 3 was checked in this repository on 2026-09-20 and 2026-09-21 by reading the
files and by running the commands named there. Nothing is asserted from memory. **Chromium was
run.** The whole change was rehearsed in a private worktree on `batch-3/planning`, every count and
every failing line below was watched rather than predicted, the prescribed change was staged and
committed once through lefthook to prove the hooks accept it, and the rehearsal was then reverted.
Three designs were measured against the real stack before one was chosen; section 4 is that
measurement. Sections 14 and 15 record what two high-effort reviews changed.

## 1. Goal and non-goals

**Goal.** A folded step cell that cannot show its whole typed trio beside its result lets the
**trio** yield, and yield legibly: at rest the trio box ends in an ellipsis instead of cutting a
glyph in half, while the result and the assignee keep the rendering they already have and stay
inside the cell. The staffed,
fractional case that U1 could only measure becomes a committed Chromium assertion that passes.

**Non-goals.** The step column's width; the assignee slot; `QUIET_TRIO_PX`; what is stored; how a
result is computed; the unfolded three-box layout; the hover card, which already carries the trio in
full; the phone card face; editing, which is unchanged because the declaration lives on the resting
arm only. No new CSS file rule and no new exported constant: the change is one property on the one
element that already carries inline style.

## 2. Read first

| File                                                                                    | Why                                                                                               |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `LLM_README.md`                                                            | R1 to R5. R5 governs every check this packet adds.                                                |
| `../2026-09-19-batch-1/README.md`                                                       | The execution contract and the standard blocks, which this packet links to instead of copying.    |
| `../2026-09-20-batch-2/u1-estimate-cell-at-rest.md`, section 13                         | Where this item comes from, and the two measured rows it hands over.                              |
| `apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx`                          | The file the one production line goes in. Its comments carry dated measurements.                  |
| `apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx`                             | The jsdom oracle. `describe('one cell for the whole trio')` is the block that gains a test.       |
| `apps/wbs/fe-01/e2e/layout.spec.ts`, lines 1107 to 1263 and 1296 to 1396                | The committed browser cases this packet stands beside, and the `Nia` they create.                 |
| `apps/wbs/fe-01/src/components/wbs/estimating-panel.tsx`, lines 68 to 86 and 256 to 280 | `Keep the fraction` and why its radio needs a click plus a wait rather than Playwright's `check`. |
| `openspec/changes/estimate-cell-at-rest/`                                               | The `wbs-estimate-cell` capability this change adds a requirement to, and the shape to copy.      |

## 3. Verified facts

Line numbers are anchors in the **original baseline** — the tree slice 0 sees. In every instruction
the **exact quoted text is the authoritative locator**; a line number is a hint for finding it.

1. `estimates.tsx:435` to `441` is the folded trio box's one state: `problem !== null || typing`
   takes `{ fontSize: 'inherit', fontWeight: 600 }`, and the other arm is the object literal opening
   `fontSize: QUIET_TRIO_PX,`. That second object is the **resting arm** and the only place this
   packet edits.
2. `estimates.tsx` already contains `textOverflow: 'ellipsis'` **twice** — at `:91` on the column
   header button and at `:873` on the assumed-assignee span (`:881` is the `MismatchMark`). Neither is the resting arm. Every
   instruction below locates the edit by the `fontSize: QUIET_TRIO_PX,` line above it, never by a
   search for `textOverflow`.
3. `estimates.tsx:561` gives the result span `flex: 'none'`, `:598` gives the assignee
   `width: ASSIGNEE_SLOT_PX`, `:920` sets `ASSIGNEE_SLOT_PX = 32`, `:935` sets
   `QUIET_TRIO_PX = 10`, and `:608` renders the empty slot only when `reading.anyAssignee`.
4. `table-frame.ts:761` declares `const STEP_FINAL_WIDTH = 104;` — the step column's `<td>` is 104px
   and the "96px column" every comment quotes is that minus its 8px of padding.
5. `e2e/layout.spec.ts:1185` asserts `expect(measured.cell.width).toBe(104)`; `:1194` to `:1197` is
   the `clipped` assertion, `'the trio does not fit the box beside its figure'`; `:55` sets
   `ROW_HEIGHT_BUDGET = 28`; `findOverrun` is imported at `:6` from
   `../src/components/wbs/box-geometry`.
6. `e2e/layout.spec.ts:1213` expects the seeded result `'4'` and `:1234` the wide result `'25'`:
   since `estimate-weights-and-rounding` the default rounding charges whole days, so a **fractional**
   result needs Project settings → `Estimating` → `Keep the fraction` and is not reachable otherwise.
7. `estimating-panel.tsx:265` draws the rounding radio `checked` from a prop, never from its own
   state. Watched 2026-09-20: Playwright's `locator.check()` fails on
   `Error: locator.check: Clicking the checkbox did not change its state`. `click()` followed by
   `await expect(...).toBeChecked()` passes.
8. **The people directory is one per deployment, not one per project.** `e2e/layout.spec.ts:214`
   declares `seedPlan(page, _account)` and never uses `_account`; `createProject` makes a project on
   the same signed-in `local-dev` account. Watched 2026-09-20: a new test creating `Nia` before
   `a step’s figure lands at one x whether or not the row is assigned` (`:1352` uses
   `getByRole('option', { name: 'Add “Nia”' })`) made that test fail with `element(s) not found`,
   because Nia was by then an existing person. Other specs create other people —
   `e2e/directory.spec.ts:126` to `:130` creates `Kat ${tag}` and renames it `Katrin ${tag}` — so the
   verified fact is narrower and is the one that matters: **no source under `apps/wbs/fe-01/e2e`
   contains `Ola`** (`grep -rn Ola apps/wbs/fe-01/e2e` prints nothing), and `Ola` is what this
   packet uses.
9. `creatable-picker.tsx:132` to `136` calls `preventDefault` on the list's mousedown so the click
   cannot blur the box, so a measurement taken straight after the Add reports the focused
   arrangement. `e2e/layout.spec.ts:1242` to `1247` already records that as `focused=true
boxType=13px`.
10. `apps/wbs/fe-01/vitest.config.ts:168` includes `src/**/*.{test,spec}.{ts,tsx}` under
    `environment: 'jsdom'`, so `plan-estimates.test.tsx` runs under the **default** config.
    `vitest.node.config.ts:46` includes only `NODE_SUITES`, and `vitest.node-suites.ts` does **not**
    list `plan-estimates.test.tsx`; `vitest.zoned.config.ts:41` includes only
    `src/**/*.zoned.test.{ts,tsx}`. So the new test moves the **UTC jsdom** suite and neither the
    node unit tier nor the Auckland suite. `project.json`'s `test` target is the UTC run followed by
    the zoned one; `test:unit` is the node one. The batch README's sandbox unit command does not
    cover this file; the focused command in section 7 does.
11. `apps/wbs/fe-01/tsconfig.json:33` to `38` references `tsconfig.e2e.json`, whose `include` is
    `["e2e/**/*.ts", "e2e-packaged/**/*.ts", "playwright.config.ts", "playwright.packaged.config.ts"]`,
    so `wbs-fe-01:typecheck` covers the browser spec as well as `src`.
12. `playwright.config.ts:26` reads `CI` and `:154` sets `reuseExistingServer: !isCi`; `:74` to
    `:105` validate `E2E_PORT_SHIFT`; `:277` sets the 1400x900 viewport. Every browser command in
    section 9 therefore carries `CI=1` and a port shift.
13. `openspec/specs/` holds no `wbs-estimate-cell`; the capability is defined by the unarchived
    change `openspec/changes/estimate-cell-at-rest/specs/wbs-estimate-cell/spec.md`. A new change
    may still add to it — `openspec/changes/clear-estimate/specs/wbs-domain/spec.md` does the same
    for a capability with no main specification. OpenSpec `validate --all --json` on the untouched
    tree reported `{'items': 107, 'passed': 107, 'failed': 0}` (watched 2026-09-20).
14. `apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx` on the untouched tree:
    `Tests 73 passed (73)` (watched 2026-09-20).

## 4. The measurement that chose the design

All three candidates the work item named were built and run in Chromium on 2026-09-20, viewport
1400x900, on the staffed fractional fixture (`20/24/30` typed, `Keep the fraction`, an assignee
named on the row), after an explicit blur, and each was looked at as a screenshot in light and dark.
The fixture reproduces U1's section 13 row exactly: `<td>` 104px, box 30.69px, result 25.31px, slot
32px, `clipped` (`box.scrollWidth - box.clientWidth`) **16**.

| Candidate                                 | `<td>` | Box     | `clipped` | The cell read                      | Committed cases                 |
| ----------------------------------------- | ------ | ------- | --------- | ---------------------------------- | ------------------------------- |
| unchanged `batch-3/planning`              | 104    | 30.69px | 16        | `20/24⎸ 24.3 · OL` — cut mid-glyph | 4 of 4 pass                     |
| **A. ellipsis on the resting trio**       | 104    | 30.69px | 16        | `20… 24.3 · OL`                    | 4 of 4 pass                     |
| B. hide the resting trio on a staffed row | 104    | 30.69px | 16        | ` 24.3 · OL` — 30.69px of blank    | 4 of 4 pass                     |
| C. widen the step column to 120           | 120    | 46.69px | **0**     | `20/24/30 24.3 · OL`               | 1 of 4 fails, and 14 unit tests |

"Committed cases" is one run of `holds a trio and its figure on one line of a folded step cell`
(seeded `4` and wide `25`, the row-height budget and the 104px pin),
`stands a parent’s figure in the same slot as its leaves’`,
`a step’s figure lands at one x whether or not the row is assigned`, and the probe.

**C is unaffordable, which is a fact and not a preference.** At `STEP_FINAL_WIDTH = 120` the trio
fits — 46.69px is exactly the 30.69 it had plus the 16 it wanted — but the committed
`expect(measured.cell.width).toBe(104)` fails, and
`bunx vitest run --root apps/wbs/fe-01 src/components/wbs/table-frame.test.ts
src/components/wbs/plan-layout.test.tsx src/components/wbs/column-hints.test.ts
src/components/wbs/steps-panel.test.tsx` went from green to `Tests 14 failed | 189 passed (203)`,
including the folded table's own width equation (`foldedTableMinWidth` for two steps moved by 32,
`- 1194 / + 1178` on one of them). `COLUMN_WIDTHS`' `refs` entry records that the folded table had
**17px of slack against a 1248px frame at 1280**; 32px does not fit in it.

**B costs more than it buys.** It cannot be written as "when it would clip" without measuring in the
browser, so the rehearsal used the only rule React can evaluate — a character count on a staffed row
— and it does not change `clipped` at all: the input still holds its value, so the trio is merely
invisible. The screenshot is a cell with 30.69px of unexplained blank before the result, and a
reader cannot tell the step was estimated by hand at all.

**A is chosen.** It costs no pixels, moves no width pin, breaks no committed test, leaves editing
untouched, and is exactly the owner's direction expressed as a rendering: the result and the
assignee keep the rendering they already have, and the trio is the one reading that gives way — visibly, with a mark that says
there is more, which the hover card and the focused box both supply. In dark it reads the same. Its
limit is stated rather than hidden: `clipped` stays 16, so this packet does **not** claim the trio
fits, and the committed assertion is about how it yields.

## 5. File plan

| File                                                                      | Create or modify  | What                                                                                 |
| ------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------ |
| `openspec/changes/estimate-trio-ellipsis/.openspec.yaml`                  | create by command | `schema: sdd-lean` plus the date. Written by `openspec new change`, never by hand.   |
| `openspec/changes/estimate-trio-ellipsis/proposal.md`                     | create            | Intent, under 400 words.                                                             |
| `openspec/changes/estimate-trio-ellipsis/tasks.md`                        | create            | The three slices below.                                                              |
| `openspec/changes/estimate-trio-ellipsis/specs/wbs-estimate-cell/spec.md` | create            | One `### Requirement:` with its normative SHALL and two scenarios.                   |
| `openspec/changes/estimate-trio-ellipsis/verify.md`                       | create            | Commands, results and R5 proofs; appended by every slice.                            |
| `apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx`               | modify            | One `itDom` added inside `describe('one cell for the whole trio')`.                  |
| `apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx`            | modify            | One property plus its comment, in the resting arm only.                              |
| `apps/wbs/fe-01/e2e/layout.spec.ts`                                       | modify            | One committed test added inside `test.describe('the table, measured by a browser')`. |

**Neighbours.** `docs/superpowers/plans/2026-09-20-batch-2/` holds **nine** packets —
`010-6-templates.md`, `010-7-rules.md`, `020-2-shared-failures.md`, `020-7-backend-startup.md`,
`040-1-chromium-proof.md`, `040-4-plan-feed.md`, `110-1-test-axes.md`,
`110-6-retire-upstream-sync.md` and `u1-estimate-cell-at-rest.md`. `git grep -l` over each path in
the plan above, across that directory, names only `u1-estimate-cell-at-rest.md`, and U1 is **already
merged**: this packet's edits sit on top of its, which is why every anchor in section 3 is read off
`batch-3/planning` and not off `main`. Ownership among the **batch 3** lanes is bookkeeping the
coordinator holds; nothing in this repository settles it, and this packet claims nothing about it. **110.1 is the one to
watch**: `docs/superpowers/plans/2026-09-19-code-organization-rollout.md:259` to `260` puts
square-bracket scenario identifiers on existing test titles. This packet only **adds** titles and
edits none, so a prefix campaign and this packet cannot collide; if a title in either changed file
already carries a bracketed prefix when the slice opens, keep it verbatim.

Nothing here is under `apps/wiki/cli`, so the Twilight Bureaucrat validator identity does not move.

## 6. Slices

Each slice is dispatchable alone, records its own baseline first, and ends ready to commit. Counts
are relative to the baseline that slice recorded (batch README, "Counts are relative, never
absolute"). Every rehearsed figure below was watched on 2026-09-20 on `batch-3/planning`.

### Baselines every slice collects for itself

A baseline is collected **by the slice that compares against it**, on the tree that slice starts on,
and is written into the slice's report and into `verify.md`. No slice uses another slice's figure,
and no expected count here is absolute (batch README, "Counts are relative, never absolute").

The focused test file is recorded as **three** numbers, not one, because slice 2b starts on a tree
where one test is failing on purpose:

- **F** — `cd apps/wbs/fe-01 && bunx vitest run src/components/wbs/plan-estimates.test.tsx`, read as
  `Tests <failed> failed | <passed> passed (<total>)`, or `Tests <passed> passed (<passed>)` when
  none fails. Write it down as the triple `F.total / F.passed / F.failed`.
- **V** — `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`, the
  `summary.totals.passed` figure.

Rehearsed on 2026-09-20, for orientation only — each slice must still read its own:

| Slice start | F.total / F.passed / F.failed | V   |
| ----------- | ----------------------------- | --- |
| slice 1     | 73 / 73 / 0                   | 107 |
| slice 2a    | 73 / 73 / 0                   | 108 |
| slice 2b    | 74 / 73 / **1**               | 108 |
| slice 3     | 74 / 74 / 0                   | 108 |

Expected transitions, each stated against the slice's **own** baseline: slice 1 leaves F untouched
and V at **V + 1**; slice 2a leaves V untouched and F at `total + 1`, `passed` unchanged, `failed`
**1**; slice 2b leaves V and `total` untouched and moves `failed` to **0**, so `passed = total`;
slice 3 adds a browser test and moves none of F or V, because the executor never runs a browser.

### Slice 1 — the OpenSpec change

- [ ] 1.1 Record **V** and **F**, into `$TMPDIR/evidence/baselines.txt`. `verify.md` does not exist
      yet — this slice creates it — so the observations are held there and transferred in 1.6.
- [ ] 1.2 Scaffold the change with the batch README's "Creating an OpenSpec change" block, which is
      the only supported way to get the schema metadata right:

  ```sh
  OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 new change estimate-trio-ellipsis --schema sdd-lean
  grep -n "schema: sdd-lean" openspec/changes/estimate-trio-ellipsis/.openspec.yaml
  ```

  Expected, watched 2026-09-20: `Created change 'estimate-trio-ellipsis' at
openspec/changes/estimate-trio-ellipsis/` and `Schema: sdd-lean`, then `1:schema: sdd-lean` from the
  grep. The command creates **only** `.openspec.yaml`; it writes no `proposal.md`, `tasks.md`,
  `verify.md` or `specs/`, which is why 1.3 writes them. A grep that prints nothing is a stop.
  The command must not download: OpenSpec is already warmed into `$TMPDIR`.

- [ ] 1.3 Write the four remaining files with exactly the text in section 12. The delta spec's
      normative SHALL sits directly under the `### Requirement:` heading; without it validation
      refuses the file.
- [ ] 1.4 `GSETTINGS_BACKEND=memory bunx prettier --write` the four Markdown files, then `--check`
      them. `.openspec.yaml` is not Markdown and is left exactly as the command wrote it.
- [ ] 1.5 Validate. Expect exit 0 and `summary.totals.passed` = **V + 1** (rehearsed 107 → 108).
- [ ] 1.6 Fill `verify.md`'s two tables with this slice's real command output, including the
      baselines held in 1.1, and tick 1.1 to 1.3 in `tasks.md`.

Pre-edit check: `openspec/changes/estimate-trio-ellipsis/` does not exist. Ready to commit: the five
files (`.openspec.yaml`, `proposal.md`, `tasks.md`, `verify.md`,
`specs/wbs-estimate-cell/spec.md`); subject
`docs(openspec): state how a resting trio yields when it does not fit`.

### Slice 2a — the jsdom oracle, watched red

- [ ] 2a.1 Record **F** and **V** for this slice (rehearsed 73 / 73 / 0 and 108).
- [ ] 2a.2 Add the test in section 8.1 to `plan-estimates.test.tsx`, inside
      `describe('one cell for the whole trio')`, immediately **above**
      `itDom('leaves a refused trio at full strength, because a complaint may not recede', …)`.
      Add nothing else — no production edit — or the red run below is void.
- [ ] 2a.3 Format the file, then run it. **Expect exit 1** and, watched on 2026-09-20:

  ```
  × ends a resting trio in an ellipsis, and only while it is resting
  AssertionError: expected '' to be 'ellipsis' // Object.is equality
   Tests  1 failed | 73 passed (74)
  ```

  Against this slice's own baseline: `failed` = **1**, `passed` = `F.passed`, `total` =
  `F.total + 1`. A green run here is a stop: the test is not measuring anything.

- [ ] 2a.4 Append the red run to `verify.md` and tick 2.1 in `tasks.md`.

Pre-edit check: `openspec/changes/estimate-trio-ellipsis/verify.md` exists and carries slice 1's
filled tables, and `plan-estimates.test.tsx` does **not** contain `ends a resting trio in an
ellipsis`. Ready to commit: `plan-estimates.test.tsx`,
`openspec/changes/estimate-trio-ellipsis/verify.md`,
`openspec/changes/estimate-trio-ellipsis/tasks.md`; subject
`test(wbs-fe): pin which arm carries the resting trio's ellipsis`.

### Slice 2b — the production line, watched green

- [ ] 2b.1 Record **F** on the tree this slice starts on. Rehearsed **74 / 73 / 1** — one test is
      failing on purpose, which is slice 2a's whole point, and that is this slice's baseline.
- [ ] 2b.2 In `estimates.tsx`, in the object literal that begins `fontSize: QUIET_TRIO_PX,` — the
      **resting** arm of the `problem !== null || typing` conditional, and not either of the two
      other `textOverflow: 'ellipsis'` occurrences in this file (section 3, fact 2) — add the
      comment and property in section 8.2, directly after the `color:` line and as the object's last
      entry.
- [ ] 2b.3 Format `estimates.tsx`, rerun the test file. Expect exit 0 and
      `Tests F.total passed (F.total)` — the same total, `failed` down to **0** (rehearsed
      `Tests 74 passed (74)`).
- [ ] 2b.4 `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` (exit 0) and
      `NX_DAEMON=false bunx nx run wbs-fe-01:lint` (exit 0, `Successfully ran target lint for
project wbs-fe-01`). Both watched green on the rehearsed tree.
- [ ] 2b.5 Negative **N1** and **N2** from section 8.3, each injected separately, watched, restored
      by `cp` and proved with `cmp`, then the file rerun green after each.
- [ ] 2b.6 **Only now**, having observed both, add the adjacent dated `Proof:` comment to
      `estimates.tsx`, immediately above the `textOverflow: 'ellipsis',` line and inside the same
      comment block, with exactly the text in section 8.2's second listing. R5 requires it and
      preamble rule 9 forbids writing it before the observation, which is why it is a separate step
      from 2b.2.
- [ ] 2b.7 Reformat `estimates.tsx`, rerun the test file green (same expectation as 2b.3), and rerun
      the type check and lint. Append both proofs and every run to `verify.md`, and tick 2.2 and 2.3
      in `tasks.md`.

Pre-edit check: `plan-estimates.test.tsx` contains
`itDom('ends a resting trio in an ellipsis, and only while it is resting'`, `verify.md` carries
slice 2a's red run, and `estimates.tsx` does **not** contain `textOverflow` inside the resting arm.
Ready to commit: `apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx`,
`openspec/changes/estimate-trio-ellipsis/verify.md`,
`openspec/changes/estimate-trio-ellipsis/tasks.md`; subject
`feat(wbs-fe): end a resting trio in an ellipsis when it does not fit`.

### Slice 3 — the committed browser case

The executor **has no browser**. This slice writes the spec exactly as section 8.4 gives it, runs
the type check and lint over it, and hands the run itself to the planner (section 9).

- [ ] 3.1 Add the test in section 8.4 to `apps/wbs/fe-01/e2e/layout.spec.ts`, inside
      `test.describe('the table, measured by a browser')`, immediately **above**
      `test('a toolbar panel closes when the pointer goes down outside it', …)`. Transcribe it
      verbatim, `Ola` included (section 3, fact 8). The listing carries **no** browser `Proof:`
      comments and none may be invented here: nobody in this sandbox can watch a browser fail, and
      preamble rule 9 forbids writing a proof comment before its observation. The planner adds them
      in section 9 after replaying each fault.
- [ ] 3.2 **Replace the stale sentence in `estimates.tsx`.** The result span's comment currently
      ends `The staffed, fractional case is not committed — it clips before this change as well as
after it; see verify.md's finding.` — true when U1 wrote it and false the moment 3.1 commits that
      case. Replace the two sentences from `The` before `staffed, fractional case` to the end of
      that paragraph with the block in section 8.5. This is the one edit to `estimates.tsx` that is
      not the declaration or its proof comment, and it is authorised here and nowhere else.
- [ ] 3.3 `GSETTINGS_BACKEND=memory bunx prettier --write apps/wbs/fe-01/e2e/layout.spec.ts
apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx`, then `--check` both. The listing in
      section 8.4 is already in its post-Prettier form.
- [ ] 3.4 `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` — exit 0. This is the slice's real
      check: `tsconfig.e2e.json` covers the spec (section 3, fact 11).
- [ ] 3.5 `NX_DAEMON=false bunx nx run wbs-fe-01:lint` — exit 0.
- [ ] 3.6 Append to `verify.md`, under "Not verified", that `wbs-fe-01:e2e`, its **five** negatives
      and the browser `Proof:` comments they authorise are **pending planner verification**, naming
      them by the section 9 identifiers CP and CN1 to CN6. Tick 3.1 in `tasks.md`; leave 3.2
      unticked, because it is the planner's.

Pre-edit check: `layout.spec.ts` contains
`test('a toolbar panel closes when the pointer goes down outside it'` and does **not** contain
`yields the trio to an ellipsis`; `estimates.tsx` contains `textOverflow: 'ellipsis',` in the
resting arm with its `Proof:` comment above it, and still contains the sentence
`The staffed, fractional case is not committed`. Ready to commit:
`apps/wbs/fe-01/e2e/layout.spec.ts`,
`apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx`,
`openspec/changes/estimate-trio-ellipsis/verify.md`,
`openspec/changes/estimate-trio-ellipsis/tasks.md`; subject
`test(wbs-fe): pin the staffed, fractional folded cell in Chromium`.

## 7. Verification table

Every command runs from the repository root unless it says otherwise. Nx carries `NX_DAEMON=false`;
whole test targets carry `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

| #   | Command                                                                                                                                                                                               | Who                                                     | Exit                   | The line to read                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 new change estimate-trio-ellipsis --schema sdd-lean`, then `grep -n "schema: sdd-lean" openspec/changes/estimate-trio-ellipsis/.openspec.yaml` | executor, slice 1 only                                  | 0                      | `Schema: sdd-lean`, then `1:schema: sdd-lean`. A grep that prints nothing is a stop                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2   | `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                                         | executor                                                | 0                      | `summary.totals.passed` = **V + 1** in slice 1 (rehearsed 107 to 108), and **V**, unchanged, in every later slice                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 3   | `cd apps/wbs/fe-01 && bunx vitest run src/components/wbs/plan-estimates.test.tsx`                                                                                                                     | executor                                                | 1 after 2a, 0 after 2b | against that slice's own **F**: `failed` 0 to 1 and `total` + 1 in 2a, then `failed` 1 to 0 with `total` unchanged in 2b. Rehearsed `Tests 1 failed \| 73 passed (74)`, then `Tests 74 passed (74)`                                                                                                                                                                                                                                                                                                                               |
| 4   | `bunx nx run wbs-fe-01:typecheck`                                                                                                                                                                     | executor                                                | 0                      | `Successfully ran target typecheck`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 5   | `bunx nx run wbs-fe-01:lint`                                                                                                                                                                          | executor                                                | 0                      | `Successfully ran target lint for project wbs-fe-01`                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 6   | `bunx nx format:check --all`                                                                                                                                                                          | executor                                                | 0                      | no file listed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 7   | `bunx nx run wbs-fe-01:test:unit` — the node tier                                                                                                                                                     | **planner only**                                        | 0                      | **unchanged** against the planner's own baseline for this commit. `plan-estimates.test.tsx` is not in `NODE_SUITES` (section 3, fact 10), so this tier cannot move; rehearsed on the changed tree at `Tests 621 passed (621)`                                                                                                                                                                                                                                                                                                     |
| 8   | `bunx nx run wbs-fe-01:test` — UTC, then Auckland                                                                                                                                                     | **planner only**, and **not after slice 2a**            | per slice              | `project.json:27` joins the two runs with `&&`, so a red UTC run means Auckland never starts. See the per-slice table under this one. Planner-only because three tests in two files spawn `bun` from Node and the sandbox refuses with `spawnSync bun EPERM` (batch README)                                                                                                                                                                                                                                                       |
| 9   | `bunx nx run tool-devsync:test --skip-nx-cache`                                                                                                                                                       | **planner only**, files **staged**                      | 0                      | **unchanged** against the planner's own baseline for this commit: the same pass total and `0 fail`. Rehearsed 2026-09-20 at `301 pass / 0 fail`, which is historical evidence and not a pin. With the new `openspec/` files **untracked** it fails on `the production index checker resolves current Markdown links and anchors` (`300 pass / 1 fail`), which is why they are staged first. No count pin moves: the comment lines this packet adds sit in files the inventory already counts, and no project target path is added |
| 10  | `CI=1 E2E_PORT_SHIFT=<n> bunx nx run wbs-fe-01:e2e -- --grep ...`                                                                                                                                     | **planner only**, **slice 3 only**                      | 0                      | section 9. Slices 1, 2a and 2b add no browser test and change nothing a browser can see, so there is nothing for this to check before slice 3                                                                                                                                                                                                                                                                                                                                                                                     |
| 11  | `bin/h2puni-gate.sh <sha>`                                                                                                                                                                            | **planner only**, shared host, after the **last** slice | 0                      | `h2puni gate: running on <sha>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Row 8, slice by slice**, because slice 2a hands over a failing test on purpose and a whole-target
expectation that ignored that would reject the packet's own correct work:

| Slice | `wbs-fe-01:test`  | Expected                                                                                                                                                                                                                                                                                                             |
| ----- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | run it            | exit 0, both halves; **unchanged** against the planner's baseline for the base commit. This slice touches no test                                                                                                                                                                                                    |
| 2a    | **do not run it** | the UTC half would exit 1 on `ends a resting trio in an ellipsis, and only while it is resting`, the `&&` at `project.json:27` would stop before Auckland, and the target would be red for the exact reason slice 2a exists. The check for this slice is the focused file, row 3: `total` + 1 with one named failure |
| 2b    | run it            | exit 0, both halves. Against the planner's **slice 1** run of the same target: UTC **+1 test**, Auckland **unchanged** (`vitest.zoned.config.ts:41` includes only `src/**/*.zoned.test.{ts,tsx}`). There is no slice 2a run to compare with, because it was not taken                                                |
| 3     | run it            | exit 0, both halves; **unchanged** against the slice 2b run. This slice adds a browser test, which no vitest config includes                                                                                                                                                                                         |

## 8. Exact code

### 8.1 The jsdom test (slice 2a)

Inside `describe('one cell for the whole trio')` in `plan-estimates.test.tsx`, above
`itDom('leaves a refused trio at full strength, …')`. `combinedCell`, `typeCombined`, `foldedFinal`
and `oneRow` are that block's own helpers (`:829` to `:865`).

```tsx
itDom('ends a resting trio in an ellipsis, and only while it is resting', async () => {
  // What a folded cell does when the trio, the result and an assignee slot do
  // not all fit: the trio yields, and says so. Chromium is the oracle for
  // whether it *had* to yield (`e2e/layout.spec.ts`); jsdom is the oracle for
  // which arm carries the declaration, which is the half a browser cannot
  // report without a 104px cell to do it in.
  await oneRow();
  typeCombined('010', '2/3/8');
  await waitFor(() => {
    expect(foldedFinal('010')?.textContent).toBe('3.7');
  });

  expect(combinedCell('010').style.textOverflow).toBe('ellipsis');

  fireEvent.focus(combinedCell('010'));
  expect(combinedCell('010').style.textOverflow).toBe('');

  fireEvent.blur(combinedCell('010'));
  expect(combinedCell('010').style.textOverflow).toBe('ellipsis');
});
```

`'3.7'` and not `'4'`: this block's `fakeApi` returns the exact PERT figure, which is what the
neighbouring `quiets the trio while the cell is not being typed in` (`:1284`) already asserts.

### 8.2 The production edit (slice 2b)

In `estimates.tsx`, the resting arm — the object literal opening `fontSize: QUIET_TRIO_PX,` at
`:437`. After the edit that arm reads:

```tsx
: {
    fontSize: QUIET_TRIO_PX,
    fontWeight: 400,
    color: trioRepeatsResult ? 'transparent' : 'var(--muted-foreground)',
    // The trio is what yields when all three do not fit, and it yields
    // **visibly**: `20/24/30` beside `24.3` on a staffed row has 16px more
    // trio than box, and without this the box cut `20/24` off mid-glyph and
    // said nothing about the rest. Only at rest — the full-strength arm
    // above declares no `text-overflow`, so a box being typed in scrolls its
    // whole value the way a text box does, and the hover card carries the
    // trio in full either way.
    textOverflow: 'ellipsis',
  }),
```

Indentation in the file is 26 spaces deeper than shown; Prettier settles it. Add nothing to the
`{ fontSize: 'inherit', fontWeight: 600 }` arm above.

**Step 2b.6 only, after both negatives have been watched.** Insert these five lines between
`// trio in full either way.` and `textOverflow: 'ellipsis',`, so the arm ends:

```tsx
    // trio in full either way.
    // Proof, both watched 2026-09-20. This line dropped: `ends a resting
    // trio in an ellipsis, and only while it is resting` failed on
    // `expected '' to be 'ellipsis'`. The same declaration added to the
    // full-strength arm above: the same test failed on its focus
    // assertion, `expected 'ellipsis' to be ''`.
    textOverflow: 'ellipsis',
```

Replace the date with the day the executor actually observed them, and either quoted message with
what that run really printed if it differs (preamble rule 20: the proof is the fact, not the
wording).

### 8.3 jsdom negatives (slice 2b)

| #   | Fault, by function and expression                                                                                                                                                        | Named test                                                         | Watched on 2026-09-20                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | Delete the `textOverflow: 'ellipsis',` line from the **resting** arm in `estimates.tsx` (the object literal opening `fontSize: QUIET_TRIO_PX,`), and nothing else.                       | `ends a resting trio in an ellipsis, and only while it is resting` | `AssertionError: expected '' to be 'ellipsis' // Object.is equality`, `Tests 1 failed \| 73 passed (74)`                                                  |
| N2  | Leave the resting arm alone and add the same `textOverflow: 'ellipsis',` to the **full-strength** arm, so it reads `{ fontSize: 'inherit', fontWeight: 600, textOverflow: 'ellipsis' }`. | the same test                                                      | its **focus** assertion: `AssertionError: expected 'ellipsis' to be '' // Object.is equality`, `Tests 1 failed \| 73 passed (74)`. Watched, not predicted |

Both are required and neither hides the other: N1 proves the declaration exists at rest, N2 proves it
is absent while the cell is typed in, which is the half that keeps editing unchanged. N1 is the same
fault as slice 2a's red run and the same message; run it anyway, from green, with the patch saved.

Save each patch and each failing output under `$TMPDIR/evidence` with the README's
`if diff -u passing mutated >"$TMPDIR/evidence/n1.patch"; then echo "nothing was injected" >&2; exit
1; else test $? -eq 1; fi` form, restore by `cp` from the saved passing bytes, prove with `cmp`, and
rerun green **before** asserting on any captured status. **Then, and only then, write the `Proof:`
comment** — section 8.2's second listing, step 2b.6. Nothing in this packet authorises a proof
comment before its observation (preamble rule 9).

### 8.4 The committed browser test (slice 3)

Transcribed exactly. `findOverrun` and `ROW_HEIGHT_BUDGET` are already in scope (section 3, fact 5).

The listing is shown **dedented by two spaces** so it fits this document, and Prettier wraps at the
width it is given: pasted back inside `test.describe(...)` at its real indentation, one or two calls
here will wrap differently from what is printed below. That is expected and is what step 3.2's
`prettier --write` settles; the observed case is
`expect(findOverrun(staffed.cell, staffed.box), 'the trio box is out of the cell').toBe(undefined);`,
which fits one line dedented and takes three lines in the file. Nothing about the code changes, and
a wrapping difference is never a stop.

```ts
test('yields the trio to an ellipsis where a staffed cell’s result is fractional', async ({
  page,
}) => {
  // The one folded cell that cannot hold all three of its readings: the widest
  // trio anybody has typed here (`20/24/30`), the widest result that trio can
  // make (`24.3`, under `Keep the fraction`), and a named assignee, all inside
  // the 104px `<td>` the step column is laid out at. Measured on 2026-09-20 the
  // trio wants 16px more than the box it is given, and no size the trio can be
  // set at closes that: the result and the 32px slot fix the box's share at
  // 30.69px while the trio at 10px wants 46.69px.
  //
  // Dany's direction for this cell decides who loses those 16px: the result is
  // the main reading, so the **trio** is what yields, never the result and
  // never the assignee. What this test holds is that it yields *legibly* — an
  // ellipsis rather than a character sliced down the middle — and that the two
  // readings that do not yield keep their existing rendering, with their boxes
  // inside the cell.
  //
  // Only a browser can see any of it: jsdom lays out no flex line, reports no
  // `scrollWidth`, and paints no ellipsis — the shape
  // `docs/findings/checks-that-cannot-fail.md` catalogues as `r5.catalogue.005`
  // and `r5.catalogue.006`, a jsdom oracle for a browser's fault.
  // `plan-estimates.test.tsx`'s `ends a resting trio in an ellipsis, and only
  // while it is resting` owns the other half — which arm carries the
  // declaration.
  for (const [label, name] of [
    ['Name of 010', 'Survey'],
    ['Name of 020', 'Draft'],
  ] as const) {
    const box = page.getByLabel(label);
    await box.fill(name);
    await box.blur();
    await expect(box).toHaveValue(name);
  }

  // `Keep the fraction`, because the default charges whole days and a whole
  // day is two glyphs: the fractional result is what makes this the tight case
  // rather than the wide one two tests above.
  await page.getByRole('button', { name: 'Project settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Project settings' });
  await settings.getByRole('tab', { name: 'Estimating' }).click();
  const exact = settings.getByRole('radio', { name: 'Keep the fraction' });
  // `click` and then wait for the tick, not `check`: the radio is drawn from
  // be-01's answer arriving as a prop (`estimating-panel.tsx`), so the click
  // leaves it unchecked until the write comes back and Playwright's own
  // `check` fails on `Clicking the checkbox did not change its state`
  // (watched 2026-09-20).
  await exact.click();
  await expect(exact).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();

  // **`Ola`, and not this file's usual `Nia`.** The people directory is one
  // per deployment, not one per project: `seedPlan` makes a new project but
  // takes no new account (its `_account` parameter is unused), so a person
  // created here is still on the list when a later test opens its own picker.
  // Watched on 2026-09-20: with this test creating `Nia`, `a step’s figure
  // lands at one x whether or not the row is assigned` failed on
  // `getByRole('option', { name: 'Add “Nia”' })` — element(s) not found,
  // because by then Nia was an existing person and the option read her name.
  const estimate = page.getByLabel('Dev estimate for 010');
  await estimate.click();
  await estimate.fill('20/24/30 @Ola');
  const addOla = page.getByRole('option', { name: 'Add “Ola”' });
  await expect(addOla).toBeVisible();
  await addOla.click();
  // At rest means at rest, and the picker is built to keep the focus through
  // its own click (`creatable-picker.tsx`'s mousedown `preventDefault`), so
  // the blur is explicit and waited for. A measurement taken straight after
  // the Add reports the focused arrangement: `boxType` 13px, not 10.
  await estimate.blur();
  await expect(estimate).toHaveValue('20/24/30');
  await expect(page.locator('[data-folded-assignee]').first()).toBeVisible();

  const staffed = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('tbody tr')];
    if (rows.length < 2) {
      throw new Error(`the plan has ${String(rows.length)} rows; this needs two`);
    }
    const cell = rows[0]?.querySelector('td[data-column$="-final"]');
    const box = cell?.querySelector('input');
    const figure = cell?.querySelector('[data-folded-final]');
    const who = cell?.querySelector('[data-folded-assignee]');
    if (
      !(cell instanceof HTMLElement) ||
      !(box instanceof HTMLInputElement) ||
      !(figure instanceof HTMLElement) ||
      !(who instanceof HTMLElement)
    ) {
      throw new Error('the first row has no staffed folded step cell with a box and a figure');
    }
    const cellBox = cell.getBoundingClientRect();
    const boxBox = box.getBoundingClientRect();
    const figureBox = figure.getBoundingClientRect();
    const whoBox = who.getBoundingClientRect();
    return {
      said: figure.textContent,
      cell: { id: 'the step column', x: cellBox.x, width: cellBox.width },
      box: { id: 'the trio box', x: boxBox.x, width: boxBox.width },
      figure: { id: 'the derived figure', x: figureBox.x, width: figureBox.width },
      who: { id: 'the assignee', x: whoBox.x, width: whoBox.width },
      clipped: box.scrollWidth - box.clientWidth,
      boxType: getComputedStyle(box).fontSize,
      boxFocused: document.activeElement === box,
      boxOverflow: getComputedStyle(box).textOverflow,
      estimated: rows[0].getBoundingClientRect().height,
      bare: rows[1].getBoundingClientRect().height,
    };
  });

  expect(staffed.said).toBe('24.3');
  expect(staffed.cell.width).toBe(104);
  expect(staffed.boxFocused, 'the resting state is only the resting state unfocused').toBe(false);
  expect(staffed.boxType).toBe('10px');

  // Still one line, asserted **first**, because it is the only fault below that
  // also changes the box's width: a wrapped cell gives the box the whole line,
  // the trio then fits, and the tightness check further down would report the
  // wrap as a fixture failure instead.
  expect(
    staffed.estimated,
    'a staffed cell holding a trio, a result and an assignee is taller than a bare row',
  ).toBeCloseTo(staffed.bare, 1);
  expect(staffed.estimated).toBeLessThanOrEqual(ROW_HEIGHT_BUDGET);

  // What does **not** yield: the result and the assignee keep their boxes inside
  // the cell, which is the direction stated as a measurement. The two width
  // assertions are non-vacuity guards for the two below them and not checks on
  // the cell — a zero-width rectangle sits inside every cell there is, so an
  // overrun check against one could not fail
  // (`docs/findings/checks-that-cannot-fail.md`); the same guards stand in
  // `holdsItsContents` for the same reason. No production expression decides
  // them, so neither has a fault of its own.
  expect(staffed.figure.width).toBeGreaterThan(0);
  expect(staffed.who.width).toBeGreaterThan(0);
  expect(findOverrun(staffed.cell, staffed.figure), 'the result is pushed out of the cell').toBe(
    undefined,
  );
  expect(findOverrun(staffed.cell, staffed.who), 'the assignee is pushed out of the cell').toBe(
    undefined,
  );

  // **The case has to still be the tight case, or everything under it passes
  // on a cell that never had to choose.** Measured 16 on 2026-09-20 with the
  // box at 30.69px and the trio wanting 46.69px.
  expect(
    staffed.clipped,
    'the trio fits after all, so this case no longer exercises the ellipsis',
  ).toBeGreaterThan(0);

  expect(staffed.boxOverflow).toBe('ellipsis');
});
```

**What this test deliberately does not assert, and why.** Three measurements were tried and
dropped, each because no production fault could make the assertion fail while the fixture still
reached its measurement. Dropping them is the rule this repository keeps
(`docs/findings/checks-that-cannot-fail.md`), not a gap.

- `figure.scrollWidth - figure.clientWidth`. The result span sets no `overflow`, so its scrolling
  area is its padding box and the difference is always 0. The natural mutation — the result's
  `flex: 'none'` replaced by `flex: 1` — left the whole test **passing** (watched 2026-09-20,
  `1 passed`).
- The same for the assignee. Falsifiable in principle, but not by a fault that keeps this fixture
  tight: narrowing its slot hands the 16px straight back to the box and trips the tightness check
  instead (which is CN3).
- `findOverrun(cell, box)` — the **trio box's** own containment. Two faults were tried on the box's
  style on 2026-09-21 and neither reached a measurement: `transform: 'translateX(104px)'` and
  `marginLeft: 104` each moved the box away from where the `@` mention popover anchors, and the
  fixture died earlier at `Error: locator.click: Test timeout of 120000ms exceeded` on the
  `Add “Ola”` option. The assertion was removed rather than kept unproven. What it claimed is
  covered anyway: the box is the first item in the flex row and the two items after it are asserted
  to be inside the cell.

The two `width > 0` assertions are **kept and classified**: they are non-vacuity guards for the two
`findOverrun` calls under them — a zero-width rectangle sits inside every cell there is — exactly as
`holdsItsContents` (`e2e/layout.spec.ts:1183` to `:1184`) keeps the same pair for the same reason.
No production expression decides them, so neither is given a fault, the same treatment `boxFocused`
already has in the committed wide case. The comment in the listing says so at the assertions.

**Assertion order is load-bearing, and every remaining check has its own fault.** The order is: the
fixture preconditions (`said`, `cell.width`, `boxFocused`, `boxType`), then the two **row-height**
assertions, then the two **overrun** checks, then the **tightness** check, then the **ellipsis**.
The proof inventory, complete, is:

| Assertion                                     | Its fault                                                                                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toBeCloseTo(staffed.bare, 1)`                | CN5                                                                                                                                                              |
| `toBeLessThanOrEqual(ROW_HEIGHT_BUDGET)`      | CN6                                                                                                                                                              |
| `findOverrun(cell, figure)`                   | CN2                                                                                                                                                              |
| `findOverrun(cell, who)`                      | CN4                                                                                                                                                              |
| `clipped > 0`                                 | CN3                                                                                                                                                              |
| `boxOverflow === 'ellipsis'`                  | CN1                                                                                                                                                              |
| `figure.width > 0`, `who.width > 0`           | none — non-vacuity guards, classified above                                                                                                                      |
| `said`, `cell.width`, `boxFocused`, `boxType` | fixture preconditions; `cell.width`'s falsifiability was seen when the column was widened to 120 (section 4), `boxType`'s is recorded on the committed wide case |

CN5 and CN6 are both required and neither hides the other: CN5 (`display: 'block'`) makes the
estimated row taller than the bare one and fails the **first** height assertion, while CN6
(`minHeight: 40`) makes **both** rows 42px, so the first passes and the **budget** fails. Watched
separately on 2026-09-21.

The order is that way round because two of the faults also change something an earlier assertion
would have caught: `display: 'block'` widens the box as well as wrapping the row, and `flex: 'none'`
makes the trio fit as well as pushing the result out. Rehearsed with the height assertions placed
**last**, CN5 was reported as `the trio fits after all, so this case no longer exercises the
ellipsis · Expected: > 0 · Received: 0` — the tightness check masking the wrap. With the order
above, each of CN1 to CN6 fails at its own assertion and nowhere else, replayed in one sitting on
2026-09-21. **Do not reorder them.**

### 8.5 The stale sentence in `estimates.tsx` (slice 3, step 3.2)

The result span's comment ends, on the tree slice 3 starts on:

```tsx
// staffed, fractional case is not committed — it clips before this change
// as well as after it; see `verify.md`'s finding.
```

Those two lines, together with the `The` that ends the line above them, are replaced by:

```tsx
//
// **The staffed, fractional case is committed too, since 2026-09-21.** It
// clips by 16px before this change and after it, and no size the trio can
// be set at closes that, so what `yields the trio to an ellipsis where a
// staffed cell's result is fractional` pins is not a fit: it is that the
// trio ends in an ellipsis rather than a sliced glyph while this span and
// the assignee keep their boxes inside the cell.
```

The `The` at the end of the line above — `… size, ink and tabular numerals. The` — is dropped with
them, so that paragraph now ends at `numerals.`; everything before it, back to the
`Watched in Chromium, 2026-08-30.` line, is untouched. Three lines out, three
lines plus a blank comment line in. Rehearsed and formatted on 2026-09-21; `prettier --check` and
`wbs-fe-01:lint` both clean, and the four browser tests green after it.

## 9. Planner-only browser work

Standing rules for every command in this section: `CI=1` (so `reuseExistingServer` is false and the
stack is fresh), `NX_DAEMON=false`, `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT`, always
through the Nx target (a bare `bunx playwright test` lacks the environment and the backend refuses
to start), and an `E2E_PORT_SHIFT` nobody else is using — the config throws on a collision, and a
collision is a stop, never a reason to reuse a server.

**Choosing the shift.** `playwright.config.ts:79` puts the three tiers at
`DEFAULT_PORTS = [3100, 3200, 4200]`, and the validation above it rejects a shift that is not a
non-negative integer below 10000 and checks only **those** defaults — it cannot see another shifted
run. So the three ports are chosen rather than assumed: compute `3100 + n`, `3200 + n` and
`4200 + n`, check **all three** against `ss -ltn`, and take `n` a **multiple of 300** away from every
shift already running. Distance alone is not the rule — differences of **100, 1000 and 1100 collide**
against those bases, and "at least 300 away" permits all three. The rehearsals used `2500`
(5600/5700/6700) and `3000` (6100/6200/7200), each after an `ss -ltn` check. After any run that
produced something, copy `apps/wbs/fe-01/test-results` into `$TMPDIR/evidence` before the next run:
Playwright removes each filtered project's `outputDir` when a run starts.

The grep that selects this packet's case and the three committed neighbours it must not disturb:

```sh
CI=1 E2E_PORT_SHIFT=<n> NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx nx run wbs-fe-01:e2e -- \
  --grep "yields the trio to an ellipsis|holds a trio and its figure|stands a parent.s figure in the same slot|figure lands at one x"
```

`parent.s` with a dot: the test title carries a typographic apostrophe, and the dot matches it
without shell quoting trouble.

| #   | Fault, by element and expression                                                                                                                                                                                                                     | Expected, watched 2026-09-20                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CP  | none — the green run                                                                                                                                                                                                                                 | exit 0, `4 passed`                                                                                                                                                   |
| CN1 | Delete the `textOverflow: 'ellipsis',` line from the **resting** arm of `estimates.tsx` (the object literal opening `fontSize: QUIET_TRIO_PX,`), with its `Proof:` comment                                                                           | exit 1, `expect(received).toBe(expected)` / `Expected: "ellipsis"` / `Received: "clip"`, at `expect(staffed.boxOverflow).toBe('ellipsis')`                           |
| CN2 | In the **trio box's** own style, `flex: 1,` to `flex: 'none',` — the occurrence directly under the comment ending `is back to what it was.`, **not** the `flex: 1` in the `data-rolled-trio` span below it                                           | exit 1, `Error: the result is pushed out of the cell` / `Expected: undefined` / `Received: "right"`                                                                  |
| CN3 | On the **assignee** span (`data-folded-assignee`) only, `width: ASSIGNEE_SLOT_PX,` to `width: 16,` — not the `data-folded-assignee-slot` spacer, which carries the same constant                                                                     | exit 1, `Error: the trio fits after all, so this case no longer exercises the ellipsis` / `Expected: > 0` / `Received: 0`                                            |
| CN4 | On the **assignee** span only, add `transform: 'translateX(104px)',` directly under `width: ASSIGNEE_SLOT_PX,`. It keeps the flex allocation and moves only the painted rectangle, which is why it reaches the assignee's own check instead of CN2's | exit 1, `Error: the assignee is pushed out of the cell` / `Expected: undefined` / `Received: "right"`                                                                |
| CN5 | On the **cell wrapper** — the `<span>` whose style begins `position: 'relative',` — `display: 'flex',` to `display: 'block',`                                                                                                                        | exit 1, `Error: a staffed cell holding a trio, a result and an assignee is taller than a bare row` / `Expected: 26.1875` / `Received: 40.1875`                       |
| CN6 | On the **same wrapper**, add `minHeight: 40,` directly under `position: 'relative',`, leaving `display: 'flex',` alone. It makes **both** rows 42px, so CN5's own assertion still passes and the budget is what fails                                | exit 1, `expect(received).toBeLessThanOrEqual(expected)` / `Expected: <= 28` / `Received: 42`, at `expect(staffed.estimated).toBeLessThanOrEqual(ROW_HEIGHT_BUDGET)` |

Every one of CN1 to CN6 fails at **its own** assertion and at no earlier one; each was injected
alone, watched and restored, and all six were replayed in one sitting on 2026-09-21 against the tree
this packet prescribes. CN2 and CN4 are both required, and so are CN5 and CN6: `findOverrun`
measures each rectangle it is handed on its own, and the two height assertions answer two different
questions — whether the estimated row is taller than the bare one, and whether either is over
budget. Section 8.4's proof inventory is the complete map, the assertions that deliberately have no
fault included.

This whole section is **slice 3's** verification: there is nothing here to run after slices 1, 2a
or 2b. Run each fault with `--grep "yields the trio to an ellipsis"`, and CP with the four-test grep
above. After
each injection: save the patch and the failing output under `$TMPDIR/evidence`, restore from the
saved passing bytes with `cp`, prove with `cmp`, and rerun CP green.

**Then write the browser `Proof:` comments** — not before. The executor's `layout.spec.ts` carries
none, by design. After CP and CN1 to CN5 have been replayed, the planner inserts, in
`apps/wbs/fe-01/e2e/layout.spec.ts` inside this test, each block below immediately above the
assertion it names, using what **this** run printed wherever it differs:

```ts
// Proof: the cell wrapper's `display: 'flex'` written as `display: 'block'`,
// so the figure drops under the box — this failed on `a staffed cell holding
// a trio, a result and an assignee is taller than a bare row · Expected:
// 26.1875 · Received: 40.1875`. Watched in Chromium, 2026-09-20.
```

above `expect(
      staffed.estimated,` — that one block covers both height assertions;

```ts
// Proof: the box's own `flex: 1` in `estimates.tsx` replaced by
// `flex: 'none'`, so the trio stops yielding and takes its content width —
// this failed on `the result is pushed out of the cell · Expected: undefined
// · Received: "right"`. The assignee's own containment has its own fault:
// `transform: 'translateX(104px)'` on the assignee span failed on `the
// assignee is pushed out of the cell · Expected: undefined · Received:
// "right"`. Both watched in Chromium, 2026-09-20.
```

above `expect(staffed.figure.width).toBeGreaterThan(0);`, which is where the two `findOverrun`
calls begin;

```ts
// Proof: `ASSIGNEE_SLOT_PX` replaced by `16` on the assignee span alone in
// `estimates.tsx` — the box gets those 16px back, the trio fits, and this
// failed on `the trio fits after all, so this case no longer exercises the
// ellipsis · Expected: > 0 · Received: 0`. Which is also the measurement's
// point: what the trio is short is exactly what the slot costs. Watched in
// Chromium, 2026-09-20.
```

above `expect(
      staffed.clipped,`; and

```ts
// Proof: `textOverflow: 'ellipsis'` taken off the resting arm in
// `estimates.tsx` — this failed on `Expected: "ellipsis" · Received: "clip"`,
// which is the cell cutting `20/24` off mid-glyph. Watched in Chromium,
// 2026-09-20.
```

above `expect(staffed.boxOverflow).toBe('ellipsis');`.

Then `GSETTINGS_BACKEND=memory bunx prettier --write apps/wbs/fe-01/e2e/layout.spec.ts`, rerun CP
green, and commit `layout.spec.ts` with the executor's slice-3 work. The comments are part of the
final reviewed commit; the hand-over list in section 11 already names the file.

**Looked at by eye, in light and dark** (design rule: the cell is judged by eye as well as by
arithmetic). Take a `locator.screenshot()` of the first row's `td[data-column$="-final"]` under a
temporary `test.use({ deviceScaleFactor: 4 })` wrapper, once as delivered and once after
`page.emulateMedia({ colorScheme: 'dark' })`, write both to `testInfo.outputPath(...)`, preserve
them under `$TMPDIR/evidence`, and remove the temporary wrapper, restoring `layout.spec.ts` from
saved bytes and proving it with `cmp`. Rehearsed: the cell reads `20… 24.3 · OL` in both palettes,
with the ellipsis in the muted foreground and the result in the row's own ink.

## 10. Stop conditions

Each is false on the tree the slice it applies to starts on. The three that are about state a
slice creates are scoped to the slices after it, because preamble rule 8 makes any true stop
condition a stop and slice 1's own starting tree has no `openspec/changes/estimate-trio-ellipsis/`
in it.

**Throughout, every slice:**

- A command's result differs from this packet's expected result and the packet does not say what to
  do next.
- A named test in a negative proof **passes** after the fault, or fails about a different fact.
  Preamble rule 20 first: restore, check the location once against the function and expression the
  row names, redo once, report both runs.
- A filter reports `0 tests ran` or `matched 0 tests`.
- Slice 2a's run is green, or slice 2b's is not.
- `estimates.tsx` needs an edit this packet does not authorise. Exactly three are authorised, each
  in one named step: the `textOverflow` property (2b.2), its `Proof:` comment (2b.6), and the stale
  sentence in the result span's comment (3.2, section 8.5). Anything else, or a file outside the
  file plan, is a stop.
- The step column's declared width, `QUIET_TRIO_PX` or `ASSIGNEE_SLOT_PX` would have to change: this
  packet's whole finding is that they do not (section 4).

**Slice 1 only:**

- `openspec/changes/estimate-trio-ellipsis/` already exists before step 1.2, or
  `openspec new change` writes it without `schema: sdd-lean` in `.openspec.yaml`, or tries to reach
  the network.

**Slices 2a, 2b and 3 only** (slice 1 creates what these require, so they cannot be asked of it):

- `openspec/changes/estimate-trio-ellipsis/verify.md` is missing, or does not carry the previous
  slice's observations.

**At hand-over, every slice:**

- `verify.md` has not been appended with this slice's own commands, results and proofs, or
  `tasks.md`'s boxes for the steps this slice completed are still unticked.

## 11. Hand-over

`git status --short --untracked-files=all` after each slice, in order:

Untracked files print **one path per line**, never a directory entry. Watched on 2026-09-20, slice
1's five lines are exactly:

```
?? openspec/changes/estimate-trio-ellipsis/.openspec.yaml
?? openspec/changes/estimate-trio-ellipsis/proposal.md
?? openspec/changes/estimate-trio-ellipsis/specs/wbs-estimate-cell/spec.md
?? openspec/changes/estimate-trio-ellipsis/tasks.md
?? openspec/changes/estimate-trio-ellipsis/verify.md
```

- Slice 2a: ` M apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx`,
  ` M openspec/changes/estimate-trio-ellipsis/tasks.md`,
  ` M openspec/changes/estimate-trio-ellipsis/verify.md`.
- Slice 2b: ` M apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx`,
  ` M openspec/changes/estimate-trio-ellipsis/tasks.md`,
  ` M openspec/changes/estimate-trio-ellipsis/verify.md`. `estimates.tsx` is on this list **because
  of** step 2b.6's required `Proof:` comment as much as the declaration itself.
- Slice 3: ` M apps/wbs/fe-01/e2e/layout.spec.ts`,
  ` M apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx` — step 3.2's correction to the
  result span's comment, which is on this list because the sentence it replaces becomes false the
  moment this slice commits,
  ` M openspec/changes/estimate-trio-ellipsis/tasks.md`,
  ` M openspec/changes/estimate-trio-ellipsis/verify.md`.

Slice 3's list does not change when the planner adds the four browser `Proof:` comments: they go
into `layout.spec.ts`, which is already on it. The lists above include every file a required proof
comment touches.

The executor never stages, commits or branches. It leaves the work in the tree, names the files and
the subject, and reports. The planner stages, reviews, replays a sample of the proofs, runs the
planner-only checks **that apply to that slice** — rows 7 and 9 after every slice, row 8 after every
slice **except 2a** (section 7's per-slice table), section 9's browser work after slice 3 only, the
host gate after the last — and commits. Asking row 8 for a green result after slice 2a is asking a
red-by-design checkpoint to be green; it is not a finding about the work.

Rehearsed on 2026-09-21: the whole prescribed change — all three source files plus the five OpenSpec
files — was staged and committed for real in a private worktree, and lefthook ran `format` and
`lint` over it and passed both (`✔️ format (1.11 seconds)`, `✔️ lint (6.15 seconds)`); the commit was
then undone with `git reset --soft HEAD~1`. Nothing this packet prescribes is refused by the hooks
the planner commits through, and `--no-verify` is never used.

## 12. The OpenSpec files, in full

`.openspec.yaml` is **not** written by hand: `openspec new change … --schema sdd-lean` writes it
(slice 1, step 1.2) and the executor only greps it. Watched 2026-09-20, it is two lines,
`schema: sdd-lean` and `created: <date>`.

`proposal.md`:

```md
## Why

A folded step cell holds three readings in 104px: the typed trio, the step's result, and an assignee slot. With the widest trio anybody has typed (`20/24/30`), a fractional result (`24.3`) and a named assignee, the trio wants 16px more than the box it is given, and the cell cut it off mid-glyph with nothing to say that more had been typed. Measured in Chromium on 2026-09-20: the `<td>` is 104px, the box 30.69px, the result 25.31px, the slot 32px.

## What Changes

**The resting trio yields legibly**

- From: A trio too wide for its box is clipped at the box edge, mid-glyph, with no mark.
- To: A trio too wide for its box ends in an ellipsis while the cell is at rest. The result and the assignee keep the rendering they already have, the assignee slot's own deliberate clipping of an assumed `(WW)` included.
- Impact: Non-breaking visual change to folded step cells whose trio does not fit.

**Editing is untouched**

- From: The focused box scrolls its whole value.
- To: Unchanged — the ellipsis is declared on the resting arm only.
- Impact: None.

## Non-Goals

This change does not widen the step column, shrink or hide the trio, change the assignee slot, change what is stored or how a result is computed, or change the hover card, which already carries the trio in full.

## Constraints

The column width is fixed: widening the step column moves the table's own width equation and fourteen unit pins. The result is the cell's main reading, so the trio is what yields. The trio is a real `<input>`, so its text cannot be styled in parts. The assignee slot's own clipping of an assumed `(WW)`, which `ASSIGNEE_SLOT_PX`'s JSDoc accepts on purpose, is unchanged and out of scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wbs-estimate-cell`: Adds what a resting trio does when it does not fit beside the result and the assignee slot.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

The change affects only the WBS frontend's folded estimate-cell rendering and its jsdom and Chromium coverage. It changes no API, stored contract, dependency, migration, or deploy path.
```

`specs/wbs-estimate-cell/spec.md`:

```md
## ADDED Requirements

### Requirement: A resting trio that does not fit ends in an ellipsis

When a folded step cell cannot show its whole typed trio, the resting trio SHALL end in an ellipsis rather than a clipped glyph, and the result and the assignee SHALL keep the rendering they already have.

#### Scenario: A wide trio stands beside a fractional result and an assignee

- **WHEN** a folded step with the trio `20/24/30`, the result `24.3` and a named assignee is at rest
- **THEN** the trio box ends in an ellipsis rather than a clipped glyph
- **THEN** the result's and the assignee's boxes are drawn inside the cell and the row stays one line high

#### Scenario: The same cell is being typed in

- **WHEN** the cell takes the focus
- **THEN** the trio box declares no ellipsis and scrolls its whole value
```

`tasks.md`:

```md
## 1. Specify how a resting trio yields

- [ ] 1.1 Create the `sdd-lean` OpenSpec change and record the intent.
- [ ] 1.2 Add the `wbs-estimate-cell` delta requirement.
- [ ] 1.3 Record slice baselines and validate the change.

## 2. Let the resting trio end in an ellipsis

- [ ] 2.1 Add the jsdom oracle for which arm carries the declaration.
- [ ] 2.2 Declare `text-overflow: ellipsis` on the resting arm only.
- [ ] 2.3 Record the green run.

## 3. Pin the staffed, fractional case in Chromium

- [ ] 3.1 Add the committed browser case and its measurement.
- [ ] 3.2 Record the planner's browser negatives and the proof comments they authorise.
```

`verify.md` starts as the two empty tables below and is filled by every slice:

```md
## Commands and results

| Command | Status | Decisive line |
| ------- | ------ | ------------- |

## R5 proofs

| Fault | Test | Observed |
| ----- | ---- | -------- |
```

Evidence references in `verify.md` are **basenames relative to the attempt's evidence directory** —
never an absolute clone, home or temporary path, because `verify.md` is published.

The whole set validated at `{'items': 108, 'passed': 108, 'failed': 0}`, exit 0, with
`OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` on the rehearsed tree.

## 13. Assumptions

Recorded rather than asked (the owner's standing instruction: assume and document).

1. **The direction is settled and only the mechanism was open.** The owner fixed "the result is the
   main reading; the trio is what yields", so section 4 chose between mechanisms by measurement and
   did not reopen the direction. The trio's full text remains reachable in two places that already
   exist — the focused box and the hover card — so the ellipsis loses nothing, it only marks a loss
   the cell was already taking silently.
2. **`clipped` stays 16 and that is accepted.** This packet does not make the trio fit; no candidate
   that keeps the column at 104 can. The committed assertion is therefore about _how_ it yields, and
   it asserts `clipped > 0` explicitly so nobody later reads the test as a fit guarantee.
3. **"Whole" is a claim about this fixture only, and about boxes rather than glyphs.** The
   committed test measures rectangles, not text. It says the result's and the assignee's boxes are
   inside the 104px cell on the selected fixture; it does not promise that every possible result or
   every possible assignee form is fully legible, and the specification in section 12 is worded to
   match. `estimates.tsx:592` to `:600` clips the assignee slot on purpose, and
   `ASSIGNEE_SLOT_PX`'s JSDoc accepts that for the assumed `(WW)` form; nothing here changes it or
   claims otherwise.
4. **`20/24/30 → 24.3` is the selected regression case, not the widest possible.**
   `libs/wbs/domain/domain/src/estimate.ts:15` bounds a point at `MAX_ESTIMATE_DAYS = 44_739_242`
   and `plan-number-format.ts` imposes no character limit, so a wider result exists in principle.
   Every fit claim here is limited to this fixture, which is the widest trio typed here in anger.
5. **A new person named `Ola` in the shared directory is harmless.** Fact 8 makes the directory
   global to a run; `Ola` collides with no existing spec, and the test's own picker assertions would
   fail loudly if another packet later created her first.
6. **`estimate-trio-ellipsis` is a `wbs-estimate-cell` modification, not a new capability.** The
   capability already exists in an unarchived change; a delta adding to it validates (fact 13).
7. **OpenSpec is required here.** This is observable behaviour in a shipped surface, so the brief's
   rule applies and the mechanical-refactor exemption does not.
8. **The screenshot review is the planner's and is not committed.** `layout.spec.ts` ships no new
   screenshot: the light artifact this file already writes is unaffected, and the dark reading is a
   temporary planner run whose spec edit is restored and proved with `cmp`.

## 14. Disposition of review 1

Every finding was checked against this repository before acting, and each was settled by rehearsal
in a private worktree on `batch-3/planning` rather than by argument. Chromium was available, so all
five browser negatives were injected and watched again in the order this revision prescribes. All
ten findings are accepted; none is rejected.

**Critical**

1. **Required OpenSpec metadata is missing from the authorized files** — FIXED. Verified:
   `openspec/changes/estimate-cell-at-rest/.openspec.yaml` holds `schema: sdd-lean` and a date, and
   the batch README's "Creating an OpenSpec change" block is the command that writes it. Rehearsed:
   `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 new change estimate-trio-ellipsis --schema
sdd-lean` printed `Created change 'estimate-trio-ellipsis' …` and `Schema: sdd-lean`, and created
   **only** `.openspec.yaml` — no `proposal.md`, `tasks.md`, `verify.md` or `specs/`. That fact is
   now stated at step 1.2, so the packet neither omits the command nor pretends it scaffolds more.
   `.openspec.yaml` is in the file plan, in slice 1's step list with its grep, in verification row
   1, in the hand-over list and in section 12, with the note that it is never hand-written and never
   passed to Prettier. Re-validated: `{'items': 108, 'passed': 108, 'failed': 0}`.
2. **A stop condition is already true before slice 1 starts** — FIXED. Verified: preamble rule 8
   makes any true stop condition a stop, and slice 1 creates `verify.md`. Section 10 is now in four
   scoped groups — every slice, slice 1 only, slices 2a/2b/3 only, and at hand-over — so no
   condition asks a slice for state a later slice creates. Slice 1 step 1.1 records its baselines
   into `$TMPDIR/evidence/baselines.txt` and step 1.6 transfers them into the `verify.md` it has by
   then created, which is the review's own suggested order.

**Important**

1. **The planner's unit-tier delta is wrong** — FIXED. Verified: `vitest.node.config.ts:46` includes
   only `NODE_SUITES`, `vitest.node-suites.ts` does not list `plan-estimates.test.tsx`, and
   `vitest.zoned.config.ts:41` includes only `src/**/*.zoned.test.{ts,tsx}`; `project.json`'s `test`
   target is the UTC run followed by the zoned one. Verification rows 7 and 8 are now separate:
   node tier **unchanged** (rehearsed `Tests 621 passed (621)` on the changed tree), UTC **+1**,
   Auckland **unchanged**. Section 3, fact 10 carries the evidence.
2. **Baseline definitions and expected counts contradict each other** — FIXED. The single **N** is
   gone. Section 6 now defines **F** as the triple `total / passed / failed` plus **V**, collected
   by the slice that compares against it, with a rehearsed orientation table that names slice 2b's
   baseline as `74 / 73 / 1` — a failing test is what that slice starts on, and saying so is the
   point. Expected transitions are stated per slice. **V + 1** is required in slice 1 only and
   **V**, unchanged, thereafter. Devsync is now "unchanged against the planner's own baseline for
   this commit", with `301 pass / 0 fail` kept as dated evidence rather than as a pin.
3. **One failure masks the assignee check** — FIXED, and it uncovered a second masking the review
   did not name. Verified: `box-geometry.ts`'s `findOverrun` measures each rectangle it is handed
   independently. **CN4** added, exactly as suggested: `transform: 'translateX(104px)'` on the
   `data-folded-assignee` span, which keeps the flex allocation and moves only the painted
   rectangle. Watched 2026-09-20: `Error: the assignee is pushed out of the cell · Expected:
undefined · Received: "right"`. **CN5** added for the row height: the cell wrapper's
   `display: 'flex'` written as `display: 'block'`. Injected first with the height assertions last,
   it failed on the **tightness** check instead (`Expected: > 0 · Received: 0`) — a block cell gives
   the box the whole line, so the trio fits. The assertions were therefore reordered so the row
   height is checked **before** the overrun trio and the tightness check, and CN5 then failed at its
   own assertion: `a staffed cell holding a trio, a result and an assignee is taller than a bare row
· Expected: 26.1875 · Received: 40.1875`. (40.1875 and not `holdsItsContents`'s 44.375: this
   fixture carries an assignee.) All five were then replayed in order on the final tree, each
   failing at its own assertion and nowhere else, and CP was rerun green at `4 passed`. The order is
   documented at the listing as load-bearing, with the masked run quoted so nobody reinstates it.
4. **Proof-comment instructions conflict with the executor contract** — FIXED, in both directions.
   The jsdom half: N2 was injected and watched for the first time (it had been predicted), giving
   `AssertionError: expected 'ellipsis' to be '' // Object.is equality`, `Tests 1 failed | 73 passed
(74)`; section 8.3 now carries the observed diagnostic, section 8.2 carries the exact `Proof:` block
   and where it goes, and slice 2b gained **step 2b.6**, which writes it only after both
   observations, plus step 2b.7 to reformat and rerun. `estimates.tsx` is in slice 2b's hand-over
   list with the proof comment named as a reason. The browser half: section 8.4's listing now
   carries **no** `Proof:` comments at all — rehearsed and run green in that form, `4 passed` — and
   slice 3 step 3.1 says so and forbids inventing them. Section 9 gives the planner the four blocks
   verbatim with the assertion each sits above, to insert after replaying.
5. **The promised behaviour exceeds implementation and coverage** — FIXED. Verified:
   `estimates.tsx:592` to `:600` clips the assignee slot deliberately and `ASSIGNEE_SLOT_PX`'s JSDoc
   accepts it for the assumed `(WW)`. The normative sentence now reads "the resting trio SHALL end
   in an ellipsis rather than a clipped glyph, and the result and the assignee SHALL keep the
   rendering they already have"; the scenario says "the result's and the assignee's **boxes** are
   drawn inside the cell". The proposal's Constraints name the assignee's own clipping as out of
   scope, section 1 and section 4 no longer say "whole", and a new assumption 3 states plainly that
   the test measures rectangles rather than glyphs and that the guarantee is limited to the selected
   fixture. No production change was broadened to meet the old wording. Re-validated at 108.

**Minor**

1. **Several "verified facts" are false on this tree** — FIXED, all three, each re-checked.
   `grep -n "textOverflow: 'ellipsis'"` on the untouched file prints `91` and **`873`**; `:881` is
   the `MismatchMark` line (the earlier `881` was read off the _changed_ file, where the new comment
   had pushed it down nine lines). `docs/superpowers/plans/2026-09-20-batch-2/` holds **nine**
   packets, now listed by name in section 5, with the ownership claim narrowed to what `git grep -l`
   over that directory actually shows and with batch-3 lane ownership explicitly disclaimed as the
   coordinator's bookkeeping. `e2e/directory.spec.ts:126` to `:130` creates `Kat ${tag}` and renames
   it `Katrin ${tag}`, so fact 8's claim is replaced by the narrower one it needed all along:
   `grep -rn Ola apps/wbs/fe-01/e2e` prints nothing.
2. **The launcher flags are incomplete** — FIXED. Verified: `run-executor.sh:24` exits 64 with
   `unknown batch $batch: pass --batch-dir` for any batch but 1 or 2. The header now reads
   `--batch batch-3 --batch-dir docs/superpowers/plans/2026-09-21-batch-3` and cites the line.
3. **Hand-over bookkeeping is inaccurate** — FIXED. Verified by running
   `git status --short --untracked-files=all` on the rehearsed tree: it prints one `??` line per
   file. Section 11 now quotes those five lines exactly instead of a directory entry, and every
   slice's list gains `openspec/changes/estimate-trio-ellipsis/tasks.md`, because each slice now
   ticks its own boxes (steps 1.6, 2a.4, 2b.7 and 3.5) and section 10's hand-over group makes an
   unticked box a stop. Slice 3 leaves task 3.2 unticked on purpose: it is the planner's.

**On the review's own note.** `docs/superpowers/plans/2026-09-20-batch-2/RESULTS.md` is indeed
absent from this worktree, which was cut from `batch-3/planning`; batch 2's lessons reached this
packet through the batch 3 brief, and the four that bear on it — proof tables stating the fact and
the literal fragment, one mutation never hiding a second check, unambiguous fault locations, and
whole-suite effects named for the planner — are what findings Critical 2 and Important 2 to 4 above
turn into instructions.

## 15. Disposition of review 2

Review 2 raised no Critical, and closed eight of review 1's ten findings. The two it marked PARTLY
are closed here, and all three Minors are accepted. Nothing is rejected. Chromium was available, so
every claim below was settled by injection and observation on 2026-09-21 rather than by argument,
and the commit hooks were run for real rather than reasoned about.

**Important**

1. **Whole-suite verification still expects an impossible result at the red-test checkpoint** —
   FIXED. Verified: `apps/wbs/fe-01/project.json:27` joins the UTC and Auckland runs with `&&`, so a
   red UTC half means Auckland never starts, and slice 2a hands over one failing test on purpose.
   Verification row 8 no longer carries a single expectation: it now points at a **per-slice table**
   under section 7 — slice 1 green and unchanged; slice 2a **not run at all**, with the focused file
   (row 3) as that checkpoint's check and the reason spelled out; slice 2b green, UTC **+1** and
   Auckland unchanged against the planner's own **slice 1** run of the same target; slice 3 green
   and unchanged. Section 11's "runs the section 9 and section 7 planner-only checks" is replaced by
   a list scoped per slice, which also confines section 9 to slice 3 (row 10 says so too, and
   section 9 opens by saying it). Row 11 is scoped to after the last slice.
2. **The assertion-by-assertion R5 claim remains false** — FIXED, with one assertion removed rather
   than papered over. Three things were wrong and each was settled by running it:
   - **The budget assertion had no fault.** CN5 fails `toBeCloseTo(staffed.bare, 1)` and never
     reaches `toBeLessThanOrEqual(ROW_HEIGHT_BUDGET)`. **CN6** added, exactly as the review
     suggested: `minHeight: 40` on the folded-cell wrapper, which makes **both** rows 42px so the
     first assertion passes and the budget is what fails. Watched 2026-09-21:
     `expect(received).toBeLessThanOrEqual(expected) · Expected: <= 28 · Received: 42`.
   - **The trio box's own containment had no fault, and cannot have one.** Both suggested faults
     were tried on the box's style: `transform: 'translateX(104px)'` and, when that failed,
     `marginLeft: 104`. Each moved the box away from where the `@` mention popover anchors, and the
     fixture died before any measurement at `Error: locator.click: Test timeout of 120000ms
exceeded` on the `Add “Ola”` option. `expect(findOverrun(staffed.cell, staffed.box), …)` is
     therefore **removed** from the committed test, for the same reason the two `scrollWidth`
     measurements were removed in round one, and both attempts are recorded in section 8.4 so nobody
     reinstates it. What it claimed is covered anyway: the box is the first item in the flex row and
     the two items after it are asserted inside the cell.
   - **The two `width > 0` checks are classified, not claimed as proven.** They are non-vacuity
     guards for the `findOverrun` calls beneath them — a zero-width rectangle sits inside every cell
     there is — exactly as `holdsItsContents` (`e2e/layout.spec.ts:1183` to `:1184`) keeps the same
     pair. No production expression decides them, so no fault is named, the treatment `boxFocused`
     already has. The listing's comment says so at the assertions.

   Section 8.4 now carries a **complete proof inventory** as a table: every assertion against its
   fault, and the four that have none with the reason. All six faults were then replayed in one
   sitting against the final tree, each failing at its own assertion and nowhere else: CN1
   `Expected: "ellipsis" / Received: "clip"`; CN2 `the result is pushed out of the cell`; CN3
   `Expected: > 0 / Received: 0`; CN4 `the assignee is pushed out of the cell`; CN5
   `Expected: 26.1875 / Received: 40.1875`; CN6 `Expected: <= 28 / Received: 42`. CP green at
   `4 passed`.

**Minor**

1. **The prescribed final source retains contradictory documentation** — FIXED. Verified: the result
   span's comment says the staffed fractional case "is not committed", which slice 3 makes false.
   New **section 8.5** gives the replacement text; slice 3 gains **step 3.2** authorising that one
   edit and nothing else; `estimates.tsx` is on slice 3's hand-over list with the reason; step 3.3
   formats both files; and the stop condition is rewritten from "more than the one property and its
   comment" to an explicit list of the **three** authorised edits to `estimates.tsx`, each named
   with the step that authorises it. The browser comment's "come through whole" is replaced by "keep
   their existing rendering, with their boxes inside the cell", which is what the revised
   specification promises.
2. **The supplied code cites nonexistent current rule numbers** — FIXED. Verified: `AGENTS.md`
   contains no "R5 #14/#15"; `docs/findings/checks-that-cannot-fail.md:26` to `:27` map R5-14 and
   R5-15 to `r5.catalogue.005` and `r5.catalogue.006`. The comment now cites the catalogue and those
   two stable ids, and the "check that cannot fail" note beside the width guards cites the catalogue
   rather than a rule number.
3. **The port-spacing instruction is insufficient** — FIXED. Verified: `playwright.config.ts:79`
   sets `DEFAULT_PORTS = [3100, 3200, 4200]` and the validation above it rejects a bad shift and
   checks only those defaults, not other shifted runs. Section 9 now says to compute `3100 + n`,
   `3200 + n` and `4200 + n`, check **all three** with `ss -ltn`, and take `n` a **multiple of 300**
   from every live shift, stating that 100, 1000 and 1100 collide against those bases and that
   distance alone is not the rule. The two rehearsal shifts are given with their resolved ports.

**Reproduced rather than argued.** Review 2 makes no claim about a hook, a lint rule or a formatter
refusing the prescribed code, but the round's instruction was to settle such things by running them,
so it was run: the whole prescribed change — all three source files plus the five OpenSpec files —
was staged and committed for real in this worktree, lefthook ran `format` and `lint` over it and
passed both (`✔️ format (1.11 seconds)`, `✔️ lint (6.15 seconds)`), and the commit was then undone
with `git reset --soft HEAD~1`. Section 11 records it. The OpenSpec listings in section 12 were also
round-tripped: written back out of this document into a change scaffolded by
`openspec new change … --schema sdd-lean`, they validate at
`{'items': 108, 'passed': 108, 'failed': 0}`.
