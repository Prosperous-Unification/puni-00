# Platform map

A snapshot of everything puni-00 does, taken 2026-10-21 at `main` 69a8b38f4 by reading the
repository, as the starting point for reconciling the platform's workflows and capabilities.
Every row carries a state: **built** (code and tests on `main`), **partial** (an open OpenSpec
change with unticked slices), **proposed** (design only), **stale** (a document the code has
outgrown). Paths are repository-relative. The reconciliation list at the end is the work this map
exists for; address items by number.

Orientation stays in [LLM_README.md](../LLM_README.md); terms stay in the context glossaries
listed in [CONTEXT-MAP.md](../CONTEXT-MAP.md). This file is a map, not a spec.

## 1. Products and surfaces

| Surface                                              | What it is                                                                                                                       | State                                                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **WBS** (`apps/wbs/*`)                               | The planning product: a collaborative work-breakdown editor with estimates, scheduling, claims, organizations, an API and an MCP | built, live at wbs.bulletpoints.club (prod) and dev                                                 |
| **PUNI website** (`apps/website/*`)                  | The funnel: a visitor's request becomes a brief and a proposal, by a manual form or an AI scoping chat                           | built; M1 and M2 released, paid inference gated, M3 proposed                                        |
| **Twilight Structure** (`apps/twilight-structure/*`) | The software factory's tool suite: Navigator plans, Dash executes, Burokrat judges                                               | Burokrat built and published; Dash and Navigator built, run from source; the control plane proposed |
| **Design system** (`libs/shared/adapters/ui-*`)      | One token vocabulary (`@ui/core-01`) and numbered kits (`@ui/saas-01`) with Storybook, a shadcn registry and Claude Design sync  | built; only the SaaS kit exists; the sync run is open                                               |
| **Personal assistant** (`docs/assistant`)            | Secretary and workers the person talks to                                                                                        | proposed; glossary and a throwaway prototype only                                                   |

Context glossaries: [WBS](../CONTEXT.md), [Twilight](twilight-structure/CONTEXT.md),
[website](website/CONTEXT.md), [design system](../libs/shared/adapters/ui-core-01/CONTEXT.md),
[assistant](assistant/CONTEXT.md).

## 2. WBS capabilities

Four processes, one database writer. Routes are declared once as shapes in
`libs/wbs/domain/contracts/src/http/*-shapes.ts`; the OpenAPI document, the MCP tools and the
route-binding test all derive from them. The OpenAPI document is an internal contract between be-01 and
mcp-01, not an agent surface: machines call `/mcp`, and `/api` refuses their credentials
(`openspec/changes/wbs-mcp-agent-surface` M9, M12).

| Process  | Role                                                          | Port      | Ships as                        |
| -------- | ------------------------------------------------------------- | --------- | ------------------------------- |
| `be-01`  | Elysia + Drizzle + bun:sqlite API, the only writer            | 3100      | image (+ OR-Tools solver stage) |
| `gw-01`  | WebSocket fan-out, resume, presence; owns no data             | 3200      | image                           |
| `fe-01`  | Vite + React single-page app behind Caddy                     | 4200 / 80 | image                           |
| `mcp-01` | Streamable HTTP MCP over be-01, 84 tools derived from OpenAPI | 3300      | image                           |

### Planning model (built unless marked)

