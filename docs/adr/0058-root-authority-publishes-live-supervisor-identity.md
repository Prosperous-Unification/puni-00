---
status: proposed
---

# Root authority publishes live supervisor identity

Within the separately proposed [solver-supervisor-identity-broker followup](../../openspec/changes/solver-supervisor-identity-broker/proposal.md), prefer a root-owned online solver identity broker to authenticate each supervisor invocation's ephemeral TLS certificate against an independently provisioned admission baseline. Private backend PID namespaces cannot authenticate a host listener by MainPID; a service-UID-owned key or mutable certificate file also cannot protect publication against a foreign listener sharing that UID. Nonce-bound resolve and confirm observations avoid treating a cached expectation as current after restart; this deliberately adds privileged provisioning, protected root runtime/key/trust paths and dedicated read-only container mounts, pending implementation proofs and review.

## Considered Options

A user-owned certificate or systemd credential remains within the supervisor UID's authority; mode 0444 beneath a user-owned parent does not protect replacement. A public identity file with leases introduces stale-publication and clock assumptions. Host PID sharing or backend access to systemd/Docker/cgroup authority exceeds the intended backend boundary. An online root broker adds a narrowly scoped availability dependency while preserving host installer MainPID evidence and keeping private keys and host observation authority outside the backend.

This proposed followup is outside cross-project-dependencies delivery; [ADR 0059](0059-supervisor-exclusion-does-not-require-an-identity-broker.md) preserves actual continuous exclusion and pinned compatible restoration as the delivery boundary. No root provisioning or implementation is authorized by this proposal.
