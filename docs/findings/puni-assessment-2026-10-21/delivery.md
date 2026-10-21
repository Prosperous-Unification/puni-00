# Delivery, CI/CD and change quality assessment

Assessed 2026-10-21 against [the assessment scope](../../../puni-assessment.md), on
`pop-os`, checkout `4151532121633d978beb67ab52b3eb748285cd8e`. This is an assessment,
not a release acceptance. Source inspection, historical verification and fresh local
tests are distinguished below. Current GitHub and production observations are recorded separately
in [live evidence](live-evidence.md).

PUNI has substantial, tested delivery machinery for its own WBS application. It
does not yet have demonstrated repeatable delivery for an arbitrary client
repository. The immediate control gap is current: GitHub does not require checks
before merging to `main`. The largest operational evidence gap is the protected
k3s staging-to-production path, whose implementation is considerably ahead of its
recorded operational acceptance. The established Compose path remains operator
driven, with important recovery decisions requiring an attended intervention.
Fresh production inspection found an application-provenance gap. Follow-up inspection
established that the differing OCI revision belongs to the inherited Bun base image,
not another PUNI source revision. Current source and dev state cannot be treated as
production evidence.

## Observed production application-provenance gap

The read-only h2puni inspection in [live evidence](live-evidence.md) found
`lastDeployedSha=0afc77758131bc4257dcaa78f0b26bc97ffd92dc` for all three tiers,
with recorded backend/gateway/frontend colours `green`/`green`/`blue`. Docker
inspection of the running backend and gateway also found
`org.opencontainers.image.revision=0d9b296af33f2b851fcbf4df3e9ec89751734ba4`;
the frontend has no value for that revision label. Sanitized live Caddy routing
confirms those containers serve production. The inspected source/dev HEAD is
`4151532121633d978beb67ab52b3eb748285cd8e`.

Follow-up inspection selected the OCI source/title/version alongside revision:
backend/gateway identify `oven-sh/bun`, `bun`, `1.3.14-alpine`; frontend identifies
`caddyserver/caddy-docker`, `Caddy`, `v2.11.4`. All three lack `WBS_SHA`.
The differing hash is therefore base-image metadata, not evidence of conflicting
application commits. The application source-to-artifact-to-accepted-gate chain
remains unproven. The latest repository code, tests and dev identity do not settle it.
The public `/health` response returned SPA HTML, so it supplies no backend
release-identity proof. Direct `GET http://127.0.0.1:3100/health` inside
`be-01-green` returned HTTP 200 with `{status:ok}` and no commit; inside
`wbs-dev-src` it returned HTTP 200 with `{status:ok,commit:4151532121633d978beb67ab52b3eb748285cd8e}`.
These observations establish responding health endpoints and dev's reported
revision; they do not resolve production's source identity.

**P0, release operator and build engineer; investigation and verification.** Preserve
the current state, routed container IDs, immutable image identities, labels and
release/build records. Reconcile each tier to the accepted source and gate receipt
before relying on state files for another release decision. Completion requires a
retained, independently checked mapping from routed container to image digest,
source revision and successful gate, including a frontend identity. Correcting a
state-file string alone would not establish provenance. No production changes were
made by this assessment.

## Journey and ownership boundaries

