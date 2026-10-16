## Why

The installed Twilight Burokrat F7 survey reports the 833-line `hover-card.tsx`
above the unchanged 800-line frontend ceiling. Pure placement arithmetic and
React measurement/rendering share the file, making the geometry depend on a
component module even when tested from fixed measurements.

## What Changes

Move the four placement functions, geometry types, and placement constants with
their JSDoc into framework-free `hover-card-placement.ts`. Preserve every existing
public geometry export through `hover-card.tsx`. Add fixed-output geometry cases
in the node test tier and component-module function identity assertions.

The parent architect approved this extraction boundary and the PM approved the
exact plan and fixtures before production edits. Both production files stay
below 800 lines.

## Non-Goals

No arithmetic, visual, measurement, width, pointer, portal or policy changes.
No glossary or ADR additions, certification, WBS100 closure or deployment.

## Constraints

Start at wave 9 aggregate `741840881376327bca23140cb8367c7528818dca` (tree
`168c2a67ef6a68da88bf318630bdeb4d671f65b5`). Preserve the whole-row height
correction and #536 portalled z-index. Run focused tests with one worker on the
RAM-constrained laptop. Reserve full surveys, browser proof and the gate for a
serial hosted lane. The installed evaluator and unchanged policy must compare
committed revisions, remove exactly the hover-card finding, preserve all
unrelated survey outcomes, and reject a committed restored-oversized-file fault.
WBS100 remains `blocked_by_proxy` until its independent obligations are met.

## Capabilities

### New Capabilities

- `hover-card-placement-boundary`: pure placement geometry with compatible component exports.

### Modified Capabilities

None.

## Domain Terms

None. Existing geometry names retain their meaning.

## Decisions Recorded

None. This reversible extraction applies the accepted frontend file ceiling.

## Impact

WBS frontend hover-card placement, its owning suites, node-tier registration and
this change packet. No dependency, migration, contract or deployment changes.
