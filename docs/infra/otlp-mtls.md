# Cross-cluster OTLP mTLS

The checked-in graph is the authenticated canary stage. Workers send to TLS NodePort **30419**, receiver **14317**, with exporter ID `otlp` and the existing queue/checkpoint paths. In-cluster 4317/4318 remain available. Plaintext NodePort **30417** is explicitly temporary rollback state. No TLS failure falls back to it. Production activation is pending the proofs in [the change](../../openspec/changes/otlp-mtls-canary/verify.md).

## Certificate ownership

| Cluster              | Signing Secret                 | Runtime leaf      | Public runtime trust |
| -------------------- | ------------------------------ | ----------------- | -------------------- |
| Platform             | `observability/otel-server-ca` | `otel-server-tls` | `otel-client-trust`  |
| Each workers cluster | `observability/otel-client-ca` | `otel-client-tls` | `otel-server-trust`  |

Signing Secrets use `tls.crt` and `tls.key` and belong only to namespace-scoped cert-manager Issuers. Each workers cluster has a separate signing CA; the platform client trust bundle contains only enrolled workers CAs. The server CA is independent. Runtime trust Secrets contain **only `ca.crt`**, a PEM public CA bundle. Runtime Pods mount leaves and the opposite public trust bundle, never signing keys.

Local values are disposable rehearsal material. Production signing/trust material must be operator-provisioned through the cluster's SOPS Secret graph and escrowed. Entries in `externally-provided.json` declare prerequisites; they do not create working Secrets. Do not commit plaintext signing keys or use the server signing CA for workers.

The platform server certificate identifies `otel-gateway.puni.internal`. Workers verify that name through `PUNI_TELEMETRY_SERVER_NAME`, even when a local lab connects through `host.k3d.internal`. Verify production private DNS before activation. Cert-manager issues 24h ECDSA leaves with new keys and renews 8h before expiry. Flux waits for a Ready condition whose observed generation equals the Certificate generation. Missing signing material blocks readiness; missing/unreadable runtime material blocks startup. Cert-manager CA issuers do not rotate signing roots automatically; operators must track root lifetime.

## Renewal and root rollover

The pinned [Collector TLS implementation](https://github.com/open-telemetry/opentelemetry-collector/blob/v0.160.0/config/configtls/configtls.go) reloads leaf files at the next handshake after the configured one-minute interval. Receiver client-CA trust reloads only with `client_ca_file_reload: true`; outgoing server CA trust requires an **agent DaemonSet rollout**. Project whole Secret volumes, never `subPath`, so Kubernetes projects updates.

1. Publish old+new public client CA trust on the platform and old+new server CA trust on workers. Validate the staged bundles, prove projection, then perform controlled rollouts of both `otel-collector` and each `otel-agent` DaemonSet before verified peer handshakes. Dynamic receiver reload alone is not the activation oracle.
2. Rotate the relevant issuer signing Secret, renew its Certificate, wait for current-generation Ready, and prove an OTLP log and host metric from every expected workers cluster.
3. Prove the renewed server leaf and client leaf on new handshakes. Keep old signing material through the rollback window.
4. Wait for old sessions to expire, then remove old public trust, perform controlled receiver and agent rollouts, and prove retired clients fail while new leaves export.

The receiver config uses `max_connection_age: 5m` and `max_connection_age_grace: 30s`. [grpc-go adds ±10% jitter](https://pkg.go.dev/google.golang.org/grpc/keepalive#ServerParameters): the conservative forced-close bound is **300s × 1.10 + 30s = 360s (6m)**. Trust removal does not immediately revoke an established session. After startup, a missing or malformed client-CA file retains the previous valid trust pool in the pinned upstream implementation. Replace it with a valid reviewed bundle and prove handshake refusal; file deletion is not revocation. Post-start corruption alerting remains an activation review item. CA cutover requires valid staged bundles, controlled receiver/agent restart and verified peer handshakes; dynamic overlap reload does not establish fail-closed behavior for corrupted input. Require architect review of this bound and the observed session proof before activation.

## Cutover and rollback

Activation requires real no/foreign/wrong-EKU/expired client, wrong-server-CA/hostname, plaintext bypass, missing/unreadable material, renewal, CA overlap, existing-session expiry, persistent queue recovery and expected-worker alert delivery proofs in two clusters. A standalone Collector handshake is narrower evidence and does not satisfy the cluster gate. Keep WBS 070.07 in progress until node rollout, representative log/metric arrival and its other alerts/outage obligations also pass.

After those proofs, switch NodePort 30417 to TLS receiver14317, move workers upstream to 30417, prove delivery, then remove canary 30419 and private ingress to plaintext 4317. Preserve in-cluster 4317/4318. Update the validator and canary marker alongside that reviewed transition; never loosen validation as a shortcut. Repeat no-client and plaintext probes against the final endpoint, plus cross-namespace/private-network isolation and alert resolution.

During the staged rollback window, restore the reviewed plaintext worker exporter configuration and upstream 30417 explicitly, retaining exporter ID `otlp`, `file_storage/queue`, `file_storage/checkpoints`, `/var/lib/otelcol/queue` and `/var/lib/otelcol/checkpoints`. Reverting the upstream alone sends TLS to plaintext and fails. After plaintext ingress is removed, rollback first requires restoring its reviewed route/policy; do not reopen it incidentally while rotating trust.

Persistent queues are bounded and depend on local disk. Existing exporter timeout behavior can lose records; measure counts and alert state during drills. This change makes no lossless-delivery claim.
