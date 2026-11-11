## ADDED Requirements

### Requirement: The inventory accounts for executable first-party scripts and their consumers

The migration SHALL inventory executable entrypoints, generated/embedded script bodies and active package/Nx/CI/container/infrastructure/runbook callers. Each entry SHALL name runtime, owner, client exposure, replacement and verification. Historical/browser/configuration classifications SHALL be explicit. Unknown extensions or new directories SHALL NOT hide executable first-party scripts.

#### Scenario: An unclassified entrypoint prevents acceptance

- **WHEN** a first-party shell or Node entrypoint or generated script is introduced through a new path, package command or CI consumer
- **THEN** acceptance refuses and names the unclassified executable/consumer rather than accepting the existing inventory count

### Requirement: First-party script logic executes on Bun

First-party script and test-orchestration logic SHALL run on Bun with explicit argv, replacing shell/Node implementations rather than wrapping them. This includes gates, CI/dev operations, remote payloads and generated helpers. Bun-supported standard-library imports SHALL NOT imply a Node executable dependency. Third-party tools, declarative configuration and immutable historical artifacts remain outside conversion.

#### Scenario: Converted operations run without shell or Node dispatch

- **WHEN** a converted operation executes from a path containing spaces with quoted/metacharacter arguments and no shell or Node executable available
- **THEN** it retains its expected output and effects without evaluating those arguments as code

#### Scenario: Adversarial fixture bytes do not become active scripts

- **WHEN** a trust test supplies historical or hostile shell/Node bytes as a modeled specimen
- **THEN** Bun test orchestration verifies their detection or historical compatibility without classifying a whole fixture directory as exempt or shipping the specimen as an active client implementation

### Requirement: Client operations are embedded in the PUNI CLI

First-party operations advertised to clients, emitted into their integrations or shipped as executable toolkit assets SHALL execute through the owning PUNI namespace from the installed artifact. Internal automation performing those operations SHALL share their implementation. Client coverage SHALL be demonstrated against concrete advertised and generated entrypoints rather than inferred from the root executable's existence.

#### Scenario: A client operation has no hidden checkout script dependency

- **WHEN** a documented client operation and a generated integration execute from the installed package outside the checkout
- **THEN** both reach the embedded operation with Bun, and removing a required packaged asset makes the covering operation fail

### Requirement: Gate and deployment safety remains enforced after conversion

Converted gates/deploys SHALL retain host admission/locking, bounded waits, exact-SHA checkout under lock, frozen dependencies, full checks, dirty-tree/mode refusals, full migration-ledger capture, ownership, cancellation/signals, cleanup and exit contracts. Missing tools or malformed/unreadable trusted state SHALL fail. Required runtime/recovery evidence SHALL NOT be replaced by an unverified result.

#### Scenario: Contending gates cannot check out outside admission

- **WHEN** a converted gate runs while another holder owns admission, or receives a different requested SHA or dirty gate tree
- **THEN** it preserves the specified queue/refusal behavior and only checks out and reports the verified SHA while admitted

#### Scenario: A converted deploy aborts with the full ledger restored

- **WHEN** a controlled ordinary additive deploy fails after applying migrations, including a failure injected into rollback
- **THEN** it reverses exactly the captured additions and compares the full original name/hash ledger, or reports rollback failure loudly with the pinned manual completion command

#### Scenario: A stop-the-world window restores its snapshot and matching code

- **WHEN** a controlled approved stop-the-world migration window fails after applying its non-additive migration
- **THEN** writers remain excluded while the verified snapshot and matching previous code are restored in the specified order, using its documented window recovery rather than ordinary additive reversal, and recovery failure is reported loudly

### Requirement: Every changed guard has observed failure evidence

Each changed safety check SHALL have a negative test through its production call path, observed failing with the check removed or dependency broken, plus an adjacent `Proof:` comment and verification receipt naming the fault/test/outcome. A language port SHALL NOT reduce existing behavior tests to source-text matching or treat an exit code as proof beyond the invoked tool's contract.

#### Scenario: A removed production guard is detected

- **WHEN** a converted guard is removed or its guarded dependency is deliberately broken
- **THEN** its named production-path test fails, and restoration makes that test pass before acceptance

### Requirement: Foreground lock operations share a typed installed Dash owner

The installed PUNI CLI SHALL provide `puni dash ops lock status` and `puni dash ops lock run ... -- <argv...>` through the same typed Bun operation used by repository callers. Production SHALL select the canonical host lock without a caller-controlled pathname override. Status SHALL remain observational. An admitted run SHALL report arrival count and elapsed whole seconds before invoking its exact payload argv with caller cwd/environment and native stdin/stdout/stderr.

