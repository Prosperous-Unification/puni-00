## ADDED Requirements

### Requirement: Preparation dispatch elects only a fresh committed intent

The host SHALL commit verified preparation before open and its locator before publishing
a live session. Only newly applied intent MAY open. Exact retries under original live
ownership SHALL report historical pending; takeover retries SHALL refuse. Live ownership
SHALL be checked before open. Uncertainty SHALL retain checkpoint and capacity without
establishing turn authority or quiescence.

#### Scenario: Concurrent preparation retries

- **WHEN** concurrent host calls submit the same preparation command
- **THEN** exactly one newly applied call may open a session and the duplicate reports pending without invoking open

#### Scenario: Session creation precedes a lost locator acknowledgement

- **WHEN** open returned a locator but retaining it throws or refuses
- **THEN** no usable live session is returned, the error retains preparation and known locator correlation, and a subsequent duplicate does not open again

#### Scenario: Reopen with unsupported preparation recovery

- **WHEN** a store is reopened and the retained preparation command is replayed under its original still-live ownership while the adapter has no durable recovery
- **THEN** it returns pending without reconstructing a live attachment, releasing capacity or blindly creating a replacement

#### Scenario: Preparation replay follows ownership takeover

- **WHEN** the old guard or a new current-owner guard retries the retained preparation command after takeover
- **THEN** the old guard refuses owner_stale and the new guard refuses identity_conflict, with no extra open or capacity release

### Requirement: Fresh turn dispatch observes exact claim and lease correspondence

The host SHALL require direct ready, current attachment, current-epoch grant and submitted revisions before fresh staging. It SHALL match the pinned receiver grant and exact runtime claim with a lease-bearing project read. Revoked/expired claims SHALL refuse; null expiry SHALL mean unleased. Separate reads SHALL NOT imply an atomic fence, continued lease validity or physical stop.

#### Scenario: An expired claim remains in runtime inventory

- **WHEN** runtime inventory still contains the exact claim but the project read reports expiry at or before its server readAt, or revocation
- **THEN** the host refuses before staging or calling turn, with no claim or capacity release
- **AND** valid unleased claims remain distinguishable from observed live leases
- **AND** timing is finite and full claim correspondence includes holder, work, step, parent and session run identity

#### Scenario: Live executor identity changes during an awaited observation

- **WHEN** the original opaque session's full locator or actual executor pin changes before dispatch
- **THEN** the host does not invoke turn and preserves any already staged pending identity

### Requirement: Turn replay never redispatches physical work

The host SHALL delegate retained stage replay before fresh-ready predicates and return its original acknowledgement without receiver reads or turn. Only fresh applied staging MAY dispatch. It SHALL commit the full reply before reporting stored completion, without refreshing revisions. Stage SHALL NOT advance scope revision. Completed SHALL mean turn_returned, not business success or release. Uncertainty SHALL retain correlation and held capacity.

#### Scenario: A duplicate arrives after turn completion or later execution facts

- **WHEN** the same complete local stage command is submitted under valid current ownership
- **THEN** the host returns its original historical pending acknowledgement without another turn
- **AND** changed content or command family retains the store's identity refusal

#### Scenario: Ownership expires during a held turn

- **WHEN** the exact reply returns after local ownership expires or intervening facts invalidate its captured save revisions
- **THEN** observation persistence refuses without refreshing authority or dispatching again, and the correlated failure preserves pending work
- **AND** the captured save uses the submitted run revision advanced once and the stage attempt revision

#### Scenario: An older observation ID is supplied for a new stage

- **WHEN** a fresh stage would reuse an observation command already in verified local execution history
- **THEN** the host refuses identity_conflict before staging or physical dispatch
- **AND** an applied or duplicate observation reply for another staged attempt revision throws a correlated fault instead of reporting the new turn observed
- **AND** an exact concurrent original acknowledgement for the same stage remains valid

### Requirement: Receiver boot integration follows actual test dependencies

Integration SHALL use a booted be-01 listener and separate Dash worker over authenticated loopback transport, bounded process phases and awaited cleanup, observing actual histories. Nx test inputs SHALL declare consumed Dash sources; CI selection SHALL include be-01 when they change. A controlled unleased test principal SHALL NOT certify machine heartbeat, business-attempt mapping, paid-provider execution or production readiness.

#### Scenario: A Dash worker source changes

- **WHEN** dispatch-turn, runtime-client or the boot worker changes
- **THEN** actual Nx-backed CI selection includes the be-01 integration test target
- **AND** removing its explicit Dash source inputs makes the selection regression fail

#### Scenario: A controlled turn returns after an ordinary claim

- **WHEN** the real boot flow retains a complete turn reply
- **THEN** business state compared with the post-claim pre-turn baseline has no extra start/end, progress write, release or successor settlement

### Requirement: Persistence is abstract and providers satisfy semantic contracts

Twilight Dash SHALL depend on RunStore and ArtifactStore ports independent of storage
engine, SQL, file layout and adapter schema migration mechanisms. SQLite MAY implement the
current deployment adapter; any provider satisfying the same contracts MAY replace it.
RunStore SHALL support atomic admission with identity/capacity/owner checks, immutable
binding manifests, atomic outcome-plus-outbox writes, deduplicated signals/receipts, and
consistent or revision-validated snapshots. ArtifactStore SHALL verify durable content
before a successful outcome references it. Portable record versions SHALL be distinct from
adapter schema versions. Memory SHALL NOT establish durability. WBS SHALL remain the
authority for scheduling, claims, business attempts, progress and measures; retained
execution records SHALL NOT replace those business facts (ADR 0061).

