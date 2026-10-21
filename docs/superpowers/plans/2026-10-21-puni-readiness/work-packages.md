# PUNI readiness work packages

Part of the [roadmap](../2026-10-21-puni-readiness-roadmap.md); accountable roles,
dependencies and estimates are defined there. [Criteria coverage](criteria.md) owns
the requirement mapping. Every checkbox starts open. Proposed change names below are
planning suggestions, not claims that those directories already exist.

## Execution and evidence contract

These packages are independently reviewable outcomes. At package start, read the
linked source, callers, tests and latest verification before changing anything. Break
the package into the repository's ordered OpenSpec TDD slices after its design
decisions are settled. Reuse existing change ownership; create a new delta only for
behavior not already owned. Do not create 27 competing specifications mechanically.

For a changed behavior: write the named negative case, observe its intended failure,
implement the smallest change, then run the positive and negative. For each new/changed
safety guard, remove it or break its dependency in a disposable production-path test,
watch the assertion fail, restore it, and record the adjacent `Proof:` and factual
`verify.md` evidence. Preserve absence/unreadability/malformed distinctions. Operational
drills name their disposable or explicitly authorized target and recovery procedure.

Each accepted packet hands off: current contract; source/configuration and environment
identity; actual command and assertions; positive and applicable negative evidence;
owner; measured engineering/operator/wait time; limits; and the criteria it closes.
Use focused Bun/Nx checks, then the required exact-SHA host gate for implementation
integration. A host gate does not replace provider, browser, restore or client acceptance.

## Establish the operating baseline

### W01 — Fix service contracts and ownership

**Work:** decision/specification. **Start from:** [scope](../../../../puni-assessment.md),
[delivery-model findings](../../../findings/puni-assessment-2026-10-21/security-assistant.md),
[client repository intent](../../../twilight-structure/client-repositories.md).

- [ ] Name one representative workload for each journey and one configuration for each
      delivery model; define supported OS/architecture/runtime/database/provider versions
      and the explicit adaptation path for existing client stacks.
- [ ] Assign named account, DNS, IdP, information, credential, billing, application,
      platform, incident, recovery and exit owners. Set support hours and maintenance windows.
- [ ] Agree numeric availability/error/latency/load, RPO/RTO, retention, onboarding,
      abuse/degradation, assistant task/spend and operating-cost targets **before** acceptance.
      Preserve workload sizes and denominator/window definitions with those targets.
- [ ] Record reuse of code, automation and shared running services separately, along
      with shared failure/admin boundaries. Resolve hard-to-reverse choices through the
      existing domain/ADR process; do not broaden a gateway's authority by implication.

**Output/pass:** four complete model contracts and three journey profiles with named
owners, input checklist, targets and acceptance cases. A review with a deliberately
missing backup owner, unspecified target or substituted client account must reject
the affected profile. This is completeness evidence, not runtime security proof.
**External input:** client/account owners and support/cost decisions.

### W02 — Diagnose and restore scheduled backup protection

**Work:** operational diagnosis, bounded repair and verification. **Start from:**
[live failure record](../../../findings/puni-assessment-2026-10-21/live-evidence.md),
[recovery runbook](../../../infra/recovery.md), [backup source](../../../../tools/tool-fleet/src/backup-sqlite.ts).

- [ ] Bound initial diagnosis to one engineering day and 2–4 attended operator hours.
      Read actual unit/script identities, sanitized failing phase, invocation IDs and
      per-store generation/object metadata. Identify newest independently usable generation.
- [ ] Distinguish snapshot, upload, encryption/key, storage/retention and notification
      faults; state affected stores and possible recovery-point loss. Re-estimate repair
      from evidence if its cause falls outside the initial package allowance.
- [ ] Fix the identified fault through its owning code/configuration process. Preserve
      old generations; run a controlled backup and restore into an isolated target.
- [ ] Observe the next scheduled invocation and delivered failure/resolution alert.

**Output/pass:** cause and impact explained, known record/integrity recovery measured,
and a successful scheduled protected generation. Missing/corrupt generation, rejected
credentials and failed job must be visible and never recorded as backup success.
A diagnostic that ends with an unknown cause does **not** close W02; create the next
bounded diagnostic and keep service protection unresolved. All-store completion is W10.

### W03 — Reconcile the production release identity

**Work:** investigation, contract reconciliation and required narrow repair.
**Start from:** [production evidence](../../../findings/puni-assessment-2026-10-21/live-evidence.md),
[prod readiness tasks](../../../../openspec/changes/prod-deploy-readiness/tasks.md),
[publish source](../../../../tools/tool-dagger/src/lib/publish.ts), [runbook](../../../runbook-prod-deploy.md).

- [ ] Preserve state files, live routing, container IDs/labels, registry manifest
      digests, image/build records, installed executor identities and candidate gate receipts.
