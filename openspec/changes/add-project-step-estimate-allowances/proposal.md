## Why

Planners need an estimate allowance that applies consistently to a project step. Today each work item's O/R/P estimate becomes its charged days without that policy, so contingency must be edited into every estimate and its origin becomes invisible.

## What Changes

- Configure a 0–1000% allowance, to two decimal places, on each project step in Project settings → Steps. An omitted value on creation means 0%.
- Preserve raw O/R/P values. Apply the project-step allowance to each estimated leaf before per-step rounding, then use charged effort in totals and both schedulers. Unknown estimates remain unknown and take zero schedule time.
- Show base, percentage, pre-rounding and charged figures; carry the setting through API, undo, copies, import/export, snapshots and MCP.

## Non-Goals

No per-work-item override, derived step estimate, percentage-complete tracking or change to actual recorded work.

## Constraints

Parents sum adjusted leaves without a second allowance. An additive migration must ship with a matching down.sql. Compatible readers must precede nonzero writes; rollback cannot silently discard nonzero policy. Existing unestimated slices have zero scheduling duration even when the Gantt draws a placeholder.

## Capabilities

### Modified Capabilities

- wbs-domain: project-step policy and charged roll-ups.
- wbs-estimate-cell: base and charged figures remain distinguishable.
- plan-command-registry: undoable step-policy update.
- plan-import: versioned import/export of step allowance.
- live-plan-snapshot: frozen step policy.
- scheduler-optimization: adjusted effort parity.

## Domain Terms

Project-step allowance is a percentage applied to each estimate for that step. Charged estimate is the rounded, adjusted effort.

## Decisions Recorded

No ADR; the product owner chose the project-step setting.

## Impact

Step settings, contracts, storage, estimate and schedule derivation, command journal, archival formats and tests. Additive step-column migration and paired rollback.