#### Scenario: Providers preserve semantics

- **WHEN** the admission, outcome/outbox, fencing, revision and restart suite runs against
  the current durable adapter and a second durable adapter
- **THEN** both satisfy the same invariants without provider-specific types in core ports

#### Scenario: A provider lacks a required atomic operation

- **WHEN** an adapter cannot atomically reserve capacity and persist admission intent
- **THEN** it is refused as nonconformant rather than weakening the coordinator's guarantee

#### Scenario: A restart has no prior scheduling cache

- **WHEN** the coordinator restarts on another host with access to its durable execution/artifact providers and the pinned WBS ledger
- **THEN** it rebuilds the frontier from WBS and accepted execution facts without replaying a persisted walk or duplicating a running attempt

### Requirement: Execution observations carry retry identities

Execution observations SHALL carry caller-assigned stable command identities. Replaying a
command under current ownership with the same run, attempt and fact SHALL return its original
reply without changing current state; changed content SHALL refuse. Fresh command identities
SHALL pass current revision and state checks even when their facts match an older command.

#### Scenario: Reattachment repeats an earlier locator

- **WHEN** an attempt enters recovery and a fresh command records supported reattachment to its same complete locator with current revisions
- **THEN** attachment provenance updates within its exact checkpoint without RunStore launching work
- **AND** pending or unresolved turn state remains pending or unresolved

#### Scenario: An earlier observation is redelivered

- **WHEN** the original execution command is redelivered after later state transitions under current ownership
- **THEN** its original reply is returned as duplicate and the current attempt state and revisions remain unchanged

#### Scenario: An execution command identity is reused with different content

- **WHEN** an existing execution command ID names a different run, attempt or fact
- **THEN** the request refuses as an identity conflict without changing state

### Requirement: Coordination uses the unified hints API

The coordinator SHALL rebuild CTT hints from versioned WBS facts and accepted outcomes.
It SHALL defer unfinished work rather than return successful no-op visitors. It SHALL use
ID-keyed summary and generation-checked settlement within the existing API, not require a
second public graph format. Complete WBS topology SHALL be discovered and validated before
admission; deferral SHALL NOT hide remaining vertices. Summary SHALL invoke no user code
and SHALL state incomplete discovery for a partial lazy graph. Host wait/running/retry
facts and WBS eligibility SHALL filter the kernel frontier before admission.

#### Scenario: Parallel join remains blocked

- **WHEN** backend and frontend are ready and backend alone reports accepted success
- **THEN** verification remains blocked until frontend also has accepted success

#### Scenario: A parent is deferred during inspection

- **WHEN** its declared child or a disconnected cyclic component is not yet inspected
- **THEN** discovery/validation continues independently and no incomplete summary authorizes work

#### Scenario: A stale settlement arrives

- **WHEN** a result belongs to an old runner or execution generation
- **THEN** settlement is refused without publishing output or satisfying a dependency

### Requirement: Admission and outcomes preserve exact authority

Admission SHALL atomically reserve capacity and record intent before external launch.
Claims, progress and release SHALL check exact current claim/run/attempt authority and
expected revisions. Validated outcomes and outbound WBS commands SHALL commit atomically
in RunStore. Successors SHALL wait for confirmed WBS acceptance. Effect success awaiting
its progress receipt SHALL be retained without rerunning the effect. Retries SHALL use a
new attempt ID/ordinal within a durable budget and keep the logical operation identity.

#### Scenario: Progress acknowledgement is lost

- **WHEN** WBS applied a success update but the coordinator died before saving the receipt
- **THEN** recovery reconciles the command receipt and never reruns the recorded successful effect

#### Scenario: Claim acceptance is unknown

- **WHEN** the exact conditional claim command is refused or its acceptance is unconfirmed
- **THEN** no activity turn is dispatched; preparation alone does not authorize execution and ambiguous acceptance remains pending for exact reconciliation

#### Scenario: A stale worker releases a claim

- **WHEN** a replacement attempt now owns the claim
- **THEN** the stale completion/release is refused and cannot affect the replacement

### Requirement: Restart reconciles surviving workers and uncertain effects

On boot the coordinator SHALL acquire or fence ownership before admitting work or changing
attempt states. It SHALL inventory running attempts, locate surviving workers/sessions and
reconcile effects by operation identity. It SHALL reattach safely or verify cancellation
and quiescence before replacement. It SHALL NOT infer interruption from coordinator death
alone. Unresolved worker/effect state SHALL require operator reconciliation and SHALL NOT
be automatically retried. Capacity SHALL remain reserved while physical work may survive.

#### Scenario: The worker survives coordinator death

- **WHEN** the coordinator restarts while its worker is still executing
- **THEN** it reattaches or quiesces that worker and admits no concurrent replacement

#### Scenario: An external effect cannot be determined

- **WHEN** launch or effect completion is ambiguous and the executor cannot inspect or deduplicate it
- **THEN** the attempt becomes unresolved, preserves its evidence and awaits an operator

#### Scenario: The local owner is stale

