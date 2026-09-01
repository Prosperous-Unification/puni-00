<!--
Commands, their output, and the failure-proof table R5 asks for.
-->

## Commands

Run on this macOS host, on `feat/hint-press-cancels`, with all three of this
branch's changes in the tree at once — they touch the same files (`wbs-table.tsx`,
`CONTEXT.md`) and were gated together rather than pretending to a split the
working tree never had.

| Command                                                                                 | Result                                            |
| --------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `bunx nx format:check --all`                                                            | **clean** (after `nx format:write` on five files) |
| `bunx nx run-many -t typecheck`                                                         | **exit 0**, 23 projects                           |
| `bunx nx run-many -t lint`                                                              | **exit 0**, 23 projects, 1 pre-existing warning   |
| `bunx nx test fe-01 --skip-nx-cache`                                                    | **2036 passed / 65 files**                        |
| `CI=1 E2E_PORT_SHIFT=500 bunx playwright test --config=apps/fe-01/playwright.config.ts` | **281 passed, 1 skipped**, 9.0m                   |
| `bunx openspec validate --all --json`                                                   | **30 passed, 0 failed**                           |

The lint warning is `wbs-table.tsx`'s `columns` memo — `LLM_README.md`'s landmine
#1, pre-existing and named the same way in `tool-hints-wait/verify.md`.

`bin/h2puni-gate.sh` was **not run**: it exits 127 on this macOS host. The
commands above were run directly.

## Failure proof (R5)

| Check                                                                               | Fault injected                                                     | Observed failure                                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `closes the list on a second press` (`reference-set-field.test.tsx`)                | the `aria-expanded` branch removed from the `+`'s `onClick`        | `expected 'true' to be 'false'`                                  |
| `closes the deps picker on a second press of its add button` (`wbs-table.test.tsx`) | the `picker !== null` branch removed from the deps `+`'s `onClick` | `expected <input …(10)></input> not to be <input …(10)></input>` |

## A check that could not fail, and it was mine

**It did not ship.** The deps case first asked whether any `option` was on
screen: `expect(screen.getAllByRole('option').length).toBeGreaterThan(0)` before
the second press and `toHaveLength(0)` after. Both halves passed with the toggle
branch removed, and the reason is not subtle once it is measured — the plan page
carries seven `<option>` elements of its own, in the toolbar's `<select>`s. The
probe printed them:

```
PROBE after second click: active= BODY options= 7
  optionText= outline|step|assignee|PERT|optimistic|realistic|pessimistic
```

`active= BODY` is the toggle working. The seven options are the page. Scoped to
`ul[role="listbox"]`, which is this cell's own list and nothing else's, the
injected fault then failed at the assertion it belongs to.

**A role that the platform's own controls also use is not a locator for your
feature.**

## One case with no negative of its own, said out loud

`opens it again on the press after that` stays green with the toggle branch
removed — a `+` that always opens satisfies it. The fault it is really about is a
toggle that latches closed, which is not a line anybody deletes by accident. The
test is kept for the round trip being closed at all, and its comment says it has
no proof rather than dressing one up.

## A shipped behaviour this reverses

`deps-cell.spec.ts`'s `keeps a half-typed search when the add button is pressed`
asserted that pressing the `+` with a search half-typed kept the list, the value
and the focus. It was written against a real fault — the button taking the focus,
the box blurring, and the blur dropping what was typed, which is a control that
means "search" eating the search.

A `+` that toggles closes there, and closing discards the half-typed search
exactly as Escape and a click outside always have. The case is rewritten rather
than deleted, and it now also asserts the half the old one was really protecting:
the button holds the keyboard on neither press. Dany was told the trade-off in
the same breath as the change.
