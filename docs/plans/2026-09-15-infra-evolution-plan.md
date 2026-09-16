# Infra evolution plan: k3s on Hetzner, Elastic logs, Prometheus metrics

Status: draft v2, 2026-09-15, revised after two independent reviews (Codex
gpt-5.6-sol at high effort, and a Claude Opus subsession with web
verification). Nothing is implemented. Server prices are Hetzner Helsinki
list prices in USD excluding VAT from the console on 2026-09-15. Add-on prices
are EUR from secondary 2026 sources; confirm in the console before buying.
Section 12 lists what changed from v1 and why.

## 1. What exists today (verified over SSH, 2026-09-15)

| Host        | Where              | Size                                    | Disk                         | Role today                                                                                                                                   | State                    |
| ----------- | ------------------ | --------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| h1 / h1claw | Ashburn            | 4 vCPU, 8 GB, 75 GB                     | 80% used                     | OpenClaw gateway (claire), Postgres, Caddy, secrets, PAT, the SQLite backup puller                                                           | up 34 d                  |
| h2 / h2puni | Helsinki, 10.1.0.3 | 8 vCPU, 15 GB usable, 150 GB, 8 GB swap | 85% used, 3.5 GB swap in use | WBS prod blue/green, wbs-dev-src, aivn dev, aivn studio dev, Caddy edge, self-hosted registry, netdata, Vector, GoAccess, gate and build box | load avg 9 on 8 cores    |
| h3 / h3mon  | Helsinki, 10.1.0.2 | 4 vCPU, 8 GB, 150 GB                    | 6% used                      | Compose: OTel Collector, VictoriaMetrics, VictoriaLogs, VictoriaTraces, vmauth, Grafana, MLflow                                              | logs volume 109 MB total |
| h4 / h4claw | Helsinki, 10.1.0.4 | 4 vCPU, 8 GB, 150 GB                    | 7% used                      | OpenHands 1.8                                                                                                                                | idle                     |

Facts that shape the plan:

- Products: WBS (prod `wbs.bulletpoints.club`, dev `dev.wbs.bulletpoints.club`),
  novel / aivn and aivn studio (dev only, `*.fd165.com`), MLflow SDLC telemetry
  on h3, the claire harness on h1, and Twilight, whose ADR 0016 commits to k3s
  for an expandable worker pool with manual node join in M1.
- WBS `be-01` uses `bun:sqlite`: one writer per database. The prod swap health
  gates the idle colour, repoints Caddy, drains WebSockets, stops the old colour,
  runs smoke, and applies additive migrations with a `down.sql` rollback. Any
  Kubernetes replacement must keep every one of those guarantees.
- Dev is source-run from a bind-mounted checkout in one container with Bun
  watch and Vite HMR. The deploy is `git reset --hard`. This inner loop is
  preserved unchanged.
- h2 is the only build and gate box and the only prod box. Its load, disk,
  tmpfs OOM and inode incidents all come from gates and builds sharing prod.
  `bin/publish-release.sh` refuses below 8 GiB free RAM, and `bin/h2puni-gate.sh`
  takes a host-wide lock. Kubernetes pods would not respect either.
- The live SQLite backup is an hourly `VACUUM INTO` snapshot of the four
  databases, pulled to h1claw, promoted into generations, and copied encrypted
  to Hetzner Object Storage bucket `puni-01`. Restores have been drilled. The
  crypt password escrow off h1claw is still pending.
- GitHub Actions billing refusals have blocked CI before. CI must stay runnable
  on owned hardware.
- DNS for both domains is at GoDaddy. GoDaddy's DNS API is restricted to
  accounts with ten or more domains, so DNS-01 there is not available.
- A Hetzner private network (10.1.0.0/16, MTU 1450) already joins h2, h3, h4.
- Hetzner Cloud Volumes have no snapshots, and Hetzner server backups exclude
  attached Volumes. Anything on a Volume must be backed up by software.
- Browser-use cloud drives dev QA from the public internet, so dev hostnames
  must be publicly reachable behind auth.
- Logs today are about 4 MB a day. Elastic is chosen for its search UI and
  ecosystem, not for volume. That is a decision worth an ADR (section 10).

## 2. Target architecture

One k3s cluster in Helsinki. Node capability is expressed as independent
boolean labels so one machine can hold several roles at the start and shed
them later without a manifest change.

| Label                                              | Taint                                                                | Runs                                                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `puni.io/core=true`                                | none                                                                 | k3s server, Flux, cert-manager, hcloud CCM and CSI, product prod and staging namespaces               |
| `puni.io/obs=true`                                 | `puni.io/obs=true:NoSchedule`, applied only once obs is its own node | ECK operator, Elasticsearch, Kibana, APM Server, Prometheus, Alertmanager, Grafana, blackbox-exporter |
| `puni.io/forge=true`, `puni.io/forge-shard=<name>` | `puni.io/forge=true:NoSchedule`                                      | dev pods per worktree, in-cluster registry, later gates and builds                                    |
| `puni.io/ingress=true`                             | none                                                                 | Traefik with hostPort 80 and 443                                                                      |

