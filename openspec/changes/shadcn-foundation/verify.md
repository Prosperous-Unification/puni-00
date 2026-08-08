# F `shadcn-foundation` — verify

Every command below was run on 2026-08-09 on Dany's Mac (darwin arm64, bun
1.3.14, chromium from the Playwright cache), from the worktree at
`.claude/worktrees/agent-a537eaf384af84880` on branch
`change/shadcn-foundation`, based on `change/tailwind-spike`.

## What landed

| file                                        | what                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `package.json` / `bun.lock`                 | `@radix-ui/react-dialog@1.1.23`                                                                                |
| `apps/fe-01/components.json`                | the shadcn config for a Vite + Tailwind-v4 stack, `cssVariables`, slate                                        |
| `apps/fe-01/src/styles.css`                 | tokens (`:root`, `.dark`, `@theme inline`) and the scoped reset                                                |
| `src/components/ui/button.tsx`              | re-vendored on `cva` and the tokens                                                                            |
| `src/components/ui/{input,label,card}.tsx`  | new                                                                                                            |
| `src/components/ui/modal.tsx`               | dialog **and** sheet on one Radix primitive, one keyboard rule                                                 |
| `src/components/ui/page-shortcuts.ts`       | `usePageShortcutsSuspended` — F.3, the whole rule                                                              |
| `src/components/ui/page-shortcuts.test.tsx` | 5 tests, on a real `WbsTable` with a spying api                                                                |
| `src/components/wbs/keyboard-bindings.ts`   | `opensCheatSheet` moved in; `isPageShortcut` written beside it                                                 |
| `src/components/wbs/wbs-table.tsx`          | `data-grid` on the `<table>`; the toolbar and three banners restyled                                           |
| the chrome                                  | `app.tsx`, `auth-form.tsx`, `presence-panel.tsx`, `project-page.tsx`, `toasts.tsx`, `keyboard-cheat-sheet.tsx` |
| `src/styles.test.ts`                        | three assertions reworked into four                                                                            |
| `e2e/tailwind.spec.ts`                      | two assertions reworked, two added on the grid side                                                            |

`e2e/layout.spec.ts` and `e2e/keyboard.spec.ts` are untouched.

## The reworked assertions, and why that is sound

`T` wrote five checks whose subject was "**there is no reset**", because in `T`
there was none and the only reset on offer was Tailwind's document-wide
preflight. `F` ships a reset deliberately. Three unit assertions and two browser
assertions could not survive that literally, so each was moved rather than
dropped:

| was                                                        | is now                                                                          | why the fault is still covered                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `styles.test.ts` › brings no box-sizing reset              | › brings none of Tailwind's own preflight (`text-size-adjust`)                  | `border-box` is now this app's own; `text-size-adjust` is preflight's and appears nowhere else, so it still discriminates. |
| `styles.test.ts` › leaves form controls the browser's font | › **scopes every rule in its base layer away from the grid**                    | Strictly stronger: it reads every selector the layer emits, not one declaration.                                           |
| `styles.test.ts` › base layer declared and **empty**       | › writes its reset into the base layer, + gives it less weight than any utility | The empty slot existed for this. What still matters is that it lands _before_ the utilities, and that is now asserted.     |
| `tailwind.spec.ts` › heading keeps its user-agent margin   | › takes the user agent's margin off a chrome heading                            | Same measurement, read for the state that is now correct. It is the chrome side of the line.                               |
| `tailwind.spec.ts` › form controls keep the platform font  | › gives a chrome control the page's own font, **plus two new grid-side tests**  | The fault — a reset reaching the table — moved to where it is now visible: a dependency chip's font family and text size.  |

The chip is the probe because almost everything else in the grid carries an
inline style that outranks every layer: a `<td>` is `border-box` by
`table-frame.ts`'s own `CELL`, the ⋯ button carries `font: inherit` of its own,
and the date field carries both. `wbs-table.tsx:3106`'s chip has no `style` prop
at all. Two probes were written and discarded before it, both watched being
vacuous — see the table below.

