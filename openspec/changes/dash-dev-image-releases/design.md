## Context

The public CLI must coordinate private website release tooling without importing licensed code or encoding host credentials. Current main lacks the independent host-job CLI work; this change must merge independently and preserve canonical heavy-work exclusion.

## Goals / Non-Goals

Expose explicit development-fast and full image releases with configurable source refs and separate acceptance claims. Do not implement source-sync, silently weaken production, merge unrelated host-job work, or perform a live release as part of implementation.

## Decisions

Dash adds a lightweight `ops` entrypoint branch and release command module, independent of its heavier authority graph. The CLI owns grammar, environment/profile boundaries, protected target selection and child exit reporting. A regular mode-0600 JSON configuration has `schemaVersion: 1` and `targets` keyed by target name, each with absolute `adapter` and `configuration` paths. The current Bun interpreter executes the configured TypeScript adapter with plan/run and explicit options; no shell is used. The owner-only file is the authority to execute that adapter, not an untrusted discovery response.

The private adapter owns source refs/defaults/policies, exact source preparation, checks, cache closure, immutable artifact reuse, full-path gates, protected builds, registry publication, Fleet pin/push, reconciliation and observed acceptance. Both sources resolve once to immutable commits. Reused API artifacts retain original writer identity. Site release metadata identifies the current composite selection. Cached frontend inputs include all build-time origin and analytics settings. Every service's artifact origin remains distinguishable from the composite source request.

The separate host-job scheduler is not folded into this change. Its canonical wrapper integration can later replace lock admission without changing this release command. A configured independent build host is the immediate way to avoid contention; the release implementation must report rather than bypass the current lock.

## Risks / Trade-offs

Fast dev acceptance is narrower than full gate acceptance. Explicit profiles and receipts prevent confusing those claims. Owner-controlled adapter paths deliberately authorize local code execution. Branch selection can overwrite shared development; receipt identities and exact-source planning make the chosen replacement reviewable. End-to-end adapter tests use local controlled repositories and commands, while real registry/cluster acceptance remains a separately authorized release.

## Migration Plan

Add the CLI and private adapter, retain existing direct full-release entrypoints, and configure the website target explicitly. No host enrollment, credential transfer or deployment is implicit in merging.

## Open Questions

None blocking implementation. Dedicated builder capacity must be selected from available host capacity rather than asserted from source.