| Capability                                                                                                                                                | Where                                                                                                      | State                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Projects, work items, subtrees, steps, step codes and references                                                                                          | `libs/wbs/domain/domain`, `libs/wbs/application/core/src/module/{project,step,work-item}`                  | built                                                            |
| Three-point estimates, PERT weights, allowances, units                                                                                                    | `libs/wbs/domain/domain/src/estimate.ts`; change `estimate-units`                                          | built                                                            |
| Roll-ups computed on read, never stored                                                                                                                   | `roll-up.ts`, `project-roll-up.ts`; space roll-ups at `/spaces/{id}/roll-ups`                              | built                                                            |
| Derived numbers with freeze and unfreeze                                                                                                                  | `derive-numbers.ts`; commands `freeze*`/`unfreeze*`                                                        | built                                                            |
| Scheduling: Fast engine (deterministic) and Optimized engine (solver result), PRI or Time objective, cache by input hash, generation and contract version | `schedule.ts`, `libs/wbs/adapters/solver-py` (lexicographic CP), supervisor protocol v1 over a unix socket | partial: `dual-optimized-scheduler` 111/131                      |
| Capacity per team and project, shared capacity and person load across projects                                                                            | `module/capacity`, `service/person-load.feature.ts`; [capacity.md](capacity.md)                            | built                                                            |
| Claims, delegated claims, startable work, machine credentials pinned to one agent person                                                                  | `claim.ts`, `store-sqlite/src/{claim,machine-credential}.ts`                                               | partial: `wbs-team-claims` 16/21 (holder display, fleet rollout) |
| Resources: exclusive and divisible, demands, occupancy, levelled by both engines                                                                          | `resource.ts`, `occupancy.ts`, `store-sqlite/src/resource.ts`                                              | partial: `wbs-resources` 15/18, design R1–R8 awaiting Dany       |
| Priority bands and ladder, project rank, typed SS/FF dependencies, step blockage, attempts, calendar markers                                              | domain files of the same names; commands in `contracts/src/commands/definitions.ts`                        | built                                                            |
| Command batches: 53 kinds, one transaction, one journal entry                                                                                             | `runCommandBatch`; spec `openspec/specs/plan-command-registry`                                             | built                                                            |
| Undo/redo that refuses stale state out loud                                                                                                               | `service/compensating`; routes `/undo`, `/redo`                                                            | built                                                            |
| Plan history and events, event log, bounded replay sweep                                                                                                  | modules `plan-history`, `plan-event`, `event-log`, `realtime/replay-*`                                     | built                                                            |
| Saved plans with compare, never exported                                                                                                                  | `module/saved-plans`; 6 MCP tools                                                                          | built (3 slices open)                                            |
| Export (Markdown, CSV, plan JSON) and all-or-nothing import, "import with AI"                                                                             | `module/{plan-document,plan-import}`; [import-with-ai.md](import-with-ai.md)                               | built (final gates open)                                         |
| Spaces: group projects, in-progress view, space Gantt                                                                                                     | `service/space.resource.ts`                                                                                | built                                                            |
| Directory: teams, people, agents, tags, services, work-item types, resources, timezones, external systems                                                 | `module/directory`; `/api/directory/commands`                                                              | built                                                            |

### Accounts and organizations

| Capability                                                                                                               | State                                              |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| OIDC (Auth0, Okta) or local auth; browser sessions; social sign-in                                                       | built; real Okta and Google wiring owed            |
| Organizations: members, roles, invitations, join requests, verified domains with DNS proof, project rank, session policy | partial: `organization-ownership-and-access` 34/56 |
| Enterprise SSO connections, SCIM v2 users and groups, provisioning tokens                                                | built (ADR 0049)                                   |
| Onboarding: email challenges, invitation accept, organization creation                                                   | built; SMTP delivery configured per host           |
| Shared people across projects with restore approvals                                                                     | built                                              |
| MCP delegation: single-use `wbs-be-01/via-mcp-01` delegations per tool call                                              | built; refresh policy `mcp-refresh-policy` 5/12    |
| Operator CLIs: migrate/down/status, backup and restore, organization activation and preflight, per-feature rollback      | built; runbooks `runbook-organization-*.md`        |

### Frontend

Screens: project page, directory, organization, spaces, person load, onboarding. Features: the
editable grid with keyboard bindings and drag-and-drop, Gantt with typed dependency arrows and
attempts, plan cards and step board, estimating panel with drafts, dependency picker, graph and
Mermaid output, priorities, saved plans compare, export and import, optimization cue, step
blockage, external references, calendar-marker rules, presence, the organization panels. Test
tiers: unit and view (Vitest, twice, in UTC and Auckland), browser ordinary and packaged,
performance, Playwright e2e in four CI shards. About 75 `ui-review-*` and table changes are built
and waiting only on a "Dany looks" check.

## 3. Website capabilities

| Capability                                                                                        | Where                                                                 | State                                                     |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| Manual request and receipt; drafts with discard                                                   | `apps/website/be-01/src/server.ts` (`/entry`, `/intakes`, `/draft`)   | built, released (M1)                                      |
| AI scoping chat over OpenRouter with a proposal card after the third reply and an eighth-turn cap | `/conversation/*`, `libs/website/domain/contracts`                    | built (M2); provider disabled until activation gates pass |
| Proof-of-work browser check, fallback to the manual path                                          | `browser-check.ts` (ADR 0040)                                         | built                                                     |
| Abuse guardrails with pause, operator inbox, 30-day funnel view                                   | `/operator/*`, `src/guardrail-alerts.ts`                              | built; guardrail UI open                                  |
| Retention: drafts, requests, S3 retention journal, erasure                                        | `libs/website/adapters/store-sqlite`, retention CLIs (ADR 0038, 0047) | built                                                     |
| Concept preview                                                                                   | `docs/website/README.md` M3                                           | proposed                                                  |
| Deployment through the private companion `puni-pr-00`                                             | ADR 0036; `bun run private:checkout`                                  | built                                                     |

