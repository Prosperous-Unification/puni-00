# U1 Estimate cell at rest: the result is the main reading, the trio recedes

Size: M. Estimate 0.5 / 1 / 2 days, 800,000 tokens.
Design: [the estimate cell at rest](../2026-09-20-wbs-estimate-cell-at-rest.md).
Batch contract: [execution batch 1 README](../2026-09-19-batch-1/README.md) — "Execution contract",
"Standard blocks every packet uses", "Hidden constraints every frontend packet must respect".
Launcher: `--batch batch-2`.

Everything in section 3 was checked in this repository on 2026-09-20 by reading the files and by
running the commands named there. Nothing is asserted from memory. Every count, every red run and
every negative-proof message in this packet was **watched**, not predicted: the whole change was
rehearsed in a worktree on 2026-09-20 and then reverted, and section 3 records what the runs said.

## 1. Goal and non-goals

**Goal.** In a folded step cell the step's **result** becomes the cell's main reading — the row's
own type, the row's own foreground, tabular numerals, no leading `·` — and the typed trio recedes
while the cell is not being typed in: smaller, muted, and back to full strength the moment it takes
the focus. A parent's rolled-up cell reads the same way. A flat trio (`5`, whose result is also `5`)
shows the result and hides the repeated trio at rest, so a cell never reads `5 5`. An unestimated
step stays empty and a refused trio never recedes.

**Non-goals.** What is stored, how the result is computed (`showFinal`, `showDay`), the unfolded
three-box layout, the hover card's content, keyboard navigation, the `@` mention, the assignee slot,
the phone card face (`plan-cards.tsx`), and any spread or uncertainty mark. No new CSS file rule: the
whole change is inline style on the two elements that already carry inline style.

## 2. Read first

| File                                                                     | Why                                                                                                |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `LLM_README.md`                                             | R1 to R5. R5 governs every check this packet adds.                                                 |
| `../2026-09-19-batch-1/README.md`                                        | The execution contract and the standard blocks. This packet links to them instead of copying them. |
| `../2026-09-20-wbs-estimate-cell-at-rest.md`                             | The direction, which is fixed. Sections "Direction Dany chose" and "Proof and gates".              |
| `apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx`           | The file the change is in. Its comments carry dated measurements you must not silently invalidate. |
| `apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx`              | The jsdom oracle. `describe('one cell for the whole trio')` is the block that changes.             |
| `apps/wbs/fe-01/src/components/wbs/plan-number-format.ts`                | To confirm it needs no edit: the `·` is in the component, not in the formatter.                    |
| `apps/wbs/fe-01/e2e/layout.spec.ts`, lines 1107 to 1226 and 1362 to 1440 | The two Chromium tests whose expected text this change moves.                                      |
| `apps/wbs/fe-01/e2e/dark-mode.spec.ts`, lines 120 to 230 and 425 to 450  | `contrastOf` and `READABLE`, which the new dark-mode test uses.                                    |
| `apps/wbs/fe-01/tsconfig.json:33` to `38`, `tsconfig.e2e.json`           | Why the executor's type check covers `e2e/**/*.ts` as well as `src`.                               |

## 3. Verified facts

Line numbers below are anchors in the **original baseline** — the tree this packet's slice 0 sees.
Slices 2 and 3 shift them. In every instruction the **exact quoted text is the authoritative
locator**; a line number is a hint for finding it.

### The cell as it stands

- `apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx:153` —
  `const finalSaysMore = final !== atRest;` is the whole of today's "draw the figure" rule.
- `estimates.tsx:139` — `const atRest = unfolded ? final : stored;`. So on an **unfolded** row
  `final === atRest` and `finalSaysMore` is false: today the unfolded cell never draws the figure
  span. Any replacement condition that drops the unfolded case draws the result twice.
- `estimates.tsx:481` to `521` — the figure span: `marginLeft: 3`, `flex: 'none'`,
  `fontWeight: 'normal'`, `fontSize: 10`, `color: 'var(--muted-foreground)'`, content `· {final}`.
  Its comment block (lines 482 to 508) is the load-bearing one: it records that 10px was chosen
  because at the row's 13px the widest trio typed in anger, `20/24/30`, clipped the box by 8px in a
  96px column, watched in Chromium on 2026-08-30.
- `estimates.tsx:383` to `412` — the trio box: `font: 'inherit'`, `fontWeight: 600`, `flex: 1`,
  `minWidth: 0`, plus the invalid background and border when `problem !== null`.
- `estimates.tsx:437` to `479` — the parent's rolled-up trio span, `data-rolled-trio`, deliberately
  spelled with the box's `flex: 1`, `minWidth: 0`, `boxSizing: 'border-box'`, `padding: 2`,
  `border: '2px solid transparent'`, so a parent's first digit starts where a leaf's typed digit does.
- `estimates.tsx:233` to `241` — the wrapper: `display: flex`, `alignItems: 'baseline'`,
  `fontWeight: 600`, and `color: 'var(--destructive)'` when there is a complaint. The result span
  inherits weight and colour from here, which is what makes it the strong reading for free.
- `estimates.tsx:563` — the empty assignee slot is reserved **only** when `reading.anyAssignee`
  holds: `{doing === null && reading.anyAssignee && (…)}`. An unstaffed column therefore pays
  nothing for the assignee, which is why the fit case in section 6 has to staff a row on purpose.
- `estimates.tsx:874` — `export const ASSIGNEE_SLOT_PX = 32;` is the file's existing pattern for a
  measured constant with its measurement in the JSDoc. `QUIET_TRIO_PX` follows it.
- `estimates.tsx:107` — the file already carries
  `// eslint-disable-next-line react-hooks/rules-of-hooks` above `useCardOpenOn`, with the comment
  at lines 101 to 106 explaining why a hook is legal here: `flexRender` builds this with
  `React.createElement`, so the `cell` property **is** a component. A second hook needs a second
  disable comment on its own line; the justification above it already covers both.
- `apps/wbs/fe-01/src/components/wbs/plan-number-format.ts:9` — `showFinal` returns the bare figure;
  `plan-number-format.ts:21` — `showDay` rounds to one decimal for display.
  **`plan-number-format.ts` is not edited by this packet.**

### The trio box's font comes from two places, and they fight

- `apps/wbs/fe-01/src/styles.css:457` to `461` — the base reset's `font: inherit` for form controls
  carries `:not([data-grid], [data-grid] *)`, so it deliberately stops at the grid.
- `apps/wbs/fe-01/src/styles.css:602` to `606` —
  `[data-grid] tbody, [data-grid] tbody input, [data-grid] tbody textarea { font-size: 13px; line-height: 1.4 }`.
  That is the grid's own type, with its own proof comment at lines 597 to 601.
- So the box's `font: 'inherit'` inline (estimates.tsx:385) and the stylesheet agree on 13px today.
  They will not agree once the box has a second size: **an inline `font` shorthand outranks the
  stylesheet, and React warns when a longhand (`fontSize`) changes between renders while a
  conflicting shorthand (`font`) is also set.** The shorthand is therefore replaced by the three
  longhands it was there for — `fontFamily`, `fontStyle`, `lineHeight` — and `fontSize` and
  `fontWeight` become the two the rest state owns. `font: inherit` sets nothing else this box uses.
