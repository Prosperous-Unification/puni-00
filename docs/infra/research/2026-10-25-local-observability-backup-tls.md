# Local observability backup TLS convergence

Research date: 2026-10-25. Source/manifests only; no infrastructure mutation or secret inspection.
Pins: MinIO `RELEASE.2025-09-07T16-13-09Z`, mc `RELEASE.2025-08-13T08-35-41Z`
([lock](../../../infra/versions/object-store.json)); Elasticsearch 9.3.8; Velero 1.18.2; AWS plugin 1.14.1.
Recommendations are proposals, not runtime proof. Relative links assume this file's intended
repository destination: `docs/infra/research/2026-10-25-local-observability-backup-tls.md`.

## Actual repository boundaries

- [Local MinIO/bucket Job](../../../infra/platform/backup/local/object-store.yaml): no TLS mount,
  HTTP readiness and mc alias; UID 1000; Job root is read-only with writable `/tmp`.
- [Local Elastic overlay](../../../infra/platform/observability/local/kustomization.yaml) replaces
  [shared Elasticsearch](../../../infra/platform/observability/elastic/base/elasticsearch.yaml)
  HTTPS snapshot protocol with HTTP. [Local Velero](../../../infra/platform/backup/velero/local/velero.yaml)
  uses HTTP; [production](../../../infra/platform/backup/velero/production/velero.yaml) uses HTTPS.
- [Snapshot apply/check](../../../infra/platform/backup/elastic/snapshots.yaml) already verify the
  Elasticsearch API with `/es-ca/ca.crt`; that is distinct from Elasticsearch's connection to S3.
- [backup-lab.ts](../../../tools/tool-deploy/src/k8s/backup-lab.ts) applies MinIO YAML directly,
  creates SQLite's S3 Secret with an HTTP endpoint and runs an S3 fault-upload helper.
  [backup-sqlite.ts](../../../tools/tool-fleet/src/backup-sqlite.ts) uses presigned fetch PUTs and
  native Bun S3Client GET/list. [The shipped runner](../../../deploy/k8s/wbs/base/backup.yaml)
  carries that source. Backup, restore, scheduled verification and fault upload need trusted TLS.