## 4. Twilight Structure capabilities

Placement rule from [names.md](twilight-structure/names.md): answerable from a Git revision with
no side effects, Burokrat; takes time or changes something, Dash; needs a person, Navigator. The
tools exchange records, not calls: plan reference, progress receipt, candidate, environment
observation, report.

| Tool                   | Capabilities                                                                                                                                                                                                                                                                                                                                                                                                                                         | State                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Burokrat** (`twib`)  | Static judge, no clock or network. Rules: MOD-INDEX, MOD-DIRECT-ENTRIES, MOD-LAYOUT, REL-EXTRACT, K2–K6 kind directions, F1 plain TypeScript, F7 size ratchet, INV-CLASSIFY, SPEC-SCENARIOS, PERF-THRESHOLD, JOB-CATALOGUE. Candidate reading, classification, identity, content manifest, relationship extraction, index checks, activation preparation, exhaustive census, test-evidence diagnostics (`certifies:false`), admission judge for Dash | built; npm `twilight-burokrat@0.1.0`; all 15 rules in observe mode                      |
| **Dash** (`twid`)      | Runtime lease authority (bootstrap, inspect, recover, submit-admission), observation store and systemd units, `run-activation-checks` CheckRun ledger, enrollment planning via the fleet tool, progress receipts v1 and v2, a GitHub-polling observation service and review invoker; CLI on Optique (generated `--help`, `completion`)                                                                                                               | built, from source; host gate and CI acceptance outstanding                             |
| **Navigator** (`twin`) | `plan-reference` from a WBS export (v7–v10), `receipt-to-commands`, `admit-progress` against an accepted reference; sends nothing to WBS                                                                                                                                                                                                                                                                                                             | built, from source                                                                      |
| **Control plane**      | LangGraph and ACP workers, staging and branch devs, Backlog.md as the per-repository planning store, client repository template with `.twilight/repository.yaml`, the sixteen-stage SDLC (`openspec/schemas/twilight-v1`)                                                                                                                                                                                                                            | proposed: `twilight-control-plane` 0/51; SDLC exercised only by the documentation trial |
| **Harness prototype**  | `tools/harness-example`: one ACP session per task, two turns, `--fake` agent; worker bundle drilled on k3d via `tool-fleet:synthetic`                                                                                                                                                                                                                                                                                                                | built, local only                                                                       |

## 5. Workflows: from idea to running software

### 5.1 Plan

- **Source of truth:** the dev WBS project "PUNI platform plan". Prod holds no plan data.
- **Batches:** leaf items with no unfinished predecessor become packets under
  `docs/superpowers/plans/2026-09-*-batch-*/`, each with waves, file ownership, assumptions and
  results, written so a medium-tier model can execute one alone.
- **Lanes:** one worker session per worktree ([lanes-are-claire-v1.md](lanes-are-claire-v1.md)),
  sharing one gate tree on h2puni under the heavy lock. Contracts: gate the exact SHA under the
  lock, never commit in another lane's tree, own your ports.
- **Wayfinding:** `.agents/skills/wayfinder` plans multi-session work as decision tickets.

### 5.2 Change

The rules are [AGENTS.md](../AGENTS.md) R1–R5. The artifacts are OpenSpec (`openspec/config.yaml`,
default schema `sdd-lean`): intent of at most 400 words, one design interview that resolves terms
into `CONTEXT.md`, delta specs, `design.md` when the shape is non-trivial, `tasks.md` as ordered
TDD slices, `verify.md` with commands, outputs and the fault-injection table. Every new check has
a negative watched failing and a `Proof:` comment. Skills: `.agents/skills/openspec-*` and the
`/opsx:*` commands, regenerated by `tools/tool-workflows`.

### 5.3 Design a screen

[runbook-screen-design.md](runbook-screen-design.md): brief, explore on Claude Design from the
kit's synced cards, settle in sentences, add missing shapes to the kit, screen story in Storybook
as the design of record, build, review by eye in both palettes. A new look is a new kit.

