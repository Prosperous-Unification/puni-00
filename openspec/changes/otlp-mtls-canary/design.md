# Native Collector TLS staging

Use pinned Collector 0.160.0 TLS. Keep in-cluster 4317/4318, exporter `otlp`, storage extension IDs and queue paths stable. Canary TLS 14317/30419 is independently routable from rollback 4317/30417. The workers upstream ConfigMap declares `transport: mtls-canary`.

Platform owns `otel-server-ca`; each workers cluster owns its own `otel-client-ca`. Namespace-scoped cert-manager Issuers create separate leaves. Runtime public trust bundles are `otel-client-trust` and `otel-server-trust`. Runtime Pods mount leaves and opposite trust only, never signing Secrets. Leaves use ECDSA key rotation, 24h duration and 8h renewal window. Operators own signing CA expiry and rollover.

Workers install cert-manager only. The certificate stage depends on controllers and secrets. Telemetry depends on current-generation Ready certificates. Missing material fails certificate readiness or Collector startup.

Leaves reload on a subsequent handshake with a one-minute reload interval. Pinned receiver TLS reloads client CA trust; outgoing server CA changes require agent rollout. Receiver connections have five-minute maximum age plus 30s grace, forcing reauthentication. Trust removal does not immediately revoke existing sessions.

Root rollover: publish old+new public trust; roll agents for outgoing trust; issue and prove new leaves; wait for old sessions to expire; remove old trust. Retain old signing material during the rollback window. Plaintext rollback requires explicitly restoring the reviewed plaintext exporter configuration and upstream, with queue identity preserved.

Production activation remains pending until no/foreign/wrong-EKU/expired client, wrong server CA/hostname, plaintext bypass, missing material, renewal, overlap rollover, session expiry, queue and expected-worker alert evidence passes in two clusters. Resource guards remain unchanged. The final desired graph exposes TLS on 30417 and closes private plaintext 4317.