- [ ] Distinguish inherited base-image metadata from application identity for each tier.
      Independently prove the source
      chain where possible; retain an explicit unrecoverable-provenance finding otherwise.
- [ ] Repair the identity-producing contract if faulty. If historic provenance cannot
      be proved, replace it only via an accepted release after W02/W04 prerequisites and
      the applicable existing deployment checks; do not relabel an unknown image.

**Output/pass:** a current per-tier routed runtime → immutable artifact → source/build
→ accepted gate chain, including frontend. Mixed-tier source, stale executor or missing
identity fails the actual release/acceptance boundary. W12 completes reusable build and
promotion guarantees. Diagnosis alone does not close the provenance criterion.

### W04 — Enforce merge checks and preserve required verdicts

**Work:** policy activation plus narrow workflow changes. **Start from:**
[PR-base change](../../../../openspec/changes/ci-pr-merge-base/tasks.md),
[CI](../../../../.github/workflows/ci.yml), [infra checks](../../../../.github/workflows/infra-check.yml),
[gate tests](../../../../tools/tool-git-hooks/src/hooks/gate-workflow.test.ts).

- [ ] Define required checks and path-aware aggregates, merge/composed-tree policy,
      protected policy/workflow edits and attributable emergency bypass behavior.
- [ ] Apply repository settings; preserve every required main infrastructure verdict
      under concurrent pushes instead of silently cancelling the earlier one.
- [ ] Exercise failing, cancelled, unexpectedly skipped and passing disposable PRs,
      including stale merge base and an unmapped workflow event.

**Output/pass:** API settings readback plus a real failing merge refused and a correctly
validated candidate accepted. YAML-only evidence does not pass. Continue existing PR
contract work; create a bounded enforcement/concurrency delta for new behavior.
**External input:** repository/organization administrator and normal CI execution time.

### W05 — Refresh estate evidence and reconcile existing work

**Work:** read-only discovery and artifact reconciliation. **Start from:**
[platform map](../../../platform-map.md), [discovery transport](../../../../openspec/changes/discovery-ssh-transport/tasks.md),
[site input schema](../../../../infra/environments/site-inputs.schema.json),
[assessment](../../../findings/puni-assessment-2026-10-21/report.md).

- [ ] Obtain the authorized read identity needed for Kubernetes/provider status;
      record actual accounts, nodes, services, stores, dependencies, versions and ownership.
- [ ] Reconcile prior plans/OpenSpec/runbooks with current source and environment.
      Classify each inherited slice: implementation needed, activation owed, proof owed,
      superseded, or already evidenced. Preserve dated proofs and their limits.
- [ ] Correct current navigation/status and phase-specific recovery instructions;
      sync/archive only changes whose actual acceptance is complete. Dev activation must
      be verified, not repeated because an older runbook says it is absent.

**Output/pass:** complete known-estate register plus explicit unresolved assets/access;
one current contract pointer per affected capability. Missing permission is recorded
as unknown, never an empty healthy estate. A source/staging/production distinction is
mandatory. Do not rewrite immutable historical evidence to make it look current.

## Complete managed infrastructure and protection

### W06 — Manage the general node fleet

**Work:** extend missing standalone lifecycle and reuse host configuration.
**Start from:** [existing-host contract](../../../../openspec/changes/enroll-existing-hosts/specs/fleet/spec.md),
[base role](../../../../infra/ansible/roles/base/tasks/main.yml),
[preflight](../../../../infra/ansible/playbooks/preflight.yml), [host gate coordination](../../../runbook-h2-heavy-lock-owner.md).
**New scope:** propose `general-host-lifecycle`, keeping k3s membership with its owner.

- [ ] Represent h1/h2 standalone roles, h3/h4 mixed roles, workers and client-owned
      machines with stable identity, role, owner, configuration and lifecycle state.
- [ ] Implement or document supported configure/drift/patch/reboot/rotate/repair/
      replace/recover/retire operations, staged concurrency and durable resumable outcomes.
      Coordinate standalone builds, deployments and assistants as well as Kubernetes drains.
- [ ] Converge twice, patch/reboot and recover a disposable representative of each
      distinct role; preserve explicitly retained client services and administration.

**Output/pass:** role lifecycle matrix, maintenance runbooks and actual convergence/
recovery/retirement receipts. Wrong host, lost SSH, interrupted update, competing
maintenance, blocked drain or missing required protection refuses unsafe progression.
Rebooting a retired node must not re-enroll it. Ansible is an implementation option,
not the completion criterion. Destructive real-host rollout needs W10 recovery evidence;
disposable lifecycle fixtures can complete before that rollout.

### W07 — Qualify Hetzner and infrastructure state

**Work:** complete provider acceptance; extend only confirmed gaps. **Start from:**
[k3s-fleet F4](../../../../openspec/changes/k3s-fleet/tasks.md),
[Terraform/Terragrunt runbook](../../../../infra/terraform/README.md),
[provider module](../../../../infra/terraform/main.tf), [apply authority](../../../../tools/tool-fleet/src/apply.ts).

