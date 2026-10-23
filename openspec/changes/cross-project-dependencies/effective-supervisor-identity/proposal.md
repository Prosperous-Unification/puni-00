## Why

The existing supervisor installer verifies installed hashes, service activity and a socket path. Those observations do not establish which bundle/config bytes execute, whether ambient startup code ran, or whether the connected server is the service invocation just installed. Task 10.2 needs effective supervisor identity before any later adoption work.

## What Changes

Define a bounded identity contract covering exact captured execution bytes, pinned Bun startup policy, kernel-authenticated private readiness and public solver connections, typed effective systemd observations and final installed readback under one shared edge admission.

This packet supplies the design, testable delta and ordered TDD slices. Its only executable work is a disposable Bun 1.4.2 ambient-startup feasibility probe. Production implementation awaits review.

## Non-Goals

No activation, installed-byte adoption, retained owner publication, prior-holder drain, broad participant exclusion, automatic rollback, production service lifecycle operation, h2 gate, push or PR. This does not complete parent cross-project-dependencies Task 10.2.

## Constraints

Reuse the existing installer admission and captured source hashes; preserve unrelated work. Hash and consume identical bundle/config buffers. Bind both host installer probes to systemd MainPID and UID; require reviewed namespace-compatible public-client authentication and expectation refresh; never trust a payload PID. Require typed before/after systemd observations, bounded per-call and overall deadlines, and final four-artifact readback. Fail closed on missing, malformed, unreadable, changed or timed-out evidence. Preserve uncertainty evidence after publication begins. Follow repository R1–R5; every production safety check needs its own watched production-path negative.

## Capabilities

### Modified Capabilities

- `cross-project-dependencies`: add effective supervisor identity scenarios to the existing Task 10.2 installer prerequisite; no activation authority is granted.

## Domain Terms

Effective supervisor identity.

## Decisions Recorded

None. This review packet records a proposed shape; no irreversible production choice is made.

## Impact

Future changes touch tool-remote-scripts supervisor bootstrap/config/startup and installer operation, generated supervisor unit, and public solver-client identity admission. Current tracked runtime code is unchanged.
