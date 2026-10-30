# Compiled traversal sharing — PRIVATE, unapproved intent

## Problem

Repeated ArkType compilation emits duplicate traversal wrappers for already compiled references. The existing HTTP-contract import test measures an RSS increment above its strict500MB bound with stock nested `@ark/schema@0.56.2`. A private qualified patch reduces that fixed increment, while retaining existing callback/table references and increasing validation cost.

## Desired outcome

Review a version-specific native Bun patch registration for exactly the already qualified compiler bytes. Reuse eligible existing bound callbacks while preserving owning-scope generation, conservative alias/cycle/identity-conflict fallback and all union callback slots. Preserve contracts, types, producer behavior and consumer resolution on the exact integrated candidate before considering adoption.

## Non-goals

No second optimization, generic compiler/allocator framework, fork, upgrade, weakening of the memory assertion, new benchmark, tuning, resampling, GC/retention experiment, deployment, accepted MAIN ADR or PR630 action. Stage B source work remains separate.

## Constraints

The reversible compiler proposal changes exactly root `package.json`, three native `bun.lock` registration lines and the unchanged version-qualified patch. Image packaging also copies the registered patch directory before frozen installs in the four WBS application Dockerfiles and the lab MCP Dockerfile; Dagger consumes the application Dockerfiles without a separate installer. Every unrelated current R16 byte/value remains; inverse edits must recover the current manifests exactly. Native generation and two-materialization allowances are consumed.

Historical candidate readings381/379/384MB passed unchanged strict<500MB; baseline509/513MB retained expected failures. These are rounded RSS increments, not total/peak RSS, retained heap or512MiB pod headroom. Aggregate validation cost rose13.02%, within its predeclared1.20 budget; raw Standard Schema rose40.16%. Registry sharing strongly retains callbacks and their old tables.

WBS contracts maintainers own the private patch's review, pinned inputs, removal and future version compatibility. Upstream replacement, version/canonical identity change, candidate semantic failure or an unacceptable measured tradeoff requires removal or a separately reviewed replacement. Exact-candidate materialization, type negatives, consumer resolution/parity and normal repository/CI/host gates remain pending. Architecture, MAIN, PR630 and adoption remain held. This draft authorizes no source application or execution.