- [ ] Establish protected, account-separated state, real locking/version recovery,
      scoped credentials and reviewed resource catalogue. Distinguish admitted Hetzner
      Cloud node kinds from unqualified ARM/bare-metal variants.
- [ ] In a disposable funded account/project, create or import, enroll, reapply as a
      no-op, change capacity, detect drift and retire; account for every paid resource.
- [ ] Exercise wrong account, stale state lineage/serial, competing lock, altered
      plan/config/binary, lost provider response and foreign/retained resource deletion.

**Output/pass:** real provider lifecycle and state-recovery receipts, billing/resource
reconciliation, no duplicate create after interruption, and retained volume/IP safety.
Fixture/provider-schema tests alone do not pass. Existing client-owned adoption is a
separate case. **Wait:** account roles, backend, budget and provider capacity.

### W08 — Qualify k3s expansion and safe maintenance

**Work:** finish existing fleet acceptance and defects it reveals. **Start from:**
[k3s-fleet F5](../../../../openspec/changes/k3s-fleet/tasks.md),
[drain harness](../../../../tools/tool-fleet/src/drain-rehearsal.ts),
[fleet runbook](../../../infra/fleet.md), [maintenance planner](../../../../tools/tool-fleet/src/maintenance.ts).

- [ ] Finish real-VM protected local-PV/SQLite/forge/PDB drain cases, successful
      stateless retirement, vanished-node replacement and unchanged reapply.
- [ ] Prove quorum-preserving control-plane maintenance, fixed registration endpoint,
      rolling pinned-version upgrade and interrupted upgrade recovery. Test enough servers
      to exercise actual quorum/removal, not a one-node imitation of HA.
- [ ] Exercise token/certificate rotation, escrow and old-snapshot compatibility;
      enroll real workers and observe useful work, placement and resource limits.

**Output/pass:** identity-bound node/cluster receipts and staged operating runbook.
Last capability, unhealthy quorum, stale identity, missing recovery key, lost lease and
PDB deadline violations refuse. Record node/CPU/memory capacity and placement before/
after adding capacity. Disposable proof precedes production rollout protected by W10.

### W09 — Complete platform dependencies and standard service onboarding

**Work:** activation and integration. **Start from:** [platform tasks](../../../../openspec/changes/k3s-platform/tasks.md),
[platform runbook](../../../infra/platform.md), [storage selection](../../../../infra/clusters/platform/production/storage.yaml),
[mTLS acceptance](../../../../openspec/changes/otlp-mtls-canary/tasks.md).

- [ ] Reconcile current Flux state and finish real secret inputs, network/MTU, DNS,
      TLS issue/renewal, ingress/Caddy/Traefik ownership, registry trust/auth and storage.
- [ ] Decide and prove the admitted local-path or provider-CSI access/reclaim/resize/
      reattachment contract. Node-local storage must never be represented as portable HA.
- [ ] Define the service input contract: artifact, ports/routes, health/business smoke,
      resources, placement, state, identity, secrets, logs, backups and owner. Onboard a
      standard service with elapsed/operator measurements against W01's accepted target.
- [ ] Qualify resource requests/limits/quotas, shared build/edge/registry/control-plane
      failure domains and recurring certificate/key maintenance for the selected service tier.

**Output/pass:** a clean supported site reaches Ready at the pinned configuration and
accepts the service; renewal, restart and dependency failure are observable. Wrong
cluster, missing secret, untrusted/expired certificate, broken DNS, failed registry
pull, invalid storage attachment or absent required capability fails acceptance.
No HA claim follows from a Ready pod. W10/W13/W17 close recovery/alert/load outcomes.

### W10 — Protect and restore every persistent store

**Work:** coverage/retention gaps, activation and independent recovery. **Start from:**
[platform recovery contract](../../../../openspec/changes/k3s-platform/specs/platform/spec.md),
[recovery guide](../../../infra/recovery.md), [backup CronJob](../../../../deploy/k8s/wbs/base/backup.yaml),
[verification CronJob](../../../../deploy/k8s/wbs/base/verify-cronjob.yaml),
[completed local-store proof](../../../../openspec/changes/local-object-store-image/verify.md).

- [ ] Map every existing DB/PVC/configuration/registry/telemetry and key dependency
      to consistency, schedule, retention, ownership, protected independent copy and RPO/RTO.
      Include MCP sessions/key compatibility and website restore/erasure semantics.
- [ ] Repair missing coverage and bounded cleanup, including current generations;
      preserve newest-good backups and apply client-approved immutable/off-region/account
      protection and independent recovery escrow.
- [ ] Restore each distinct consistency mechanism into a clean target; verify known
      records/files, schema, permissions, application behavior and resumed scheduling.
      Define the same inventory/restore contract for new stores added by W22–W25.
