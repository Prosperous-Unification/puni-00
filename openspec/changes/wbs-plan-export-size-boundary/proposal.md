## Why

The installed Twilight Burokrat F7 survey reports `plan-export.ts` at 994 lines,
above the unchanged 800-line frontend ceiling. Its export value model and its
writers share one file despite having separate responsibilities.

## What Changes

Move `ExportTrio`, `ExportRow`, `ExportSlice`, `FilteredScope`, `NamedEntry` and
`PlanExport`, with their JSDoc, into scoped, framework-free
`plan-export-model.ts`. Preserve public type imports through reexports from
`plan-export.ts`. Both production files remain below 800 lines.

The parent architect approved this bounded extraction before dispatch. The model
is a cohesive description of the self-contained document consumed by the writers.

## Non-Goals

No serializer, formatting, escaping, cache, filename, UI, backend or policy change.
No policy exemption, certification, WBS100 closure, publication or deployment.

## Constraints

Preserve output bytes and existing callers. Run owning suites, frontend typecheck
and lint, focused format and OpenSpec validation. Evaluate the exact committed
candidate with the trusted installed F7 evaluator and unchanged survey policy.
Restore the oversized production file in a disposable committed candidate and
watch the selected-finding assertion fail. Record limits of the comparison.
The parent reserves the full host gate for the reviewed immutable commit.

## Capabilities

### New Capabilities

- `plan-export-boundary`: a bounded export value model and unchanged writers.

### Modified Capabilities

None.

## Domain Terms

None. The existing export types retain their names and meaning.

## Decisions Recorded

None. The extraction applies the accepted file ceiling and is reversible.

## Impact

WBS frontend export model and writers, regression tests and this change packet.
No dependency, contract, migration or deployment changes.
