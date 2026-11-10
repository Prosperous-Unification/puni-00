# Assessment verification and coverage

Scope: [puni-assessment.md](../../../puni-assessment.md), scope commit74591b2,
assessment source7614ca5116e2b27831076f7bc7c9f9872051c388. This verifies an evidence
assessment, not a release or full platform qualification. Detailed commands/outcomes
and environment boundaries are in the owning sheets and [live evidence](live-evidence.md).
No production behavior, infrastructure, secrets or operational task state changed.

## Coverage audit

| Requirement                                                                                                                                       | Assessment artifact / proof                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Three client requests assessed separately, initial delivery and ongoing operation                                                                 | report.md journey table; INF/DEL/SEC/AST acceptance/ownership and roadmap W22/23/24/25/27                        |
| Shared, dedicated, client-owned and hybrid models; code/automation/service reuse; ownership and exit                                              | report.md model table; security-assistant.md model/REU findings; INF-02/06                                       |
| Prior plans/docs/artifacts vs current code/config and actual infrastructure                                                                       | All findings' intent/implementation/reconciliation; explicit public/companion pins; live-evidence.md             |
| Cloud provisioning and general fleet lifecycle, safe operations and platform dependencies                                                         | infrastructure.md INF-01–04; lifecycle matrix includes standalone/k3s/client-owned                               |
| Security, isolation, attack bounds, least privilege, secrets and revocation                                                                       | security-assistant.md SEC-01–08; denied/unknown/current environment boundaries explicit                          |
| Availability, maintenance, backups/retention/protection and recovery/RPO/RTO                                                                      | INF-03/06/07; fresh units plus historical proof and missing live-service recovery, not a new drill               |
| Capacity, workload placement/state constraints, adding nodes, performance/cost improvement                                                        | INF-01/05; no application scaling claim from node count or quiet memory                                          |
| App/infrastructure/assistant health plus change delivery, definitions/ownership/access/retention                                                  | observability-cost.md measurement table; fresh counters/stores; missing full request/agent/outcome/cost coverage |
| Quality, modularity, planning/spec/review/verification artifacts and parallel agent work                                                          | delivery-swarm.md DEL/SWM findings; scope-limited fresh tests and unperformed acceptance                         |
| All11 swarm criteria and four named open workflow items                                                                                           | delivery-swarm.md SWM-01–11; live WBS unknown/in_progress reads, not invented completion                         |
| CI/CD onboarding, gates, artifacts/provenance, environment/promotion/migrations/rollback, permissions/runners/concurrency/interruption and timing | delivery-swarm.md DEL-01–06 and live GitHub/settings/runtime identity                                            |
| Reusable auth/Auth0/other providers and second-app adoption                                                                                       | security-assistant.md SEC-02, REU-01/02; implemented OIDC vs unproved second-app qualification                   |
| OpenClaw install/tasks/permissions/privacy/spend/update/recover/offboard                                                                          | security-assistant.md AST-01–04; current safe metadata only, effective policy unknown                            |
| Cost/effort attributable to client and change                                                                                                     | MET-01/INF-06/SWM criteria; no current invoice/operator-minutes claim                                            |
| Each capability's outcome/applicability/intent/implementation/evidence/reconciliation/gap/action                                                  | Detailed INF/SEC/REU/AST/DEL/SWM/OBS/MET findings; roles are proposed ownership, not staffing assigned           |
| Prioritized implementation vs activation vs verification vs documentation, dependencies/effort/benefit/owners/closure                             | roadmap.md all28existingpackages and seven bounded action groups                                                 |
| Unknown/unavailable/stale evidence and skipped checks explicit                                                                                    | live-evidence.md, each sheet's limits, test prerequisite failures and source/runtime distinctions                |

## Fresh bounded test executions

Results are reported **per command**. Some files were retried after unavailable
loopback/generated prerequisites; do not add earlier passing fragments to manufacture
a unique complete-suite count. No changed safety guard requires a new mutation proof,
because this assessment changes documentation only. Historical R5 omissions remain dated.

| Command scope                                             | Executed source                              | Passing result                 | Owning evidence                                                                            |
| --------------------------------------------------------- | -------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| Fleet contracts/maintenance/Terraform parser-planners     | d87afb94; relevant blobs unchanged at7614ca5 | 36 tests,79 assertions,668ms   | infrastructure.md                                                                          |
| Delivery observations/timing + Burokrat accounting/export | d87afb94; unchanged relevant blobs           | 36 tests,107 assertions,478ms  | delivery-swarm.md                                                                          |
| Descriptor/promotion + local coordinator                  | d87afb94; unchanged relevant blobs           | 72 tests,192 assertions,3.94s  | delivery-swarm.md                                                                          |
| Auth adapter + login throttle                             | d87afb94; unchanged relevant blobs           | 127 tests,355 assertions,449ms | security-assistant.md; initial sandbox EPERM retained                                      |
| MCP limits/epoch + SCIM, after declared prepare           | d87afb94; unchanged relevant blobs           | 54 tests,986 assertions,6.36s  | security-assistant.md; initial missing ignored OpenAPI/loopback failures retained          |
| Anonymous admission + proxy trust                         | d87afb94; unchanged relevant blobs           | 40 tests,363 assertions,3.06s  | security-assistant.md; no paid provider call                                               |
| Resource encoding + stored acceptance                     | 7614ca5                                      | 74 tests,145 assertions,376ms  | observability-cost.md; private log `/tmp/puni-assessment-20261110/observability-tests.log` |

Bun1.4.4 frozen install checked1,831 installs/1,678 packages, no dependency changes.
No full Nx/host gate, release/browser/client/load/provider/paid-inference/restore
campaign or fresh guard-removal mutation was run. These limits prevent using selected
passing fixtures as a global readiness or deployed behavior claim.

## Documentation checks

The final command receipts are recorded here after execution. Required checks are
formatting, whitespace, declared assessment-link/member coverage, current-document
policy and all OpenSpec validations. OpenSpec is a repository-consistency check;
this documentation assessment creates no new behavior change/specification.

Final documentation results,2026-11-10:

- `bun x prettier --check docs/findings/puni-assessment-2026-11-10/*.md docs/findings/README.md`: passed after formatting the new matrix and corrected source links.
- `git diff --check`: passed; staged scope is the eight assessment documents and the findings router only. The assessment plan and executable/configuration sources are unchanged.
- `bun x openspec validate --all --json`: **342 passed,0failed**. This verifies repository artifacts, not current runtime readiness.
- `bun tools/tool-devsync/src/check-documents.ts`: **Verified current documents and indexes**, exit0. Initial run rejected three incorrect source links; those were corrected. A subsequent run required new indexed members to be staged; only the assessment members/router were staged, then validation passed. No policy exemption or verifier change was used.
- Explicit membership/coverage check: eight declared assessment files, all28 W packages and all11 SWM criteria present. Human review checks the meaning and evidence, not just identifier presence.
- Independent infrastructure, delivery/measurement and security/assistant reviews completed. Two Important findings were fixed and rechecked: preserve the entire12-cell journey/model scope and prevent change-failure denominator bias. No unresolved blocking assessment finding remains. Readiness gaps in the report remain open work; review approval does not qualify the platform.

Source/read evidence was bounded to the stated snapshot/window. No CI/host campaign
or hidden runtime acceptance is implied by a docs-only publication. Session raw
receipts are private; these committed artifacts preserve the observations, methods,
source pins, initial failures, proof limits and next actions needed for review.
