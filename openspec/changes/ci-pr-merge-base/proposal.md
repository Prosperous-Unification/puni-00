## Why

PR #399 checked out synthetic merge e37d with main 8466 as its first parent, while the event payload still named base eaf7. Comparing with that older payload expanded the affected set from 19 projects to 43 and exhausted the 60 minute workspace budget.

## What Changes

Validate the checked-out PR synthetic merge against the immutable run SHA, payload head SHA and PR number, and use its actual first parent. One callable resolver with a CLI serves gate scope, browser scope and corpus comparison. The workspace job independently resolves and compares its received `GATE_BASE` before invoking Nx.

## Non-Goals

No timeout increase, mutable-ref fetch, remote-cache change, target/input narrowing, change to required aggregates, or change to push, merge-group or dispatch scope.

## Constraints

Only `pull_request` uses the resolver. Require exact merge ref, local HEAD equality, exactly two readable commit parents and second-parent equality with the payload head. Missing or malformed identity, missing objects, wrong topology and resolver failure must stop affected work without emitting a usable base. The architect approved this design before implementation; no additional interview is needed.

## Capabilities

### New Capabilities

- `ci-pr-merge-base`: replace the older change's explicit payload-base requirement with a validated synthetic-merge boundary.

## Impact

`.github/workflows/ci.yml`, `tools/tool-git-hooks` resolver and corpus selector, workflow tests in `tool-git-hooks` and `tool-devsync`, and the index route. Application behavior and deployment are unaffected.
