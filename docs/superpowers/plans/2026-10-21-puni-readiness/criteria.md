# PUNI readiness criteria and acceptance coverage

This is the completion ledger design for the [roadmap](../2026-10-21-puni-readiness-roadmap.md),
derived from the [agreed scope](../../../../puni-assessment.md). The
[assessment](../../../findings/puni-assessment-2026-10-21/report.md) owns the dated gap
analysis; [work packages](work-packages.md) own the steps for closing those gaps.
Every criterion below is **planned / not yet accepted**. The table maps work to
requirements; it does not claim fresh operational evidence.

W01 fixes supported workload/version catalogues, numeric targets, named owners and
inputs. W27 closes the ledger. Each row must eventually link its applicable contract,
source/environment identity, dated evidence, limitations and accountable person.
Evidence from one environment or model transfers only with a recorded equivalence
argument. Missing access, unresolved applicability and absent evidence stay open.

## Journeys, delivery models and scope boundaries

| ID  | Criterion                                                                               | Closing packages   | Required evidence                                                                                                              |
| --- | --------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| C01 | Explicit workload, environment, service targets and exclusions                          | W01, W05           | Three journey profiles and supported catalogue; input, ownership and numeric acceptance contracts                              |
| C02 | New application from intake to ongoing operation                                        | W19, W22, W26, W27 | Repository, environments, deployed business task, DNS/TLS/auth, monitoring, restore and usable handover; elapsed/manual effort |
| C03 | Existing application integrated and measurably scaled                                   | W23, W26, W27      | Same representative workload before/after, proven bottleneck improvement, compatibility, cost and recovery                     |
| C04 | Useful personal assistant installed and operated                                        | W24, W25, W26, W27 | Connected accounts/tools, useful tasks, effective authority, measured operation, update, restore and exit                      |
| C05 | Shared, dedicated, client-owned and hybrid applicability and acceptance                 | W01, W26           | All 12 cells below have model-specific evidence; unsupported scope is explicit and cannot silently pass                        |
| C06 | Reused code, automation and running services distinguished from custom work             | W01, W18, W19, W26 | Per-capability reuse/adaptation register and measured bespoke work for each journey/model                                      |
| C07 | Ownership of accounts, infrastructure, information, credentials, upgrades and incidents | W01, W16, W26      | Named accountable persons, client/PUNI responsibility boundary, support calendar and control transfer                          |
| C08 | Shared failure/load boundaries, handover and client exit                                | W15, W16, W17, W26 | Two-client failure/contended-load tests and independent client operation after PUNI access removal                             |

## Infrastructure and general fleet lifecycle

| ID  | Criterion                                                           | Closing packages   | Required evidence                                                                                                              |
| --- | ------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| C09 | Repeatable Hetzner create/adopt/change/remove                       | W07, W08           | Real account receipts for admitted node kinds, no-op reapply, retained resources and accounted cleanup                         |
| C10 | AWS resource lifecycle and existing-client adoption                 | W11, W26           | Actual AWS account/resource lifecycle, client-owned path and cleanup; S3-compatible storage alone is insufficient              |
| C11 | Account-separated infrastructure state, locking, drift and recovery | W07, W11           | Terragrunt's actual role; wrong-account, stale-state, concurrent-lock, lost-response and state-recovery cases                  |
| C12 | Whole-fleet inventory, ownership, roles and enrollment              | W05, W06, W08      | Standalone, k3s servers/workers and client-owned roles covered with stable identity and current evidence                       |
| C13 | Configuration, drift, patching, reboot and credential rotation      | W06, W08, W16      | Repeated convergence, staged maintenance and rotation with useful service restored, independent of Ansible choice              |
| C14 | Drain, repair, replace, recover and retire nodes safely             | W06, W08, W10      | Protected-state/PDB refusal, successful stateless replacement, recovery and no accidental re-enrollment                        |
| C15 | Bounded fleet concurrency, partial failure, resumability and audit  | W06, W08           | Interrupted rollout, competing maintenance/lease, stale host and lost-SSH cases with durable attributable outcomes             |
| C16 | k3s setup, upgrades, control-plane and membership lifecycle         | W08, W09           | Real multi-server quorum/maintenance evidence, fixed endpoint, worker admission and interrupted-upgrade recovery               |
| C17 | Network, DNS, TLS, ingress, storage, registry and secrets           | W09, W12, W16      | Pinned clean-site readiness; certificate renewal, network/MTU, trust/pull failure and declared storage attach/reclaim behavior |
| C18 | Supported application service contract and onboarding speed         | W01, W09, W19, W26 | Complete service inputs and measured prepared-input-to-service elapsed time plus human minutes against accepted target         |