- **Watched consequence, 2026-09-20.** Because `font: 'inherit'` expands, today's box already
  reports `style.fontSize === 'inherit'`. That is why the "refused trio" test of slice 2 is a
  regression test that **passes before the change** (section 7, slice 2's red run).

### What the jsdom oracle pins today

Run on 2026-09-20 from `apps/wbs/fe-01`:
`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx vitest run src/components/wbs/plan-estimates.test.tsx`
→ `Test Files 1 passed (1)`, `Tests 65 passed (65)`, 14.4s. The same command over
`plan-estimates.test.tsx` **and** `plan-read-and-write.test.tsx` → `Tests 153 passed (153)`.

- `plan-estimates.test.tsx:837` — `foldedFinal(number, stepId)` reads `[data-folded-final="…"]`.
  It returns `Element | null`; this packet widens it to `querySelector<HTMLElement>` so the new
  computed-style test needs no cast (watched: lint and the type check both pass after the widening).
- The `· `-prefixed pins are at lines 902, 916, 964, 971, 992 (`'· 4'`), 1068 (`'· 3.7'`),
  1271 (`'· 4'`) and 1371 (`'· 2'`). **Counted, not guessed:** over the baseline file
  `toBe('· 4')` occurs 6 times, `toBe('· 3.7')` once and `toBe('· 2')` once — eight.
- `plan-estimates.test.tsx:934` to `944`, test `says a flat trio once`, ends
  `expect(foldedFinal('010')).toBeNull();`. The design reverses that rule, so this test is rewritten,
  not deleted.
- `plan-estimates.test.tsx:1568`, `shows the final figure be-01 computed, per step and in total`,
  types `2/3/10` into three unfolded boxes and expects `[data-final="step-dev"]` to read `'4'`
  (line 1577), then `'10'` after the method changes (1589, 1597). These must stay green: they are
  what catches a result drawn twice on an unfolded row. **Its doubled reading would be `44`, not
  `3.73.7`** — and in fact that is not the assertion N5 trips; see section 8.
- `plan-read-and-write.test.tsx:2842` — `expect(screen.getByText('· 5')).toBeInTheDocument();`. It
  renders the desktop table, so this is the same `[data-folded-final]` span. Its test is
  `estimate refreshes only tree without a socket` (`plan-read-and-write.test.tsx:2800`).
- `plan-cards.test.tsx:2126` pins `'· 3.7'` for the **phone card face**, which has its own
  `finalSaysMore` at `plan-cards.tsx:2517` and its own `· {trio.final}` at `plan-cards.tsx:2604` to
  `2609`. That face is out of scope (section 5), so that pin does not move.

**Blast radius, measured rather than guessed.** The change described in section 6 was prototyped in
this worktree on 2026-09-20 and the whole jsdom tier was run:
`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1`
→ before: `Test Files 115 passed (115)`, `Tests 2834 passed (2834)`; with the change and **no** test
edits: `Test Files 2 failed | 113 passed (115)`, `Tests 9 failed | 2825 passed (2834)`. Re-checked
over the two files alone on 2026-09-20: `Tests 9 failed | 144 passed (153)`. The nine are the eight
in `plan-estimates.test.tsx` named in section 8 plus
`plan-read-and-write.test.tsx > estimate refreshes only tree without a socket`. **No other file in
the repository is affected.** The prototype was then reverted; the tree this packet starts from is
clean.

### The result the column has to hold is fractional only under one rounding

- `libs/wbs/domain/domain/src/estimate.ts:152` —
  `export const ESTIMATE_ROUNDINGS = ['exact', 'floor', 'round', 'ceil'] as const;`.
- `apps/wbs/fe-01/src/components/wbs/estimating-panel.tsx:69` to `87` — the four roundings are
  offered as radios titled `Keep the fraction` (`exact`), `Round down`, `Round to the nearest` and
  `Round up`. The default in the e2e seed charges `ceil` per step, which is why the existing
  Chromium test reads `25` and not `24.3`.
- `apps/wbs/fe-01/e2e/project-settings.spec.ts:163` to `174` — the dialog is opened by the button
  named `Project settings` and offers the tabs `Teams`, `Priorities`, `Steps`, `Estimating`,
  `Optimization`. So `Keep the fraction` is reachable from a browser test.
- PERT over `20/24/30` is `(20 + 4 × 24 + 30) / 6 = 24.3333…`, which `showDay` prints as `24.3`.
  That is the widest result this column has to hold, and it exists only under `Keep the fraction`.

### There are no pixel baselines in this repository

This contradicts the design document's "the baselines for every view with step columns are
regenerated in the same change", and it is the single largest correction in this packet.

- `git ls-files '*.png'` names three files, all under `docs/assistant/`. No `.png` is committed
  under `apps/`.
- `grep -rn "toHaveScreenshot\|toMatchSnapshot\|snapshotPathTemplate" apps/ libs/ tools/ .github/`
  → no matches. `grep -rn "update-snapshots"` across the repository → no matches.
- `apps/wbs/fe-01/playwright.config.ts:161` to `167` — `testDir: './e2e'`,
  `outputDir: './test-results'`, `workers: 1`, `retries: 0`; `use.screenshot: 'only-on-failure'`;
  one project, `chromium`, viewport 1400x900.
- CI's `pixels` is a Chromium **geometry** gate, not an image gate. `.github/workflows/ci.yml`:
  `pixels_mode` decides whether the browser stack is affected; `pixels_shard` runs
  `bunx playwright install --with-deps chromium` and then `bun run e2e -- --shard=N/4` over a 4-way
  matrix; `pixels` is the aggregating required check. The uploaded artifact is
  `apps/wbs/fe-01/test-results/` plus `playwright-report/`.
- The only screenshots taken are deliberate artifacts for a human eye, asserted only to exist:
  `e2e/layout.spec.ts:1018` to `1026` (`wbs-table.png`), `e2e/layout.spec.ts:3557`,
  `e2e/status.spec.ts:271`, `e2e/external-refs.spec.ts:888`.

So **there is nothing to regenerate**. The design's "reviewed by eye, light and dark" is a
requirement about a **review**, not about baselines, and section 9's P5 keeps both halves of it.

### The Chromium tests this change touches

- `e2e/layout.spec.ts:1107`, `holds a trio and its figure on one line of a folded step cell`. Its
  helper `holdsItsContents` (lines 1171 to 1198) asserts `measured.cell.width` is `104` (the `<td>`
  box, not the 96px declared column), no overrun for box or figure,
  `clipped = box.scrollWidth - box.clientWidth <= 0` with the message
  `the trio does not fit the box beside its figure`, the estimated row's height close to the bare
  row's, and the row inside `ROW_HEIGHT_BUDGET = 28` (line 55). Text pins: line 1204
  `expect(seeded.said).toBe('· 4')`, line 1222
  `await expect(page.locator('[data-folded-final]').first()).toHaveText('· 25')`, line 1225
  `expect(wide.said).toBe('· 25')`.
- **`seedPlan` staffs nobody** (`e2e/layout.spec.ts:214` to `272` sets two names, one dependency,
  one estimate and a project start date, and assigns no one). With `estimates.tsx:563`'s
  `reading.anyAssignee` guard, the fit test as it stands therefore measures an **unstaffed** column
  with no 32px slot in it. Section 6 and slice 3 fix that.
- `e2e/layout.spec.ts:1260`, `a step’s figure lands at one x whether or not the row is assigned`,
  shows the verified way to staff a row from a browser test: fill the folded cell with
  `'1/2/3 @Nia'`, then click the option named `Add “Nia”` (lines 1310 to 1320), after which
  `[data-folded-assignee]` is present on that row and `[data-folded-assignee-slot]` on the other.
  That test is otherwise unaffected by this packet.
- `e2e/layout.spec.ts:1362`, `stands a parent’s figure in the same slot as its leaves’`. Text pins at
  lines 1393 and 1394, both `'· 4'`. Line 1435 compares `trioMetrics` — `paddingLeft`,
  `borderLeftWidth`, `fontSize`, `fontWeight` — between the parent's `[data-rolled-trio]` span and
  the leaf's **unfocused** `<input>`, with `toEqual`. **This is why the rolled-up span must take the
  same quiet size and weight as the resting box, in the same slice.**
- `e2e/dark-mode.spec.ts:23` to `51` — its own `seedPlan` estimates **both** rows `2/4/6`, so a
  folded step cell with a trio in it is on screen in every dark-mode test.
  `e2e/dark-mode.spec.ts:190` — `const READABLE = 4.5;`.
  `e2e/dark-mode.spec.ts:138` — `contrastOf` composites through ancestors and rasterises through a
  canvas, which is the oracle the new contrast test uses and the one the contrast **fault** in P4
  is watched through.

### Targets, tiers and what the sandbox can run

- `apps/wbs/fe-01/project.json` — `test` runs `TZ=UTC bunx vitest run …` then the zoned config;
  `test:unit` runs the node tier; `e2e` runs `bun run tools/dev/setup.ts` then `bunx playwright test`;
  `typecheck` is `bunx tsc --build --force apps/wbs/fe-01/tsconfig.json`; `lint` covers `src` **and**
  `e2e`.
- `apps/wbs/fe-01/tsconfig.json:33` to `38` references `./tsconfig.e2e.json`, whose `include` is
  `["e2e/**/*.ts", "e2e-packaged/**/*.ts", "playwright.config.ts", "playwright.packaged.config.ts"]`.
  **So the executor's type check checks the browser specs too**: lint is not its only check on them.
  What the executor cannot do is _run_ a browser.
- `apps/wbs/fe-01/vitest.node-suites.ts` — `plan-estimates.test.tsx` is **not** in `NODE_SUITES` and
  must not be added: it imports `@testing-library/react` and needs jsdom. No file is added to or
  removed from `NODE_SUITES` by this packet, so `src/test-tiers.test.ts` does not move.
- The executor never runs `wbs-fe-01:test:unit` or `wbs-fe-01:test` (batch README, "Frontend tests
  inside the sandbox"). It runs the focused files named here with the default (jsdom) config, which
  spawns no `bun` from Node and was observed working.
- The focused runner is **Vitest**, not Bun's runner, so `-t` is Vitest's substring filter over the
  joined name. Watched on 2026-09-20: `-t "gives the trio back its strength"` reported
  `Tests 1 failed | 68 skipped (69)`. A run reporting `0 tests` or `no test files found` is a stop.
- No new source file is created anywhere, so nothing under `apps/wiki/cli` changes and the Twilight
  Bureaucrat validator identity is untouched.

## 4. Assumptions recorded instead of asked

The owner's standing instruction is to assume and record rather than ask. Each of these is a
decision this packet takes; each can be reopened.

1. **The quiet trio stays visible at 96px.** It does not yield to the result and move into the hover
   card. Reason: it is the only place the three numbers are without a hover, and section 6's
   arithmetic says it fits with room to spare. The fallback, if Chromium disagrees, is in section 9's
   decision rule D1 — and it is the design's own fallback, not an invention.
2. **No spread or uncertainty mark in this change.** The design calls it scope and a question; it
   stays a question.
3. **The trio recedes to 10px and `var(--muted-foreground)`.** 10 because that is already this
   table's caption size (`styles.css:708`, the heading row) and the size the figure has been drawn at
   since 2026-08-30, so it is a size this column is known to be readable at. The colour is the one
   the figure and the assignee already use in this cell. Dark-mode legibility is measured, not
   assumed: section 9, P4 and decision rule D2.
4. **The result inherits weight and colour from the cell wrapper** rather than declaring its own.
   That is what makes a complaint recolour it for free (`estimates.tsx:240`) and what makes it
   exactly the row's foreground. The jsdom test therefore asserts the **absence** of a declared
   size, weight and colour on the result span; the positive "it equals the row's" is a computed
   style and belongs to Chromium (section 9, P1).
5. **A flat trio hides the trio's text at rest with `color: 'transparent'`, not with `visibility` or
   by not rendering it.** The box must keep its geometry, because the whole column's alignment is
   built on the box and the rolled-up span being the same slot, and the value must still be there for
   the keyboard, the screen reader and the copy path (`copies one row’s cell into another`).
   It applies to the parent's rolled-up span as well as the leaf's box, and each has its own test
   and its own negative (N6 and N6b).
6. **The phone card face is out of scope.** `plan-cards.tsx:2517` and `2604` keep their own
   `finalSaysMore` and their own `· `. A 390px card is not a 96px column, the design's problem
   statement is about the step **columns**, and `plan-cards.test.tsx:2126` therefore does not move.
   Recorded as a follow-up, not done here.
7. **The OpenSpec capability is new: `wbs-estimate-cell`.** `openspec/specs/wbs-table-modules` is
   about which module owns which concept and about composition identity, not about what a cell reads;
   adding "the result is the main reading" there would put a reading rule inside a structural
   capability. The choice rests on **domain ownership alone**. It is explicitly _not_ rested on any
   claim that `wbs-domain` could not take a delta: `openspec/specs/` has no `wbs-domain` directory,
   and `openspec/changes/clear-estimate/specs/wbs-domain/spec.md` nevertheless carries
   `## ADDED Requirements` and validates. A missing main specification does not preclude an added
   requirement.
8. **`e2e/layout.spec.ts`'s pins and its new staffed case are edited by the executor in slice 3 and
   run by the planner in P1.** The executor cannot start Chromium; the edits are exact strings and
   exact blocks, given in full in slice 3, so the executor is transcribing rather than deciding.
   Every one of them is listed under "pending planner verification" in `verify.md`. The Chromium
   edits go in **slice 3, before P1 runs**, because slice 3 is what removes the `· ` the browser
   assertions pin.
9. **The historical proof comments are kept and dated rather than rewritten.** `Expected: 858`,
   `borderLeftWidth "2px" / "1px"` and the 2026-08-30 clip measurement are records of watched
   failures. Only the sentence that states a **present** fact — that the figure is set at 10px
   because the trio needs the room — is rewritten, because that fact is now the other way round.
10. **Tests come before production in slices 2 and 3, and the red run is expected, named and
    recorded.** Some of the new tests are regressions that pass before the change; those are named
    as such so a green line in a red run is not mistaken for a mistake.

## 5. File plan

| File                                                             | Create/modify | Responsibility in this change                                                                           |
| ---------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx`   | modify        | The whole behaviour: the focus state, the quiet trio, the strong result, `QUIET_TRIO_PX`, the comments. |
| `apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx`      | modify        | Eight pins updated, one test rewritten, eight tests added, one helper widened, one helper added.        |
| `apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx` | modify        | One pin, at `expect(screen.getByText('· 5')).toBeInTheDocument();`.                                     |
| `apps/wbs/fe-01/e2e/layout.spec.ts`                              | modify        | Five text pins, three comments, one staffed and fractional case. Planner-run.                           |
| `apps/wbs/fe-01/e2e/dark-mode.spec.ts`                           | modify        | One new contrast test for the quiet trio. Planner-run.                                                  |
| `openspec/changes/estimate-cell-at-rest/…`                       | create        | The OpenSpec change: proposal, delta spec, tasks, verify.                                               |

**Not touched, by name:** `plan-number-format.ts`, `plan-cards.tsx`, `plan-cards.test.tsx`,
`estimate-draft.ts`, `use-estimate-drafts.ts`, `folded-step-card.tsx`, `styles.css`,
`vitest.node-suites.ts`, `cell-input.tsx`, and every other `e2e/*.spec.ts`.

**Lanes, with what is and is not verified.** Only this packet exists under
`docs/superpowers/plans/2026-09-20-batch-2/` today, so **no other batch 2 packet's file plan could be
read**; what follows is read off the work items and the plans they cite, and the ownership of every
neighbour is **pending verification** once its packet is written.

- 010.6 templates, 010.7 rules and 020.2 shared failures are Twilight Bureaucrat and backend work;
  020.7 is backend startup; 110.6 retires the upstream sync in devsync. None reaches
  `apps/wbs/fe-01/src/components/wbs`.
- 040.4 is the plan feed (`use-plan-read.ts` and the plan modules, not the column families).
- **110.1 test axes shares one file with this packet and must be sequenced.**
  `docs/superpowers/plans/2026-09-19-code-organization-rollout.md:259` to `260` tells that work to
  adopt a square-bracket scenario identifier at the front of a test title and to "apply it first to
  one capability end to end… use plan refresh". This packet edits exactly such a test,
  `plan-read-and-write.test.tsx:2800`, `estimate refreshes only tree without a socket`. **U1 owns
  the single assertion inside that test's body and nothing else in the file; it must not rename the
  test or strip a scenario prefix.** If 110.1 has already landed a prefix, keep it verbatim and edit
  only the assertion. If U1 lands first, 110.1 renames the title over U1's assertion, which is a
  clean merge. This is a shared-file reservation, not an absence of overlap.
- **040.1, the Chromium proof of the packages, is the one to watch**: it runs the browser suite. It
  is not expected to edit `e2e/layout.spec.ts` or `e2e/dark-mode.spec.ts`; if it turns out to, this
  packet owns both files and 040.1 defers.

## 6. The design, and why it fits in 96px

### The two elements

At rest the folded leaf cell is `[quiet trio box] [strong result] [assignee slot]`; on focus the box
comes back to full strength and the result does not move. A parent's cell is
`[quiet rolled-up trio span] [strong result] [assignee slot]`, and the span carries exactly the
box's metrics so the two rows read as one column.

### The fit argument

Today's cell, measured in Chromium and recorded at `estimates.tsx:496` to `508`: the widest trio
anyone has typed here, `20/24/30`, fits the box at the row's 13px **only because** the figure beside
it is drawn at 10px; at 13px the box clipped by 8px. The change moves the sizes the other way, so
the arithmetic has to be redone before anything is written.

Take the worst case there is: trio `20/24/30` (eight glyphs, six digits and two solidi) beside the
widest result this column can print, `24.3` (four glyphs), in a column that is **staffed**, so the
32px assignee slot is really there. For a humanist sans at the digit advance of `0.5556em` and a
solidus at about `0.278em`:

| Reading                   | Today                              | After                                   |
| ------------------------- | ---------------------------------- | --------------------------------------- |
| trio `20/24/30`           | 13px: 6x7.22 + 2x3.61 = **50.5px** | 10px: 6x5.56 + 2x2.78 = **38.9px**      |
| result, short (`25`)      | 10px `· 25`: ~**17.2px**           | 13px `25`: 2x7.22 = **14.4px**          |
| result, long (`24.3`)     | 10px `· 24.3`: ~**25.6px**         | 13px `24.3`: 3x7.22 + 3.61 = **25.3px** |
| worst pair, trio + result | **76.1px**                         | **64.2px**                              |

Two things pay for the result growing by three points. **Dropping the leading `· ` returns about
6px**, which is most of what the size increase costs on a two-glyph result and all of it on a
four-glyph one. **Taking the trio to the caption size returns 11.6px**, which is the whole of the
headroom. The worst pair gets ~12px cheaper than the pair that fits today, in a cell whose measured
`<td>` is 104px with a 32px assignee slot inside it.

That is an estimate from glyph metrics, not a measurement, and it does not decide anything: it says
only that the change is expected to have headroom rather than to spend it.

**The measurement is Chromium's, and today it does not measure this case.** The existing fit test
seeds no assignee (`e2e/layout.spec.ts:214` to `272`) and, under the default `ceil` rounding, reads
the rounded `25` rather than `24.3`. Green there would say nothing about a 96px column that is
holding a 32px slot and a four-glyph result at the same time. Slice 3 therefore extends that test
with the constrained case — **`Keep the fraction`, `20/24/30 @Nia`, result `24.3`, the row carrying
`[data-folded-assignee]`** — and P1 and P3 in section 9 run and re-prove it. No slice of this packet
is allowed to change
`expect(measured.clipped, 'the trio does not fit the box beside its figure').toBeLessThanOrEqual(0)`
or `ROW_HEIGHT_BUDGET`.

### What the hover card carries, and why the trio may be small

`FoldedStepCard` receives every point of the trio in words and the result in days
(`estimates.tsx:603` to `642`). So the quiet trio at rest is a reminder of three numbers that are
written out in full one hover or one focus away, and the figure it stands beside is the number the
row's total days is made of. That is what makes the caption size affordable, and it is the same
argument the cell already makes for clipping a wide roll-up (`estimates.tsx:434` to `436`) and for
clipping an assumed `(WW)` in the assignee slot (`estimates.tsx:869` to `872`).

## 7. Steps

Four slices. Each is dispatched on its own, from the tree the planner reviewed and committed after
the previous one. Each starts with its own baseline, **records its own observations into
`openspec/changes/estimate-cell-at-rest/verify.md` before it ends**, and hands that file over. The
executor's `TMPDIR` does not survive the attempt; `verify.md` is the only carrier of evidence
between slices, which is why every slice from 1 onwards lists it in its path list.

Counts are relative to the baseline the slice itself records, never to a number written here. The
numbers this packet does state were watched on 2026-09-20 and are given as a **cross-check**: if a
slice's own baseline differs, the slice's own baseline wins and the difference is reported.

### Slice 0 — the baseline, at the start of **every** slice

- [ ] `git rev-parse HEAD` and `git status --short --untracked-files=all` → record both. Expect no
      modification outside this packet's file plan.
- [ ] From `apps/wbs/fe-01`, record the **one-file count N**:

  ```sh
  env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx vitest run \
    src/components/wbs/plan-estimates.test.tsx
  ```

  Expected: one line `Test Files  1 passed (1)` and one line `Tests  N passed (N)` — except in a
  slice whose own red run is expected, where the expected failures are named below. Cross-check:
  N was 65 on 2026-09-20. A run that matched zero tests is a failure to stop on.

- [ ] From `apps/wbs/fe-01`, record the **two-file count M**:

  ```sh
  env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx vitest run \
    src/components/wbs/plan-estimates.test.tsx \
    src/components/wbs/plan-read-and-write.test.tsx
  ```

  Expected: `Test Files  2 passed (2)` and `Tests  M passed (M)`. Cross-check: M was 153.
  **Run this in every slice, including slices 0 to 2**, so that slice 3's comparison has a
  same-command baseline of its own rather than a number from another slice.

- [ ] Record the **unit-tier count U**: run the batch README's **sandbox unit command** once and
      record its `Test Files` and `Tests` lines. It is the broad net; it must not move in any slice
      of this packet, because no file this packet touches is in the node tier.
- [ ] Record the **OpenSpec passed count V**: run the batch README's **OpenSpec validation** block
      and record `summary.totals.passed` from the report. Expected: exit 0 and `failed == 0`. Keep
      the report under `$TMPDIR/evidence`. This is the number slice 1 adds one to; without it slice
      1 has nothing to compare against.
- [ ] Do **not** run `wbs-fe-01:test` or `wbs-fe-01:test:unit`. Both are planner-only
      (batch README, "Frontend tests inside the sandbox").

### Slice 1 — the OpenSpec change

**Pre-edit checks for this slice** (each must hold before editing; if one does not, stop):

- [ ] `openspec/changes/estimate-cell-at-rest/` does not exist.
- [ ] `openspec/specs/wbs-estimate-cell/` does not exist.

Then:

- [ ] Create the change with the repository's schema, using the batch README's "Creating an OpenSpec
      change" block verbatim, with `estimate-cell-at-rest` as the name. Expected: the `grep` prints
      one line `schema: sdd-lean`. If it prints nothing, stop.
- [ ] Write `openspec/changes/estimate-cell-at-rest/proposal.md`. At most 400 words. Problem: a big
      plan's step columns are a wall of slashes and the number a reader wants is the smallest thing in
      the cell. Outcome: the result is the cell's main reading and the trio recedes at rest. Non-goals:
      section 1's list. Constraints: the trio lives in a real `<input>` whose text cannot be styled in
      parts, the column is 96px shared with an assignee, and editing must be unchanged. Alternatives
      belong in an ADR and there is none here; say so in one sentence.
- [ ] Write `openspec/changes/estimate-cell-at-rest/specs/wbs-estimate-cell/spec.md` with exactly
      this shape — `## ADDED Requirements`, then one `### Requirement:` per rule, each with real
      `#### Scenario:` headings carrying **WHEN** and **THEN** bullets. The five requirements are:

  1. `The result is the folded step cell's main reading` — SHALL be drawn at the row's own type and
     foreground with tabular numerals and no leading separator, whenever the step has an estimate and
     the step is folded.
  2. `The typed trio recedes while the cell is not being typed in` — SHALL be drawn smaller and muted
     at rest and SHALL return to the row's type and weight while the cell has the focus.
  3. `A flat trio is not said twice` — WHEN the trio's text equals the result, the trio's text SHALL
     be hidden at rest and the result SHALL still be drawn; the value SHALL remain in the box. This
     holds for a parent's rolled-up trio as well as a leaf's box.
  4. `A parent's rolled-up cell reads like its leaves` — the rolled-up trio SHALL carry the resting
     box's size, weight and colour.
  5. `An unestimated step stays empty and a refusal never recedes` — WHEN a step has no estimate no
     result SHALL be drawn; WHEN the typed trio was refused the trio SHALL keep the row's type and its
     invalid styling.

  **No requirement states a pixel size, and none may.** "Smaller" is the rule; the number is
  `QUIET_TRIO_PX` and lives in code with its measurement. That is what lets decision rule D1 change
  the number without touching this specification.

- [ ] Write `openspec/changes/estimate-cell-at-rest/tasks.md` as the ordered slices of this packet.
- [ ] Create `openspec/changes/estimate-cell-at-rest/verify.md` with the headings
      `## Commands`, `## Negative proofs`, `## Pending planner verification` and `## Not verified`,
      and **fill in slice 0's and slice 1's observations now**: the recorded HEAD, N, M, U and V, and
      every command of this slice with its exit status and decisive line. Every later slice appends
      its own section under the same headings and never rewrites an earlier one.
- [ ] Re-run the batch README's **OpenSpec validation** block. Expected: exit 0, and
      `summary.totals.passed` is **V + 1**, with V taken from this slice's own step 0. Record both
      numbers in `verify.md`. Never delete the report: keep it under `$TMPDIR/evidence`.
- [ ] Format this slice's own files, then the repository-wide check:

  ```sh
  GSETTINGS_BACKEND=memory bunx prettier --write \
    openspec/changes/estimate-cell-at-rest/proposal.md \
    openspec/changes/estimate-cell-at-rest/tasks.md \
    openspec/changes/estimate-cell-at-rest/verify.md \
    openspec/changes/estimate-cell-at-rest/specs/wbs-estimate-cell/spec.md
  ```

  Then `NX_DAEMON=false bunx nx format:check --all` → exit 0.

### Slice 2 — the trio recedes at rest

Nothing about the **result** changes in this slice. The tests come first and the red run is expected.

**Pre-edit checks for this slice** (each must hold; if one does not, stop):

- [ ] `estimates.tsx` contains the exact line `const finalSaysMore = final !== atRest;` and the text
      `font: 'inherit',` inside the trio box's style.
- [ ] `estimates.tsx` does **not** contain `QUIET_TRIO_PX` or `useState`.
- [ ] `plan-estimates.test.tsx` contains `describe('one cell for the whole trio'` and does not
      contain `rolledTrio`.
- [ ] `openspec/changes/estimate-cell-at-rest/verify.md` exists and already carries slice 1's
      section. If it does not, slice 1's hand-over was lost: stop and report.

#### Step 2a — the tests, first

- [ ] Widen the existing `foldedFinal` helper so later slices need no cast. Replace

  ```tsx
  const foldedFinal = (number: string, stepId = 'step-dev') =>
    rowFor(number).querySelector(`[data-folded-final="${stepId}"]`);
  ```

  with

  ```tsx
  const foldedFinal = (number: string, stepId = 'step-dev') =>
    rowFor(number).querySelector<HTMLElement>(`[data-folded-final="${stepId}"]`);
  ```

- [ ] Directly under it, add the helper slice 2's last test uses:

  ```tsx
  /** The parent's rolled-up trio span, or null on a leaf. */
  const rolledTrio = (number: string, stepId = 'step-dev') =>
    rowFor(number).querySelector<HTMLElement>(`[data-rolled-trio="${stepId}"]`);
  ```

- [ ] Import the constant the tests assert against, so decision rule D1 can change the number
      without editing a test. Add to the relative import group, **before**
      `import type * as TableFrameModule from './table-frame';` (import order is lint-checked; this
      position was watched passing):

  ```tsx
  import { QUIET_TRIO_PX } from './plan-columns/estimates';
  ```

- [ ] As the first line inside `describe('one cell for the whole trio', () => {`, add:

  ```tsx
  const quiet = `${String(QUIET_TRIO_PX)}px`;
  ```

- [ ] Add these four tests inside `describe('one cell for the whole trio')`, immediately before
      `itDom('is a cell of the keyboard grid, so a column can be typed down', …)`. They are given in
      full; transcribe them. Note `'· 3.7'`, not `'· 4'`: the fake project API applies PERT without
      the whole-day rule the e2e seed uses, which is why the unit and Chromium figures differ. The
      `· ` is still there in this slice; slice 3 removes it from all of them at once.

  ```tsx
  itDom('quiets the trio while the cell is not being typed in', async () => {
    await oneRow();
    typeCombined('010', '2/3/8');
    await waitFor(() => {
      expect(foldedFinal('010')?.textContent).toBe('· 3.7');
    });

    const cell = combinedCell('010');
    expect(cell.style.fontSize).toBe(quiet);
    expect(cell.style.fontWeight).toBe('400');
    expect(cell.style.color).toBe('var(--muted-foreground)');
  });

  itDom('gives the trio back its strength on focus and quiets it again on blur', async () => {
    await oneRow();
    typeCombined('010', '2/3/8');
    await waitFor(() => {
      expect(foldedFinal('010')?.textContent).toBe('· 3.7');
    });

    fireEvent.focus(combinedCell('010'));
    expect(combinedCell('010').style.fontSize).toBe('inherit');
    expect(combinedCell('010').style.fontWeight).toBe('600');

    fireEvent.blur(combinedCell('010'));
    expect(combinedCell('010').style.fontSize).toBe(quiet);
    expect(combinedCell('010').style.fontWeight).toBe('400');
  });

  itDom('leaves a refused trio at full strength, because a complaint may not recede', async () => {
    await oneRow();
    typeCombined('010', '2/3/10');
    await waitFor(() => {
      expect(foldedFinal('010')?.textContent).toBe('· 4');
    });

    const cell = typeCombined('010', '9/9/');

    expect(cell).toHaveAttribute('aria-invalid', 'true');
    expect(cell.style.fontSize).toBe('inherit');
  });

  itDom('quiets a parent’s rolled-up trio exactly as a leaf’s', async () => {
    const api = await oneRow();
    pressNewItem('010');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });
    pressTab('020');
    await screen.findByLabelText('Name of 010.1');

    typeCombined('010.1', '2/3/10');
    await waitFor(() => {
      expect(api.rows.find((row) => row.id === 'w2')?.estimates['step-dev']).toBeDefined();
    });
    await waitFor(() => {
      expect(foldedFinal('010')?.textContent).toBe('· 4');
    });

    expect(rolledTrio('010')?.style.fontSize).toBe(quiet);
    expect(rolledTrio('010')?.style.fontWeight).toBe('400');
    expect(rolledTrio('010')?.style.color).toBe('var(--muted-foreground)');
  });
  ```

  The `blur` half of the second test is deliberate and is the reason it is written this way:
  `typeCombined` (`plan-estimates.test.tsx:840` to `846`) dispatches `change` and `blur` and **never
  focuses**, so a test that only focused could not tell `setTyping(false)` from a missing line.

- [ ] **The expected red run.** The import above does not resolve until `QUIET_TRIO_PX` exists, so
      run the oracle only after step 2b's constant is in place — with one exception: if you want the
      red first, add the constant alone (the final list item of step 2b) and nothing else, then run.
      Either way, **before the style edits of step 2b land**, the oracle must report:

  ```text
  Tests  3 failed | 66 passed (69)
  ```

  with exactly these three failing, watched on 2026-09-20:

  - `quiets the trio while the cell is not being typed in` —
    `AssertionError: expected 'inherit' to be '10px'`
  - `gives the trio back its strength on focus and quiets it again on blur` —
    `AssertionError: expected 'inherit' to be '10px'`
  - `quiets a parent’s rolled-up trio exactly as a leaf’s` —
    `AssertionError: expected '' to be '10px'`

  `leaves a refused trio at full strength` **passes already** and is a regression test: today's
  `font: 'inherit'` shorthand expands, so the box already reports `fontSize === 'inherit'`
  (section 3). A fourth failure, or a different message, is a stop. Record the red run verbatim in
  `verify.md`.

#### Step 2b — the production edits

- [ ] In `estimates.tsx`, add the React import as the first import group, above the `@/lib/wbs-api`
      one and separated by a blank line:

  ```tsx
  import { useState } from 'react';
  ```

- [ ] Immediately after the `useCardOpenOn(...)` call (which ends `);`), add:

  ```tsx
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [typing, setTyping] = useState(false);
  ```

  The justification for a hook here is the comment already above `useCardOpenOn`; do not repeat it.

- [ ] Above that pair, add this comment, which is the knowledge R3 asks to live on the symbol:

  ```tsx
  // Whether this cell is being typed in, which is the one thing that decides
  // whether the trio is at full strength. Local state and not a read off
  // `live`: the box is the cell's only focusable thing, and a store entry for
  // "which cell has the focus" already exists for the cards and answers a
  // different question — it survives a pointer visiting another cell.
  ```

- [ ] Add `setTyping(true);` as the first line of the box's `onFocus`, above
      `live.current.enterFoldedCell(e.currentTarget);`.
- [ ] Add `setTyping(false);` as the first line of the **wrapper's** `onBlur`, above
      `live.current.leaveFoldedCell();`. It is the wrapper's and not the box's because `CellInput`
      owns the box's own `onBlur`; the wrapper already receives the bubbled blur, which is what
      `leaveFoldedCell` has always been driven by.
- [ ] In the box's `style`, replace these two lines

  ```tsx
  font: 'inherit',
  fontWeight: 600,
  ```

  with these three:

  ```tsx
  fontFamily: 'inherit',
  fontStyle: 'inherit',
  lineHeight: 'inherit',
  ```

- [ ] In the same `style`, directly after `minWidth: 0,` and **before** the existing
      `...(problem === null` spread, insert:

  ```tsx
  // The one state this cell has: quiet at rest, the row's own type while
  // somebody is typing in it. A complaint is never quiet — a refusal that
  // receded would be the cell hiding its own objection.
  ...(problem !== null || typing
    ? { fontSize: 'inherit', fontWeight: 600 }
    : {
        fontSize: QUIET_TRIO_PX,
        fontWeight: 400,
        color: 'var(--muted-foreground)',
      }),
  ```

- [ ] In the `data-rolled-trio` span's `style`, directly after `border: '2px solid transparent',`,
      insert the same three declarations, with no focus arm — a parent's roll-up is not typed into:

  ```tsx
  // The resting box's type, spelled again, for the reason the padding and
  // the border above are: `e2e/layout.spec.ts`'s `stands a parent’s figure in
  // the same slot as its leaves’` compares this span's computed size and
  // weight with an unfocused leaf box's, and one column that reads in two
  // sizes is two columns.
  fontSize: QUIET_TRIO_PX,
  fontWeight: 400,
  color: 'var(--muted-foreground)',
  ```

- [ ] At the end of the file, after `export const ASSIGNEE_SLOT_PX = 32;`, add:

  ```tsx
  /**
   * The type the typed trio recedes to while its cell is not being written in.
   *
   * 10px is this table's caption size — the heading row's (`styles.css`) and the
   * size the derived figure was drawn at from 2026-08-30 until this change — so
   * it is a size this column is already known to be readable at. It is also what
   * pays for the result growing to the row's own 13px: at 13px the trio
   * `20/24/30` wants about 50px of a box in a 96px column shared with a 32px
   * assignee slot, and at 10px it wants about 39px. The measurement that decides
   * it is Chromium's, in `e2e/layout.spec.ts`'s `holds a trio and its figure on
   * one line of a folded step cell`; `plan-estimates.test.tsx` asserts against
   * this constant rather than against the number, so changing it changes no test.
   */
  export const QUIET_TRIO_PX = 10;
  ```

#### Step 2c — green, checks, evidence

- [ ] Run the oracle. Expected: exit 0, `Tests  N+4 passed (N+4)`. Cross-check: 69 on 2026-09-20.
      **If any test that was passing at this slice's own step 0 now fails, stop and report it** —
      this slice is not allowed to move an existing assertion.
- [ ] Run the two-file command. Expected: `Tests  M+4 passed (M+4)`. Cross-check: 157.
- [ ] Run the sandbox unit command. Expected: unchanged from this slice's own U.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0, no diagnostic. This slice changes a
      style object's shape and adds a hook, so the type check belongs in it.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` → exit 0.
- [ ] Negative proofs N1 to N4 (section 8).
- [ ] Format this slice's own files:

  ```sh
  GSETTINGS_BACKEND=memory bunx prettier --write \
    apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx \
    openspec/changes/estimate-cell-at-rest/verify.md
  ```

  Then `NX_DAEMON=false bunx nx format:check --all` → exit 0. If it names a file not in that list,
  stop: another lane's file was rewritten.

- [ ] Append this slice's section to `openspec/changes/estimate-cell-at-rest/verify.md`: its
      baseline numbers, the red run verbatim, every command with exit status and decisive line, and
      each of N1 to N4 with the injected fault, the named test and the failing line observed. Then
      re-run the format command above over `verify.md` only.

### Slice 3 — the result becomes the main reading

The tests and the browser pins come first, then the production edits. **The Chromium assertions move
in this slice**, before the planner's first browser run (P1), because this slice is what removes the
`· ` those assertions pin.

**Pre-edit checks for this slice** (each must hold; if one does not, stop):

- [ ] `estimates.tsx` contains `const finalSaysMore = final !== atRest;` and `· {final}`, and
      **already contains** `QUIET_TRIO_PX` and `const [typing, setTyping] = useState(false);` — that
      is slice 2 having landed.
- [ ] `plan-estimates.test.tsx` contains `expect(foldedFinal('010')).toBeNull();` inside
      `says a flat trio once`, contains `rolledTrio`, and the slice's own step 0 reported a positive
      test count.
- [ ] `plan-read-and-write.test.tsx` contains `expect(screen.getByText('· 5')).toBeInTheDocument();`.
- [ ] `e2e/layout.spec.ts` contains all five of `expect(seeded.said).toBe('· 4');`,
      `.toHaveText('· 25')`, `expect(wide.said).toBe('· 25');`,
      `await expect(parentFigure).toHaveText('· 4');` and
      `await expect(leafFigure).toHaveText('· 4');`.
- [ ] `verify.md` carries slices 1 and 2. If it does not, stop and report the lost hand-over.

#### Step 3a — the tests and the browser pins, first

- [ ] In `plan-estimates.test.tsx`, drop the `· ` from every `foldedFinal` pin, as three literal
      replacements over the whole file: `toBe('· 4')` → `toBe('4')`, `toBe('· 3.7')` → `toBe('3.7')`,
      `toBe('· 2')` → `toBe('2')`. Counted on 2026-09-20 after slice 2: **8, 3 and 1 occurrences**
      (the baseline's 6/1/1 plus slice 2's 2/2/0). **Do not touch the `assigneeShown` pins**
      (`'· GR'`, `'· AD'`, `'· KA'`, `'· (AD)'`) or the comment that quotes `'· '` inside a proof
      note.
- [ ] Rewrite the tail of `says a flat trio once`. Replace

  ```tsx
  expect(combinedCell('010').value).toBe('5');
  expect(foldedFinal('010')).toBeNull();
  ```

  with

  ```tsx
  expect(combinedCell('010').value).toBe('5');
  expect(foldedFinal('010')?.textContent).toBe('5');
  expect(combinedCell('010').style.color).toBe('transparent');
  ```

  and replace that test's `Proof:` paragraph (the one beginning "Proof: `finalSaysMore` widened to
  `final !== ''`…") with a note that the rule reversed on 2026-09-20 — the result is drawn and the
  repeated trio is what goes quiet — plus the proof the executor actually watches in N6.

- [ ] Add these four tests, in the same place as slice 2's:

  ```tsx
  itDom('hides a parent’s rolled-up trio when it repeats the result', async () => {
    const api = await oneRow();
    pressNewItem('010');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });
    pressTab('020');
    await screen.findByLabelText('Name of 010.1');

    typeCombined('010.1', '5');
    await waitFor(() => {
      expect(api.rows.find((row) => row.id === 'w2')?.estimates['step-dev']).toBeDefined();
    });
    await waitFor(() => {
      expect(foldedFinal('010')?.textContent).toBe('5');
    });

    expect(rolledTrio('010')?.textContent).toBe('5');
    expect(rolledTrio('010')?.style.color).toBe('transparent');
  });

  itDom('draws the result in the row’s own type, with tabular numerals', async () => {
    await oneRow();
    typeCombined('010', '2/3/8');
    await waitFor(() => {
      expect(foldedFinal('010')?.textContent).toBe('3.7');
    });

    // The positive — that this is *the row's* size and ink — is a computed
    // style and only Chromium can answer it (`e2e/layout.spec.ts`, the staffed
    // case). What jsdom can hold is that the span declares none of its own, so
    // the wrapper's weight and colour reach it and a complaint recolours it.
    const result = foldedFinal('010');
    expect(result?.style.fontVariantNumeric).toBe('tabular-nums');
    expect(result?.style.fontSize).toBe('');
    expect(result?.style.fontWeight).toBe('');
    expect(result?.style.color).toBe('');
  });

  itDom('leaves an unestimated folded cell empty', async () => {
    await oneRow();

    expect(combinedCell('010').value).toBe('');
    expect(foldedFinal('010')).toBeNull();
  });

  itDom('draws no result beside an unfolded step’s own figure', async () => {
    await oneRow();
    typeCombined('010', '2/3/8');
    await waitFor(() => {
      expect(foldedFinal('010')?.textContent).toBe('3.7');
    });

    unfoldStep('Dev');

    expect(foldedFinal('010')).toBeNull();
    expect(rowFor('010').querySelector('[data-final="step-dev"]')?.textContent).toBe('3.7');
  });
  ```

- [ ] In `plan-read-and-write.test.tsx`, replace

  ```tsx
  expect(screen.getByText('· 5')).toBeInTheDocument();
  ```

  with

  ```tsx
  expect(document.querySelector('[data-folded-final]')?.textContent).toBe('5');
  ```

  By the attribute and not by text: `getByText('5')` would be ambiguous against the row's own total.
  Change **only this line**: the test's title is 110.1's to rename (section 5), so keep it verbatim,
  square-bracket prefix and all, if one is already there.

- [ ] `apps/wbs/fe-01/e2e/layout.spec.ts`, inside
      `test('holds a trio and its figure on one line of a folded step cell', …)`:
  - `expect(seeded.said).toBe('· 4');` → `expect(seeded.said).toBe('4');`
  - `await expect(page.locator('[data-folded-final]').first()).toHaveText('· 25');` →
    `…toHaveText('25');`
  - `expect(wide.said).toBe('· 25');` → `expect(wide.said).toBe('25');`
  - the comment above the first of those — rewrite `` `· 4` and not `· 3.7` `` as
    `` `4` and not `3.7` `` and leave the rest of the sentence, which is about the whole-day rule
    and is still true.
  - the paragraph that reasons about `· 24.3` becoming `· 25` gains one sentence: since 2026-09-20
    the result carries no leading separator and is set at the row's type while the trio is set at the
    caption size, so the budget is spent the other way round and the assertion below is what decides
    whether that was affordable.
  - the `Proof:` note beginning "the figure drawn at the row's own 13px rather than the table's
    10px caption size" — rewrite it to say that the measurement was taken on 2026-08-30 with the
    sizes the other way round, that since 2026-09-20 it is the **trio** that is set at the caption
    size and the result at the row's, and that this assertion is what holds the new budget. Do not
    delete the `Expected: <= 0, Received: 8` quotation.
  - **Do not touch** `expect(measured.cell.width).toBe(104)`, the two `findOverrun` assertions, the
    `clipped` assertion, the row-height assertions or `ROW_HEIGHT_BUDGET`.
- [ ] In the same test, widen `measure()`'s returned object so the result's computed style can be
      compared with the row's. Directly after the `clipped:` line, add:

  ```ts
  resultType: getComputedStyle(figure).fontSize,
  rowType: getComputedStyle(cell).fontSize,
  resultInk: getComputedStyle(figure).color,
  rowInk: getComputedStyle(cell).color,
  resultNumerals: getComputedStyle(figure).fontVariantNumeric,
  ```

- [ ] In the same test, **after** the existing wide (`20/24/30` → `25`) case and before the closing
      brace, add the constrained case the fit argument is actually about — a **staffed** column and a
      **fractional** result. This is the block P1 and P3 run:

  ```ts
  // The case section 6's arithmetic is about, and the one this test did not
  // measure before 2026-09-20: `seedPlan` staffs nobody, so `anyAssignee` is
  // false and no 32px slot is reserved (`estimates.tsx`), and the default
  // `ceil` rounding prints `25` rather than the wider `24.3`. Green on the
  // unstaffed, rounded case says nothing about 96px holding a 32px slot and a
  // four-glyph result at once.
  await page.getByRole('button', { name: 'Project settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Project settings' });
  await settings.getByRole('tab', { name: 'Estimating' }).click();
  await settings.getByLabel('Keep the fraction', { exact: false }).check();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();

  const staffedCell = page.getByLabel('Dev estimate for 010');
  await staffedCell.click();
  await staffedCell.fill('20/24/30 @Nia');
  const addNia = page.getByRole('option', { name: 'Add “Nia”' });
  await expect(addNia).toBeVisible();
  await addNia.click();

  const rowOf010 = page.getByLabel('Name of 010').locator('xpath=ancestor::tr[1]');
  await expect(
    rowOf010.locator('[data-folded-assignee]'),
    'the constrained case needs a staffed row, or the 32px slot is not there',
  ).not.toHaveCount(0);
  await expect(rowOf010.locator('[data-folded-final]')).toHaveText('24.3');

  const staffed = await measure();
  expect(staffed.said).toBe('24.3');
  holdsItsContents(staffed);

  // The result is the row's reading, not an annotation: same size, same ink,
  // and numerals that line up down the column.
  expect(staffed.resultType).toBe(staffed.rowType);
  expect(staffed.resultInk).toBe(staffed.rowInk);
  expect(staffed.resultNumerals).toBe('tabular-nums');
  ```

- [ ] `apps/wbs/fe-01/e2e/layout.spec.ts`, inside
      `test('stands a parent’s figure in the same slot as its leaves’', …)`:
  - `await expect(parentFigure).toHaveText('· 4');` → `toHaveText('4')`
  - `await expect(leafFigure).toHaveText('· 4');` → `toHaveText('4')`
  - **Do not touch** `trioMetrics`, the `toEqual` comparison, either `boundingBox` comparison, or the
    `Expected: 858` proof comment at `estimates.tsx:446`. Both are unchanged claims.
- [ ] **The expected red run.** Run the two-file oracle. Watched on 2026-09-20, before the
      production edits of step 3b and with slice 2 already in:

  ```text
  Tests  16 failed | 145 passed (161)
  ```

  Fifteen in `plan-estimates.test.tsx` and one — `estimate refreshes only tree without a socket` —
  in `plan-read-and-write.test.tsx`. Every message is one of
  `AssertionError: expected '· 4' to be '4'`, `expected '· 3.7' to be '3.7'`,
  `expected '· 2' to be '2'` or `expected undefined to be '5'`. **`leaves an unestimated folded
cell empty` is not among them**: it is a regression test that passes before the change. A
  seventeenth failure, or a message outside that set, is a stop. Record the run verbatim in
  `verify.md`.

#### Step 3b — the production edits

- [ ] In `estimates.tsx`, replace

  ```tsx
  const finalSaysMore = final !== atRest;
  ```

  with

  ```tsx
  const showsResult = !unfolded && final !== '';
  const trioRepeatsResult = showsResult && final === atRest;
  ```

- [ ] Rewrite the comment block directly above it (the one beginning "The figure earns its pixels
      only where it says something…") as:

  ```tsx
  // The result is what this cell is read for, so it is drawn whenever the
  // step has one — and only while the step is folded, because an unfolded
  // cell **is** the figure (`atRest`) and a span beside it would be the
  // same number twice. That `!unfolded` is the whole of the guard: with it
  // dropped, `draws no result beside an unfolded step’s own figure` fails
  // on `expected <span …(2)></span> to be null` — a folded-final span
  // standing beside the unfolded row's own figure. Watched 2026-09-20.
  //
  // `final !== ''` and not a second test beside it: a row with no estimate
  // has neither a trio nor a figure — be-01 computes `finalDays` from
  // `estimates` in the same call, see `WorkItemRow.finalDays` — so the two
  // are absent together and one condition is all there is to say.
  //
  // A flat trio prints as `5` and its figure is `5` under every estimate
  // method. Until 2026-09-20 the figure was suppressed there; now the
  // figure is the main reading, so it is the repeated **trio** that goes
  // quiet, below, and a cell still never reads `5 5`.
  ```

- [ ] In the box's rest arm and in the `data-rolled-trio` span, change the colour line from

  ```tsx
  color: 'var(--muted-foreground)',
  ```

  to

  ```tsx
  color: trioRepeatsResult ? 'transparent' : 'var(--muted-foreground)',
  ```

  in **both** places. Transparent and not hidden: the box keeps its width, which is the slot the
  whole column is aligned on, and the value stays where the keyboard, the screen reader and the copy
  path can reach it. The two places have separate tests and separate negatives (N6, N6b).

- [ ] Change `{finalSaysMore && (` to `{showsResult && (`.
- [ ] Replace the figure span's `style` and content. The six lines

  ```tsx
  marginLeft: 3,
  flex: 'none',
  whiteSpace: 'nowrap',
  fontWeight: 'normal',
  fontSize: 10,
  color: 'var(--muted-foreground)',
  ```

  become

  ```tsx
  marginLeft: 4,
  flex: 'none',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
  ```

  and the content `· {final}` becomes `{final}`.

- [ ] Rewrite the comment block above that span as below. Keep the 2026-08-30 measurement as
      history; it is a watched failure on a date. What is rewritten is the sentence that states a
      present fact, because that fact is now reversed.

  ```tsx
  // The step's result, and the cell's main reading since 2026-09-20: the
  // row's own type and foreground, which it takes by **declaring neither**
  // and inheriting from the wrapper — so a complaint recolours it for free
  // — and tabular numerals, so results line up down a column and can be
  // scanned like a ledger. No leading `·`: the separator was the
  // annotation's, and this is not an annotation any more. Dropping it also
  // returns about six pixels, which is most of what growing from the
  // caption size to the row's costs.
  //
  // `flex: none`, so a narrow column takes its pixels out of the box rather
  // than out of this: a clipped `2.` is worse than a clipped trio the box
  // can still be scrolled through.
  //
  // **What pays for it is the trio going quiet** ({@link QUIET_TRIO_PX}).
  // This span was drawn at 10px from 2026-08-30 until this change, for the
  // opposite reason: at the row's own 13px the widest trio anybody has
  // typed here in anger — `20/24/30`, live on dev, 2026-08-22 — did not fit,
  // and the box clipped by 8px in a 96px column. Proof from that day, kept
  // because it is what the budget is known from: the figure written at the
  // row's own type instead, `holds a trio and its figure on one line of a
  // folded step cell` failed on `the trio does not fit the box beside its
  // figure — Expected: <= 0, Received: 8`. Watched in Chromium, 2026-08-30.
  // The same test is what holds the budget now, with the sizes the other
  // way round and with a staffed, fractional case added to it.
  ```

#### Step 3c — green, checks, evidence

- [ ] Run the two-file oracle. Expected: exit 0, `Test Files  2 passed (2)` and `Tests  M+8` where
      **M is this slice's own step 0 number for the same command**. Cross-check: 161 on 2026-09-20.
- [ ] Run the one-file oracle. Expected: `Tests  N+8`. Cross-check: 73.
- [ ] Run the sandbox unit command. Expected: unchanged from this slice's own U.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0. It covers `e2e/**/*.ts` as well as
      `src` (section 3), so it is a real check on the browser edits just made.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` → exit 0. It too covers `e2e`.
- [ ] Negative proofs N5 to N8 (section 8).
- [ ] Format this slice's own files:

  ```sh
  GSETTINGS_BACKEND=memory bunx prettier --write \
    apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx \
    apps/wbs/fe-01/e2e/layout.spec.ts \
    openspec/changes/estimate-cell-at-rest/verify.md
  ```

  Then `NX_DAEMON=false bunx nx format:check --all` → exit 0.

- [ ] Append this slice's section to `verify.md`: its baselines, the red run verbatim, every command
      with exit status and decisive line, N5 to N8 with fault, named test and observed failing line,
      and — under `## Pending planner verification` — every `e2e/layout.spec.ts` edit made here,
      listed one by one, marked "written, not run". Re-run the format command over `verify.md`.

### Slice 4 — the dark-mode check and the record

The only production-shaped work here is one browser test the executor writes and cannot run.

**Pre-edit checks for this slice** (each must hold; if one does not, stop):

- [ ] `estimates.tsx` contains `export const QUIET_TRIO_PX` and `const showsResult =` and does
      **not** contain `finalSaysMore` or `· {final}` — that is slices 2 and 3 having landed.
- [ ] `e2e/layout.spec.ts` contains `expect(staffed.said).toBe('24.3');` and contains no `'· 4'`
      or `'· 25'` inside the two tests named in slice 3.
- [ ] `e2e/dark-mode.spec.ts` contains `const READABLE = 4.5;` and does not contain
      `the quiet trio in a folded step cell`.
- [ ] `verify.md` carries slices 1, 2 and 3.

Then:

- [ ] `apps/wbs/fe-01/e2e/dark-mode.spec.ts`, inside
      `test.describe('what the dark palette paints', …)`, after
      `test('the Gantt’s row labels stand off the column they are in', …)`, add:

  ```ts
  test('the quiet trio in a folded step cell stands off the row it is in', async ({ page }) => {
    // The trio recedes at rest since 2026-09-20 (`estimates.tsx`,
    // {@link QUIET_TRIO_PX}), and at rest it is the only place the three
    // numbers are without a hover — so its legibility under the dark palette
    // is measured rather than assumed. This file's `seedPlan` estimates both
    // rows, so a folded step cell with a trio in it is already on screen.
    const trio = page.getByLabel('Dev estimate for 010');
    await expect(trio).not.toHaveValue('');

    const ratio = await contrastOf(trio);
    expect(ratio, `the quiet trio reads at ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(READABLE);
  });
  ```

- [ ] Complete `openspec/changes/estimate-cell-at-rest/verify.md`: append this slice's own section,
      then, under `## Pending planner verification`, list every check in section 9's planner table
      **and** the new dark-mode test, and under `## Not verified` say plainly that no browser ran
      inside any attempt. Do not rewrite slices 1 to 3's sections; they are the evidence.
- [ ] Format this slice's own files:

  ```sh
  GSETTINGS_BACKEND=memory bunx prettier --write \
    apps/wbs/fe-01/e2e/dark-mode.spec.ts \
    openspec/changes/estimate-cell-at-rest/verify.md
  ```

  Then `NX_DAEMON=false bunx nx format:check --all` → exit 0. If it names a file not in that list,
  stop: another lane's file was rewritten.

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` → exit 0.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0. Both of these check the browser
      specs as well as `src`; what cannot happen in the sandbox is **running a browser**, and that is
      the only thing P1 to P5 are for.
- [ ] Re-run the OpenSpec validation block. Expected: exit 0 and the same passed count as slice 1.
- [ ] Re-run the one-file oracle, the two-file oracle and the sandbox unit command. Expected:
      unchanged from slice 3.

## 8. Negative proofs

Every one is on the production path and every one has a named test and a **watched** failure
message. Follow the batch README's "Negative proofs with a restore" and "Saving a mutation patch"
blocks: copy the passing bytes aside first, save the mutation as a patch under `$TMPDIR/evidence`,
save the failing output beside it, restore by copying the bytes back, prove it with `cmp`, and rerun
green. **Write the adjacent `Proof:` comment only after watching the failure, and make it describe
what you actually saw.** A fault that also fails tests beyond the named one is recorded beside the
proof, not a stop.

The command for every one of these, from `apps/wbs/fe-01`, is Vitest's and not Bun's:

```sh
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx vitest run \
  src/components/wbs/plan-estimates.test.tsx -t "<title fragment below>"
```

Expected shape in every case, watched 2026-09-20: `Tests  1 failed | 72 skipped (73)` (68 skipped in
slice 2, where the file holds 69). A run reporting `0 tests` is a stop.

| #   | Slice | Fault to inject in `estimates.tsx`                                                              | `-t` fragment                             | Watched failure                                                          |
| --- | ----- | ----------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| N1  | 2     | The rest arm deleted: the ternary replaced by `{ fontSize: 'inherit', fontWeight: 600 }` always | `quiets the trio while the cell is not`   | `AssertionError: expected 'inherit' to be '10px'`                        |
| N2  | 2     | `problem !== null \|\| typing` narrowed to `problem !== null`                                   | `gives the trio back its strength`        | `AssertionError: expected '10px' to be 'inherit'`                        |
| N3  | 2     | `problem !== null \|\|` dropped, leaving `typing`                                               | `leaves a refused trio at full strength`  | `AssertionError: expected '10px' to be 'inherit'`                        |
| N4  | 2     | The three declarations dropped from the `data-rolled-trio` span                                 | `quiets a parent’s rolled-up trio`        | `AssertionError: expected '' to be '10px'`                               |
| N5  | 3     | `!unfolded &&` dropped from `showsResult`                                                       | `draws no result beside an unfolded`      | `AssertionError: expected <span …(2)></span> to be null`                 |
| N6  | 3     | `trioRepeatsResult ? 'transparent' :` dropped from the **box's** rest arm                       | `says a flat trio once`                   | `AssertionError: expected 'var(--muted-foreground)' to be 'transparent'` |
| N6b | 3     | `trioRepeatsResult ? 'transparent' :` dropped from the **rolled-trio span**                     | `hides a parent’s rolled-up trio`         | `AssertionError: expected 'var(--muted-foreground)' to be 'transparent'` |
| N7  | 3     | `final !== ''` dropped, leaving `const showsResult = !unfolded;`                                | `leaves an unestimated folded cell empty` | `AssertionError: expected <span …(2)></span> to be null`                 |
| N8  | 3     | `fontSize: 10,` added back to the result span's style                                           | `draws the result in the row`             | `AssertionError: expected '10px' to be ''`                               |

Every message above was produced in this repository on 2026-09-20 by injecting that exact fault and
running that exact command. If a message differs, that is a stop — the packet's claim about the check
is then wrong, which is the point of naming it.

**N1 and N4 are the same failures the slice-2 red run produces**, which is what makes them honest:
the check is the difference between that red and the green beside it. `10px` appears in the messages
because `QUIET_TRIO_PX` is 10; under decision rule D1 the number in the message follows the constant
and the tests still read `quiet`.

Two more are the planner's, in section 9: the Chromium fit proof (P3) and the dark contrast proof
(P4). Neither can be watched in the sandbox, and neither may be claimed by the executor.

For context while injecting: with the whole change applied and **no** test edited, nine tests fail —
the eight in `plan-estimates.test.tsx` (`keeps the trio in the cell once the estimate lands`,
`stands the derived figure beside the trio it came from`, `says a flat trio once`, `keeps the stored
figure beside a cell holding a refused entry`, `copies one row’s cell into another and lands the same
estimate`, `sends one request for a trio entered with Enter and then left`, `reads a parent’s roll-up
as a trio too`, `lets a box win back over a refused folded entry`) plus
`plan-read-and-write.test.tsx > estimate refreshes only tree without a socket`. Measured 2026-09-20:
`Tests  9 failed | 144 passed (153)` over the two files.

## 9. Planner-only, and the exact Chromium procedure

Run on the workstation, outside any sandbox, from the planner's own clone of the reviewed commit.

| Check                                               | Why the executor cannot                              |
| --------------------------------------------------- | ---------------------------------------------------- |
| `NX_DAEMON=false bunx nx run wbs-fe-01:test`        | Three tests spawn `bun` from Node; sandbox EPERM.    |
| `NX_DAEMON=false bunx nx run wbs-fe-01:test:unit`   | Same.                                                |
| The Chromium gate and the geometry tests below      | No browser, and Node cannot spawn `bun` to serve it. |
| The dark contrast test and its fault (P4)           | Same.                                                |
| The dark and light screenshot review (P5)           | Same.                                                |
| `bin/h2puni-gate.sh <sha>` on the shared build host | The gate script does not run on this machine.        |

Expected relative delta for the whole-target runs: `wbs-fe-01:test` gains exactly the eight tests
this packet adds to `plan-estimates.test.tsx` and no others; `wbs-fe-01:test:unit` is unchanged,
because no file this packet touches is in `NODE_SUITES`.

### P0 — before dispatching slice 2

Establish that the gate is green on the base commit, so any later red belongs to this change.

```sh
cd <planner clone>
bunx playwright install --with-deps chromium
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT NX_DAEMON=false \
  bunx nx run wbs-fe-01:e2e -- --grep "folded step cell|same slot as its leaves"
```

The `e2e` target runs `bun run tools/dev/setup.ts` and then Playwright against a stack it starts
itself (be-01, gw-01 and a built fe-01 behind `vite preview`), so nothing else needs to be running.
Expected: 2 passed. Record the run's duration and the fact that it was green **before** the change.

### P1 — after slice 3 is committed: the fit, in the constrained case

Slice 3 carries both the production change and the browser assertions that follow it, so this is the
first browser run against the new reading and there is no text mismatch to wade through.

```sh
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT NX_DAEMON=false \
  bunx nx run wbs-fe-01:e2e -- --grep "holds a trio and its figure on one line of a folded step cell"
```

Read the three cases inside it in order: the seeded `4`, the wide `25`, and the **staffed, fractional
`24.3`** slice 3 added. The third is the one section 6 argues about.

**Setup risk, stated in advance.** The staffed case drives two controls this packet could not
exercise without a browser: the `Estimating` tab's `Keep the fraction` radio and the folded cell's
`@Nia` mention. Both are read from existing passing tests (`e2e/project-settings.spec.ts:163` to
`174`; `e2e/layout.spec.ts:1310` to `1320`), but their exact accessible names in this composition are
**pending planner verification**. If the radio is not found, open the dialog and read its accessible
names with Playwright's error listing and correct the locator; that is a locator fix, not a finding,
and it is recorded in `verify.md`. If `24.3` does not appear after the rounding change, the rounding
did not reach be-01 — wait on the folded result text rather than adding a sleep.

**Decision rule D1, stated in advance.**

- Green → the fit is resolved in the case that matters. Record all three measurements and go on.
  This is the expected outcome: section 6's arithmetic puts the worst pair about 12px cheaper than
  the pair that fits today.
- Red on `the trio does not fit the box beside its figure — Expected: <= 0, Received: R` → the trio
  still does not fit. Do **not** touch the assertion or `ROW_HEIGHT_BUDGET`. In order: (a) take
  `QUIET_TRIO_PX` to 9 and rerun; (b) if still red, take it to 8 and rerun. **Nothing else changes
  with it**: the tests read `quiet`, which is derived from the constant, so they stay green; the
  delta specification names no pixel size, so it stays as written; the flat-trio transparency lives
  on the colour line and is untouched; what does change is the constant's JSDoc, which gains the
  measured `R` and the new value with the date, and `verify.md`, which records every value tried and
  the `R` it produced. Both files are already in slice 3's and slice 4's path lists.
- Still red at 8 → **stop and replan.** Do not invent a layout. The finding is that assumption 1 is
  wrong at this width; hand back the measured `R` at 10, 9 and 8, and reopen assumption 1 against the
  design's own fallback (the trio yields at this width and lives in the hover card, which already
  carries it). That fallback is a different change with its own specification and tests; it is not an
  edit to make under a decision rule.
- Red on the row-height assertion (`a row holding a trio and a figure is taller than one holding
neither`, or the `ROW_HEIGHT_BUDGET` bound) → the `font: inherit` to longhands swap changed the
  line box. Put `lineHeight: 'inherit'` back if it was lost, and if the row is still tall, report it:
  it is a finding about the grid's `line-height: 1.4` rule (`styles.css:602` to `606`), not something
  to fix by widening the budget.

### P2 — after slice 4 is committed: the whole gate

```sh
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT NX_DAEMON=false bunx nx run wbs-fe-01:e2e
```

The whole gate, unsharded, because this change moves a column every plan view draws. Expected: green.
Read in particular:

- `stands a parent’s figure in the same slot as its leaves’` — the `trioMetrics` `toEqual`. A failure
  naming `fontSize` or `fontWeight` means the rolled-up span and the resting box disagree, which is
  slice 2's pair of edits having drifted.
- `a step’s figure lands at one x whether or not the row is assigned` — unchanged by this packet; a
  failure here is a finding.
- `the quiet trio in a folded step cell stands off the row it is in` — the new dark-mode test.

**Decision rule D2, stated in advance.** If the contrast test fails with a ratio below `4.5:1`, the
quiet trio's colour is the problem, not its size — but the specification says the resting trio SHALL
be **muted** and both jsdom tests assert `var(--muted-foreground)`, so swapping the token is not a
decision-rule edit. **Stop and replan**: record the measured ratio for the quiet trio in both
palettes, leave the code as written, and hand back two options for the owner — carry the recession by
size alone at `var(--foreground)` (which needs requirement 2 reworded, both jsdom tests changed and
this test rerun), or treat the palette's muted token at 10px as a palette finding. Do not lower
`READABLE` and do not invent a token. Before stopping, re-run the same test in the light palette by
temporarily choosing `Light`, and record both numbers.

### P3 — the non-vacuity of the fit check, re-watched for the new arrangement

The 8px clip that justified the old 10px figure was measured with the sizes the other way round and
on an unstaffed, rounded cell, so the fit assertion's proof has to be re-watched for the arrangement
it now guards. Use the **staffed, fractional** case: it is the tightest one, and a fault that cannot
overflow it is a fault that proves nothing.

- Raise `QUIET_TRIO_PX` until the named assertion fails, in this order, rerunning P1's command each
  time and recording the `Received: R` at every step: `13` (the row's own type, the arrangement the
  test was originally written against), then `16`, then `20`.
- The first value that produces
  `the trio does not fit the box beside its figure — Expected: <= 0, Received: <positive R>` is the
  proof. Restore `QUIET_TRIO_PX`, rerun green, and record both the failing value and its `R` in
  `verify.md` and in `QUIET_TRIO_PX`'s JSDoc as a dated `Proof:` line naming the staffed, fractional
  case.
- If none of `13`, `16` or `20` overflows, **stop**: the fit assertion is vacuous for this
  arrangement and no green from it may be reported as proof of fit. Record it as a finding against
  `e2e/layout.spec.ts` — surviving an unmeasured mutation is not the same as a broken check, and
  neither is a reason to claim the fit is proven.

### P4 — the non-vacuity of the contrast check

`e2e/dark-mode.spec.ts:138`'s `contrastOf` composites through ancestors, so it has a real fault to
inject and there is no excuse for asserting a ratio without one.

- In the box's rest arm, replace `color: trioRepeatsResult ? 'transparent' : 'var(--muted-foreground)'`
  with `color: 'transparent'` unconditionally, and rerun
  `bunx nx run wbs-fe-01:e2e -- --grep "the quiet trio in a folded step cell"`.
- Expected: the named test fails and its own message names the ratio — `the quiet trio reads at
1.00:1` — because transparent ink over any surface composites to the surface.
- Restore the bytes, prove it with `cmp`, rerun green, and add the dated `Proof:` comment above the
  new test naming the injected fault and the observed ratio. If the mutated run passes, or fails with
  a ratio that is not near `1.00`, that is a stop: the contrast test is not measuring this element.

### P5 — the eye, light and dark

There are no baselines to regenerate (section 3), but the design's "Proof and gates" asks for a
review by eye in **both** palettes and that requirement stands.

- **Light.** Open `apps/wbs/fe-01/test-results/…/wbs-table.png`, the deliberate artifact
  `leaves a picture of the table for the eye that has to judge the widths` writes
  (`e2e/layout.spec.ts:1018` to `1026`), and judge that the result reads as the cell's main number
  and the trio as its annotation.
- **Dark.** There is no such artifact today, so make one **without committing it**: temporarily add
  `await page.screenshot({ path: 'test-results/wbs-table-dark.png', fullPage: false });` as the last
  line of the new dark-mode test, run
  `bunx nx run wbs-fe-01:e2e -- --grep "the quiet trio in a folded step cell"`, look at the file, then
  remove the line and prove the file is back to its committed bytes with `git diff --exit-code
apps/wbs/fe-01/e2e/dark-mode.spec.ts`. `test-results/` is the configured `outputDir` and is not
  committed.
- Record both judgements in `verify.md` in words. If the dark reading is not acceptable to the eye
  even at `READABLE`, that is a finding for the owner, not a silent pass — and it is the same
  question D2 raises from the other side.

### P6 — the gate

`bin/h2puni-gate.sh <sha>` on the shared build host, with the committed hash, per the batch README's
"Completion gate". Trust the printed `h2puni gate: running on <sha>`. If it is not run, say so.

## 10. Stop conditions

Per-slice pre-edit checks live with their slices in section 7, because a check that a slice's own
work makes false cannot be a condition of the packet. What follows holds at **every** point in
**every** slice, and each was checked FALSE on the tree this packet starts from on 2026-09-20.

- A slice's own oracle run fails a test that was passing at **that slice's own step 0** and that the
  slice does not name as an expected failure in its red run.
- A slice's red run produces a different count, a different set of test names, or a message outside
  the set the slice names.
- A named negative proof's test **passes** with the fault injected, fails with a different message
  than section 8's, or the mutation does not compile. (A fault that also fails other tests is not a
  stop: record them.)
- A focused run reports `0 tests` or finds no test file.
- `nx format:check --all` names a file outside this packet's file plan.
- The work appears to need `styles.css`, `plan-cards.tsx`, `plan-number-format.ts`,
  `vitest.node-suites.ts` or `cell-input.tsx`. Every one of those is out of lane; stop and report.
- The OpenSpec validation block's passed count moves by anything other than this change's own
  addition, measured against the **slice's own** recorded V.
- `openspec/changes/estimate-cell-at-rest/verify.md` does not carry every earlier slice's section at
  the start of a slice. The hand-over was lost and the evidence cannot be reconstructed inside an
  attempt; stop and report.
- A slice ends without appending its own section to `verify.md`.

## 11. Ready to commit

The executor stages and commits nothing. It reports, per slice, the message and the path list. Each
slice's expected `git status --short --untracked-files=all` is exactly its own list below, **files
touched only by formatting or by a required `Proof:` comment included**.

**Slice 1** — `docs(openspec): specify the estimate cell at rest`

- `openspec/changes/estimate-cell-at-rest/.openspec.yaml`
- `openspec/changes/estimate-cell-at-rest/proposal.md`
- `openspec/changes/estimate-cell-at-rest/tasks.md`
- `openspec/changes/estimate-cell-at-rest/verify.md`
- `openspec/changes/estimate-cell-at-rest/specs/wbs-estimate-cell/spec.md`

**Slice 2** — `feat(wbs-fe-01): let a folded step's trio recede while it is not typed in`

- `apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx`
- `apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx`
- `openspec/changes/estimate-cell-at-rest/verify.md`

**Slice 3** — `feat(wbs-fe-01): make a step's result the folded cell's main reading`

- `apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx`
- `apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx`
- `apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx`
- `apps/wbs/fe-01/e2e/layout.spec.ts`
- `openspec/changes/estimate-cell-at-rest/verify.md`

**Slice 4** — `test(wbs-fe-01): measure the quiet trio under the dark palette`

- `apps/wbs/fe-01/e2e/dark-mode.spec.ts`
- `openspec/changes/estimate-cell-at-rest/verify.md`

## 12. Unknowns

- Whether `20/24/30` at 10px plus `24.3` at 13px fits 96px in Chromium **beside a 32px assignee
  slot**. Estimated in section 6, measured by P1's staffed case, decided by D1.
- Whether the fit assertion can still be made to fail in that arrangement. P3, and a stop if not.
- What `var(--muted-foreground)` at 10px measures against the grid's dark background. P2 and P4;
  D2 stops rather than swapping the token.
- Whether the `Estimating` tab's `Keep the fraction` radio and the folded cell's `@Nia` mention carry
  the accessible names slice 3 writes. Read from two passing tests; confirmed only by P1.
- Whether swapping `font: inherit` for its longhands moves the row's line box. The
  `lineHeight: 'inherit'` is there to prevent it; P1's row-height assertion is what would catch it.
- Whether the owner wants the phone card face to follow (assumption 6). Recorded as a follow-up.

## 13. Disposition of review 1

Every finding was checked against this repository before acting. All fifteen are accepted; none was
rejected. Where a finding offered two fixes, the one chosen is named.

**Critical**

1. **Chromium runs before its assertions are updated** — FIXED. Verified: `layout.spec.ts:1204`
   `expect(seeded.said).toBe('· 4')`, `:1222` `toHaveText('· 25')`, `:1225`
   `expect(wide.said).toBe('· 25')`. The browser pins, comments and the new staffed case now live in
   **slice 3, step 3a**, ahead of the production edits and ahead of P1; slice 4 is the dark-mode test
   and the record. Slice 3's file list and commit subject changed with it.
2. **Global stop conditions reject the packet's own completed work** — FIXED. Verified:
   `executor-preamble.txt:14` requires stopping on any packet stop condition. Section 10 now carries
   only conditions that hold throughout, and each slice has its own **pre-edit checks** naming both
   the state it needs and the successor state (slice 3 requires `QUIET_TRIO_PX` present; slice 4
   requires `finalSaysMore` and `· {final}` gone).
3. **No supplied evidence between attempts** — FIXED, by the first of the two offered fixes.
   `verify.md` is created and **filled** in slice 1, appended by slices 2, 3 and 4, listed in every
   path list from slice 1 onwards, and its absence or incompleteness is a stop condition. No
   `--seed` or `--preserve` choreography is prescribed, because the repository file is the simpler
   carrier and the planner commits it between slices.
4. **Implementation precedes tests** — FIXED. Slices 2 and 3 are split into `a` (tests), `b`
   (production) and `c` (green, checks, evidence), each with a **watched** red run:
   slice 2 `Tests 3 failed | 66 passed (69)` with three named messages, slice 3
   `Tests 16 failed | 145 passed (161)`. The regression tests that pass before the change are named
   as such: `leaves a refused trio at full strength` (slice 2 — today's `font: 'inherit'` shorthand
   already expands to `fontSize: 'inherit'`) and `leaves an unestimated folded cell empty` (slice 3).

**Important**

5. **Baselines never collected** — FIXED. Slice 0 now records four distinctly named numbers in every
   slice: **N** (one file), **M** (two files, run from slice 0 onwards so slice 3 compares against
   its own), **U** (sandbox unit tier) and **V** (OpenSpec `summary.totals.passed`). Slice 1 expects
   V+1; every later comparison names which of the four it moves and by how much.
6. **The fit oracle does not exercise the constrained case** — FIXED. Verified:
   `e2e/layout.spec.ts:214` to `272` staffs nobody, and `estimates.tsx:563` reserves the empty slot
   only when `reading.anyAssignee`. Slice 3 appends a staffed, fractional case with exact browser
   setup — Project settings → `Estimating` → `Keep the fraction`
   (`e2e/project-settings.spec.ts:163` to `174`; `estimating-panel.tsx:69` to `87`), then
   `'20/24/30 @Nia'` and the `Add “Nia”` option (`e2e/layout.spec.ts:1310` to `1320`) — asserts
   `[data-folded-assignee]` is present, expects `24.3` (PERT `146/6 = 24.333`, `showDay` rounds to
   one decimal), and measures it. P3 no longer equates surviving 13px with a broken check: it climbs
   13 → 16 → 20 until the clip assertion fails, records the first overflow and its `R`, and **stops**
   if none overflows.
7. **Promised behaviours with no negative** — FIXED, all four. Contrast: P4 injects
   `color: 'transparent'` unconditionally and requires the named test to report `1.00:1`, then
   restore and rerun. Focus→blur: verified that `typeCombined` (`plan-estimates.test.tsx:840` to
   `846`) dispatches change and blur and never focuses; the test is now
   `gives the trio back its strength on focus and quiets it again on blur` and asserts both
   transitions, with N2 watched at `expected '10px' to be 'inherit'`. Flat parent: new test
   `hides a parent’s rolled-up trio when it repeats the result` with its own negative **N6b**,
   watched. The result's style: new test `draws the result in the row’s own type, with tabular
numerals` with negative **N8**, watched at `expected '10px' to be ''`, plus the Chromium half —
   `measure()` now returns the result's and the row's computed `fontSize`, `color` and
   `fontVariantNumeric` and the staffed case compares them.
8. **D1/D2 fallbacks invalidate the packet's own tests and specification** — FIXED. The tests import
   `QUIET_TRIO_PX` and assert against `` const quiet = `${String(QUIET_TRIO_PX)}px` ``, so D1's 9 or
   8 changes no test (watched: that import position passes lint and the type check, and the file
   stays green). The delta specification is explicitly forbidden from naming a pixel size, so D1
   changes no requirement; the files D1 does touch — the constant's JSDoc and `verify.md` — are
   already in the slice path lists. D1's third branch and the whole of D2 are now **stop and
   replan**, with the measured numbers handed back and the options stated, rather than an
   under-specified "fall back".
9. **The exclusion of 110.1 is unsupported** — FIXED. Verified: only this packet exists under
   `docs/superpowers/plans/2026-09-20-batch-2/`, so every neighbour's ownership is now marked
   **pending verification**. Verified:
   `docs/superpowers/plans/2026-09-19-code-organization-rollout.md:259` to `260` puts square-bracket
   scenario identifiers on plan-refresh's existing tests, and this packet edits
   `plan-read-and-write.test.tsx:2800`. Section 5 now reserves that file explicitly: U1 owns one
   assertion inside that test body, must keep the title and any prefix verbatim, and slice 3 says so
   at the edit itself.
10. **N5's stated failure does not match the first failing assertion** — FIXED. Injected and
    watched: with `!unfolded &&` dropped the named test fails at
    `AssertionError: expected <span …(2)></span> to be null`. The `3.73.7` claim is gone from the
    production comment, which now quotes that observed message. Verified that
    `shows the final figure be-01 computed, per step and in total`
    (`plan-estimates.test.tsx:1568`) types `2/3/10` and expects `'4'` at `:1577`, so its doubled
    reading would be `44`; section 3 records the correction. Section 8 now gives the exact Vitest
    command with a `-t` fragment per proof and the watched
    `Tests 1 failed | 72 skipped (73)` shape, instead of inheriting a Bun `-t` block.
11. **Formatting and hand-over lists disagree** — FIXED. Every slice formats **its own** files before
    hand-over, including `verify.md`, and each path list in section 11 now matches exactly what its
    slice writes or formats.
12. **Dark visual review dropped** — FIXED. Verified the design's "Proof and gates" (line 37) asks for
    review by eye in light and dark. P5 keeps both: the committed light artifact `wbs-table.png`
    (`e2e/layout.spec.ts:1018` to `1026`), and a planner-only dark screenshot taken by temporarily
    adding one `page.screenshot` line to the new dark-mode test, written to the uncommitted
    `test-results/` `outputDir` and proved removed with `git diff --exit-code`.

**Minor**

13. **Non-existent internal step references** — FIXED. "step 5.2" and "step 3.3" are gone; every
    cross-reference now names a slice and a step heading. Section 3 opens by declaring its line
    numbers **original-baseline anchors** and the quoted text the authoritative locator.
14. **"Lint is the executor's only check on browser files" is false** — FIXED. Verified:
    `apps/wbs/fe-01/tsconfig.json:33` to `38` references `tsconfig.e2e.json`, whose `include` is
    `["e2e/**/*.ts", "e2e-packaged/**/*.ts", "playwright.config.ts", "playwright.packaged.config.ts"]`.
    Sections 3 and 7 now say the type check covers the browser specs too, and slice 4's "nothing in
    this slice can be run" is replaced by the accurate statement that only **running a browser** is
    planner-only.
15. **The new-capability rationale overstates the restriction** — FIXED. Verified: `openspec/specs/`
    holds no `wbs-domain`, yet `openspec/changes/clear-estimate/specs/wbs-domain/spec.md` carries
    `## ADDED Requirements`. Assumption 7 now rests on domain ownership alone and explicitly
    withdraws the claim that a missing main specification prevents a delta from validating.
