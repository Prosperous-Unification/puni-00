## Why

WBS 070.14 admission now permits the reserved forge namespace family, but every dev environment still creates workloads in the shared authority namespace. Namespace lifecycle must establish explicit ownership so simultaneous environments have separate resource and database boundaries.

## What Changes

Each environment serves in `puni-forge-<slug>`. Creation accepts an existing namespace only when its lab, slug, trusted identity and worktree match. Status and teardown inspect ownership first. Teardown deletes the owned namespace and its database volume; partial creation remains recoverable by retrying the same pair or tearing it down.

## Non-Goals

Production cutover, image or admission redesign, transferring existing databases, changing source watchers or restart semantics, and moving shared controller identity or uniqueness Leases.

## Constraints

Preserve the admitted slug grammar and exact-root contract. Keep the shared controller and both atomic uniqueness Leases in `puni-forge`. Refuse foreign or malformed namespace state before writes. Preserve the documented destructive database behavior of `down`. Use locked tools and disposable clusters only.

## Capabilities

### New Capabilities

- `forge-environment-namespaces`: owned namespace creation, inspection, retry and teardown for source environments.
