## ADDED Requirements

### Requirement: Bounded request-to-plan authoring

The workbench MUST support creation, revision and adoption of intent, assumptions,
specifications, design and tasks through shared FE/BE/MCP operations. Discovery
without an implementation plan MUST operate only under its explicitly selected
discovery envelope. Implementation MUST require a complete validated plan and its
required approval.

#### Scenario: A request starts without a plan

- **WHEN** a user submits a new outcome with an authorized discovery envelope
- **THEN** artifacts can be authored and adopted through the workbench or scoped
  discovery activities without shell edits, while implementation stays inadmissible

#### Scenario: Discovery attempts a product-code edit

- **WHEN** a discovery activity requests a write outside its artifact/research scope
- **THEN** the execution boundary refuses it before the write occurs

### Requirement: One authorized command surface

FE and MCP MUST invoke the same BE operations, with organization/repository/actor
authorization at the boundary. A tool caller MUST NOT supply a trusted actor or
gain a service account's broader authority. Unsupported controls MUST be refused
with typed errors. Malformed requests MUST produce typed 4xx responses. Bootstrap
and interactive decision-token issuance establish authority and are the only
operations without an agent-callable MCP form; their resulting bindings MUST be
readable through the effective-policy operation.

#### Scenario: Same request through two clients

- **WHEN** an authorized user submits the same idempotency key through FE and MCP
- **THEN** both observe the same workflow run and only one start is admitted

#### Scenario: Client repository isolation

- **WHEN** a caller authorized only for repository A requests an existing run,
  evidence, source, secret reference or configuration belonging to B
- **THEN** the service refuses access and no B content appears in the response or stream

### Requirement: Versioned inspectable workflow configuration

The service MUST validate and publish immutable workflow revisions compiled from
the OpenSpec artifact contract, the execution profile, the repository manifest,
provider capability documents and an explicit immutable organization snapshot.
The organization snapshot MUST identify the organization and include the content
and revisions of its floors, pools and rate card; a missing, unreadable or invalid
snapshot MUST fail compilation. Repository configuration MAY request capacity but
MUST NOT define organization price or capacity authority.

The execution profile MUST declare one explicit acyclic stage graph. Stage
prerequisites MUST come only from stage `after` edges; artifact mappings and the
artifact-readiness graph MUST NOT imply stage edges. Each activity MUST resolve to
exactly one catalog entry with an `agent` or `tool` executor. A tool entry MUST name
a registered implementation and MUST NOT receive a model. Every delivery profile
MUST contain a total activity map keyed by that catalog, and the repository floor
MUST be the sole catalog-independent list of activities that cannot be disabled.
Stage scope MUST be explicit or default to run. The shipped graph MUST order
request, discovery, specification and planning at run scope, then implementation,
review and verification per deliverable. Integration and acceptance MUST join the
members of an integration candidate; handoff MUST join all required accepted
outcomes. An independent deliverable MUST NOT wait for another's implementation
to enter review or verification. Published custom graphs MUST preserve required
artifact and authority obligations. Release MUST depend
on handoff and remain a separate human command that stage completion never starts.
The first increment's controls MUST be configurable and inspectable through FE,
BE and MCP with their effective value, origin scope and restriction. Platform and
organization floors MUST constrain lower scopes.

Each activity MUST declare a minimum resource vector. Compilation MUST combine it
with registered executor requirements and resolved provider/model limits; admission
MUST reserve the complete vector. Tool-only gates MUST NOT require agent slots by
default, and build/browser activities MUST reserve their corresponding scarce pools.

#### Scenario: A running workflow is unaffected by a draft edit

- **WHEN** an operator edits and publishes a later profile while an activity is running
- **THEN** the current run retains its pinned execution revision unless explicitly
  migrated, migration rechecks affected authority and evidence, and current grant
  revocations or tighter safety floors still constrain admission and dispatch

#### Scenario: Capability cannot be enforced

- **WHEN** the chosen ACP adapter's capability document lacks a `beforeTool`
  control that a policy in the profile requires
- **THEN** configuration validation refuses that combination and names the capability gap

#### Scenario: Published configuration is reproduced from Git

- **WHEN** FE publishes against an expected source revision and a clean checkout
  compiles that revision with the same organization snapshot
- **THEN** it produces the same compiled digest as the service, while a missing
  snapshot or competing stale Git publication is refused

#### Scenario: An override reaches below a floor

- **WHEN** a request selects a profile override that removes an activity, hook,
  approval or evidence item the repository or organization floor lists
- **THEN** submission is refused with the floor's origin, and no run is created

