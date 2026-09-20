# U2 Staffed step cell: the trio yields to an ellipsis

Size: S. Estimate 0.25 / 0.5 / 1.5 days, 600,000 tokens.
Work item: `/home/df/wd/puni/puni-plan/batch-3/items/U2.md`.
Origin: section 13, "Finding for a separate work item", of
[U1, the estimate cell at rest](../2026-09-20-batch-2/u1-estimate-cell-at-rest.md).
Batch contract: [execution batch 1 README](../2026-09-19-batch-1/README.md) — "Execution contract",
"Standard blocks every packet uses", "Hidden constraints every frontend packet must respect",
"Counts are relative, never absolute", "Formatting", "Negative proofs with a restore".
Launcher: `--batch batch-3`. No `--network`: nothing here binds a port from the sandbox.

Everything in section 3 was checked in this repository on 2026-09-20 by reading the files and by
running the commands named there. Nothing is asserted from memory. **Chromium was run.** The whole
change was rehearsed in a private worktree on `batch-3/planning`, every count and every failing line
below was watched rather than predicted, and the rehearsal was then reverted. Three designs were
measured against the real stack before one was chosen; section 4 is that measurement.

## 1. Goal and non-goals

**Goal.** A folded step cell that cannot show its whole typed trio beside its result lets the
**trio** yield, and yield legibly: at rest the trio box ends in an ellipsis instead of cutting a
glyph in half, while the result and the assignee stay whole and inside the cell. The staffed,
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
   header button and at `:881` on the assumed-assignee span. Neither is the resting arm. Every
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
   because Nia was by then an existing person. `Nia` and `Uma` are the only names any spec in
   `apps/wbs/fe-01/e2e` creates; **`Ola` is free** and is what this packet uses.
9. `creatable-picker.tsx:132` to `136` calls `preventDefault` on the list's mousedown so the click
   cannot blur the box, so a measurement taken straight after the Add reports the focused
   arrangement. `e2e/layout.spec.ts:1242` to `1247` already records that as `focused=true
boxType=13px`.
10. `apps/wbs/fe-01/vitest.config.ts:168` includes `src/**/*.{test,spec}.{ts,tsx}` under
    `environment: 'jsdom'`, so `plan-estimates.test.tsx` runs under the **default** config and not
    under `vitest.node.config.ts`. The batch README's sandbox unit command does not cover it; the
    focused command in section 7 does.
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
assignee are whole, and the trio is the one reading that gives way — visibly, with a mark that says
there is more, which the hover card and the focused box both supply. In dark it reads the same. Its
limit is stated rather than hidden: `clipped` stays 16, so this packet does **not** claim the trio
fits, and the committed assertion is about how it yields.

## 5. File plan

| File                                                                      | Create or modify | What                                                                                 |
| ------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------ |
| `openspec/changes/estimate-trio-ellipsis/proposal.md`                     | create           | Intent, under 400 words.                                                             |
| `openspec/changes/estimate-trio-ellipsis/tasks.md`                        | create           | The three slices below.                                                              |
| `openspec/changes/estimate-trio-ellipsis/specs/wbs-estimate-cell/spec.md` | create           | One `### Requirement:` with its normative SHALL and two scenarios.                   |
| `openspec/changes/estimate-trio-ellipsis/verify.md`                       | create           | Commands, results and R5 proofs; appended by every slice.                            |
| `apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx`               | modify           | One `itDom` added inside `describe('one cell for the whole trio')`.                  |
| `apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx`            | modify           | One property plus its comment, in the resting arm only.                              |
| `apps/wbs/fe-01/e2e/layout.spec.ts`                                       | modify           | One committed test added inside `test.describe('the table, measured by a browser')`. |

**Neighbours.** None of the other batch 3 or batch 2 packets named in the brief (010.6 templates,
010.7 rules, 020.2 shared failures, 020.7 backend startup, 040.1 Chromium proof, 040.4 plan feed,
110.1 test axes, 110.6 retire upstream sync) owns any of these files, verified by reading
`docs/superpowers/plans/2026-09-20-batch-2/` — which holds only `u1-estimate-cell-at-rest.md` — and
by `git grep -l` over the file names above in `docs/superpowers/plans/`. **110.1 is the one to
watch**: `docs/superpowers/plans/2026-09-19-code-organization-rollout.md:259` to `260` puts
square-bracket scenario identifiers on existing test titles. This packet only **adds** titles and
edits none, so a prefix campaign and this packet cannot collide; if a title in either changed file
already carries a bracketed prefix when the slice opens, keep it verbatim.