### 5.4 Verify locally

| Tier                | Command or target                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fast unit           | `bun run test:unit` (be-01 and every lib, about 17 s)                                                                                                |
| Store               | `wbs-be-01:test:store` (`*.db.test.ts` against SQLite), store-sqlite `test:api`, `test:conformance`                                                  |
| Levels with JUnit   | `test:{unit,view,performance,browser:*,architecture}:level` into `tmp/junit`; checked by `tool-devsync:test-levels:verify`                           |
| Browser             | `wbs-fe-01:e2e`, `e2e-organization`, `e2e-packaged` (Playwright)                                                                                     |
| Lint, format, types | `lint` (the gate) and `lint:fast`; `nx format:check --all`; `typecheck` (TS 7 native)                                                                |
| Build               | `build` (needs `shellcheck`)                                                                                                                         |
| Specs               | `openspec validate --all --json`                                                                                                                     |
| Hooks               | lefthook pre-commit: eslint, prettier, plaintext secrets, private nesting, migration lint, doc caps, tool-wiki lint; the `Agent-Authored-By` trailer |

Budgets: every `bun test` target passes `--timeout` on a 10/30/60 s ladder
([test-budgets.md](test-budgets.md)). Root `bun test` is not the gate.

### 5.5 Gate and merge

- **h2puni gate:** `bin/h2puni-gate.sh <sha>` from an isolated clone, under the host-wide
  `flock` heavy lock (`bin/heavy-lock-lib.sh`, queue tickets, 30 min default wait). Under the
  lock: checkout, tool-wiki verifier, frozen install, OpenSpec validate, format, Nx test lint
  typecheck build for the workspace, the Twilight projects separately, solver image smoke. Trust
  the printed `h2puni gate: running on <sha>`. Exit codes 64–78 and 127 each name a refusal.
- **CI** (`.github/workflows/ci.yml`): PRs run `nx affected` from the validated synthetic merge
  parent; push, merge_group and dispatch run the full gate; an unmapped event is refused. Jobs:
  `gate_workspace` (plus secrets scan, migration lint, doc caps), `gate_twilight`, the `gate`
  reducer, `pixels` shards 1–4. About an hour. `infra-check.yml` on infra paths;
  `twilight-burokrat-release.yml` on `twilight-burokrat-v*` tags; `trusted-wiki.yml` paused.
- **Merge:** merge commits to `main`. GitHub has no branch protection on `main`
  ([ci-gate-duration.md](findings/ci-gate-duration.md)); the h2puni exact-head gate is the final
  proof by convention.
- **Review:** adversarial, on the exact head, by a second model (Astra, Fable, Codex, Gemini);
  `HUMAN_README.md` gives the second-opinion commands.

### 5.6 Deploy dev

Cron on h2puni runs the poller every minute, follows `origin/main`, resets the bind-mounted
checkout of the single `wbs-dev-src` container and records a commit as deployed only after
`/health` proves it. App source reloads under watchers; `RESTART_PATHS` (lockfile, manifests, Nx
config, migrations) restart the container; `deploy/dev-src` changes fail the deploy and name the
fix. A solver change publishes a digest-pinned image through Dagger and reinstalls the supervisor
first. `bin/dev-deploy.sh` is the manual nudge. [runbook-dev-deploy.md](runbook-dev-deploy.md).

### 5.7 Deploy prod

On h2puni from `/home/puni1/wbs-build`: gate, `bin/publish-release.sh` (Dagger v0.21.9, amd64
images to the self-hosted registry, `release.json`), remote scripts install, then
`tool-deploy:deploy --all --execute`. Dry run is the default and refuses a dirty tree, a stale
release, an unbuilt executor bundle, incomplete env files or local auth. The swap starts the idle
colour, health-gates it, repoints Caddy, drains WebSockets, stops the old colour, runs smoke.
Backend: all writers stopped and proven stopped, `VACUUM INTO` backup, the applied-migration set
captured before migrate, step-code backfill before exposure; recovery after exposure is attended.
[runbook-prod-deploy.md](runbook-prod-deploy.md). Never build on h1claw.

### 5.8 Govern

- **Rule policy:** `docs/code-organization/rule-policy.json` (15 rules, observe mode) and
  `kinds.json` (33 temporary kind entries until files carry `.feature/.resource/.repository.ts`).
