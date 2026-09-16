# Twilight Bureaucrat and fleet delivery contract

Status: implementation proposal based on the September 17 sync and the user's explicit choices: `twilight-bureaucrat`, npm distribution, k3s immediately, fleet abstraction with node churn. No package publication, infrastructure provisioning or production cutover was performed while writing this contract.

## Intent

The repository has a reusable wiki toolkit but distributes it as a bespoke archive; consumers and CI still refer to its in-repository implementation. Infrastructure setup also depends on host-specific scripts and knowledge. Deliver a standalone npm package, make CI/CD consume a pinned release, and provide reproducible k3s provisioning, deployment and recovery across a changing fleet. Existing package-manager, activation-trust, migration and gate invariants remain mandatory. Do not implement the Twilight scheduler, change the WBS database engine, purchase capacity automatically, or equate a renamed tool with certified content. Local clusters prove the deployment paths before any production mutation.

## Reused infrastructure design

The starting architecture is the merged [September 15 infra proposal](../../plans/2026-09-15-infra-evolution-plan.md), together with its [Codex review](../../plans/2026-09-15-infra-evolution-plan-review-codex.md) and [Claude review](../../plans/2026-09-15-infra-evolution-plan-review-claude.md), from `prototype/langgraph-harness`. This contract supplies execution boundaries and fleet lifecycle semantics; it is not a replacement architecture.

| Existing proposal                                              | Reused here                                                         | Implementation |
| -------------------------------------------------------------- | ------------------------------------------------------------------- | -------------- |
| Independent core/obs/forge/ingress capabilities                | Dynamic capability assignment, stable cluster identity              | F1–F5          |
| k3s embedded etcd, private network, pinned Ubuntu              | Same host/cluster baseline                                          | F0/F3          |
| Terraform hcloud resources + Ansible node setup                | Terraform owns cloud resource lifecycle; Ansible owns configuration | F4             |
| Flux/SOPS, Traefik, cert-manager, CCM/CSI                      | Same platform with explicit reconciliation ownership                | F6             |
| Elastic/ECK, Prometheus, OTel                                  | Same initial observability target                                   | F7             |
| Application snapshots, Velero FSB, SLM, etcd and secret escrow | Same recovery layers, with executed restore proofs                  | F7/F10         |
| Image registry/Dagger and WBS migration guarantees             | Same image contract; explicit k3s release transaction               | F8/F11         |
| Source-run forge and per-worktree dev                          | Same edit loop on k3s                                               | F9             |
| Later independent scaling modules                              | Capability-driven additions and quorum-safe removal                 | F5/F10         |

Retain the proposal's host/cost tables as dated observations, not current facts or authorization to buy those machines. Re-observe membership/capacity and refresh prices only when planning a purchase. Its separate-infra-repo suggestion becomes `infra/` in this monorepo for the first implementation so this is one integrated handoff; later extraction is optional.

The merged `tools/harness-example` is reusable as a synthetic worker workload and ACP session/replay fixture. It is a prototype: its permission adapter selects an allow option, so it must not become the privileged fleet controller or production worker authorization policy.

## Ownership and proposed layout

| Owner             | Location                                                                  | Responsibility                                                              |
| ----------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Reusable package  | `apps/twilight-bureaucrat/cli/`                                           | Own npm manifest, compiled CLI, reusable toolkit, fixtures, package release |
| Package templates | `apps/twilight-bureaucrat/consumer/`                                      | Minimal consumer workflow and instructions                                  |
| Consumer          | `docs/wiki-policy/`, `docs/review-evidence/`, `docs/experiment-evidence/` | Policy, module identity, attestation and measurements                       |
| Fleet controller  | `tools/tool-fleet/`                                                       | Typed observations, operation planning, guarded execution and evidence      |
| Cloud resources   | `infra/terraform/`                                                        | Provider resource lifecycle, protected state and approved saved plans       |
| Ansible           | `infra/ansible/`                                                          | OS configuration, k3s bootstrap/join/leave/upgrade                          |
| GitOps            | `infra/clusters/`, `infra/platform/`                                      | Platform controllers, policies, monitoring and storage                      |
| Product delivery  | `deploy/k8s/wbs/`, `tools/tool-deploy/src/k8s/`                           | WBS manifests and migration-aware release coordinator                       |
| Local lab         | `infra/local/`                                                            | k3d development clusters and Ubuntu VM Ansible rehearsal                    |

Use the existing `apps/`, `libs/`, `tools/` discovery model. “Separate package” means an installable versioned product with its own manifest and release; moving it to a new GitHub repository is not required. Its released bytes must work without this monorepo. A later repository split can move that package without changing consumers.

The infra remains in puni-00 so the fleet, deploy code and product can be reviewed together. It must accept consumer repo/image configuration rather than hardcode WBS into node roles. Existing h1/h2/h3/h4 names can occur in observed inventory and migration records, never in role logic.

## Requirements

### B1 — Package distribution