Nothing here is under `apps/wiki/cli`, so the Twilight Bureaucrat validator identity does not move.

## 6. Slices

Each slice is dispatchable alone, records its own baseline first, and ends ready to commit. Counts
are relative to the baseline that slice recorded (batch README, "Counts are relative, never
absolute"). Every rehearsed figure below was watched on 2026-09-20 on `batch-3/planning`.

### Slice 0 (part of slice 1) — baselines

Every slice begins by recording, in its own report and in `verify.md`:

- **N** — `cd apps/wbs/fe-01 && bunx vitest run src/components/wbs/plan-estimates.test.tsx`, the
  `Tests N passed (N)` figure. Rehearsed: **73** before slice 2, **74** after.
- **V** — `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`, the
  `summary.totals.passed` figure. Rehearsed: **107** before slice 1, **108** after.

### Slice 1 — the OpenSpec change

- [ ] 1.1 Record **V**. Create the four files under `openspec/changes/estimate-trio-ellipsis/` with
      exactly the text in section 12. The delta spec's normative SHALL sits directly under the
      `### Requirement:` heading; without it validation refuses the file.
- [ ] 1.2 `GSETTINGS_BACKEND=memory bunx prettier --write` the four files, then `--check` them.
- [ ] 1.3 Validate. Expect exit 0 and `summary.totals.passed` = **V + 1**.
- [ ] 1.4 Fill `verify.md`'s two tables with this slice's real command output.

Pre-edit check: `openspec/changes/estimate-trio-ellipsis/` does not exist. Ready to commit:
the four files; subject `docs(openspec): state how a resting trio yields when it does not fit`.

### Slice 2a — the jsdom oracle, watched red

- [ ] 2a.1 Record **N** (rehearsed 73).
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

  `Tests 1 failed | N passed (N + 1)`. A green run here is a stop: the test is not measuring
  anything.

- [ ] 2a.4 Append the red run to `verify.md`.

Ready to commit: `plan-estimates.test.tsx`, `verify.md`; subject
`test(wbs-fe): pin which arm carries the resting trio's ellipsis`.

### Slice 2b — the production line, watched green

- [ ] 2b.1 Record **N** again on the tree this slice starts on (rehearsed 74 total, 1 failing).
- [ ] 2b.2 In `estimates.tsx`, in the object literal that begins `fontSize: QUIET_TRIO_PX,` — the
      **resting** arm of the `problem !== null || typing` conditional, and not either of the two
      other `textOverflow: 'ellipsis'` occurrences in this file (section 3, fact 2) — add the
      comment and property in section 8.2, directly after the `color:` line and as the object's last
      entry.
- [ ] 2b.3 Format `estimates.tsx`, rerun the test file. Expect exit 0 and `Tests 74 passed (74)`,
      that is `N` with nothing failing.
- [ ] 2b.4 `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` (exit 0) and
      `NX_DAEMON=false bunx nx run wbs-fe-01:lint` (exit 0, `Successfully ran target lint for
project wbs-fe-01`). Both watched green on the rehearsed tree.
- [ ] 2b.5 Negative **N1** and **N2** from section 8.3, each injected, watched, restored by `cp` and
      proved with `cmp`, then the file rerun green.
- [ ] 2b.6 Append both proofs and all four runs to `verify.md`.

Pre-edit check: `plan-estimates.test.tsx` contains
`itDom('ends a resting trio in an ellipsis, and only while it is resting'`, and `estimates.tsx` does
**not** contain `textOverflow` inside the resting arm. Ready to commit: `estimates.tsx`,
`verify.md`; subject `feat(wbs-fe): end a resting trio in an ellipsis when it does not fit`.

### Slice 3 — the committed browser case

The executor **has no browser**. This slice writes the spec exactly as section 8.4 gives it, runs
the type check and lint over it, and hands the run itself to the planner (section 9).

- [ ] 3.1 Add the test in section 8.4 to `apps/wbs/fe-01/e2e/layout.spec.ts`, inside
      `test.describe('the table, measured by a browser')`, immediately **above**
      `test('a toolbar panel closes when the pointer goes down outside it', …)`. Transcribe it
      verbatim, `Ola` included (section 3, fact 8).
- [ ] 3.2 `GSETTINGS_BACKEND=memory bunx prettier --write apps/wbs/fe-01/e2e/layout.spec.ts`, then
      `--check`. The listing in section 8.4 is already in its post-Prettier form.
- [ ] 3.3 `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` — exit 0. This is the slice's real
      check: `tsconfig.e2e.json` covers the spec (section 3, fact 11).
- [ ] 3.4 `NX_DAEMON=false bunx nx run wbs-fe-01:lint` — exit 0.
- [ ] 3.5 Append to `verify.md`, under "Not verified", that `wbs-fe-01:e2e` and its three negatives
      are **pending planner verification**, naming them by the section 9 identifiers CP, CN1, CN2
      and CN3.

Pre-edit check: `layout.spec.ts` contains
`test('a toolbar panel closes when the pointer goes down outside it'` and does **not** contain
`yields the trio to an ellipsis`. Ready to commit: `apps/wbs/fe-01/e2e/layout.spec.ts`,
`openspec/changes/estimate-trio-ellipsis/verify.md`; subject
`test(wbs-fe): pin the staffed, fractional folded cell in Chromium`.

## 7. Verification table

Every command runs from the repository root unless it says otherwise. Nx carries `NX_DAEMON=false`;
whole test targets carry `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

| #   | Command                                                                           | Who                                | Exit                   | The line to read                                                                                                                                                                                                                                                                                                                                               |
| --- | --------------------------------------------------------------------------------- | ---------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`     | executor                           | 0                      | `summary.totals.passed` = V + 1 after slice 1 (rehearsed 107 → 108)                                                                                                                                                                                                                                                                                            |
| 2   | `cd apps/wbs/fe-01 && bunx vitest run src/components/wbs/plan-estimates.test.tsx` | executor                           | 1 after 2a, 0 after 2b | `Tests 1 failed \| 73 passed (74)`, then `Tests 74 passed (74)`                                                                                                                                                                                                                                                                                                |
| 3   | `bunx nx run wbs-fe-01:typecheck`                                                 | executor                           | 0                      | `Successfully ran target typecheck`                                                                                                                                                                                                                                                                                                                            |
| 4   | `bunx nx run wbs-fe-01:lint`                                                      | executor                           | 0                      | `Successfully ran target lint for project wbs-fe-01`                                                                                                                                                                                                                                                                                                           |
| 5   | `bunx nx format:check --all`                                                      | executor                           | 0                      | no file listed                                                                                                                                                                                                                                                                                                                                                 |
| 6   | `bunx nx run wbs-fe-01:test:unit`, `wbs-fe-01:test`                               | **planner only**                   | 0                      | three tests in two files spawn `bun` from Node; the sandbox refuses with `spawnSync bun EPERM` (batch README). Expect `+1` test against the recorded baseline                                                                                                                                                                                                  |
| 7   | `bunx nx run tool-devsync:test --skip-nx-cache`                                   | **planner only**, files **staged** | 0                      | `301 pass`, `0 fail`. Rehearsed: with the new `openspec/` files untracked it fails on `the production index checker resolves current Markdown links and anchors` (`300 pass / 1 fail`); with them staged it passes. **No count pin moves** — the comment lines this packet adds sit in files the inventory already counts, and no project target path is added |
| 8   | `CI=1 E2E_PORT_SHIFT=<n> bunx nx run wbs-fe-01:e2e -- --grep …`                   | **planner only**                   | 0                      | section 9                                                                                                                                                                                                                                                                                                                                                      |
| 9   | `bin/h2puni-gate.sh <sha>`                                                        | **planner only**, shared host      | 0                      | `h2puni gate: running on <sha>`                                                                                                                                                                                                                                                                                                                                |

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

### 8.3 jsdom negatives (slice 2b)

| #   | Fault, by function and expression                                                                                                                                                        | Named test                                                         | Watched on 2026-09-20                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| N1  | Delete the `textOverflow: 'ellipsis',` line from the **resting** arm in `estimates.tsx` (the object literal opening `fontSize: QUIET_TRIO_PX,`), and nothing else.                       | `ends a resting trio in an ellipsis, and only while it is resting` | `AssertionError: expected '' to be 'ellipsis' // Object.is equality`, `Tests 1 failed \| 73 passed (74)` |
| N2  | Leave the resting arm alone and add the same `textOverflow: 'ellipsis',` to the **full-strength** arm, so it reads `{ fontSize: 'inherit', fontWeight: 600, textOverflow: 'ellipsis' }`. | the same test                                                      | its **focus** assertion: `expected 'ellipsis' to be ''`                                                  |

Both are required and neither hides the other: N1 proves the declaration exists at rest, N2 proves it
is absent while the cell is typed in, which is the half that keeps editing unchanged. N1 is the same
fault as slice 2a's red run and the same message; run it anyway, from green, with the patch saved.

Save each patch and each failing output under `$TMPDIR/evidence` with the README's
`if diff -u passing mutated >"$TMPDIR/evidence/n1.patch"; then echo "nothing was injected" >&2; exit
1; else test $? -eq 1; fi` form, restore by `cp` from the saved passing bytes, prove with `cmp`, and
rerun green **before** asserting on any captured status.

### 8.4 The committed browser test (slice 3)

Post-Prettier, and transcribed exactly. `findOverrun` and `ROW_HEIGHT_BUDGET` are already in scope
(section 3, fact 5).

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
  // readings that do not yield come through whole.
  //
  // Only a browser can see any of it: jsdom lays out no flex line, reports no
  // `scrollWidth`, and paints no ellipsis (`AGENTS.md`, R5 #14/#15).
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

  // What does **not** yield: the result and the assignee stay inside the cell,
  // which is the direction stated as a measurement. Both have area first — a
  // zero-width rectangle sits inside every cell there is, so an overrun check
  // against one is a check that cannot fail (`AGENTS.md`, R5).
  // Proof: the box's own `flex: 1` in `estimates.tsx` replaced by
  // `flex: 'none'`, so the trio stops yielding and takes its content width —
  // this failed on `the result is pushed out of the cell · Expected: undefined
  // · Received: "right"` — the figure is checked first, and it is the first to
  // go. Watched in Chromium, 2026-09-20.
  expect(staffed.figure.width).toBeGreaterThan(0);
  expect(staffed.who.width).toBeGreaterThan(0);
  expect(findOverrun(staffed.cell, staffed.box), 'the trio box is out of the cell').toBe(undefined);
  expect(findOverrun(staffed.cell, staffed.figure), 'the result is pushed out of the cell').toBe(
    undefined,
  );
  expect(findOverrun(staffed.cell, staffed.who), 'the assignee is pushed out of the cell').toBe(
    undefined,
  );

  // **The case has to still be the tight case, or everything under it passes
  // on a cell that never had to choose.** Measured 16 on 2026-09-20 with the
  // box at 30.69px and the trio wanting 46.69px.
  // Proof: `ASSIGNEE_SLOT_PX` replaced by `16` on the assignee span alone in
  // `estimates.tsx` — the box gets those 16px back, the trio fits, and this
  // failed on `the trio fits after all, so this case no longer exercises the
  // ellipsis · Expected: > 0 · Received: 0`. Which is also the measurement's
  // point: what the trio is short is exactly what the slot costs. Watched in
  // Chromium, 2026-09-20.
  expect(
    staffed.clipped,
    'the trio fits after all, so this case no longer exercises the ellipsis',
  ).toBeGreaterThan(0);

  // Proof: `textOverflow: 'ellipsis'` taken off the resting arm in
  // `estimates.tsx` — this failed on `Expected: "ellipsis" · Received: "clip"`,
  // which is the cell cutting `20/24` off mid-glyph. Watched in Chromium,
  // 2026-09-20.
  expect(staffed.boxOverflow).toBe('ellipsis');

  // Still one line: a trio that wrapped instead of yielding would be a taller
  // row, which is the other way this cell can fail.
  expect(
    staffed.estimated,
    'a staffed cell holding a trio, a result and an assignee is taller than a bare row',
  ).toBeCloseTo(staffed.bare, 1);
  expect(staffed.estimated).toBeLessThanOrEqual(ROW_HEIGHT_BUDGET);
});
```

**What this test deliberately does not assert, and why.** An earlier rehearsal also measured
`figure.scrollWidth - figure.clientWidth` and the same for the assignee. The first is a check that
cannot fail — the result span sets no `overflow`, so its scrolling area is its padding box — and the
mutation that should have broken it (the result's `flex: 'none'` replaced by `flex: 1`) left the
whole test **passing** (watched 2026-09-20, `1 passed`). The assignee's is falsifiable in principle
but not by any fault that keeps this fixture tight: narrowing its slot hands the 16px back to the
box and trips the tightness assertion instead. Both were removed rather than committed as decoration
(`AGENTS.md`, R5, and `docs/findings/checks-that-cannot-fail.md`). The overrun checks that replaced
them are proven by CN2 below.

**Assertion order is load-bearing.** The overrun trio stands **above** `clipped > 0`, because the
`flex: 'none'` mutation makes the trio fit as well as pushing the result out; with the tightness
check first it would have been reported as a fixture failure. Do not reorder them.

## 9. Planner-only browser work

Standing rules for every command in this section: `CI=1` (so `reuseExistingServer` is false and the
stack is fresh), `NX_DAEMON=false`, `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT`, always
through the Nx target (a bare `bunx playwright test` lacks the environment and the backend refuses
to start), and an `E2E_PORT_SHIFT` nobody else is using — the config throws on a collision, and a
collision is a stop, never a reason to reuse a server. The rehearsal used `2500`. After any run that
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

| #   | What                                                                                                                                                                                           | Command                                   | Expected, watched 2026-09-20                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| CP  | The green run                                                                                                                                                                                  | the grep above                            | exit 0, `4 passed`                                                                                                        |
| CN1 | Delete `textOverflow: 'ellipsis',` from the resting arm of `estimates.tsx`                                                                                                                     | `--grep "yields the trio to an ellipsis"` | exit 1, `Expected: "ellipsis"` / `Received: "clip"` at `expect(staffed.boxOverflow).toBe('ellipsis')`                     |
| CN2 | In the trio box's own style, `flex: 1,` → `flex: 'none',` (the occurrence directly under the comment ending `is back to what it was.`, **not** the `flex: 1` in the rolled-trio span below it) | the same grep                             | exit 1, `Error: the result is pushed out of the cell` / `Expected: undefined` / `Received: "right"`                       |
| CN3 | On the assignee span only (`data-folded-assignee`), `width: ASSIGNEE_SLOT_PX,` → `width: 16,`                                                                                                  | the same grep                             | exit 1, `Error: the trio fits after all, so this case no longer exercises the ellipsis` / `Expected: > 0` / `Received: 0` |

After each injection: save the patch and the failing output under `$TMPDIR/evidence`, restore from
the saved passing bytes with `cp`, prove with `cmp`, and rerun CP green. The three `Proof:` comments
in section 8.4 already name what was observed; the planner confirms them rather than rewriting them,
and replaces any line that differs with what this run actually printed.

**Looked at by eye, in light and dark** (design rule: the cell is judged by eye as well as by
arithmetic). Take a `locator.screenshot()` of the first row's `td[data-column$="-final"]` under a
temporary `test.use({ deviceScaleFactor: 4 })` wrapper, once as delivered and once after
`page.emulateMedia({ colorScheme: 'dark' })`, write both to `testInfo.outputPath(...)`, preserve
them under `$TMPDIR/evidence`, and remove the temporary wrapper, restoring `layout.spec.ts` from
saved bytes and proving it with `cmp`. Rehearsed: the cell reads `20… 24.3 · OL` in both palettes,
with the ellipsis in the muted foreground and the result in the row's own ink.

## 10. Stop conditions

Each is false on the real starting tree; each holds throughout.

- A command's result differs from this packet's expected result and the packet does not say what to
  do next.
- A named test in a negative proof **passes** after the fault, or fails about a different fact.
  Preamble rule 20 first: restore, check the location once against the function and expression the
  row names, redo once, report both runs.
- A filter reports `0 tests ran` or `matched 0 tests`.
- Slice 2a's run is green, or slice 2b's is not.
- `estimates.tsx` needs more than the one property and its comment, or a second file outside the
  file plan needs editing.
- The step column's declared width, `QUIET_TRIO_PX` or `ASSIGNEE_SLOT_PX` would have to change: this
  packet's whole finding is that they do not (section 4).
- `verify.md` is missing or has not been appended by the slice that is handing over.

## 11. Hand-over

`git status --short --untracked-files=all` after each slice, in order:

- Slice 1: `?? openspec/changes/estimate-trio-ellipsis/` (four files: `proposal.md`, `tasks.md`,
  `verify.md`, `specs/wbs-estimate-cell/spec.md`).
- Slice 2a: ` M apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx`,
  ` M openspec/changes/estimate-trio-ellipsis/verify.md`.
- Slice 2b: ` M apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx`,
  ` M openspec/changes/estimate-trio-ellipsis/verify.md`.
- Slice 3: ` M apps/wbs/fe-01/e2e/layout.spec.ts`,
  ` M openspec/changes/estimate-trio-ellipsis/verify.md`.

Slice 3's list stays the same after the planner's browser work: the three `Proof:` comments it
confirms are already in the delivered listing. The path lists above include every file a required
proof comment touches.

The executor never stages, commits or branches. It leaves the work in the tree, names the files and
the subject, and reports. The planner stages, reviews, replays a sample of the proofs, runs the
section 9 and section 7 planner-only checks, and commits.

## 12. The OpenSpec files, in full

`proposal.md`:

```md
## Why

