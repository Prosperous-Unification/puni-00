# Private registry operation

**Source staging — 2026-11-08:** Registry lifecycle libraries and manual provisioning
sources are retained for future coordinated activation. Supported publish, copy,
Compose and Kubernetes commands keep current-main routing and legacy persisted
writer versions; they do not select managed adapters. Explicit managed helpers
require trusted enrollment. Historical installed receipts below do not establish
current readiness. Managed procedures remain attended future operations; this
source merge performs no installation, adoption or production action. Full native,
provider, storage, backup, isolation, recovery and delivery acceptance stays open.

The platform registry is Distribution 2.8.3 with verified TLS and htpasswd authentication. Its endpoint is `registry.puni.internal:5000`, resolved to h4claw’s private address `10.1.0.4`. It uses the existing `puni-registry/registry` PVC, a 50 GiB local-path Retain volume on h4claw. This is a single-instance service, not a highly available registry.

The existing website images remain on GHCR and WBS keeps its existing registry. Making this endpoint usable does not migrate either product. See the [activation checklist](../../openspec/changes/activate-platform-registry/tasks.md).

## Storage protection — designed, not active

The 50 GiB local-path PVC request is **not an enforced storage limit**. Registry
contents currently share the host root filesystem. Automatic image retirement,
garbage collection and backup pruning are not enabled. Operational push/pull and
recovery verification do not establish protection against filling the disk.

The [storage workflow design](../../openspec/changes/bound-registry-storage/design.md)
and [implementation plan](../../openspec/changes/bound-registry-storage/tasks.md)
are prerequisites for continuous product publishing here. They define an enforced
filesystem boundary, capacity admission, release-aware retention, protected
rollback/recovery images and coordinated maintenance. Their thresholds and
retention counts are proposed policy, not current runtime behavior.

The staged public Deployment disables ordinary manifest/blob DELETE and Distribution's
age-only upload purger. Deletion belongs to an isolated maintenance instance after
verified backup and writer exclusion. The purger uses the object override
`REGISTRY_STORAGE_MAINTENANCE_UPLOADPURGING='{"enabled": false}'`; the nested
`_ENABLED` form is not the tested Distribution2.8.3 contract. These source changes
do not advance the installed source pin or activate the new maintenance lifecycle.

The local native configuration proof requires the binary extracted from the pinned
registry image and verifies its checksum before starting any process:

```sh
bun tools/tool-fleet/src/registry-maintenance-config.native.ts /path/to/pinned/registry
```

It exercises actual HTTP DELETE refusal and the deletion-enabled removal witness,
and observes default purger scheduling when the override is removed. It does not
claim to have waited for an age-purge cycle. Its loopback-only fixture uses no live
credentials or storage and removes its exact owned directory after stopping its process.

### Staged write-permission checks

The bounded-storage startup guard checks permission on both sides of a journal
checksum. Both samples must pass the existing owner/mode/link, bounded complete
record, boot and expiry checks; the second uses current uptime after hashing.
A valid final permission that names the measured checksum allows writes even
when the first record differs. Only a changed, valid final record that does not
name that checksum triggers a complete reread, with at most three attempts.
Stable mismatch, failed checksum, unknown or revoked permission, expiry, or three
unproved attempts select read-only mode. A record read before revocation cannot
replace the final permission. These checks do not alter the pressure fence or its
explicit authority-owned reopening protocol.

The local coherence regression uses actual journal/flock/fsync/permit updates and
the extracted production guard, with modeled capacity and UID/GID translation:

```sh
bun test tools/tool-fleet/src/registry-permit-coherence.test.ts
```

This check does not replace the pinned-binary root/container permission negatives
or the corrected-revision installed startup and checker-death proofs. Staged source
changes remain inactive until the coordinated installation and verification gate.

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

Restore into a new directory and a loopback-only disposable registry on another host. A restic subtree restore creates its target directory for the restoring user; for a Docker drill, set that directory’s ownership to the registry container UID/GID (for example, `chown --reference="$restore/docker" "$restore"`). Kubernetes fsGroup handling does not run for this Docker mount. Distribution 2.8 requires `REGISTRY_STORAGE_MAINTENANCE_READONLY='{"enabled":true}'`, not a nested `_ENABLED` variable; mount the recovered directory read-only as well. Verify a known manifest digest and every referenced blob through the Distribution API, then perform an uncached pull. Alter a blob only in a separate disposable restored copy and require the same verification to fail. Never test recovery by overwriting the original PVC or deleting the source backup.

## Rollback

