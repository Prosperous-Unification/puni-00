# Operating Twilight

Status: proposed product behavior, 2026-09-06. Contracts and implementation order
live in the [control-plane change](../../openspec/changes/twilight-control-plane/).
This page describes what the person sees; it is not a claim that these screens exist.
What the service must guarantee is the [control-plane spec](../../openspec/changes/twilight-control-plane/specs/twilight/control-plane/spec.md)
and is not restated here.

The first useful experience: choose a client repository, describe the outcome,
pick a delivery profile, watch discovery and specifications become a budgeted
plan, inspect and approve that exact plan with its budget, then observe an
activity execute and its evidence and cost arrive. FE and MCP operate the same
BE operations. Reopening the browser or restarting a worker loses no pending
decision and starts nothing twice.

## Surfaces

| Surface              | User can do                                                                                                                    | User can inspect                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Repository home      | Connect an authorized repo, select template/workflow versions, choose a WBS plan, pick a delivery profile, start a request     | Repo identity, installed/available template versions, pending upgrades, current health, scope and default profile |
| Workbench            | Review request, assumptions, specifications, tasks, changes and rework                                                         | Requirement-to-task-to-evidence links and stale inputs                                                            |
| Run view             | Pause, resume, cancel, retry an activity, skip a non-floor activity with a reason, change profile, open an approval or finding | Stage/activity graph, live timeline, attempt identity, queued reason, serving model, worker/session, effects      |
| Configuration editor | Change stage, activity, agent, hook, approval, integration, profile and resource settings; preview and publish a revision      | Effective values, inherited origin, floor, compatibility errors, diff and affected runs                           |
| Capacity view        | Set organization pools, priority/fairness and ceilings (privileged); set repository defaults                                   | Reserved/running/free capacity, queue age, human decision waits, estimated versus measured usage                  |
| Levers and outcomes  | Compare runs by profile; propose a new profile default as a work request; publish the rate card (privileged)                   | Money, tokens, elapsed, wait, rework rounds, escaped defects and skipped activities per run and per profile       |
| Knowledge workspace  | Ask cited questions, inspect sources, accept a knowledge proposal, resolve a contradiction, preview compaction                 | Owning context, provenance, status, stale references and incoming links                                           |
| Review inbox         | Decide an approval, assign/dispose findings, inspect disagreements                                                             | Exact candidate, requested capability, budget, rubric, reviewers, dissent and scope of the decision               |

WBS remains the work-planning editor. Twilight links or embeds it with a scoped
repository and planning revision, not an independent editable task board. The
[Backlog-backed migration](client-repositories.md) supplies the later storage change.
A candidate's evidence view separates pinned prior receipts from completions it
produces and shows every change's plan reference. Concurrent edits to disjoint plans
may still conflict on the repository's accepted planning revision; WBS shows the
conflict and reconciliation action without claiming either edit was auto-merged.

## All supported settings are visible, scoped and versioned

Every setting shows its effective value, the scope it came from (platform floor,
organization floor, repository, workflow, activity, run) and the floor that bounds
it. The [execution profile](../../openspec/schemas/twilight-v1/execution.yaml) is
the repository-level source; floors, pools and the rate card are organization
records with their own privileged operations.

