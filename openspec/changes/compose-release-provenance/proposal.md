## Why

Compose currently accepts a release record claiming HEAD without independently joining each image to that source or observing accepted checks. The production audit identified all routed images but could not recover their build/check chain. Future releases need a refusal boundary before the first swap effect.

## What Changes

- Executed Compose deployments verify every selected image's digest-bound application revision and the exact source's accepted verification before remote preflight or swap commands.
- A provider-independent model records source, pipeline, execution/attempt, completion and named outcomes. Dedicated adapters discover the source provider and normalize its observations; GitHub is the first supported provider.
- Reuse the existing digest-verifying OCI reader and bounded anonymous GitHub transport. The latest source-update execution and current attempt must pass both required verdicts; missing, stale, cancelled, failed or malformed observations refuse.
- Preserve all existing bundle, migration, environment, solver, smoke and deployment locks. Dry-run remains an explicitly unverified advisory plan.

## Non-Goals

Recover or relabel old images; activate registry lifecycle adapters; replace Compose; change CI jobs, reviews or required merge checks; run tests again during deploy; claim complete production provenance or disaster recovery from shipping this guard.

## Constraints

Use read-only provider access and provider-neutral core types; no runner identities in core policy. Refuse unsupported providers and incomplete observations. Reuse existing credentials only with an explicit registry-authority binding. Preserve secrets, tenant boundaries, unrelated checkouts and runtime. Demonstrate production-path negatives and watched guard-removal proofs. Develop, push and merge autonomously under the user's goal; application rollout scope is being clarified separately.

## Capabilities

### New Capabilities

- `compose-release-provenance`: source/check/image admission before any executed Compose swap.

### Modified Capabilities

None.

## Domain Terms

Deployment verification; Image provenance.

## Decisions Recorded

None. This is a bounded integration of existing verification boundaries, without a hard-to-reverse infrastructure choice.

## Impact

`tool-deploy`, a public export of the existing anonymous GitHub read transport, deployment runbook and domain glossary. No application schema or CI routing change.
