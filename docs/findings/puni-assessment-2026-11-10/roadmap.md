# Readiness gap roadmap — reassessed 2026-11-10

This is the action output of the [current assessment](report.md), not implementation
or rollout authorization. It updates the interpretation of the existing
[W01–W28 roadmap](../../superpowers/plans/2026-10-21-puni-readiness-roadmap.md) and
[work packages](../../superpowers/plans/2026-10-21-puni-readiness/work-packages.md).
Keep existing OpenSpec/source owners and verification records; do not duplicate
an implemented component merely because its live acceptance is missing.

Work kinds: **I** implementation, **A** activation/configuration, **V** verification,
**D** documentation/contract reconciliation. Assigned roles below still need actual
people and client approval; no staffing allocation or scheduled date is implied.
Effort is a rough bounded-slice estimate, not a re-estimated total28-package schedule.
Operator/account availability and unknown findings can dominate elapsed time.

## Existing plan disposition

| Package                           | Current assessment status                               | Remaining closure boundary / finding                                                                                                                   |
| --------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W01 Service/owner contracts       | Open                                                    | Accept supported workload/model catalogue, targets, account/incident/recovery/exit owners — INF-06                                                     |
| W02 Scheduled backup incident     | Repaired; fresh corroboration                           | Keep Oct23–25 repair/alert/drill proof and current successful units. All-store recovery belongs toW10; do not redo W02 — INF-07                        |
| W03 Production identity           | Open                                                    | Current per-tier routed artifact→source/build→accepted gate chain, or authorized known-good replacement if history irrecoverable — DEL-03              |
| W04 Merge enforcement             | Implemented/activated; current settings confirmed       | Preserve required gate/pixels and recorded refusal proofs; review/composed-tree concurrency remains a distinct policy/proof decision — DEL-01          |
| W05 Estate/evidence refresh       | Partial                                                 | This snapshot updates source/host/backend/WBS/GitHub evidence; denied Kubernetes/Flux and unqueried provider/billing remain unknown — live-evidence.md |
| W06 Full node fleet               | Partial implementation                                  | Include standalone and client-owned roles, patch/reboot/drift/credential/exit cycle — INF-02/03                                                        |
| W07 Hetzner/state                 | Partial implementation/local proof                      | Paid provider, remote backend, interrupted create/import and retained-resource acceptance — INF-01                                                     |
| W08 Cluster lifecycle             | Partial lab proof                                       | Actual upgrade/HA/PDB/local-volume/fence/replacement and measured recovery — INF-03/05                                                                 |
| W09 Platform onboarding           | Partial source/historical activation                    | Current dependency graph and complete supported-site onboarding, TLS renewal/alerts/storage — INF-04                                                   |
| W10 Complete recovery             | Partial                                                 | Current generation/protection/escrow inventory and full clean-machine service restore across every store — INF-07                                      |
| W11 AWS lifecycle                 | Not established in inspected implementation             | Name first account/region/catalogue, build missing adapter then qualify it; S3-compatible use is insufficient — INF-01                                 |
| W12 Reusable delivery             | Partial implementation                                  | Current provenance, independent pipeline onboarding, promotion/interruption/migration/rollback and accepted production release — DEL-03–06             |
| W13 Health/logs/traces/alerts     | Dev autonomous slice operating; broader acceptance open | Application SLO signal coverage, alert delivery, retained history, two-instance parity and production activation — OBS-01/02                           |
| W14 Delivery/cost/human metrics   | Source models and bounded tests exist                   | Autonomous adoption, accepted-change/deployment link, completeness and human/billing attribution — MET-01                                              |
| W15 Client isolation              | Partial code/dev activation/local proof                 | Exact-release two-client browser/socket/MCP/IdP cutover and negative matrix; older prod not equivalent — SEC-01–05                                     |
| W16 Secrets/access/exit           | Partial                                                 | Effective credential/patch/audit/retention custody and cross-system client offboarding — SEC-04/05/08                                                  |
| W17 Abuse/contention              | Partial local safeguards                                | Named attack/load/degradation envelope and replica/noisy-neighbor validation — SEC-06/07                                                               |
| W18 Reusable auth                 | WBS implementation; adoption unproved                   | Independent second-app/provider/authorization/upgrade proof — REU-01                                                                                   |
| W19 Client starter                | Partial contracts/examples                              | Versioned starter and repeatable independent-repository adoption — DEL-08/REU-02                                                                       |
| W20 Modularity/artifacts          | Partial implementation and local constraints            | Accepted profile/knowledge/held-out verification pilot and retained understanding — DEL-08/09                                                          |
| W21 Agent scalability             | Unproved                                                | Paired/repeated single-agent and multi-agent accepted-outcome benchmark with cost/review/operator/noise — SWM-01/04/10                                 |
| W22 New-app journey               | Not accepted end to end                                 | Named independent client/repo brief-to-handover and operation proof — report journey1                                                                  |
| W23 Existing-app scaling          | Not accepted                                            | Load/cost baseline, bottleneck intervention, measured compatibility/recovery/improvement — INF-05                                                      |
| W24 Assistant install/authority   | Live operator assistant; client product unqualified     | Isolated repeatable client install, task set and effective approval/scoping/budget model — AST-01/02/03                                                |
| W25 Assistant lifecycle           | Not accepted                                            | Upgrade/failure recovery, configuration/state restore, task acceptance and revoke/export/offboard — AST-04                                             |
| W26 Models/independent repetition | Not accepted                                            | Complete the three-journey × four-model (12-cell) acceptance matrix with independent operator repetition and client-owned exit — report models         |
| W27 Ongoing operation             | Not accepted                                            | Agreed observation window, incident/recovery/retention/maintenance/cost targets and criterion-level signoff                                            |
| W28 Executable coordination       | Substantial components; safe composition open           | S7a deployment/dogfood plus context/nested usage/worker authority/work-item termination; named live WBS states unknown/in_progress — SWM-01–11         |

