## Metric provenance

Workers hostmetrics already emits system_memory_usage_bytes; the gateway remote-write exporter converts puni.cluster to puni_cluster (k3s-fleet verify.md, live cross-cluster telemetry). Add the producer namespace as a resource attribute so host metrics also carry k8s_namespace_name. The base selects workers-local; production patches workers-production.

ECK and the current one-shot snapshots Job expose no SLM success timestamp. A CronJob using the existing locked Elasticsearch image validates the filtered SLM JSON with Bash and date. Its kube-state-metrics last successful time proves a recent successful freshness check. Prometheus adds puni_cluster to kube-state-metrics samples; production overrides platform-local to platform-production. Rules require cluster, namespace and CronJob name. No new image or assumed Elasticsearch exporter metric is introduced.
