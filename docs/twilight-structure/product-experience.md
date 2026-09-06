# Operating Twilight

Status: proposed product behavior, 2026-09-06. Contracts and implementation order
live in the [control-plane change](../../openspec/changes/twilight-control-plane/).
This page describes what the person sees; it is not a claim that these screens exist.

The first useful experience is: choose a client repository, describe the outcome,
watch discovery and specifications become a budgeted plan, inspect and approve
that exact plan, then observe an activity execute and its evidence arrive. FE and
MCP operate the same BE commands. Reopening the browser or restarting a worker
does not lose the pending decision or start the activity twice. If an approval
response is lost, retrying that exact command displays the original decision receipt;
it does not ask for another decision or authorize another activity. Reusing its
decision token for a different command is refused. Cancellation shows each resource
still draining or awaiting remote confirmation; worker exit alone does not mark a
remote browser/model job free.

## Surfaces

| Surface              | User can do                                                                                                                | User can inspect                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Repository home      | Connect an authorized repo, select template/workflow versions, choose a WBS plan, start a request                          | Repo identity, installed/available template versions, pending upgrades, current health and scope            |
| Workbench            | Review request, assumptions, specifications, tasks, changes and rework                                                     | Requirement-to-task-to-evidence links and stale inputs                                                      |
| Run view             | Pause, resume, cancel, retry eligible work, open an approval or finding                                                    | Stage/activity graph, live timeline, attempt identity, queued reason, worker/session, effect reconciliation |
| Configuration editor | Change supported stage, activity, agent, hook, approval, integration and resource settings; preview and publish a revision | Effective values, inherited origin, safety floor, compatibility errors, diff and affected runs              |
| Capacity view        | Set agent/provider/build/browser pools, priority/fairness and budget ceilings                                              | Reserved/running/free capacity, queue age, human decision waits, estimated versus measured usage            |
| Knowledge workspace  | Ask cited questions, inspect sources, accept a knowledge proposal, resolve a contradiction, preview compaction             | Owning context, provenance, status, stale references and incoming links                                     |
| Review inbox         | Decide an approval, assign/dispose findings, inspect disagreements                                                         | Exact candidate, requested capability, rubric, reviewers, dissent and scope of the decision                 |

WBS remains the work-planning editor. Twilight links or embeds it with a scoped
repository and planning revision, not an independent editable task board. The
[Backlog-backed migration](client-repositories.md) supplies the later storage change.
A candidate's evidence view separates pinned prior receipts from completions it
produces and shows every change's plan reference. Concurrent edits to disjoint plans
may still conflict on the repository's accepted planning revision; WBS shows the
conflict and reconciliation action without claiming either edit was auto-merged.

## All supported settings are visible and versioned

| Dimension      | Settings and observable consequences                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stage/activity | Applicability, enabled state, completion obligations, allowed rework destinations, timeout, bounded retry, human checkpoint, hooks, inputs/outputs                 |
| Agent role     | Provider/model revision, ACP adapter/capabilities, effort where supported, instructions and skills, tool permissions, workspace/egress profile, token/spend limits |
| Review         | Critic specialism, author/reviewer separation, judge/rubric revision, required findings disposition, review rounds, escalation policy                              |
| Approvals      | Which actor/group, action class, candidate/policy digests, expiry, quorum if required, timeout behavior, revocation; separate production command                   |
| Hooks          | Registered version, lifecycle point, input schema, capability set, execution environment, timeout, retry/idempotency class, mandatory/optional failure behavior    |
| Capacity       | Pools by organization/client/repo/provider/model/resource, concurrency, request/token rate limits, reservations, queue fairness, deadlines and cancellation drain  |
| Integrations   | ACP/MCP server identity and allowed tools, credential reference, calendar/cron timezone, webhook verification, event delivery and retention policy                 |
| Knowledge      | Context/source scope, ingestion/review policy, provenance requirements, stale criteria, capture/retention, retrieval provider and citations                        |
| Presentation   | Focus/full view, update cadence, notification delivery, accessibility preferences, approval batching, resume detail                                                |

Configuration is draft → validated preview → published revision. Starting a run
pins its compiled definition, provider capabilities, policy and prompt/skill
revisions. Ordinary definition edits affect new runs by default. Current grant
revocations and tighter safety floors also constrain existing runs: the run view
shows the revoked authority and blocked next action while retaining the definition
originally approved. Loosening policy does not expand that approval. An explicit
migration checks retained executable/checkpoint/hook compatibility and invalidates
affected evidence/approvals. If restore is unsupported, show the missing or
incompatible version and the recovery action; never quietly resume with latest code.
Unsupported settings are visible with a reason and cannot be selected as enforceable
controls.

The same configuration schema drives FE forms, API validation, MCP tools, docs,
and configuration diffs. Server-side validation is authoritative. New controls
must ship their form, API/MCP representation, behavior, and tests together.

## Hooks and authority

Hooks register against the compiled workflow's lifecycle points, the one key
space the [design](../../openspec/changes/twilight-control-plane/design.md#single-workflow-source)
defines for policy and hooks, where the adapter exposes those points. Who may
decide what is the [authority requirement](../../openspec/changes/twilight-control-plane/specs/twilight/control-plane/spec.md)
and is not restated here.

An optional reporting hook may return `degraded` with a visible cause; a failed
mandatory hook blocks the action. A callback cannot run arbitrary administrator
commands merely because it is configured. Hooks receive least-privilege capability
references, have deadlines, and use durable effect identities where needed. A
hook failure after a committed effect records that distinction; it does not
pretend the side effect rolled back or retry the entire activity blindly.

## Focus profile

Adapt the [inspected i-have-adhd convention](research/knowledge-patterns.md)
through all stages. This is an optional preference, not a medical label.

The focus view shows the current outcome, one next action, up to five actionable
decisions, progress with evidence, and a resume cue. A parking lot holds unrelated
ideas. Full detail stays one interaction away; required errors, dissent and spend
remain visible in both views. Approvals show one concrete consequence and the
reviewed diff. A short view never auto-approves on a timer or hides a blocking finding.

For this planning request the operator delegated answers to the agent. A run
therefore records assumptions and continues instead of creating an unanswered
inbox card at every question. That delegation cannot authorize a later production
command. Estimates show their unit and uncertainty; unavailable measurements say
why they are missing.

## Radical observability with a defined boundary

Every event links organization, client repository, work request, run, stage,
activity attempt, actor, source revision, policy revision and evidence reference.
Timeline views distinguish execution, queueing, human waiting, retries, rework,
drain and recovery. Usage includes input/output/cache tokens where supplied,
actual cost when measurable, reservations, estimates, and explicit unknowns.

Record prompts/instructions supplied, public agent responses, tool requests and
responses, diffs, reviewer findings and decisions within access/redaction rules.
Do not promise hidden model reasoning or telemetry an ACP adapter does not supply.
Content filtering occurs before storage/export; secret references and placeholders
are observable, secret values are not. Each content gap is labeled. Users can
export an authorized evidence bundle with its content manifest and retention state.

Improvement dashboards compare cost per accepted outcome, elapsed/active/wait
time, review rounds, escaped defects and evidence freshness. Proposals to change
the factory run against pinned evaluation tasks and independent rubrics. A score
cannot improve by silently weakening the rubric or deleting a failing observation.