- [ ] Exercise corrupt/stale/absent backup, unreadable/missing keys, interrupted upload,
      source deletion and unauthorized deletion; observe real recipient failure/resolution.

**Output/pass:** complete coverage register and measured restore receipts, no unprotected
required store, and verified pruning/expiry without deleting the newest good generation.
Policy installation is not elapsed retention proof: retain the actual lifecycle window
(currently at least 31 calendar days for the referenced expiry behavior) in W27.
Propose `estate-backup-coverage-retention` only for coverage not already owned.
Assistant-specific state recovery is integrated by W25 and checked again by W26.

### W11 — Implement AWS resource lifecycle

**Work:** mandatory new provider capability plus real qualification. **Start from:**
[provider-neutral plan](../../../../tools/tool-fleet/src/plan.ts),
[apply boundary](../../../../tools/tool-fleet/src/apply.ts),
[site schema](../../../../infra/environments/site-inputs.schema.json),
[current provider lock](../../../../infra/terraform/versions.tf).
**New scope:** propose `aws-resource-lifecycle`; share authority contracts where valid.

- [ ] Inventory accounts/regions and admit the resource catalogue selected in W01:
      network/IAM/compute/block and object storage/static addressing/security, plus explicit
      DNS/registry/secret/telemetry ownership. Include current client-owned resources.
- [ ] Implement Terragrunt/state/account boundaries, scoped access, adoption/import,
      create/change/drift/replace/retire, billing attribution and retained-state behavior.
- [ ] Qualify one PUNI-operated and one client-controlled account path, including
      export and continued client operation after PUNI access removal.

**Output/pass:** actual provider receipts and accounted cleanup, repeatable no-op,
recoverable state and retained volumes/objects. Wrong account/region/role, missing
permissions, partial discovery, throttling, lost response and cross-client state
cannot produce a false success or unsafe deletion. AWS-named S3 adapters do not pass
this package. **Wait:** account/organization roles, quotas and billing access.

## Complete delivery, visibility and client boundaries

### W12 — Qualify reusable CI/CD and release recovery

**Work:** build/provenance extensions and existing deployment acceptance.
**Start from:** [publisher](../../../../tools/tool-dagger/src/main.ts),
[k3s delivery](../../../../openspec/changes/k3s-wbs-delivery/tasks.md),
[migration rollback](../../../../openspec/changes/restore-applied-migration-set/tasks.md),
[deployment contract](../../../infra/deployment.md), [prod recovery](../../../runbook-prod-deploy.md).

- [ ] Pin material build inputs, retain source/tool/dependency provenance, compare two
      clean builds and resolve unexplained differences; verify consumed immutable artifacts.
      Add complete frontend identity and accepted-gate binding to every supported path.
- [ ] Package pipeline configuration and environment/secrets/promotion contracts.
      Prove deploy-runner/ref/workflow restrictions, cleanup/cache boundaries, preserved
      verdicts, serialized release ownership and interrupted/partial publication recovery.
- [ ] Complete actual staging-to-prod digest promotion, business smoke, solver/retained
      PVC and MCP restart acceptance. Reconcile automatic rollback versus attended recovery
      by phase; preserve single-writer fences and the complete migration name/hash ledger.
- [ ] Decide canary applicability for each workload and record the selected rollout.
      If canary is offered, demonstrate it with agreed error/latency/abort thresholds;
      otherwise prove the accepted alternative. For stateful changes, prove the compatible
      rollout/write policy; do not substitute unsafe simultaneous SQLite writers.
- [ ] Qualify registry retention/GC, protected rollback artifacts and orphan-image
      cleanup without losing referenced releases.

**Output/pass:** commit → enforced gate → identifiable build → staging proof → exact
production artifact → business acceptance, with an independently replayable receipt.
Tampered/expired promotion, stale executor, missing identity, failed health/migration,
coordinator death, edited rollback, wrong Lease and Flux divergence must reach their
specified bounded failure/recovery state. W12 closes with the complete pipeline exercised
against a disposable production-equivalent destination and controlled identities. Actual
client production acceptance is W22/W23/W25, after W13/W15 where applicable; this avoids
making W12 and W15 wait for each other. No package claims the old source is active merely
because its tests pass.

### W13 — Make health, sessions and alerts observable

**Work:** instrument actual processes and complete telemetry acceptance.
**Start from:** [observability findings](../../../findings/puni-assessment-2026-10-21/observability-cost.md),
[logging tasks](../../../../openspec/changes/log-failure-records/tasks.md),
[alerts](../../../../openspec/changes/close-observability-alert-gaps/tasks.md),
[collector](../../../../infra/platform/observability/otel/collector.yaml),
[gateway counters](../../../../apps/wbs/gw-01/src/service/gateway-metrics.ts).

- [ ] Export request/error/latency/throughput/socket and saturation/capacity/recovery
      measures from running apps, and session/tool usage/failure/cost with bounded labels.