Platform DaemonSets (OTel Collector, node-exporter, CSI node plugin) tolerate
every taint. Dev pods are the only hostPath users and pin by
`puni.io/forge-shard`, never by node name.

### 2.1 Platform components

| Concern           | Choice                                                                                                                                                                                                                                                                       | Why                                                                                                                                                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kubernetes        | k3s, pinned minor, embedded etcd (`--cluster-init`) on one server                                                                                                                                                                                                            | the only reason is `k3s etcd-snapshot` with S3 upload; SQLite to etcd is otherwise a one-flag migration. etcd data stays on local NVMe, never on a Volume. `--etcd-snapshot-schedule-cron` every 6 h to Object Storage. kube-reserved and system-reserved set so the control plane cannot be squeezed |
| Cloud integration | hcloud CCM and hcloud CSI, versions pinned, k3s started with `--disable-cloud-controller`                                                                                                                                                                                    | node addresses, Volumes as PersistentVolumes with online expansion. No VolumeSnapshots: the driver and the Hetzner API do not have them                                                                                                                                                               |
| Networking        | Flannel VXLAN on the private interface: `--flannel-iface`, `--node-ip=<private>`, MTU 1400, TCP MSS clamp; a join-time check that `ping -M do -s 1372` crosses nodes                                                                                                         | Hetzner private networks cap MTU at 1450; wrong MTU gives intermittent TLS hangs that look like app bugs                                                                                                                                                                                              |
| Ingress           | `--disable=traefik,servicelb`; Traefik installed by Flux as a HelmRelease with hostPort 80 and 443 on `puni.io/ingress` nodes                                                                                                                                                | bundled Traefik is rewritten by k3s at every start; owning the chart is what makes upgrades explicit. ingress-nginx reached end of maintenance in March 2026. Gateway API is the expected later migration                                                                                             |
| TLS               | cert-manager, Cloudflare DNS-01, one wildcard per product domain                                                                                                                                                                                                             | HTTP-01 cannot issue wildcards; GoDaddy's API is unavailable to this account. Delegating only `_acme-challenge` CNAMEs to a Cloudflare zone is the alternative if the nameservers must stay                                                                                                           |
| GitOps            | Flux with SOPS and age, mandatory from stage 1                                                                                                                                                                                                                               | secrets delivery, the "prod changes only via Git" control and preview environments all depend on it                                                                                                                                                                                                   |
| Registry          | on forge: `registry:2` with read-only-mode garbage collection weekly, or Zot                                                                                                                                                                                                 | keeps builds and deploys off GitHub billing. Only product images live here; platform images come from public registries, so a cold cluster rebuild does not depend on it                                                                                                                              |
| Provisioning      | Terraform with the plain `hcloud` provider for servers, Volumes, network, firewall, primary IPs; Ansible for the Ubuntu base and k3s install                                                                                                                                 | Ubuntu userland is needed on forge for the gate scripts; kube-hetzner's MicroOS images would not run them                                                                                                                                                                                             |
| Logs              | OpenTelemetry Collector DaemonSet; Elasticsearch, Kibana, APM Server via ECK                                                                                                                                                                                                 | decided 2026-09-15; record as ADR                                                                                                                                                                                                                                                                     |
| Metrics           | kube-prometheus-stack plus blackbox-exporter installed separately                                                                                                                                                                                                            | preconfigured node and cluster alerts; blackbox is not in the chart                                                                                                                                                                                                                                   |
| Traces            | OTLP to APM Server, head-based sampling                                                                                                                                                                                                                                      | tail-based sampling is a paid Elastic tier                                                                                                                                                                                                                                                            |
| Backups           | Velero File System Backup (kopia) of every PVC to Object Storage daily; Elastic SLM daily; the existing SQLite pull pipeline retargeted at the PVC path; etcd snapshots every 6 h; nightly rclone of raw transcripts; an rclone sync of the whole bucket to an `fsn1` bucket | Hetzner server backups are not bought: they skip Volumes                                                                                                                                                                                                                                              |
| Recovery secrets  | k3s server token, the Flux age private key, the SQLite crypt password and the rclone key escrowed in a password manager plus one printed copy                                                                                                                                | without the age key a rebuilt cluster cannot read any secret                                                                                                                                                                                                                                          |
| External check    | Better Stack or UptimeRobot free tier on prod hostnames, plus a dead-man switch from Alertmanager                                                                                                                                                                            | detects the cluster being gone                                                                                                                                                                                                                                                                        |
| Alerts            | Alertmanager to Telegram, native since v0.24                                                                                                                                                                                                                                 |                                                                                                                                                                                                                                                                                                       |

### 2.2 Products, environments and people

Conventions fixed at stage 1 and never changed:

