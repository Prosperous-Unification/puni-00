## Why

The installer verifies installed files and service/socket availability without proving executed bytes or connected service identity. Backend private PID namespaces cannot compare the host listener with systemd MainPID. A service-UID-owned identity file cannot protect publication against a foreign listener sharing that UID. This proposed followup would add independently admitted runtime identity to the solver transport.

## What Changes

Prefer a root-owned online solver identity broker and per-invocation supervisor TLS key. The backend authenticates the root-installed broker pin, resolves a nonce-bound observation, pins the supervisor connection, exchanges a fresh invocation hello, confirms the observation remains current, then releases start on that connection. Specify approved-baseline provisioning and dedicated read-only trust/runtime mounts for Docker and k3s.

This packet supplies contracts and ordered TDD gates. Existing ambient/namespace experiments and externally supplied local TLS evidence are feasibility only; broker, generated units, actual container protocol and provisioning remain unimplemented.

## Non-Goals

No production edits, root provisioning, installation, service operation, rollout, activation, adoption, retained-owner publication, prior-holder drain, automatic rollback, h2 gate, push or PR. This followup is outside cross-project-dependencies delivery and does not block its continuous-exclusion acceptance.

## Constraints

Preserve captured bundle/config bytes and `/proc/self/exe` identity, both host installer SO_PEERCRED MainPID/UID probes, typed stable before/after D-Bus policy and final four-artifact hashes under the same edge admission. The broker uses independently approved root state, never observed hashes as expectations; it neither acquires edge.lock nor changes services. Root/kernel/user-manager integrity and supervisor memory are trusted. No host PID sharing or backend systemd/Docker authority. Keep the private observer alive for its invocation; bound per-query state and restart retries. Freshness ends at final confirmation, without instant post-confirm revocation; absent, stale, malformed or raced authority refuses before work. Every production guard requires a watched production-path negative.

## Capabilities

### New Capabilities

- `solver-supervisor-identity`: effective supervisor identity and fresh namespace-compatible admission before solver work.

## Domain Terms

Effective supervisor identity; Solver identity broker; Supervisor admission baseline.

## Decisions Recorded

[Root authority publishes live supervisor identity](../../../docs/adr/0062-root-authority-publishes-live-supervisor-identity.md) (preferred, proposed for review).

## Impact

Future supervisor/client/protocol and installer changes, separately protected root broker packaging/provisioning, and Docker/k3s mounts and validation. Current production code is unchanged.
