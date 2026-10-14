## Why

A heartbeat already in flight can race terminal Lease parking after rollback failure. Parking can conflict with renewal or be followed by a renewal that removes its annotation, weakening the durable fence requiring operator recovery.

## What Changes

Terminal parking stops heartbeats and waits for pending renewals. A failed pending renewal propagates as LeaseLostError before parking. Successful parking retains the terminal phase annotation after the coordinator exits.

## Non-Goals

No deployment, recovery-policy changes, Lease format changes, adapter refactoring, or live lab actions.

## Constraints

Preserve the existing serialized renewal queue, bounded kubectl calls, terminal journal phase, write fence, and Flux suspension. Reproduce the race deterministically through executeRelease and watch each safety guard fail when removed. The delegated repair is limited to candidate 9791a485b42cf4c664a330f58c64343974abfcfd; full gate and integration remain with the parent.

## Capabilities

### New Capabilities

- `release-lease-parking`: Terminal parking orders heartbeat shutdown, pending renewal completion, and ownership failure propagation.

### Modified Capabilities

None.

## Domain Terms

None; existing release phases and Lease vocabulary suffice.

## Decisions Recorded

None; the repair uses the existing queue and reversible local ordering.

## Impact

WBS k3s release coordinator and its executor tests in tools/tool-deploy.