- **WHEN** another coordinator holds a newer local ownership epoch
- **THEN** the old owner cannot admit work or commit/release protected local state

#### Scenario: The receiver grant or exact claim is stale

- **WHEN** a new, unaccepted conditional WBS mutation carries a superseded receiver generation or a claim different from the current exact immutable binding
- **THEN** WBS refuses its protected write or release, even if local ownership is current
- **AND** historical exact replay of an already accepted command, after current authorization checks, returns its retained receipt without new effects or granting current authority
- **AND** takeover or claim absence establishes neither worker quiescence nor permission to replace it

### Requirement: Human waits and execution outcomes remain distinct

The coordinator SHALL persist human prompts, correlation keys and allowed response shapes,
consume authorized decisions through a deduplicated inbox and retain the configured claim.
Waiting SHALL NOT satisfy a dependency. Compute capacity SHALL be released only after
physical execution settles. End-of-turn SHALL NOT itself mean business success.

#### Scenario: A decision is delivered twice

- **WHEN** the same authorized response arrives before and after restart
- **THEN** it is consumed once and launches at most one logical continuation

### Requirement: Distinct human waits carry distinct correlation keys

Each distinct wait within an attempt SHALL have a fresh correlation key. Retrying a
consumed decision SHALL return its original continuation acknowledgement without changing
the current wait, state or capacity.

#### Scenario: An attempt waits again

- **WHEN** an attempt resumes from one wait and later records another wait
- **THEN** the later wait uses a fresh correlation key, redelivery of the first decision does not satisfy it, and a new command trying to reuse the first wait's key is refused

### Requirement: Safe compatibility execution precedes deployment and dogfood

S7a SHALL implement the abstract-port coordinator over a linear compatibility workflow,
including surviving-worker, uncertain-effect, stale-owner, stale-claim and lost-receipt/reply tests, before
I5.02 deployment or I5.04 real dogfood. S7b SHALL reuse it for pinned type-specific instances,
parallel joins and repair. W0–W12 SHALL remain the acceptance scope for type-specific DAGs.
A linear dogfood SHALL NOT be presented as completion of that product scope.

#### Scenario: Coordinator code or its baseline recovery proof is missing

- **WHEN** deployment or real dogfood is requested
- **THEN** its S7a prerequisite is unmet and the milestone cannot be declared ready

#### Scenario: A branching workflow is repaired

- **WHEN** an operator approves a new execution epoch for one changed activity
- **THEN** affected downstream results are invalidated with provenance retained, and old outcomes cannot complete the repaired join

### Requirement: Sender authority history preserves exact local provenance

RunStore SHALL retain an immutable receiver pin and exact canonical authority intents before dispatch. One command may remain pending per scope. Acceptance SHALL retain its exact intent and artifact link; exact duplicate replies SHALL remain immutable after current-owner validation. A local epoch SHALL remain distinct from receiver authority generation.

#### Scenario: A replacement owner records a late acceptance

- **WHEN** a current owner records verified acceptance of an intent staged in an older local epoch
- **THEN** the acceptance remains inspectable history and does not establish the replacement owner's grant
- **AND** only an accepted acquisition staged in the current local epoch may establish that epoch's historical mapping

#### Scenario: A current-epoch intent has a different local owner label

- **WHEN** a retained current-epoch intent owner label differs from the owner retained in the admitted OwnershipStatus
- **THEN** inspection and mutation throw before returning history
- **AND** different local and receiver owner labels remain valid

#### Scenario: Retained staged ownership epochs move backwards

- **WHEN** a later staged intent has a lower local epoch than its preceding staged intent
- **THEN** inspection, current-owner mutation and reopen throw without changing retained history
- **AND** late acceptance of an older intent remains valid when staged epochs themselves do not regress

#### Scenario: An unresolved authority command is followed by another

- **WHEN** a different authority command is staged while one remains unresolved in the scope
- **THEN** it is refused without replacing the retained intent
- **AND** timeout, receipt absence or later refusal does not clear or expire that intent

#### Scenario: A runtime history family disappears

- **WHEN** trusted runtime rows, links, consecutive revisions or required retained counts disagree
- **THEN** inspection and mutation throw before reporting absence or an uninitialized scope

### Requirement: RunStore opens complete named physical formats

SQLite RunStore SHALL preserve the original migration identities and bootstrap the complete ordered schema3 bundle atomically. Opening SHALL validate complete bundle identity, required markers and the entire physical schema, including empty tables. Opening SHALL NOT create, repair or upgrade an older format.

#### Scenario: An older store is opened by the schema3 adapter

- **WHEN** a genuine format1 or format2 store reaches the schema3 opener
- **THEN** compatibility inspection rejects it before mode-changing configuration
- **AND** its bytes, declarations and retained records remain unchanged

#### Scenario: An intermediate bootstrap statement fails

- **WHEN** an ordered complete forward statement fails during bootstrap
- **THEN** bootstrap stops, throws and leaves neither a published store nor staging
- **AND** physical reference construction follows the same fail-fast statement contract

#### Scenario: Runtime history reaches the original authority migration down script

- **GIVEN** the complete installed format was validated and the caller executes trimmed complete statements in order within an explicit transaction, rolling back and throwing on the first error
- **WHEN** a pin, intent, acceptance, invalid required schema2 metadata or inconsistent retained count exists
- **THEN** the0002 authority down script refuses before deleting runtime history
- **AND** only an unused consistent reverse restores the original schema and records

