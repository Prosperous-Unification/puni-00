# verify — `project-picker-flow`

Implemented 2026-08-29 on `change/project-picker-flow`, rebased onto `main`
(`1791113`). Nothing here is a claim unless it quotes a run; what was **not**
run is listed under "Skipped or unavailable checks".

## Commands

| Command                                                              | Result                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts` | **209 passed, 3 failed** — the three that fail on `main` too; see below         |
| `bunx nx run fe-01:test`                                             | **1818 passed** (`TZ=UTC` since `db09a64` pinned the gate's clock)              |
| `bunx nx run fe-01:lint`                                             | **pass** — 0 errors, 1 pre-existing warning in `wbs-table.tsx`                  |
| `bunx nx run fe-01:typecheck`                                        | **pass** — `tsc --build --force` on `tsconfig.app.json` and `tsconfig.e2e.json` |
| `bunx openspec validate project-picker-flow --json`                  | **pass** — `"items": 1, "passed": 1, "failed": 0`                               |
| `bunx prettier --check apps/fe-01/src/components/wbs apps/fe-01/e2e` | **pass** — `All matched files use Prettier code style!`                         |
| `bin/h2puni-gate.sh`                                                 | **not run** — see "Skipped or unavailable checks"                               |

### The browser gate, before and after

Ports 3100/3200/4200 free, `CI=1`, so Playwright started its own three servers
against a `tmp/e2e-*.db` of its own — never the shared dev server
(`LLM_README.md`'s landmine).

**Before** the e2e fixtures were fixed, with the product change in place:

```
  ✘   19 …deps-cell.spec.ts:430:3 › picks the add button up off the row it is hovered on, in both palettes
  ✘  103 …keyboard.spec.ts:471:3 › Escape leaves the stored day alone, blur and all
  ✘  107 …keyboard.spec.ts:615:3 › saves only the year that was typed, digit by digit, in a real Chrome
  ✘  199 …project-picker.spec.ts:85:3 › clicking the closed picker does not put a caret in the project name
  ✘  200 …project-picker.spec.ts:108:3 › choosing a project takes the focus off the picker
  ✘  208 …tailwind.spec.ts:129:3 › takes the user agent’s margin off a chrome heading
  ✘  209 …tailwind.spec.ts:146:3 › gives a chrome control the page’s own font
  7 failed
  205 passed (8.0m)
```

**After**:

```
  ✘   19 …deps-cell.spec.ts:432:3 › picks the add button up off the row it is hovered on, in both palettes
  ✘  103 …keyboard.spec.ts:473:3 › Escape leaves the stored day alone, blur and all
  ✘  107 …keyboard.spec.ts:617:3 › saves only the year that was typed, digit by digit, in a real Chrome
  3 failed
  209 passed (6.1m)
```

The three that remain are **`main`'s**, not this change's, and that is measured
rather than taken on trust: `git stash push -u` on this branch's uncommitted
work, `git checkout HEAD~1 -- apps/fe-01` to put `main`'s whole fe-01 in place,
then `deps-cell.spec.ts keyboard.spec.ts` alone —

```
  ✘    7 …deps-cell.spec.ts:430:3 › picks the add button up off the row it is hovered on, in both palettes
  ✘   21 …keyboard.spec.ts:471:3 › Escape leaves the stored day alone, blur and all
  ✘   25 …keyboard.spec.ts:615:3 › saves only the year that was typed, digit by digit, in a real Chrome
  3 failed
  25 passed (1.3m)
