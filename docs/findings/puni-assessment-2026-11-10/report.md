# PUNI client delivery readiness assessment — 2026-11-10

**PUNI is a credible foundation for attended, explicitly scoped pilots. Repeatable
acceptance of all three client journeys is still not demonstrated.** The largest
remaining issue is qualifying and connecting the existing components to the running
service, accountable owners and measured client outcomes. It is not a general absence
of infrastructure or a reason to rebuild the platform.

Assessed against the unchanged [current assessment plan](../../../puni-assessment.md),
including all eleven swarm criteria, CI/CD, general fleet lifecycle and change-delivery
metrics. Public source snapshot **7614ca5116e2b27831076f7bc7c9f9872051c388**;
read-only operational observations **2026-11-10 18:59–19:07 UTC**. Three delegated
researchers inspected infrastructure, security/assistant operations and delivery/swarm;
the coordinating assessor checked live systems, observability, costs and synthesis.
This report supersedes October's readiness snapshot for the explicitly reassessed
scope; historical proof keeps its original date/environment.

Evidence and source pins: [live observations](live-evidence.md),
[infrastructure](infrastructure.md), [delivery and swarm](delivery-swarm.md),
[security and assistants](security-assistant.md), [observability and costs](observability-cost.md).
The [prioritized roadmap](roadmap.md) reconciles all W01–W28 packages rather than
starting another unconnected implementation plan.

## What changed since the previous assessment

| Previous finding or intent                      | Current evidence and disposition                                                                                                                                                                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Latest scheduled SQLite backups failing         | October repair/retention/alert/drill records exist; fresh Nov10 backup, pruning and freshness checks, plus Nov8 restore drill, report success. That incident is repaired; complete all-store/live-service recovery remains open.                                      |
| Main merges unprotected                         | Active main ruleset requires Actions-produced `gate` and `pixels`; current readback confirms enforcement settings. Zero approvals and loose base freshness are explicit policy choices, not a mandatory human review or composed-tree proof.                          |
| Monitoring lacks useful autonomous observations | Dev observer now publishes fresh health/resource/application-log/storage observations; Elastic has fresh logs/spans, Prometheus custom metrics and Grafana is reachable. Full application SLOs, delivery/outcome collection and production parity remain unqualified. |
| Agent coordination is only a plan               | Current source implements substantial durable execution, recovery, authority and local coordinator components. Safe end-to-end S7a/dogfood and the four named context/nesting/authority/termination items remain open or partial.                                     |
| Observability needs a large hardware purchase   | Owning sizing note withdraws the earlier64/128GiB recommendation. Measured quiet dev charges are small relative to that illustration; complete phase/overlap/recovery admission is still required. No hardware upgrade is justified by this assessment.               |
| Production provenance is unproved               | Still open: same old per-tier images/state, absent application `WBS_SHA`, inherited base-image metadata. Dev health identifies current source; that does not identify production.                                                                                     |
| Source/task/map descriptions disagree           | Later registry, hostname, auth and deployment contracts supersede older summaries; some checked/unchecked tasks still conflict with implementation/dated proof. Each detailed sheet records reconciliation rather than treating ticks as readiness.                   |

## Evidence standard

The assessment distinguishes documented intent, inspected source/configuration,
fresh local tests, historical exercises and fresh operational reads. Unknown,
unreadable, unavailable, stale and unperformed checks are not passing. No overall
percentage score is assigned: a critical missing release identity or tenant boundary
cannot be averaged away by many passing component tests.

Current public main was first d87afb94; during collection it advanced to7614ca5.
The isolated assessment checkout was fast-forwarded and the website-only delta was
reviewed. Earlier bounded test commands retain their real d87 revision; relevant
unchanged blobs were compared, not silently claimed retested. Companion remote-main
pins and changed-source inspection are documented in the detailed sheets.

Fresh checks cover selected fleet parser/planners, auth/organization/MCP/abuse,
delivery timing/accounting, release descriptor/promotion/coordinator and observability
acceptance. Outcomes, commands and assertion counts are recorded per command; initial
sandbox `EPERM` and missing generated-artifact failures are retained separately from
passing qualified reruns. A full suite, current R5 mutation campaign, browser/client
journey, provider lifecycle, deployment, recovery drill, load test and billing audit
were **not** performed. No application behavior or infrastructure was changed.

## 1. Three client journeys, assessed separately