#### Scenario: Artifact mappings disagree with stage order

- **WHEN** artifact readiness would permit planning but the explicit stage graph
  still places specification before planning
- **THEN** planning remains ordered after specification; artifact mappings do not
  create or remove a stage edge

#### Scenario: A disabled stage is an ordering boundary

- **WHEN** every activity in an intermediate stage is disabled without violating a floor
- **THEN** the stage records its activities as inapplicable and its successors wait
  for that disposition; the service does not invent pass evidence

### Requirement: Profile overrides and epochs are explicit

Profile defaults MUST NOT act as authority limits. A request override or run profile
change MAY replace named fields in either direction only within current grants,
allowed provider/model/effort capabilities, approved spending and immutable floors.
Map fields MUST merge by key, arrays MUST replace wholesale, unspecified fields MUST
inherit, and unknown fields or inconsistent resolved controls MUST be rejected.
Categorical models MUST NOT be ordered as cheaper, better, higher or lower; model
fallback MUST use only the declared bounded escalation ladder. Every override and
profile change MUST record its reason and expose the fully resolved settings to all
clients.

Each accepted run profile change MUST create an immutable profile epoch containing
the resolved settings and digest and its start and end transitions. It MUST apply
only to work not yet admitted after validation and any required reapproval. Running
or draining attempts MUST retain their original epoch and reservations. A profile
change MUST NOT reset budget consumption, outstanding holds, rework rounds, the
original run start or elapsed deadline clock. Reducing fan-out MUST queue later work rather
than erase occupied slots. `skipActivity` MUST use this same audited activity-enable
override and MUST NOT skip an admitted or completed activity, erase a finding or
make stale evidence current.

Each attempt MUST bind its epoch, action and execution envelope. A profile choice
inside the approved envelope MUST create an attributed epoch without another human
decision. Choices outside it MUST remain pending until a new envelope is approved;
unadmitted work under that proposed epoch MUST NOT start. Already-admitted attempts
MAY continue under their unchanged envelope and reservations. Expiry, revocation,
changed scope and tighter floors MUST constrain every epoch at dispatch.

#### Scenario: An old attempt dispatches while the new epoch awaits approval

- **WHEN** an admitted epoch-A attempt records an unchanged authorized effect, then
  an out-of-envelope profile change proposes epoch B awaiting approval
- **THEN** that effect may dispatch against A's still-valid decision and held
  allowance, no B work starts, and revoking A before dispatch prevents its effect

#### Scenario: A profile changes after one attempt has started

- **WHEN** an admitted attempt under epoch A is draining while an approved profile
  change creates epoch B with a different model and smaller fan-out
- **THEN** the attempt settles against epoch A, new admissions use epoch B, occupied
  slots remain counted, and all prior spend and rework remain on the run

#### Scenario: A model is replaced by request override

- **WHEN** an authorized request replaces an activity's model with another allowed
  model that has no declared ordering relationship to the default
- **THEN** validation resolves that exact model without interpreting the change as
  upward or downward, and any later fallback follows only its declared ladder

### Requirement: Lifecycle points are the one key space

Policies and hooks MUST be keyed by lifecycle points of the form
`<event>.<stage or activity id>` over the compiled stage graph, with `beforeStage`,
`afterStage`, `beforeActivity`, `afterActivity`, `beforeTool`, `afterTool`,
`onFinding`, `onApproval`, `onRework`, `onFailure`, `onCancel`, `onTrigger` and
`onProfileChange` as events. `*` MUST select all valid subjects of the event's
kind. `onTrigger` and `onProfileChange` MUST use `*` only; trigger policies MUST
select `triggerKinds` from `manual`, `schedule` and `webhook`. Artifact ids MUST NOT
be policy or hook keys. A point naming an unknown or wrong-kind stage/activity
MUST be a compile error.

#### Scenario: A trigger kind is used as a lifecycle target

- **WHEN** a policy names `onTrigger.schedule` rather than selecting `schedule`
  under `onTrigger.*`
- **THEN** compilation refuses the target; the wildcard with the typed selector
  compiles without inventing a schedule stage

#### Scenario: A hook names an activity the profile does not declare

- **WHEN** a hook registration attaches to `afterActivity.review.smoke` and no such
  activity exists
- **THEN** compilation fails naming the point, and no workflow revision is published

#### Scenario: A rework policy fires on the round it is about

- **WHEN** a critic finding sends an implementation back for the profile's last
  permitted round
- **THEN** the `onRework` policy for that activity is evaluated with the round
  number, and the next unresolved blocking finding pauses the run

### Requirement: Executable restore compatibility

