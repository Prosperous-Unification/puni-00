## Why

The launch goal requires a production candidate for puni.dev and app.puni.dev, but the verified platform configuration serves only development hosts. Existing release tooling hardcodes that environment, and its additive-schema rollback assumption does not protect the new versioned scoping protocol. A reviewed candidate needs explicit environment isolation and a compatible recovery path before any public cutover.

## What Changes

- Prepare a production website target on the existing platform with separate namespace, storage, configuration, Secret resources and release receipts.
- Build and validate site/app/API releases for an explicit development or production environment, including correct origins and isolated analytics configuration.
- Require a backend supporting versioned scoping for new pins and rollbacks, and prepare a compatible baseline before the new landing flow is activated.
- Provide exact-revision build, gate, backup/restore, request-handoff and rollback evidence, separating local rehearsal from live operator checks.

## Non-Goals

DNS changes, live activation, purchasing services, increasing provider spend limits, copying development prospects, activating irreversible erasure, rewriting the platform, or publishing owner-managed About/blog content. This change prepares a concrete release for review; production deployment remains a separate authorized action.

## Constraints

Preserve development behavior, licensed/private source boundaries, existing origin/claim security, additive migrations and retention guarantees. Canonical public projects are projected from committed revisions with their full dependency closure. Keep the existing capped provider key and consent requirements. Missing tools, credentials or live evidence remain explicit blockers to activation. Run the exact-SHA host gate under its existing lock; no inferred success from health alone.

## Capabilities

### New Capabilities

- `website-production-release`: isolated production artifacts and platform target, protocol-compatible rollback, and explicit release evidence.

### Modified Capabilities

None. Existing tenant isolation and website release requirements continue to apply.

## Domain Terms

None; existing website, platform, release and draft terminology is sufficient.

## Decisions Recorded

None; this extends existing environment and capability patterns without a new architectural mechanism.

## Impact

Public platform policy/validation and API capabilities; private website build/release/verification tools; private fleet manifests/policy; launch coordination and operator runbooks. No production traffic changes during preparation.
