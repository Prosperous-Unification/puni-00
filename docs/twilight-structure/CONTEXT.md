# Twilight Structure

The software factory context in `puni-00`. Its vocabulary describes the work
of creating and delivering software through the factory.

## Language

**Twilight Structure**:
The software factory service that helps build the other software in this monorepo.
Its repository name is `twilight-structure`.

**Work request**:
A requested software outcome that enters the factory's discovery process.
It precedes the specifications and work plan needed to deliver that outcome.

**Work plan**:
The decomposition of specified work into tasks, dependencies, resource needs,
and decisions about which work can usefully proceed in parallel.

**Client repository**:
The client's monorepo containing its software projects and the knowledge,
requirements, and plans used to develop them. `puni-00` is the first such consumer.
_Avoid_: WBS project, tenant database

**Repository template**:
The versioned common structure and delivery conventions instantiated by client
repositories and evolved through the same workflow in `puni-00`.
_Avoid_: Golden fork, copied setup

**Planning revision**:
An identified, complete version of a repository's accepted work plan.
_Avoid_: Current files, workflow checkpoint

**Planning task**:
A stable unit of planned work that remains identifiable across display-number
changes, moves, and archival.
_Avoid_: Session, Backlog number

**Workflow definition**:
The versioned description of how a work request proceeds through stages and
which obligations govern that work.
_Avoid_: Prompt chain, work plan

**Workflow run**:
One attempt to carry a work request through a particular workflow definition.
_Avoid_: Session, project

**Stage**:
A delivery boundary with a purpose, prerequisites, and a completion decision.
_Avoid_: Step (a WBS term), agent

**Activity**:
A bounded piece of work within a stage, performed by a person, agent, or tool.
_Avoid_: Stage, session

**Assumption**:
A provisional answer used to advance work, with an owner and a condition that
requires revisiting it. It is neither an observed fact nor a person's approval.

**Execution envelope**:
A person's authorization of a specified outcome and the bounded execution choices
permitted to deliver it, with spending limits, quality obligations and expiry.
_Avoid_: Profile, unlimited autonomy

**Deliverable**:
An independently assessable part of a work request with its own contract,
dependencies and acceptance evidence.
_Avoid_: Agent session, file assignment

**Integration candidate**:
An identified composition of deliverables and their source basis submitted for
combined verification and acceptance.
_Avoid_: Completed branch, individual green

**Approval**:
An authorized person's decision about an identified action and the exact material
that decision covers; it remains bounded by current authority.
_Avoid_: Verdict, checkbox

**Finding**:
A reviewer's attributed concern, linked to the material reviewed and its eventual
disposition.

**Verdict**:
A judge's attributed assessment of findings against a stated rubric.
_Avoid_: Approval

**Evidence**:
An attributable observation about identified work, sufficient to inspect the
claim it supports and the circumstances in which it was observed.
_Avoid_: Assertion, progress

**Capacity pool**:
A bounded supply of an execution resource shared by competing activities.
_Avoid_: Budget, availability

**Budget**:
The authorized consumption policy for one run, containing warning targets and
hard caps for its accounted resources.
_Avoid_: Estimate, capacity

**Knowledge claim**:
A sourced statement retained for future work, with an explicit status and an
owning context.
_Avoid_: Requirement, instruction

**Focus brief**:
A compact view of the current outcome, next action, decisions, and stopping point
that helps someone start or resume work.
_Avoid_: Work plan, reduced workflow, focus view

**Focus profile**:
A person's preference to be shown focus briefs; it changes presentation only.
_Avoid_: Diagnosis, mode, stage

**Rubric**:
The versioned criteria a judge applies to findings.
_Avoid_: Checklist, policy

**Judge**:
A reviewer role that issues verdicts against a rubric and holds no decision
authority.
_Avoid_: Approver, gate

### Execution

**Coordinator**:
The single process that admits activities, owns run state, and advances the
compiled workflow. One is active at a time.
_Avoid_: Scheduler, orchestrator, server

**Worker**:
An isolated process that performs one activity attempt with no access to
control-plane credentials or policy writes.
_Avoid_: Agent, sandbox

**Worker provisioner**:
The trusted adapter that places an admitted attempt on registered execution
capacity and reports its observed lifecycle. It grants no authority of its own.
_Avoid_: Scheduler, autoscaler, worker

**Compiled workflow**:
The immutable, digest-identified result of compiling a workflow definition,
execution profile, repository manifest, and organization snapshot for a run.
_Avoid_: Config snapshot, graph

**Execution profile**:
The versioned repository file that defines stage prerequisites, artifact mappings,
the activity catalog, lifecycle policy, hooks, and delivery profiles.
_Avoid_: Settings, stage list

**Activity class**:
The kind of work an activity performs and the unit that supplies default model
choices for agent-executed activities.
_Avoid_: Role, agent type

**Activity executor**:
The kind of performer an activity requires: an agent using a model or a registered
tool implementation.
_Avoid_: Activity class, worker

**Lifecycle point**:
A named stage, activity, tool, decision, rework, trigger or profile-change event
of a compiled workflow, the one key space for policies and hooks.
_Avoid_: Step, phase

**Trigger**:
An external cause of admission: a person's request, a schedule occurrence or a
verified webhook; it never proves that work started.
_Avoid_: Cron job, event

**Rework**:
Returning a deliverable to its owning activity because of a finding, counted in
rounds against the delivery profile's limit.
_Avoid_: Retry, fix

**Hook**:
A registered, versioned extension invoked at a lifecycle point with declared
capabilities and an explicit failure policy.
_Avoid_: Callback, script, plugin

**Admission**:
The decision to start an activity attempt once every required reservation and
policy check holds.
_Avoid_: Scheduling, launch