### Requirement: Verified sender history reads complete retained receipt artifacts

Application acceptance and history reads SHALL read actual artifact bytes, validate strict UTF-8 and the complete existing receipt schema, and match the exact retained canonical request with an independently computed digest. Async validation SHALL occur outside SQLite transactions. Raw persistence SHALL document this trusted precondition; correspondence SHALL NOT imply authenticity or current permission.

#### Scenario: A receipt is valid but belongs to another request

- **WHEN** a retained artifact has valid wire shape but differs in scope, ledger, command, digest or request-derived acceptance
- **THEN** verified acceptance and history inspection throw without recording a local acceptance

#### Scenario: A compatible receipt adds wire fields

- **WHEN** a retained receipt adds fields ignored by the existing public response schema and all known fields and correspondence validate
- **THEN** verified acceptance and history reads preserve that response compatibility
- **AND** strict local persistence records do not gain unknown fields

#### Scenario: Caller input changes during artifact verification

- **WHEN** caller-owned guard, intent or reference values change after submission and before verification returns
- **THEN** the verified operation retains and submits only its original detached snapshot

### Requirement: Portable executor replies preserve complete immutable observations

Dash SHALL validate and detach every TurnReply variant, complete identity, text, finish and
measured or named unknown usage. Its portable codecs SHALL share the original scalar codec
instances without runtime imports from aggregate attempt codecs or live executor controls.

#### Scenario: A reply is serialized and the caller changes its source

- **WHEN** completed, not_started or unresolved reply content is validated and serialized
- **THEN** complete correlation and usage round-trip without caller aliasing or freezing caller input
- **AND** unknown nested fields, unsupported variants and unsafe counts throw

### Requirement: Preparation pins an observed target before the complete locator

An Attempt2 SHALL begin queued and retain one immutable PreparationIntent before a complete
ExecutorLocator. Verified preparation SHALL recover accepted manifest bytes, select through
Burokrat and match its executor-kind version pin and actual retained WBS target artifact.

#### Scenario: A locator or preparation lacks its prerequisite

- **WHEN** a locator precedes preparation or any manifest, selection, executor version, preparation, operation or target identity differs
- **THEN** recording refuses or trusted malformed state throws without history or reservation changes
- **AND** selection, target mapping and version pin confer no eligibility or execution permission

### Requirement: Exact claims couple scope and attempt history atomically

Dedicated claim stage and acceptance SHALL commit the runtime scope event, its count, the
attempt transition and original paired acknowledgement in one provider transaction. Claims
SHALL preserve exact step, parent, execution and receiver-generated IDs without local-ID
truncation. Claim acceptance SHALL reuse the staged grant rather than advance authority.

#### Scenario: Either half of a claim transaction fails

- **WHEN** an actual write fault aborts stage or acceptance before COMMIT
- **THEN** neither scope nor attempt half, counter, revision or reservation change is visible after reopen

#### Scenario: A fresh observation updates a claim basis

- **WHEN** verified fresh evidence supplies a newer basis before claim staging
- **THEN** only basis and observation evidence may differ from the immutable preparation target
- **AND** changed scope, ledger, work item, step ID, step code or parent claim refuses

### Requirement: One pending scope command has no incidental clearance

Authority and claim commands SHALL share the existing single pending slot. Absence, refusal,
timeout, cancellation and changed basis or generation SHALL NOT clear, replace or expire it.
Only the dedicated verified recovery closure specified below SHALL clear an uncertain
original command through accepted-receipt reconciliation or fenced nonacceptance.

#### Scenario: Pending acceptance cannot be established

- **WHEN** the exact pending command has no accepted receipt and no committed verified recovery closure
- **THEN** later commands remain refused and uncertainty may remain indefinitely

### Requirement: Coupled command replay returns its original paired acknowledgement

All version2 execution families SHALL share the existing store-wide local command namespace.
Current owner validation and complete history audit SHALL precede identity lookup. Exact
replay SHALL return the retained original reply before stale revision checks without
restamping its provenance. A wire claim command SHALL have exactly one local stage and
one local acceptance association.

#### Scenario: A replacement owner replays old exact commands

- **WHEN** a current owner submits the original local identity and immutable payload with stale revisions
- **THEN** the original scope and Attempt acknowledgement is returned unchanged
- **AND** changed family, payload, run, attempt, scope or second local association refuses

### Requirement: Turn intent requires current attachment and exact claim history

Turn staging SHALL derive the full locator, ClaimRef and current grant from one consistent
transaction after readiness, exact cause, current ownership, current session attachment and
no-pending checks. Observations SHALL retain the entire reply and match a retained turn.

#### Scenario: An old opened locator is recorded after takeover

- **WHEN** the current owner retains the old preparation owner's late opened locator
- **THEN** its attachment retains the old provenance and cannot admit a new current-owner turn
- **AND** current grant acquisition alone does not change the attachment

#### Scenario: A session is reattached with an unresolved turn

- **WHEN** supported backend evidence reattaches the identical complete locator
- **THEN** the pending request and unresolved wrapper remain unchanged except attachment provenance
- **AND** neither reattachment, cancellation nor a stored locator establishes nondispatch or quiescence