| Dimension      | Settings and observable consequences                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stage/activity | Stage list, activities per stage with class and floor mark, enabled state, completion obligations, rework destinations, timeout, bounded retry, human checkpoint, hooks           |
| Delivery lever | Profile: model and effort per activity class, escalation ladder, critics and judge and rounds, verification tiers and browser gate, skipped activities, fan-out, budget, deadline |
| Agent role     | Provider/model revision, ACP adapter/capabilities, instructions and skills, tool permissions, workspace/egress profile                                                            |
| Review         | Critic specialism, author/reviewer separation, judge/rubric revision, required findings disposition, escalation policy                                                            |
| Approvals      | Which actor/group, action class, candidate/policy/profile/budget digests, expiry, quorum if required, timeout behavior, revocation; separate production command                   |
| Hooks          | Registered implementation and version, lifecycle points, mandatory flag, timeout and timeout behavior, capability set, idempotency class                                          |
| Capacity       | Pools by organization/client/repo/provider/model/resource, request/token rate limits, reservations, queue priority and aging, per-client ceilings, cancellation drain             |
| Money          | Rate card entries per provider and model revision with effective date; strict or advisory budget policy                                                                           |
| Integrations   | ACP/MCP server identity and allowed tools, credential reference, schedule timezone and DST policy, webhook verification, event delivery                                           |
| Knowledge      | Context/source scope, ingestion/review policy, provenance requirements, stale criteria, retrieval provider, benchmark targets                                                     |
| Retention      | Metadata, redacted content and release-evidence durations; organization policy revision that overrides them                                                                       |
| Presentation   | Focus profile on/off per actor, decision batch size, parking lot, resume cue, update cadence, notification delivery, accessibility preferences                                    |

Configuration is draft → validated preview → published revision. Starting a run
pins its compiled definition, provider capabilities, profile revision and
prompt/skill revisions. Ordinary edits affect new runs; current grant revocations
and tighter floors also constrain existing runs, and the run view shows the
revoked authority beside the definition originally approved. An explicit migration
checks retained executable, checkpoint and hook compatibility and invalidates
affected evidence and approvals; an unsupported restore shows the missing version
and the recovery action. Unsupported settings are visible with a reason and cannot
be selected as enforceable controls.

The same configuration schema drives FE forms, API validation, MCP tools, docs and
configuration diffs. Server-side validation is authoritative. A new control ships
its form, API/MCP representation, behavior, ledger or outcome field where it is a
lever, and tests together.

## Hooks and authority

Hooks register against lifecycle points, the one key space the
[design](../../openspec/changes/twilight-control-plane/design.md#stages-activities-and-the-execution-profile)
defines for policy and hooks, where the adapter exposes those points. An optional
hook may return `degraded` with a visible cause; a failed mandatory hook blocks
the action. A hook cannot run administrator commands merely because it is
configured: it receives least-privilege capability references, has a deadline and
uses durable effect identities where it has effects. A hook failure after a
committed effect records that distinction rather than pretending the effect rolled
back.

## Focus profile

This is the canonical description of the adaptation of the inspected
[i-have-adhd convention](research/knowledge-patterns.md). It is an optional
per-actor preference, not a medical label, and it changes presentation only.

The focus brief shows the current outcome, one next action, up to the configured
number of actionable decisions (default five), progress with evidence, and a
resume cue. A parking lot holds unrelated ideas. Full detail stays one interaction
away; required errors, dissent and spend remain visible in both views. Approvals
show one concrete consequence and the reviewed diff. A brief never auto-approves
on a timer or hides a blocking finding.

For this planning request the operator delegated answers to the agent. A run
therefore records assumptions and continues instead of creating an unanswered
inbox card at every question. That delegation cannot authorize a later production
command. Estimates show their unit and uncertainty; unavailable measurements say
why they are missing.

## Radical observability with a defined boundary

Every event links organization, client repository, work request, run, stage,
activity attempt, actor, source revision, policy revision, profile revision and
evidence reference. Timeline views distinguish execution, queueing, human
waiting, retries, rework, drain and recovery. The run ledger shows per attempt
the tokens, estimated and billed money, agent elapsed, queue wait, human wait
and serving model, each figure measured or explicitly unavailable.

Prompts and instructions supplied, public agent responses, tool requests and
responses, diffs, reviewer findings and decisions are recorded within access and
redaction rules. Hidden model reasoning and telemetry an adapter does not supply
are not promised. Content filtering occurs before storage and export; secret
references are observable, secret values are not, and each content gap is
labeled. Users can export an authorized evidence bundle with its content manifest
and retention state.

The levers view compares outcome records: cost per accepted outcome, elapsed,
active and wait time, review rounds, escaped defects and evidence freshness, by
profile revision. Proposals to change a profile default or the factory itself run
against pinned evaluation tasks and independent rubrics. A score cannot improve
by silently weakening the rubric or deleting a failing observation.
