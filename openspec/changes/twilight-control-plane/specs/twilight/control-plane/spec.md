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
with typed errors. Malformed requests MUST produce typed 4xx responses.

#### Scenario: Same request through two clients

- **WHEN** an authorized user submits the same idempotency key through FE and MCP
- **THEN** both observe the same workflow run and only one start is admitted

#### Scenario: Client repository isolation

- **WHEN** a caller authorized only for repository A requests an existing run,
  evidence, source, secret reference or configuration belonging to B
- **THEN** the service refuses access and no B content appears in the response or stream

### Requirement: Versioned inspectable workflow configuration

The service MUST validate and publish immutable workflow revisions derived from
the OpenSpec artifact contract and compatible execution profile. Every supported
control MUST be configurable and inspectable through FE, BE and MCP, including
effective value, source and restrictions. Mandatory organizational safety floors
MUST constrain lower-level overrides.

#### Scenario: A running workflow is unaffected by a draft edit

- **WHEN** an operator edits and publishes a later profile while an activity is running
- **THEN** the current run retains its pinned execution revision unless explicitly
  migrated, migration rechecks affected authority and evidence, and current grant
  revocations or tighter safety floors still constrain admission and dispatch

#### Scenario: Capability cannot be enforced

- **WHEN** the chosen ACP adapter cannot expose a required before-tool control
- **THEN** configuration validation refuses that combination and identifies the capability gap

#### Scenario: Published configuration is reproduced from Git

- **WHEN** FE publishes against an expected source revision and a clean checkout
  compiles the resulting repository revision
- **THEN** it produces the same compiled digest as the service, and a competing
  stale Git publication is refused as a conflict

### Requirement: Executable restore compatibility

A run MUST retain the digests/versions of its executable graph, compiler, runtime
and dependency closure, hook/adapter implementations, checkpoint serializer/saver
and application-store schema. Workflow restore MUST own compatibility validation,
checkpoint loading and revision reconciliation; callers MUST NOT assemble these
steps independently. Missing, unreadable, corrupt or unsupported required packages
and formats MUST block resume before worker or effect dispatch. Name-based latest
implementation substitution MUST NOT occur. M1 MAY refuse incompatible upgrades
while nonterminal runs exist; supporting every historical graph is not required.
Successful migration/rollback preservation MUST be proven before a later increment
declares a particular upgrade path supported.

#### Scenario: A newer controller restores an older run

- **WHEN** a retained run is awaiting approval under an older graph and hook build
- **THEN** only a proven compatible controller with the pinned executable closure
  may restore its same subject and transition; an incompatible hook/serializer
  blocks before any worker launch or effect request

#### Scenario: Upgrade rollback follows accepted work

- **WHEN** a supported upgraded controller accepted a decision and recorded an uncertain
  effect before rollback is requested
- **THEN** the protected recovery path works without the upgraded controller,
  preserves both records across application/checkpoint stores and outbox, and
  resumes only a tested compatible closure without re-dispatching that effect;
  an unsupported reverse migration refuses rollback without losing accepted state

### Requirement: Durable stage and activity lifecycle

Runs MUST distinguish queued, running, awaiting approval, paused, reconciling,
failed, cancelled, and completed states. Durable ownership and checkpoints MUST
permit restart without inventing completion or repeating uncertain effects.
Cancellation MUST fence new work, then drain or terminate workers. Effect execution
MUST own attempt fencing, intent persistence, dispatch, reconciliation and resource
release. Callers MUST NOT invoke effect transports or free reservations independently.
Each reservation MUST require resource-specific terminal evidence before release;
local process exit alone MUST NOT release a remote session/job or unresolved budget.

#### Scenario: Restart during approval wait

- **WHEN** the coordinator restarts while a plan decision is pending
- **THEN** the same decision and subject revision are shown and no activity starts
  before the required decision is received

#### Scenario: Crash after an external effect

- **WHEN** a worker's external effect succeeds but its acknowledgment is lost
- **THEN** recovery reconciles the durable effect identity before retrying and
  an unknown outcome is visible as reconciling instead of repeating the effect

