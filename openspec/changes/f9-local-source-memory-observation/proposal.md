## Why

The typed source-memory validator checks supplied bindings but cannot discover the current source init process from a local runtime. Attended diagnostics need one bounded observation tied to the selected local runtime and expected first Pod/container.

## What Changes

Add a library observer using an explicitly selected absolute local crictl executable and Unix containerd endpoint. Inspect the exact full container ID, require the expected Pod UID, source name, running state and init PID, establish local process/cgroup identity, collect one bounded sample, then recheck all identities before validation. Sanitize returned fields and failures.

## Non-Goals

Cluster or operator authenticity, historical first-attempt reconstruction, readiness, OOM attribution, acceptance, remote sampling, Docker/SSH wrappers, lab lifecycle or provisioning.

## Constraints

Base is published #520 bb83cea2129e904b9de26e23a0c8ea77e49c7547. Offline spawned-runtime and fake proc/cgroup fixtures only. Preserve disabled runRecoveryLab and historical evidence. No dependencies.

## Capabilities

### New Capabilities

- `forge-source-memory-observation`: bounded local runtime discovery and validated source memory observation.

### Modified Capabilities

None.

## Impact

New observer and consuming tests, local infra runbook and verification receipts. Existing Pod/container/process/cgroup terms suffice; no glossary change.
