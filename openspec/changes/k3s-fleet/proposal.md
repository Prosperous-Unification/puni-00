# Intent

## Problem

Infrastructure operations are tied to named hosts and scripts. They do not model desired cluster membership, fresh provider/Kubernetes observations, node identity changes, serialized mutations, or safe retirement.

## Desired outcome

Provide a typed fleet planner and journaled apply path for provisioning, enrollment, retirement, replacement, and upgrades across platform and worker k3s clusters. Arbitrary hosts join through desired inventory; errors, partial observations, identity drift, lost leases, and capability loss stop mutation.

## Non-goals

- Queue-driven automatic purchasing or autoscaling.
- Implicit discovery-driven destruction.
- Treating a host name as machine identity.
- Multi-region active-active clusters.

## Constraints

The F5 protected-workload rehearsal owns a generated disposable rootless QEMU workers lab
(one server and two agents). It exercises production plan/apply and the retirement playbook
with local-PV, managed forge-worktree, managed singleton SQLite, and PDB blockers, preserving
identity, workloads, persisted markers, services, and journal evidence. Recovery explicitly
uncordons and clears each blocker before ordinary stateless retirement and its idempotent
second apply. Acceptance requires fresh structured evidence from a KVM-capable host; missing
or malformed evidence refuses acceptance. Cloud provisioning, HA removal, and upgrades are
outside this rehearsal.

Plans bind desired revision, observation digest/time, provider and Kubernetes identities, preconditions, ordered effects, expiry, and SHA-256. Apply accepts only a persisted reviewed plan and re-observes before each mutation. Terragrunt 1.1.5 is the sole fleet infrastructure execution entry point, using the locked Terraform 1.16.3 engine and the existing state/backend. Reviewed plans also bind the source-free Terragrunt configuration. Terraform owns cloud resources; Ansible owns host configuration. Production inputs may remain absent while local fixtures work.
