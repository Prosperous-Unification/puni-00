## Why

The first F9 source container was OOMKilled at 2Gi. Retained process status lacks command identity, so the suspected Vite child remains unconfirmed. A later observation cannot establish the historical cause.

## What Changes

Add an explicit local Linux cgroup-v2 observation command. It retains bounded memory counters and stable process identity, RSS, threads, executable basename and a conservative launcher role. Raw command arguments never enter output. Failed or changing trusted reads refuse the observation.

## Non-Goals

Remote launchers or remote hard-deadline claims, provisioning, teardown, container restarts, policy changes, resource-limit changes, acceptance verdicts or attribution of historical OOM.

## Constraints

Start exactly at draft #516 head e7201df07f7e72f5a791a6f8546fe213ea320aeb. Offline fixture verification only. Explicit exact cgroup directory; no discovery of lab capacity or Docker layout. Bounded bytes, process count, samples and elapsed time. Keep recovery provisioning disabled.

## Capabilities

### New Capabilities

- `forge-process-observation`: bounded local cgroup and process identity evidence.

### Modified Capabilities

None.

## Domain Terms

None; process identity and cgroups use ordinary Linux terminology.

## Decisions Recorded

None; the explicit local read-only boundary is additive and reversible.

## Impact

New tool-devsync module/CLI and local infra runbook. No dependencies, deployments or infrastructure changes.