- Namespace `<product>-<env>`, env one of `prod`, `staging`, `dev-<slug>`.
- Hostnames: prod `<product>.<domain>`, staging `staging.<product>.<domain>`,
  dev `<slug>.dev.<product>.<domain>`. Wildcards `*.dev.wbs.bulletpoints.club`
  and `*.dev.novel.fd165.com` point at the ingress address.
- Each product repo carries `deploy/k8s/base` plus `overlays/{prod,staging,dev}`.
  Flux reconciles staging from `main` by image automation. Prod reconciles from
  a promotion commit that pins the digest staging proved, gated by the e2e
  suite. Staging and prod never move on the same commit.
- One dev environment is one worktree, one dev pod, one hostname.
  `bin/dev-env.sh up|down <slug>` creates the namespace, the hostPath
  Deployment pinned to the forge shard holding the worktree, the Service and the
  Ingress. Dev pods are outside Flux.
- Adding a person: a Unix user on a forge shard, a ServiceAccount with
  RoleBindings in their own `dev-*` namespaces only. Pod Security Admission
  `restricted` on every dev namespace; hostPath is granted only to the
  dev-env script's ServiceAccount through a ValidatingAdmissionPolicy that
  allowlists the worktree path prefix. OIDC-backed kubeconfigs replace
  ServiceAccount tokens when there are more than about five people.
- Every dev namespace gets a ResourceQuota and a LimitRange with defaults. A
  ValidatingAdmissionPolicy rejects prod pods without explicit requests and
  limits. Stateful pods run Guaranteed (requests equal limits).
- Default-deny NetworkPolicies between namespaces; explicit allows to ingress
  and to the collector.
- Secrets: SOPS-encrypted in the product repo, decrypted by Flux with the age
  key that also lives in escrow.

### 2.3 Networking and exposure

- All cluster traffic uses the private network. It is unencrypted and Hetzner
  Cloud Firewalls do not filter it, so every node also runs nftables allowing
  only the k3s, Flannel and registry ports from 10.1.0.0/16.
- Cloud Firewall on public interfaces: 80 and 443 on ingress nodes; 22 and
  6443 from the admin IP list and h1; nothing else.
- Primary IPv4 addresses are standalone resources. A rebuilt server keeps its
  IP. DNS TTL 300.
- Kibana and Grafana are not public. They are reached over the private network
  through an SSH tunnel or Tailscale (h1 already has a tailnet). Transcripts
  contain pasted credentials and source; basic auth is not enough.
- Dev hosts sit behind Traefik basic auth middleware with the existing
  browser-use credentials.
- Stage 1 has one ingress node. When it reboots, prod and dev are down for the
  reboot. Stage 2 removes that with a Hetzner Load Balancer and a second
  ingress node.

## 3. Stage 1: starter

Goal: move prod off h2 onto a cluster that fits, get Elastic and Prometheus
live on their own node, change nothing about how h2 runs dev, gates and
builds. Two new servers. h2 is not joined to the cluster at this stage: its
gate lock and publish refusals assume they own the host, and a scheduler would
start pods in the middle of a gate.

| Node                | Type                                            | Spec                                      | USD / month                      |
| ------------------- | ----------------------------------------------- | ----------------------------------------- | -------------------------------- |
| core, also ingress  | CCX23                                           | 4 dedicated vCPU, 16 GB, 160 GB           | 101.49                           |
| obs                 | CPX42                                           | 8 shared vCPU, 16 GB, 320 GB              | 81.99                            |
| forge               | existing h2, outside the cluster                | unchanged                                 | unchanged                        |
| Primary IPv4 x2     |                                                 |                                           | 1.20                             |
| Volumes 220 GB      | ES 100, Prometheus 50, products 20, registry 50 | EUR 0.0572 per GB                         | about EUR 12.60                  |
| Object Storage      | already paid for `puni-01`                      |                                           | 0 new                            |
| Load Balancer       | none yet                                        |                                           | 0                                |
| **Gross new spend** |                                                 |                                           | **184.68 USD + about 12.60 EUR** |
| Retirement credits  | h3 after the parallel run, h4 now               | cost-optimized CX types, read the invoice | minus their current price        |

CCX23 rather than CPX42 for core because Hetzner refuses a rescale to a
smaller disk: CPX42's 320 GB would block every later CCX step until CCX43.
CCX23 (160 GB) rescales to CCX33 (240 GB) and CCX43 (360 GB) in place. Obs is a
separate node from day one because Elasticsearch, Kibana and Prometheus at
their real requests do not fit beside prod in 16 GB.

Budget variant: keep the Victoria stack on h3 for stage 1 and adopt Elastic at
stage 2. Saves 81.99 USD a month and the ECK build-out. Logs are 4 MB a day.
This is the reviewers' recommendation; the plan keeps Elastic at stage 1 as
decided, and lists the variant so the cost of that decision is visible.

Memory on core, 16 GB nominal, about 15 GB usable, limits not requests:

| Component                                                       | GB  |
| --------------------------------------------------------------- | --- |
| OS, kubelet, containerd, page cache reserve                     | 2.0 |
| k3s server with embedded etcd, Flannel, CoreDNS, metrics-server | 1.5 |
| Traefik, cert-manager, Flux controllers, hcloud CCM and CSI     | 1.5 |
| OTel Collector, node-exporter                                   | 0.5 |
| Velero node agent                                               | 0.5 |
| WBS prod: be-01, gw-01, fe-01, mcp-01, doubled during a swap    | 2.0 |
| Novel prod or staging, image-based only                         | 1.0 |
| Headroom                                                        | 6.0 |

Memory on obs, same basis:

| Component                                                     | GB  |
| ------------------------------------------------------------- | --- |
| OS, kubelet, containerd reserve                               | 2.0 |
| k3s agent, Flannel, OTel Collector, node-exporter             | 1.0 |
| ECK operator                                                  | 0.5 |
| Elasticsearch, limit 4 Gi, heap 2 GB, memory_lock, Guaranteed | 4.0 |
| Kibana, ECK default 2 Gi                                      | 2.0 |
| APM Server, 0.5 Gi                                            | 0.5 |
| Prometheus 30 d, Alertmanager, kube-state-metrics, blackbox   | 3.0 |
| Grafana                                                       | 0.5 |
| Headroom                                                      | 1.5 |

Source-run dev environments (wbs-dev-src, novel, studio) stay on h2 exactly as
today. MLflow stays on h3 until the section 10 decision.

Mandatory at stage 1: Flux with SOPS, Velero FSB, etcd S3 snapshots, escrow
of the four recovery secrets, the external uptime check, Alertmanager to
Telegram, blackbox probes on the prod hostnames.

Skippable at stage 1: APM traces, staging namespaces, system-upgrade-controller
(upgrades are manual and rare), Gateway API.

## 4. Stage 2: production with users

Goal: no single machine reboot takes prod down, dev pods on the cluster, a
rehearsed recovery for every data store. Two changes of hardware.

| Node                                                   | Type                                                               | Spec                                                                                           | USD / month                   |
| ------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------- |
| core, ingress                                          | CCX23, rescale to CCX33 only if requests exceed 12 GB              | 4 dedicated vCPU, 16 GB, 160 GB                                                                | 101.49                        |
| obs, ingress                                           | CPX42                                                              | 8 shared vCPU, 16 GB, 320 GB                                                                   | 81.99                         |
| forge shard a                                          | CPX42, new server; h2 retires after its jobs move                  | 8 shared vCPU, 16 GB, 320 GB local NVMe for worktrees and node_modules                         | 81.99                         |
| Primary IPv4 x3                                        |                                                                    |                                                                                                | 1.80                          |
| Load Balancer LB11 in front of Traefik on core and obs |                                                                    |                                                                                                | about EUR 7.49                |
| Volumes 350 GB                                         | ES 150, Prometheus 50, products 50, registry 50, Velero scratch 50 |                                                                                                | about EUR 20.00               |
| Object Storage                                         | 1 TB included; SLM and Velero share it                             |                                                                                                | 0 to EUR 6.49 overage         |
| **Gross**                                              |                                                                    |                                                                                                | **267.27 USD + about 34 EUR** |
| Net                                                    | minus h2 (retired) and the stage 1 credits                         | rescaling h2 in place would reprice it at 2026 rates, which is why it is replaced not rescaled |                               |

What changes from stage 1, in order:

1. Load Balancer LB11 with TCP services 80 and 443 to Traefik on core and obs.
   Obs tolerates its own taint for Traefik only. DNS moves to the LB address.
   From here a core reboot no longer drops ingress; prod pods on core still
   restart, about two minutes, until stage 3.
2. New forge server, joined with the forge taint, `forge-shard=a`, kube and
   system reserved sized so Dagger's 8 GiB check is computed against what the
   host actually has. `bin/h2puni-gate.sh` cordons the shard while a gate runs
   and uncordons after, so the scheduler cannot start a dev pod mid-gate.
   Docker and containerd coexist on the node only for Dagger; the FORWARD
   chain and iptables interaction is tested before the first gate.
3. Dev pods replace `wbs-dev-src` with the same bind mount, uid 1000 and env
   files. The in-cluster registry starts on forge; h2's registry is retired
   after Dagger pushes to the new one.
4. Staging namespaces fed by Flux image automation; prod by promotion commits.
   This restores the prod dry-run that dev stopped proving on 2026-08-04.
5. Restore drills as CronJobs, each alerting on failure: weekly Velero restore
   of the WBS PVC into a scratch namespace, then assert the migration table
   matches the expected set and a known row exists; monthly Elastic snapshot
   restore into a `restored-` index; quarterly etcd restore into a throwaway
   CPX22 including deleting stale VolumeAttachments and checking every PVC binds.
6. Elastic heap to 4 GB (limit 8 Gi) when the ingest rate justifies it, which
   is when the obs node also grows to CPX52.
7. Second forge shard when more than about three people or agents gate
   concurrently.