```

— the same three, with this change's files removed from the checkout. (The line
numbers move by two in the "after" run because each spec gained an import.) The
two `keyboard` cases are the host's region, `en_UA`, reading a date field.

### What each of the five was

1. **`tailwind.spec.ts:129` and `:146`** — `Test timeout of 60000ms exceeded.
locator.click … waiting for getByRole('button', { name: 'Rename' })`. The
   coordinator's hypothesis, confirmed: `openChromeControl` clicked `Rename`
   straight after a create, and a create now **arms the rename itself**, so the
   picker and the ✎ are off the bar and the button it waited for does not
   exist. Deterministic, and reproduced on its own before anything was changed.
2. **`project-picker.spec.ts:85`** — `strict mode violation: getByRole('option',
{ name: /Rewire the shed/ }) resolved to 3 elements`, two of them
   `header.spec.ts`'s `Rewire the shed and repaint the hall…`. My spec's fault,
   not the product's: the fixed local identity is **one account for the whole
   run** and keeps every project every spec has ever made. Every assertion above
   the failing line — `not.toBeEditable()` at rest, the list open, `toBeEditable()`
   and an empty value after the click — had already passed, so **the product
   rule held in Chromium**; the locator was what failed. Projects here now carry
   a per-test tag, as `directory.spec.ts` does.
3. **`project-picker.spec.ts:108`** — the same collision at `.click()`, four
   matches. Same fix.
4. **`layout.spec.ts:2055`** — did **not** reproduce here: it passed in both of
   my full runs and in two targeted ones (alone, and after `header.spec.ts` had
   filled the account with projects). It failed for the coordinator on this same
   commit, which makes it a **race** rather than a break, and this change
   introduces exactly one new race on that path: the re-arm lands **one round
   trip after the table appears** — `Add work item` is on screen as soon as the
   project is selected, while the arming waits for `load()` — so a fixture that
   clicks on into the table without waiting can have the focus taken out from
   under it whenever that reload is slow enough. `createProject` closes the
   window by waiting for the field and leaving it before the fixture goes on.
   Not a proof, and it is named as a hypothesis here rather than as a finding.

### The blast radius of arming that rename

**Every fixture that creates a project now goes through
`apps/fe-01/e2e/create-project.ts`**, which clicks the `+`, waits for the name
field the create arms, and leaves it — typing a name and committing with Enter
when given one, Escape when not — then waits for the picker to be back on the
bar. Fifteen spec files hold sixteen create sites, and they are all of them:

| Spec                      | Sites | What the create is followed by                                                |
| ------------------------- | ----- | ----------------------------------------------------------------------------- |
| `dark-mode.spec.ts`       | 1     | rows, then a palette measurement                                              |
| `deps-cell.spec.ts`       | 1     | nine rows and a dependency                                                    |
| `directory.spec.ts`       | 1     | a row, a team label, the directory                                            |
| `gantt.spec.ts`           | 2     | **the project start date, typed into the toolbar**                            |
| `header.spec.ts`          | 3     | the bar's own controls — the picker included                                  |
| `hover-cards.spec.ts`     | 1     | two rows and an estimate                                                      |
| `keyboard.spec.ts`        | 1     | rows, then chords                                                             |
| `layout.spec.ts`          | 1     | rows, names, a dependency                                                     |
| `mobile.spec.ts`          | 1     | the mobile cards, or the Teams button                                         |
| `name-cell.spec.ts`       | 1     | rows and a long name                                                          |
| `phases.spec.ts`          | 1     | the phases dialog                                                             |
| `plan-surface.spec.ts`    | 1     | rows and the chart                                                            |
| `reference-cells.spec.ts` | 1     | the project id out of localStorage, then API commands                         |
| `tailwind.spec.ts`        | 2     | a chip, and **the ✎**                                                         |
| `project-picker.spec.ts`  | 2 raw | deliberately **not** the helper: those two tests are about what a create does |

Two of these were failing (`tailwind`), one was intermittent (`layout`), and the
rest were passing by accident of timing — `gantt.spec.ts` types a date into the
toolbar within a few hundred milliseconds of a create, which is the same window
`layout` is suspected of losing. They are all deterministic now.

## Failure proofs (R5)

Each fault was injected into the production file, the named test run, the
message below copied from that run, and the fault reverted. The two browser
rows were watched in Chromium on ports of Playwright's own.

| Check                                  | Fault injected                                                               | Test that saw it fail                                                                              | Watched                                                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| card placed outside the list           | `projectOptionAnchor` back to the option's rect, under the old `anchor` prop | `the open card leaves every option visible`                                                        | `the card opens at 45px in a list ending at 240: expected 45 to be greater than or equal to 240` (three more failed beside it)              |
| side flip, not a clamp                 | the flip replaced by `left: max(0, viewport.width - card.width)`             | `a narrow window flips the card to the left of the list`                                           | `expected 400 to be less than 400`                                                                                                          |
| a card that fits nowhere is absent     | the same clamp                                                               | `a window with room on neither side shows no card`                                                 | `expected <div role="tooltip" …(2)>…(4)</div> to be null`                                                                                   |
| card moves vertically only             | the anchor's edges recomputed from the option's rect                         | `moving down the list does not move the card sideways`                                             | `expected '241px' to be '246px'`                                                                                                            |
| a pick blurs the picker (jsdom)        | `pickerBox.current?.blur()` removed from `choose`                            | `choosing a project takes the focus off the picker`                                                | `expected <input …(9)></input> not to be <input …(9)></input>`                                                                              |
| **a pick blurs the picker (Chromium)** | the same removal                                                             | `e2e/project-picker.spec.ts` `choosing a project takes the focus off the picker`                   | `expect(locator).not.toBeFocused() failed … Received: focused`, on an element the log shows still `readonly` and holding the project's name |
| **the closed picker takes no caret**   | `readOnly={search === null}` removed                                         | `e2e/project-picker.spec.ts` `clicking the closed picker does not put a caret in the project name` | `expect(locator).not.toBeEditable() failed … Expected: not editable, Received: editable`                                                    |
| the re-arm waits for the list          | the re-arm moved above `await load()`                                        | `arms the rename only once the list can name the new project`                                      | `expected <input …(3)></input> to be null`                                                                                                  |
| the old draft is discarded             | `setRename(null)` deleted from `create`                                      | `a draft armed for another project does not follow the create`                                     | `expected 'Meant for p2' to be null`                                                                                                        |
| the placeholder is selected            | `node.select()` deleted from `ProjectNameField`                              | `creating a project selects the whole placeholder name`                                            | `expected [ 11, 11 ] to deeply equal [ +0, 11 ]`                                                                                            |
| selected **once**, on arming           | the effect's dependency list removed, so it runs on every render             | `does not put the whole draft back under the next keystroke`                                       | `expected [ +0, 1 ] to deeply equal [ 1, 1 ]`                                                                                               |

**What the `readOnly` row does and does not prove.** Nothing observable after
the fact can say "no caret was placed": the focus handler replaces the project's
name with the search's empty string in the same commit, so a box that took a
caret and a box that refused one look identical one tick later. What the browser
_can_ be asked is whether the box is editable, which is `readOnly`'s whole
effect on a text input and the thing that stops the click's default action from
hit-testing the name — and that assertion was watched failing with the attribute
removed. Beside it the test reads the caret back after the click
(`[selectionStart, selectionEnd]` is `[0, 0]` in an empty box) and types into the
box to show the attribute is gone by then. The rule holds in Chromium; the
assertion is the strongest form of it a browser will answer.

Two notes on how far the placement negatives reach:

- Anchoring the card to the **option's** rect while keeping this placement is
  seen only by the exact-position assertion in `moving down the list does not