- [ ] Connect real scrapes/export to dashboards and named recipients; correct health
      routing and assert backend/business semantics rather than accepting SPA HTML.
- [ ] Correlate request/session/tool/effect/change/deployment and failure occurrences;
      set per-client access, retention, redaction and diagnostic-versus-durable-audit policy.
- [ ] Exercise known successful/failed requests, dropped series, collector restart,
      refused/hanging exports, stale backup and shared-service failure; measure detection,
      notification and recovery. Keep upstream log-loss obligations explicitly open if
      no verified fix exists; durable audit must not depend on an unproven lossless path.

**Output/pass:** expected application samples and histogram counts reach the correct
client/environment and recipient, with resolution. A scrape containing only
`target_info`, absent metrics, a broken transport, leaked synthetic secret or foreign
client query fails. Add a focused instrumentation delta; do not recreate tested alerts.

### W14 — Collect delivery metrics, cost and operator effort

**Work:** operational adoption/collection. **Start from:** [trial accounting](../../../../apps/twilight-structure/twilight-burokrat/cli/src/experiments/accounting.ts),
[portable export](../../../../apps/twilight-structure/twilight-burokrat/cli/src/experiments/export.ts),
[review audit](../../../../apps/twilight-structure/twilight-burokrat/cli/src/review/audit.ts),
[measurement intent](../../../../openspec/changes/agent-scalable-llm-wiki/tasks.md).

- [ ] Define accepted outcome and windows/denominators; collect request acceptance,
      review/merge, CI/gate queue/start/end, deploy/client acceptance, failure/rework/recovery.
- [ ] Ingest real model/tool/provider charges and infrastructure/storage/traffic/tooling
      bills; record hands-on human effort separately from wait and shared-cost allocation.
      Join client/repo/change/SHA/run/artifact/environment; retain failed/censored attempts.
- [ ] Publish permissioned dashboards and independently recomputable exports; report
      missing/unpriced/unallocated evidence visibly and reconcile totals with a billing cycle.

**Output/pass:** operational collectors with a real change, failed attempt and priced
usage reconciled end to end, not just a schema. W22/W23/W25 populate their actual journey
receipts; W26 verifies complete attribution across models. Duplicate/reordered/missing
events, omitted loser charges, mixed currency,
foreign-client records or missing prices reject or produce the defined incomplete state.
W27 closes the observation/billing window; zero accepted outcomes never becomes a zero
cost-per-outcome claim. Add a bounded collection delta without a competing ledger.

### W15 — Qualify client identity and isolation

**Work:** reconcile/complete existing security acceptance. **Start from:**
[organization access](../../../../openspec/changes/organization-ownership-and-access/tasks.md),
[enterprise SSO](../../../../openspec/changes/organization-enterprise-sso/tasks.md),
[MCP refresh](../../../../openspec/changes/mcp-refresh-policy/tasks.md),
[social sign-in](../../../../openspec/changes/social-sign-in/tasks.md),
[activation guide](../../../runbook-organization-activation.md).

- [ ] Reconcile actual dev activation/current production identities, browser authority,
      old-process fence, credential epoch and policy-publication work. Finish genuine gaps.
- [ ] Prove organization switching, stale tabs, invitations/email/domain proofs, SSO
      mapping and real IdP/SCIM acceptance for the supported identity profile.
- [ ] Test two clients across browser/HTTP/socket/presence/replay/MCP, including viewer
      denial, revoked memberships/credentials, provider-wait races, restart and downgrade.

**Output/pass:** deployment-bound client isolation and revocation receipts meeting the
existing transport contracts. Bypassed organization predicate, retained revoked grant,
removed socket lease, old MCP epoch or missing audit insertion fails the production-path
test. Unknown current policy never grants access. Real provider acceptance is distinct
from mock protocol tests. Do not reactivate an already activated store.

### W16 — Manage secrets, information lifecycle and client exit

**Work:** lifecycle integration and operational drills. **Start from:**
[secrets tool contract](../../../../tools/tool-secrets/src/README.md),
[MCP key lifecycle](../../../../apps/wbs/mcp-01/README.md),
[platform tasks](../../../../openspec/changes/k3s-platform/tasks.md),
[recovery guide](../../../infra/recovery.md).

- [ ] Inventory credential references/owners/scopes/consumers/expiry/escrow for host,
      cloud, registry, IdP, SCIM, MCP, internal services, connectors and inference.
- [ ] Select and implement the actual issue/deliver/rotate/revoke/audit mechanism for
      each model; exclude placeholder-success tools from the operational path.
- [ ] Exercise overlap, interrupted rotation, emergency revoke and clean-machine key
      recovery. Map information through stores/exports/logs/caches/assistant/provider/backups.
- [ ] Deliver export/erasure/backup-expiry and account/billing/control handover procedures;
      prove independent operation after removal of PUNI's access.