**Reservation**:
A claim on part of a capacity pool or budget held for one admitted activity.
_Avoid_: Allocation, quota

**Lease**:
Time-bounded ownership of a reservation or workspace, fenced by a token so an
expired owner cannot act.
_Avoid_: Lock, session

**Effect**:
An externally visible action a worker requests, recorded with a stable identity
before dispatch so its outcome can be reconciled.
_Avoid_: Side effect, call, tool use

**Workspace lineage**:
The sequence of attempts that write to one repository checkout; one writer holds
it at a time.
_Avoid_: Branch, repository lineage

### Levers

**Delivery profile**:
A named, versioned bundle of activity choices, execution choices, resource limits,
and stopping conditions that a person selects for a run.
_Avoid_: Starting profile, mode, preset

**Profile epoch**:
An immutable interval of a run during which one resolved set of delivery-profile
settings applies to newly admitted work.
_Avoid_: Current profile, profile change

**Escalation ladder**:
The bounded sequence of models an activity class moves through when an attempt
ends in refusal, gate failure or a blocking finding.
_Avoid_: Fallback, retry policy

**Rate card**:
The organization's versioned prices for measured provider usage, with effective
dates and explicit charge categories.
_Avoid_: Pricing, vendor list

**Organization snapshot**:
The immutable, digest-identified organization floors, capacity pools, and rate
card supplied when a workflow is compiled for a run.
_Avoid_: Server defaults, current organization settings

**Budget account**:
The one run-owned account that holds its authorized targets, hard caps,
reservations, and consumption across attempts, retries, and child work.
_Avoid_: Attempt budget, spending estimate

**Delivery charge**:
An attributable cost of a model, tool, service or person's work on a run, kept
with its reserved maximum, pricing basis and observed consumption.
_Avoid_: Token count, budget allowance

**Agent time**:
The sum of time during which agent sessions occupy execution capacity, including
provider or tool waits while those sessions remain occupied.
_Avoid_: Run elapsed, queue wait

**Run elapsed**:
Wall-clock time from a run's creation to its terminal time or the observation time,
including queueing, decisions, pauses, and recovery.
_Avoid_: Agent time, workdays

**Run ledger**:
The run's attributable record of planned, reserved, and measured consumption,
waits, human effort, serving choices, and profile epochs.
_Avoid_: Usage, bill

**Outcome record**:
The versioned record of a terminal run and candidate under a named evaluation,
including acceptance, rework, findings, observations, costs, and later defect reports.
_Avoid_: Score, report

**Evaluation**:
The shared acceptance definition, rubrics, observations, cohort, and defect window
under which outcome records can be compared.
_Avoid_: Delivery profile, score formula

**Accepted outcome**:
A candidate accepted at handoff with every floor activity passed.
_Avoid_: Done, merged

**Escaped defect**:
A defect reported against an accepted outcome within the configured window after
acceptance.
_Avoid_: Bug, regression

### Authority

**Organization**:
The owning party for repositories, members, and policy floors; one is configured
at bootstrap.
_Avoid_: Tenant, account

**Installation operator**:
The party responsible for maintaining and restoring a Twilight installation on
behalf of its owner. The operator and owner may be the same party.
_Avoid_: Organization, user

**Safety floor**:
A mandatory policy at platform, organization, or repository level that lower-level
settings may not loosen.
_Avoid_: Default, baseline

**Decision token**:
A short-lived credential issued by the interactive browser flow that binds one
human decision to one subject and consumer and authorizes at most one decision command.
_Avoid_: Approval token, bearer token

**Discovery envelope**:
The displayed, versioned authority a request grants to discovery work before a
plan exists: write paths, limits, deadline, and read-only code access.
_Avoid_: Budget, pre-approval

**Critic**:
A reviewer with read scope that produces findings and holds no decision authority;
a safety critic is a critic with a safety rubric.
_Avoid_: Judge, safety agent, approver

### Planning and delivery

**Repository manifest**:
The versioned file that identifies a client repository, its template and adapter
versions, context roots, planning settings, default delivery profile and policy
references.
_Avoid_: Config, settings file, planning manifest

**Plan lock**:
The file in a source candidate that pins its change-keyed plan references, export
digests and input receipt snapshot.
_Avoid_: Lockfile, manifest

**Progress receipt**:
A revision of a task's measured usage or checkbox state, distinct from the
approved task definition.
_Avoid_: Completion receipt, status

**Planning broker**:
The one principal per repository that validates and publishes accepted planning
revisions.
_Avoid_: Backlog service, writer

**Plan reference**:
The tuple of repository, plan, change, planning commit, source base commit, and
requirements digest that names one accepted plan for one source basis. Its type is `PlanRef`.
_Avoid_: Plan id, plan version

**Source candidate**:
A source commit that pins the plan references, prior evidence and task exports
for its changes and is the subject of verification and approval.
_Avoid_: Branch, build, release

**Input receipt snapshot**:
The immutable selection of accepted prior completion receipts used to admit and
verify a source candidate, including the selected integration status.
_Avoid_: Latest progress, candidate output

**Completion receipt**:
An attributed record that a planning task was completed on a named source
candidate, with its tests, verdicts, and integration status; it is an output of
that candidate's work, available as input to later candidates.
_Avoid_: Checkbox, done flag

**Candidate revision**:
The accepted planning revision a command was validated against and expects to be
current when the broker advances the accepted ref.
_Avoid_: Head, latest plan, base

**Materialized candidate view**:
The working checkout that native Backlog tools read and write; its edits are
proposals that must be imported through the broker to become accepted planning
state.
_Avoid_: Working copy, the plan, checkout

**Candidate**:
The exact revision or artifact an approval, verification, or release names.
_Avoid_: Version, latest
