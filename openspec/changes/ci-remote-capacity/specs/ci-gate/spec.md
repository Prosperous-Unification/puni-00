## ADDED Requirements

### Requirement: Global scratch cleanup has a scoped finite allowance

The shared scratch preload SHALL allow its global afterAll 30000 ms while retaining ordinary command-line test deadlines, synchronous privacy-preserving start/return markers and the existing removal/error policy.

#### Scenario: Loaded cleanup exceeds ordinary test allowance

- **WHEN** the actual removal path takes longer than a smaller child command-line test budget but less than the explicit hook allowance
- **THEN** both file fixtures are removed and the hook passes
- **AND** deleting only the explicit allowance makes that replay fail
- **AND** an ordinary hung test still fails at the command-line deadline

### Requirement: Remote execution has exactly six fixed complete leaves

After immutable plan/head validation, CI SHALL partition canonical remote discovery into exactly six complete disjoint leaves: core model, model continuation, the existing seven-source owner, the inherited23 source-restoration singleton, the policy8 singleton and their exact complement. Logical ownership and canonical local/host execution SHALL remain unchanged.

#### Scenario: Fixed source owners retain exact membership

- **WHEN** the accepted source-restoration checkpoint is present
- **THEN** source retains exactly source-role-process.test.ts, source-inner-command.test.ts, source-inner-program.test.ts, source-inner-transport.test.ts, source-frontend-http.test.ts, source-frontend-profile.test.ts and source-readiness.test.ts
- **AND** source-restoration owns only `src/lib/dependency-source-restoration.test.ts`, policy restoration owns only `src/lib/dependency-participant-policy-restoration.test.ts`, while rest excludes both exact parents and the other nine fixed parents
- **AND** no prefix selector, alias or missing-file fallback changes coverage

#### Scenario: Discovery adds another canonical test

- **WHEN** Bun's unchanged canonical selection discovers an additional file, including a substring-filter collision
- **THEN** that file executes in the remainder and each model file executes only in its own singleton leaf
- **AND** union coverage equals canonical discovery with no overlap

#### Scenario: Execution contract or child is invalid

- **WHEN** configuration or overrides are unsupported, either required owner is absent, unreadable or aliased, or the actual child is empty or unsuccessful
- **THEN** every leaf refuses without a fresh successful execution receipt

### Requirement: All remote leaves retain gate obligations

All six leaves SHALL retain provisioning, fixed phase/job bounds, source identity, fresh execution and distinct always-upload logs. Remainder SHALL own remote Caddy and static checks once. The required gate SHALL require all selected leaves to succeed and SHALL accept all skipped only when the validated plan explicitly excludes remote or selects docs.

#### Scenario: One leaf is missing or unsuccessful

- **WHEN** remote is selected and any leaf is absent, skipped, failed, cancelled, unknown or bound to another head
- **THEN** the gate refuses without cancelling the other leaf solely because its peer failed

#### Scenario: Model files share fixed fixture ports

- **WHEN** remote is selected
- **THEN** a closed five-entry isolated-leaf matrix uses separate runners for core, continuation, source, source-restoration and participant-policy, with fail-fast disabled and serial cases within each file
- **AND** each model allocation retains its existing 75-minute phase, 90-minute job and 30-second termination cleanup, with inherited child and parent bounds preserved and the explicit policy-only D465/M495/A505/P525 profile
- **AND** each partition has a distinct artifact and phase identity, and the required model aggregate succeeds only after all five matrix jobs succeed

#### Scenario: Source runtime tooling is explicit

- **WHEN** any of the two isolated source or policy matrix members executes
- **THEN** it provisions CI Node 24.20.0 through the reviewed commit-pinned official setup action only for the three explicit source and policy partition identities
- **AND** every existing native namespace, production reserve and cleanup bound remains unchanged except the explicit policy-only model profile
- **AND** CI tooling does not establish source-image Node or whole-source native acceptance

### Requirement: Fixed source and policy parents preserve complete case ownership

The two actual wrappers and shared registration path SHALL bind an independent
frozen31 tuple oracle with exactly inherited23 and policy8 ownership, before
any fixture creation or child launch. Canonical full-model order SHALL remain
policy8 then inherited23, without prefix or caller-selected partitioning.

#### Scenario: Ownership or complete outer receipt is invalid

- **WHEN** a group is empty, duplicated, overlapping, incomplete, cross-assigned or renamed
- **THEN** actual registration refuses before peer/child launch
- **AND** a final outer receipt requires exactly23 or8 passes AND tests, one file and zero failures/skips/todos/outer filtering for its assigned singleton
- **AND** nested exact-one child selection may filter the other30 cases without supplying the outer receipt

#### Scenario: Policy matrix membership or execution is omitted

- **WHEN** the actual parsed workflow lacks its fifth member, skips that member's execution step, or misroutes affected/full dispatch
- **THEN** the corresponding membership/step/dispatch consumer refuses
- **AND** the reducer separately refuses missing/skipped/failed/cancelled/unknown whole-matrix outcomes without claiming awareness of individual members
- **AND** immutable plan/head, distinct artifacts, exact Node identities and once-only remainder static/Caddy obligations remain required
