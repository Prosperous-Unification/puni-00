## Why

The RunStore accepts opaque JavaScript IDs that SQLite can acknowledge and then fail
to read faithfully. Recovery cannot rely on a successful save unless every accepted
identity survives persistence. New workflow runs also need a single generated identity
that remains stable when the same creation is retried or recovered.

## What Changes

- New workflow-run construction generates one random UUID, with an immutable initial
  record reused for storage retries. Store ports continue to accept existing opaque IDs.
- SQLite retains every admitted raw identity exactly through private JSON-string keys.
- An explicit preserving format4-to-format5 transition keeps prior tables and payload
  bytes, fences old writers, and supports downgrade only before new-format semantic use.

## Non-Goals

No automatic repair of corrupt stores, operator-store migration, architectural main merge,
production deployment, new coordinator CLI, credential work or second database choice.
This does not complete the remaining recovery, adapters or S7a foundation.

## Constraints

Bun1.4.4 and Nx; preserve the complete accepted ID domain and every0001–0004
forward/down byte. Ordinary open never migrates. New migrations are additive and ship
down.sql. Preserve ownership, history, payload identity and semantic ordering. No default
on corrupt trusted state; prove new checks with production-path negative controls.

## Capabilities

### New Capabilities

- `workflow-identities`: stable workflow-run construction and exact private persistence.

### Modified Capabilities

None.

## Domain Terms

Workflow run.

## Decisions Recorded

[ADR0065](../../../docs/adr/0065-workflow-ids-use-json-private-keys.md).

## Impact

Twilight Dash runs, its SQLite adapter, explicit store transitions and shared conformance
cases. Existing WBS contracts and separately owned tenant/machine integration stay intact.