#### Scenario: Admission precedes an uninterpreted payload

- **WHEN** an admitted installed lock operation runs a payload whose arguments contain spaces, empty values and shell metacharacters
- **THEN** admission reporting precedes payload entry, the arguments remain exact, the native mutex remains held through foreground completion and cleanup, and the operation preserves the payload exit/signal status

#### Scenario: A holder-targeted signal preserves foreground settlement

- **WHEN** SIGINT or SIGTERM reaches a queued or active foreground lock owner
- **THEN** queued work withdraws without payload entry, while already entered foreground work settles under ownership before the owner returns the first interruption status; the owner does not infer descendant absence from leader or holder death

#### Scenario: Detached compute retains its independent owner

- **WHEN** a Dash frontend ends while its existing detached hold-file owner still protects admitted compute or watch settlement
- **THEN** frontend death does not release that hold, and explicit holder death remains lost authority rather than proof that compute descendants ended

#### Scenario: Native wait failure retains unconfirmed authority

- **WHEN** native wait failure cannot confirm foreground termination
- **THEN** the owner reports that unconfirmed state within its diagnostic budget and retains its queue callback, native lock, listeners and referenced wait until trustworthy termination or operator intervention; neither cancellation nor the wait failure itself produces successful completion or automatic release

#### Scenario: Repository compatibility decoding enters the same bounded owner

- **WHEN** the Bun compatibility entry receives exactly status or -- followed by payload argv
- **THEN** it decodes once to the installed Dash lock request, preserves literal payload argv and optional unset/empty legacy queue defaults, selects the same canonical mutex, and reports decoding failures through the bounded native owner
- **AND** wait seconds are canonical nonnegative safe decimal integers, while poll seconds are canonical decimal integers from one through thirty; malformed arithmetic expressions are refused with usage status without quoting operand text

#### Scenario: Refusal identifies its observed contention

- **WHEN** admission refuses after its wait budget
- **THEN** a refusal behind earlier tickets names their captured labels and PIDs, explicitly describing vanished tickets, while a refusal with no earlier ticket reports the observed holder record or its unknown publication state
- **AND** diagnostic observations confer no proof of current native ownership; unreadable or malformed trusted state remains a failure

### Requirement: Durable host holders survive their frontend

Dash's durable host hold SHALL use a fixed private versioned operation in the selected protected installed PUNI artifact. The controller SHALL exclusively reserve one owner-only physical log generation and pass its immutable full PID/boot/start identity as typed operands. The child SHALL inherit that same descriptor for both outputs and publish its own complete immutable birth token before queueing. Diagnostic bytes and frontend liveness SHALL NOT establish ownership or authorize release.

#### Scenario: Ready and cancellation have one exclusive decision

- **WHEN** pending admission is cancelled while the child may enter the canonical mutex
- **THEN** controller cancellation and child readiness compete by exclusive publication of the same decision pathname, with their respective exact complete identities
- **AND** a cancellation winner withdraws promptly without accelerating the configured claim-poll interval, retains its decision until confirmed native child termination, and preserves the first timeout or interruption reason
- **AND** a Ready winner survives frontend interruption and death; the handoff additionally requires the matching live child birth, original token/readiness evidence and canonical holder PID/label

#### Scenario: The frontend dies before helper startup

- **WHEN** the frontend ends after reserving the physical log and spawning its selected helper, before that helper validates its inherited generation or publishes its token
- **THEN** the helper can finish starting and acquire ownership independently, using the pinned controller identity without requiring the controller to remain alive
- **AND** later release requires the existing compute-ledger authorization rather than frontend disconnection

#### Scenario: Uncorroborated readiness is bounded and retained

- **WHEN** a complete child Ready decision lacks the expected canonical holder PID or label through the admission observation deadline
- **THEN** acquisition refuses with an explicit unconfirmed retained state, without killing the Ready winner or removing its tokens or generation

#### Scenario: Native termination is independent from numeric wait status

- **WHEN** native termination is missing or erroneous, or the separately observed numeric wait status fails or contradicts an error-free native termination
- **THEN** numeric observation alone never grants cleanup authority or successful completion, and missing or erroneous native termination retains ownership and metadata
- **AND** an error-free native termination permits independently attempted authorized cleanup while numeric observation failure or contradiction still fails completion
- **AND** diagnostic reporting failure does not bypass that authorized terminal cleanup; every original observation, report and cleanup failure remains preserved