These judgments do not edit source task boxes or claim owner acceptance. W02 and
W04 can be credited within their proved boundaries while M0 remains open because
W01/W03/W05 are incomplete. M1/M2 and client acceptance milestones remain conditional;
no sum of component passes closes them.

## Prioritized bounded actions

| Order / kind                       | Scope and reason                                                                                                                                                                                                     | Dependencies / accountable role                                                                    | Indicative effort                                                                                       | Required completion evidence                                                                                                                                                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — V/D                            | Capture current production artifact/source/gate and current recovery coverage. Highest service-risk reduction; prevents testing new code while describing old runtime as accepted.                                   | W03/W10; read-only access, release/build owner + recovery owner                                    | 0.5–2 engineer-days of diagnosis; authorize/re-estimate any replacement or drill separately             | Routed tier→immutable digest→build/source/gate join; current per-store generation/key/protection owner; unknown history explicit. A later release or restore needs its own acceptance.                                                                                                              |
| 2 — I/V                            | One-change autonomous delivery measurement using existing adapter/accounting and Elastic/Prometheus/Grafana. Highest leverage for future dev optimization; do not wait for full production migration to measure dev. | W14 slice; delivery operations owner; one WBS item/change and authorized read-only provider access | 1–3 engineer-days; low/medium confidence until adoption seams are inspected                             | Scheduled bounded collection, exact execution/attempt IDs, stale/incomplete/cancelled/retry/carried negatives, accepted merge + deployed revision, recomputable time/cost and operator/review effort. No duplicate charging or runner-queue claim from attempt waiting.                             |
| 3 — D/V                            | Accept one pilot service/ownership/workload/target profile and refresh missing estate authority. Stops undefined guarantees and ownership from contaminating all journeys.                                           | W01/W05; service owner + client/account/information owners                                         | 0.5–2 attended days; client decisions determine elapsed time                                            | Supported versions/models/exclusions, named owners, SLO/load/abuse/cost/RPO/RTO/retention and exit targets, current source/installed inventory. Missing required owner/target refuses acceptance.                                                                                                   |
| 4 — V/A; I only for reproduced gap | Finish existing dev observability/parity capacity and retained-state prerequisites; qualify stored-signal/history/isolation/outage/recovery contract. Preserve affordable measured scope and actual guards.          | W13/OBS-02; observability/platform owners; authorized existing host/API/retained-state evidence    | First diagnostic slice0.5–2 days; full native/rehearsal effort currently unestimated                    | Phase-aware live-process and retained-disk accounting; existing conditional source/native prerequisites; all required runtime cases, fresh ownership/claim/resource readbacks, history/rollback/isolation and alert recipient proof. No capacity purchase or lower floor from quiet-memory samples. |
| 5 — I/V/A                          | Complete bounded safe coordinator and worker authority before governed dogfood. Treat missing composition differently from completed components.                                                                     | W28/S7a; Dash + security owners; uses W14 records                                                  | Reuse original package bounds only after current task sizing; first gap-selection/design slice0.5–1 day | Durable dispatch/effect/recovery and fenced coordinators; action-scoped worker credentials; context and nested usage limits; work-item revision/token/money/time caps; negatives; one real governed change. No agent finish signal self-authorizes acceptance.                                      |
| 6 — V/I/A                          | Qualify isolation/abuse/recovery and client-facing automation on one dedicated supported pilot; adapt auth/starter only where actually missing.                                                                      | W06–W20 applicable slices; client/app/performance/security/platform owners                         | Retain original ranges as low-confidence planning; estimate selected pilot afterorders1–3               | Real provider/maintenance/onboarding/IdP/TLS, forbidden tenant/actions, load/replica/cost boundary, upgrade/rollback/clean restore and handover. Record elapsed and active work.                                                                                                                    |
| 7 — I/V/A                          | Separate assistant pilot, plus complete the 12-cell journey/model matrix and ongoing operation. Assistant work need not wait for irrelevant cluster adapters.                                                        | W24/25 with assistant-state recovery/telemetry/authority slices; W26/27 later                      | Estimate after task/accounts/authority profile accepted; no turnkey promise                             | 3–5 useful tasks, forbidden actions/approval bypass, hard spend and nested retries, privacy/export/revocation, restore/update/no duplicate effects, independent repeat across all12journey/model cells and accepted operating window.                                                               |

