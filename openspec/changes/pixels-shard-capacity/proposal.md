## Why

Hosted CI run 39898917880 canceled browser shard 1/4 at its 25-minute job limit while the layout gate was still running, with 160 cases passed, one skipped and none failed. Shard 2/4 needed 21m03s for layout alone. The four-way partition no longer leaves reliable setup and organization-check headroom. Later eight-shard run 39951248349 canceled shard 3 after a ten-minute Chromium install and 112 passing cases; eight partitions still need bounded setup headroom.

## What Changes

Run the same browser suite across eight file shards, retaining the stable required `pixels` verdict, and run the existing dedicated cross-project browser target once on lightly loaded shard 4. The original 35-minute budget was superseded by the integrated path allowances in [browser-validation-budget](../separate-browser-setup-budget/specs/browser-validation-budget/spec.md). Record measured partition sizes and hosted timings so the capacity choice can be reviewed.

## Non-Goals

Changing browser behavior, worker count, retries, ordinary-suite test selection, required verdicts, organization coverage or product activation.

## Constraints

Keep fail-fast disabled, the organization check on shard 1, and the aggregate's failure and cancellation propagation. Local verification is focused; exact-head hosted CI must establish completion and elapsed time.

## Capabilities

### New Capabilities

- `pixels-shard-capacity`: Schedule the existing browser gate in eight complete partitions.

## Domain Terms

None. Existing browser and organization terms retain their meanings.

## Decisions Recorded

None. The scheduling count is readily reversible.

## Impact

CI workflow, its production-workflow regression test and verification evidence. No application or dependency changes.
