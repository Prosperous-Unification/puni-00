# PUNI client delivery readiness assessment

Assessed **2026-10-21** against [the agreed scope](../../../puni-assessment.md),
at checkout `4151532121633d978beb67ab52b3eb748285cd8e`. Three independent assessors
covered infrastructure/fleet, delivery/CI/CD, and security/authentication/assistant
operations; the coordinating assessor checked live systems, observability and costs.

**Rerun 2026-10-22:** the scope gained [Agent swarm organization](../../../puni-assessment.md#agent-swarm-organization).
That criterion was assessed at checkout `d43f4176a18ff32b22161f478eb02e62ae328667` in
[swarm organization](swarm-organization.md), and the three current findings below were
re-read in the [live refresh](live-evidence.md#rerun-refresh--2026-10-22). The criterion
itself was then re-evaluated against 2026 research and benchmarks in
[the swarm criteria research note](swarm-criteria-research.md), which added four criteria. Capabilities
whose scope did not change were not re-assessed; their judgments remain dated 2026-10-21.

**Follow-through:** the [readiness roadmap](../../superpowers/plans/2026-10-21-puni-readiness-roadmap.md)
turns these gaps into staged work, dependencies, accountable roles, effort ranges and
criteria-level completion evidence. Its packages are planned, not implemented.

## Decision

**PUNI has substantial implementation for operating its own applications and a useful
foundation for attended client pilots. Repeatable delivery of the three client
requests is not yet demonstrated.** The main shortfall is the connection between
implemented components, current operational acceptance, and a measured client journey.
Some work needs implementation; other work needs activation, verification, ownership
or reconciliation. Treating all of it as a new build would discard existing value.

Three current findings need attention before relying on the existing operation as a
client-service baseline:

1. **SQLite backups are reporting failure.** The hourly h1 service's latest run exited
   1, and its previous 24 hours contain repeated failure messages. A timer exists;
   the newest usable backup and recovery point were not established.
2. **Production application provenance is unproven.** State files record `0afc7775…`.
   A follow-up identified backend/gateway OCI revision `0d9b296a…` as inherited Bun
   base-image metadata, not a competing PUNI revision. All three tiers lack `WBS_SHA`;
   the complete accepted application source/build/gate chain remains unresolved.
3. **Main merges are not protected by GitHub checks.** Live API reads show
   `protected:false`, an explicit unprotected response, and only a release-tag ruleset.
   Strong CI implementation therefore does not guarantee enforcement before merge.

All three were re-read on 2026-10-22 and were unchanged; the backup journal now names
the failing step, the pull of the partial snapshot from h2puni staging, not its cause.

These findings are fresh [live observations](live-evidence.md), not deductions from
unchecked task boxes. They do not establish data loss, a compromised deployment, or
an application outage. They establish specific operational/control gaps.

## Evidence and limits

| Evidence class      | What this assessment establishes                                                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current source      | Read code, configuration, tests and callers at the assessed revision; compared with plans, ADRs, OpenSpec artifacts and runbooks                                                                                            |
| Fresh bounded tests | **379 tests passed**, zero final failures, across selected fleet, delivery, auth/isolation, observability and accounting suites                                                                                             |
| Fresh live reads    | All four hosts reachable; GitHub policy/CI metadata, routed containers and image identities, dev/prod DB activation metadata, backend health, timers/service results, host capacity and selected metrics                    |
| Historical proof    | Credited linked k3d/QEMU/promtool/release evidence only for its recorded environment, revision and scenario; did not silently promote it to current production proof                                                        |
| Unverified          | Current Kubernetes resource/Flux state due to host privilege limits; full gate; browser/client journeys; live recovery; provider inventories/billing; effective OpenClaw permissions; longitudinal delivery/health outcomes |

The local source and dev backend identify the assessed revision. Production containers have been running eight weeks and expose base-image
metadata without an application identity; their complete source provenance is unresolved. **Passing current-source tests is not evidence
that their behavior is active in production.** Readiness here means evidence against
the client outcome, not a percentage of completed tasks. Unknown is not passing.
No code or infrastructure was changed by the assessment, and no full repository
gate or deployment was performed. Findings are a dated snapshot, not a release sign-off.

## 1. Client journey assessment

### Launch a new application

**Assessment: useful reusable foundations; an attended pilot still needs qualification.**
Existing WBS and website applications demonstrate a real workspace and delivery
surface. There are application conventions, shared libraries/UI, image publishing,
Compose operations, authentication, and substantial k3s release machinery. The
versioned client-repository starter and its adoption/upgrade contract are still
proposed. A second product inside this monorepo is not proof that another client's
repository can be onboarded and operated independently.

The best-supported candidate workload is close to the existing stack: Bun/TypeScript
HTTP services, a static frontend, optional WebSocket/MCP services, and explicitly
managed state; the reviewed fleet supports the documented Linux/amd64 host path.
Arbitrary runtime/OS/database compatibility is not established. WBS's SQLite writer
and solver contracts are application-specific and must not become accidental promises
for every client.

**Acceptance still needed:** take one named client repository from approved brief
through environment/domain/identity setup, enforced checks, an identifiable release,
real client task acceptance, alerting, restore and handover. Record elapsed time,
operator touches, recurring obligations and costs. A delivery engineer, client product
owner, identity administrator and operating/recovery owner must be named. No supported
onboarding-time or maintenance-effort promise is established by the evidence reviewed.

Sources and detailed boundaries: [delivery](delivery.md),
[infrastructure](infrastructure.md), [security and reusable auth](security-assistant.md).

### Scale an existing application

**Assessment: fleet/capacity tools exist; application-level scaling is conditional
on the workload and is not a demonstrated general service.**
Fleet enrollment, placement, retirement/replacement and recovery have real code and
local rehearsal evidence. Existing h3/h4 hosts each report 15,602 MiB memory
and eight CPUs. Those observations establish capacity, not HA or a performance gain.
The desired workers fleet has no enrolled nodes; real provider create/destroy and
several maintenance/HA acceptance steps remain unproven. Current cluster resource
state could not be refreshed with the available read account.

For WBS, one SQLite writer, singleton deployment and local persistent storage bound
the scaling options. Adding nodes does not distribute its writes or automatically
relocate its persistent state. For a client-owned existing application, the runtime,
data layer, release procedure and compatibility constraints need a specific adapter
and acceptance plan.

**Acceptance still needed:** capture a representative load and cost baseline, identify
the limiting component, apply a separately authorized bounded change, and repeat the
same workload with latency/error/throughput, cost and recovery measurements. An
application architect owns the bottleneck decision; platform and performance owners
own rollout and evidence. Current application metrics do not provide the full baseline:
the sampled `/metrics` endpoints exposed only `target_info`.

Sources: [infrastructure and scaling](infrastructure.md),
[observability](observability-cost.md), [stateful delivery](delivery.md).

### Set up a personal assistant with OpenClaw

**Assessment: an existing operator assistant is live; repeatable client setup and
lifecycle acceptance are not demonstrated.**
The h1 gateway service is active, WhatsApp is configured, and the installed CLI reports
OpenClaw `2026.9.4`. The service description identifies an older version; the running
gateway build and effective permissions remain unverified. The old human runbook's
`security=full, ask=off` is historical evidence, not a verified current policy.
The proposed personal-assistant UI/control plane and fictional UI prototype are
separate from this existing operator installation.

**Acceptance still needed:** provision a separate named client setup; connect only
authorized accounts/tools; demonstrate useful tasks, allowed and denied actions,
spending limits, revocation, updates, state recovery and offboarding. Decide the client
boundary before reusing the powerful operator gateway. Client owner and identity
administrator own task authority and grants; an assistant operator owns maintenance,
incident response and handover. The existing application backup job, successful or
failed, does not prove assistant configuration/session recovery.

Sources: [assistant and security assessment](security-assistant.md),
[live observations](live-evidence.md), [cost/telemetry](observability-cost.md).

## 2. Shared, dedicated and client-owned delivery

| Model                                            | Reusable assets                                                                          | Readiness boundary and custom work                                                                                                                                                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared PUNI runtime/services                     | Existing application code, identity mechanisms, infrastructure and monitoring components | Dev organization activation is observed; older prod lacks its activation table. Live cross-client authorization, telemetry/backup access, resource budgets and client export/restore boundaries remain unproven. Login alone is not tenancy. |
| Dedicated client environment, operated by PUNI   | Code, image/pipeline conventions, selected Ansible/fleet/deploy automation and runbooks  | A useful pilot candidate with explicit credentials/state separation. Provisioning, onboarding, recovery and handover still require measured acceptance; shared administrators, registries or monitoring remain common dependencies.          |
| Client-owned infrastructure/existing stack       | Portable libraries and adapted provisioning/delivery mechanisms                          | Account/network/OS/runtime/storage/IdP compatibility and delegated operational authority require qualification. Hetzner/S3-compatible code is not an AWS provisioning implementation. Name the incident and lifecycle owner.                 |
| Shared services plus client-specific deployments | Shared auth/registry/telemetry or other components where their contract fits             | Each shared dependency needs tenant identity, least privilege, attribution, failure policy, retention and exit proof. A dedicated application does not establish isolation of its shared dependencies.                                       |

Reuse of code, reuse of automation and reuse of a running service are different
commitments. Authentication is currently WBS-scoped; plug-and-play Auth0/other-provider
adoption in a second application is not demonstrated. No numerical “percent reusable”
is justified without a named client's workload and delivery model. Account ownership,
support hours, renewal/patch obligations, recovery targets and access revocation need
an agreed owner; the roles proposed here are not a claim that staffing is assigned.

## 3. Capability coverage

| Capability                   | Implementation and verification judgment                                                                            | Main gap / detailed assessment                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud resources              | Substantial Hetzner IaC and guarded plans; local tests pass                                                         | Live provider/backend lifecycle acceptance missing; general AWS provisioning not found in inspected implementation — [INF-01](infrastructure.md)                                   |
| General fleet lifecycle      | Inventory/enroll/retire/replace/recovery code and QEMU proofs; h3/h4 services live                                  | Whole-fleet lifecycle for standalone h1/h2, coordinated OS patching, drift/maintenance and HA proof incomplete — [infrastructure](infrastructure.md)                               |
| k3s/application platform     | Bootstrap, Flux, storage/policy/telemetry and release components implemented                                        | Current resource reconciliation unavailable; onboarding and production acceptance remain separate — [infrastructure](infrastructure.md), [delivery](delivery.md)                   |
| Security/client isolation    | Extensive auth/organization/MCP controls and passing bounded tests; dev activation observed                         | Older prod differs; end-to-end tenancy/revocation and customer permission boundaries unverified — [security](security-assistant.md)                                                |
| Availability/recovery        | Backup/restore and alert implementations, local recovery proofs, active timers                                      | Current backup failure; usable recovery point, off-region/escrow and full state coverage unresolved — [infrastructure](infrastructure.md), [live evidence](live-evidence.md)       |
| Application scaling          | Fleet mechanisms and application constraints are explicit                                                           | Workload baseline, stateful bottleneck treatment and measured improvement absent from demonstrated client journey — [infrastructure](infrastructure.md)                            |
| Health/session observability | Structured logging/redaction, alert rules and populated metrics backend                                             | Sampled app metrics lack operational series; live alert/correlation/client access proof missing — [OBS-01/02](observability-cost.md)                                               |
| Change quality/speed         | Real modular boundaries, CI, tests and detailed failure-proof artifacts                                             | New rules often observe-only; integration/operator bottleneck and throughput gain not measured — [delivery](delivery.md)                                                           |
| CI/CD                        | Tested gate selection, artifacts, deploy state machines and migration controls                                      | No main protection, unproven production application identity, k3s promotion not fully accepted live — [delivery](delivery.md)                                                      |
| Reusable features            | Shared UI/validation/failure utilities and WBS auth exist                                                           | Cross-product utility reuse is narrower than a client starter or second-app auth adoption — [delivery](delivery.md), [security](security-assistant.md)                             |
| Assistant operations         | Existing gateway and CLI observed                                                                                   | Effective policy, client provisioning, task/upgrade/recovery/offboarding acceptance unverified — [security](security-assistant.md)                                                 |
| Delivery metrics/cost        | Trial/review accounting and portable export implemented and tested; prior economic models exist                     | Operational adoption, client/provider attribution, human effort and representative outcomes missing — [MET-01/COST-01](observability-cost.md)                                      |
| Agent swarm organization     | Human-supervised delegation tree; gate-lock serialization real; WBS claims proven on dev; code coordinator designed | Control, identity, admission and termination are conventions converging on one operator identity; nothing on main coordinates agents — [swarm organization](swarm-organization.md) |

## 4. Reconcile prior intent with current evidence

The prior documents are valuable leads, but several require reconciliation:

- **Dev activation:** the runbook records unactivated/disabled state; live DB now
  says activated and the allowlisted setting is enabled. Credit current state while
  retaining the missing end-to-end cutover proof. Do not reactivate based on stale prose.
- **Production:** repository/main/dev capabilities cannot describe the older routed
  images until provenance and deployed behavior are reconciled.
- **Backup rehearsals:** an older SQLite verification record is blocked on the object
  store; a later receipt records the repaired k3d restore and negative cases. Credit
  that proof without overlooking today's failed standalone backup job.
- **Fleet/platform:** old “nothing implemented” descriptions and 8 GiB host figures
  understate source and current 15,602 MiB capacity. Lab lifecycle proof still does not
  establish provider creation, HA, current Flux readiness or production restoration.
- **k3s delivery:** older runbook summaries omit later pod-solve/Flux proofs; the
  completed intermediate steps still do not close retained-storage/provider/staging/
  production acceptance.
- **Migration recovery:** the blanket abort-reversal rule conflicts with the newer
  phase-specific attended recovery contract after uncertain migration/exposure.
- **Auth reuse:** website's old OIDC plan was superseded by runtime rejection of that
  configuration; it is not a second WBS-auth consumer.
- **Monitoring/economics:** dashboards and cost schemas describe intended measures;
  fresh scrapes and missing accepted-outcome populations limit the operational claim.

The detailed reports link each contradiction to its owning plan, code and evidence.
Do not resolve these by checking tasks or rewriting historical receipts. Preserve
dated evidence and publish a concise current contract/acceptance index with links.

## 5. Prioritized actions

Priorities below order readiness work; they are not incident severity declarations.
**P0** concerns the current operating baseline, **P1** enables a bounded client pilot,
and **P2** extends supported breadth after that pilot. Actions are proposals; no fixes,
deployments, drills or policy changes were carried out.

| Priority / kind                       | Action                                                                                                                                              | Proposed owner role                              | Completion evidence                                                                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 · operational investigation/proof  | Investigate repeated SQLite backup failures; identify coverage and newest usable generation                                                         | Backup/recovery operator                         | Explained failure, successful protected backup, isolated restore and integrity/known-record proof, recovery point/time, retention and alert delivery recorded                            |
| P0 · provenance reconciliation        | Reconcile recorded production SHA with routed containers and image identities                                                                       | Release operator + build engineer                | Per-tier source → accepted gate → build inputs → immutable artifact → routed runtime chain, including frontend; unresolved records remain explicit                                       |
| P0 · enforcement/configuration        | Require the intended merge checks and make any bypass explicit                                                                                      | Repository administrator                         | Branch/ruleset readback plus a harmless failing PR refused; passing candidate follows the intended merge/queue contract                                                                  |
| P1 · measurement/integration          | Establish health and change-delivery metric contracts and connect actual signals                                                                    | Observability + delivery operations owners       | Known request/failure through metric/dashboard/recipient; accepted-outcome ledger with queue/rework/human cost; reproducible totals                                                      |
| P1 · security acceptance              | Qualify the chosen client isolation and identity boundary in its actual environment                                                                 | Security lead + application/identity owners      | Two-client HTTP/browser/socket/MCP tests, revocation, stale-session/credential cases, telemetry/backup access and exit proofs                                                            |
| P1 · pilot/adoption                   | Run one new-app journey on a chosen delivery model using existing assets                                                                            | Delivery engineer + client owner + operator      | Separate repository onboarding, enforced pipeline, identifiable deployment, real task acceptance, restore/handover and measured elapsed/human effort                                     |
| P1 · operational acceptance           | Close fleet/provider/storage/recovery evidence for the pilot's supported footprint                                                                  | Fleet/platform operator                          | Named provision/adopt, patch/reboot/drain/replace/retire and recovery cases; provider/state locks, resource limits, failure domains and complete persistent-state coverage               |
| P1 · assistant qualification          | Package a bounded OpenClaw client setup with explicit authority and lifecycle                                                                       | Assistant operator + client/identity owners      | Allowed/denied task matrix, spend/credential controls, upgrade/recovery/offboarding and operator handover                                                                                |
| P1 · contract reconciliation          | Publish current phase-specific recovery, activation and acceptance status                                                                           | Domain/runbook owners                            | One current contract per behavior, linked dated receipts, no contradictory current instructions                                                                                          |
| P1 · agent identity/admission as code | Make agent authorship attributable and authority scoped; admit and terminate agent work by code; move job state from the prose file into WBS claims | Dash owner + security lead + delivery operations | Failing attribution trailer, scoped machine push identity, process-count admission refusal, revision and token caps, fleet rollout on main — [swarm organization](swarm-organization.md) |
| P2 · breadth/reuse                    | Add AWS provisioning, reusable auth/client starter upgrades and broader scaling support as required by named clients                                | Platform + module owners                         | Provider lifecycle and second-consumer adoption proofs, compatibility/upgrade contract and repeatable measured outcomes                                                                  |

The ordering is dependency-aware: establish the current recovery/release/control
baseline, choose a bounded client footprint, then prove the relevant journey with
metrics. Fleet expansion, more agents or more dashboards alone will not close those
acceptance gaps. The scaling and assistant journeys each require their own acceptance,
even if the new-app pilot succeeds.

**Effort is unestimated.** This assessment did not time diagnostics, inventory external
account dependencies or establish a representative client workload. Begin with bounded
backup/provenance/policy diagnostics; their results determine repair work. Estimate
implementation, operational activation and recovery/acceptance drills separately once
the client footprint and owners are fixed. Historical gate duration is not a delivery
estimate, and unknown operator effort must not be recorded as zero.

## 6. Verification record and supporting reports

| Area                                                    | Fresh final pass count | Evidence                                                        |
| ------------------------------------------------------- | ---------------------- | --------------------------------------------------------------- |
| Fleet planning/maintenance/recovery/provider boundaries | 100                    | [Infrastructure commands and limitations](infrastructure.md)    |
| CI gate/PR base/descriptor/promotion                    | 71                     | [Delivery commands and limitations](delivery.md)                |
| Authentication/throttle                                 | 112                    | [Security commands and limitations](security-assistant.md)      |
| Mounted organization/MCP/revocation boundaries          | 47                     | [Security commands and limitations](security-assistant.md)      |
| Logging/serialization/metrics mapping                   | 36                     | [Observability commands and limitations](observability-cost.md) |
| Trial accounting/export                                 | 13                     | [Accounting commands and limitations](observability-cost.md)    |
| Total selected tests                                    | **379**                | Bounded local checks; not the complete repository suite         |

Initial auth socket tests failed under sandbox restrictions and passed on approved
local-loopback retries. Initial remote calls likewise failed in the network sandbox
and succeeded on approved retries. Actual remote permission failures remain unresolved
and are recorded in [live evidence](live-evidence.md). Historical fault-injection proofs
were read, not freshly re-injected. No new safety checks or production code were added.

Full host gate, builds, browser suites, load/DoS tests, deploy/rollback/restore drills,
external identity-provider login, live client data access, provider billing and current
cluster readback were not completed; reasons and narrower claims are in the linked
reports. Completion of this assessment must not be read as platform acceptance.

Report integrity checks passed: Prettier for the findings index and six assessment
documents, `git diff --check`, and existence checks for 239 relative link targets
(including the subsequently added roadmap link).
The 2026-10-22 rerun added no tests: its evidence is a read-only source inventory and
the live reads recorded in [swarm organization](swarm-organization.md); Prettier ran on
every changed document and the new report's relative links were checked for existence.
Markdown anchors and external URLs were not validated by the link check. Independent
cross-review corrected memory units and tightened provenance wording; it did not add
operational proof.
