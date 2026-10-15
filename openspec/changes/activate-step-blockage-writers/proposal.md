## Why

StepBlockage writes are durably disabled, and no production activation command exists. An attended activation needs an exact, durable receipt so interruption cannot be mistaken for an unchanged database or authorize an incompatible rollback.

## What Changes

Add a versioned receipt and an image-local inspect/activate boundary. Enabling and storing its exact receipt commit atomically. An identical retry returns that receipt; a different attempt refuses. The receipt migration refuses rollback while enabled or while any receipt remains.

## Non-Goals

Live activation, automatic disable, stopped-writer recovery, and activation through HTTP or internal forwarding. This packet's first slice does not authorize host activation before the host and compatibility slices land.

## Constraints

Preserve the existing DISABLED startup default and exact writer triggers. Migrations remain additive. Activation requires a previously deployed capable release and a capable rollback image. Candidate and rollback capabilities must be observed independently before a host activation attempt. Preserve all interruption evidence and exact database/container identities on uncertainty.

## Capabilities

### New Capabilities

- `step-blockage-writer-activation`: Durable, exact receipt for the attended admission transition.

### Modified Capabilities

None.

## Domain Terms

Step blockage activation receipt.

## Decisions Recorded

None; implements the reviewed architecture handoff.

## Impact

WBS SQLite adapter, backend image CLI, Compose and Kubernetes compatibility admission, deploy runbook.
