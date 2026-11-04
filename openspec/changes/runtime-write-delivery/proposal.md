## Why

Dash retains completed turns and business outcomes, but a generic outbox cannot authorize a
real WBS write. Crashes between local completion, remote effects and reply retention leave
the durable sender and write-recovery path incomplete. Connect these boundaries while
preserving exact requests, original acknowledgements and existing capacity semantics.

## What Changes

- Atomically stage a caller-validated completion, exact canonical WBS write request and
  write obligation before an initial send.
- Verify original receiver response bytes and atomically retain acceptance, terminal
  acknowledgement and obligation closure.
- Recover uncertain writes through the existing bounded, journaled receiver-fence protocol.
  Accepted lost replies close the original obligation. Proven nonacceptance leaves an
  explicit unsendable obligation with replacement blocked and capacity status preserved.
- Preserve genuine predecessor histories through an explicit additive storage upgrade.

## Non-Goals

Automatic success/failure/cancellation mapping, new business-attempt budgets, physical worker
reconciliation, remaining adapters, another durable provider, coordinator CLI/dogfood,
operator-store migration and production activation remain separate.
No WBS-owned authentication, credentials, limits, runtime request or receipt semantics change.

## Constraints

Use the reviewed recovery/identity candidate as the predecessor. Preserve its opaque-ID
domain, private JSON keys, wire identities, original replies and old writer protocols.
Ordinary open never migrates. Existing generic completions and outboxes never become
executable requests automatically. Local determinate completion retains its existing
capacity release; a receiver fence proves neither physical quiescence nor business success.
Memory and SQLite share semantic tests; actual receiver crash/reopen, transaction-abort and
independent production-path R5 proofs are required alongside reviews and exact-source gates.
Incompatible admission preserves PUNI records, schema, migration identities and persistent
settings while allowing engine bookkeeping. Closed predecessors detected by SQLite's private
inspection retain byte/sidecar protection. The shared admission contract must remain feasible
on PostgreSQL; its adapter and conformance are separate required foundation work.

## Capabilities

### New Capabilities

- `runtime-write-delivery`: Durable coupled staging, verified acceptance and uncertain-write recovery.

### Modified Capabilities

None.

## Domain Terms

Write obligation, recorded in root `CONTEXT.md`.

## Decisions Recorded

[ADR 0068](../../../docs/adr/0068-outcomes-and-runtime-writes-stage-together.md).

## Impact

Twilight Dash run persistence, verified runtime sender/recovery helpers, memory/SQLite
conformance, preserving migration/down pair and genuine predecessor fixtures. Existing WBS
contracts are consumed unchanged; no new dependency or deployment is required.