**Output/pass:** lifecycle mechanisms and per-model contracts exercised on representative
controlled/existing fixtures, with no hidden personal account dependency. Actual AWS
account exit is W11; assistant and complete journey/model exit are W25/W26. W16 does not
wait for those future environments to exist. Missing/unreadable key, wrong-client reference, omitted consumer,
retained revoked grant or missing synthetic store marker is detected. No plaintext in
evidence. Proposed cross-service change: `client-credential-and-information-lifecycle`;
reuse existing MCP/host/application revocation contracts. W25 extends assistant coverage.

### W17 — Qualify abuse resistance and resource contention

**Work:** measured protection envelope and necessary controls. **Start from:**
[security findings](../../../findings/puni-assessment-2026-10-21/security-assistant.md),
[login throttle](../../../../libs/wbs/application/core/src/module/authentication/login-throttle.ts),
[MCP OAuth](../../../../apps/wbs/mcp-01/src/oauth.ts),
[network policy](../../../../infra/platform/policy/network-policy.yaml).

- [ ] Fix numeric legitimate/attack populations, NAT/proxy assumptions, endpoint/body/
      socket mix, duration, acceptable victim degradation and recovery time before testing.
- [ ] Exercise expensive auth, registration/session exhaustion, authenticated CPU/DB
      work, fan-out, disk/memory/queue pressure and edge/network dependency failure.
- [ ] Add per-client admission/limits, trusted forwarding, bounded work and provider/edge
      controls where measurements require them; account for replication and process restarts.

**Output/pass:** legitimate clients meet the contracted behavior at the tested envelope,
rejected work has no prohibited mutation/paid effect, and service recovers on schedule.
Disable limiter/resource fence or trust spoofed forwarding and observe the test fail.
Record upstream protection ownership and limits; never claim unlimited DDoS resistance.
Assistant-specific tool/cost abuse is additionally proved by W24/W25.

### W18 — Deliver reusable authentication

**Work:** second-consumer contract/extraction and adoption. **Start from:**
[provider-agnostic auth](../../../../openspec/changes/provider-agnostic-oidc-auth/tasks.md),
[WBS adapter](../../../../libs/wbs/adapters/auth/src/index.ts),
[authentication module](../../../../libs/wbs/application/core/src/module/authentication/README.md),
[auth integration](../../../auth-integration.md).

- [ ] Define Auth0 plus another real OIDC provider and explicit supported password/
      social/enterprise methods; preserve application-owned roles/account mapping.
- [ ] Extract only demonstrated second-consumer seams into a versioned module or
      integration recipe, with strict config, deployment/secret and upgrade contracts.
- [ ] Adopt in an independent second app using a minimal fixture repository; W19 then
      incorporates the proven module into the full starter. This ordering avoids a circular
      dependency between auth adoption and starter completion.

**Output/pass:** both apps and both providers pass sign-in/refresh/logout/revocation,
callback/origin/audience denial and an upgrade with existing sessions. Foreign WBS
claims cannot grant second-app privileges. An unfamiliar implementer follows the guide
with measured manual effort. Propose `second-application-auth-adoption`; do not revive
retired website sign-in to manufacture a second consumer.

### W19 — Package client repositories and upgrades

**Work:** versioned starter and adoption. **Start from:**
[client repository target](../../../twilight-structure/client-repositories.md),
[portable ESLint](../../../../tools/workspace/eslint.portable.mjs),
[product policy discovery](../../../../tools/tool-devsync/product-policies.mjs),
[control-plane tasks](../../../../openspec/changes/twilight-control-plane/tasks.md).

- [ ] Create a clean versioned Nx/Bun starter with app/module contracts, protected
      pipeline configuration, environment references, auth, telemetry, artifacts and owners.
- [ ] Keep client content/credentials separate; validate manifest versions and allowed
      integrations. Use the existing OpenSpec planning mode until its real replacement is
      accepted; do not pretend the proposed Backlog migration has happened.
- [ ] Instantiate a separate client repo, add a real feature, and upgrade the template
      while preserving client code/configuration and reversible migration behavior.

**Output/pass:** clean adoption and upgrade receipts, unknown version and forbidden
integration refusal, failing checks block delivery, no copied client secrets/content.
Create a scoped manually operated starter change; this does not close Twilight Task14
or its Tasks10–13/self-growing-factory prerequisites. Record setup and upgrade effort.

### W20 — Prove modularity and artifact quality

**Work:** supported-profile enforcement and targeted deepening. **Start from:**
[organization rollout](../2026-09-19-code-organization-rollout.md),
[test axes](../../../../openspec/changes/test-axes/tasks.md),
[refactoring ledger](../../../refactoring/tasks.md),
[rule policy](../../../code-organization/rule-policy.json).

- [ ] Select the client starter's module/runtime/product profile and inspect actual
      coupling/review hotspots. Map existing enforcing rules versus observe-only rules.