## Security and client isolation

| ID  | Criterion                                                           | Closing packages   | Required evidence                                                                                                                       |
| --- | ------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| C19 | Authentication, authorization, least privilege and revocation       | W15, W18           | Real supported IdP and transport acceptance; revoked identity, stale tab, viewer and wrong-organization denials                         |
| C20 | Client separation across information, execution and shared services | W15, W16, W17, W26 | Two-client HTTP/socket/MCP/store/export/telemetry boundaries and resource contention; no foreign-client disclosure/effect               |
| C21 | Secrets storage, rotation, patching and auditability                | W06, W16           | Scoped references, clean-machine escrow, overlap/emergency revoke and missing/unreadable-key failures without plaintext evidence        |
| C22 | Abuse protection, rate limits and acceptable degradation            | W01, W17           | Numeric attack and legitimate traffic envelope, trusted-proxy assumptions, victim impact and bounded recovery; removed-control negative |
| C23 | Assistant permissions, approvals and private information            | W16, W24, W25      | Effective runtime policy; denied/wrong-client/stale-approval and untrusted-instruction cases across admitted tool routes                |
| C24 | Assistant spending and external-effect boundaries                   | W14, W24, W25      | Budget/concurrency/retry enforcement, explicit missing-usage outcome and no duplicate effect after uncertain response or restore        |
| C25 | Revocation, information lifecycle and offboarding                   | W16, W25, W26, W27 | Grants/schedules stopped; export/erasure, provider transfers and backup expiry accounted for; retained-client access tested             |

## Availability, operations and recovery

| ID  | Criterion                                                           | Closing packages        | Required evidence                                                                                                             |
| --- | ------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| C26 | Availability targets, resource requests/limits and health detection | W01, W09, W13, W17, W27 | Defined windows/denominators; business health, saturation, quotas and sustained SLO evidence at admitted load                 |
| C27 | Actionable alerts, incident owners and runbooks                     | W01, W13, W26           | Real recipient sees injected failure and resolution; second operator diagnoses and follows recovery instructions              |
| C28 | Node, workload, dependency and control-plane failures               | W08, W09, W10, W13, W26 | Declared failure domains exercised; bounded service behavior and restore, without equating a Ready pod with HA                |
| C29 | Maintenance, upgrades, certificate renewal and recurring work       | W06, W08, W09, W16, W27 | Attended maintenance/renewal receipts, interrupted recovery, calendar, owner and measured recurring effort                    |
| C30 | Working scheduled backups and full persistent-store coverage        | W02, W10, W25           | Successful scheduled generation plus DB/PVC/configuration/MCP/assistant and other admitted-store inventory                    |
| C31 | Protected backup storage, retention and cleanup                     | W10, W16, W27           | Independent protected copy/escrow, unauthorized-delete failure, safe pruning and actual expiry-window evidence                |
| C32 | Proven restoration, recovery time and acceptable loss               | W10, W22, W23, W25, W26 | Clean-target known-record/application restore for every consistency mechanism, measured RTO/RPO and corrupt/missing-key cases |

## Capacity and application scaling

| ID  | Criterion                                                           | Closing packages   | Required evidence                                                                                                                      |
| --- | ------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| C33 | Fleet capacity and adding Hetzner nodes                             | W07, W08, W23      | Before/after node/CPU/memory capacity and actual useful workload on enrolled capacity                                                  |
| C34 | Placement, replicas and contention                                  | W08, W09, W17, W23 | Placement/limits, cross-client contention, scale-down and failure tests at specified workload                                          |
| C35 | Application, database, storage and stateful constraints             | W12, W23           | Identified bottleneck and compatibility/write/session/storage contract; migration branch if necessary, no unsafe cloned SQLite writers |
| C36 | Scaling improves the client outcome within cost/reliability targets | W14, W23, W26      | Comparable before/after latency/errors/throughput and fully loaded cost; adding nodes or completing a benchmark alone cannot pass      |

## Observability, delivery measurement and cost