| Request                                   | Supported candidate and required inputs                                                                                                                           | Present reusable path                                                                                                                      | Acceptance still missing / owner                                                                                                                                                                                                                                                    | Time and effort                                                                                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Launch a new application                  | Selected Bun/TypeScript web/API workload on documented Linux/amd64; approved brief, repo, environments, domain/DNS, IdP/account owners, state/storage and targets | Nx/Bun conventions, shared modules, real WBS/website releases, Compose and guarded k3s tools; substantial onboarding components            | Delivery/application owner and client accept one independent repository from brief→domain/TLS/auth→tested identifiable release→monitor/restore→handover, including denial and rollback/recovery cases. Existing apps are not this independent-client proof.                         | No measured end-to-end client lead time, active operator minutes or repeatability guarantee. Prepared-site ≤60min/≤15min hands-on is an old proposed target, not an accepted result. |
| Scale an existing application             | Existing runtime/release/data/IdP/network/ownership inventory; representative workload/data/cost baseline and agreed performance/recovery target                  | Fleet provisioning/adoption/placement/maintenance plans and application delivery safeguards; workload-specific integration can be attended | Performance/application owner identifies the real bottleneck, repeats the same load after one separately authorized change, and proves compatibility, availability/recovery and cost. WBS's single SQLite writer/local volumes and single-server control plane constrain scale-out. | No paired application improvement/cost baseline. Node creation or available RAM is not throughput improvement; elapsed/hands-on intervention time unknown.                           |
| Set up a personal assistant with OpenClaw | Client-owned accounts/data,3–5 useful tasks, tool/approval/spending/retention policy, pinned runtime/plugins and accepted hosting model                           | Existing operator gateway is running; CLI/channel metadata, WBS machine interfaces and operator runbooks provide ingredients               | Client task/information owner and assistant operator must accept isolated install/connect, useful and forbidden tasks, exact approvals, cost/privacy bounds, update, recovery and offboard. Existing powerful operator gateway is not demonstrated client tenancy.                  | No qualified install/task latency, recurring support effort, monthly spend or recovery-time promise.                                                                                 |

Candidate scope is narrow; arbitrary languages/databases/OSes, bare-metal variants,
provider accounts and existing client stacks require an explicit compatibility adapter
and acceptance. Targets for availability, latency/load, abuse degradation, cost,
retention and RPO/RTO remain decisions to accept per service. This assessment does not
invent staffing, contractual SLOs or actual client demand.

## 2. Delivery and ownership models

| Model                                        | Reuse and adaptation                                                                  | Accountable ownership and remaining proof                                                                                                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared PUNI hosting/services                 | Reuse app code and running platform services where their explicit contracts fit       | PUNI operates common runtime/patches/backup/incidents; client owns information and grants. Prove tenant data/identity/telemetry/backup access, resource contention and per-client exit. Activated dev marker does not qualify older production or shared assistant authority. |
| Dedicated environment, PUNI-operated         | Reuse code/automation, isolate process/VM/store/credentials, adapt site configuration | PUNI owns maintenance/recovery/on-call; client owns accounts/acceptance. Identify common registry/provider/monitoring/admin/backup dependencies and prove they do not invalidate the isolation claim.                                                                         |
| Client-owned infrastructure / existing stack | Port libraries and adapt provisioning/release/identity/storage interfaces             | Client administrator owns resources and delegates bounded support access; explicitly allocate incident/patch/recovery/billing work. Prove operation and handover after PUNI access is revoked. No universal AWS/runtime/OS compatibility established.                         |
| Hybrid shared plus client-specific           | Mix qualified shared services with customer deployments                               | Assign every shared dependency's tenant identity, access, retention, price allocation, upgrade and exit owner. Dedicated application proof does not qualify its shared control plane.                                                                                         |

The full12-cell qualification matrix remains in scope; this snapshot finds no cell
independently accepted end to end. Pilot candidates differ from qualification:

| Journey              | Shared PUNI                                                     | Dedicated PUNI-operated                                                      | Client-owned                                                                   | Hybrid                                                                        |
| -------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| New application      | Conditional on shared tenancy/contention/restore proof          | Strongest attended pilot candidate; independent repo/handover still unproved | Existing-stack/provider/site adapter and operator exit unproved                | Shared identity/registry/telemetry boundaries plus client deployment unproved |
| Existing-app scaling | No named baseline or safe multi-client improvement proof        | No paired workload improvement/recovery/cost proof                           | Existing runtime/data/provider constraints and delegated lifecycle unqualified | Combined shared dependency and application bottleneck proof absent            |
| OpenClaw assistant   | Shared gateway client isolation/effective authority unqualified | Isolated client task/approval/spend/lifecycle pilot unproved                 | Installer, client grants and independent operation/exit unproved               | Connector/control-plane privacy, budget and lifecycle split unqualified       |

Importing code, reusing automation and consuming an existing running service are
separate commitments. WBS authentication is implemented; plug-and-play authentication
adopted by a second independent application is still unproved.

## 3. Capability-to-criterion gap map

