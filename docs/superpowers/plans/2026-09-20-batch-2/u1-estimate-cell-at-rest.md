# U1 Estimate cell at rest: the result is the main reading, the trio recedes

Size: M. Estimate 0.5 / 1 / 2 days, 800,000 tokens.
Design: [the estimate cell at rest](../2026-09-20-wbs-estimate-cell-at-rest.md).
Batch contract: [execution batch 1 README](../2026-09-19-batch-1/README.md) — "Execution contract",
"Standard blocks every packet uses", "Hidden constraints every frontend packet must respect".
Launcher: `--batch batch-2`.

Everything in section 3 was checked in this repository on 2026-09-20 by reading the files and by
running the commands named there. Nothing is asserted from memory.

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

## 3. Verified facts

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
- `estimates.tsx:874` — `export const ASSIGNEE_SLOT_PX = 32;` is the file's existing pattern for a
  measured constant with its measurement in the JSDoc. `QUIET_TRIO_PX` follows it.
- `estimates.tsx:107` — the file already carries
  `// eslint-disable-next-line react-hooks/rules-of-hooks` above `useCardOpenOn`, with the comment
  at lines 101 to 106 explaining why a hook is legal here: `flexRender` builds this with
  `React.createElement`, so the `cell` property **is** a component. A second hook needs a second
  disable comment on its own line; the justification above it already covers both.
- `apps/wbs/fe-01/src/components/wbs/plan-number-format.ts:9` — `showFinal` returns the bare figure.
  The `· ` is written in the component. **`plan-number-format.ts` is not edited by this packet.**

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

### What the jsdom oracle pins today

Run on 2026-09-20 from `apps/wbs/fe-01`:
`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx vitest run src/components/wbs/plan-estimates.test.tsx`
→ `Test Files 1 passed (1)`, `Tests 65 passed (65)`, 14.4s.

- `plan-estimates.test.tsx:837` — `foldedFinal(number, stepId)` reads `[data-folded-final="…"]`.
- The `· `-prefixed pins are at lines 902, 916, 964, 971, 992 (`'· 4'`), 1068 (`'· 3.7'`),
  1271 (`'· 4'`) and 1371 (`'· 2'`).
- `plan-estimates.test.tsx:934` to `944`, test `says a flat trio once`, ends
  `expect(foldedFinal('010')).toBeNull();`. The design reverses that rule, so this test is rewritten,
  not deleted.
- `plan-estimates.test.tsx:1577`, `1589`, `1597` assert `[data-final="step-dev"]` textContent for an
  **unfolded** step (`'4'`, then `'10'` after the method changes). These must stay green: they are
  what catches a result drawn twice on an unfolded row.
- `plan-read-and-write.test.tsx:2842` — `expect(screen.getByText('· 5')).toBeInTheDocument();`. It
  renders the desktop table, so this is the same `[data-folded-final]` span.
- `plan-cards.test.tsx:2126` pins `'· 3.7'` for the **phone card face**, which has its own
  `finalSaysMore` at `plan-cards.tsx:2517` and its own `· {trio.final}` at `plan-cards.tsx:2604` to
  `2609`. That face is out of scope (section 5), so that pin does not move.

**Blast radius, measured rather than guessed.** The change described in section 6 was prototyped in
this worktree on 2026-09-20 and the whole jsdom tier was run:
`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1`
→ before: `Test Files 115 passed (115)`, `Tests 2834 passed (2834)`; with the change and **no** test
edits: `Test Files 2 failed | 113 passed (115)`, `Tests 9 failed | 2825 passed (2834)`. The nine are
the eight in `plan-estimates.test.tsx` named in step 3.3 plus
`plan-read-and-write.test.tsx > estimate refreshes only tree without a socket`. **No other file in
the repository is affected.** The prototype was then reverted; the tree this packet starts from is
clean.

### `2/2/3 · 2.2` and `Expected: 858` are comments, not pins

The design document says `plan-estimates.test.tsx` "pins the existing pair (`2/2/3 · 2.2`) and the
parent-leaf alignment (`Expected: 858`)". Both readings are wrong and the packet corrects them:

- `2/2/3 · 2.2` appears only in prose — `estimates.tsx:482`, `estimate-draft.ts:164`,
  `use-estimate-drafts.ts:175`, `plan-estimates.test.tsx:976`, `estimate-draft.test.ts:233`. No test
  asserts that string. `plan-estimates.test.tsx:976` is inside a comment and is not edited.