A run MUST retain the digests/versions of its executable graph, compiler, runtime
and dependency closure, hook/adapter implementations, checkpoint serializer/saver
and application-store schema. Workflow restore MUST own compatibility validation,
checkpoint loading and revision reconciliation; callers MUST NOT assemble these
steps independently. Missing, unreadable, corrupt or unsupported required packages
and formats MUST block resume before worker or effect dispatch. Name-based latest
implementation substitution MUST NOT occur. The service MAY refuse incompatible
upgrades while nonterminal runs exist; supporting every historical graph is not
required. Successful migration/rollback preservation MUST be proven before a later
increment declares a particular upgrade path supported.

#### Scenario: A newer controller restores an older run

- **WHEN** a retained run is `awaiting_approval` under an older graph and hook build
- **THEN** only a proven compatible controller with the pinned executable closure
  may restore its same subject and transition; an incompatible hook/serializer
  blocks before any worker launch or effect request

#### Scenario: An incompatible upgrade is refused

- **WHEN** an upgrade is attempted while a nonterminal run's closure is not in the
  tested compatibility matrix
- **THEN** the upgrade is refused with the run and the missing compatibility named,
  and the run's pending decision and effects are unchanged

### Requirement: Durable stage and activity lifecycle

Runs MUST distinguish `queued`, `running`, `awaiting_approval`, `paused`,
`reconciling`, `failed`, `cancelled` and `completed`. Durable ownership and
checkpoints MUST permit restart without inventing completion or repeating uncertain
effects. Cancellation MUST fence new work, then drain or terminate workers. Effect
execution MUST own attempt fencing, intent persistence, dispatch, reconciliation
and resource release. Callers MUST NOT invoke effect transports or free
reservations independently. Each reservation MUST require resource-specific
terminal evidence before release; local process exit alone MUST NOT release a
remote session/job or unresolved budget. A retried activity MUST be a new attempt
under the same activity, and a skipped activity MUST record the decision that
skipped it. Aggregate reconciling/failed-stage status MUST block only affected
dependency closures; independent authorized work MAY continue. Explicit run-wide
pause/cancel, exhausted run budget and revoked run authority MUST stop all new work.

#### Scenario: Restart during approval wait

- **WHEN** the coordinator restarts while a plan decision is pending
- **THEN** the same decision and subject revision are shown and no activity starts
  before the required decision is received

#### Scenario: Crash after an external effect

- **WHEN** a worker's external effect succeeds but its acknowledgment is lost
- **THEN** recovery reconciles the durable effect identity before retrying and
  an unknown outcome is visible as `reconciling` instead of repeating the effect

#### Scenario: An uncertain effect cannot be queried

- **WHEN** its provider offers no receipt query and automatic reconciliation is inconclusive
- **THEN** an authorized recovery operator can submit a revision-checked evidence
  decision or abandon dependent work with outcome still unknown, and ordinary
  resume cannot repeat the effect

#### Scenario: Local exit leaves a remote session running

- **WHEN** a cancelled worker has exited but its browser or provider job is still
  active or its terminal state cannot be read
- **THEN** that resource remains `held` and the run visible as `reconciling` until
  provider-specific terminal evidence is observed; no replacement may consume it

### Requirement: Current authority constrains pinned runs

Authority MUST own the intersection of pinned requested scope, approved scope and
current actor/membership/repository grants, integration grants, approval validity
and platform/organization safety floors. Admission and effect execution MUST use
this same authority boundary. Current tightening MUST constrain existing runs;
relaxation MUST NOT enlarge an earlier approval. Dispatch admission MUST serialize
its authority and fence validation with revocation/cancellation changes, including
for brokered tools and effectful hooks.

#### Scenario: Revocation after approval but before admission

- **WHEN** an actor's repository grant or approval is revoked while approved work
  is queued, or a new safety floor denies its requested capability
- **THEN** admission refuses with the current reason and no worker starts, even
  though the compiled workflow digest still matches the approved one

#### Scenario: Revocation between effect intent and dispatch

- **WHEN** a tool or hook intent is recorded but its authority is revoked before
  dispatch admission commits
- **THEN** dispatch is refused and the external receiver observes no request;
  effects already dispatched remain subject to cancellation/reconciliation

#### Scenario: A floor is relaxed after approval

- **WHEN** current policy permits a broader capability than the run originally
  requested and its human approved
- **THEN** that broader action is still refused until a new subject and approval
  cover it; the existing decision does not expand

### Requirement: Revision-bound human decisions

