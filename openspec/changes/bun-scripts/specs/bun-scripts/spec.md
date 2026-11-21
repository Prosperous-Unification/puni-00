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
