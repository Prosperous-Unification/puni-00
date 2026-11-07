## Why

PR #787 run 41544558083 exhausted Twilight's 75-minute CI allowance while Dash was still completing tests. Burokrat had completed 2,571 tests without failures; the retained log contains no failed assertion, but the required gate has no successful verdict. The allowance must accommodate complete validation of the agentic runtime.

## What Changes

Give the Twilight job a finite 120-minute allowance, matching the existing workspace job. Update the production-workflow regression and record the observed cancellation and proof.

## Non-Goals

No test removal, sharding, caching, increased parallelism, executor changes, database changes, deployment or alterations to the separate installed-survey resource guard. This change does not establish that the full gate passes within 120 minutes.

## Constraints

Preserve all required jobs, commands, failure propagation, packed-package validation and independent lint. Retain the original cancellation evidence. Require fresh hosted and canonical verification before merging the final head. Keep the repair independently reversible.

## Capabilities

### New Capabilities

- `agentic-runtime-ci-allowance`: A finite Twilight job budget for complete uncached runtime validation.

### Modified Capabilities

None.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

CI workflow, Burokrat's workflow regression and the existing CI-duration finding. No runtime contract or production behavior changes.