### Requirement: Exact observations resolve only their pending recovery checkpoint

An actual exact opened observation SHALL resolve preparing, directly or inside reconciling/unresolved, to prepared with the preparation owner's attachment. Exact verified claim acceptance SHALL resolve only the identical pending claiming checkpoint, directly or inside those wrappers, to ready(initial) with the entire unchanged session and attachment. Exact completed/not_started turn replies SHALL resolve only their retained turn_pending checkpoint; an unresolved reply SHALL keep that pending checkpoint and full observation. All earlier observations and held capacity SHALL remain retained. No such fact SHALL establish a live session, quiescence, release or permission to dispatch.

#### Scenario: An exact late observation supplies the missing pending outcome

- **WHEN** its complete identity matches the preparation, pending claim or retained turn through either recovery wrapper
- **THEN** the matching checkpoint advances exactly once with original provenance and earlier history preserved
- **AND** a different checkpoint, changed identity or post-settlement fact refuses; reattachment alone keeps an unresolved wrapper

### Requirement: Continuations preserve execution context and key identity

Decision consumption SHALL resume the identical session and claim with the exact decision
cause and atomically reacquire capacity. A not_started observation SHALL retain the original
key and payload in history even when it returns ready. Claimed retries SHALL remain refused
until the separate exact release protocol exists.

#### Scenario: A not_started key is submitted again

- **WHEN** a new local command stages a previously not_started turn key
- **THEN** identical full intent may be staged from its exact ready cause
- **AND** any changed payload under that key refuses; uncertain or completed history never resets to initial

### Requirement: One combined audit reconstructs complete execution history

Reads, replay, mutation and reopen SHALL share consistent runtime folds, complete attempt
folds and a bidirectional claim-link audit without recursive readers. Every execution,
consumption, completion and receipt transition SHALL have its true predecessor, consecutive
revision and original reply checked. Preparation SHALL NOT predate admission ownership, claim staging SHALL NOT predate its retained attachment ownership, and retained same-epoch stage/attachment or reattachment labels SHALL agree. These relative local checks SHALL preserve genuine late observations and SHALL NOT claim historical lease authenticity. Required indexed history SHALL NOT disappear behind
a reset current projection.

#### Scenario: A retained event or paired reply is changed

- **WHEN** rows, keys, counts, ordering, cross-links or original acknowledgements disagree
- **THEN** inspection, replay, current-owner mutation and reopen throw before reporting absence
- **AND** coherent deletion or rewriting of every independent retained fact remains outside this local integrity guarantee

#### Scenario: Completion history outlives its current reply

- **WHEN** a completion is followed by its receipt or owner takeover and the original completion is replayed
- **THEN** retained history still exposes the original applied outcome-pending reply while commitOutcome returns the current Attempt under its existing duplicate contract
- **AND** a changed original reply, revision, physical identity, gap or illegal late event throws during complete reconstruction

### Requirement: Verified execution history consumes actual retained evidence

Verified helpers SHALL snapshot before awaits, read actual artifacts, use the existing WBS
state and receipt schemas and complete matcher, and compare generated claim projections
against freshly verified receipt bytes. Raw persistence SHALL document its verification
precondition. No async artifact work SHALL occur inside SQLite transactions.

#### Scenario: Local projection coherently changes a generated claim ID

- **WHEN** raw local shape and request-known fields still validate but actual retained receipt bytes name a different claim ID
- **THEN** verified history throws rather than accepting the forged projection
- **AND** compatible added wire fields remain accepted by the existing public schema

### Requirement: Changed execution records have explicit portable and adapter versions

Attempt, RunSnapshot, execution commands and generic local completion delivery records
SHALL retain their existing version2 meanings and original replies. Recovery-capable
SQLite SHALL use a complete named additive format4 bundle, preserve the complete format3
identity and every0001–0003 migration byte, and expose changed recovery records through
explicit successor versions. Generic local completion SHALL NOT imply exact WBS write,
release, successor readiness or retry permission.

#### Scenario: Genuine older stores or populated reverse reach format3

- **WHEN** a genuine format1 or2 store is opened
- **THEN** read-only inspection rejects it before WAL or byte changes
- **WHEN** complete prevalidated format3 is reversed in one fail-fast explicit transaction
- **THEN** any attempt, execution, consumption, completion, receipt or non-authority runtime history refuses before mutation
- **AND** compatible generic runs and authority-only history may reverse to exact version2 and its known bundle hash

### Requirement: History foundation does not certify external action ordering

This phase SHALL NOT call executor open/turn or WBS transport. Parent dispatch acceptance
SHALL require the later production host to prove preparation COMMIT, open, complete locator
COMMIT, exact claim stage/send/acceptance and turn-intent COMMIT before turn.

#### Scenario: History tests pass without a production host

- **WHEN** both stores and verified application operations pass their bounded conformance
- **THEN** source history acceptance may proceed while parent6a.5, crash ordering, other adapters and full gates remain open

### Requirement: Scoped execution retains independent historical context

Each scoped execution record SHALL retain the provider-observed scope revision independently
from its generated acknowledgement. Reconstruction SHALL use that complete historical prefix
and retained owner provenance, enforce causal lower bounds and compare the original reply.
Exact replay SHALL preserve context without comparing it to current retry revisions.

#### Scenario: A turn reply substitutes an older same-epoch grant

