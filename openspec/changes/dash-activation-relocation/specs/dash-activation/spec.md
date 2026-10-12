## ADDED Requirements

### Requirement: Dash owns the activation runtime

The activation controller, GitHub reader, observation tick and service, review retrieval,
selection and attestation, and the review invoker's journal lock, file journal and process
invoker SHALL live in Twilight Dash. Twilight Burokrat SHALL keep the judges: policy evaluation,
records, templates, the invocation journal records with `readInvocationJournal` and
`validate-review-provenance`, and activation selection and verification. Dash SHALL reach Burokrat
only through `@twilight-burokrat/judge`, whose reachable modules SHALL read no clock, reach no
network and open no SQLite file. Burokrat SHALL NOT import Dash.

#### Scenario: Facade widens into the runtime

- **WHEN** `ProcessReviewInvoker` is exported from the judge facade, or a clock read or a `bun:sqlite` import is added to `review/invocation-journal.ts`
- **THEN** the facade surface test fails naming the export or the offending module

#### Scenario: Dash activation reaches the judge by path

- **WHEN** a module under `activation/` or `review/` imports a Burokrat module by relative path, or the activation override is widened beyond the exact alias
- **THEN** workspace lint or the boundaries oracle fails

#### Scenario: Burokrat bundles carry no activation runtime

- **WHEN** Burokrat's `cli.ts` imports the process invoker
- **THEN** the bundle test reports `ProcessReviewInvoker` in `validator.mjs`

### Requirement: One CI shard gates both suite apps

The `gate_twilight` job SHALL run test, typecheck and build for `twilight-burokrat` and
`twilight-dash`, plus both source lints. The workspace shard and the h2puni gate steps SHALL
exclude both projects. `gate_mode` SHALL put the shard in scope when either project is affected.

#### Scenario: Only Dash is affected

- **WHEN** `nx show projects --affected` prints `["twilight-dash"]`
- **THEN** `gate_mode` writes `twilight=run`

### Requirement: Dash composes the clocks once

Only `src/clock.ts` SHALL read `Date.now` or `performance.now` among Dash production modules.
Only `entrypoint.ts` and `activation/observation-service-cli.ts` SHALL compose `wallClock()` or
`monotonicClock()`, and every activation and review module SHALL receive its clock as a required
dependency.

#### Scenario: A module reads the monotonic clock

- **WHEN** `performance.now()` is added to `activation/observation-tick.ts`
- **THEN** Dash's clock scan names that file

### Requirement: The observation store keeps its identity under explicit commands

The store SHALL stay `<stateDirectory>/activation.sqlite` with the `activation_*` tables at
`user_version 10` and the `observation.lock` file. `bootstrap-observation <service.json>` SHALL
create it only when absent. `migrate-observation <service.json>` SHALL step v8 to v9 to v10. Both
commands SHALL parse their arguments before touching state, and SHALL refuse with `absent`,
`unreadable`, `exists`, `current` or `unsupported-version` without creating a file. Neither
command SHALL create the state directory; `bootstrap-observation` refuses an absent one. A v10 store
written by the pre-relocation Burokrat code SHALL open in Dash and continue its attempt sequence,
and the pre-relocation code SHALL open a Dash-written store.

#### Scenario: Migrate on a current store

- **WHEN** `migrate-observation` runs against a v10 store
- **THEN** it refuses `current` and leaves the bytes unchanged

#### Scenario: Refused commands create nothing

- **WHEN** `migrate-observation` runs where no store exists, or `bootstrap-observation` runs where
  the state directory is absent
- **THEN** it refuses without creating `activation.sqlite` or `observation.lock`, and an absent
  state directory stays absent
