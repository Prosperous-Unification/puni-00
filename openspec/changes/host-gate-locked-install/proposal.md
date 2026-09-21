## Why

The h2puni gate tree is a long-lived shared checkout, and `bin/h2puni-gate-steps.sh` never
installed dependencies. On 2026-09-20 its `node_modules` was 2026-09-18's install, without
`di-bag`, `application-exception` or `caught-object-report-json`, so every host gate since batch
1 reported a verdict about dependencies the gated commit does not describe. The first batch 2
group gate failed `apps/wbs/be-01/src/production-entrypoint.test.ts` on
`Could not resolve: "di-bag"` and the planner installed by hand. CI installs; the host gate did
not.

## What Changes

The gate steps install the locked dependencies themselves, inside the heavy lock, after the
pinned checkout and before OpenSpec validation. The install is frozen, so a lockfile that
disagrees with the manifests fails the gate loudly with the installer's own message rather than
gating a tree assembled from something else. A refused or absent installer stops the gate before
OpenSpec validation and before any Nx work.

## Non-Goals

This change does not alter the heavy lock, the pinned checkout, the OpenSpec contract, the Nx
steps, the solver image smoke step, CI, lefthook, or any Nx project target. It adds no network
behaviour beyond the installer's own and no new script.

## Constraints

The gate steps stay a plain sequence under `set -euo pipefail`. No step may be skipped,
defaulted or made conditional on a tool being present.
