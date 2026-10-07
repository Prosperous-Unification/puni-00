## Why

PUNI denies expired anonymous claims but does not remove older request content or preserve later privacy decisions after restoring an earlier backup. The approved 12-month period and client exception need a clear clock, classification and recovery behavior.

## What Changes

- Account-owned software requests and standalone manual proposals receive a fixed deadline 12 UTC calendar months after first stored content. Ambiguous historic dates block automatic erasure until resolved.
- An operator explicitly designates a contracted-client retention subject with an audit trail, independent of `closed` contact status. Client records await separate contract-retention rules.
- A remotely durable record of designations, holds and erasures survives primary database and host loss. Restore replays it before serving and refuses inconsistent recovery state.
- A proven restore drill enables daily snapshots and a proposed rolling 30-day backup age. Initial rollout reports due work without deleting live content or backups.

## Non-Goals

- No client-record deletion rule, legal claim, paid inference activation, aggregate telemetry, or WBS change.
- No live purge or backup pruning as part of this planning change.

## Constraints

- The **12-month non-client period and 24-hour anonymous-claim expiry are approved**. The first-content clock, UTC month-end clamp, client designation procedure and 30-day backup age are bounded operational defaults chosen for this plan.
- Additive migrations need paired rollback files and must tolerate old and new API versions sharing SQLite.
- Unsettled provider usage and non-content billing/audit evidence remain accountable after erasure. A confirmed remote event and monotonic latest-head witness precede destructive commit.
- Missing or ambiguous retention state refuses activation or restore.
- After journal activation, deployment and restore refuse pre-journal-aware binaries.

## Capabilities

### New Capabilities

- `website-request-retention-lifecycle`: Fixed deadlines for both request paths, explicit client designation, safe non-client erasure and recovery replay.
- `website-backup-retention`: Daily backup lifecycle and bounded aging after restore proof.

### Modified Capabilities

None. This refines the still-open `puni-website-funnel` website-operations delta.

## Domain Terms

Retention subject; retention deadline; client designation; erasure record.

## Decisions Recorded

- [ADR 0038](../../../docs/adr/0038-retention-journal-survives-website-database-restore.md)

## Impact

Public website SQLite store and API, private website recovery command and operator runbook, and the private privacy page. No website release is changed by this plan.