#### Scenario: An uncertain effect cannot be queried

- **WHEN** its provider offers no receipt query and automatic reconciliation is inconclusive
- **THEN** an authorized recovery operator can submit a revision-checked evidence
  decision or abandon dependent work with outcome still unknown, and ordinary
  resume cannot repeat the effect

#### Scenario: Local exit leaves a remote session running

- **WHEN** a cancelled worker has exited but its browser or provider job is still
  active or its terminal state cannot be read
- **THEN** that resource remains reserved and visible as reconciling until its
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

Approvals MUST be attributable to authorized human decisions and bound to the
action, candidate digest, target environment, policy revision and expiry. A
changed subject MUST invalidate the decision. Production MUST require an explicit
human command even if all earlier stages complete automatically.

#### Scenario: Stale plan approval

- **WHEN** a user approves an older plan revision after a new revision is published
- **THEN** the service refuses the decision as stale, records the attempted decision,
  and starts no dependent activity

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

FE and MCP MUST expose the same workflow operations and effective permissions.
Approval, effect resolution and release operations MUST require the same human
decision capability on either surface. An ordinary MCP token MUST NOT mint it.
Interactive token issuance and trusted bootstrap establish that authority; they
are not agent-invokable self-grants.

#### Scenario: Service or delegated user token attempts approval

- **WHEN** a valid service token or ordinary user-delegated MCP token attempts to mint or exercise a human decision without a decision capability
- **THEN** the service refuses with 403 and creates no approved decision or admitted activity

Single use MUST mean one committed decision command. Token consumption, canonical
command identity and decision receipt MUST commit atomically. After verifying
caller identity and access to the stored answer, an exact command retry MUST
return that receipt without consuming again, checking its now-stale expected
revision, or admitting additional work. The receipt MUST NOT confer new authority.

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

Admission MUST atomically reserve every required pool and budget before launching
an activity. Planned, reserved, and measured consumption MUST remain separate.
Unknown usage MUST NOT be represented as zero. Expired owners MUST be fenced from
publishing, dispatching new external effects, writing a replacement workspace or
freeing another owner's reservation. Expiry MUST NOT be treated as terminal evidence.
Direct worker egress MUST be denied, and writable mounts MUST NOT be reused until
all old writers have verifiably lost access.

#### Scenario: Concurrent admission with one remaining slot

- **WHEN** two concurrent admission requests within the single active coordinator request the same final provider/workspace slot
- **THEN** at most one worker starts and the other run shows the constrained pool

Active multi-coordinator operation is outside this increment. It requires a
separate storage/lease change with real cross-process admission and fencing proofs;
multiple trigger producers do not imply multiple admission coordinators.

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

### Requirement: Hooks, critics and judges preserve authority

Mandatory hooks MUST fail closed on timeout, unavailable dependency or malformed
decision. Optional hook degradation MUST be typed and visible. Critic findings,
judge verdicts and human approvals MUST be distinct records; review limits MUST
stop unresolved work rather than turn it into a pass.

#### Scenario: Required safety hook times out

- **WHEN** the required pre-activity hook exceeds its deadline
- **THEN** the worker has not started, the failure is recorded, and no model verdict
  overrides the denied admission

#### Scenario: Review rounds are exhausted

- **WHEN** two configured revision rounds leave a blocking finding unresolved
- **THEN** the run pauses with the finding, consumed budget and next authorized action visible

### Requirement: Observable evidence with focus access

The service MUST expose attributable events, effective policy, artifact revisions,
review dispositions and evidence through all clients. Focus view MUST retain
blocking information and access to full detail. It MUST identify gaps in provider
telemetry and redact secrets before storage and export.

#### Scenario: Focus view during a failed gate

- **WHEN** verification fails while the focus profile is active
- **THEN** the view shows the failure, current stage, next diagnostic action and
  link to full evidence, without marking the stage complete

#### Scenario: A secret appears in hook output

- **WHEN** an integration returns a credential-bearing response
- **THEN** protected values are removed before persisted traces or client exports,
  and the record identifies that redaction occurred