| Journey                       | Delivery acceptance and required inputs                                                                                                                                                                                         | Applicable delivery models and present limit                                                                                                                                                                                                                                                                                                                                                                                     | Owner roles and effort evidence                                                                                                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Launch a new application      | A named repository and workload contract, accepted requirements, account/domain/credential owners, environment configuration, tested immutable release, successful deploy and client acceptance, recovery evidence and handover | Existing Nx/Bun workspace conventions and WBS delivery code are reusable implementation. WBS-specific image names, tiers, health/auth checks, migration protocol and deployment layout require adaptation. Shared PUNI, dedicated PUNI-operated and client-owned targets each need a separately verified configuration and trust boundary. A second independent client repository is not demonstrated by the reviewed artifacts. | Client product owner accepts behavior; delivery engineer owns repository/pipeline; release operator owns deployment and recovery; client/platform account owners grant access. No measured onboarding elapsed time or human-minute baseline was located in the reviewed delivery evidence. |
| Scale an existing application | Baseline workload, latency/error/cost targets, bottleneck evidence, compatibility envelope, tested capacity change, comparison under the same load and recovery verification                                                    | Current WBS release machinery preserves a single SQLite writer; backend k3s deployment is one `Recreate` replica. Adding compute does not make this application horizontally writable. An existing client stack needs a pipeline/runtime adapter and its own stateful release contract. Canary eligibility must be decided per workload.                                                                                         | Application architect owns the scaling intervention; performance engineer owns before/after measurement; platform/release operator owns rollout. Release safety tests do not establish a capacity gain or a delivery estimate.                                                             |
| Personal OpenClaw assistant   | Versioned installation/configuration, task acceptance, permission boundaries, connection ownership, safe upgrade/recovery and offboarding evidence                                                                              | The reviewed WBS CI/CD workflows do not establish an OpenClaw installation/update pipeline. Twilight's proposed assistant/runtime boundary and the local ACP harness are useful design/prototype assets, not a client assistant delivery receipt. Shared services plus a client-specific assistant require separate account and information boundaries.                                                                          | Assistant operator owns task validation and updates; client owns connected accounts and approval policy; platform operator owns hosting/recovery. End-to-end delivery time and manual effort remain unmeasured here; see the assistant assessment for its operational evidence.            |

Client-owned infrastructure also needs an explicit handover of pipeline credentials,
registry access, state, protected environments and recovery authority. A dedicated
deployment is not established merely by using another namespace or environment name.
Hybrid delivery inherits both the shared-service and client-specific failure boundaries.

## Commit to production: intent, implementation and evidence