#### Scenario: A fast refusal ends before live token observation

- **WHEN** the selected protected helper publishes its complete token and exits before the controller can observe its live birth
- **THEN** cleanup may derive identity only from that helper's exclusively reserved unchanged initially empty physical generation after an error-free native-end notification, requiring the exact child PID/controller boot and any captured birth match
- **AND** cleanup preserves exact full token identity, inode and bytes; unrelated decisions, replaced known tokens or replaced/unreadable generations refuse and retain state
- **AND** this post-termination producer evidence never authorizes live admission or restart adoption

#### Scenario: Optional diagnostics become unreadable after handoff

- **WHEN** a correctly admitted holder's diagnostic bytes become unavailable
- **THEN** diagnostic access returns an explicit unavailable outcome while the native mutex continues protecting the work; diagnostic text never grants or withdraws authority

#### Scenario: A retained evidence failure settles only with authorization

- **WHEN** readiness or token evidence becomes malformed, replaced or unreadable while the child retains the native mutex
- **THEN** the child reports and retains that failure until verified absence of its original hold token or explicit native operator interruption permits settlement, then preserves the failure instead of returning success

#### Scenario: Two watchers record the same admitted guard

- **WHEN** a second watcher records the already recorded live guard with the same complete PID/boot/start identity and canonical mutex pathname
- **THEN** recording succeeds idempotently without replacing its original since time or releasing the shared admitted holder
- **AND** a different live identity or mutex remains a refused competing record

#### Scenario: New admission differs from legacy continuity

- **WHEN** a live previously recorded legacy guard still has its canonical PID/label but lacks the current complete Ready decision
- **THEN** existing admitted work retains its continuity assessment while new admission waits for a qualified current holder, and preparation rechecks current readiness before creating the job scope
- **AND** a different full Ready birth is refused as inconsistent trusted state; queued demand alone does not prevent retiring an unready legacy guard after all its existing compute settles

#### Scenario: Unready retirement preserves a crash-recoverable full identity

- **WHEN** a recorded legacy guard lacks current Ready evidence and has no unreleased admitted compute, even though work remains queued
- **THEN** the controller rechecks that condition inside the admission write fence, exclusively publishes a Retired decision naming the exact helper birth, and removes only its unchanged child hold token
- **AND** a competing Ready winner remains admitted; the child checks token withdrawal and Retired before publishing Ready, including immediate callback entry
- **AND** Retired remains available through confirmed helper termination and authorized physical cleanup

#### Scenario: Watch shutdown owns its pending handoff

- **WHEN** watch stops during queued acquisition or after the helper publishes Ready but before the parent records it
- **THEN** shutdown awaits controlled withdrawal or records the complete admitted Ready handoff before closing the ledger
- **AND** a Ready helper continues protecting its work after frontend exit; a later watcher can adopt it without a second helper or loss of its original record instant

#### Scenario: A dead guard does not settle compute

- **WHEN** the full recorded guard birth has ended while admitted compute remains charged
- **THEN** recovery commits first lost-authority attribution to every unreleased job before cleaning that guard generation, preserving every compute state and reservation
- **AND** the matching full database record remains until physical cleanup succeeds; afterward a replacement Ready guard may be recorded without claiming the old work has ended
- **AND** a zombie leader with surviving threads, unreadable inspection or a different current record does not authorize that cleanup

#### Scenario: Cleanup retains a final identity witness through failure and retry

- **WHEN** a qualified ended helper's log generation is cleaned and one cleanup step fails or the controller exits
- **THEN** cleanup removes the log before its final complete helper witness and retains that witness if a prerequisite fails
- **AND** restart can repeat the qualified cleanup using retained Ready, Retired or the original child hold; legacy log-only cleanup requires its matching dead database record under the write fence
- **AND** an unidentifiable log-only reservation remains visibly blocked; completed overlapping cleanup is tolerated only after confirmed termination and never weakens live handoff evidence

#### Scenario: A healthy queued helper retains its turn after frontend death

- **WHEN** the native helper is queued behind another canonical owner, its frontend ends, and queued demand remains while another watcher starts
- **THEN** the watcher retains that pending helper and its queue position without publishing retirement merely because its frontend ended
- **AND** after the blocker releases, the helper publishes Ready and the watcher records the same full birth; a pending generation with no remaining demand can instead be retired under the settled-release fence
