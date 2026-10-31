## Why

WBS already manages resource declarations, logical claim occupancy, claim leases and
compute-provider reports, but it cannot record the individual resources an agent leaves
behind or explain whether their cleanup was requested or reported complete.

## What Changes

Add persistent, attributable resource-use reports, immutable lifecycle events and a usable
Resources-panel view. Agents register each use against a project, work item, declared
resource and run. Operators request cleanup, report blockers, record retention with an
owner and review date, and report release with evidence. Work completion and claim release
request cleanup for matching uses without reporting physical release.

## Non-Goals

Automatic filesystem/container deletion, a new Dash reservation authority, host-wide capacity
enforcement, independently verifying cleanup evidence, or changing claim occupancy and
scheduling. These belong to the companion `dash-resource-cleanup` implementation.

## Constraints

- Build solely on freshly fetched merged main, `830e774d2302d852432c51ded1e1b38e85728f66`.
- Every state and event is explicitly reported; a request never certifies release.
- Preserve history across planning edits and deletion; same-organization admins retain
  access to orphaned reports.
- Existing project authorization, machine-credential restrictions, write coordination,
  typed HTTP contracts, additive migrations and guarded rollback apply.
- Idempotent retries and expected revisions protect immutable history.

## Capabilities

### New Capabilities

- `resource-release-tracking`: reported uses, cleanup requests, retention and release history.

## Relation to the design

Implements the usable tracking increment of
[resource release](../wbs-resource-release/design.md) against merged capabilities.
The companion [Dash cleanup change](../dash-resource-cleanup/proposal.md) implements runtime settlement and automatic cleanup; this document defines the reported-use increment.
