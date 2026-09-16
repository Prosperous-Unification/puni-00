# Claude Opus review of plan v1 (2026-09-15), condensed

Full findings were merged into plan v2 section 12. Kept here are the items
with external evidence, for re-verification.

- hcloud CSI has no VolumeSnapshot support (csi-driver issue #849 open; latest
  v2.23.0, 2026-09-03). Hetzner: no Backups or Snapshots for Volumes; server
  Backups and Snapshots exclude attached Volumes.
  https://github.com/hetznercloud/csi-driver/issues/849
  https://docs.hetzner.com/cloud/servers/backups-snapshots/faq/
- Rescale only to a plan with equal or larger disk, regardless of usage.
  https://docs.hetzner.com/cloud/servers/faq/
- ECK defaults: Kibana request and limit 2Gi; APM Server 512Mi; ES heap is
  derived from the memory limit.
  https://www.elastic.co/docs/deploy-manage/deploy/cloud-on-k8s/manage-compute-resources
- Hetzner Cloud Network MTU 1450; Flannel VXLAN needs 1400.
  https://docs.hetzner.com/networking/networks/troubleshooting/mtu/
  https://github.com/vitobotta/hetzner-k3s/issues/733
- k3s SQLite to embedded etcd is `--cluster-init` on the existing server;
  etcd S3 snapshots exist only on the etcd datastore.
  https://docs.k3s.io/datastore/ha-embedded#existing-single-node-clusters
  https://docs.k3s.io/cli/etcd-snapshot
- Elasticsearch watermarks: low 85, high 90, flood 95 sets
  read_only_allow_delete; ILM cannot clear it.
  https://www.elastic.co/docs/troubleshoot/elasticsearch/fix-watermark-errors
- k3s rewrites the bundled Traefik manifest at startup; own it via
  `--disable=traefik`.
  https://docs.k3s.io/networking/networking-services
- GoDaddy DNS API limited to accounts with 10+ domains; Let's Encrypt 50 new
  certs per registered domain per week, renewals exempt; HTTP-01 cannot issue
  wildcards.
  https://github.com/Fred78290/cert-manager-webhook-godaddy
  https://letsencrypt.org/docs/rate-limits/
  https://cert-manager.io/docs/configuration/acme/dns01/
- ingress-nginx retired March 2026.
  https://www.kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/
- Alertmanager Telegram receiver native since v0.24.
- Recommendation not adopted in v2: keep Victoria on h3 at stage 1 and adopt
  Elastic at stage 2, since logs are 4 MB a day. Listed as the budget variant
  in v2 section 3.