8. Optional: move h1 claire to a CPX22 in Helsinki (22.99 USD) so the harness
   and the backup puller sit on the private network. Out of scope here.

## 5. Stage 3: scaling

Every module is optional and independently adoptable. Each row is a trigger,
a price, and the design work it needs; the last column is not "change a
number" for three of them.

| Module                       | Nodes                                                                                                                                   | USD / month            | Trigger                                                                     | Design needed                                                                                                                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HA control plane             | 3x CCX23 servers, etcd quorum                                                                                                           | 304.47                 | a control-plane outage costs more than its price                            | a fixed registration address for 6443 (a second LB11 TCP service or a floating IP), `--tls-san`, join order, placement groups spread across hosts, quorum recovery runbook. All three are in one Hetzner location; this is host-loss HA, not region HA |
| App pool                     | 3x CCX33, prod only                                                                                                                     | 488.97                 | prod requests exceed one core node, or a product needs two replicas         | PodDisruptionBudgets, anti-affinity, HPA; three nodes not two, so a Postgres quorum has three failure domains                                                                                                                                          |
| Elastic 3 data nodes         | 3x CPX42                                                                                                                                | 245.97                 | more than about 5 GB a day indexed, or search must survive an obs node loss | this is a reindex, not a resize: shard counts are fixed at index creation and replicas go 0 to 1, doubling disk. Budget 2x the volumes                                                                                                                 |
| Prometheus HA                | 2 replicas plus Thanos sidecar to Object Storage, Alertmanager x3                                                                       | volumes only           | metrics must survive an obs node loss                                       |                                                                                                                                                                                                                                                        |
| Postgres via CloudNativePG   | 3 instances on the app pool, synchronous quorum, WAL archive and base backups to Object Storage                                         | volumes only           | a product needs more than one backend replica                               | WBS off SQLite is its own OpenSpec change: schema translation, the migration and down.sql regime, data cutover, pooling. Until it is written, stage 3 assumes WBS stays single-writer and the app pool serves other products                           |
| Forge pool                   | 2 to 4x CPX42                                                                                                                           | 81.99 each             | gate queue wait exceeds about 10 minutes                                    |                                                                                                                                                                                                                                                        |
| Twilight worker cluster      | separate k3s cluster; M1 joins CPX32 agents by hand per ADR 0016; the cluster-autoscaler hetzner provider is the later Terragrunt scope | 41.99 per node, hourly | ADR 0016 M1                                                                 |                                                                                                                                                                                                                                                        |
| Preview environments on push | Flux Kustomization per branch generated from the image automation                                                                       | none                   | more than one person needs image-based previews                             |                                                                                                                                                                                                                                                        |
| Gateway API                  | replaces Ingress objects                                                                                                                | none                   | Traefik or the Ingress API forces it                                        |                                                                                                                                                                                                                                                        |
| Second-region copy           | `fsn1` bucket already synced at stage 1; a warm CPX22 in `fsn1` with etcd snapshots                                                     | 22.99                  | a Helsinki incident must not mean a day of rebuild                          |                                                                                                                                                                                                                                                        |

Itemized baseline with the first four modules, Postgres and two forge shards:
servers 304.47 + 488.97 + 245.97 + 163.98 = 1,203.39 USD; IPv4 x9 5.40;
Volumes about 800 GB about EUR 46; LB11 x2 about EUR 15; Object Storage
overage about EUR 10. About 1,210 USD plus 71 EUR a month.

## 6. Invariants that keep the 1 to 2 to 3 path smooth

- Workloads select nodes by `puni.io/*` labels. The only node pinning is dev
  pods by `puni.io/forge-shard`. No node names, no IPs.
- hostPath exists only on forge, only from the dev-env ServiceAccount, only
  under the allowlisted worktree prefix.
- Every stateful thing is a PVC with `allowVolumeExpansion`. Sizes start small
  and grow online. They never shrink.
- Elasticsearch index templates, `number_of_replicas: 0`, ILM and SLM exist
  before the first document. The single-to-three-node move is a planned
  reindex and is the one large data-store change in the path.
- Server types change by rescale with "keep disk"; the stage 1 choice of
  CCX23 exists so that every later step is a rescale. Rescale reprices at
  current rates.
- Primary IPs are standalone. DNS TTL 300.
- Cluster state lives in Git, on Volumes, or in Object Storage. A cold rebuild
  is Terraform, Ansible, Flux bootstrap, then Velero and SLM restores. The
  recovery secrets are in escrow. etcd snapshots make the rebuild faster; they
  do not restore Volume contents and the drill deletes stale VolumeAttachments.
- Products stay ignorant of Kubernetes: env and files for config, JSON to
  stdout, OTLP for traces. The same image runs under Compose on a laptop.
- Dev pods use the prod base image `oven/bun:1.4.2` pinned to the host Bun.
- The WBS deploy contract on Kubernetes (section 9) is written before the
  first prod pod exists.

## 7. Failure modes and the control for each

