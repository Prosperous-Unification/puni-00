# Design — project-step estimate allowances

## Policy and arithmetic

Project settings → Steps (`steps-panel.tsx`) edits one allowance on each `step`. The existing add and patch step endpoints in `step-shapes.ts` gain `allowancePercent`; create omitting it explicitly means zero, while current responses always include it. Accept finite 0–1000 inclusive, at most two decimal places; reject out-of-range, malformed and overflow-producing values at the request/import boundary. Store integer hundredths of a percent (`allowance_bps`, 0–100000), avoiding floating storage drift. No estimate row stores an override.

For an estimated leaf slice, `base = combine(o,r,p, project method)`, `beforeRounding = base × (1 + allowancePercent / 100)`, and `chargedDays = projectRound(beforeRounding)`. Check derived values are finite and within schedule bounds. Sum charged slices for a work item; sum descendant leaf charges for a parent without reapplying the policy. Null O/R/P remains null and retains **zero scheduling duration** under `unestimated-steps-take-no-schedule-time`; explicit zero remains zero. Both Fast and optimized request building consume charged effort at their shared slice-construction seam, then resource width converts effort into elapsed duration. Actuals and progress stay unchanged.

The step heading shows `QA +30%`. The estimate detail shows Base estimate, Allowance, Before rounding and Charged estimate; main totals and dates use charged days. Keep O/R/P editable and visible. A project setting edit invalidates cached optimization and broadcasts a refresh.

## Persistence, history and transport

Implement one additive `migration.sql` adding `step.allowance_bps INTEGER NOT NULL DEFAULT 0` with a range/integer check; ship its matching `down.sql` and migration rollback proof. Do not write SQL in this packet. The current `StepService` says step changes are not journalled; add a journalled allowance update through the same service used by HTTP, generated MCP tools and settings. One committed edit is one undo. Restore the previous policy; refuse stale undo after a conflicting edit or deletion. Copy steps with allowances on whole-project copy. First-child hand-down and subtree duplication copy **base estimates**, then destination project-step policy applies once.

Version export/import and snapshot records deliberately. Legacy import maps absent allowance to zero only in its explicit legacy converter; the new format requires a valid field. Export always includes it. A saved snapshot retains captured step policy when the live project later changes. Coordinate format version allocation with the typed-dependency packets so parallel work cannot reuse a version number with different shapes. MCP exposes the updated step contract and the same authorization and validation as HTTP.

Deploy compatible readers before nonzero writes. An old binary may insert default zero, but would miscalculate a nonzero policy. Rollback of code or the column must refuse while nonzero settings exist unless an explicit operator-approved conversion preserves their meaning; `down.sql` must not silently erase that meaning. Migration lint and rollback must run against the paired scripts.