- [ ] Complete applicable rule/test-level/scenario evidence; deepen only the modules
      whose contracts require it. Every supported rule gets an enforced mode or an explicit
      time-bound, owned exception with a closing task; it cannot silently pass as observed.
- [ ] Produce concise current contract/acceptance navigation and retire contradictory
      mutable summaries while preserving original evidence.

**Output/pass:** forbidden imports/service directions, missing required scenario/level,
stale policy or incomplete required evidence fails actual admission; correct fixtures
pass. An independent reviewer finds behavior, tested revision and remaining proof from
the index. W21 measures delivery effect; smaller files alone do not prove speed.

### W21 — Measure parallel-agent delivery and set supported concurrency

**Work:** benchmark, bounded bottleneck correction and supported-capacity decision. **Start from:**
[experiment accounting](../../../../apps/twilight-structure/twilight-burokrat/cli/src/experiments/accounting.ts),
[fixed corpus](../../../experiment-evidence/fixed-benchmark-corpus.v1.json),
[lane lessons](../../../2026-08-30-agent-loop-audit.md),
[factory scaling contract](../../../../openspec/changes/twilight-control-plane/tasks.md).

- [ ] Pin representative independent-module and shared-contract tasks, acceptance,
      quality, cost and human-effort measures. Run comparable repetitions at 1, 2 and 4
      agents, and 8 where the admitted capacity supports that offering.
- [ ] Retain every failed/reworked/censored attempt, gate/review queue and operator
      minute; separate task parallelism from accepted integrated changes.
- [ ] Where justified, fix the measured dominant bottleneck within the package's bounded
      scope and repeat. If no improvement appears, retain the finding and cap supported
      concurrency; propose further optimization separately instead of claiming a speedup.

**Output/pass:** independently recomputable accepted throughput/cost/defect curves and
a supported concurrency decision. A rigorous no-gain finding can close the evaluation;
an explicitly promised speedup still needs evidence of that improvement. Omitting loser charges,
failed outcomes or shared-contract regressions fails acceptance. This present-day
delivery benchmark does not certify Twilight Task8.4: its actual worker/runtime/
multi-host prerequisites and full 1/2/4/8 matrix remain owned by that future change.

## Qualify client outcomes

### W22 — Launch a new application end to end

**Work:** client journey qualification. **Start from:** [scope](../../../../puni-assessment.md)
and W19's generated repo, with the named W01 client profile.

- [ ] Accept brief, ownership, inputs and cost target; generate/configure repository,
      environments, DNS/TLS, identity and state with the accepted reusable contracts.
- [ ] Deliver a real accepted business task through enforced checks and exact artifact
      promotion; observe normal operation, alert, routine change and isolated recovery.
- [ ] Hand over runbooks, account/control references, support calendar, costs and exit
      procedure; record elapsed/engineering/operator/wait time and bespoke adaptations.

**Output/pass:** client acceptance and second-operator usable handover, with required
health/security/recovery targets met. Wrong account, missing required input, failed
business smoke or unrecoverable state prevents completion. One model closes this
initial journey; W26 explicitly repeats the other model boundaries.

### W23 — Scale an existing application with measured benefit

**Work:** application diagnosis, bounded change and qualification. **Start from:**
[stateful constraints](../../../findings/puni-assessment-2026-10-21/infrastructure.md),
[backend topology](../../../../deploy/k8s/wbs/base/backend.yaml),
[release coordinator](../../../../tools/tool-deploy/src/k8s/execute.ts).

- [ ] Integrate a named existing client stack; pin representative requests/sessions/jobs,
      persistent dataset, baseline latency/errors/throughput/saturation and fully loaded cost.
- [ ] Identify bottlenecks and compare vertical scaling, algorithms/query/cache changes,
      stateless replicas and stateful architecture options. Choose the minimum intervention
      that meets the agreed target; account for database locks, storage and event/session semantics.
- [ ] Add/admit capacity and placement where required, change through W12, repeat the
      identical workload, then prove compatibility, scale-down and recovery with retained state.

**Output/pass:** agreed useful improvement within cost/availability limits; cross-client
contention and no-improvement/overload cases fail. Adding nodes alone never passes.
If the target needs database/storage migration, create its design/migration packet and
re-estimate (initial conditional reserve **15–35 engineer-days plus 3–6 operator-days**).
That branch remains required until solved or the user changes the target; never clone
SQLite writers as a shortcut. Proposed owner: `application-capacity-qualification`.

### W24 — Package a bounded OpenClaw client service

**Work:** runtime discovery, install/connect/effect contract and qualification.
**Start from:** [assistant boundary research](../../../twilight-structure/research/assistant-runtime-boundary.md),
[live metadata](../../../findings/puni-assessment-2026-10-21/live-evidence.md),
[operator runbook](../../../../HUMAN_README.md).