Plan approval MUST bind a human decision to an immutable execution envelope:
requirements and plan digest, source basis and permitted integration lineage,
workflow/policy revision, exact quality obligations and evaluator, permitted
provider/model/effort choices, fan-out and resource ranges, token/money/agent-time
hard ceilings, environment, capabilities, speculation allowance and expiry.
Missing ranges MUST mean the pinned choice only, never unrestricted authority.
Selection within those bounds MUST NOT change the approval subject. Increasing a
hard ceiling, changing scope or quality, or leaving permitted lineage MUST require
a new decision; usage and holds MUST survive it. Evidence MUST still bind exact
candidate content: authority to compose a candidate never transfers its greens.
Production MUST require a separate explicit human command bound to the exact
verified candidate and environment even if earlier stages complete automatically.

#### Scenario: Stale plan approval

- **WHEN** a user approves an older plan revision after a new revision is published
- **THEN** the service refuses the decision as stale, records the attempted decision,
  and starts no dependent activity

#### Scenario: A budget change after approval

- **WHEN** a requested hard ceiling or model exceeds the approved execution envelope
- **THEN** new work under that proposal waits for a human decision, while existing
  authority and consumption remain intact

#### Scenario: Spare capacity is used within existing authority

- **WHEN** the scheduler raises fan-out and selects a permitted model within the
  approved envelope and current pool grants
- **THEN** new work is admitted without another human decision, with the chosen
  epoch, envelope and cumulative spending visible through FE and MCP

#### Scenario: Model-written approval claim

- **WHEN** an agent writes `approved: true` into an artifact or tool argument
- **THEN** it cannot satisfy the human decision requirement or promote a release

### Requirement: Caller identity and human-decision provenance

The service MUST verify its configured OIDC issuer/audience, derive actor and
organization/repository membership from trusted bindings, and distinguish browser
session authority from agent/service bearer authority. Human-decision tokens MUST
be issued only by the authenticated interactive browser flow with origin/CSRF
validation and subject confirmation. Tokens MUST be short-lived, single-use and
bound to actor, action, repository, subject/revision and intended consumer.
Approval, effect resolution and release operations MUST require the same human
decision capability on either surface, and an ordinary MCP or service token MUST
NOT mint it.

Single use MUST mean one committed decision command. Token consumption, canonical
command identity and decision receipt MUST commit atomically. After verifying
caller identity and access to the stored answer, an exact command retry MUST
return that receipt without consuming again, checking its now-stale expected
revision, or admitting additional work. The receipt MUST NOT confer new authority.

#### Scenario: Service or delegated user token attempts approval

- **WHEN** a valid service token or ordinary user-delegated MCP token attempts to
  mint or exercise a human decision without a decision capability
- **THEN** the service refuses with 403 and creates no approved decision or admitted activity

#### Scenario: Interactive decision response is lost

- **WHEN** the confirmed decision commits but the response is lost and the same
  actor/consumer retries the same repository/key/parameters after token expiry
- **THEN** it receives the original decision receipt with only one decision and
  admission; later revocation still prevents new effects

#### Scenario: Consumed token is reused for a different command

- **WHEN** a caller uses the consumed token with a different command key, subject
  or parameters, or with the wrong consumer
- **THEN** the command is refused and commits no additional decision or admission;
  changing parameters under the original key is also a conflict

#### Scenario: Expired token has never been consumed

- **WHEN** a caller first attempts a decision after its token expires
- **THEN** the service refuses without a committed decision

### Requirement: Capacity and budget admission

Each run MUST own exactly one budget account. A discovery envelope MUST be a
suballocation of that account, and retries, escalations, children, cancellation and
all profile epochs MUST settle against the same account. A retry or profile change
MUST NOT mint or reset budget authority; another run requires its own explicit
budget authority.

A budget MUST declare `scope: run`, `moneyScope: model|delivery`,
`enforcement: strict|advisory`, and limits for
tokens, money and additive agent time. Strict limits MUST be hard caps. Advisory
limits MUST be warning targets and MUST include finite hard limits for the same
dimensions at or above those targets. Admission MUST atomically reserve a
conservative per-attempt allowance against every required pool and hard cap, rather
than reserve the whole run cap. For every dimension, settled consumption plus all
outstanding holds MUST NOT exceed the hard cap. Unknown spend MUST retain its hold;
work without a defensible bound and stop mechanism MUST be refused under a hard
cap. Reaching an advisory target MUST emit a visible warning. Reaching a hard cap
MUST prevent new dispatch and pause unresolved work rather than mark it successful;
draining in-flight work MUST remain covered by its reservation.

