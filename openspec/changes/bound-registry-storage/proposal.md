## Why

The operational Distribution registry stores images on the host root filesystem.
Its 50 GiB local-path PVC request does not enforce capacity, and images and backup
snapshots currently accumulate without automatic retirement. Continuous publishing
could exhaust host storage or force unsafe deletion of rollback artifacts.

## What Changes

Define storage admission and retirement as obligations of publication, promotion,
deployment, rollback, backup and registry maintenance. Implementation must enforce
a physical storage boundary, warn before exhaustion, retire eligible older images
and refuse new publication when protected images leave insufficient capacity.
Fresh write permission must support admitted uploads across normal authority updates.
The final validated permission must authorize the sampled journal checksum even when
its record changed during the sample; transient file replacement must never bypass a fence.

Default policy: 50 GiB maximum registry storage; warning at 70%, cleanup at 80%,
publication cutoff at 90%; newest ten successful release bundles per product and
seven days for unpromoted artifacts. Image protections override age and count.
The separate 100 GiB backup budget counts stored file/object sizes, including
versions and uploaded parts; provider billing overhead is outside this measure.

Implementation and staged activation are authorized. Runtime readiness remains
unverified until the implementation, failure proofs and activation checks pass.

## Non-Goals

Migrating products now; deleting protected or unowned images; changing the public platform
source pin; introducing a new registry product; claiming host build caches are
bounded by the registry limit; eliminating maintenance downtime.

## Constraints

Preserve active, desired, rollback, recovery and in-progress images by digest,
including untagged manifests and shared dependencies. Missing or untrusted state
must prevent destructive maintenance. Preserve existing Flux ownership, private
TLS/authentication and backup recovery. Capacity exhaustion blocks publication;
it never authorizes deletion of protected images. Use existing Bun/Nx tooling.

## Capabilities

### New Capabilities

- `registry-storage-lifecycle`: Enforced storage budgets, publication admission,
  durable image protections, coordinated retirement and bounded backup retention.

### Modified Capabilities

None. This adds an adoption prerequisite to the existing registry workflows.

## Domain Terms

Release bundle; image protection, in the
[factory glossary](../../../docs/twilight-structure/CONTEXT.md).

## Decisions Recorded

None. No decision met all three ADR criteria.

## Impact

Distribution storage manifests; tool-fleet registry copy, backup and maintenance;
Dagger publication; Compose and Kubernetes release coordination; private fleet
configuration and product publishing adapters; registry and platform runbooks.
