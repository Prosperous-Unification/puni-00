## Why

The WBS cell-card store imports React to deliver its subscription hook. The installed
Twilight Burokrat survey reports that production module as the remaining F1 finding,
so its state cannot satisfy the existing plain TypeScript boundary.

## What Changes

Separate the React subscription hook from the cell-card store and update its delivery
callers. Hover cards retain their timing, pointer precedence, keyboard restoration,
boolean subscription snapshots and server snapshot behavior.

The parent architect approved this bounded separation before dispatch. Inspection
confirms the store owns all transitions and the hook only selects a boolean snapshot.

## Non-Goals

No new state abstraction, timing changes, service reclassification, policy changes,
selector changes, other WBS debt, UI review work, publication or deployment.

## Constraints

Preserve the original store tests. Run focused delivery tests, frontend lint and
typecheck, the existing F1 architecture fixture, and OpenSpec validation. Prove the
installed validator detects a restored React import in the actual production store.
The parent reserves the full host gate for the reviewed immutable commit.

## Capabilities

### New Capabilities

- `cell-card-store-boundary`: framework-free hover card state with React delivery.

### Modified Capabilities

None.

## Domain Terms

None. Hover card and Takeover already have definitions in CONTEXT.md.

## Decisions Recorded

None. This separation applies the accepted F1 direction and is reversible.

## Impact

WBS frontend cell-card store, its delivery hook and its six hook callers. No dependency,
backend, contract, migration or deploy changes.