## Failure-proof table (R5)

Every check has been watched failing with the thing it guards broken, one fault
at a time, each reverted before the next.

| check                                                         | fault injected                                                      | observed                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `styles.test.ts` › scopes every rule away from the grid       | the guard struck off `button` in `styles.css`                       | 1 failed — `expected [ 'button' ] to deeply equal []`                                            |
| `styles.test.ts` › scopes every rule away from the grid       | the two imports replaced by `@import 'tailwindcss'`                 | 1 failed — `expected [ '*', ':after', ':before', …(74) ] to deeply equal []`                     |
| `styles.test.ts` › brings none of Tailwind's own preflight    | same fault                                                          | same run — `expected '@layer properties{@supports (((-webki…' not to contain 'text-size-adjust'` |
| `styles.test.ts` › gives its reset less weight than a utility | `@layer theme, base, components, utilities;` reordered, `base` last | 1 failed — `expected 12748 to be less than 1693`                                                 |
| `styles.test.ts` › writes its reset into the base layer       | the `@layer base` block deleted                                     | 1 failed — `expected 0 to be greater than 0`                                                     |
| `page-shortcuts` › `?` does not open the cheat sheet          | `window.addEventListener('keydown', swallow, true)` commented out   | 4 failed — `expected true to be false`                                                           |
| `page-shortcuts` › Cmd+Z undoes nothing behind the dialog     | same fault                                                          | same run — `expected "spy" to not be called at all, but actually been called 1 times`            |
| `page-shortcuts` › Ctrl+N creates nothing behind the dialog   | same fault                                                          | same run — `expected "spy" to not be called at all, but actually been called 1 times`            |
| `page-shortcuts` › the cheat sheet holds them back too        | same fault                                                          | same run — `expected "spy" to not be called at all, but actually been called 1 times`            |
| `page-shortcuts` › leaves the dialog's own box its keystrokes | the `isPageShortcut` guard dropped, so the rule swallows everything | 1 failed — `expected [] to deeply equal [ 'z', '?' ]`                                            |
| `tailwind.spec.ts` › grid keeps the platform's text size      | **FAULT G** — the guard struck from every rule in `@layer base`     | 2 failed, 33 passed — `Expected: not "16px"`                                                     |
| `tailwind.spec.ts` › grid keeps the platform's font           | same fault                                                          | same run — `Expected: not "sans-serif"`                                                          |

### Two checks that were watched being vacuous, and fixed

These are recorded because R5 is about the checks that _cannot_ fail, and both
of these could not until they were rewritten.

1. **`scopes every rule away from the grid`, first form.** It tested each
   _rule's selector list_ against the guard pattern. With the guard struck off
   `button` — leaving `button, input:not(…), select:not(…), textarea:not(…)` —
   **it passed**, because the list still contained a guard somewhere. Split on
   top-level commas (paren-depth aware, since the guard has a comma of its own)
   and re-watched: `expected [ 'button' ] to deeply equal []`.

2. **`leaves a cell inside the grid the box model the browser gives it`.** It
   asserted `content-box` on a `<td>` and then on a chip. Both are already
   `border-box` — the `<td>` by `CELL`'s inline style, the chip because
   Chromium's own user agent stylesheet gives every `<button>` `border-box`. It
   failed against a _correct_ implementation, and the inverted version would
   have passed against a broken one. Replaced by the chip's **text size**, which
   `font: inherit` moves and nothing else sets.

### What FAULT G says about the layout gate

With the guard struck from every rule, exactly two tests failed — both new, both
in `tailwind.spec.ts` — and **all 22 of `layout.spec.ts` passed in the same
run**, as did all 8 of `keyboard.spec.ts`. That is the tailwind spike's finding
reproduced against a real reset rather than against preflight: the geometry gate
is blind to this fault, and will stay blind until the first `<td>` is styled by
a class.

## The one thing the guard could not stop, and what was done about it

The reset stops at `[data-grid]`. **Inheritance does not.** The cells carry
`font: inherit` inline, so the face `<main>` is given is the face the table is
laid out in.

Shipping shadcn's `--font-sans: ui-sans-serif, system-ui, …` turned the browser
gate red, and this is the run:

```
  1) [chromium] › apps/fe-01/e2e/layout.spec.ts:736:3 › fits every laptop width with the roles folded

    Error: 1280×800, both roles folded: the earliest-start field is 138px where
    this browser wants 143px, so its value is cut off

    Expected: >= 142
    Received:    138
```

Three of `layout.spec.ts`'s width-equation tests failed together. The token now
says `sans-serif` — the family `table-frame.ts`'s `not-before: 146` was measured
in — and it stays that way until a change moves the face **and** re-measures the
column. That is `H header-fits-a-row`'s. Recorded in `styles.css` on the token
itself.

A second, smaller one of the same kind: the registry's `Button` assumes preflight
has already stripped every `<button>`, and this app's reset deliberately has not.
The `link` variant rendered inside the platform's grey button box on the
signed-out page (seen, 2026-08-09). `border-0 bg-transparent` moved into the
component's base class rather than into the reset, so no chrome button a later
change has not reached yet is flattened to bare text.

## Gate

```
$ bunx nx format:check --all
(no output, exit 0)

$ bunx nx run-many -t test lint typecheck build --parallel=2
 NX   Successfully ran targets test, lint, typecheck, build for 21 projects

$ bunx openspec validate --all --json
40 items, 0 invalid   (shadcn-foundation: valid, no issues)
```

`fe-01:test` is **623 tests across 27 files** — 617 before this change, plus 5
in `page-shortcuts.test.tsx` and one net new in `styles.test.ts`.

Browser gate — **35 passed**, twice, cleanly:

```
  35 passed (38.6s)
```

22 `layout.spec.ts` (untouched), 8 `keyboard.spec.ts` (untouched), 5
`tailwind.spec.ts`.

One flake was seen once and did not recur: `keyboard.spec.ts › Cmd+Enter saves
the cell before it creates the row it lands in`, on `waiting for
getByLabel('Name of 010')`. Re-run alone immediately after: 8 passed; the full
suite green twice after that. This is the same pre-existing seed-helper flake
the tailwind spike recorded on `main`.

## How the browser gate was run, and why it is not the plain command

`playwright.config.ts` hard-codes 3100/3200/4200 and reuses a running stack when
`CI` is unset. The canonical checkout's `bun run dev` owns those ports and serves
a **different working tree**, so `bun run e2e` from this worktree would have
measured that tree and reported it as this branch's result.

Every run above was made with `CI=1` against a locally patched copy of the config
on 3101/3201/4201, with matching `.env` files (gitignored). The patch was
reverted with `git checkout --` before committing; `playwright.config.ts` is
byte-identical to `main`. On a machine with no dev stack running, `bun run e2e`
works unmodified.

## Checks NOT run

- **The container build.** `T` flagged it as the thing most likely to bite and
  it has still not been run: `apps/fe-01/Dockerfile` builds on
  `oven/bun:1.3.14-alpine` for `linux/amd64`, and Tailwind v4's two native N-API
  modules have never been _executed_ there. This change adds no native module —
  `@radix-ui/react-dialog` is pure JS — so the risk is unchanged, not larger.
  The Docker daemon was not running on this machine and was not started.
- **The h2puni fit matrix.** These runs are on Dany's Mac: the same chromium and
  the same spec, a different machine.
- **Dev deploy.** `bin/dev-deploy.sh` restarts on a changed lockfile; this change
  has one. Not exercised.
- **Dark mode.** The variables are defined and nothing sets `dark`, so no
  rendering of the dark palette has been seen by anything. That is the stated
  non-goal, and it means the dark values are unreviewed for contrast.
- **A modal in a real browser.** `modal.tsx` is exercised by jsdom only —
  nothing in the app opens one yet, so there is no page for Playwright to open.
  `P phases-ui` is the first change that mounts one, and it is where the focus
  trap, the dismissal and the overlay get a browser.
