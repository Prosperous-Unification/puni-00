# OTLP mTLS canary

Workers currently send unauthenticated OTLP across the private network. A private CIDR does not identify an enrolled workers cluster.

Add a native Collector TLS receiver on 14317 exposed through canary NodePort 30419. Workers use the existing `otlp` exporter and persistent queue with a client certificate, server trust bundle and explicit server name. Platform server and per-workers client signing CAs remain separate from runtime trust bundles. Flux installs cert-manager on workers and waits for issued certificates before telemetry.

The existing plaintext 30417 is explicitly temporary rollback state. Production activation requires two-cluster authentication, network, rollover and delivery proofs; final cutover assigns TLS to 30417 and removes private plaintext ingress. No failure silently falls back to plaintext.

This change does not deploy production, create real CA/DNS/SOPS material, configure real alert recipients, change memory guards or promise lossless telemetry. Queue capacity, disk failure and exporter timeout limitations remain observable constraints. It builds on current main b773e5f64d9b8eeb1bffcd9ceda099425f14297a; unrelated MinIO and alert changes remain independent.