| Capability and acceptance                                         | Prior intent and actual implementation                                                                                                                                                                                                                                                                                                                                                                   | Verification and reconciliation                                                                                                                                                                                                                                                                                                                                                                                                            | Gap, consequence and next action                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Merge only a validated composition                                | [CI](../../../.github/workflows/ci.yml) validates the PR synthetic merge's first parent, uses affected targets for PRs, and runs full scope on main/merge groups/dispatch. `gate` and `pixels` reduce their prerequisite jobs and reject unexpected skips/failures. The [PR boundary change](../../../openspec/changes/ci-pr-merge-base/verify.md) records real Git fault tests.                         | Fresh local tests passed the production reducer and PR resolver, including missing/corrupt objects and consumer failure propagation. Fresh GitHub reads report `protected:false`, protection HTTP 404, and only a release-tag ruleset. CI execution is real; mandatory pre-merge enforcement is absent.                                                                                                                                    | **P0, repository administrator; activation.** Configure required checks and a composition policy, with reviewed bypass ownership. Completion: API evidence plus a deliberately failing candidate demonstrably refused by the merge path. A workflow trigger alone does not enable a merge queue.                                                                                                                                                                   |
| Broad quality gate with meaningful failures                       | CI runs format, tests, lint, typecheck, build, secrets scan, migration lint, documentation checks, OpenSpec validation, solver smoke and browser shards. [Host gate steps](../../../bin/h2puni-gate-steps.sh) install frozen dependencies and refuse malformed/empty OpenSpec reports before full uncached checks.                                                                                       | Source and the [R5 incident catalogue](../checks-that-cannot-fail.md) show extensive production-path failure proofs. The focused run below establishes only four suites, not all checks on this head. At the root agent's 17:24 UTC observation, main CI run `39637806436` remained in progress.                                                                                                                                           | Preserve failed/cancelled/unknown verdicts separately. Completion of this assessment does not mean the repository gate passed. Repository maintainers should require a current terminal verdict before release.                                                                                                                                                                                                                                                    |
| Build the tested revision into identifiable artifacts             | [Publish wrapper](../../../bin/publish-release.sh) names HEAD and takes the heavy lock. [Dagger publisher](../../../tools/tool-dagger/src/main.ts) checks a clean tree, build inputs and capacity, builds `linux/amd64`, labels images `WBS_SHA`, and records immutable image refs in `release.json`. [Publish contract](../../../tools/tool-dagger/src/lib/publish.ts) refuses missing digests.         | Frozen Bun dependencies, hash-locked Python dependencies and pinned action commits are useful supply-chain controls. However, actual [backend](../../../apps/wbs/be-01/Dockerfile) and [frontend](../../../apps/wbs/fe-01/Dockerfile) Dockerfiles use tag-based Bun/Python/Caddy bases; only the shown BusyBox stage is digest pinned. No fresh image build or rebuild comparison was run.                                                 | **P1, build/release engineer; implementation plus proof.** Digest identity is not reproducibility or independent build provenance. Pin all material build inputs and retain source/config/build-tool identities. Completion: two clean builds with explained digest differences or reproducible output, plus a release receipt binding approved revision to each deployed digest.                                                                                  |
| Trace Compose deployment back to passed checks                    | [Compose orchestration](../../../tools/tool-deploy/src/deploy.ts) checks clean/stale release state, remote executor bundles, tier selection, configuration and migrations; the [runbook](../../runbook-prod-deploy.md) requires gating before publishing/deploying.                                                                                                                                      | Fresh [live evidence](live-evidence.md) shows recorded tier SHA `0afc7775…` without an independently proved application identity; the `0d9b296a…` OCI revision belongs to the Bun base image, and all tiers lack `WBS_SHA`. The inspected Compose path does not consume the CI gate receipt that the k3s descriptor does. Current implementation and dev identity do not establish what source is running in production.                   | **P0, release operator and build engineer; establish application provenance.** Reconcile routed containers, immutable image identities, source, gate and recorded deployment state. Then retain the complete release chain and prove the entrypoint refuses an unaccepted revision. See the application-provenance gap above.                                                                                                                                      |
| Promote exactly what staging proved                               | [k3s workflow](../../../.github/workflows/deploy-k3s.yml), [descriptor](../../../tools/tool-deploy/src/k8s/descriptor.ts) and [promotion](../../../tools/tool-deploy/src/k8s/promotion.ts) bind source, four tier digests, CI gate/pixels evidence and external admission identity; production requires the staged descriptor, identical digests and a bounded-age proof. Deployment is plan-by-default. | Fresh local tests passed rejection of wrong source, mutable/wrong images, failed/PR gate evidence, changed admission, missing/old staging proof and different promoted digests. These are local tests, not a protected GitHub environment or production run. [Delivery tasks](../../../openspec/changes/k3s-wbs-delivery/tasks.md) retain staging/production acceptance obligations.                                                       | **P0 for selling this path, platform release operator; activation and verification.** Configure and inspect protected environments, trusted activation, runner restrictions and target identities; then execute an authorized staging acceptance and attended production acceptance. Completion: immutable descriptor and end-to-end receipts, including failure handling, from the actual configured infrastructure.                                              |
| Deploy with a bounded blast radius and honest post-deploy verdict | Compose switches tiers through health checks and routing/WS handling. Backend deployment now uses a stop-writer/maintenance/migration/exposure barrier. k3s uses a durable release state machine, Lease, Flux coordination, write fence and singleton backend.                                                                                                                                           | [Compose orchestration](../../../tools/tool-deploy/src/deploy.ts) runs final smoke only after every selected tier has committed; smoke failure is loud and nonzero, but does not automatically revert. [k3s execution](../../../tools/tool-deploy/src/k8s/execute.ts) distinguishes rollback failures and recovery-required states. Neither reviewed path establishes percentage-based canary traffic or automated statistical acceptance. | **P1, application architect and release operator; contract/verification.** Document outage and compatibility budgets for each workload; prove all required smoke scenarios and operator escalation. Stateless tiers may admit a future canary strategy. SQLite single-writer changes need a different traffic/write policy; do not promise zero-downtime or canary rollout from blue/green naming alone.                                                           |
| Restore exactly the intended migration set                        | [ADR 0041](../../adr/0041-deployment-rollback-restores-a-captured-migration-set.md), paired `down.sql`, complete baseline name/hash capture, candidate capability checks and exact-set reversal protect against older newly introduced migrations and edited rollback scripts.                                                                                                                           | [Historical verification](../../../openspec/changes/restore-applied-migration-set/verify.md) records a 2026-10-11 disposable k3d rehearsal: 66 assertions, failed-health and SIGKILL/resume rollback, additive promote, blocked down left writes fenced, retained manual recovery command, and an injected production fault observed red. This is strong bounded rehearsal evidence, not a new production drill.                           | **P1, migration owner and release operator; documentation reconciliation then proof.** [AGENTS](../../../AGENTS.md) broadly says abort reverses migrations; current [backend recovery runbook](../../runbook-prod-deploy.md#backend-writer-barrier-recovery) deliberately requires attended decisions after migration/exposure uncertainty. Reconcile the phase-specific contract and prove recovery from the client's actual state without discarding new writes. |

The k3s runbook's “What is and is not proven” paragraph lags its own newer task
ledger: [the tasks](../../../openspec/changes/k3s-wbs-delivery/tasks.md) record a real
pod solve at `93960ee0` and Flux suspend/resume against a live Git source. They
still leave the release-path solve with retained PVC, real Hetzner CSI/RWOP
decision, staging OIDC smoke, first-start acceptance and staging/production
acceptance open. Intermediate successes should be preserved without upgrading
them to full release-path readiness.

## Trust, isolation, interrupted work and reuse

- **CI runner trust:** `ci` and [infra-check](../../../.github/workflows/infra-check.yml)
  run candidate code on GitHub-hosted runners with read-only contents permission.
  Actions are commit pinned. The protected k3s deploy job instead checks out trusted
  `github.sha` on `main`, installs with `--ignore-scripts`, and uses a persistent
  state directory. [Runner restrictions and job-start hook](../../infra/deployment.md#cicd)
  are explicitly required outside Git. Their presence cannot be inferred from YAML.
  A persistent runner remains a trust boundary requiring operator-owned host,
  credentials, state backups, cleanup and access revocation.
- **Concurrency:** `ci` preserves main verdicts using SHA and run ID, while
  superseded PRs cancel. Historical cancellation experiments are recorded beside
  the workflow. `infra-check` still uses ref-only concurrency and
  `cancel-in-progress: true` for main as well as PRs: a newer main push can cancel
  the previous infrastructure verdict. This is a configuration observation, not a
  newly observed cancellation incident. `deploy-k3s` serializes by environment
  with cancellation disabled; GitHub concurrency is not a durable FIFO request
  ledger. The deployment's own journal/Lease is necessary for interrupted work.
- **Shared host:** [heavy-lock implementation](../../../bin/heavy-lock-lib.sh)
  has FIFO tickets, deadline and ownership checks; [historical lock proofs](../../../openspec/changes/fifo-heavy-lock/verify.md)
  exercise queue and signal faults. Dagger's source caps its privileged engine at
  8 GiB/6 CPUs and checks available capacity before work. Locks and capacity checks
  reduce contention but do not establish tenant isolation. Build and production
  share h2puni according to the deployment runbook; failure/load correlation is a
  client service-boundary decision.
- **Partial publication and failed pipelines:** Dagger publishes tiers sequentially
  and writes the release record after the callback completes; a failure can leave
  already-pushed images without a completed new release record. Source labels and
  digest refs support investigation, but registry retention, garbage collection,
  orphan-image accounting and recovery time were not operationally verified here.
  k3s explicitly retains journals and recovery-required states; Compose retains
  backend interruption markers and names attended recovery. No interrupt or restore
  drill was performed during this assessment.
- **Pipeline reuse:** reviewed workflow files expose no `workflow_call` interface.
  [Client repository design](../../twilight-structure/client-repositories.md)
  explicitly proposes the versioned starter, `.twilight/repository.yaml`, upgrade
  metadata, policy binding and per-client planning/credential scope. This is
  design intent, not an onboarding receipt. Website projects provide another
  product in this workspace, but do not demonstrate another client repository,
  independent pipeline administration or a template upgrade.

**Next actions:** repository administrator owns preserving infrastructure verdicts
and proving runner/environment restrictions (**P1, configuration and verification**).
Platform operator owns retained deploy-state/registry recovery evidence (**P1,
operational proof**). Delivery-platform engineer owns one bounded client starter
pilot (**P1, implementation and adoption proof**): onboard a separate repository,
make its failing check block delivery, deploy an accepted revision, recover it,
then upgrade the starter without copying client content or credentials. Measure
elapsed time and operator touches at each transition.

## Modularity, artifacts and parallel-agent delivery

The codebase has meaningful modular boundaries. [Root ESLint policy](../../../eslint.config.js)
generates product constraints and enforces domain/application/adapter rings and
runtime restrictions. [WBS policy](../../../apps/wbs/eslint.product.mjs) adds
application-specific fences, including keeping Drizzle in the SQLite adapter.
The extracted core, SQLite/memory adapters and conformance projects are concrete
assets, as recorded in [the refactoring ledger](../../refactoring/tasks.md).
The [website portability fixture](../../../libs/website/adapters/portability-fixture/index.ts)
is actual cross-product consumption of a shared package, but only a small fixture;
it is not broad plug-and-play reuse evidence.

The newer organizational policy is less mature than those lint boundaries:
[all 14 policy entries](../../code-organization/rule-policy.json) are `observe`.
That does not mean all architectural rules are advisory: existing ESLint/module
checks still enforce their own constraints. It does mean the new inventory,
scenario, performance and service-kind observations must not be reported as
blocking acceptance. The [test-axes ledger](../../../openspec/changes/test-axes/tasks.md)
still carries open rollout and acceptance work.

Planning and verification artifacts are unusually explicit about fault injection,
source SHA, discarded false greens, local versus hosted checks and pending operator
work. [PR boundary verification](../../../openspec/changes/ci-pr-merge-base/verify.md)
and [exact-set migration verification](../../../openspec/changes/restore-applied-migration-set/verify.md)
are good examples. This improves auditability. It does not eliminate retrieval
and reconciliation cost: fresh `wc -l` reports 5,742 lines for
`test-axes/verify.md`, 682 for the production runbook and 1,160 for CI YAML.
The test-axes log contains both superseded pending claims and later bounded
acceptance receipts; reading one “pending” or “passed” row in isolation is unsafe.
The [platform map reconciliation list](../../platform-map.md#9-reconciliation-list)
also identifies stale findings and unarchived changes. Its aggregate counts were
not independently recomputed in this delivery assessment.

Parallel work is supported by actual worktree/port/lock conventions and by new
runtime authority and observation code. [Lane contracts](../../lanes-are-claire-v1.md)
put Claire's dispatch/health scripts outside this repository. The
[agent-loop audit](../../2026-08-30-agent-loop-audit.md) records real composition
failures, wrong-tree gates, contention and invented evidence, including repairs.
The [ACP harness](../../../tools/harness-example/src/harness.ts) fans out implementers
and resumes sessions; its acceptance is file headers/session replay, not accepted
software deliveries. [Dash](../../../apps/twilight-structure/twilight-dash/cli/README.md)
explicitly distinguishes progress assertions from authenticated completion and
records outstanding host/CI acceptance. None of these observations establishes a
causal throughput gain from adding agents.

Historical CI timing evidence is useful but bounded. [Gate-duration findings](../ci-gate-duration.md)
record a full-gate reduction from 62m57s to 29m48s after the September shard split.
They also record a Burokrat task taking 49m25s on 2026-10-20 and failing assertions,
followed by a 75-minute allowance. These are different revisions and samples;
they do not establish today's percentile, a customer lead time or a linear scaling
benefit. The [unit-economics research](../../twilight-structure/research/unit-economics/README.md)
explicitly describes per-outcome costs and human minutes as estimates, not measured
factory economics. No current prices or promised margins are inferred here.

**P1, delivery operations lead; measurement:** define accepted outcome as a
requirement-linked, reviewed, integrated change accepted in its intended running
environment. Collect request acceptance, first work, review-ready, merge, gate
queue/start/end, deploy and client acceptance timestamps, plus failed attempts,
rework and hands-on operator minutes. Correlate client/repository/change/source
SHA/run/descriptor identities. Compare matched work at one, two and more agents,
including gate wait, defect/recovery cost and human effort. Completion evidence
is accepted outcomes per elapsed hour and per operator hour with failure/rework
rates, workload mix and sample sizes. Commit count, active sessions and submitted
PRs are not substitutes.

**P2, architecture and knowledge owners; reconciliation:** choose one bounded
module/rule pilot and demonstrate the intended enforcement failure before
advancing observe to ratchet/enforce. Add concise current acceptance indexes that
link immutable historical receipts, reconcile the migration recovery contract,
and sync/archive completed specs after checking their actual acceptance. Completion
means a reviewer can identify the current contract, implementation revision and
remaining proof without interpreting a long chronological log.

## Fresh checks and limitations

Fresh commands on 2026-10-21:

| Command or inspection                                                                                                                                                                                                                                                   | Observed outcome                                               | What it establishes                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `git rev-parse HEAD`; `hostname`; `bun --version`                                                                                                                                                                                                                       | `4151532121633d978beb67ab52b3eb748285cd8e`; `pop-os`; `1.4.2`  | Local source and runtime identity                                                                        |
| `bun test --preload ./tools/test/scratch/preload.ts --timeout=10000 tools/tool-git-hooks/src/hooks/gate-workflow.test.ts tools/tool-git-hooks/src/hooks/pr-merge-base.test.ts tools/tool-deploy/src/k8s/descriptor.test.ts tools/tool-deploy/src/k8s/promotion.test.ts` | Exit 0; 71 pass, 0 fail; 180 assertions; 4 files; 2.58 seconds | Production shell gate/PR resolver behavior and local descriptor/promotion acceptance and rejection paths |
| `rg`/`sed`/`cat` reads of the linked workflows, gate/build/deploy source, policies, runbooks and change artifacts                                                                                                                                                       | Source inspected at the above checkout                         | Implementation and recorded intent, not operational success                                              |
| `rg -n 'workflow_call\|workflow_dispatch\|^name:' .github/workflows`                                                                                                                                                                                                    | Dispatch workflows found; no `workflow_call` match             | Reusable-workflow interface not present in this inspected workflow directory                             |
| `wc -l openspec/changes/test-axes/verify.md docs/runbook-prod-deploy.md .github/workflows/ci.yml`                                                                                                                                                                       | 5,742; 682; 1,160 lines                                        | Artifact size only, not a quality score                                                                  |

No production mutations, deploys, image publications, recovery drills, credential
changes, branch-policy changes or infrastructure activation were performed.
Full Nx, h2puni host gates, browser suites, Docker/k3d rehearsals, all migration
tests, supply-chain scans and build reproducibility experiments were deliberately
not run: this was a bounded assessment and those checks are heavy or operational.
Existing mutation proofs were inspected but not re-injected. There is no claim
that every check remains breakable on this revision. External Claire tooling,
client repository adoption, deploy-runner host restrictions, registry retention,
human effort and longitudinal delivery metrics remain unverified here unless
separately established in the linked live evidence or sibling assessments.
