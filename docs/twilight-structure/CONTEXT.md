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
The authorized ceiling on consumption for a defined scope of work.
_Avoid_: Estimate, capacity

**Knowledge claim**:
A sourced statement retained for future work, with an explicit status and an
owning context.
_Avoid_: Requirement, instruction

**Focus brief**:
A compact view of the current outcome, next action, decisions, and stopping point
that helps someone start or resume work.
_Avoid_: Work plan, reduced workflow

### Execution

**Coordinator**:
The single process that admits activities, owns run state, and advances the
compiled workflow. One is active at a time.
_Avoid_: Scheduler, orchestrator, server

**Worker**:
An isolated process that performs one activity attempt with no access to
control-plane credentials or policy writes.
_Avoid_: Agent, sandbox

**Compiled workflow**:
The immutable, digest-identified result of compiling a workflow definition,
execution profile, and repository manifest for a run.
_Avoid_: Config snapshot, graph

**Execution profile**:
The versioned policy file beside the schema that assigns policies to lifecycle
points.
_Avoid_: Settings, stage list

**Lifecycle point**:
A named stage, activity, tool, or decision event of a compiled workflow, the one
key space for policies and hooks.
_Avoid_: Step, phase, trigger

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

### Authority

**Organization**:
The owning party for repositories, members, and policy floors; one is configured
at bootstrap.
_Avoid_: Tenant, account

**Safety floor**:
A mandatory policy at organization or platform level that lower-level overrides
may tighten but not loosen.
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
A reviewer with read scope that produces findings and holds no decision authority.
_Avoid_: Judge, safety agent, approver

### Planning and delivery

**Repository manifest**:
The versioned file that identifies a client repository, its template and adapter
versions, context roots, and planning ref.
_Avoid_: Config, settings file

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

**Candidate**:
The exact revision or artifact an approval, verification, or release names.
_Avoid_: Version, latest
