## Verification status

Design only, 2026-11-15. No implementation, rehearsal or live receipt exists; every task in
[tasks](tasks.md) is open. This change installs nothing.

## Design review

The design decisions were made by a Fable 5.2 (high effort) agent from a written brief of
session-verified facts, at Dany's request. It verified against upstream documentation: OpenBao
seal types and the static seal (2.4.0), recovery-key and seal-loss behaviour, namespaces (2.3),
JWT auth for Kubernetes tokens, Kubernetes auth, templated policies, audit fail-closed and
config-declared devices, self-init, Raft snapshot commands; ESO's OpenBao and Vault providers,
`deletionPolicy`/`creationPolicy` semantics and chart switches for cluster-scoped kinds; Flux
`healthChecks` with `wait`; the cert-manager Vault issuer. Not verified, and owed by P1: ESO
keeping a Secret when refresh fails (task 3.2), the post-self-init recovery-key endpoint
(task 3.7), ESO 2.15 against OpenBao 2.7 (task 3.8).

## Checks run on this change

Recorded in the pull request.