- [Local inputs](../../../infra/environments/local/inputs.json) advertise HTTP at
  `object-store.localhost`; reconcile actual exposure before choosing certificate SANs.
  [Etcd's Ansible template](../../../infra/ansible/roles/backup/templates/etcd-snapshots.yaml.j2)
  uses an independent operator endpoint; no direct in-cluster MinIO caller was found there.
- [platform.ts](../../../tools/tool-fleet/src/platform.ts) expects the HTTP Elastic patch.
  Update that contract and its tests. [Bucket tests](../../../tools/tool-fleet/src/object-store-buckets.test.ts)
  mock mc and do not prove TLS. [k3d-lab.ts](../../../tools/tool-fleet/src/k3d-lab.ts) prepares
  the local image before Flux; disposable TLS preparation must also precede its consumers.

## Verified upstream behavior

**MinIO.** The pinned source defines `--certs-dir`, `public.crt`, `private.key` and `CAs`
([paths](https://raw.githubusercontent.com/minio/minio/RELEASE.2025-09-07T16-13-09Z/cmd/config-dir.go)).
Its TLS loader returns TLS disabled when either certificate file is absent; malformed certificates
or mismatched keys return errors. Successful loading enables TLS; projected symlinks are reloaded
([loader](https://raw.githubusercontent.com/minio/minio/RELEASE.2025-09-07T16-13-09Z/cmd/common-main.go)).
Mount a Secret read-only with explicit filename mappings and UID-readable permissions. Add startup
refusal for absent/unreadable files, because absent files must not silently enable HTTP.

**Readiness.** Kubernetes HTTPS HTTP probes do not verify the server certificate
([probe contract](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)).
Changing only `scheme: HTTPS` proves reachability, not trust. Prefer an exec probe using a verified
client, rehearsal CA and service hostname. Pinned `mc ready` uses an anonymous client and retries
every five seconds until healthy; it needs a bounded external timeout
([command](https://raw.githubusercontent.com/minio/mc/RELEASE.2025-08-13T08-35-41Z/cmd/ready-main.go)).
It checks cluster health, which differs from the current `/minio/health/ready` handler
([handlers](https://raw.githubusercontent.com/minio/minio/RELEASE.2025-09-07T16-13-09Z/cmd/healthcheck-handler.go)).
Verify probe cancellation and failure exit behavior before selecting this command.

**mc.** The pinned client loads roots from its configuration directory's `certs/CAs`
([loader](https://raw.githubusercontent.com/minio/mc/RELEASE.2025-08-13T08-35-41Z/cmd/certs.go),
[constants](https://raw.githubusercontent.com/minio/mc/RELEASE.2025-08-13T08-35-41Z/cmd/globals.go)).
Its TLS transport uses that pool and explicit insecure setting
([transport](https://raw.githubusercontent.com/minio/mc/RELEASE.2025-08-13T08-35-41Z/cmd/client.go)).
With existing `MC_CONFIG_DIR=/tmp/mc`, prepare `/tmp/mc/certs/CAs` before alias setup; keep mc
configuration writable. No `--insecure` or `MC_INSECURE` is needed.

**Elasticsearch/JDK.** Official S3 settings require the JVM-wide truststore, managed with keytool;
custom CAs need reinstallation when the bundled JDK changes. Fully qualified HTTPS endpoints
avoid dependence on the legacy protocol setting
([Elastic settings](https://www.elastic.co/docs/reference/elasticsearch/configuration-reference/s3-repository-settings)).
No evidence supports `s3.client.default.ssl.certificate_authorities`; do not invent that setting.
Proposal: copy the pinned image's bundled cacerts into a generated writable store, import the
explicit rehearsal CA, retain public roots, and select it with JVM truststore properties.
JSSE selects `javax.net.ssl.trustStore` instead of its default; a nonexistent explicit store yields
an empty truststore ([JSSE](https://docs.oracle.com/en/java/javase/25/security/java-secure-socket-extension-jsse-reference-guide.html)).
Exact ES 9.3.8 source was unavailable. Bundled-JDK version/path, entitlement access and ECK mount
permissions require pinned image inspection plus real repository verification and restore.

**Velero/AWS.** Pinned Velero 1.18.2 resolves `objectStorage.caCertRef` from its Secret store,
passing PEM to the plugin as caCert; inline caCert is also supported
([core](https://raw.githubusercontent.com/vmware-tanzu/velero/v1.18.2/pkg/persistence/object_store.go)).
AWS plugin 1.14.1 appends PEM to system roots; verification remains enabled unless explicitly
skipped. It does not check AppendCertsFromPEM's boolean, so validate CA input and prove trust
failures ([AWS TLS](https://raw.githubusercontent.com/velero-io/velero-plugin-for-aws/v1.14.1/velero-plugin-for-aws/config.go)).
The [v1.18 guide](https://velero.io/docs/v1.18/self-signed-certificates/) recommends a same-namespace
CA Secret and documents CLI certificate discovery and filesystem-backup trust.

**Bundled chart.** Read-only tar extraction of `infra/platform/charts/velero-12.2.0.tgz` found:
its BSL CRD supports caCertRef, but `templates/backupstoragelocation.yaml` emits only `.caCert`.
However, `values.yaml` and its JSON schema support `extraObjects`; `extra-manifests.yaml` emits
`tpl (toYaml .)` for each entry. The stock BSL template ranges configuration.backupStorageLocation.
Bounded option: set that slice to `[]`, keep backupsEnabled enabled, and emit the same
`puni-backup/default` BSL in extraObjects with objectStorage.caCertRef. Deployment's default
location flag reads the separate configuration.defaultBackupStorageLocation setting. This avoids
broad post-rendering or Flux substitution. Prove exactly one BSL, stable Helm ownership and the
same production BSL semantics in rendered output; no Helm render/runtime was run here.

**Bun callers.** Official fetch supports `tls.ca`
([fetch](https://bun.sh/docs/runtime/networking/fetch)); official S3Options exposes no tls/ca field
([API](https://bun.sh/reference/bun/S3Options)). Installed bun-types confirms that distinction:
`globals.d.ts` has fetch TLS options, while `s3.d.ts` has no S3 TLS option. Do not assume
S3Client({tls}) works or that fetch trust covers native GET/list. Pin-aware process-wide CA
loading (for example NODE_EXTRA_CA_CERTS at process launch) needs an exact Bun 1.4.4 runtime
test for fetch and native S3; it is not an assumed supported S3Client option. Preserve public roots.

## Bounded implementation and remaining proofs

1. Prepare disposable CA/server identity before either Flux or standalone backup-lab consumers;
   mount explicit trust in each consuming namespace. Keep private keys and production credentials
   out of repository configuration. Serve existing service DNS through verified HTTPS.
2. Share executable trust preparation, with explicit public-system-roots and system-roots-plus-
   rehearsal-CA modes. Use mc, Java and Velero adapters; execute the same security/recovery path
   in both environments, permitting narrowly scoped CA and endpoint identities to differ.
3. Update every caller above, including backup-lab bootstrap and both Bun transports. Compare
   effective rendered security fields; do not exempt whole pod/initContainer/JVM/BSL subtrees.
4. Prove mc buckets, ES `_verify` plus snapshot/restore, Velero filesystem backup/restore, CLI
   download and repository-maintenance/node-agent trust. Inject missing/unreadable/malformed CA,
   untrusted signer, wrong hostname, missing server key/cert and accidental HTTP; demonstrate
   each production-path refusal and then break its check per R5.

No builds, containers, services, gates or TLS handshakes ran. No pinned MinIO/mc binaries were
present at dist/tool-fleet/object-store. Shell network lookup failed DNS; browsing supplied the
pinned sources above but not ES 9.3.8 or Velero Kopia CA propagation source. Official docs establish
supported mechanisms, not proof of the composed runtime. Kopia propagation, Bun native S3 trust,
probe timeout/cancellation and public-root preservation remain explicit acceptance checks.
