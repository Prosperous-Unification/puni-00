# Private registry operation

The platform registry is Distribution 2.8.3 with verified TLS and htpasswd authentication. Its endpoint is `registry.puni.internal:5000`, resolved to h4claw’s private address `10.1.0.4`. It uses the existing `puni-registry/registry` PVC, a 50 GiB local-path Retain volume on h4claw. This is a single-instance service, not a highly available registry.

The existing website images remain on GHCR and WBS keeps its existing registry. Making this endpoint usable does not migrate either product. See the [activation checklist](../../openspec/changes/activate-platform-registry/tasks.md).

## Reconcile the endpoint and clients

Use `infra/ansible/playbooks/registry.yml` with an owner-only inventory/vars file. The two inventory groups are `registry_endpoints` and `registry_clients`; the matching tags are `registry_endpoint` and `registry_client`. Both plays serialize hosts.

Required common variables are `puni_registry_address`, numeric `puni_registry_port`, `puni_registry_hostname` and the PEM text `puni_registry_ca`. The endpoint also takes `puni_registry_upstream`, the current ClusterIP of Service `puni-registry/registry`. Read that address from Kubernetes before applying; the proxy must be reconverged if the Service is recreated with another IP.

Each client specifies `puni_registry_mode` (`k3s` or `trust`) and an existing `puni_registry_owner`. K3s clients require owner `root`, `puni_registry_service` (`k3s` or `k3s-agent`), `puni_registry_username` and `puni_registry_password`. Use protected vars files, not command-line password arguments. The role refuses unmanaged registry configuration and competing systemd overrides before writing.

The endpoint binds only the configured RFC1918 address, using `puni-registry.socket` and `puni-registry.service` to forward TCP to the ClusterIP. Distribution terminates TLS. The client role manages a marked `/etc/hosts` block, `/etc/puni/registry/ca.crt` and, in k3s mode, `/etc/rancher/k3s/registries.yaml`. Changed k3s trust/config restarts only the selected service; server readiness has bounded request and process deadlines. Verify each remote Node Ready and the website before advancing to another node. A second apply must report `changed=0`.

For the trust-only builder, the CA is owned by `puni1`. Set `NODE_EXTRA_CA_CERTS` or `CURL_CA_BUNDLE` to `/etc/puni/registry/ca.crt` in the process doing registry transport. Docker trust additionally uses `/etc/docker/certs.d/registry.puni.internal:5000/ca.crt`; adding this dedicated trust directory requires no Docker restart in the activation procedure. Docker credentials live in an owner-only dedicated config directory, not the shared production login configuration. Dagger engine DNS/trust is a separate migration prerequisite; do not assume it inherits the builder host’s `/etc/hosts` or trust.

## Identity and Flux ownership

The private `puni-fleet` repository owns encrypted `registry-auth` and `registry-ca` Secrets through the `registry-secrets` Flux Kustomization. It decrypts with the existing `sops-age` identity and targets `platform-production-kubeconfig`. Pruning is disabled so removing this stage cannot silently destroy the registry identity. Cert-manager owns the leaf Secret `registry-tls`.

Activation preserves the public `puni-platform` revision `584230c9e47b71cdb48e8d6397dc753e9aa93983`. Root `puni-cluster.spec.patches` durably hold the previously uninstantiated `observability`, `alerts` and `backup` stages. Their inventories were empty before this hold. Existing host monitoring and website backup jobs are independent and continue running. The root’s blanket child health check can remain unready while these stages are held; inspect the registry’s own Deployment, Certificate and `platform` Kustomization separately.

Removing the holds is a broader platform activation: first provision the other stages’ required secrets and review their pending manifests. Do not advance the public source pin just to change registry credentials.

Distribution’s htpasswd backend gives authenticated clients registry-wide access. The separate builder/node/operator accounts aid rotation and attribution; they are not read-only or repository-scoped identities. Rotate one client at a time, update the encrypted htpasswd Secret and affected client configuration, restart Distribution to load changed authentication, and verify the replacement credential before retiring the old one. Leaf-certificate renewal must likewise be verified at the served endpoint, not inferred from Secret timestamps.

## Recovery custody

Root-only operator material is under `/root/.puni/registry` on h4claw. An age-encrypted `recovery-with-backup.tar.age` contains the CA, registry credentials and restic recovery configuration. h3mon holds an encrypted copy and an owner-only recovery identity, with decryption and S3 repository access exercised there. These online copies do not establish the password-manager and hardware/offline custody required by [the recovery runbook](recovery.md#recovery-secrets). That human-owned custody remains explicitly unverified.

The [backup runner and host units](../../infra/systemd/registry-backup/README.md) provide the install and failure-recovery commands. Registry snapshots use the dedicated encrypted restic repository in `puni-01/backups/registry/restic-v1`. The backup runner briefly stops only the registry to obtain a consistent full-PVC snapshot, restoring the original replica and Flux suspend states after success or failure. All snapshots are retained during activation; no automatic pruning is enabled. Capture failures must leave the prior success receipt unchanged and the systemd service failed. This does not imply external alert delivery has been configured.

Restore into a new directory and a loopback-only disposable registry on another host. Verify a known manifest digest and every referenced blob through the Distribution API, then perform an uncached pull. Alter a blob only in a separate disposable restored copy and require the same verification to fail. Never test recovery by overwriting the original PVC or deleting the source backup.

## Rollback

Stop `puni-registry.socket` and `puni-registry.service` to withdraw the private endpoint. Restore any captured prior client configuration, remove only the marked registry hosts block and dedicated CA/config files created by this rollout, then restart k3s one node at a time and verify readiness. Keep the PVC, CA, encrypted Secrets and recovery archives. Removing `registry-secrets` from private Git does not delete its Secrets because pruning is disabled.

Do not remove the downstream holds as part of endpoint rollback: that would permit unrelated first deployments. Product image references remain unchanged, so withdrawing the endpoint does not require a website or WBS release.
