## ADDED Requirements

### Requirement: Dash owns the runtime admission authority

The authority store, claim acquisition and expansion, generation lifecycle, packet binding,
submission freezing, candidate composition, integration queue, publication reservation, Git ref
transaction and publication recovery SHALL live in Twilight Dash. Twilight Burokrat SHALL keep
only the judge: packet codec, identity grammar, packet validation against the pinned base,
integration-candidate certification and attestation. Dash SHALL reach the judge only through
`@twilight-burokrat/judge`, whose runtime exports SHALL take no store and whose reachable modules
SHALL read no clock and reach no network. Burokrat SHALL NOT import Dash.

#### Scenario: Facade widens into runtime

- **WHEN** a store-taking export, a clock read or a network import is added to the judge surface
- **THEN** the facade surface test fails naming the export or the offending module

#### Scenario: Dash reaches the judge by path

- **WHEN** a Dash authority module imports `admission-judge/*` by relative path, or a Dash module other than `cli.ts` and `authority/**` imports the alias
- **THEN** workspace lint reports a module-boundary error

### Requirement: Store identity is preserved

The store SHALL remain at `realpath(git common dir)/module-wiki/authority.sqlite` with schema
`module-wiki-authority.v5`, the same table text, generation numbering, token pairs, packet,
submission and integration identities, and marker namespace `refs/module-wiki/publications/`.
A store written by the pre-relocation Burokrat code SHALL open in Dash with identical state and
continue its generations, and the pre-relocation code SHALL open a Dash-written store.

#### Scenario: Burokrat-written store continues in Dash

- **WHEN** Dash opens a v5 store dumped from the pre-relocation code
- **THEN** its inspected state equals the recorded state and the next acquisition receives the recorded next generation

### Requirement: Absent and unreadable authority are distinct refusals

Opening the authority SHALL refuse an absent store with a typed `absent` failure naming the path
and `twilight-dash bootstrap-authority <repository>`, and SHALL refuse any other read failure
as `unreadable` with its code. Opening SHALL create no file and no directory. Legacy, non-canonical,
corrupt and incompatible stores SHALL keep their distinct typed refusals.

#### Scenario: Absent store

- **WHEN** a command opens the authority in a clone without `module-wiki/authority.sqlite`
- **THEN** it fails with `absent`, names the bootstrap command, and no `module-wiki` directory exists afterwards

#### Scenario: Unreadable store

- **WHEN** the store file or its directory exists but cannot be read by a non-root user
- **THEN** it fails with `unreadable` and the error code, never `absent`

### Requirement: Bootstrap is explicit and single

Only `twilight-dash bootstrap-authority <repository>` SHALL create the store. It SHALL refuse an
existing store with `exists`, and two concurrent bootstraps SHALL yield one creator and one
`exists` refusal.

#### Scenario: Second bootstrap

- **WHEN** bootstrap runs on a repository whose store exists
- **THEN** it refuses with `exists` and the store is unchanged

### Requirement: The authority clock is a required dependency

Store construction and `runDash` SHALL require a clock; no authority module SHALL default to the
wall clock. Only `authority/clock.ts` SHALL read the wall clock, composed once in Dash's
entrypoint.

#### Scenario: Missing clock

- **WHEN** a store is constructed without a clock
- **THEN** construction throws `authority clock is required`

### Requirement: Exact resubmission is idempotent

`twilight-dash submit-admission` SHALL keep Burokrat's grammar and report. Repeating a submission
with identical packet binding and submission identities SHALL return the same report without a
write; a different candidate for a submitted generation SHALL be refused.

#### Scenario: Lost response

- **WHEN** a submission committed but its report was lost and the same command is repeated
- **THEN** the repeated command prints byte-identical output and the store state is unchanged

### Requirement: Interrupted publication is recoverable

`twilight-dash recover-publication <repository> --integration-id <id>` SHALL finish a durable
`publishing` record from a fresh process, whether or not its refs moved, SHALL report `published`
and `terminal` records without moving a ref, and SHALL refuse records that need a certifier.

#### Scenario: Refs moved before the crash

- **WHEN** the publication marker exists for the reserved candidate and the target later advanced
- **THEN** recovery finalizes `integrated` without a second ref transaction

### Requirement: Burokrat ships no authority writer

Burokrat SHALL NOT expose `submit-admission`, and its validator bundle SHALL carry none of the
authority store's markers: the schema version `module-wiki-authority`, the table name
`authority_generation` and the database file name `authority.sqlite`. The bundle MAY import
`bun:sqlite`, because the judge's relationship parser uses an in-memory database that holds no
authority state.

#### Scenario: Old command

- **WHEN** `twilight-burokrat submit-admission` is invoked
- **THEN** it fails as an unknown command

#### Scenario: Validator bundle

- **WHEN** the validator bundle is built from Burokrat's `cli.ts`
- **THEN** it contains none of `module-wiki-authority`, `authority_generation` and `authority.sqlite`
- **AND** a route that imports the moved store makes all three appear
