## Why

Temporary checkouts, dependency trees and containers survive the work that created them.
Releasing a WBS claim currently frees its logical occupancy; it proves nothing about those
resources. Operators cannot trace which execution still owns them, why cleanup stopped, or
whether a reported release actually made capacity available.

## What Changes

Make resource cleanup a mandatory settlement step for managed executions. Dash registers
resource uses before creation, keeps reservations charged through cleanup, verifies each
resource's release, and publishes durable release history to WBS. WBS shows the work outcome
and cleanup state separately, with retained resources, blockers, owners and evidence.

Cleanup runs after success, failure, cancellation and loss of ownership, and resumes after
controller restart. Returning a reusable resource, transferring retained ownership and
destroying a disposable resource have distinct records. Retention never counts as release
of physical capacity.

## Non-Goals

- Claiming provider coverage before the corresponding implementation proofs pass.
- Changing schedule calculations, WBS claim occupancy, or the meaning of step progress. (superseded for a resource with a directory capacity by `wbs-shared-occupancy` design S9: its claims count across the organization and its schedule pool is clamped).
- Treating a claim expiry, process exit or directory age as proof of disk release.
- Deleting unregistered resources, a laptop-wide janitor, or claiming unmanaged agent
  commands are constrained.
- A new runtime authority, provider adapters for every resource kind, or monetary refunds.

## Constraints

- Reuse Dash's reservation and settlement authority; WBS holds a read projection and
  authenticated requests, not a competing capacity ledger. A directory capacity
  (`wbs-shared-occupancy` S1, S9) is WBS's logical ledger of declared units, not Dash's
  physical one; neither reads the other's numbers.
- Preserve required work and evidence, stop writers and resolve dependent resources before
  destructive cleanup. Unknown evidence keeps capacity held.
- Runtime admission counts unreleased reservations across projects on the same host pool.
- Additive WBS storage and routes, guarded rollback, tenant-scoped access and non-undoable
  release history. Every release guard requires a production-path negative proof.
- Existing claim leases keep releasing claims; resource settlement remains independently
  visible and enforced by Dash.

## Capabilities

### New Capabilities

- `resource-release`: ownership, cleanup, verified release, retained capacity and history.

## Domain Terms

Resource use, Resource cleanup, Resource release, Release record and Retained resource.
See the WBS and Twilight Structure glossaries.

## Design status

Architecture baseline, 2026-10-25. The user subsequently authorized implementation.
The reported-use increment is tracked in `../wbs-resource-release-tracking/`; the automatic
local runtime and its WBS integration are tracked in `../dash-resource-cleanup/`. Their
verification records establish implementation status and supported provider coverage.
