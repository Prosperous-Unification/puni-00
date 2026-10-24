## Context

The 2026-10-24 audit found registry PVC Bound (50 GiB, local-path Retain on h4claw), a ClusterIP service, no registry-auth or registry-ca, and an unready cert-manager certificate. Website workloads use GHCR. The platform GitRepository pins 584230c9e47b71cdb48e8d6397dc753e9aa93983; current main changes 58 platform files outside this task.

## Goals / Non-Goals

Make the existing registry reachable, authenticated, recoverable and usable by builders and nodes. Do not migrate products, upgrade Distribution or activate the broader platform.

## Decisions

- Keep the platform pin. The private fleet owns encrypted operator-supplied registry secrets through a separate Flux Kustomization with SOPS decryption. The public source already declares these secrets externally supplied.
- Record durable operational holds on the root platform Kustomization's patches for observability, alerts and backup before creating the missing secrets. Preserve all existing root patches. Verify the held stages stay suspended after parent reconciliation.
- Bind a systemd socket only to h4claw's private address, port 5000, forwarding raw TCP to the registry ClusterIP. TLS terminates at Distribution. Resolve the Service address during convergence; rebuilds rerun convergence. No public listener, TLS bypass or change to existing ingress.
- Manage private hostname mapping and CA trust on h4claw, h3mon and the build host. Preserve existing registries.yaml; refuse unmanaged conflicting state rather than overwrite. Restart k3s services one node at a time only when necessary, verifying node and website readiness.
- Use per-client credentials where practical, recognizing that Distribution's htpasswd backend does not provide per-repository authorization. All registry clients are trusted operators/nodes.
- Generate secrets in root-only operator storage on h4claw. Encrypt to the established fleet age recipient. Keep encrypted recovery copies off-node and test decryption on a second host; distinguish online recovery proof from the human-owned password-manager/offline-hardware escrow requirement.
- Use restic 0.19.1 for encrypted full-PVC snapshots under the existing S3 bucket’s dedicated `backups/registry/restic-v1` prefix. Briefly stop only the registry during the nightly capture, retaining and restoring the root/platform Flux suspend states and replica count on failure as well as success. Recover on h3mon into an isolated registry. Preserve every snapshot during activation; retention/pruning is a subsequent explicit policy.

## Risks / Trade-offs

The registry and local volume are single-instance. Private-address host proxying adds a host unit to recover alongside Kubernetes; the role and runbook own this relationship. K3s node restarts briefly interrupt management on the single control plane. Activating the registry otherwise unlocks unrelated Flux dependents, hence explicit recorded holds. No existing product depends on the new registry during this change. Daily backup introduces a short registry maintenance window; failures are visible through systemd and an unchanged last-success receipt, while external alert delivery remains outside this scoped activation.

## Migration Plan

Audit and preserve state; prepare and test host integration; review and gate changes; establish holds; deploy encrypted secrets; activate endpoint and clients; prove push/pull and negative cases; configure backup and run isolated recovery; record release identities and follow-up custody. Product migration is a subsequent change.
