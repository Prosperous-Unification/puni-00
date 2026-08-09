# verify — `compact-columns`

Branch `change/compact-columns`, off `main` @ `4f2b583` by way of `75d01a8`
(`name-title-body`, which was HEAD of the worktree this ran in).

fe-01 only. No migration, no dependency, no be-01 or gw-01 change.

## The gate

Run from the worktree root, 2026-08-09.

| Command                                                      | Result                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `bunx nx format:check --all`                                 | green, exit 0                                                    |
| `bunx nx run-many -t test lint typecheck build --parallel=2` | green — 21 projects, **888 tests** in 42 files (fe-01: 42 files) |
| `bunx openspec validate --all --json`                        | green — 50 items, 50 passed, 0 failed                            |
| `bun run e2e` (see the note below)                           | green — **78 tests**, chromium                                   |

`nx` reported `gw-01:test` as a flaky task on the run above; it passed. Nothing
in this change touches gw-01.

### The e2e run did not use `bun run e2e` verbatim, and here is why

This machine already had an **unrelated checkout** — `~/wd/puni/wbs-tool-v1` —
serving be-01, gw-01 and fe-01 on 3100/3200/4200. `playwright.config.ts` sets
`reuseExistingServer: !isCi`, so `bun run e2e` here would have measured _that_
checkout's table and reported it as this branch's. The suite was run instead
through a throwaway config (`tmp/pw-shifted.config.ts`, gitignored, not part of
the change) identical to the repository's except that it starts this worktree's
own three servers on 3101/3201/4201 with `reuseExistingServer: false`.

Nothing about the change depends on the port numbers, and every assertion in
these specs is arithmetic on `getBoundingClientRect` against a stack built from
this branch. **CI runs `bun run e2e` unmodified with `CI` set, where
`reuseExistingServer` is already false.**

## What moved

**One resolved frame layout.** `frameLayout(leafIds, state)` in `table-frame.ts`
is the single resolution the `<colgroup>`, the table's `min-width`, the pinned
offsets, the Phases dialog's folded minimum and the browser gate's equation all
read. `tableMinWidth`, `pinnedGeometry` and the module-load `PINNED_GEOMETRY`
map are gone. `foldedTableMinWidth(roleIds, state)` takes the project's real
role ids.

**Short dates.** `short-date.ts` is new: `shortIsoDate(iso, today)` reads the
day's components out of the string, `shortInstant(epochMs, now)` prints an
instant in the browser's own zone. Start, End and the outline cards print the
short form with the whole `YYYY-MM-DD` in a `title`.

**The earliest-start cell is text until it is edited**, and `DateField` has an
`onExit('commit' | 'cancel')`.

**Two widths moved, and one of them moved the wrong way.**

| Column       | Before | After                                              |
| ------------ | ------ | -------------------------------------------------- |
| `not-before` | 146    | **84** with any day in the project, **56** without |
| `number`     | 100    | **169**                                            |

The Number column is the surprise of this change and it is worth reading twice.
The spec asks for a browser's measurement of the stated eleven-character
envelope at the deepest indent, beside the row's expander and its frozen-number
lock. Chromium measures that at **168.59px**: 48px of indent, a 12.5px expander,
a 20px lock, 80.1px of eleven-character number, and the cell's 8px of padding.
The column has been declared 100 since the 168 → 100 compaction on 2026-08-08
and has been **clipping its own envelope ever since** — nothing had measured it.
So the column got wider rather than narrower, against the plan's guess of 72.

The table still fits. Undated fixed columns total 731px; with Name's 200px floor
that is 931, and two roles folded is **1123px** — inside a 1280 laptop, as is
three folded (1219) and the dated two-role case (1151). One role unfolded is
1399 and still does not fit, which is why unfolding is an accordion. All of that
is measured by `e2e/layout.spec.ts`'s matrix at 1280×800 and 1512×982.

## Failure-proof table

Every check this change adds or changes, the fault injected into it, and what
was watched. All watched on 2026-08-09.

### `table-frame.ts` — the resolved layout