| ID  | Criterion                                                           | Closing packages             | Required evidence                                                                                                                       |
| --- | ------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| C37 | Application and infrastructure health metrics                       | W13, W27                     | Actual availability, errors, latency, throughput, saturation, capacity, backup outcome and recovery measurements                        |
| C38 | Agent/assistant sessions, tools, failures, usage and inference cost | W13, W14, W21, W25           | Correlated session/tool/effect/change/audit records, failed attempts and provider usage; no zero-cost substitution for missing evidence |
| C39 | Request-to-production lead time and accepted delivery               | W14, W21, W27                | Accepted request, production acceptance and outcome events; lead-time distribution, accepted changes and deployment frequency           |
| C40 | Review/merge delay, gate/pipeline duration and queue time           | W04, W12, W14, W27           | Joined review/merge/CI/gate timestamps with cancelled and censored runs retained                                                        |
| C41 | Change/pipeline/deployment failure, rework and recovery             | W12, W14, W27                | Defined denominators/windows; failed and recovered changes traced to versions and environments                                          |
| C42 | Metric definitions, collection, ownership and attribution           | W01, W13, W14                | Dictionary, collection points, owners, client/application/environment/change joins and independently recomputable exports               |
| C43 | Dashboards, thresholds, retention, access and audit correlation     | W13, W14, W16                | Recipient tests, per-client queries, redaction/retention checks and distinction between diagnostic logs and durable audit               |
| C44 | Client infrastructure/storage/traffic/inference/tooling cost        | W11, W14, W25, W27           | Actual bill/usage reconciliation, currency/price handling and transparent shared-cost allocation                                        |
| C45 | Onboarding, maintenance, interventions, support and growth cost     | W14, W21, W22, W23, W25, W27 | Separate engineering/operator/wait measures, recurring support and costs as workload/clients/concurrency change                         |

## Change quality, agent coordination and CI/CD

| ID  | Criterion                                                              | Closing packages        | Required evidence                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C46 | Automated tests and meaningful failure proofs                          | W04, W12, W20           | Required tests plus observed production-path negatives for changed guards and adjacent factual Proof records                                                                                                  |
| C47 | Backward-compatible application/API/database changes                   | W12, W19, W20, W23      | Old/new compatibility and additive migrations; eligible pre-exposure abort restores exact ledger; post-exposure/uncertain writes retain fences and enter specified attended recovery; edited rollback refuses |
| C48 | Modularity, readable implementation and usable artifacts               | W05, W19, W20           | Scoped cross-module change, enforced boundary check, concise linked docs/spec/review/verification and independent maintainer navigation                                                                       |
| C49 | More agents evaluated against accepted throughput, failures and rework | W14, W20, W21           | Comparable 1/2/4 and promised 8-agent trials with review/integration cost, loser charges and accepted outcomes; unproved gains stay unclaimed                                                                 |
| C50 | Repository onboarding and reusable pipeline configuration              | W12, W19, W22, W26      | Independent repository uses versioned pipeline contracts and reaches accepted artifact without hidden monorepo/personal prerequisites                                                                         |
| C51 | Build/test/security/quality checks enforced before merge               | W04, W12                | Live policy readback and real failing/cancelled/skipped merge refusal; preserved infrastructure verdicts and accountable bypass policy                                                                        |
| C52 | Reproducible builds, artifact versioning and provenance                | W03, W12                | Two clean builds explained; immutable source/build/gate/artifact/runtime chain for every tier, including frontend                                                                                             |
| C53 | Registry lifecycle and rollback artifact retention                     | W09, W12                | Trust/auth, publish interruption, retention/GC and orphan cleanup preserve referenced/rollback images                                                                                                         |
| C54 | Environment configuration, secrets and production promotion            | W12, W16, W22, W23, W25 | Exact staged digest promoted through scoped permissions; wrong environment/ref/secret or altered receipt fails                                                                                                |
| C55 | Deployment strategy, canary, health, verification and rollback         | W12, W22, W23, W25      | Canary applicability decided; offered canary proves abort thresholds, otherwise accepted alternative rollout proved; stateful compatibility, business smoke and phase-specific recovery                       |
| C56 | Runner isolation, permissions, concurrency and interrupted recovery    | W04, W12                | Runner/ref/workflow/cache boundaries, serialization and partial-build/publish/deploy recovery, including coordinator death                                                                                    |
| C57 | Pipeline and deployment performance is measured                        | W12, W14, W27           | Operational queue/duration/frequency/failure dashboard using C39–C42 definitions, not a competing metric ledger                                                                                               |

## Reusable modules and assistant operations

| ID  | Criterion                                                             | Closing packages   | Required evidence                                                                                                                          |
| --- | --------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| C58 | Plug-and-play auth with Auth0 and other supported methods             | W01, W15, W18      | Auth0 plus second real OIDC provider; explicit supported password/social/enterprise contract and real provider acceptance                  |
| C59 | Auth integration, authorization, docs, versions and upgrades          | W18, W19           | Independent second app uses the module without WBS-specific roles; config/upgrade/rollback and denial tests                                |
| C60 | Other useful reuse without application-specific leakage               | W18, W19, W20      | Selected shared capabilities, versioned contracts and starter boundaries; customization and upgrade cost recorded                          |
| C61 | OpenClaw install/configure/connect and task acceptance                | W24, W25           | Two clean installations at actual runtime version, one channel/two connectors and accepted read/approval-bound write tasks                 |
| C62 | Assistant supervision, update, failure, recovery and transfer/removal | W16, W24, W25, W27 | Outage/stuck/cancel/upgrade/restore cases, restored task continuity without repeated effects, export/revoke/delete and sustained operation |