| Failure                             | Detection                                                                                            | Control                                                                                                                                                                                                                                                                   | Drill                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Node disk fills from images         | node-exporter alert at 75%                                                                           | kubelet image GC 75/60 on core and obs, 85/75 on forge so base images survive between gates; pinned base images; `nodefs.available<10%` eviction is the hard floor                                                                                                        | fill a scratch PVC in a dev namespace                        |
| Node disk fills from container logs | same                                                                                                 | kubelet `container-log-max-size=50Mi`, `container-log-max-files=5`; journald `SystemMaxUse=1G`                                                                                                                                                                            | log-spam pod under quota                                     |
| Elasticsearch disk fills            | alert at 70% used, well below the 85% low watermark that stops new shard allocation on a single node | watermarks at Elastic defaults (85 low, 90 high, 95 flood); PVC expansion; runbook: clear `index.blocks.read_only_allow_delete`, delete the oldest ILM index, then expand. ILM cannot rescue a flooded disk on its own                                                    | lower the watermarks on a scratch cluster and prove recovery |
| Prometheus disk fills               | same alert                                                                                           | 30 d retention and `retention.size` at 80% of the volume                                                                                                                                                                                                                  |                                                              |
| Forge tmpfs and inode exhaustion    | node-exporter inode alert; the existing inode census                                                 | existing `reclaim-*.sh` jobs carried over; node_modules on local NVMe, never on a Volume                                                                                                                                                                                  | already exercised on h2                                      |
| Memory pressure evicts prod         | eviction and OOMKilled alerts                                                                        | requests and limits enforced by admission; stateful pods Guaranteed; kube and system reserved; obs and forge taints; PriorityClass for prod                                                                                                                               | memory hog in a dev namespace                                |
| Gate and pods contend on forge      | gate duration alert                                                                                  | cordon during gate; reserved memory sized for Dagger's check                                                                                                                                                                                                              | run a gate with a dev pod up                                 |
| Certificate expiry                  | cert-manager `CertificateExpiring`; blackbox x509 on public hosts; `k3s certificate check` cron      | cert-manager renews at 30 d; k3s rotates on restart within 90 d of expiry, the maintenance window restarts monthly                                                                                                                                                        | 1 h cert on a scratch host                                   |
| k3s upgrade breaks a node           | uptime check; node NotReady                                                                          | pin the minor; snapshot etcd first; test the exact version on a disposable CPX22 cluster; upgrade the server first, then agents; one node at a time                                                                                                                       | every upgrade                                                |
| OS updates and reboots              |                                                                                                      | unattended-upgrades security-only, reboots serialized by a cron that reboots one node per night, ingress node last                                                                                                                                                        |                                                              |
| Control plane lost, single server   | uptime check; kubectl fails                                                                          | etcd snapshot every 6 h to Object Storage; token in escrow; `k3s server --cluster-reset --cluster-reset-restore-path`; then delete stale VolumeAttachments                                                                                                                | quarterly                                                    |
| Volume lost or corrupt              | pod Pending or CrashLoop alert                                                                       | Velero FSB daily; SQLite pull pipeline hourly; RPO is one day for generic PVCs, one hour for SQLite                                                                                                                                                                       | weekly                                                       |
| Product database corruption         | app health check                                                                                     | SQLite generation restore; `down.sql` rollback per migration                                                                                                                                                                                                              | monthly                                                      |
| Log shipping stalls                 | Collector `exporter_send_failed`, queue size and enqueue failures; ES ingest rate zero alert         | persistent sending queue sized to the measured peak; retry with unbounded time within the queue; container logs kept 250 MB per container so `filelog` can re-read. Guarantee: no loss across a collector restart; bounded loss on node loss; loss once the queue is full | stop ES for the queue's rated minutes and count              |
| Agent transcript loss               | daily count of transcript files versus sessions indexed                                              | nightly rclone of raw JSONL to Object Storage                                                                                                                                                                                                                             | weekly                                                       |
| Ingress down but pods fine          | uptime check                                                                                         | Traefik readiness; hostPort, no ServiceLB hop; second ingress node behind LB at stage 2                                                                                                                                                                                   |                                                              |
| Hetzner location incident           | uptime check and status page                                                                         | accepted at stages 1 and 2; the `fsn1` bucket copy is the offsite; stage 3 warm standby                                                                                                                                                                                   |                                                              |
| Secrets leaked in Git               | gitleaks in CI                                                                                       | SOPS before commit; age key in cluster and escrow                                                                                                                                                                                                                         |                                                              |
| Time drift                          | node-exporter `node_timex`                                                                           | chrony on every node                                                                                                                                                                                                                                                      |                                                              |
| Destructive kubectl by a person     | audit log                                                                                            | per-namespace RoleBindings; prod only via Flux                                                                                                                                                                                                                            |                                                              |
| Recovery secret lost                | quarterly checklist                                                                                  | escrow of token, age key, crypt password, rclone key                                                                                                                                                                                                                      | quarterly                                                    |

## 8. Log lifecycle

Sources on every node, all through the one OTel Collector DaemonSet:

- Container stdout from `/var/log/pods`, enriched with namespace, pod,
  container, product and env labels.
- On forge only: Claude Code transcripts `~/.claude/projects/*/*.jsonl` and
  Codex `~/.codex/sessions/**/*.jsonl` for every Unix user. The body is stored
  as one `text` field plus a fixed set of extracted keys (session id, user,
  cwd, role, timestamp, token counts, tool name); never as a dynamic JSON
  object, which would blow the 1000-field mapping limit within days. A
  redaction processor strips known credential patterns before export.
- journald for k3s, sshd and the reclaim jobs.
- Traefik access logs as JSON.

Collector settings: `filelog` with `file_storage` checkpoints on a hostPath;
`memory_limiter` (it drops on trip, which is why the queue and the container
log retention are sized); `batch`; `elasticsearch` exporter in OTel mapping
mode with a persistent sending queue sized to the measured peak rate times the
rated outage. At stage 1 the h2 shipper is an OTel Collector container, not
Vector, so one document shape reaches each data stream.

Data streams and retention, sized so the volume and the policy agree:

| Data stream                            | Hot                                                          | Then                                                   |
| -------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| `logs-<product>.prod-*`                | 30 d                                                         | delete; daily SLM snapshot to Object Storage keeps 1 y |
| `logs-<product>.staging-*` and `dev-*` | 14 d                                                         | delete                                                 |
| `logs-agent.transcripts-*`             | 60 d                                                         | delete; raw JSONL stays in Object Storage indefinitely |
| `logs-infra-*`                         | 30 d                                                         | delete                                                 |
| `traces-apm-*`                         | 14 d, head sampling 100% in dev, 10% plus all errors in prod | delete                                                 |

Volume sizing rule: retained GB times 1.2 for index overhead, divided by 0.7
to stay under the low watermark. At today's 4 MB a day the 100 GB stage 1
volume is empty. At 1 GB a day retained, 30 d prod plus 60 d transcripts plus
30 d infra is at most 120 GB retained, 206 GB with the rule, so the stage 2
volume grows to 250 GB then. The trigger is forecast days-to-full below 30,
not a fixed ingest rate.

Archive and restore: SLM to bucket `puni-es-snapshots` in `hel1`, mirrored
to `fsn1` by the bucket sync. Restoring an archived month means restoring the
snapshot into an index prefixed `restored-` on obs, searching, then deleting
it. A monthly CronJob does the drill. ECK does not create the repository or
the SLM policy; both are part of the stage 1 install and an alert fires if a
day passes without a completed snapshot.

## 9. The WBS deploy contract on Kubernetes

Written before the first prod pod, because a default Deployment rollout would
recreate the two-writers moment the swap exists to control, with less control.

- `be-01`: one replica, `strategy: Recreate`, PVC access mode
  `ReadWriteOncePod`, readiness probe on `/health`, `preStop` that drains
  WebSockets for the same window as `swap.js`.
- Migrations: a Job that runs before the new `be-01` pod under a lease lock,
  applies additive `migration.sql`, records the applied set, and on failure
  runs the matching `down.sql` set and fails the rollout.
- Order: Flux `dependsOn` promotes be, then gw, then fe. A smoke Job after fe
  is a Flux health check; failure blocks the reconciliation and pages.
- `release.json` staleness refusal and the dirty-tree refusal stay in
  `bin/publish-release.sh`; the promotion commit carries the digest.
- Alternative kept open: two Deployments as blue and green on the same node
  with the Service selector as the swap, driven by `tool-deploy`. Same
  guarantees, more moving parts; use it only if Recreate downtime (about 10 s)
  is unacceptable.

## 10. Migration from today's estate

Each step is reversible. The prod cutover goes through h2's Caddy first so
rollback is one Caddy reload, and DNS moves only once traffic is proven.

1. Order core CCX23 and obs CPX42 in Helsinki on the private network with
   standalone Primary IPs and the firewall. Terraform and Ansible in a new
   `infra/` repo. Install k3s with embedded etcd and the flags in 2.1,
   hcloud CCM and CSI, Flux bootstrap, Traefik, cert-manager. Prove the MTU
   check across nodes.
2. Move both domains' nameservers to Cloudflare, DNS-only. Procedure: recreate
   every record in Cloudflare first, compare zone dumps, lower TTLs, switch
   NS, verify each of the six vhosts resolves, keep GoDaddy's zone intact for
   a week as rollback. Then issue the wildcard certificates.
3. Install ECK, Elasticsearch, Kibana, kube-prometheus-stack, blackbox,
   Alertmanager to Telegram, the Collector, SLM repository and policy, Velero,
   etcd S3 snapshots. Escrow the four recovery secrets. Replace Vector on h2
   with an OTel Collector container pointing at Elasticsearch. Run Victoria on
   h3 in parallel for two weeks, then stop it.
4. Build WBS images with Dagger on h2, push to h2's existing registry, and
   configure core's containerd `registries.yaml` to pull from it over the
   private network. Apply the `wbs-staging` overlay on core with a copy of the
   dev database; run the e2e suite against staging.