Consume W13's proved host/application telemetry slice for the actual deployment.
Standalone installation does not require completion of cluster telemetry or WBS auth.

- [ ] In a bounded two-day discovery, locate the real deployment owner, pin supported
      gateway/harness/plugins and resolve effective permission precedence and state layout.
- [ ] Define one channel, two named connectors and representative read plus approval-bound
      write tasks. Produce repeatable install/configure/validate/remove automation using the
      runtime's supported execution environment; do not assume Bun runtime compatibility.
- [ ] Separate client trust/state/credentials, constrain service/tool authority and
      bind approvals to exact effects/targets. Cover alternative harness routes, retrieved
      untrusted instructions and uncertain-effect retry/idempotency.

**Output/pass:** two clean installations, actual version/effective-policy evidence,
useful tasks and denied/wrong-client/stale-approval/revoked-connector cases. Interrupted
acknowledgment cannot duplicate an external fixture effect. If upstream cannot enforce
the required boundary, keep the criterion open and produce a priced isolation/adapter
branch. Proposed change: `openclaw-client-service`; no dependency on custom assistant UI
or the full Twilight control plane. WBS-specific connectors additionally consume W15.

### W25 — Operate, meter, recover and hand over the assistant

**Work:** lifecycle completion and separate client journey acceptance.
**Start from:** W24's state/effect contract, W10's assistant-state recovery slice,
W17's assistant attack/resource envelope and W14 accounting. Qualify those slices on
the chosen host/client substrate; they do not require unrelated k3s/WBS acceptance.
WBS connectors additionally require W15's applicable client-isolation proof.

- [ ] Register transcripts/configuration/queues/schedules/keys/provider transfers in
      W10/W16 coverage; implement redacted, client-scoped session/tool/effect telemetry.
- [ ] Enforce spend/concurrency/retry ceilings across all admitted provider/harness
      routes. Missing usage follows an explicit hold/reservation/refusal policy, never zero.
- [ ] Exercise provider/runtime outage, stuck/offline/cancel behavior, useful task
      continuity, previous-version upgrade, failed-upgrade recovery and clean-state restore.
- [ ] Transfer/export or delete under the client policy, stop schedules, revoke grants
      and PUNI access, verify independent operation and record backup expiry obligations.

**Output/pass:** client task acceptance plus measured response/cost/support baseline,
RTO/RPO and handover; no duplicate completed effects after restore/retry. Broken budget
reservation, foreign-client marker, missing key, corrupt state, wrong schema or retained
revoked grant fails. Run an initial five-business-day pilot, then W27's sustained window.
Application SQLite backup success is not assistant-state recovery evidence.

## Prove breadth, repeatability and sustained operation

### W26 — Qualify every delivery model and repeat independently

**Work:** integration/acceptance. **Start from:** [12-cell matrix](criteria.md#journey-and-delivery-model-acceptance).

- [ ] Populate all 12 cells with an actual journey in its named configuration, account,
      identity, storage, shared-dependency and operator boundary. Require AWS and Hetzner
      provider acceptance in the overall set without inventing a requirement for every provider
      in every cell; explicitly name which catalogue each cell qualifies.
- [ ] Reuse component evidence only where versions/inputs/trust/failure semantics match;
      run each distinct ownership/client boundary, failure, recovery and exit case.
- [ ] Have a second operator repeat onboarding and a routine change from the runbook;
      measure deviations/manual work and fix hidden credentials or tacit knowledge.

**Output/pass:** new-app, scaling and assistant receipts across shared, dedicated,
client-owned and hybrid models, with useful acceptance and independent handover.
Wrong client, lost shared service, missing evidence/owner or revoked PUNI access must
not produce a false completion. Unexecuted cells stay open; marking them unsupported
does not fulfil the original scope. A production-like client-controlled test estate
may qualify a technical cell, but real client sign-off remains required for that client.

### W27 — Observe service and audit criteria completion

**Work:** observation, measurement reconciliation and final acceptance.
**Start from:** [criteria coverage](criteria.md), W14 ledger and W26 matrix.

- [ ] Observe the agreed service window (proposed 30 days) and applicable billing,
      retention, key-overlap and renewal windows. A 31-day expiry or longer policy needs
      its own elapsed evidence even if the first service window has finished.
- [ ] Record routine maintenance/renewal/backup, alerts/incidents/recovery, client task
      health, delivery throughput/failures and actual recurring support/cost allocation.
- [ ] Audit every criterion against current contract, source/environment identity,
      positive/negative evidence and owner; fix gaps or leave readiness explicitly open.

**Output/pass:** complete criteria-to-evidence ledger, all model cells accepted, sustained
targets and budgets met with sample sizes/limits reported, and the next maintenance/
recovery/credential review dates owned. Failed targets feed new work; a completed calendar
window does not pass by itself. Configuration changes that invalidate a measure require
fresh applicable evidence; unchanged component windows may be reused with justification.