`twilight-bureaucrat@0.1.0` is the initial intended public name/version. Verify registry availability and organization publishing authority before release; a conflict blocks publication, not implementation. Use `bun pm pack` and publish the tested tarball with `bun publish`. Give the package a `twilight-bureaucrat` executable and no installation scripts. Bundle shared validation helpers into the distributable, preserve dependency licenses, and ship the exact trusted compiler closure already required by the activation protocol. Never accidentally vendor WBS fixture/sqlite helpers.

Install acceptance: in a temporary consumer with no source checkout, `bun install --frozen-lockfile --ignore-scripts` followed by the executable succeeds. Removing a shipped role or corrupting the closure causes the consumer production command to fail before certification.

### B2 — Compatibility and activation

The public product/CLI name changes. Version-1 record shapes, module/check IDs, archive role filenames and `TOOL_WIKI_*` environment variables remain stable initially. Do not mass-replace these persisted protocol fields. New help/docs identify the canonical name and explain legacy protocol spellings once.

A package version identifies reusable code. `TOOL_WIKI_ACTIVATION_VERSION` still identifies the reviewed consumer commit. Preparing an activation uses installed package roles; choosing it remains external to the candidate. All stored review and source identities are preserved or explicitly migrated by the existing relocation mechanism. The package does not fabricate operator attestations, resource lanes or reviewed SHAs.

### B3 — Consumer CI/CD trust

Normal candidate CI may run the lockfile-installed package for diagnostics. Trusted admission starts in a clean trusted bootstrap directory, takes its package pin and lockfile from the base/default branch or externally administered configuration, disables lifecycle scripts, and never executes candidate package-manager hooks, Nx plugins or code with privileged credentials. Candidate checkout occurs only as input to the preserved validator. Keep separate permissions for release publication, trusted admission and unprivileged tests.

CI keeps its stable required checks, affected-project logic, browser shards, format, lint, typecheck, build, secrets, migration checks and OpenSpec schema integration. CD requires an immutable image digest and actual acceptance evidence; the wiki package does not replace application tests or become the Kubernetes deployment engine.

### F1 — Fleet identity and observation

Desired state describes clusters, logical node IDs, capability assignments, provider identity and lifecycle intent. Observation joins provider instances, SSH facts, Kubernetes node UID/providerID, storage attachments and readiness. A hostname or IP is an address, never identity. Reuse of a hostname by another instance must not authorize mutation of that instance.

An unavailable API, unreadable state file or partial inventory is an error, never an empty fleet. A successful empty provider response is distinguishable from failure. An observed disappearance does not mean the operator requested deletion. A stale cached inventory cannot authorize apply. Newly discovered labeled hosts require a matching desired enrollment before configuration; unrelated hosts are reported and untouched.

### F2 — Capabilities and cluster ownership

Start with a platform cluster and a separate Twilight worker cluster. Platform capabilities are `control-plane`, `product`, `ingress`, `observability`, and `forge`; more than one may be assigned to a node. Worker capabilities are `control-plane` and `execution`. Labels/taints express capabilities; stable forge-shard identity is used only for source worktrees that cannot freely move.

The worker cluster follows ADR 0028: one dedicated server schedules no activity attempts and at least two real agents prove the production pool. A laptop's k3d cluster is a functional rehearsal, not evidence of host-loss isolation. Twilight's authority remains outside the worker cluster. Joining platform nodes does not enroll them as workers.

A single-server platform profile is allowed but explicitly has maintenance downtime. Three-server HA needs a stable API endpoint and quorum-aware lifecycle; two servers are not an HA profile. Capacity/placement must be checked against requests, taints, volume topology and required capability counts, not only node count.

### F3 — Planned operations and safe removal

Plan → review → apply is the CLI contract. An immutable operation plan binds desired-state revision, observed instance IDs/node UIDs, Kubernetes resource versions, operation, target cluster, expiry and expected effects. Apply re-observes state and refuses drift, a different target or expired evidence. Per-cluster leases serialize membership changes; there is also a controller-side lock before a cluster exists. Lost lease means stop issuing mutations and require recovery, not continue.

Add configures a new node, joins it, validates readiness/network/storage, then makes it schedulable. Remove cordons and drains with PDBs honored, verifies replacements and application state, removes membership, and only separately permits provider deletion. Do not blanket-force drain, delete `emptyDir` without a declared loss policy, delete PVCs with a node, or remove the last required product/ingress/forge capability. Server removal also proves etcd quorum and an intact registration endpoint. Missing/dead-node replacement first fences the old machine; deleting a Node object alone is not fencing.

### F4 — Host and platform setup

Ansible configures pinned Ubuntu support, users/SSH/sudo, time sync, journald/log limits, private networking, required ports, swap policy, sysctls, storage mounts, k3s, registry access, and backups. Fetch installers/artifacts by pinned version and checksum. A second run has no unexplained changes. Secret tasks use `no_log`, restrictive modes and required-input validation. Never print resolved inventories containing credentials.

Flux owns Traefik, cert-manager, cloud controllers/CSI, SOPS-decrypted secrets, monitoring and policy after bootstrap. Bootstrap must not require the registry or service it is creating. h2 remains the existing build host during initial platform adoption; do not join it to k3s and assume the heavy lock now protects it from pods. A later forge pool uses reserved resources and bounded build workloads; cordoning alone does not stop existing pods consuming resources.