A folded step cell holds three readings in 104px: the typed trio, the step's result, and an assignee slot. With the widest trio anybody has typed (`20/24/30`), a fractional result (`24.3`) and a named assignee, the trio wants 16px more than the box it is given, and the cell cut it off mid-glyph with nothing to say that more had been typed. Measured in Chromium on 2026-09-20: the `<td>` is 104px, the box 30.69px, the result 25.31px, the slot 32px.

## What Changes

**The resting trio yields legibly**

- From: A trio too wide for its box is clipped at the box edge, mid-glyph, with no mark.
- To: A trio too wide for its box ends in an ellipsis while the cell is at rest, and the result and the assignee are unaffected.
- Impact: Non-breaking visual change to folded step cells whose trio does not fit.

**Editing is untouched**

- From: The focused box scrolls its whole value.
- To: Unchanged — the ellipsis is declared on the resting arm only.
- Impact: None.

## Non-Goals

This change does not widen the step column, shrink or hide the trio, change the assignee slot, change what is stored or how a result is computed, or change the hover card, which already carries the trio in full.

## Constraints

The column width is fixed: widening the step column moves the table's own width equation and fourteen unit pins. The result is the cell's main reading, so it and the assignee may not yield. The trio is a real `<input>`, so its text cannot be styled in parts.

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