- **GIVEN** claim acceptance at scope revision4 and later accepted acquisition B at revision6
- **WHEN** a turn recorded with context6 is coherently changed only in its reply/current projection to name earlier grant A
- **THEN** read, replay, mutation and reopen reject the reply against the independently retained context
- **AND** a valid original turn recorded at4 remains valid after scope advancement or takeover

#### Scenario: Scope context violates a pending or causal boundary

- **WHEN** a turn's retained scope prefix has a pending command, precedes its exact claim acceptance or moves backward from its attempt's prior scoped observation
- **THEN** complete history reconstruction throws
- **AND** coherent rewriting of context and all independent contradictory history remains outside this local consistency guarantee

### Requirement: Provider bundle close has observed completion

Provider bundles SHALL expose close(): Promise<void> outside semantic ports. Close SHALL fence new/queued work immediately, drain admitted work under existing rules, then release resources before fulfilling. Repeats SHALL share one disposal/outcome. Failure SHALL keep ports fenced and reject with its original cause on every close call without retry. Callers SHALL await completion before reopening, deleting storage or reporting graceful shutdown.

#### Scenario: Close starts while a writer executes and another operation waits

- **GIVEN** a real SQLite writer has passed the close fence and is blocked by an independent write lock, with another operation queued behind it
- **WHEN** close is invoked and the independent writer releases its lock
- **THEN** the executing operation may commit, the queued operation rejects as closed without starting a transaction, and close fulfills after drain and native disposal

#### Scenario: Calls arrive immediately after close invocation

- **WHEN** valid run and artifact operations are invoked after close starts but before it settles
- **THEN** they reject through existing lifecycle checks and publish no changes

#### Scenario: An admitted operation exhausts its contention budget

- **WHEN** the independent write lock remains held after close begins until the existing retry budget is exhausted
- **THEN** the operation preserves its contention failure, queued operations reject as closed and close disposes after drain

#### Scenario: Repeated close overlaps delayed completion

- **WHEN** close is called twice while admitted work is settling
- **THEN** both calls share pending completion, native disposal happens once and fixture storage remains until successful completion

#### Scenario: Native disposal fails

- **WHEN** production adapter disposal throws a particular native error
- **THEN** close rejects with that same error, both ports remain fenced, later close retains that rejection without another native attempt, and fixture storage is not removed

#### Scenario: Memory owns no physical resource

- **WHEN** a memory bundle closes
- **THEN** synchronous publication and immediate fencing remain and every close returns successful Promise completion without requiring Promise object identity or claiming durability

#### Scenario: Semantic ports stay independent

- **WHEN** lifecycle-aware callers compile and portable-port import checks run
- **THEN** RunStore and ArtifactStore gain no connection management method or vendor type

#### Scenario: Existing guards remain effective throughout admitted drain

- **WHEN** close starts during an already-admitted operation's busy wait
- **THEN** that operation may finish before physical disposal under unchanged current-owner, fresh-clock and transaction checks, replacing the former immediate physical-close behavior without authorizing queued work

#### Scenario: Close wrappers return different Promise objects

- **WHEN** repeated close calls return different Promise objects representing the same disposal
- **THEN** conformance depends on shared disposal and completion/failure outcome, not Promise object identity

#### Scenario: A fixture close throws synchronously

- **WHEN** a Promise-typed fixture close throws before returning and other fixtures remain open
- **THEN** cleanup attempts every peer, awaits every settlement and reports all original causes without reporting failed disposal as successful release

### Requirement: Logical recovery retains complete trusted values and evidence

Authority and claim recovery SHALL retain an immutable recovery journal and complete
versioned scope and execution witnesses. Its semantic mutation surface SHALL comprise
beginRecovery, stageRecoveryFence, recordRecoveryFence and resolveRecovery. Application
helpers SHALL detach guards before the first await and discovered journals before verification IO, read actual envelope/body artifacts through
their byte and public-schema owners, and derive receiver-generated claim identities from
the actual matching receipt. Synchronous persistence SHALL validate locked correspondence
between those trusted values, retained requests, guard, target and references without
artifact or network IO. Typed values and references SHALL NOT establish authenticity.

#### Scenario: Journal discovery fails before original intent is available

- **WHEN** the initial scope read fails or no supported journal/original can be discovered
- **THEN** an ordinary discovery Error names recoveryId and scope and retains the original read failure cause
- **AND** no RuntimeIntent or successful/pending outcome is invented; after discovery, unexpected failures use the correlated RecoveryDispatchError

#### Scenario: Claim recovery verifies its complete execution history

- **WHEN** the helper discovers a claim journal
- **THEN** it requires the existing readManifest capability and uses the complete verified execution-history reader before sending, while preserving submitted guards across that IO

#### Scenario: Capture failure already crossed the RuntimeClient boundary

- **WHEN** RuntimeClient classifies a clone/body-read failure as transport with its original cause
- **THEN** the helper preserves that transport observation and leaves the journal unresolved, subject to the third-POST exhaustion rule
- **AND** helper-owned missing/mismatched validated capture, retention/read/integrity/schema/envelope failures throw correlated unexpected errors

#### Scenario: A stored projection keeps its reference but changes its value

