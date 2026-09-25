## Context

The three installed reporting libraries already produce diagnostic and public reports together, share one occurrence identifier, apply one reusable redaction policy and bound a report by bytes. This change adds only the repository-owned policy and its failure contract.

## Goals / Non-Goals

**Goals:** Centralize the repository's limits and sensitive names, build reusable redaction from secrets a caller owns, and make reporting loss explicit without throwing from an existing failure boundary.

**Non-Goals:** This design does not adopt the module at an application boundary, define production exception kinds, add DI Bag composition or claim browser execution.

## Decisions

The report options and each caller's redaction policy are constants. The library caches one report maker per options object and policy, so rebuilding either for every call discards that cache.

Amended 2026-09-25 by `migrate-report-libraries`: application-exception 0.7.0 caches no report maker and snapshots its option bags on every call. The options and the policy stay constants, as the single source of the limits and a policy compiled once.

`SENSITIVE_KEYS` remains a readable string list, but the builder compiles every name into an anchored case-insensitive pattern. Measured string-key matching is case-sensitive while HTTP header names arrive capitalised; anchoring prevents a sensitive name from matching an unrelated substring.

The loss branch creates a local `UNREPORTED_<n>` correlation handle instead of reading an occurrence identifier from the caught value. Reading the hostile value is what can make reporting throw, and separate losses must remain distinguishable.

The loss reason is fixed and does not quote the thrown reporting error because that message may contain the value redaction was meant to protect.

Schema tests use `ajv/dist/2020`. The installed diagnostic and public schemas use JSON Schema draft 2020-12, which the default Ajv export does not load, while that entry point does.

## Risks / Trade-offs

A fixed loss reason withholds debugging detail, and a caller can redact only secrets it explicitly owns. Those limits preserve the original failure and avoid a second disclosure while reporting is already compromised.

## Migration Plan

Build and prove the shared library first. Adopt it later at the observability, backend and MCP boundaries without changing their public protocols. Add a separate browser execution fixture before claiming portability.

## Open Questions

Which future boundary, if any, needs another sensitive key beyond the initial shared list?