| Check                                                 | Injected fault                                                              | Observed                                                                                                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `refuses an id nothing sizes…`                        | `widthFor`'s `throw new UnknownColumnError` → `return Number.NaN`           | `expected [Function] to throw an error` ×3; and `frameLayout(['drag','number','serviec'])` handed back `{id:'serviec',width:NaN}` and `minWidth: NaN` |
| `refuses a column pinned behind a flexible one`       | the `flexibleBefore !== null` branch deleted                                | `expected [Function] to throw an error` — `depends` resolved to `{ left: 193, width: 110 }`                                                           |
| `holds every pinned column at the sum of the widths…` | `pinnedGeometryFor` adding `ROLE_FINAL_WIDTH` instead of the resolved width | `expected { left: 96, width: 100 } to deeply equal { left: 24, width: 100 }`, ×3 tests                                                                |
| `is 84px while any row in the project sets a day…`    | `PLAN_WIDTHS`'s `not-before` entry replaced by a constant 84                | `expected 84 to be 56`, plus `expected +0 to be 28` and `expected 1082 to be 1054`                                                                    |

### `phases-dialog.tsx`

| Check                                                     | Injected fault                                                    | Observed                                                                      |
| --------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `quotes the table's own arithmetic, not a sum of its own` | `minWidth` cut back to the hand-written `952 + roles.length * 96` | `expected '…' to contain '2 phases need ≥1054px…'` and `to contain '≥1054px'` |
| `resolves the project's own role ids, not stand-ins…`     | `roles.map(role => role.id)` → `phase0`, `phase1`                 | `expected [ 'phase0', 'phase1' ] to deeply equal [ 'role-dev', 'role-qa' ]`   |

### `wbs-table.tsx`

| Check                                                    | Injected fault                                                 | Observed                                                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `changes a width without rebuilding a single cell…`      | `frameState` added to the `columns` dependency array           | `expected <body/> to be <textarea …>` — focus on the body, half-typed name gone                          |
| `declares exactly the widths the resolved layout holds…` | the `<colgroup>` given width arithmetic of its own             | `expected [ '24px', …(12) ] to deeply equal [ '24px', …(12) ]` — `not-before` 84 against 56              |
| `is the short date as text, with no editor in it`        | the `editing` branch inverted                                  | `expected '2026-06-01' to be '1 Jun'`, and **19** tests failed in that run                               |
| `gives the focus back to the cell on every way out`      | the focus-return `focusCellAt` removed                         | `expected <body/> to be <input …>`                                                                       |
| `never writes a peer's day over one being typed`         | `DateField`'s `document.activeElement` guard removed           | `expected '2026-09-09' to be '2026-08-17'`                                                               |
| `carries a row's whole number in its cell…`              | the `title` removed from the Number cell                       | `expected '' to be '020'`                                                                                |
| `shows dates once the project starts on a day…`          | `printedDay` handing back the raw `iso` as its `text`          | `expected '2026-08-06' to be '6 Aug'`                                                                    |
| `marks a row with no estimate…`                          | the `'No estimate yet'` half dropped from the End cell's title | `the given combination of arguments (null and string) is invalid for this assertion` — no `title` at all |

### `short-date.ts`

| Check                                                        | Injected fault                                                | Observed                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `prints the day the string says, for a reader west of UTC`   | `shortIsoDate` reimplemented as `new Date(iso)` + `getDate()` | `expected '31\|31 May' to be '31\|1 Jun'`, in America/Los_Angeles                               |
| `refuses anything that is not a calendar day…` (shape)       | the `parts === null` throw → `return iso`                     | `expected [Function] to throw an error`                                                         |
| `refuses anything that is not a calendar day…` (month range) | `monthNamed`'s range check removed                            | `expected function to throw an error, but it didn't` — `2026-13-01` printing `1 undefined 2026` |

The zone case runs in a **subprocess** (`bun -e` with `TZ` set), because vitest
hands each worker a `process.env` proxy and assigning `TZ` on it never reaches
the Date engine — watched: `Intl.DateTimeFormat().resolvedOptions().timeZone`
unchanged and `new Date('2026-06-01').getDate()` still 1. The subprocess asserts
`new Date('2026-06-01').getDate() === 31` first, so a `TZ` that did not take
cannot let the check pass for the wrong reason.

### `plan-cards.tsx`

| Check                                                       | Injected fault                                                  | Observed                                                   |
| ----------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| `prints a span in the very words the table's columns print` | the card's span rendered as `span.start.iso ?? span.start.text` | `expected '2026-06-01 → 2026-06-03' to be '1 Jun → 3 Jun'` |