5. WBS prod cutover: announce the window; stop blue and green; `VACUUM INTO` a
   final copy; `PRAGMA integrity_check` and compare the migration table and a
   known row; copy onto the PVC with uid 1000 and no WAL sidecars; start the
   single `be-01` pod, then gw and fe; smoke through a host override; repoint
   h2's Caddy at core's ingress over the private network; watch. Rollback
   before writes reopen is a Caddy reload back to green. After writes reopen,
   rollback is a reverse copy or fix forward. Retarget the SQLite pull pipeline
   at the PVC path on core. Move `wbs.bulletpoints.club` DNS to core after a
   quiet day.
6. Retire h4 now. Retire h3 after the parallel run, after either migrating
   MLflow's whole `mlflow-data` named volume (database and artifact tree) onto
   a PVC on core with a verified run load, or the section 11 decision to drop
   it.
7. Stage 2 steps in section 4 as users arrive. h2 keeps dev, gates and builds
   until the new forge shard passes a full gate and a dev pod side by side.

Order of risk: step 5 is the only step with prod downtime, and it is a
quiesced copy with a one-reload rollback. Step 2 moves all six vhosts at once
and is the step to rehearse on paper first.

## 11. Decisions for Dany

- Elastic at stage 1 (as decided) or the budget variant that keeps Victoria on
  h3 until stage 2. Either way, record the Elastic choice as an ADR with
  Victoria as the alternative it beat.
- Cloudflare nameserver move (recommended) or delegated `_acme-challenge`
  CNAMEs with nameservers staying at GoDaddy.
- Registry: `registry:2` with read-only GC, or Zot.
- Whether MLflow survives the h3 retirement.
- Whether h1 claire moves to Helsinki now or later.
- Escrow the SQLite crypt password now; it is the open gate on the live
  backup regardless of this plan.

## 12. What changed from v1 after review

- Backups: removed CSI VolumeSnapshots and Hetzner server backups (Volumes have
  no snapshots; server backups exclude Volumes). Velero FSB, SLM, the existing
  SQLite pipeline and etcd snapshots are the paths, plus an `fsn1` mirror and
  escrowed recovery secrets.
- Core is CCX23 from stage 1 because a CPX42 320 GB disk cannot rescale to any
  smaller-disk type. Obs is its own node from stage 1 because the v1 memory
  table summed to the whole machine with no OS reserve and under-counted Kibana,
  Prometheus and the operators.
- Node roles are independent labels; no obs taint on a shared node; dev pods
  pin by forge shard label; hostPath restricted by admission.
- h2 is not joined to the cluster at stage 1: its gate lock and publish
  refusals are host-wide and pods would ignore them. A new forge shard at
  stage 2 replaces it, with cordon-during-gate.
- The WBS cutover is quiesced with `VACUUM INTO`, cut over via Caddy, and the
  Kubernetes deploy contract (section 9) reproduces the swap's guarantees.
- Load Balancer and second ingress node moved from stage 3 to stage 2.
- Flux is mandatory at stage 1; APM and staging are the skippable items.
- Traefik is disabled in k3s and owned by Flux; ServiceLB disabled; MTU 1400
  and MSS clamp; `--disable-cloud-controller`; etcd on local disk with a 6 h
  cron.
- Elastic: watermark numbers corrected to 85/90/95, replicas 0, alert at 70%,
  retention shortened to 30 d hot with SLM as the archive so the volume and the
  policy agree; transcripts mapped as text plus fixed keys with redaction;
  Kibana private; head sampling.
- Costs restated as gross and net per stage; stage 3 itemized; Twilight row
  aligned with ADR 0016 (manual join at M1); CloudNativePG needs three nodes;
  SQLite to Postgres is its own change; Elastic 1 to 3 nodes is a reindex.
- Vector replaced by an OTel Collector on h2 so two shippers do not write
  different document shapes into one data stream.
- MLflow volume migration made explicit; GoDaddy API restriction recorded;
  wildcard rationale replaces the rate-limit rationale.

## 13. Price provenance

- Server prices: Hetzner console, project p1, Helsinki, 2026-09-15 screenshots.
  CPX12 13.49, CPX22 22.99, CPX32 41.99, CPX42 81.99, CPX52 118.99,
  CPX62 152.99; CCX13 50.49, CCX23 101.49, CCX33 162.99, CCX43 325.49,
  CCX53 629.49, CCX63 1006.99 USD a month; IPv4 0.60.
- Add-ons from secondary 2026 summaries, not the console: Volumes about
  EUR 0.0572 per GB per month; Load Balancer LB11 EUR 7.49; Object Storage
  EUR 6.49 base with 1 TB storage and traffic. Confirm before purchase.
- h2, h3 and h4 current prices are legacy cost-optimized CX rates not shown in
  the screenshots; read them from the invoice. Rescaling any of them reprices
  at 2026 rates.