Every detailed finding records acceptance, applicability, prior intent,
implementation/evidence, reconciliation, consequence, next action and proposed owner.

| Plan capability                  | Current disposition                                                                                     | Principal gaps and owning evidence                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud resources/provisioning     | Hetzner and guarded Terraform/Terragrunt lifecycle code; AWS resource implementation not established    | Current account/state/backend/provider acceptance, AWS catalogue and costs — INF-01                                                                       |
| General node fleet lifecycle     | k3s adoption and role tooling exist; standalone/client-owned operating cycle incomplete                 | Inventory, OS patch/reboot/rotation, maintenance, replacement and exit across all roles — INF-02/03                                                       |
| Cluster/application platform     | Staged dependencies and historical website/registry proof; newer managed controls not activated         | Current API/Flux/PVC inventory, selected local-path storage contract, full onboarding/renewal/adoption — INF-04, DEL-04                                   |
| Security/client isolation        | Substantial OIDC, organization, machine/MCP/browser and abuse controls, selected negative tests passing | Current-release two-client/end-to-end authority, offboarding, secrets/patches and noisy-neighbor proof — SEC-01–08                                        |
| Availability/operations/recovery | Scheduled backup protection improved; historical integrity/alert/cold-restore evidence                  | Accepted service targets/owners and every-store clean-machine service restoration, protected copies and current recovery point — INF-06/07                |
| Capacity/scaling                 | Fresh host/selected-workload counters and guarded fleet changes                                         | Named load/cost baseline, SQLite/local-state bottleneck, repeated measured improvement/failure recovery — INF-05                                          |
| Observability/measurement        | Autonomous dev collection and retained backend signals are operational                                  | Request/error/load/agent attribution, alert delivery, coverage and production parity — OBS-01/02, MET-01                                                  |
| Change quality/speed             | Modular constraints, detailed intent/spec/proof and scoped CI exist                                     | Accepted modularity/rule-profile pilot, source-to-runtime chain and measured review/rework/operator effort — DEL-01–09                                    |
| Agent swarm organization         | Real components/local proofs; live plan still in progress/unknown                                       | All11 criteria assessed separately, no measured accepted-outcome parallelism gain; safe composition/authority/budgets/attribution and dogfood — SWM-01–11 |
| CI/CD                            | Required merge checks and affected-module selection work; guarded deploy/recovery implementations       | Provenance, composed-tree policy, reusable promotion/interruption and current staging/production acceptance — DEL-01–06                                   |
| Reusable features/modules        | Shared validation/failures/UI/delivery contracts and app-specific auth                                  | Versioned client starter, second-app auth adoption, compatibility/upgrade and reuse/service boundaries — REU-01/02, DEL-07–09                             |
| Assistant operations             | Operator installation active; safe client lifecycle not established                                     | Task/install/permissions/approval/privacy/spend/update/recovery/offboard acceptance — AST-01–04                                                           |
| Cost/operator effort             | Usage/accounting/price/attempt primitives and a fresh GitHub flow census                                | Billing/client allocation, human minutes, accepted deployment and complete retry/subagent coverage — MET-01, INF-06, SWM-04–11                            |

References: [INF findings](infrastructure.md), [SEC/REU/AST findings](security-assistant.md),
[DEL/SWM findings](delivery-swarm.md), [OBS/MET findings](observability-cost.md).

## 4. Priority and readiness implications

**First protect and identify the current service.** W03 remains the main production
acceptance blocker: independently connect running tiers to immutable artifact,
application source/build and the accepted gate. In parallel, read the current backup
coverage/generation/retention inventory; successful units alone do not establish
all-store recovery. Do not re-open the repaired October incident as if its repair
had never occurred.

**For improving every future PUNI change, the smallest high-leverage next scope is
closing delivery measurement around one real change using the existing read-only
adapter, attempt accounting and observability stores.** It turns waiting, retries,
merge and deployment identity into comparable evidence, enabling measured CI or
agent optimization. It is bounded by one change and explicit missing states; it
neither replaces Elastic/Prometheus/Grafana nor requires the complete coordinator,
full monitoring migration or production rollout to begin measuring dev.

That measurement slice does not waive production provenance, security or recovery.
Full safe agent composition and client assistant authority are separate hard gates
before delegating adversarial or sensitive work. Parallel-agent counts and fast
source merges cannot establish readiness by themselves.

The [roadmap](roadmap.md) specifies existing-package status, order, dependencies,
effort uncertainty, accountable roles and observable completion evidence. No
remediation, upgrade, resource purchase, deployment or recovery action is authorized
by this assessment. The dated report is complete even where a readiness criterion
is explicitly failed, unknown or unverified; those gaps remain open platform work.