The money scope MUST explicitly select model spend or all delivery charges.
Delivery scope MUST include tool/service/human charges and require defensible
bounds for them; model scope MUST NOT be presented as a total delivery-cost cap.
A scope change MUST recheck prior charges and holds in that scope and refuse
missing history rather than treating it as zero. A discovery envelope's
`allowance` MUST constrain its suballocation using the run's same units and money
scope, in addition to the run's hard caps.

Expired owners MUST be fenced from publishing, dispatching new external effects,
writing a replacement workspace or freeing another owner's reservation. Expiry
MUST NOT be treated as terminal evidence. Direct worker egress MUST be denied, and
writable mounts MUST NOT be reused until all old writers have verifiably lost
access. Active multi-coordinator operation is outside this increment; multiple
trigger producers MUST submit to the single admission authority.

#### Scenario: Concurrent admission with one remaining slot

- **WHEN** two concurrent admission requests within the single active coordinator
  request the same final provider/workspace slot
- **THEN** at most one worker starts and the other run shows the constrained pool

#### Scenario: Expired worker invents a new effect key

- **WHEN** a still-live expired attempt requests a previously unseen logical effect
  after a replacement attempt receives a new fence
- **THEN** the broker refuses before the receiver sees a request, and direct egress
  is denied; effect deduplication alone cannot satisfy this requirement

#### Scenario: Workspace lease expires while its writer lives

- **WHEN** a replacement requests the expired attempt's workspace while an old
  process or writable mount can still mutate it
- **THEN** that workspace remains unavailable until access is verifiably removed;
  expiry alone cannot make the new attempt its writer

#### Scenario: Telemetry is unavailable under a strict budget

- **WHEN** the provider cannot support a defensible consumption reservation or stop limit
- **THEN** a strictly budgeted activity is refused rather than admitted at zero estimated cost

#### Scenario: A profile change replaces the run cap

- **WHEN** a run with $10 settled and a $1 outstanding hold requests a profile
  epoch whose approved hard money cap is $40
- **THEN** the account exposes $29 available; a requested cap below $11 is refused,
  and neither the change nor reapproval resets prior consumption

#### Scenario: Parallel attempts contend for one budget account

- **WHEN** two attempts concurrently request holds that cannot both fit beneath the
  run's remaining token or money cap
- **THEN** at most one hold commits and the other attempt stays queued or is denied
  with the constrained budget dimension named

### Requirement: Run clocks preserve distinct time quantities

Agent time MUST be the additive active duration of agent sessions across attempts,
including provider or tool wait while a session remains occupied. It MUST exclude
not-started queue time and human-only approval pauses. Tool-only activity duration
MUST remain separate. Run wall elapsed MUST be measured from the original
`createdAt` to `terminalAt`, or to an explicit `asOf` for a nonterminal run, and
MUST include queueing, approval, pause and recovery. A duration deadline MUST use
that original `createdAt`; a profile change MUST NOT reset it. Once the deadline
passes, no new work may start and admitted work MUST drain within existing holds.

Queue and human-wait totals MUST be interval unions for their respective kinds, may
overlap execution or each other, and MUST NOT be summed to derive wall elapsed.
Human minutes MUST be explicit recorded effort, never inferred from a wait. Every
time figure MUST include its unit, observation interval and measured or unavailable
status.

#### Scenario: Four agents run in parallel

- **WHEN** four agent sessions each remain active for 30 minutes over the same
  30-minute wall-clock interval
- **THEN** the account consumes 120 agent-minutes while run wall elapsed advances
  30 minutes; neither figure is substituted for the other

#### Scenario: A profile changes near its deadline

- **WHEN** a run changes profile after three hours and its deadline is four hours
  from original creation
- **THEN** the new epoch has one hour remaining, and queue or approval time has not
  paused or reset the deadline

### Requirement: Model pricing is revision-bound and category-complete

Compilation MUST require an organization-snapshot rate for every enabled model and
permitted escalation choice under a hard money cap; a disabled optional model MAY
remain unresolved until enabled. Admission MUST pin the current immutable rate-card
entry and the provider/model revision actually requested for each attempt. A later
rate change MUST re-evaluate uncommitted holds before launch but MUST NOT reprice a
settled or admitted attempt. Missing or unavailable rates MUST refuse admission
under a hard money cap.

Token observations and rates MUST distinguish input, output, cache-read and
cache-write categories without double counting. An unsupported category MUST be
unavailable rather than zero. Estimated model spend and provider-billed model spend
MUST remain separate. Known tool, service and human costs MUST be recorded in their
own categories; absent categories MUST prevent aggregate money from being described
as full cost.