### Chromium — `e2e/layout.spec.ts`

| Check                                                        | Injected fault                                        | Observed                                                                                            |
| ------------------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `the Number column fits its envelope`                        | `['number', 169]` → 56                                | `Expected: >= 168.59375 / Received: 56`                                                             |
| `clips a number past the envelope…`                          | `whiteSpace: 'nowrap'` removed                        | `expected true to be false` — a wrapped number overflows downwards, so there is no clip left to see |
| `opens an editor no narrower than this browser's own…`       | `DATE_EDITOR_WIDTH` → 60                              | `Expected: >= 137 / Received: 60`, and `fits every laptop width with the roles folded` with it      |
| `is as narrow as the plan lets the earliest-start column be` | `PLAN_WIDTHS`'s `not-before` entry made a constant 84 | `Expected: 56 / Received: 84`, in Chromium — the declared width and the laid-out cell both          |

### Chromium — `e2e/keyboard.spec.ts`, the things jsdom cannot perform

| Check                                                                | Injected fault                                         | Observed                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `a click opens the earliest-start editor, which a mousedown did not` | `onClick` → `onMouseDown` on the at-rest input         | `Expected: 1 / Received: 0`, **while all 314 `wbs-table.test.tsx` cases stayed green**         |
| `Escape leaves the stored day alone, blur and all`                   | the whole `event.key === 'Escape'` branch removed      | `Expected: 0 / Received: 1` — the editor still open                                            |
| `Escape puts the project start date back…`                           | `node.value = agreed.current` removed from that branch | `expected "2026-09-09" to be "2026-06-01"` — the abandoned day committed by the blur and saved |
| `saves a day picked from the native calendar…`                       | the editor's `commit` cut to `() => undefined`         | `Expected: "3 Jul" / Received: "—"`                                                            |
| `does not lose the edit to a Tab out of the date segments`           | same                                                   | `Expected: "5 Jul" / Received: "—"`                                                            |

## Two faults this change found, and neither shipped

Both are recorded in `AGENTS.md` under R5.

**A click on the earliest-start cell did nothing at all.** Opening the editor
from `onMouseDown` mounted it inside the mousedown dispatch — React flushes a
discrete update there — so the at-rest input was gone before Chromium performed
that event's **default action**, focusing the node it had hit-tested. Focusing a
detached node moves the focus to `<body>`; that blurred the editor; a blur is an
exit; the editor closed. jsdom performs no default action and could see the
handler but never the outcome, and every unit case opens the editor with Enter.
Found by counting `input[type=date]` in Chromium after a click and getting none.

**The blur suppression was a check that could not fail.** Escape had to stop the
blur it causes from committing the abandoned day, so `DateField` grew a flag the
next commit attempt would spend. Removing that flag was watched — and the browser
test **passed**: the row's editor is unmounted on the way out, so there is no
blur to suppress, and on the one field that does stay on screen (the toolbar's
project start date) the flag sat behind the `node.value = agreed.current` beside
it and was never reached. The flag is deleted. The value reset is the guarantee,
and it was watched failing against a real blur in a browser.

## Not verified

- **Task 7.2 — deploy to dev and Dany looks.** Not run. This worktree has no
  path to `h1claw`, and the two at-rest column widths, the short dates and the
  Escape that abandons an edit are Dany's screen's to judge. The e2e screenshot
  artefact (`apps/fe-01/test-results/…/table.png`, written by `leaves a picture
of the table for the eye that has to judge the widths`) is what CI leaves for
  that judgement in the meantime.
- **`bun run e2e` verbatim.** See the note above: the ports were shifted because
  an unrelated checkout held 3100/3200/4200 on this machine. The specs, the
  servers and the assertions are otherwise the repository's own.
- **Anything outside Chromium.** The layout gate is one engine by design; a date
  input's intrinsic width, its Tab behaviour and its calendar popup are all
  Chromium's answers here, and Safari's or Firefox's are not measured anywhere.
- **The `not-before` heading's abbreviation reads well.** `Not bef.` fits 56px
  and the full sentence is in its `title`; whether it reads as English at a
  glance is a judgement, not a measurement.
