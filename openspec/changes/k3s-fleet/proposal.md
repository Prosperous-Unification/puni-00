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

Plans bind desired revision, observation digest/time, provider and Kubernetes identities, preconditions, ordered effects, expiry, and SHA-256. Apply accepts only a persisted reviewed plan and re-observes before each mutation. Terragrunt 1.1.5 is the sole fleet infrastructure execution entry point, using the locked Terraform 1.16.3 engine and the existing state/backend. Reviewed plans also bind the source-free Terragrunt configuration. Terraform owns cloud resources; Ansible owns host configuration. Production inputs may remain absent while local fixtures work.
