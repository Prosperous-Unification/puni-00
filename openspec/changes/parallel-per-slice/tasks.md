<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.
-->

## 1. `commitRename`'s dropped draft — investigated, refuted

- [x] 1.1 Read `directory-page.tsx`'s current `forgetDraft`/`forgetNameDraft`
      and `teams-dialog.tsx`'s own `forget`, and `db73f54`'s diff (the commit
      that moved the size box). Confirmed: one draft (`renamed`) is all
      `directory-page.tsx` holds since #58; `forgetSizeDraft` and its call
      sites are gone, not merely renamed. No guard to write a red for — there
      is nothing left to collapse.

## 2. The `∥` cell reads per slice

- [x] 2.1 `wbs-table.tsx`'s `in-parallel` cell: `everySliceNamed` replaces the
      `doesEveryPhase`-only reading, checking each of `row.estimates`' roles
      against its own assignee (falling back to `doesEveryPhase` only where
      there are no estimated roles to check, matching be-01's `order.length
      === 0`). Test: `says a number is not applied where two different people
      are named on two different roles` — the case the old reading could not
      see, watched red first (reverting to `doesEveryPhase !== null` alone
      fails it). The existing one-person test is left standing as the
      single-role case the fallback still covers.

## 3. The page

- [x] 3.1 `docs/capacity.md`'s "still open" paragraph on the `∥` cell
      corrected: the table's reading now matches the chart's; the cards'
      does not and stays named as open.

## 4. The record

- [x] 4.1 `proposal.md`, this file, the spec delta, `verify.md`. No
      `design.md`, no citation table — PoC-mode contract, 2026-08-14.