- **WHEN** a locally well-shaped recovery witness coherently substitutes a claim ID, state value or receipt projection while retaining the original artifact reference
- **THEN** verified history independently rereads actual bytes and rejects the mismatch
- **AND** missing, unreadable, malformed, wrong-media or wrong-digest evidence throws without publishing a recovery mutation

#### Scenario: A claim is recovered from its actual receipt

- **WHEN** verified accepted-claim recovery constructs the stored claim command
- **THEN** its claim ID, actor and resulting basis come from the actual receiver receipt and the acceptance command ID comes from the retained journal
- **AND** neither SQL nor a caller-supplied boolean fabricates those values

### Requirement: Recovery kind and current authority agree with the retained target

Every recovery operation SHALL compare its authority or claim discriminator with the
retained target under lock. Claim calls SHALL match run, attempt, scope and original stage
and session; authority calls SHALL carry only their scoped runtime guard. Current resolver
ownership, independent recovery revision and complete catalog audit SHALL precede fresh
publication. Legitimate immutable replay SHALL retain original provenance.

#### Scenario: A caller presents a claim guard for an authority journal

- **WHEN** a recovery call changes its kind, retained target, run, attempt, scope, original command or command namespace
- **THEN** the provider refuses or rejects malformed trusted state without journal, scope, attempt or capacity changes

#### Scenario: Safe evidence advances a guarded revision during remote lookup

- **WHEN** safe retained evidence advances a submitted run, attempt or scope revision while recovery awaits its receiver observation
- **THEN** resolution preserves the submitted guard and refuses the stale revision without clearing the journal or capacity
- **AND** a new explicit invocation may inspect state and provide current guards; the helper does not silently refresh after lookup

### Requirement: Beginning recovery interlocks fresh mutations without suppressing replay

Begin SHALL publish exactly one active journal for the exact current pending request and
SHALL NOT advance scope revision. Acceptance committed first SHALL make fresh begin refuse;
begin committed first SHALL block fresh ordinary acceptance and target checkpoint, attachment,
settlement, receipt or decision-consumption changes. Existing operation-specific immutable
replay SHALL retain priority over those fresh interlocks. Safe evidence retention, unrelated
work, ownership renewal and artifact retention SHALL retain their existing semantics.

#### Scenario: Acceptance and begin race through independent SQLite connections

- **WHEN** acceptance wins the actual transaction order
- **THEN** begin refuses and no active recovery journal is published
- **WHEN** begin wins
- **THEN** fresh acceptance and target mutations refuse while exact historical retries retain their original acknowledgements
- **AND** existing pending-stage guards remain installed

### Requirement: Recovery fences are staged, immutable and bounded

Each recovery POST SHALL follow durable staging of its exact canonical bytes and identity.
Only the recovery helper MAY retransmit identical retained fence requests after uncertain
delivery; ordinary duplicate senders SHALL remain lookup-only. A journal SHALL retain at
most three fence identities and one immutable observation per fence. Each invocation SHALL
make at most three POSTs. Supersession SHALL require an observed later receiver state and
subsequent exact absence lookup of the prior fence, with complete dependency correspondence.

#### Scenario: A crash occurs before sending or after remote acceptance

- **WHEN** recovery resumes after a staged fence whose delivery or acknowledgement is uncertain
- **THEN** it uses the identical retained fence identity and bytes rather than manufacturing another payload
- **AND** the recorded observation is discovered after reopen

#### Scenario: The per-call POST budget is exhausted

- **WHEN** recovery cannot converge within three POSTs
- **THEN** the invocation throws a correlated bounded-exhaustion error while the journal remains unresolved and capacity remains reserved
- **AND** no fourth identity or POST is emitted and no ordinary pending request is implicitly resent
- **AND** a transport failure on the third actual POST throws exhaustion with its original cause; earlier transport failures remain pending, cancellation stays controlled, and a normally accepted third POST can resolve
- **AND** an accepted third fence with a lost reply can resume by exact retransmission, while three durable conflicts may remain permanently unresolved under the global identity cap

### Requirement: Ordered dominating fences precede original receipt interpretation

An accepted recovery fence SHALL match the original ledger and scope and SHALL exceed the
original expected or guarded receiver generation. Accepted original authority additionally
SHALL have an accepted generation strictly below that fence. Below-threshold state, missing
evidence, conflicts and refusal SHALL NOT establish nonacceptance. The original lookup
SHALL be freshly captured only after the helper awaited committed verification and recording
of that accepted fence; callers SHALL NOT substitute an earlier404 or an invented exchange.

#### Scenario: An original request expects a future generation

- **GIVEN** the original expects generation2 while the receiver is at1
- **WHEN** a naive acquisition reaches2 and an original lookup is absent
- **THEN** that pair is insufficient for nonacceptance because the delayed original could still accept at3
- **AND** supported resolution requires a valid observed basis and accepted fence strictly above the original threshold, with the original receipt lookup ordered after its committed observation

#### Scenario: An earlier404 is supplied after a fence

- **WHEN** an earlier original lookup envelope names stale or mismatched recovery, ordinal, request, scope, ledger or observation associations
- **THEN** the locked correspondence check rejects it without publishing closure
- **AND** the private helper constructs and captures its fresh original lookup only after awaiting the real committed observation acknowledgement
- **AND** stored context links cannot distinguish a fully fabricated earlier body naming identical later links and do not prove transport authenticity, chronology or physical quiescence

