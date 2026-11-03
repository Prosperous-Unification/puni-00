## Why

Small development website changes currently repeat complete builds and image publication, wait behind a host-wide heavy lock, and require manual release coordination. Operators need an explicitly faster image-based development path with configurable source selection while retaining a separately named full verification path.

## What Changes

- Dash gains `ops release plan|run` with explicit `dev-fast|full` profiles, a named configured target and main or branch source overrides.
- Development releases build affected components with reusable outputs and retain unchanged immutable service images. Receipts distinguish the selected profile, requested sources and each service artifact origin.
- The full release procedure remains explicit. Fast development verification does not claim full-gate acceptance.
- The private website adapter owns source preparation, checks, build, publication, fleet pinning and deployed identity verification. Dash owns command dispatch and execution reporting.

## Non-Goals

Source-sync deployment, production activation, automatic merging of application branches, changing inference/analytics/secrets, or replacing the independent host-job scheduler work.

## Constraints

Bun and Nx only. Resolve branch refs once to immutable commits. Preserve licensed source privacy, origin and schema compatibility, immutable image digests, truthful writer identity, readiness, rollback and host capacity exclusion. No raw gate bypass or implicit profile downgrade. The user authorized implementation and merge; no live release is requested.

## Capabilities

### New Capabilities

- `ops-release`: explicit configured release command dispatch and profile boundaries.

### Modified Capabilities

None.

## Domain Terms

Release profile, composite release, service artifact.

## Decisions Recorded

None; the adapter/profile boundary is reversible and does not justify an ADR.

## Impact

Twilight Dash CLI and its operations documentation; private website deployment adapter, build/cache identities and release receipts; companion fleet receipt validation where needed.
