## Why

The production registry has retained storage and a Flux-owned deployment but cannot start without authentication and CA secrets. Builders and nodes also lack a private endpoint and trust configuration. PUNI needs a verified private image store before considering product-image migration.

## What Changes

- Activate the existing registry with encrypted credentials and a recoverable private CA.
- Provide a private-network endpoint and repeatable host trust/authentication configuration.
- Prove authenticated push, uncached node pulls, restart persistence and isolated backup recovery.
- Record exact revisions, fault proofs and operator recovery instructions.

## Non-Goals

No product migration, public registry exposure, registry version upgrade, unrelated platform rollout, deletion of existing images or claims, or claim of high availability.

## Constraints

The user authorized autonomous setup on 2026-10-24. Existing WBS and website image references remain unchanged. Preserve the deployed platform source pin because advancing it would deploy unrelated changes. Secret plaintext stays in owner-only operator storage and never enters Git or logs. Use the existing fleet/SOPS mechanism for desired secret state. Hold unrelated Flux stages before satisfying their registry dependency. Node restarts are serialized and health-checked. Existing recovery-secret custody requirements remain explicit; physical offline custody cannot be claimed from an online copy.

## Capabilities

### New Capabilities

- `private-registry-activation`: authenticated private distribution with repeatable host integration and recovery evidence.

### Modified Capabilities

None.

## Domain Terms

None; registry, image digest and recovery secret retain their existing infrastructure meanings.

## Decisions Recorded

None. Endpoint transport and activation staging are reversible deployment choices.

## Impact

Infrastructure Ansible roles/playbooks, private fleet encrypted resources, registry operations runbook and verification evidence. Existing applications remain on their current registries.
