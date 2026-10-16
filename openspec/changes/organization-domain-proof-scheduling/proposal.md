## Why

Retained domain proof checks already enforce seven-day eligibility and fourteen-day suspension, but production never starts their worker. Organizations can retain onboarding eligibility indefinitely after losing DNS proof.

## What Changes

Configured authoritative DNS enables an immediate bounded proof sweep and subsequent hourly sweeps. Each process checks at most 32 due claims per sweep, never overlaps its own sweeps, and joins cancellation before closing storage. Expected DNS unavailability records a warning and the existing suspension policy; cancellation does not record failure. Unexpected failures reject the worker completion promise.

## Non-Goals

No global exactly-once coordination, automatic recovery of suspended claims, ownership transfer, DNS adapter redesign, or external live-domain evidence.

## Constraints

Preserve activation and transactional snapshot checks, rotation overlap, unique ownership, manual suspended recovery, and additive storage compatibility. Scheduling requires explicitly configured authoritative DNS. Two deployment colors may perform redundant lookups; only current snapshots may commit.

## Capabilities

### New Capabilities

- `organization-domain-proof-scheduling`: bounded, cancellable periodic retained proof checks.

## Domain Terms

None; retained proof, verified domain and suspended domain retain their existing meanings.

## Decisions Recorded

None.

## Impact

be-01 runtime and boot lifecycle; core proof service and modeled DNS failure boundary; focused worker and repository tests.