Each non-model charge MUST have a stable run/attempt/effect/category identity,
currency, maximum reserved amount, quote or rate revision, source receipt and
measured amount or unavailable reason. Organization snapshots MUST provide supported
service/request/human-minute rates or a binding maximum quote with expiry. A charge
adapter MUST declare whether all effects and stopping costs have a defensible bound;
otherwise delivery-budget admission MUST refuse that combination. Shared-invoice
allocations MUST sum to its billed amount; unallocated or missing receipts MUST
leave the charge inventory incomplete and its holds unresolved.

#### Scenario: A money budget lacks an enabled model rate

- **WHEN** an enabled activity or permitted escalation model has no rate in the
  organization snapshot used for a hard money budget
- **THEN** compilation fails naming the model and profile, while an unresolved model
  used only by a disabled optional activity does not fail until enabled

#### Scenario: Cache-write telemetry is unavailable

- **WHEN** a provider reports input, output and cache-read tokens but cannot report
  cache-write tokens priced by the pinned rate
- **THEN** cache-write usage and exact estimated model spend are unavailable with a
  reason; neither is recorded as zero or silently charged as another category

### Requirement: Levers are configurable and their effects are measured

Named delivery profiles MUST expose their resolved activity settings, agent-class
and per-activity model assignments, escalation ladders, rework maximum, fan-out,
budget and deadline through all clients. Activity settings MUST be the only source
for critic count, judge enablement, browser scope and other optional enablement;
disabled critics with a positive count, model assignments on tool activities and
disabled floor activities MUST be rejected. Rework rounds MUST count consumed
rework across profile epochs; zero permits no rework, and exhausting the maximum
with a blocking finding MUST pause the run.

Every activity attempt MUST write a run-ledger entry with planned, held, settled
and unavailable consumption, model-pricing categories, agent time, tool time,
queue wait, human wait, human minutes, the serving provider/model revision,
escalation step and profile epoch. Aggregates MUST preserve their component status
and roll up failed attempts and runs rather than reporting only accepted work.

#### Scenario: A review is skipped to save time

- **WHEN** a request disables `review.judge` without violating a floor
- **THEN** the resolved activity records the override actor and reason, the activity
  is skipped through that same setting, and its missing observation is not counted
  as a passed review

#### Scenario: A declared model ladder escalates

- **WHEN** an `implement` attempt on the profile's first model ends in a gate failure
  and the escalation ladder permits one step
- **THEN** the retry is a new attempt on the escalated model, both attempts appear in
  the ledger with their own measured usage, and no third step is taken

#### Scenario: Two runs are compared by profile

- **WHEN** one request ran under `economy` and another under `thorough` in the same
  repository
- **THEN** `read_outcomes` returns both with their profile epochs, money, time,
  rework and observation status side by side, each figure marked measured or unavailable

#### Scenario: Fan-out beyond the profile

- **WHEN** a plan proposes four parallel implementation activities under a profile
  whose fan-out is two
- **THEN** admission holds the third and fourth as `queued` with the profile named,
  and the ledger records their queue wait separately from agent time

### Requirement: Outcomes use an independent evaluation definition

Every terminal run and candidate, including failed and cancelled work, MUST have an
outcome record. Each record MUST retain its ordered profile epochs and state whether
it is single-profile or mixed-profile. Attempt costs MUST remain attributed to their
epochs; a mixed-profile recovery MUST NOT be ranked as a result of either profile
alone. Request-level cost MUST include failed runs and retries. Cost per accepted
outcome MUST include those costs, and MUST be unavailable when its denominator is zero.

Quality evaluation MUST be defined outside delivery-profile overrides and MUST pin
an evaluation revision, rubric revision, observation-set revision, task or cohort
identity, accepted-outcome definition and escaped-defect window. Changing any of
these MUST create a distinct evaluation cohort and preserve prior observations.
Each observation MUST be `passed`, `failed`, `skipped` or `unavailable`; skipped,
immature or incomplete evidence MUST NOT be counted as zero failures. Comparisons
MUST match evaluation definitions and task/cohort identity, report sample count and
defect-window maturity, and exclude incompatible or mixed-profile records from
single-profile ranking while still displaying them. M1 MUST support one fixed
independent evaluation used by both initial profiles; automatic optimization from
larger samples belongs to a later increment.