move the card sideways` (`241px` against `246px`). It is not seen by the
  overlap assertions, because an option is inset from its list by about five
  pixels and the placement's own six-pixel gap carries it clear anyway. A
  per-option anchor cannot produce two _different_ lefts at all: every option in
  a `w-full` one-column list shares its width. The inset is the whole of what
  that test has to work with, and it is stubbed deliberately for it.
- The card's own box is stubbed at 300×90 in `project-page.test.tsx`, because
  jsdom measures every element as zero and a card with no width can neither run
  out of room nor cover anything. Each overlap assertion is preceded by an
  assertion that the width is non-zero (`G gantt-calendar-axis`'s lesson), in
  the browser spec as well as in jsdom.

## Skipped or unavailable checks

- `bin/h2puni-gate.sh` not run: this session was asked for `fe-01:test`,
  `fe-01:lint`, `fe-01:typecheck` and the browser gate. The gate's build and
  format targets cover projects this change does not touch.
- **A race this change introduces is described but not proven**, and it is the
  `layout.spec.ts:2055` hypothesis above: the rename arms one reload after the
  table appears, so it can take the focus from somebody — a fixture or a
  person — who has already moved on to the plan. The fixtures no longer race it.
  A person still can: click `+`, click straight into the first row, and the name
  field can pull the caret back to the header a moment later. Nothing in the
  spec's scenarios covers that arrival, so no behaviour was changed for it here;
  it is written down as the next thing to decide about this control.
- `apps/fe-01/src/components/wbs/hover-card.tsx` is edited beyond the impact the
  proposal names (`project-page.tsx` and its test file). The placement policy
  lives in `HoverCard`, which computes it from the card's own measured box, so a
  card placed beside a list — flipped, or refused for want of room — cannot be
  expressed from the caller. The addition is a second anchor prop (`beside`) and
  one pure function (`besidePlacement`); no existing caller's behaviour changes,
  and `hover-card.test.tsx`'s 15 tests pass unchanged.
- `apps/fe-01/e2e/create-project.ts` is new, and fifteen spec files now import
  it. That is wider than the proposal's impact too, and it is the coordinator's
  call rather than an invention: the ripple belongs in one helper rather than in
  each spec that happens to fail today.
