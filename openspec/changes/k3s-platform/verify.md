# Verification

## Commands and results

- F6 foundation `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-fleet:check --skip-nx-cache` (2026-09-17): 144 passed, 0 failed, 741 assertions; lint, typecheck, the required toolchain lock, and the production platform validator passed.
- The exact locked fleet-controller image, with networking disabled and only a task-owned `/tmp` copy mounted, accepted `ansible-playbook --syntax-check` for `platform.yml`. Its pinned kubectl rendered all four cluster overlays plus networking, local/production storage, policy and registry kustomizations. The only diagnostic was the expected syntax-check warning that the synthetic inventory has no `k3s_bootstrap_servers` host.
- Official Docker Hub evidence for Distribution 2.8.3 records linux/amd64 manifest `sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278`; the toolchain and Deployment bind that exact identity. The existing external registry remains authoritative until TLS/auth, offline garbage collection and restart-pull tests pass.
- `docker run --rm --network none --user 1000:1000 --tmpfs /var/lib/registry:uid=1000,gid=1000 ... registry --version` printed Distribution 2.8.3, and the same process wrote the storage path. The pod security context binds UID/GID/fsGroup 1000 and a read-only root filesystem.
- Flux reconciliation, SOPS decryption, chart fetches, denied cross-namespace pod traffic and admission against a live API remain unverified. F6 stays incomplete pending the real local cluster conformance run and production-equivalent registry migration rehearsal.

## Failure proofs

| Check                      | Injected fault                                                  | Production-path test                                                     | Observed result                                                                  |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Registry image lock        | Removed required `runtimeImages.registry` schema entry          | `readToolchain rejects a missing registry image lock`                    | The negative resolved instead of rejecting; the required lock was restored       |
| Platform artifact locks    | Removed chart-version and registry-digest guards                | `validatePlatform` chart and registry negatives                          | Both changed artifacts resolved instead of rejecting; both guards were restored  |
| Cluster identity           | Removed overlay identity and kubeconfig binding guards          | `validatePlatform` wrong-identity and cross-cluster-kubeconfig negatives | Both substitutions resolved instead of rejecting; both guards were restored      |
| SOPS recovery key          | Removed the exact `sops-age` reference guard                    | `validatePlatform` missing-decryption-key negative                       | The missing-key graph resolved instead of rejecting; the guard was restored      |
| Trusted host path          | Removed the exact-directory guard                               | `assertTrustedWorkload` broader-parent negative                          | `/run/puni` stopped throwing; the `/run/puni/solver` equality guard was restored |
| Trusted workload identity  | Removed namespace, service-account, controller and image checks | `assertTrustedWorkload` four identity negatives                          | Each unreviewed identity stopped throwing; all four guards were restored         |
| Trusted workload isolation | Removed capability, privilege and API-token checks              | `assertTrustedWorkload` capability, escalation and automount negatives   | Each unsafe workload stopped throwing; all three guards were restored            |
| Cluster token              | Pending                                                         | Pending                                                                  | Pending                                                                          |