### Requirement: Closure publishes one complete plan from one valid predecessor

Resolution SHALL plan all original acceptance, execution, barrier, hold, journal, count,
revision and active-index changes from one valid locked predecessor. Accepted originals
SHALL occupy scope cut n+1 and their barrier n+2; fenced nonacceptance SHALL publish the
barrier at n+1. Providers SHALL apply that complete plan in one transaction without nested
public persistence calls or complete-history audits between partial writes.

#### Scenario: A late SQL fault follows original acceptance or hold publication

- **WHEN** an actual trigger aborts after original acceptance or barrier/hold writes but before closure, index and count finalization
- **THEN** rollback and reopen expose the exact complete predecessor rows, history, revisions, active index and reserved capacity
- **AND** removing the injected fault permits only the complete final catalog to become visible

### Requirement: Published catalogs and historical scope prefixes have distinct invariants

Every published current recovery-capable scope SHALL expose complete journals, witnesses,
active identity and generation floor. Its active index SHALL identify exactly each open
journal whose original is still current pending. Private historical prefix reconstruction
SHALL omit current activity fields, retain full reciprocal witnesses and apply a barrier
only when its scopeAfter is within the cut. Missing counted families SHALL throw.

#### Scenario: An accepted original exists at the virtual intermediate cut

- **WHEN** an old execution reply is reconstructed at n+1 of an accepted recovery closure
- **THEN** original acceptance and its exact grant or ready acknowledgement are visible under their original provenance while the n+2 barrier is not yet applied
- **AND** the current active-index invariant is not applied to that private prefix
- **WHEN** the final current scope is read
- **THEN** the barrier has cleared its grant, raised the floor and closed the active journal

### Requirement: Claim closure retains explicit holds and capacity

Accepted claim closure SHALL retain the real receipt-derived binding and original ready
Attempt2 acknowledgement, then publish a distinct accepted recovery hold as Attempt3.
Fenced nonaccepted claim closure SHALL retain its exact claiming checkpoint in a nonaccepted
Attempt3 hold without inventing a binding. Both SHALL retain capacity. New reads SHALL use
explicit successor envelopes; old Attempt2 decoders and stored replies SHALL remain exact.

#### Scenario: Same or replacement resolver closes a pending claim

- **WHEN** an accepted or fenced-nonaccepted claim is resolved under the same or a later live resolver epoch
- **THEN** scope, run and attempt revisions advance by their exact planned cuts, original intent and attachment provenance remain unchanged, and reserved capacity remains held
- **AND** generic fresh mutations, turn dispatch, retry, release or replacement cannot treat the hold as settled work

### Requirement: Explicit additive upgrade preserves genuine populated histories

Recovery-capable SQLite SHALL preserve all format3 records, artifacts, old replies, indexes
and earlier migration identities through an explicit atomic upgrade with a complete new
named bundle. Ordinary open SHALL NOT create, migrate, normalize or repair predecessor
state. Forward and adjacent down SQL SHALL execute fail-fast inside admitted transactions.
Unused successor down SHALL preserve populated predecessor attempts, execution and outcome
histories while restoring exact format3 identity. Used recovery or successor-only records
SHALL refuse destructive reversal before mutation.

#### Scenario: Genuine populated format3 is adopted and unused recovery reversed

- **WHEN** a pinned predecessor executable created real admissions, executions, claims, decisions, outbox, receipts, artifacts and owner/clock histories before explicit upgrade
- **THEN** upgrade preserves every old stored value and byte identity while adding only the new format metadata and empty recovery families
- **WHEN** the fully validated successor is reversed before any recovery history or Attempt3 exists
- **THEN** exact predecessor schema and bundle identity are restored with all populated old histories intact
- **AND** any late upgrade/down failure rolls back the complete transition

### Requirement: Legacy writers obey the selected compatibility boundary

Actual already-open, locally queued and BUSY predecessor writers SHALL encounter the changed
complete bundle identity under the existing write lock before execution, ownership or history
mutation. Compatible immutable artifact retention and monotone refused-call clock observations
MAY continue under their existing checks. Ordinary old-open SHALL reject the successor before
configuration changes. Local disposal SHALL NOT be described as host-wide process exclusion.

#### Scenario: A genuine old executable writes across committed upgrade

- **WHEN** pinned old code loaded its predecessor constants and queued or contended before upgrade committed
- **THEN** its consequential execution, ownership, claim, outcome, reservation and outbox writes refuse after acquiring the post-upgrade lock
- **AND** only the declared artifact or monotone clock exceptions may change their specific rows, with their effects and subsequent new-reader behavior verified
- **AND** breaking the new bundle-publication dependency must expose unsafe admitted old work without removing any inherited old guard

### Requirement: Logical closure grants no physical continuation or full coordinator completion

The first recovery packet SHALL reject write targets. Logical authority/claim closure SHALL
NOT establish worker death, effect absence, quiescence, exact release, replacement or business
completion. Complete write/outbox recovery, supported physical continuation, producer budgets,
remaining adapters, second-provider proof and S7a SHALL remain explicit parent requirements.

#### Scenario: Authority and claim recovery tests pass

- **WHEN** both providers and real receiver tests pass this logical packet
- **THEN** only its authority/claim recovery requirements may be credited
- **AND** parent full-recovery and S7a tasks remain open until their remaining behavior and proofs are implemented
