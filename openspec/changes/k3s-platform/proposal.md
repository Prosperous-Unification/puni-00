# Intent

## Problem

The repository has no checked-in k3s platform implementation with clear ownership for host configuration, Kubernetes resources, admission, observability, backup, local rehearsal, and cold recovery.

## Desired outcome

Deliver Ansible-managed Ubuntu/k3s hosts and Flux-managed platform resources for product and worker clusters, with local k3d plus Ubuntu VM rehearsals, restricted workload boundaries, Elastic/Prometheus/OTel, layered backups, and executed cold restore.

## Non-goals

- Using k3d to certify systemd, firewall, cloud CSI, or distinct-host failures.
- Letting Ansible and Flux own the same Kubernetes fields.
- Giving ordinary product or worker namespaces privileged host access.

## Constraints

All tools and artifacts use the F0 lock. Missing CRDs, decryption keys, exact host-path admission, registry trust, or cluster identity fail closed. Local overlays use test credentials and cannot reach production contexts. Static rendering cannot claim convergence, telemetry, backup, or recovery success.