### F5 — Stateful WBS release

Deploy all four WBS tiers and account for the host-owned solver supervisor/protocol, auth, uploads and persistent databases. First read `swap.ts`, its tests, the migrations CLIs and the actual health/drain implementations. The existing gateway owns WebSocket draining; do not invent a backend drain endpoint.

The Kubernetes release coordinator owns one release state machine under a Lease. Flux must not race it by continuously restoring replica counts or image fields it temporarily changes. Use an operator/controller owned WBS release resource, or a suspended/resumed WBS Flux unit with ownership and crash recovery explicitly tested. This plan chooses the latter for the initial implementation: platform Flux stays active; only the named WBS Kustomization is suspended during the journaled transaction, then resumes on the committed release state.

Quiesce writes and drain the gateway; stop the old backend and prove it stopped; capture applied migrations and a consistent snapshot; run additive migrations once; start the target backend, gateway, frontend and MCP; validate health/auth and smoke before reopening writes. On a failure before writes reopen, restore the captured migration set with unchanged `down.sql` files and restore the previous digest. After writes reopen, rollback is a new fenced transaction with reverse transfer or fix-forward, never a blind Service/DNS flip. Rollback failure names a manual completion command and leaves the release visibly blocked.

SQLite stays single-writer during this new Kubernetes path. Choose `ReadWriteOncePod` only if the pinned CSI/cluster combination proves support; otherwise use single-replica placement plus fencing, and prove no overlap on rescheduling. `ReadWriteOnce` alone is not a single-writer guarantee. No automatic reschedule onto a new host after an ambiguous old-host loss without fencing.

### F6 — Backups, observability and local parity

Elastic/ECK and Prometheus are part of the initial target, with explicit requests/limits, retention, alerts, private access and persistent OTel queues. Preserve current monitoring until replacement receives real telemetry and a parallel-run acceptance record exists. Archive transcripts only from explicitly configured paths, redact before export and restrict access.

Back up etcd plus its server token, SOPS age recovery key, SQLite consistent snapshots, other PVC contents and Elastic SLM snapshots to documented off-node/off-region destinations. Define RPO and measured restore time per store. A same-region bucket is not off-region. Restore tests validate migrations, known records and application readiness, not merely successful archive extraction.

Provide both k3d for fast application/platform rehearsals and disposable Ubuntu VMs for testing the actual Ansible/systemd/firewall path. Both run k3s immediately. Local overlays use local storage and test certificates and cannot access production credentials or contexts. Document resource profiles and the differences that require a real cloud drill: CSI attachments, MTU, cloud firewall, public DNS/TLS and distinct-host failures.

## Corrections to the earlier infra draft

- Built-in Pod Security `restricted` and `baseline` forbid hostPath; a ValidatingAdmissionPolicy cannot grant an exception to those admission checks. Use restricted ordinary app/worker namespaces. Trusted source-run forge and the backend's existing host-owned solver runtime mount require separate dedicated trusted namespaces with explicit admission/RBAC/path restrictions. This plan chooses those narrow exceptions, not a broadly privileged product namespace. Keep other WBS tiers restricted, configure cross-namespace connectivity explicitly, and prove solver admission/operation plus denial of alternate host paths and unapproved workloads. A later PVC-synchronized forge or portable solver service may remove these exceptions.
- Cordon prevents new placement; it does not reserve CPU/memory from already running workloads. Keep host builds separate until measured resource reservations and isolation exist.
- Flux `dependsOn` supplies reconciliation ordering, not transactional migration rollback. Implement the release coordinator and recovery journal.
- Draining a backend does not drain the gateway's WebSockets. Reuse the actual gateway control path.
- Cloud Volumes are not backed up by server backup and cannot be assumed to support snapshots. Use application snapshots/FSB and prove restore.
- A second ingress node does not make a single-server control plane or a single SQLite writer highly available. State those outage limits.
- Avoid changing domain nameservers as a prerequisite. Stage explicit hostnames/TLS first; delegated DNS challenges or a broader DNS migration remain an explicit operator decision.

## Primary references checked for planning

- [Bun publish](https://bun.sh/docs/pm/cli/publish): registry publication, dry run, publishing a prepared tarball and lifecycle-script behavior.
- [Ansible Hetzner inventory](https://docs.ansible.com/projects/ansible/latest/collections/hetzner/hcloud/hcloud_inventory.html): dynamic labels, provider facts, strict mode and explicit cache behavior.
- [k3s requirements](https://docs.k3s.io/installation/requirements) and [embedded etcd HA](https://docs.k3s.io/datastore/ha-embedded): networking and cluster topology prerequisites.
- [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/): hostPath prohibition and restricted workload constraints.
- [k3s backup/restore](https://docs.k3s.io/datastore/backup-restore): datastore and token recovery obligations.
- [Flux bootstrap](https://fluxcd.io/flux/installation/bootstrap/) and [k3d config](https://k3d.io/stable/usage/configfile/): bootstrap and repeatable local cluster inputs.

These references support design choices, not a claim that unselected component versions are compatible. F0 must produce and test the exact version lock before node installation.
