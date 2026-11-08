# Runtime dispatch intent

## Problem

The durable foundation retains authority, preparation, claim and turn identities, and
the preparation host connects intent to session creation. No production host yet sends
those retained receiver commands or connects accepted claims to executor turns. A caller
can currently inspect history but cannot execute the planned workflow through these ports.

## Outcome

Connect the existing conditional receiver and ActivityExecutor through semantic stores:
retain exact authority/claim intent before sending; correlate each response with its own
original bytes; verify and retain complete receipt evidence before accepting it; retain
the complete turn intent before one fresh dispatch and retain its correlated observation.
Exact duplicates reconcile existing receipts without blindly sending the mutation again.
Ambiguous delivery remains pending and keeps its capacity/claim. Retained historical
acceptance grants no new current authority. Known local acceptance preserves its original
artifact even if later compatible wire representations differ.

## Non-goals

No credentials, machine grants, MCP consent, transport authentication, provider factories,
limits, activation, CTT implementation or cross-project dependency implementation. The
caller injects its already-authenticated transport. No production deployment or live paid
model call. Exact outcome/write/release, generic outcome format replacement, supported
worker recovery, takeover/fencing of an unresolved pending command, operator commands and
the S7a coordinator remain subsequent required work; this packet does not close their gates.

## Constraints

Consume current canonical requests, response/refusal shapes, correspondence predicates,
RunStore/ArtifactStore and executor codecs. Preserve all existing guards, migrations,
record formats, SDK pins and the one-pending-command rule. Receipt404, cancellation or
refusal cannot prove an earlier request cannot commit. Session and claim correspondence
remain exact. Unexpected trusted faults throw with safe correlation; modeled outcomes
remain typed. Bun/Nx, independent review, finite R5 negatives and exact-SHA release gates.
