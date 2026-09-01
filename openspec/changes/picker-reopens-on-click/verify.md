<!--
Commands, their output, and the failure-proof table R5 asks for.
-->

## Commands

Run on this macOS host, in `~/wd/personal/wbs-tool/wbs-tool-v1`, on
`change/picker-reopens-on-click` at `13ee3d48` + the working tree.

| Command                                                                             | Result                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------- |
| `bunx nx test fe-01`                                                                | **2003 passed / 64 files**, 162.98s               |
| `bunx nx lint fe-01`                                                                | **0 errors**, 1 warning (see below)               |
| `bunx nx typecheck fe-01`                                                           | **exit 0** — both `tsc --build --force`           |
| `E2E_PORT_SHIFT=1900 bunx playwright test --config apps/fe-01/playwright.config.ts` | **271 passed / 1 skipped**, 7.2m, exit 0          |
| `bunx nx format:check --all`                                                        | **clean** (after `prettier --write` on this file) |
| `bunx openspec validate picker-reopens-on-click --json`                             | **1 item, 1 passed, 0 failed**                    |

The one lint warning is `wbs-table.tsx:4469` `react-hooks/exhaustive-deps` on
the `columns` memo. It is pre-existing, deliberate, and is `LLM_README.md`'s
landmine #1: the two names it wants removed are what keep that memo from
depending on state a hover writes, and taking them out remounts every cell on
the first pointer move.

### Not run, and why

- `bin/h2puni-gate.sh` — exits **127** on this macOS host, as it has all
  session. The host-wide heavy-work lock it acquires does not exist here, so
  the commands above were run directly and one at a time.
- `tool-bootstrap:test` — times out on this host, pre-existing and unrelated.

## Failure proof (R5)

Every check below was watched failing with the named fault injected, and the
`Proof:` comments in the code and the specs were written **from that output**
rather than from what the output was expected to be.

| Check                                                                  | Where                         | Fault injected                                        | Observed failure                                                                 |
| ---------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `offers the rest of the directory when the add field is clicked again` | `e2e/reference-cells.spec.ts` | the box's `onClick` deleted (i.e. `main`'s component) | `clicking the focused add field offered nothing · Expected: 2 · Received: 0`     |
| the same case's `+` half                                               | `e2e/reference-cells.spec.ts` | the `+`'s `click()` dropped, its `focus()` kept       | `the + offered nothing on a focused box · Expected: 2 · Received: 0`             |
| `opens the list again when the closed box is clicked`                  | `creatable-picker.test.tsx`   | the box's `onClick` deleted                           | `Unable to find an accessible element with the role "option"`                    |
| `leaves a half-typed search alone when the open box is clicked`        | `creatable-picker.test.tsx`   | the `typed !== null` guard deleted                    | `expected [ 'Platform', …(2) ] to deeply equal [ 'QA infra', 'Add “qa”', …(1) ]` |

## Three oracles that were measuring the wrong thing

All three were found by running the **whole** browser gate rather than the new
case in it, and all three are written up in `tasks.md` §3. In short:

1. `getByRole('option')` counted the toolbar's two native `<select>`s — seven
   `<option>` elements that are in the document at all times. `expect.poll ·
Expected: 0 · Received: 7` against a closed list with nothing wrong. Scoped
   to `[data-picker-list] [role="option"]`.
2. The page-wide `[data-reference-chip=…]` wait matched row **010**'s chip,
   which `seed` puts there, and returned before row 020's write had left the
   browser. Passed alone; failed at case **252 of 270** on `Expected: 2 ·
Received: 3`. Scoped to `cellOf(page, 'Tags for 020')`.
3. A literal count of what the picker offers is not a claim about this code:
   the directory is **global**, and `mobile.spec.ts` leaves `mobile e2e tag` in
   it. Same case, same numbers, fix working perfectly. Open-ness is `> 0` now
   — watched going to `0` with the fix removed — and membership is asserted by
   name.

## The bug, measured before anything was changed

In Chromium, on `main`'s component: `clicking the focused add field offered
nothing · Expected: 2 · Received: 0`. The cause is three correct facts meeting
— the list opens from `onFocus`, a take closes it, and a take deliberately does
not move the focus — so after adding a value the box holds the focus with no
list under it, and a click on an already-focused node fires no focus event.
`proposal.md` has the whole of it.

## The one red that was not one

An earlier whole-gate run on this same tree reported **270 passed / 1 failed**,
and the failure was `hover-cards.spec.ts:686` `the tint moves the same way on
both surfaces, in both palettes` — which took **26.9 minutes on its own**
against a whole-suite normal of ~7m. That is the capacity-bound signature this
host has shown all session, not a fault in a change that touches no row tint.
The clean run recorded above settles it: **271 passed in 7.2m**, that case
included.