Stop `puni-registry.socket` and `puni-registry.service` to withdraw the private endpoint. Restore any captured prior client configuration, remove only the marked registry hosts block and dedicated CA/config files created by this rollout, then restart k3s one node at a time and verify readiness. Keep the PVC, CA, encrypted Secrets and recovery archives. Removing `registry-secrets` from private Git does not delete its Secrets because pruning is disabled.

Do not remove the downstream holds as part of endpoint rollback: that would permit unrelated first deployments. Product image references remain unchanged, so withdrawing the endpoint does not require a website or WBS release.

## Managed publication — staged integration

Every installed publishing, copy and deployment entrypoint requires the root-owned
`/etc/puni/registry-deployments.json` selection catalog. A missing catalog refuses;
only an explicitly installed valid unmanaged catalog permits the existing publisher.
`REGISTRY_PUBLICATION_ENROLLMENT` and `REGISTRY_DEPLOYMENT_ENROLLMENT` may select among
matching hash-pinned catalog entries; unsetting either cannot erase management.
Install the complete mappings before rolling out these tools. See the
[consumer installation and recovery contract](registry-consumers.md). No production
enrollment, product migration or scratch allocation is activated by this code change.

The enrollment has `schemaVersion: 1`, an exact `registryUrl` (without a trailing
slash), `registryId`, `sshHost`, `owner`, `product`, and `requiredRepositories`.
It also pins `authorityMachineId`, `registryPath`, and `journalPath`. Its `builder`
contains `machineId`, numeric `uid`, `path`, `receiptPath`, `maximumBytes`,
`maximumInodes`, and `excludedFilesystems` (objects containing `machineId` and
`path`). Read machine identities from the respective hosts' `/etc/machine-id`.
The required repository list describes the whole product; it must not be generated
from the tiers requested for an individual invocation.

The builder UID must match the executing user and own the scratch contents directory
with mode `0700`. The target registry and journal are mandatory exclusions when the
authority's machine identity matches the builder; the additional exclusions name
all other enrolled registry/journal filesystems on that builder. Remote paths are
excluded only through their trusted different machine identity. A missing local
exclusion is an error. The receipt and mount checks are implemented by
`admitBuilderScratch` in `tools/tool-fleet/src/registry-capacity.ts`.

Provision builder storage with the reviewed
`infra/ansible/roles/registry_storage/files/storage.sh` commands
`provision-scratch`, `mount-scratch`, and `verify-scratch`. These accept the same
configuration shape as registry storage, but require exactly one volume named
`scratch`, independently bounded between 32 MiB and 50 GiB. Existing commands still
require both registry and journal volumes. For example, a builder configuration
can use this shape, with its size chosen explicitly for the host:

```json
{
  "directory": "/var/lib/puni-registry-builder",
  "rootReserveBytes": 21474836480,
  "fstab": "/etc/fstab",
  "volumes": [{ "name": "scratch", "bytes": 4294967296, "uid": 1000 }]
}
```

The parent directory must already be root-owned and not writable by other users.
The fstab entry must bind that exact `scratch.ext4` file to the `scratch` mount and
include `loop,noauto,nodiscard,X-fstrim.notrim`. The provisioner fully allocates
backing bytes while preserving the root reserve. It creates `scratch/contents`
and the root-owned `identities/scratch.receipt` outside the scratch mount.
Provisioning and boot-time mounting remain explicit operator/activation work;
publishing never creates an underlying root-backed replacement directory.

The enrollment's byte/inode envelope checks available scratch capacity before
export, and actual allocated growth is checked against it afterward. The receipt's
filesystem maximum is the independent physical bound. OCI archives and import
staging stay inside this filesystem; free-space polling is not used as a hard cap.
Interrupted scratch contents remain charged until explicitly reconciled.

`bin/publish-release.sh` preserves the selector through the existing heavy lock and
engine lifecycle. The managed Dagger path exports every required tier before the
first upload, verifies its complete OCI closure, and reserves the whole bundle
through the installed `/usr/local/sbin/puni-registry-authority` SSH command. It
uploads the inspected bytes directly and verifies every target manifest and blob.
The fixed authority accepts JSON on stdin; no executable or journal path comes
from the publishing request. Per-tier `--publish` entrypoints remain plan-only
and direct real publication to `tool-dagger:publish-all`.

