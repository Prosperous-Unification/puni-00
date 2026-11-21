## Why

Cold recovery treats an etcd member name as a Kubernetes Node name. The reported live member `h4claw-37a00c01` and Node `h4claw` expose that mismatch: fences cannot reliably cover the original machines, and cleanup can target the wrong object when names are reused.

## What Changes

Cold restore requires version 2 snapshot membership evidence that binds exact etcd member names and lossless IDs, Kubernetes Node names and UIDs, and machine and provider identities to one witnessed snapshot cut and immutable stored object. The capture authority publishes the evidence after verifying the stored bytes. Every original machine needs matching fence evidence. The executable plan binds a replacement target, and the playbook independently observes the peer before mutation and deletes original Nodes with UID preconditions. Ambiguous evidence and old executable plans are rejected.

## Non-Goals

An isolated restore rehearsal, host changes, application recovery changes, automatic recovery of legacy evidence, and redesigning volume recovery are separate work. This change does not authorize existing-host restores.

## Constraints

Preserve token, SOPS, snapshot digest/size, cluster and locked-version checks. Keep volume fencing's existing contract separate. All new guards require observed production-path negative proofs, including actual Ansible execution. Existing-host restore remains blocked until a separately supported rehearsal provides evidence.

## Capabilities

### New Capabilities

- `cold-restore-identities`: explicit identities from snapshot evidence through fencing, target checks and Node cleanup.

### Modified Capabilities

None; the older platform recovery capability remains in its active change.

## Domain Terms

Etcd member identity, Kubernetes Node identity, Machine identity, Snapshot membership evidence, Snapshot cut, Capture publication, Machine fence, Replacement target.

## Decisions Recorded

The design records the leader-bound snapshot cut witness and the replacement identity observation for Hetzner and QEMU.

## Impact

`tools/tool-fleet/src/recover.ts`, its CLI callers and tests, the locked controller and native capture helper, `infra/ansible/playbooks/restore.yml`, recovery guidance and evidence fixtures. The version 2 recorder, planner and playbook ship together. Controller authority and live operator inputs remain separate prerequisites.