The canonical evaluation source MUST be the execution profile's `quality` subtree.
The existing workflow publication operation MUST require the organization
evaluation-publisher capability and a subject-bound human decision for its changes.
Compilation MUST derive immutable evaluation/rubric/observation-set revisions from
their contents; request submission MUST pin them from its compiled workflow along
with the independently authored task-fixture digest used for cohort matching. The
initial `delivery-baseline` MUST resolve the integrated gate and `acceptance.evaluate`
task-acceptance observer. Missing task assertions MUST produce an unavailable
observation. Running the observer MUST reserve its declared tool resources and
charge the run account. It MUST be a floor activity at candidate acceptance;
missing assertions MUST block acceptance, and disabling it MUST be refused.

Escaped-defect reports MUST be revisioned outcome updates submitted through one
shared FE/BE/MCP operation with caller scope, idempotency key, expected revisions,
source evidence, `reportedAt` and accepted candidate lineage. The defect window MUST
open at `acceptedAt`; outcomes MUST expose `observedThrough`, exposure duration,
window maturity and source coverage. A report MUST attach to the named candidate and
MUST NOT infer that a model or profile caused the defect.

#### Scenario: A recent run has no reported defect

- **WHEN** an accepted run has no defect report but its evaluation window has not matured
- **THEN** its escaped-defect observation remains immature rather than zero and is
  excluded from a mature single-profile defect-rate comparison

#### Scenario: A mixed-profile run recovers after escalation

- **WHEN** a economy epoch fails and a thorough epoch completes the same run
- **THEN** each attempt's consumption stays with its epoch, the outcome is labeled
  mixed-profile, and neither profile receives the whole run as a ranked success

#### Scenario: A defect report is retried

- **WHEN** an authorized reporter submits the same defect command and parameters
  twice for an accepted candidate within its observation window
- **THEN** one revisioned report is attached to that candidate and the retry returns
  its original receipt without attributing causation to a model

### Requirement: Hooks, critics and judges preserve authority

Mandatory hooks MUST fail closed on timeout, unavailable dependency or malformed
decision. Optional hook degradation MUST be typed and visible. Critic findings,
judge verdicts and human approvals MUST be distinct records; the profile's review
limits MUST stop unresolved work rather than turn it into a pass.

#### Scenario: Required safety hook times out

- **WHEN** the required `beforeActivity` hook exceeds its deadline
- **THEN** the worker has not started, the failure is recorded, and no model verdict
  overrides the denied admission

#### Scenario: Rework rounds are exhausted

- **WHEN** the profile's configured rework maximum leaves a blocking finding unresolved
- **THEN** the affected dependency closure pauses with the finding, consumed budget
  and next authorized action visible; independent authorized work may continue

### Requirement: Scheduling minimizes accepted delivery elapsed time

The scheduler MUST select resource-feasible ready deliverables, prioritize their
estimated remaining dependency-chain duration under the configured fairness policy,
and record estimate provenance, blocked resource and selection reason. Feasible
tasks at or beyond the aging window MUST outrank unaged tasks, oldest first;
critical-path priority MUST NOT starve them. Workdays
MUST NOT be converted into agent duration; absent duration estimates MUST use a
visible deterministic priority/aging policy until measured. Contracts MUST identify
real predecessors, source basis, outputs, write scope and acceptance oracles.
Resource contention MUST NOT become a semantic dependency. A blocked task MUST NOT
prevent an independent feasible task from starting. Capacity requests MUST name
the constrained pool and stay within organization grants and the execution envelope;
provisioning failures or exhausted provider quota MUST remain visible constraints.
Reviewer capacity MUST be protected without reserving idle capacity forever when no
review is ready; borrowing MUST be bounded by the configured fairness window.

#### Scenario: One deliverable is slow

- **WHEN** one implementation is held at a barrier while an independent deliverable finishes
- **THEN** the finished deliverable completes its own review and verification before
  the barrier is released; the unfinished outcome is not reported complete

#### Scenario: Browser contention does not stop backend work

- **WHEN** the first ready task cannot acquire a browser and a backend task has all
  required resources
- **THEN** the backend task starts without a browser reservation or waiting for that task

#### Scenario: Critical work receives available capacity

- **WHEN** two equally aged feasible tasks still below the aging window compete with explicit duration estimates
  and one has a longer remaining dependency chain
- **THEN** the critical-path policy selects that task, records its inputs and respects
  the client ceiling and aging policy

#### Scenario: New critical work cannot starve an old feasible task

- **WHEN** a short ready task reaches the aging window while new longer chains arrive
  and capacity becomes available within its client ceiling
- **THEN** the aged task is selected before those unaged chains

### Requirement: Integration is an independently scalable execution service