- `858` appears once, at `estimates.tsx:446`, inside a proof comment quoting a historical failure
  message. The live assertion it belongs to is `e2e/layout.spec.ts:1406`,
  `expect(parentBox.x).toBeCloseTo(leafBox.x, 0);` — a **relative** comparison with no absolute
  number in it. Nothing pins 858, so nothing about 858 has to move. The comment stays as written: it
  is a record of a watched failure on a date, not a claim about today's numbers.

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

So **there is nothing to regenerate**. What replaces "regenerate the baselines" is section 9's
planner procedure: run the Chromium gate, read the two geometry tests, re-watch the fit proof, and
look at `wbs-table.png` by eye.

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
- `e2e/layout.spec.ts:1362`, `stands a parent’s figure in the same slot as its leaves’`. Text pins at
  lines 1393 and 1394, both `'· 4'`. Line 1435 compares `trioMetrics` — `paddingLeft`,
  `borderLeftWidth`, `fontSize`, `fontWeight` — between the parent's `[data-rolled-trio]` span and
  the leaf's **unfocused** `<input>`, with `toEqual`. **This is why the rolled-up span must take the
  same quiet size and weight as the resting box, in the same slice.**
- `e2e/layout.spec.ts:1260`, `a step’s figure lands at one x whether or not the row is assigned`,
  and `e2e/dark-mode.spec.ts` are otherwise unaffected.

### Targets, tiers and what the sandbox can run

- `apps/wbs/fe-01/project.json` — `test` runs `TZ=UTC bunx vitest run …` then the zoned config;
  `test:unit` runs the node tier; `e2e` runs `bun run tools/dev/setup.ts` then `bunx playwright test`;
  `typecheck` is `bunx tsc --build --force apps/wbs/fe-01/tsconfig.json`; `lint` covers `src` **and**
  `e2e`.
- `apps/wbs/fe-01/vitest.node-suites.ts` — `plan-estimates.test.tsx` is **not** in `NODE_SUITES` and
  must not be added: it imports `@testing-library/react` and needs jsdom. No file is added to or
  removed from `NODE_SUITES` by this packet, so `src/test-tiers.test.ts` does not move.
