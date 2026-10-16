## Why

`use-plan-layout.tsx` is 957 physical lines at the exact public base and exceeds the selected F7 ceiling of 800. Column resizing has a cohesive boundary that can reduce source size while preserving its gesture and public exports. This reconstruction recovers work lost during laptop temporary-directory cleanup.

## What Changes

Move column resize arithmetic, callback contract, component and existing column callback factory with their documentation into `column-resize.tsx`. Keep the existing exports from `use-plan-layout.tsx` and both files below 800 lines.

## Non-Goals

Gantt resizing, layout persistence behavior, plan export, width rules, dependencies and user behavior changes.

## Constraints

Preserve pointer capture, initial width, pointer identity, release-only commit, cancellation, measured Name fallback, clamps, missing-header refusal, accessibility, styles and component identity. Do not delete or compress documentation. Prior test results are historical evidence; reconstructing source does not reproduce those results. No certification or WBS100 closure is claimed.

## Capabilities

### New Capabilities

- `wbs-column-resize-size-boundary`: A bounded frontend source extraction with stable gesture behavior and exports.

### Modified Capabilities

None.

## Domain Terms

None; the mechanical extraction introduces no domain terms. The PM approved the exact scope and callback factory relocation during the original work.

## Decisions Recorded

None; the extraction is reversible and mechanically obvious. Optional design.md is omitted.

## Impact

WBS frontend resizing source, mounted regression tests and OpenSpec recovery evidence; no API or dependency changes.
