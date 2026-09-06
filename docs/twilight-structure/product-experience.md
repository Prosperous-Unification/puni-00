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

| Surface              | User can do                                                                                                                        | User can inspect                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository home      | Connect an authorized repo, select template/workflow versions, choose a WBS plan, pick a delivery profile, start a request         | Repo identity, installed/available template versions, pending upgrades, current health, scope and default profile                                                  |
| Workbench            | Review request, assumptions, specifications, tasks, changes and rework                                                             | Requirement-to-task-to-evidence links and stale inputs                                                                                                             |
| Run view             | Pause, resume, cancel, retry an activity, skip a non-floor activity with a reason, change profile, open an approval or finding     | Stage/activity graph, live timeline, attempt identity, queued reason, serving model, worker/session, effects                                                       |
| Configuration editor | Change stage, activity, agent, hook, approval, integration, profile and resource settings; preview and publish a revision          | Effective values, inherited origin, floor, compatibility errors, diff and affected runs                                                                            |
| Capacity view        | Set organization pools, priority/fairness and ceilings (privileged); set repository defaults; open the pinned join/drain procedure | Reserved/running/free capacity, queue age, human decision waits, K3s node readiness and capability, Job/Pod placement and reasons, estimated versus measured usage |
| Levers and outcomes  | Compare compatible outcomes; propose a profile default as a work request; publish the rate card (privileged)                       | Money, tokens, time, rework, observations and defect maturity by evaluation and profile epoch                                                                      |
| Knowledge workspace  | Ask cited questions, inspect sources, accept a knowledge proposal, resolve a contradiction, preview compaction                     | Owning context, provenance, status, stale references and incoming links                                                                                            |
| Review inbox         | Decide an approval, assign/dispose findings, inspect disagreements                                                                 | Exact candidate, requested capability, budget, rubric, reviewers, dissent and scope of the decision                                                                |

WBS remains the work-planning editor. Twilight links or embeds it with a scoped
repository and planning revision, not an independent editable task board. The
[Backlog-backed migration](client-repositories.md) supplies the later storage change.
A candidate's evidence view separates pinned prior receipts from completions it
produces and shows every change's plan reference. Concurrent planning edits show whether semantic preconditions were preserved by
authorized disjoint reconciliation or a real conflict needs a new decision. The
accepted receipt names both the requested basis and the committed revision.

## All supported settings are visible, scoped and versioned

Every setting shows its effective value, the scope it came from (platform floor,
organization floor, repository, workflow, activity, run) and the floor that bounds
it. The [execution profile](../../openspec/schemas/twilight-v1/execution.yaml) is
the repository-level source, including its floor and capacity requests. The
immutable organization snapshot supplies higher floors, capacity pools and the
rate card through privileged operations.

| Dimension      | Settings and observable consequences                                                                                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stage/activity | Ordered stage prerequisites; activity catalog with class, agent/tool executor and implementation; complete per-profile activity settings; effective floor membership                                                                                      |
| Delivery lever | Resolved profile epochs, activity choices, model routing, escalation and rework, fan-out, budget account and deadline, with each field's origin and constraint                                                                                            |
| Agent role     | Provider/model revision, ACP adapter/capabilities, instructions and skills, tool permissions, workspace/egress profile                                                                                                                                    |
| Review         | Critic enablement/count and specialism, judge enablement, author/reviewer separation, rubric revision, findings disposition and rework limit                                                                                                              |
| Approvals      | Which actor/group, action class, candidate/policy/profile/budget digests, expiry, quorum if required, timeout behavior, revocation; separate production command                                                                                           |
| Hooks          | Registered implementation and version, lifecycle points, mandatory flag, timeout and timeout behavior, capability set, idempotency class                                                                                                                  |
| Capacity       | Pools by organization/client/repo/provider/model/resource; registered provisioner; K3s readiness, drain, capability labels and Job resource bounds; request/token limits, reservations, queue priority and aging, per-client ceilings, cancellation drain |
| Money          | Organization rate-card revision and charge categories; strict caps or advisory targets with explicit hard caps; estimated, billed and non-model costs                                                                                                     |
| Integrations   | ACP/MCP server identity and allowed tools, credential reference, schedule timezone and DST policy, webhook verification, event delivery                                                                                                                   |
| Knowledge      | Context/source scope, ingestion/review policy, provenance requirements, stale criteria, retrieval provider, benchmark targets                                                                                                                             |
| Retention      | Metadata, redacted content and release-evidence durations; organization policy revision that overrides them                                                                                                                                               |
| Presentation   | Focus profile on/off per actor, decision batch size, parking lot, resume cue, update cadence, notification delivery, accessibility preferences                                                                                                            |