The integration queue MUST compose authorized deliverables on a recorded base,
preserve plan-lock entries, and run full integrated verification against the exact
composed candidate. Candidate preparation and verification MAY overlap in isolated
workspaces. Integration preparation MUST NOT publish shared source. The acceptance
completion path MUST invoke publication only after its independent oracle and all
required candidate checks pass; handoff MUST require the publication receipt.
Publication MUST compare-and-swap the accepted source ref. A moved base
MUST trigger recomposition and fresh candidate verification. Semantic conflicts MUST
return to bounded repair; failed members MUST NOT prevent independent candidates
from progressing. Cross-deliverable contract changes MUST invalidate dependent
candidates and evidence. Queue age, accepted throughput, repair cost and superseded
verification MUST be observable; acceptance counts fixed requested outcomes once.
Evidence reuse MUST require matching declared content, tool and environment inputs;
a prior candidate's success MUST NOT be accepted solely because its branch was green.

#### Scenario: Independently green branches conflict together

- **WHEN** two branches pass alone but their composed behavior violates a pinned assertion
- **THEN** the candidate is refused, the failing assertion is recorded, and neither
  branch's green authorizes the combined candidate

#### Scenario: Integration failure is contained

- **WHEN** one candidate fails or its source base moves while an independent
  candidate is being prepared
- **THEN** affected work is recomposed or repaired, the independent candidate can
  progress, and no stale verification is published as current

### Requirement: Speculation spends only bounded authorized capacity

Speculative attempts MUST be opt-in under the execution envelope, isolated, charged
to the same account and limited by the configured per-deliverable count. They MAY
produce local candidate changes and use explicitly allowed research/model services;
they MUST NOT publish shared source, planning changes or production effects.
An independent pinned evaluator MUST choose a passing candidate, not the fastest
response or majority vote. Losing attempts MUST be cancelled and fenced, with holds
retained until terminal resource and usage evidence arrives. A speculation failure
MUST NOT consume the successful candidate's authority or hide any losing cost.

#### Scenario: The first answer is wrong

- **WHEN** one speculative attempt answers first but fails the task oracle and another passes
- **THEN** only the passing candidate can enter integration; both attempts are charged
  and a late losing writer cannot publish

### Requirement: Scaling is proved at fixed quality before M1 acceptance

M1 MUST execute the execution profile's `scalingAcceptance` matrix before accepting
its scaling claim, independently of the Backlog migration. Runs MUST pin fixture,
requirements, model/effort, quality, evaluator and comparable environment identities;
only worker and required supporting capacity vary. Budget ceilings MUST be equal
and sufficient across compared runs; failed or exhausted runs MUST remain in the
report. Request-to-acceptance p50/p95, accepted outcomes per hour, total attributed
cost including losers, human/queue wait, rework, integration delay, resource
utilization and defect-observation maturity MUST be reported with samples and raw
observations. Subdividing tasks MUST NOT increase the accepted-outcome denominator.
The matrix MUST cover independent changes, a decomposable feature and contended
recovery. Missing measurements or a missed speedup budget MUST block the scaling
milestone; they MUST NOT be reported as linear scaling or zero defects.

Coordinator acceptance MUST exercise the profile's offered effect rate and session
count on an identified host. Dispatch overhead excludes remote service duration but
includes coordinator queueing and durable authorization; end-to-end effect latency
is reported separately. Slow external calls MUST NOT occupy the serialized authority
boundary. Missing the budget MUST require measured improvement or a separate
partitioned-coordination design and race proofs before increasing supported scale.

#### Scenario: Extra workers only create a longer queue

- **WHEN** the scaling matrix increases workers but integration or browser capacity
  prevents the required accepted speedup
- **THEN** acceptance fails with the constrained pool and measured queues, despite
  a larger number of active sessions

#### Scenario: A remote service stalls

- **WHEN** a dispatched remote effect is held while unrelated authorized effects arrive
- **THEN** those effects dispatch within the coordinator budget without waiting for
  the held service; revocation and fencing checks remain effective

### Requirement: Observable evidence with focus access

The service MUST expose attributable events, effective policy, artifact revisions,
review dispositions, ledger entries and evidence through all clients. The focus
brief MUST retain blocking information and access to full detail, and the focus
profile MUST be a per-actor preference that changes presentation only. The service
MUST identify gaps in provider telemetry and redact secrets before storage and export.

#### Scenario: Focus brief during a failed gate

- **WHEN** verification fails while the actor's focus profile is on
- **THEN** the brief shows the failure, current stage, next diagnostic action and
  link to full evidence, without marking the stage complete

#### Scenario: A secret appears in hook output

- **WHEN** an integration returns a credential-bearing response
- **THEN** protected values are removed before persisted traces or client exports,
  and the record identifies that redaction occurred