When a folded step cell cannot show its whole typed trio beside its result, the resting trio SHALL end in an ellipsis, and the result and the assignee SHALL stay whole and inside the cell.

#### Scenario: A wide trio stands beside a fractional result and an assignee

- **WHEN** a folded step with the trio `20/24/30`, the result `24.3` and a named assignee is at rest
- **THEN** the trio box ends in an ellipsis rather than a clipped glyph
- **THEN** the result and the assignee are drawn inside the cell and the row stays one line high

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
- [ ] 3.2 Record the planner's browser negatives.
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
3. **`20/24/30 → 24.3` is the selected regression case, not the widest possible.**
   `libs/wbs/domain/domain/src/estimate.ts:15` bounds a point at `MAX_ESTIMATE_DAYS = 44_739_242`
   and `plan-number-format.ts` imposes no character limit, so a wider result exists in principle.
   Every fit claim here is limited to this fixture, which is the widest trio typed here in anger.
4. **A new person named `Ola` in the shared directory is harmless.** Fact 8 makes the directory
   global to a run; `Ola` collides with no existing spec, and the test's own picker assertions would
   fail loudly if another packet later created her first.
5. **`estimate-trio-ellipsis` is a `wbs-estimate-cell` modification, not a new capability.** The
   capability already exists in an unarchived change; a delta adding to it validates (fact 13).
6. **OpenSpec is required here.** This is observable behaviour in a shipped surface, so the brief's
   rule applies and the mechanical-refactor exemption does not.
7. **The screenshot review is the planner's and is not committed.** `layout.spec.ts` ships no new
   screenshot: the light artifact this file already writes is unaffected, and the dark reading is a
   temporary planner run whose spec edit is restored and proved with `cmp`.