- The executor never runs `wbs-fe-01:test:unit` or `wbs-fe-01:test` (batch README, "Frontend tests
  inside the sandbox"). It runs the focused files named here with the default (jsdom) config, which
  spawns no `bun` from Node and was observed working.
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
   assumed: section 9, decision rule D2.
4. **The result inherits weight and colour from the cell wrapper** rather than declaring its own.
   That is what makes a complaint recolour it for free (`estimates.tsx:240`) and what makes it
   exactly the row's foreground.
5. **A flat trio hides the trio's text at rest with `color: 'transparent'`, not with `visibility` or
   by not rendering it.** The box must keep its geometry, because the whole column's alignment is
   built on the box and the rolled-up span being the same slot, and the value must still be there for
   the keyboard, the screen reader and the copy path (`copies one row’s cell into another`).
6. **The phone card face is out of scope.** `plan-cards.tsx:2517` and `2604` keep their own
   `finalSaysMore` and their own `· `. A 390px card is not a 96px column, the design's problem
   statement is about the step **columns**, and `plan-cards.test.tsx:2126` therefore does not move.
   Recorded as a follow-up, not done here.
7. **The OpenSpec capability is new: `wbs-estimate-cell`.** `openspec/specs/wbs-table-modules` is
   about which module owns which concept and about composition identity, not about what a cell reads;
   adding "the result is the main reading" there would put a reading rule inside a structural
   capability. The older `wbs-domain` capability used by `combined-trio-entry` and `clear-estimate`
   has no spec under `openspec/specs/`, so it cannot receive a delta that validates. A new capability
   named for the cell is the honest home.
8. **`e2e/layout.spec.ts`'s two text pins and the new dark-mode test are edited by the executor and
   run by the planner.** The executor cannot start Chromium; the edits are exact strings, given in
   full in step 5.2, so the executor is transcribing rather than deciding. Every one of them is
   listed under "pending planner verification".
9. **The historical proof comments are kept and dated rather than rewritten.** `Expected: 858`,
   `borderLeftWidth "2px" / "1px"` and the 2026-08-30 clip measurement are records of watched
   failures. Only the sentence that states a **present** fact — that the figure is set at 10px
   because the trio needs the room — is rewritten, because that fact is now the other way round.

## 5. File plan

| File                                                             | Create/modify | Responsibility in this change                                                                           |
| ---------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx`   | modify        | The whole behaviour: the focus state, the quiet trio, the strong result, `QUIET_TRIO_PX`, the comments. |
| `apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx`      | modify        | Eight pins updated, one test rewritten, six tests added.                                                |
| `apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx` | modify        | One pin, line 2842.                                                                                     |
| `apps/wbs/fe-01/e2e/layout.spec.ts`                              | modify        | Five text pins and two comments. Planner-run.                                                           |
| `apps/wbs/fe-01/e2e/dark-mode.spec.ts`                           | modify        | One new contrast test for the quiet trio. Planner-run.                                                  |
| `openspec/changes/estimate-cell-at-rest/…`                       | create        | The OpenSpec change: proposal, delta spec, tasks, verify.                                               |

**Not touched, by name:** `plan-number-format.ts`, `plan-cards.tsx`, `plan-cards.test.tsx`,
`estimate-draft.ts`, `use-estimate-drafts.ts`, `folded-step-card.tsx`, `styles.css`,
`vitest.node-suites.ts`, `cell-input.tsx`, and every other `e2e/*.spec.ts`.

**Lanes.** No other batch 2 packet touches these files. 010.6 templates, 010.7 rules and 020.2 shared
failures are Bureaucrat and backend work; 020.7 is backend startup; 040.4 is the plan feed
(`use-plan-read.ts` and the plan modules, not the column families); 110.1 test axes edits the test
tier policy, not `NODE_SUITES` membership, and this packet adds no test file; 110.6 retires the
upstream sync in devsync. **040.1, the Chromium proof of the packages, is the one to watch**: it runs
the browser suite. It does not edit `e2e/layout.spec.ts` or `e2e/dark-mode.spec.ts`; if it turns out
to, this packet owns both files and 040.1 defers.

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

Take the worst case the existing Chromium test already drives: trio `20/24/30` (eight glyphs, six
digits and two solidi) with a result of `25`, and the widest result this column has drawn,
`24.3` (four glyphs). For a humanist sans at the digit advance of `0.5556em` and a solidus at about
`0.278em`:

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
only that the change is expected to have headroom rather than to spend it. **The measurement is
Chromium's**, it is already written as
`expect(measured.clipped, 'the trio does not fit the box beside its figure').toBeLessThanOrEqual(0)`
at `e2e/layout.spec.ts:1192`, and the planner runs it under decision rule D1 in section 9. No slice
of this packet is allowed to change that assertion or its budget.

### What the hover card carries, and why the trio may be small

`FoldedStepCard` receives every point of the trio in words and the result in days
(`estimates.tsx:603` to `642`). So the quiet trio at rest is a reminder of three numbers that are
written out in full one hover or one focus away, and the figure it stands beside is the number the
row's total days is made of. That is what makes the caption size affordable, and it is the same
argument the cell already makes for clipping a wide roll-up (`estimates.tsx:434` to `436`) and for
clipping an assumed `(WW)` in the assignee slot (`estimates.tsx:869` to `872`).

## 7. Steps

Four slices. Each is dispatched on its own, from the tree the planner reviewed and committed after
the previous one. Each starts with its own baseline. Counts are relative to that baseline, never to a
number written in this packet.

### Slice 0 — the baseline, at the start of **every** slice

- [ ] `git rev-parse HEAD` and `git status --short --untracked-files=all` → record both. Expect no
      modification outside this packet's file plan.
- [ ] From `apps/wbs/fe-01`, record the oracle's starting counts as **N**:

  ```sh
  env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx vitest run \
    src/components/wbs/plan-estimates.test.tsx
  ```

  Expected: exit 0, one line `Test Files  1 passed (1)` and one line `Tests  N passed (N)`. Record N.
  A run that matched zero tests is a failure to stop on.

- [ ] Run the batch README's **sandbox unit command** once and record its `Test Files` and `Tests`
      lines. It is the broad net; it must not move in any slice of this packet, because no file this
      packet touches is in the node tier.
- [ ] Do **not** run `wbs-fe-01:test` or `wbs-fe-01:test:unit`. Both are planner-only
      (batch README, "Frontend tests inside the sandbox").

### Slice 1 — the OpenSpec change

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
     be hidden at rest and the result SHALL still be drawn; the value SHALL remain in the box.
  4. `A parent's rolled-up cell reads like its leaves` — the rolled-up trio SHALL carry the resting
     box's size, weight and colour.
  5. `An unestimated step stays empty and a refusal never recedes` — WHEN a step has no estimate no
     result SHALL be drawn; WHEN the typed trio was refused the trio SHALL keep the row's type and its
     invalid styling.

- [ ] Write `openspec/changes/estimate-cell-at-rest/tasks.md` as the ordered slices of this packet.
- [ ] Create `openspec/changes/estimate-cell-at-rest/verify.md` with the headings
      `## Commands`, `## Negative proofs` and `## Not verified`, empty for now. It is filled in
      slice 4 with real output.
- [ ] Run the batch README's **OpenSpec validation** block. Expected: exit 0, and the report's
      `summary.totals.passed` is the number recorded in slice 0 **plus one**. Record both numbers.
      Never delete the report: keep it under `$TMPDIR/evidence`.

### Slice 2 — the trio recedes at rest

Nothing about the result changes in this slice. Every existing test stays green.

- [ ] In `estimates.tsx`, add the React import as the first import group, above the `@/lib/wbs-api`
      one and separated by a blank line:

  ```tsx
  import { useState } from 'react';
  ```

- [ ] Immediately after the `useCardOpenOn(...)` call (which ends `);` at line 111), add:

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
   * one line of a folded step cell`.
   */
  export const QUIET_TRIO_PX = 10;
  ```

- [ ] Add these four tests to `plan-estimates.test.tsx`, inside
      `describe('one cell for the whole trio')`, immediately before
      `itDom('is a cell of the keyboard grid, so a column can be typed down', …)`. They are given in
      full; transcribe them. Note `'3.7'`, not `'4'`: the fake project API applies PERT without the
      whole-day rule the e2e seed uses, which is why the unit and Chromium figures differ.

  ```tsx
  itDom('quiets the trio while the cell is not being typed in', async () => {
    await oneRow();
    typeCombined('010', '2/3/8');
    await waitFor(() => {
      expect(foldedFinal('010')?.textContent).toBe('· 3.7');
    });

    const cell = combinedCell('010');
    expect(cell.style.fontSize).toBe('10px');
    expect(cell.style.color).toBe('var(--muted-foreground)');
  });

  itDom('gives the trio back its strength the moment the cell is focused', async () => {
    await oneRow();
    typeCombined('010', '2/3/8');
    await waitFor(() => {
      expect(foldedFinal('010')?.textContent).toBe('· 3.7');
    });

    fireEvent.focus(combinedCell('010'));

    expect(combinedCell('010').style.fontSize).toBe('inherit');
    expect(combinedCell('010').style.fontWeight).toBe('600');
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

    expect(rolledTrio('010')?.style.fontSize).toBe('10px');
    expect(rolledTrio('010')?.style.color).toBe('var(--muted-foreground)');
  });
  ```

- [ ] Add the helper the last of those uses, directly under the `foldedFinal` helper (which ends at
      line 838):

  ```tsx
  /** The parent's rolled-up trio span, or null on a leaf. */
  const rolledTrio = (number: string, stepId = 'step-dev') =>
    rowFor(number).querySelector<HTMLElement>(`[data-rolled-trio="${stepId}"]`);
  ```

- [ ] Run the oracle. Expected: exit 0, `Tests  N+4 passed (N+4)`. **If any test that was passing at
      slice 0 now fails, stop and report it** — this slice is not allowed to move an existing
      assertion.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0, no diagnostic. This slice changes a
      style object's shape and adds a hook, so the type check belongs in it.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` → exit 0.
- [ ] Negative proofs N1 to N4 (section 8).

### Slice 3 — the result becomes the main reading

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
      only where it says something…", `estimates.tsx:140` to `152`) as:

  ```tsx
  // The result is what this cell is read for, so it is drawn whenever the
  // step has one — and only while the step is folded, because an unfolded
  // cell **is** the figure (`atRest`) and a span beside it would be the
  // same number twice. That `!unfolded` is the whole of the guard: with it
  // dropped, `shows the final figure be-01 computed, per step and in total`
  // reads `3.73.7`.
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
  path can reach it.

- [ ] Change `{finalSaysMore && (` to `{showsResult && (`.
- [ ] Replace the figure span's `style` and content. The five lines

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

- [ ] Rewrite the comment block above that span (`estimates.tsx:482` to `508`) as below. Keep the
      2026-08-30 measurement as history; it is a watched failure on a date. What is rewritten is the
      sentence that states a present fact, because that fact is now reversed.

  ```tsx
  // The step's result, and the cell's main reading since 2026-09-20: the
  // row's own type and foreground, which it takes by inheriting from the
  // wrapper — so a complaint recolours it for free — and tabular numerals,
  // so results line up down a column and can be scanned like a ledger. No
  // leading `·`: the separator was the annotation's, and this is not an
  // annotation any more. Dropping it also returns about six pixels, which
  // is most of what growing from the caption size to the row's costs.
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
  // way round.
  ```

- [ ] In `plan-estimates.test.tsx`, drop the `· ` from every `foldedFinal` pin. There are eight, at
      lines 902, 916, 964, 971, 992, 1068, 1271 and 1371 of the file as it stands before this slice,
      plus the four this packet added in slice 2. Do it as three literal replacements over the whole
      file: `toBe('· 4')` → `toBe('4')`, `toBe('· 3.7')` → `toBe('3.7')`, `toBe('· 2')` → `toBe('2')`.
      **Do not touch the `assigneeShown` pins** (`'· GR'`, `'· AD'`, `'· KA'`, `'· (AD)'`) or the
      comment at line 959 that quotes `'· '` inside a proof note.
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

- [ ] Add these two tests, in the same place as slice 2's:

  ```tsx
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

- [ ] In `plan-read-and-write.test.tsx`, at line 2842, replace

  ```tsx
  expect(screen.getByText('· 5')).toBeInTheDocument();
  ```

  with

  ```tsx
  expect(document.querySelector('[data-folded-final]')?.textContent).toBe('5');
  ```

  By the attribute and not by text: `getByText('5')` would be ambiguous against the row's own total.

- [ ] Run both oracles:

  ```sh
  env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx vitest run \
    src/components/wbs/plan-estimates.test.tsx src/components/wbs/plan-read-and-write.test.tsx
  ```

  Expected: exit 0, `Test Files  2 passed (2)`, and the `plan-estimates` count at slice 2's N+4 plus 2. When the two files are run together the reported total is the sum of both files' tests; record
  it relative to the same command run at this slice's step 0.

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` → exit 0.
- [ ] Negative proofs N5 to N7 (section 8).

### Slice 4 — the Chromium edits, the format, and the record

Nothing in this slice can be run by the executor. Every item is transcription, and every one of them
is listed under "pending planner verification" in the report.

- [ ] `apps/wbs/fe-01/e2e/layout.spec.ts`, inside
      `test('holds a trio and its figure on one line of a folded step cell', …)`:
  - line 1204: `expect(seeded.said).toBe('· 4');` → `expect(seeded.said).toBe('4');`
  - line 1222:
    `await expect(page.locator('[data-folded-final]').first()).toHaveText('· 25');` →
    `await expect(page.locator('[data-folded-final]').first()).toHaveText('25');`
  - line 1225: `expect(wide.said).toBe('· 25');` → `expect(wide.said).toBe('25');`
  - the comment at lines 1201 to 1203 — rewrite `` `· 4` and not `· 3.7` `` as `` `4` and not `3.7` ``
    and leave the rest of the sentence, which is about the whole-day rule and is still true.
  - the comment at lines 1213 to 1218 — the paragraph that reasons about `· 24.3` becoming `· 25`
    gains one sentence: since 2026-09-20 the result carries no leading separator and is set at the
    row's type while the trio is set at the caption size, so the budget is spent the other way round
    and the assertion below is what decides whether that was affordable.
  - the `Proof:` note at lines 1183 to 1186 — it says the figure is set small because at the row's
    type the trio clipped by 8px. Rewrite it to say that the measurement was taken on 2026-08-30 with
    the sizes the other way round, that since 2026-09-20 it is the **trio** that is set at the caption
    size and the result at the row's, and that this assertion is what holds the new budget. Do not
    delete the `Expected: <= 0, Received: 8` quotation.
  - **Do not touch** `expect(measured.cell.width).toBe(104)`, the two `findOverrun` assertions, the
    `clipped` assertion, the row-height assertions or `ROW_HEIGHT_BUDGET`.
- [ ] `apps/wbs/fe-01/e2e/layout.spec.ts`, inside
      `test('stands a parent’s figure in the same slot as its leaves’', …)`:
  - line 1393: `await expect(parentFigure).toHaveText('· 4');` → `toHaveText('4')`
  - line 1394: `await expect(leafFigure).toHaveText('· 4');` → `toHaveText('4')`
  - **Do not touch** `trioMetrics`, the `toEqual` comparison, either `boundingBox` comparison, or the
    `Expected: 858` proof comment at `estimates.tsx:446`. Both are unchanged claims.
- [ ] `apps/wbs/fe-01/e2e/dark-mode.spec.ts`, inside
      `test.describe('what the dark palette paints', …)`, after
      `test('the Gantt’s row labels stand off the column they are in', …)`, add:

  ```ts
  test('the quiet trio in a folded step cell stands off the row it is in', async ({ page }) => {
    // The trio recedes at rest since 2026-09-20 (`estimates.tsx`,
    // {@link QUIET_TRIO_PX}), and at rest it is the only place the three
    // numbers are without a hover — so its legibility under the dark palette
    // is measured rather than assumed. `seedPlan` estimates both rows, so a
    // folded step cell with a trio in it is already on screen.
    const trio = page.getByLabel('Dev estimate for 010');
    await expect(trio).not.toHaveValue('');

    const ratio = await contrastOf(trio);
    expect(ratio, `the quiet trio reads at ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(READABLE);
  });
  ```

- [ ] Fill `openspec/changes/estimate-cell-at-rest/verify.md` with the real output of every command
      run in slices 1 to 3: the command, its exit status and its decisive line; every negative proof
      with the fault, the named test and the failing line observed; and, under `## Not verified`,
      every check in section 9's planner table.
- [ ] Format only this packet's files, then the repository-wide check:

  ```sh
  GSETTINGS_BACKEND=memory bunx prettier --write \
    apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx \
    apps/wbs/fe-01/e2e/layout.spec.ts \
    apps/wbs/fe-01/e2e/dark-mode.spec.ts \
    openspec/changes/estimate-cell-at-rest/proposal.md \
    openspec/changes/estimate-cell-at-rest/tasks.md \
    openspec/changes/estimate-cell-at-rest/verify.md \
    openspec/changes/estimate-cell-at-rest/specs/wbs-estimate-cell/spec.md
  ```

  Then `NX_DAEMON=false bunx nx format:check --all` → exit 0. If it names a file not in that list,
  stop: another lane's file was rewritten.

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` → exit 0. The lint target covers `e2e`, so this is
      the only check the executor has on the two spec files it just edited. Say so.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0.
- [ ] Re-run the OpenSpec validation block. Expected: exit 0 and the same passed count as slice 1.
- [ ] Re-run the oracle and the sandbox unit command. Expected: unchanged from slice 3.

## 8. Negative proofs

Every one is on the production path and every one has a named test. Follow the batch README's
"Negative proofs with a restore" and "Saving a mutation patch" blocks: copy the passing bytes aside
first, save the mutation as a patch under `$TMPDIR/evidence`, save the failing output beside it,
restore by copying the bytes back, prove it with `cmp`, and rerun green. **Write the adjacent
`Proof:` comment only after watching the failure, and make it describe what you actually saw.** A
fault that also fails tests beyond the named one is recorded beside the proof, not a stop.

| #   | Slice | Fault to inject in `estimates.tsx`                                                              | Test expected to fail                                                        | What the failure says                          |
| --- | ----- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------- |
| N1  | 2     | The rest arm deleted: the ternary replaced by `{ fontSize: 'inherit', fontWeight: 600 }` always | `quiets the trio while the cell is not being typed in`                       | the box's `fontSize` is `inherit`, not `10px`  |
| N2  | 2     | `problem !== null \|\| typing` narrowed to `problem !== null`                                   | `gives the trio back its strength the moment the cell is focused`            | the focused box is still `10px`                |
| N3  | 2     | `problem !== null \|\|` dropped, leaving `typing`                                               | `leaves a refused trio at full strength, because a complaint may not recede` | a refused, unfocused box receded to `10px`     |
| N4  | 2     | The three declarations dropped from the `data-rolled-trio` span                                 | `quiets a parent’s rolled-up trio exactly as a leaf’s`                       | the rolled-up span's `fontSize` is `''`        |
| N5  | 3     | `!unfolded &&` dropped from `showsResult`                                                       | `draws no result beside an unfolded step’s own figure`                       | the unfolded cell reads the figure twice       |
| N6  | 3     | `trioRepeatsResult ? 'transparent' :` dropped from the box's rest arm                           | `says a flat trio once`                                                      | the box's `color` is `var(--muted-foreground)` |
| N7  | 3     | `final !== ''` widened to `true` in `showsResult`                                               | `leaves an unestimated folded cell empty`                                    | an unestimated row draws an empty result span  |

Two more are the planner's, in section 9: the Chromium fit proof and the dark contrast proof. Neither
can be watched in the sandbox, and neither may be claimed by the executor.

For context while injecting: with the whole change applied and **no** test edited, the nine tests
that fail are the eight in `plan-estimates.test.tsx` — `keeps the trio in the cell once the estimate
lands`, `stands the derived figure beside the trio it came from`, `says a flat trio once`, `keeps the
stored figure beside a cell holding a refused entry`, `copies one row’s cell into another and lands
the same estimate`, `sends one request for a trio entered with Enter and then left`, `reads a
parent’s roll-up as a trio too`, `lets a box win back over a refused folded entry` — plus
`plan-read-and-write.test.tsx > estimate refreshes only tree without a socket`. Measured 2026-09-20.
If a slice produces a failure outside that set, stop.

## 9. Planner-only, and the exact Chromium procedure

Run on the workstation, outside any sandbox, from the planner's own clone of the reviewed commit.

| Check                                               | Why the executor cannot                              |
| --------------------------------------------------- | ---------------------------------------------------- |
| `NX_DAEMON=false bunx nx run wbs-fe-01:test`        | Three tests spawn `bun` from Node; sandbox EPERM.    |
| `NX_DAEMON=false bunx nx run wbs-fe-01:test:unit`   | Same.                                                |
| The Chromium gate and the two geometry tests below  | No browser, and Node cannot spawn `bun` to serve it. |
| The dark contrast test                              | Same.                                                |
| `bin/h2puni-gate.sh <sha>` on the shared build host | The gate script does not run on this machine.        |

Expected relative delta for the whole-target runs: `wbs-fe-01:test` gains exactly the six tests this
packet adds to `plan-estimates.test.tsx` and no others; `wbs-fe-01:test:unit` is unchanged, because
no file this packet touches is in `NODE_SUITES`.

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

### P1 — after slice 3 is committed: the fit

```sh
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT NX_DAEMON=false \
  bunx nx run wbs-fe-01:e2e -- --grep "holds a trio and its figure on one line of a folded step cell"
```

**Decision rule D1, stated in advance.**

- Green → the fit is resolved. Record it and go on. This is the expected outcome: section 6's
  arithmetic puts the worst pair about 12px cheaper than the pair that fits today.
- Red on `the trio does not fit the box beside its figure — Expected: <= 0, Received: R` → the trio
  still does not fit. Do **not** touch the assertion or `ROW_HEIGHT_BUDGET`. In order: (a) take
  `QUIET_TRIO_PX` to 9 and rerun; (b) if still red, take it to 8 and rerun; (c) if still red at 8,
  stop and fall back to the design's own fallback — the quiet trio yields at this width and lives in
  the hover card, which already carries it — and reopen assumption 1 with the measured `R` in hand.
  Record every value tried and the `R` it produced.
- Red on the row-height assertion (`a row holding a trio and a figure is taller than one holding
neither`, or the `ROW_HEIGHT_BUDGET` bound) → the `font: inherit` to longhands swap changed the
  line box. Put `lineHeight: 'inherit'` back if it was lost, and if the row is still tall, report it:
  it is a finding about the grid's `line-height: 1.4` rule (`styles.css:602` to `606`), not something
  to fix by widening the budget.

### P2 — after slice 4 is committed: the alignment, the contrast, the eye

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

**Decision rule D2, stated in advance.** If the contrast test fails with a ratio below 4.5:1, the
quiet trio's colour is the problem, not its size. In order: (a) change both `color:` lines from
`var(--muted-foreground)` to `var(--foreground)` and rerun, so the recession is carried by size
alone; (b) if it still fails, the palette itself is the finding — record the measured ratio, leave
the colour at `var(--foreground)`, and raise it as a palette question rather than inventing a token.
Do not lower `READABLE`. Re-run the same test in the light palette too, by temporarily choosing
`Light`, and record both numbers.

### P3 — the non-vacuity of the fit check, re-watched

The 8px clip that justified the old 10px figure was measured with the sizes the other way round, so
the fit assertion's proof has to be re-watched for the new arrangement.

- Take `QUIET_TRIO_PX` to `13` — the row's own type, which is the arrangement the test is written
  against — rerun P1's command, and expect
  `the trio does not fit the box beside its figure — Expected: <= 0, Received: <some positive R>`.
- Restore, rerun green, and record the observed `R` in
  `openspec/changes/estimate-cell-at-rest/verify.md` and in `QUIET_TRIO_PX`'s JSDoc as a dated
  `Proof:` line.
- If the mutation does **not** fail, the fit assertion has gone vacuous for this arrangement. That is
  a stop: record it as a finding against `e2e/layout.spec.ts` and do not claim the fit is proven.

### P4 — the eye

There are no baselines to regenerate (section 3). What a person looks at instead is the deliberate
artifact the gate already writes, `apps/wbs/fe-01/test-results/…/wbs-table.png`, produced by
`leaves a picture of the table for the eye that has to judge the widths`
(`e2e/layout.spec.ts:1018` to `1026`). Open it and judge, in the light palette, that the result reads
as the cell's main number and the trio as its annotation. **There is no equivalent artifact for the
dark palette**; say so in the report rather than implying the dark reading was eyeballed. If the
owner wants one, a dark screenshot is its own small change.

### P5 — the gate

`bin/h2puni-gate.sh <sha>` on the shared build host, with the committed hash, per the batch README's
"Completion gate". Trust the printed `h2puni gate: running on <sha>`. If it is not run, say so.

## 10. Stop conditions

Each of these is FALSE on the tree this packet starts from, checked on 2026-09-20.

- `apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx` does not contain the exact line
  `const finalSaysMore = final !== atRest;`, or does not contain `· {final}`.
- `plan-estimates.test.tsx` does not contain `expect(foldedFinal('010')).toBeNull();`, or the
  oracle's slice-0 run does not report a positive test count.
- `plan-read-and-write.test.tsx` does not contain `expect(screen.getByText('· 5')).toBeInTheDocument();`.
- `e2e/layout.spec.ts` does not contain all five of the strings named in slice 4.
- A slice's oracle run fails a test that was passing at that slice's own step 0 and that the slice
  does not name as an expected change.
- A named negative proof's test **passes** with the fault injected, fails with a different message,
  or the mutation does not compile. (A fault that also fails other tests is not a stop: record them.)
- `nx format:check --all` names a file outside this packet's file plan.
- The work appears to need `styles.css`, `plan-cards.tsx`, `plan-number-format.ts`,
  `vitest.node-suites.ts` or `cell-input.tsx`. Every one of those is out of lane; stop and report.
- The OpenSpec validation block's passed count moves by anything other than this change's own
  addition.

## 11. Ready to commit

The executor stages and commits nothing. It reports, per slice, the message and the path list.

**Slice 1** — `docs(openspec): specify the estimate cell at rest`

- `openspec/changes/estimate-cell-at-rest/.openspec.yaml`
- `openspec/changes/estimate-cell-at-rest/proposal.md`
- `openspec/changes/estimate-cell-at-rest/tasks.md`
- `openspec/changes/estimate-cell-at-rest/verify.md`
- `openspec/changes/estimate-cell-at-rest/specs/wbs-estimate-cell/spec.md`

**Slice 2** — `feat(wbs-fe-01): let a folded step's trio recede while it is not typed in`

- `apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx`
- `apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx`

**Slice 3** — `feat(wbs-fe-01): make a step's result the folded cell's main reading`

- `apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx`
- `apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx`
- `apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx`

**Slice 4** — `test(wbs-fe-01): move the Chromium pins to the cell's new reading`

- `apps/wbs/fe-01/e2e/layout.spec.ts`
- `apps/wbs/fe-01/e2e/dark-mode.spec.ts`
- `apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx` (only if formatting or a `Proof:`
  comment moved it)
- `openspec/changes/estimate-cell-at-rest/verify.md`

Each slice's expected `git status --short --untracked-files=all` is exactly its own list above,
including any file changed only by a required `Proof:` comment.

## 12. Unknowns

- Whether `20/24/30` at 10px plus `24.3` at 13px fits 96px in Chromium. Estimated in section 6,
  decided by D1.
- What `var(--muted-foreground)` at 10px measures against the grid's dark background. Decided by D2.
- Whether swapping `font: inherit` for its longhands moves the row's line box. The `lineHeight:
'inherit'` is there to prevent it; P1's row-height assertion is what would catch it.
- Whether the owner wants the phone card face to follow (assumption 6). Recorded as a follow-up.
