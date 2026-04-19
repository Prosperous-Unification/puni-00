## ADDED Requirements

### Requirement: Layered test strategy with fixed tool-per-layer

The workspace MUST support seven test layers: unit, integration, contract, property, end-to-end, smoke, and mutation. Each layer MUST use the tool declared in design D20: `bun test` (backend + libs), Vitest + jsdom (fe-01), `fast-check` for property tests inside `bun test`, Playwright for E2E, `bun test` scripts under `tool-smoke` for post-deploy smoke, Stryker for mutation.

#### Scenario: Running unit tests for a backend project uses `bun test`

- **WHEN** `nx test be-01` runs
- **THEN** the underlying runner is `bun test` (not Jest, Vitest, or Mocha)

#### Scenario: Running unit tests for `fe-01` uses Vitest + jsdom

- **WHEN** `nx test fe-01` runs
- **THEN** the underlying runner is Vitest with a jsdom environment

### Requirement: Colocated `*.test.ts` convention

Test files MUST be colocated next to the implementation they test, named `<name>.test.ts` (for unit), `<name>.integration.test.ts`, `<name>.contract.test.ts`, `<name>.property.test.ts`, or `<name>.soak.test.ts`. E2E tests MUST live in a separate Nx project (e.g., `apps/fe-01-e2e/`) and MUST NOT be colocated. Mutation-test configs MUST live in `libs/<lib>/stryker.conf.json`.

#### Scenario: A unit test sits next to its module

- **WHEN** a new module `apps/be-01/src/service/estimator.ts` is added
- **THEN** its unit test lives at `apps/be-01/src/service/estimator.test.ts`
- **AND** a `tests/` or `__tests__/` directory is NOT created

### Requirement: Agent-driven TDD ergonomics are enforced

The workspace MUST enforce these testing ergonomics via ESLint rules or lint plugins where possible, or documented in `libs/validation/fixtures/README.md` otherwise:
(1) test names describe invariants not actions, (2) no snapshots except tiny ArkType-derived JSON schemas, (3) deterministic clock + RNG via injection, (4) no network/filesystem/real-clock in `*.test.ts` files, (5) fixtures are factory-built per test, (6) public-API-only test imports (no `@ts-expect-error` internal imports).

#### Scenario: Unit test importing `fs/promises` fails lint

- **WHEN** a file matching `*.test.ts` (not `*.integration.test.ts`) imports `node:fs` or `fs/promises`
- **THEN** `nx lint` reports an `import/no-restricted-imports` violation
- **AND** the fix is to relocate the test to `*.integration.test.ts` or inject the dependency

#### Scenario: Unit test using `Date.now()` directly fails lint

- **WHEN** a file matching `*.test.ts` (not `*.integration.test.ts`) contains a direct `Date.now()` call
- **THEN** `nx lint` reports a `no-restricted-syntax` violation naming `Date.now`
- **AND** the recommended fix references the `injectedClock()` helper documented in `libs/validation/src/fixtures/README.md`

### Requirement: Shared test fixtures live in `@wbs/validation/fixtures`

Test data factories (`makeTestDb()`, `makeFrame()`, `makeWbsItem()`, and related helpers) MUST live under `libs/validation/src/fixtures/` and be importable via `@wbs/validation/fixtures`. Ad-hoc copies of these factories in multiple projects SHALL NOT be created.

#### Scenario: `makeTestDb` is a single importable helper

- **WHEN** integration tests across `be-01` and other projects need a SQLite test DB
- **THEN** each test imports from `@wbs/validation/fixtures` — not a local copy
- **AND** a grep across the workspace finds no duplicate `makeTestDb` definitions

### Requirement: Layer-A resume protocol invariants covered by property tests

The Layer-A resume protocol MUST have property tests (using `fast-check`) covering at minimum these invariants: (1) monotonic delivery per subscription, (2) no replay below the client's last ack, (3) replay buffer size-bound respected, (4) resume handshake idempotent, (5) drain terminates in bounded steps, (6) session isolation (two clients never cross-deliver).

#### Scenario: Property test suite runs as part of `nx test be-01`

- **WHEN** `nx test be-01` runs
- **THEN** the suite includes files matching `*.property.test.ts`
- **AND** each invariant above corresponds to at least one property test

### Requirement: Coverage enforced at 85% line on libs, not enforced on apps

`libs/*` Nx `test` targets MUST enforce 85% line coverage via `bun test --coverage`; a library's `test` target MUST fail when coverage drops below the threshold. `apps/*` test targets MUST NOT enforce line-coverage thresholds (Elysia wiring inflates the number misleadingly).

#### Scenario: A library drops below 85% coverage and its test fails

- **WHEN** `nx test @wbs/contracts` runs after a change that drops its line coverage to 80%
- **THEN** the target fails with a coverage-threshold error

#### Scenario: App coverage is not enforced

- **WHEN** `nx test be-01` runs after a change that drops app line coverage
- **THEN** the target's pass/fail status is unaffected by coverage numbers

### Requirement: Agent "done" signal is a composite Nx target

A subagent implementing a micro-task MUST consider its task complete when `nx affected -t test,lint,typecheck --base=<micro-task-start>` exits 0 AND the new failing test introduced at the start of the TDD cycle now passes. This composite signal MUST be documented in the workspace README.

#### Scenario: Subagent marks task complete after green composite run

- **WHEN** a subagent finishes a task and the composite run returns exit 0
- **THEN** the subagent updates `tasks.md` to mark the task `[x]`
- **AND** the corresponding new test(s) are present and passing in the diff

### Requirement: Usually-skipped tests are not in the default graph

Tests flagged as `soak`, `mutation`, or full-suite E2E MUST NOT run under `nx run-many -t test` or `nx affected -t test`. They MUST have dedicated Nx targets (`soak`, `mutation`, `e2e --tag=full`) invoked on demand.

#### Scenario: `nx run-many -t test` does not include soak tests

- **WHEN** `nx run-many -t test` runs
- **THEN** no `*.soak.test.ts` file is executed
- **AND** the soak target exists and is runnable via `nx run gw-01:soak`