- **Wiki policy:** `docs/wiki-policy/policy.json` (35 pilot boundaries with pinned baselines,
  binary declarations), `modules.json` (35 module identities with index headers in READMEs),
  `relationships.json` (15 selected facts such as pinned Nx target configurations), and their
  bootstrap counterparts. These are what fail first when a library is added; see the new-kit
  checklist in the screen-design runbook.
- **Authority split:** Dash owns the lease authority and runs activation checks; Burokrat judges
  the receipts (ADRs 0048, 0050–0052; [runbook-tool-wiki-activation.md](runbook-tool-wiki-activation.md)).
- **Code organization:** four kinds in one direction (Delivery, Feature service, Resource
  service, Repository) over pure domain; tests on three axes (level by suffix, module by
  location, scenario by `[ID]`); rollout modes observe, ratchet, enforce. Built: the rule model,
  kind rules and inventory; partial: `test-axes` 74/92; proposed: ratchet and enforce, the
  coverage ledgers.

### 5.9 Operate

Runbooks: dev deploy, prod deploy, heavy-lock owner, organization DNS, activation, ownership
preflight, email delivery, public email policy, Dagger registry DNS, tool-wiki activation,
screen design. Triage in [HUMAN_README.md](../HUMAN_README.md). Findings in
[docs/findings](findings/README.md). Observability: pino logs on one schema, Prometheus
`/metrics`, OTel counters; alerts `close-observability-alert-gaps` done.

## 6. Platform and hosts

| Host    | Role                                                                                                                    | State              |
| ------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------ |
| h1claw  | OpenClaw gateway, operator credentials, SQLite backup puller to Hetzner. Never builds.                                  | live               |
| h2puni  | Prod blue/green Compose, dev container, registry, Caddy edge, gate and build box, Ansible controller. Kept outside k3s. | live               |
| h3mon   | Victoria stack, Grafana, MLflow; k3s observability agent                                                                | live               |
| h4claw  | k3s server (embedded etcd), `product` and `ingress` labels; OpenHands                                                   | live               |
| workers | k3s cluster for agent workloads                                                                                         | proposed, no hosts |

Planned platform ([2026-09-15-infra-evolution-plan.md](plans/2026-09-15-infra-evolution-plan.md),
changes `k3s-platform` 28/42, `k3s-fleet` 10/14, `k3s-wbs-delivery` 31/43): Flux stages target,
controllers, storage, policy and secrets are Ready; the platform stage is stalled on a Pending
registry pod and six absent secrets; `deploy-k3s.yml` and the Compose-to-k3s cutover
([cutover-plan.md](infra/cutover-plan.md)) are prepared and never run; Hetzner Terragrunt never
run live; fleet operations (enroll, retire, replace, upgrade, recover, drills) proven on k3d and
QEMU only; OTLP mTLS canary checked in, activation proofs pending. Secrets: SOPS with age per
cluster, directories empty; Compose prod uses host env files. Private companions `puni-fleet`
(Flux app repo) and `puni-pr-00` (website) as nested ignored clones (ADR 0036).

## 7. Shared libraries

| Alias                        | Offers                                                                     | Consumers                         |
| ---------------------------- | -------------------------------------------------------------------------- | --------------------------------- |
| `@shared/validation`         | `parseOrThrow`, `parseSecretsOrThrow` over ArkType                         | every product and tool            |
| `@shared/failures`           | one failure-reporting policy that never throws, secret-safe                | the WBS processes and adapters    |
| `@shared/test-evidence`      | decoders for Bun JUnit and Playwright reports (diagnostic, not certifying) | Burokrat, dev-sync                |
| `@shared/test-levels`        | the ten-row test-level table                                               | Burokrat, dev-sync                |
| `@shared/portability-format` | a fixture proving a portable cross-product dependency                      | website fixture                   |
| `@ui/core-01`, `@ui/saas-01` | the design system                                                          | WBS fe-01                         |
| `@wbs/validation`            | re-export shim of `@shared/validation` plus bun:sqlite fixtures            | legacy                            |
| `@wbs/realtime`              | reconnecting WebSocket scaffold                                            | nothing; fe-01 has its own client |

## 8. Where knowledge lives