`platform-registry.ts copy` groups all supplied images into the same managed
protocol. A single-image call cannot complete a product requiring multiple
repositories. Fresh capacity and ownership are checked at artifact boundaries.
A partial failure retains candidate ownership and reservation. Only a durable
complete bundle receipt releases the publisher slot; later promotion does not
require another upload. Dagger preserves the existing `release.json` tier format
and additionally writes `dist/tool-dagger/publication.json` with registry identity,
operation identity, product, owner, exact root references and the authority's
completion time. The journal is the durable authority; these local files are
caller outputs. Managed upload continuations stay on the enrolled origin and
HTTP redirects are refused.

## Verified inventory and retirement plans — staged integration

`tools/tool-fleet/src/registry-inventory.ts` supplies read-only census and planning
contracts. `collectRegistryInventory` consumes the canonical journal, verified
runtime/storage identity, managed HTTP endpoint and the existing installed consumer
reader ports. The caller must hold the operation authority and provide independently
verified registry/storage IDs, node, PVC UID, mount identity, exact Distribution image
digest and executable SHA256. Supplying strings is not proof of the installed runtime.
Task8 owns fencing, backup, execution and revalidation; these functions perform no
production deletion or garbage collection.

The census hashes physical global content and validates every revision link and
every extant manifest's complete dependency closure, including untagged index
children. API catalog/tag pages must agree with physical metadata; digest reads
must agree with storage bytes. Repository revision identity remains distinct from
shared blob identity. Unknown revisions, unsupported artifacts/referrers, unreadable
or malformed links, missing required dependencies, changed storage and incomplete
consumer/history evidence refuse planning. Unresolved upload files refuse; this
census does not reconcile abandoned publication or staging ownership.

Pinned Distribution2.8.3 returns unordered full tag lists even with `n=100`; page
size and ordering therefore cannot prove completeness. Link pagination is bounded,
restricted to the same origin/collection and independently checked against storage.
Native manifest deletion leaves empty revision-digest directories; offline GC leaves
empty global hash-shard directories. Valid historical tag-index and obsolete
repository layer links may outlive their content. They are metadata, not runtime
roots. Every current tag and every dependency of an extant revision still requires
valid content. Present orphan global content is hashed and listed separately; that
list grants no deletion authority.

Every validated consumer report's `references` remains a protection, including
history-role recovery references and global Docker-host references. Active history
`historySha256`, ordered releases and `currentReferences` must agree with authority
history, but those evidence fields create no extra permanent roots.

`planRegistryRetirement` returns exact `retireRevisions` pairs and shared
`retireBlobs` accounting. It binds the journal revision, ownership/source evidence,
physical census, filesystem identity and runtime identities. Capacity heartbeats
that leave obligations and revision unchanged do not invalidate a plan.
`assertRegistryPlan` requires a fresh complete census and exact recomputation before
Task8 can use the plan inside its exclusive fence. An inventory altered or reconstructed
by a caller loses its verification capability. Plans remain JSON serializable;
verification capabilities do not.

The disposable native proof runs with the amd64 binary extracted from
`registry:2.8.3@sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278`
(executable SHA256 `8be11cd37a7d43b87e2a2ad11eb5d14dc64d15a040a37485e7e1cbb4c6c9dd37`):

```sh
bun tools/tool-fleet/src/registry-inventory.native.ts /absolute/owned/path/registry
```

It creates only owned loopback synthetic storage under `/tmp/task7-census-*`, checks
root reserve and fixture allocation, exercises real catalog pagination and unordered
tags, injects missing dependency/corruption/truncation faults, retags and deletes one
owned revision, runs offline GC, then verifies remaining content and cleanup. Failed
fixtures retain their evidence and print their exact path. Consumer sources and
capacity inputs are synthetic; this proof does not certify installed readers,
production storage, publication admission, backup or destructive maintenance.

### Pull verification storage (staged)

The `registry_pulls` play provisions an independently bounded pull pool only after
canonical registry/journal storage verifies. Set explicit reviewed byte and inode
ceilings with `puni_registry_pulls_bytes` and `puni_registry_pulls_inodes`, plus
`puni_registry_pulls_enrolled=true`; see the
[storage role contract](../../infra/ansible/roles/registry_storage/README.md).
The root:root mode0711 pool has a root-owned identity receipt on the journal
filesystem. Its boot unit depends on canonical storage verification. The uncached
`tool-fleet:test:registry-pulls` rehearsal uses disposable filesystems only.
Client-worker/Crane installation and physical profile preflight are implemented
and rehearsed through the actual maintenance role; the linked role contract names
the uncached installation target. Complete installed lifecycle validation and the
exact-SHA gate remain required before live enrollment. This provisioning code has
not been applied to production.