Orders1–3 can proceed concurrently under separate owners. Existing independent CI
partitions need not serialize PRs; source-only qualification must not be confused
with production/host acceptance. This assessment proposes no rule requiring every
Markdown change to replay the entire host campaign, no new mandatory reviews and no
loosening of missing/failed/cancelled-verdict checks.

## Closure rules and remaining decisions

- Retain original failure evidence; distinguish unavailable tools/permissions from
  a genuine behavioral failure. A passed conditional skip proves selection, not
  execution of the skipped suite. Match every readiness claim to its actual scope.
- A current denied Kubernetes read leaves current cluster readiness unknown. An
  authorized owner supplies read access/evidence; the assessment does not bypass it.
- Select the workload/delivery model, incident/support owner and numeric targets
  before customer acceptance or an invasive drill. Current assessment completion
  does not imply platform readiness, activation or a procurement decision.
- Reuse existing OpenSpec/tasks/runbooks. Only missing behavior needs implementation;
  existing behavior may need configuration, activation, verification or reconciliation.
- Do not turn engineering-day illustrations into a calendar commitment or divide
  by agent count. W21 must demonstrate net accepted throughput and review/operator
  cost under growing concurrency before increasing the supported concurrency claim.
- Independent product/platform operators retain final acceptance and client consent.
  Every closure needs retained source/runtime identity, date/environment, positive
  and relevant failure proof, completeness limits and an accountable owner.

W26 retains the original full **three journeys × four ownership models =12 cells**
in the [work packages](../../superpowers/plans/2026-10-21-puni-readiness/work-packages.md)
and [criterion closure matrix](../../superpowers/plans/2026-10-21-puni-readiness/criteria.md).
Prioritizing one pilot does not remove the other cells: unexecuted cells remain open,
and relabeling a scoped cell unsupported does not satisfy this assessment plan.
Preserve Hetzner and AWS lifecycle acceptance across the overall qualification set;
shared-service reuse and an attended workaround do not replace provider proof.
