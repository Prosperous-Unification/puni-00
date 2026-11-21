## Why

A website release currently waits for an uncached whole-public-monorepo gate, including WBS tests unrelated to its artifacts. This adds hours before the existing website build can validate its own complete private workspace. The owner explicitly requires product-scoped release qualification using Nx rather than a full repository gate prerequisite.

## What Changes

- Product releases validate their released projects, transitive workspace dependencies and product-specific deployment requirements.
- Repository integration keeps its existing full gates. A full repository result is not a prerequisite for a product release.
- The website's source-bound, checks-enabled private Nx build remains mandatory. A typed release preflight may authorize it before completed qualification; publication still requires actual build, image, rollback and deployment evidence.
- Retire the current owned redundant public gate safely before admitting the website build. Preserve its actual terminal outcome and all historical evidence.

## Non-Goals

No broad gate weakening, modified host budgets, new job types, dependency runner, skipped migrations, relaxed privacy, credential export, or claims that preflight is a passing build. Preserve the live static site and unrelated work.

## Constraints

Select the complete artifact dependency closure from exact source identities. Unknown/malformed graph or missing required checks must refuse. Keep canonical resource admission, frozen dependencies, source/runtime/image binding, attribution, rollback, database seal, notification, backup/restore and log acceptance. Never relabel a scoped result as a full repository pass. User authorized this scope directly and requested no further questions.

## Capabilities

### New Capabilities

- `product-release-validation`: source-bound product scope, distinct preflight and qualification, and independent repository integration.

### Modified Capabilities

None in canonical `openspec/specs`. The still-active `website-production-release` proposal/spec is amended alongside this capability to remove its prospective host-gate prerequisite.

## Domain Terms

Release qualification, release preflight, repository gate: [factory language](../../../docs/twilight-structure/CONTEXT.md).

## Decisions Recorded

None. The scope correction is reversible and uses the existing Nx build boundary.

## Impact

Agent guidance, release runbooks and the website's attended production handoff. The frozen website source family and normal checks-enabled build remain intact.
