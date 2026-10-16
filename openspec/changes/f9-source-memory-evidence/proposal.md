## Why

The recovery helper accepts text containing metric names and a cgroup path substring. This can credit incomplete or unrelated observations without proving the first source container had a 2Gi limit.

## What Changes

Replace text matching with a typed validator for the expected first Pod observation, an explicitly supplied source binding, and structured local cgroup observations. Require exact Pod/container/cgroup identities, the same init PID and start time in every sample, complete metrics, and memory.max exactly 2147483648. Return sanitized evidence without a verdict.

## Non-Goals

Authenticating the supplied binding, automatic binding discovery, file ingestion, lifecycle operations, readiness or OOM attribution, historical log conversion, and F9 acceptance.

## Constraints

Start at corrected #518 head 904e610c0a44ee229e93c1e0c501ab8eb4b86511. Offline fixtures only. Keep runRecoveryLab disabled; preserve historical evidence. No dependencies or live lab work.

## Capabilities

### New Capabilities

- `forge-source-memory-evidence`: identity-bound complete source memory evidence.

### Modified Capabilities

None.

## Impact

Recovery helper and tests, new validator module and tests, local infra runbook. Existing Linux terms require no glossary changes.
