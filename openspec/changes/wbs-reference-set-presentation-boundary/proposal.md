## Why

The 1125-line reference-set field exceeds the unchanged 800-line F7 frontend
ceiling. Its contracts and shared chip presentation are used by the four
reference columns and the dependency column, while the strip and phone sheet
own editing state and writes.

## What Changes

Extract contracts into adjacent `reference-set-contract.ts` and shared chip
presentation into `reference-set-presentation.tsx`. Preserve original exports
through `reference-set-field.tsx`, retaining complete strip and sheet component
declarations. Every production file stays below 800 lines. The PM assigned this
bounded extraction and approved the existing contracts as its boundary.

## Non-Goals

No behavior, inheritance, wording, styles, write projection, API or policy
changes. No publication, WBS mutation, certification, deployment or WBS100 closure.

## Constraints

Base is reviewed directory successor `8ceba735235b431a237f3ee3aacc06053d4bbabf`;
work occurs in a new isolated clone. Preserve the existing unified reference
interaction and ADR 0008/0009 behavior. Observe requested production faults and
restore before the final passing run. Run memory intensive checks serially under
the PM's laptop limit. Exact installed full F7 remains pending hosted proof after
the preceding evaluator attempt exceeded the 900 MiB watchdog.

## Capabilities

### New Capabilities

- `reference-set-presentation-boundary`: compatible reference field extraction.

### Modified Capabilities

None.

## Domain Terms

None. Existing reference, inherited member and type conflict terms retain their
meaning.

## Decisions Recorded

None. This reversible extraction applies the existing size ceiling.

## Impact

Reference-set field, two adjacent owners and this change packet. No dependency
or migration changes. WBS100 remains `blocked_by_proxy`.
