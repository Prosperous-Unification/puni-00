## Why

Distribution stores images on the host root filesystem. Its 50 GiB local-path PVC
request does not enforce capacity; images and backup snapshots accumulate without
automatic retirement. Publishing could exhaust storage or force unsafe rollback deletion.

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
The 100 GiB backup budget counts stored file/object sizes, including
versions and uploaded parts; provider billing overhead is outside this measure.

Backup reservations use fixed execution ceilings chosen independently of remaining
capacity and enforced before upstream writes. The entire ceiling must fit before
launch; spending and uncertainty never refill it. Unexpected exhaustion fails and
fences the operation while preserving prior verified recovery. Accepted input
limits and successful recovery remain separate prerequisites.

Earlier activation authorization is historical; current authorization covers source
preparation. Runtime readiness remains unverified.

## Current source delivery

This revision stages complete libraries and manual provisioning sources. Supported
publishing, copy, Compose and Kubernetes commands retain baseline routing and writer
versions. Direct managed calls require trusted enrollment. Coordinated activation,
native/provider proofs and deployment/adoption acceptance remain outstanding.

## Non-Goals

Migrating products now; deleting protected or unowned images; changing the public platform
source pin; introducing a new registry product; claiming host build caches are
bounded by the registry limit; eliminating maintenance downtime.

## Constraints

Preserve active, desired, rollback, recovery and in-progress images by digest,
including untagged manifests and shared dependencies. Missing or untrusted state
must prevent destructive maintenance. Preserve existing Flux ownership, private
TLS/authentication and backup recovery. Capacity exhaustion blocks publication;
it never authorizes deletion of protected images. Use Bun/Nx.

## Capabilities

### New Capabilities

- `registry-storage-lifecycle`: Enforced storage budgets, publication admission,
  durable image protections, coordinated retirement and bounded backup retention.

### Modified Capabilities

None. This adds an adoption prerequisite to the existing registry workflows.

## Domain Terms

Release bundle; image protection, in the
[factory glossary](../../../docs/twilight-structure/CONTEXT.md); backup reservation
and write debit in [registry operations](../../../docs/infra/CONTEXT.md).

## Decisions Recorded

Proposed [fixed backup execution reservations](../../../docs/adr/0079-backup-writes-consume-fixed-reservations.md),
with transport qualification and the full admission prerequisites still open.

## Impact

Distribution storage manifests; tool-fleet registry copy, backup and maintenance;
Dagger publication; Compose and Kubernetes release coordination; private fleet
configuration and product publishing adapters; registry and platform runbooks.
