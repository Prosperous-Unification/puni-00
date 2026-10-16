## Why

The historical F9 restored checker failed shortly after policy readback, but retained neither HTTP status nor response identity. A later success cannot explain or replace that immediate failure. Operators need bounded evidence from that first request and a separate observation window.

## What Changes

The checker's first GET reports path, status, content type, root marker and duration on failure. A separate read-only command records an immediate verdict and subsequent GET observations over 30 seconds, preserving the immediate verdict even when service later recovers. Bodies are bounded and never logged.

## Non-Goals

Process/cgroup identity sampling, remote sampler deadlines, container lifecycle operations, policy mutation, automatic lab provisioning or teardown, checker retries, live F9 acceptance and attribution of historical failures. These remain separate work; this is the coherent HTTP observation slice of the broader cold/recovery diagnostic plan.

## Constraints

Start at reviewed receipts commit `40658a12740c1e525f571b3deb8beaf62db7373a`. Run only offline fixture checks. Preserve historical evidence and keep the recovery lab CLI disabled. The existing full checker remains mutating and must never be retried by convergence observation. The observation boundary exposes GET / only, rejects foreign authority and follows no redirects.

## Capabilities

### New Capabilities

- `forge-http-observation`: bounded first-response evidence and independent later observations.

### Modified Capabilities

None.

## Domain Terms

None; HTTP observations use existing ordinary terminology.

## Decisions Recorded

None; this additive diagnostic boundary introduces no hard-to-reverse decision.

## Impact

`tool-devsync` checker, new read-only diagnostic module/CLI and local infra runbook. No dependency, infrastructure or deployment change.