| Kind                       | Place                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| Orientation, gate, routing | `LLM_README.md` (≤150 lines), `HUMAN_README.md`                                                        |
| Rules                      | `AGENTS.md`                                                                                            |
| Terms                      | the five `CONTEXT.md` files, `CONTEXT-MAP.md`                                                          |
| Behaviour                  | `openspec/specs` (18 capabilities) plus deltas in 246 active changes; 144 archived                     |
| Decisions                  | `docs/adr` (56): planning model, architecture, deploy and infra, governance, auth, website             |
| Findings                   | `docs/findings`                                                                                        |
| Runbooks                   | `docs/runbook-*.md`, `docs/infra`                                                                      |
| Plans and designs          | `docs/plans`, `docs/superpowers/{plans,specs}`, `docs/refactoring/tasks.md`, `docs/twilight-structure` |
| Evidence                   | each change's `verify.md`, `docs/experiment-evidence`, `docs/twilight-structure/evidence`              |
| Scratch                    | `notes/`, `experiments/`, `docs/state`                                                                 |

## 9. Reconciliation list

Observed while mapping; verify each before acting. Numbered so they can be addressed by id.

1. **110 fully ticked changes are unarchived** and 100 more wait on one operator step, so the
   main specs lag behaviour. Archiving stopped on 2026-09-29. A bulk archive and spec sync is the
   largest single fix.
2. **`docs/findings/current.md` says rollback is unimplemented**; ADR 0041,
   `restore-applied-migration-set` and the TASK-568 rollback evidence say it works.
3. **`AGENTS.md` describes migration reversal on abort** through the capture file; the prod
   runbook now says recovery after exposure is attended. One of them is the contract.
4. **Two 2026-09-19 design headers say "nothing here is implemented"**
   (`twilight-burokrat-rules-design.md`, and the code-organization design's status) while the rule
   model, kind rules and inventory are built.
   _dash-host-jobs:_ the rule model now also carries `JOB-CATALOGUE` (built, observe mode, slice
   1); the two headers are still unreconciled.
5. **`HUMAN_README.md` sends readers to `LLM_README.md` for open findings**; they live in
   `docs/findings`. The R5 incident count differs across `config.yaml`, `HUMAN_README.md` and
   `current.md`.
6. **`scaffold-tech-setup` (52/58) is still an active change** for a foundation that landed long
   ago.
7. **No branch protection on `main`**; merges rely on convention and the host gate.
8. **Infra plan is "draft v2, nothing implemented"** while its k3s changes are a third to two
   thirds built; the hosts' sizes in it are stale.
   _dash-host-jobs:_ dated host facts (h2puni 8 cores, 15.6 GiB, 2026-11-01) live in its design;
   the job catalogue is built (slice 1), the host pool on h2puni and h4claw is proposed.
9. **Compose-era tooling that targets the old `/srv/wbs` host** is still present and partly
   stale: `tool-smoke:smoke` mounts, `tool-secrets` placeholder CLIs, `tool-bootstrap`,
   `tool-compose:render`, `tool-observability-stack` beside h3mon's Victoria stack.
10. **Scaffolds nobody imports:** `@wbs/realtime`; the `@wbs/validation` shim; untracked leftover
    directories `apps/{be-01,fe-01,gw-01,mcp-01}` and `libs/{contracts,solver-py}` coverage output.
11. **Supervisor protocol** comment names three wire versions; the array allows four.
12. **"Funnel count" is defined twice** in the website glossary.
13. **`docs/wiki/README.md` covers only WBS and Twilight**; website, assistant and the design
    system are missing from the wiki entry.
14. **`docs/refactoring/tasks.md` was last reconciled 2026-09-13**; 17 items open, adjustable
    boundaries and the LLM wiki still queued.
    _dash-host-jobs:_ its heavy-lock item is marked closed for enrolled hosts and open for
    unenrolled ones; the enrolment that closes it is proposed (slices 2 to 6).
15. **Main's `swarm-rehearsal.boot.db.test.ts` step 3 failed once on the host gate** and passed
    on rerun and locally: a race in that test.
16. **Dash's host gate and CI acceptance**, Navigator and Dash npm release, and the
    Twilight control plane are the open ends of the factory; Backlog.md storage and client
    repositories have no code at all.
    _dash-host-jobs:_ the job catalogue and `JOB-CATALOGUE` are built (slice 1); Dash's host
    pool, `ops job …` and the gate hosts' move off the shell lock are proposed.
17. **Operator-owed steps** cluster in the almost-done changes: real Okta and Google wiring,
    live DNS ownership, platform secrets, the Claude Design sync, `wbs-resources` design sign-off.