## Evidence, reconciliation and prioritized execution

| ID  | Criterion                                                        | Closing packages | Required evidence                                                                                                                       |
| --- | ---------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| C63 | Prior intent compared with actual code and infrastructure        | W05, W27         | Linked plans/ADRs/specs/runbooks/verification/code/tests/deployment/current estate; divergence and supersession retained explicitly     |
| C64 | Implementation distinguished from activation and proof           | W05, W27         | Per-capability outcome/applicability/intent/state/evidence/gap/consequence/next action, with date/revision/environment and proof limits |
| C65 | Unknown, stale, unavailable and skipped checks remain visible    | W05, W26, W27    | Outstanding access/evidence register and skip reasons; no missing/empty state converted to success                                      |
| C66 | Priorities, dependencies, effort, benefit, ownership and closure | W01, W14, W27    | Maintained package queue and actual effort; named owners, client impact, completion receipts and unresolved branches                    |

## Journey and delivery model acceptance

W26 integrates the three separate journey receipts with the four ownership models.
Every row starts **planned**. Models change the trust, account and operational
boundaries, not just the deployment's name. W01 names the actual workload/client
profile, catalogue and inputs in every row. W26 records accountable client and service
owners, configuration identity, elapsed/human effort, cost, acceptance, failure/recovery
and handover receipts. W27 adds applicable sustained-operation evidence.

| Cell | Journey            | Delivery model          | Distinct acceptance boundary                                                                                          | Status  |
| ---- | ------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------- | ------- |
| J1-S | Launch application | Shared PUNI             | Shared running services with two-client isolation, contention, per-client identity/telemetry and independent exit     | Planned |
| J1-D | Launch application | Dedicated PUNI-operated | Dedicated client estate/state and PUNI maintenance/recovery ownership; shared external dependencies still declared    | Planned |
| J1-C | Launch application | Client-owned            | Client accounts/CI/IdP/infra, existing-stack integration and continued operation after PUNI access removal            | Planned |
| J1-H | Launch application | Hybrid                  | Separate ownership across application/shared services; dependency loss, credential boundary, cost and export/handover | Planned |
| J2-S | Scale application  | Shared PUNI             | Measured improvement without violating another client's load/reliability budget                                       | Planned |
| J2-D | Scale application  | Dedicated PUNI-operated | Useful capacity improvement, state constraints, maintenance, scale-down and recovery in dedicated estate              | Planned |
| J2-C | Scale application  | Client-owned            | Baseline existing stack, constrained integration/change, retained client operation and rollback authority             | Planned |
| J2-H | Scale application  | Hybrid                  | Bottleneck and measurements across owned/shared boundaries; shared dependency failure and fully allocated cost        | Planned |
| J3-S | Operate assistant  | Shared PUNI             | Separate client tool authority/state on shared infrastructure; approved effects, spend and cross-client denial        | Planned |
| J3-D | Operate assistant  | Dedicated PUNI-operated | Dedicated gateway/state/credentials with PUNI update, recovery, supervision and offboarding                           | Planned |
| J3-C | Operate assistant  | Client-owned            | Client installation/accounts/connectors, updates and recovery without hidden PUNI credentials                         | Planned |
| J3-H | Operate assistant  | Hybrid                  | Private client tools/state versus shared inference/telemetry, explicit transfers, dependency failure and revocation   | Planned |

Component proofs can be shared across cells when applicable. Each distinct journey,
ownership and trust boundary still needs an executed integration receipt; 12 labels
on the same run do not establish breadth. AWS and Hetzner must both have actual
acceptance in the overall set; the scope does not require every provider in every cell.
A production-like test estate may qualify a technical boundary. It cannot substitute
for an actual client's acceptance of their application or assistant.

## Completion record to maintain during execution

For each C-row and matrix cell, record:

- Accepted contract/target and named accountable owner.
- Package/change and source/configuration/environment identities.
- Positive and required negative receipts, actual commands, dates and proof limits.
- Client outcome, engineering/operator/wait time, costs and handover where applicable.
- Remaining gap, next action and status: planned, in progress, blocked, or accepted.

W27 may mark readiness complete only when every applicable criterion and all model
cells meet their accepted targets. A newly discovered branch, missing runtime proof,
failed target or unauthorized access path remains open. Removing criteria or models
requires an explicit scope decision; this roadmap does not make that decision.