Configuration is draft → validated preview → published revision. Starting a run
pins its compiled definition, organization snapshot, provider capabilities,
resolved profile epoch and prompt/skill revisions. A request override replaces
named fields; unspecified fields inherit and arrays replace as a whole. Changes in
either direction are permitted only within supported capabilities, floors, current
grants and approved spend, and inconsistent combinations are refused.

Ordinary edits affect new runs; current grant revocations and tighter floors also
constrain existing runs, and the run view shows the revoked authority beside the
definition originally approved. A validated mid-run change starts an immutable
profile epoch for work not yet admitted. Choices within the approved execution
envelope continue automatically; choices outside it show the exact additional
authority awaiting approval. Running or draining attempts retain their epoch and reservations; usage,
holds, rework and the original deadline clock do not reset. An explicit migration
checks retained executable, checkpoint and hook compatibility and invalidates
affected evidence and approvals; an unsupported restore shows the missing version
and the recovery action. Unsupported settings are visible with a reason and cannot
be selected as enforceable controls.

An admitted attempt retains its envelope for unchanged work while an expansion
awaits approval. Epochs show their envelope reference and selected values; expiry,
revocation and tighter floors still stop unauthorized dispatches.

The same configuration schema drives FE forms, API validation, MCP tools, docs and
configuration diffs. Server-side validation is authoritative. A new control ships
its form, API/MCP representation, behavior, ledger or outcome field where it is a
lever, and tests together.

## Buying shorter delivery time

The run view shows the approved outcome, fixed quality obligations, execution
envelope and current bottleneck. Operators can authorize a range of models,
concurrency and resources with hard spending ceilings, then watch the scheduler
use those bounds without a new decision for each adjustment. A capacity increase
that cannot start more work names the limiting provider, build, browser, integration
or authority constraint. No setting promises linear scaling.

Deliverables show simultaneous implementation, review and verification progress.
The integration queue shows composition, exact candidate checks, repair and accepted
publication. Optional speculative attempts show the selected candidate and losing
costs. Comparisons expose fixed-quality speedup, accepted outcomes per hour and
request-to-acceptance percentiles with sample counts, queue time and quality coverage.

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
activity attempt, actor, source revision, policy revision, profile epoch and
evidence reference. Timeline views distinguish execution, queueing, human waiting,
retries, rework, drain and recovery.

Each run has one budget account shared by discovery, retries, escalations and
child work. A strict budget treats its limits as hard caps. An advisory budget
warns at its targets and still requires finite hard caps at or above them. Admission
reserves a bounded allowance for each attempt; settled use plus outstanding holds
cannot exceed a hard cap, and unknown spend keeps its hold. Exhaustion pauses new
work rather than turning an unresolved run into success. Current organization
prices recheck new holds without repricing settled attempts.

The budget explicitly selects model spend or total delivery charges. Total delivery
caps need bounds for tool, service and human costs too; changing the scope rechecks
past charges and refuses missing history. The ledger separates model tokens and estimated/billed money from known tool,
service and human costs. It also separates additive active agent time from run
wall-clock elapsed, tool-only time, queue intervals, human-wait intervals and
explicit human minutes. Parallel intervals may overlap and are never summed to
invent wall-clock time. Every figure carries timestamps, units and measured or
unavailable status. The deadline runs from the original creation time and a profile
change cannot reset it.

Prompts and instructions supplied, public agent responses, tool requests and
responses, diffs, reviewer findings and decisions are recorded within access and
redaction rules. Hidden model reasoning and telemetry an adapter does not supply
are not promised. Content filtering occurs before storage and export; secret
references are observable, secret values are not, and each content gap is
labeled. Users can export an authorized evidence bundle with its content manifest
and retention state.

Every terminal run and candidate receives an outcome record, including failed and
cancelled runs, and later defect reports update it with source evidence. The levers
view attributes attempt costs to ordered profile epochs and labels a mixed-profile
run explicitly. Cost per accepted outcome includes failed attempts; with no accepted
outcome it is unavailable, not zero.

Comparisons use one pinned evaluation revision shared across profiles: acceptance,
rubric, observation set, task/cohort identity and defect window. Observations are
passed, failed, skipped or unavailable. Defect quality stays immature until its
window closes, and incompatible or mixed records remain visible but outside a
single-profile ranking. The two-profile M1 exercise proves this instrumentation;
it does not justify automatic optimization. A new evaluation creates a distinct
cohort instead of rewriting earlier scores.

The shared configuration editor publishes the `quality` definition with an
evaluation-publisher capability and human decision. Each request pins its hashes
and task fixture. The independent task-acceptance observer consumes visible tool
resources and budget; disabling it leaves a missing observation and excludes that
outcome from comparisons requiring it, without adding a mandatory QA step.
