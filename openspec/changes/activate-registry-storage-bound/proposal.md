## Why

The platform registry on h4claw stores images on the host root filesystem with no
enforced limit. One runaway publication can fill the disk that k3s and every tenant
share. `bound-registry-storage` built a bounded filesystem, but its guard serves
writes only while the dormant managed lifecycle renews a 30-second permit. Activated
alone, it gives a read-only registry. Products cannot publish here until the disk is
safe.

## What Changes

- **Decision:** the storage bound is activated on its own. The managed lifecycle
  stays dormant. Merging this change approves that decision and everything listed
  under "What is given up" in [design.md](design.md).
- A separate bound-only start-up guard verifies both mounts, then latches the
  registry read-only when blocks or inodes reach 90%.
- A bound-only Deployment patch runs that guard with DELETE disabled.
- The pre-lifecycle backup runner gets a source on main that accepts the bounded
  claim and its local path.
- The storage role can order k3s after storage without making k3s require it.
- Attended steps provision storage, migrate the existing content with digest
  verification, and record four installed receipts.

## Non-Goals

- No lifecycle activation: no journal, permits, publication admission or alerts.
- No retirement, garbage collection or prune.
- No product migration onto the registry.
- No change to `bound-registry-storage` task state, its guard, patch, tests or
  `Proof:` comments.
- No tooling to resize the bound.

## Constraints

- Bun and Nx only.
- Every new check has a production-path negative, watched failing (R5).
- Host steps are attended, with root on h4claw. Agents only prepare them.
- Never exhaust the live root filesystem. Saturation runs only on disposable loop
  fixtures.
- Existing content is preserved and verified by digest before the switch.
- Every attended step has a rollback. The old PVC stays untouched.
- The private fleet repository carries byte-identical copies of the public guard and
  patch.

## Capabilities

### New Capabilities

- `registry-storage-bound`: physically bounded, write-fenced registry storage that
  runs without the managed lifecycle.

### Modified Capabilities

None.

## Domain Terms

None. Registry, write fence and receipt keep their meanings from
`bound-registry-storage`.

## Decisions Recorded

None in `docs/adr/`. The decision is reversible: rollback returns the Deployment to
the old PVC, and a later lifecycle activation replaces the bound-only guard.

## Impact

Registry production manifests, the `registry_storage` role, the tool-fleet backup
runner, rehearsal tests, private fleet staging and `docs/infra/registry.md`.
