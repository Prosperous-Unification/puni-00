## ADDED Requirements

### Requirement: Seven `@wbs/*` libraries with distinct responsibilities

The workspace MUST contain exactly seven libraries under `libs/`, each with a distinct responsibility and importable package name: `@wbs/validation`, `@wbs/domain`, `@wbs/contracts`, `@wbs/observability`, `@wbs/config`, `@wbs/realtime`, `@wbs/scripts`. A grab-bag "utils" library SHALL NOT be introduced.

#### Scenario: Workspace contains exactly the seven declared libs

- **WHEN** the `libs/` directory is listed
- **THEN** it contains exactly `validation/`, `domain/`, `contracts/`, `observability/`, `config/`, `realtime/`, `scripts/`
- **AND** each has a `package.json` whose `name` matches `@wbs/<directory-name>`

#### Scenario: A "utils" library is rejected in review

- **WHEN** a developer proposes a new `libs/utils/` project
- **THEN** the proposal is rejected by the `@nx/enforce-module-boundaries` tag allowlist (no `type:utils` tag value exists)

### Requirement: Acyclic dependency DAG

The dependency graph among `@wbs/*` libraries MUST be acyclic and MUST match the following shape: `validation` depends on nothing; `domain` depends on `validation`; `contracts` depends on `validation` and `domain`; `observability` depends on `validation`; `config` depends on `validation` and `observability`; `scripts` depends on `validation`, `observability`, and `config`; `realtime` depends on `validation`, `contracts`, and `observability`.

#### Scenario: `nx graph` shows no cycles among libs

- **WHEN** `nx graph --focus=@wbs/*` runs
- **THEN** the dependency graph is a DAG with no cycles
- **AND** each edge matches the declared dependency list above

#### Scenario: Adding a cycle fails `nx lint`

- **WHEN** a file in `libs/validation` imports from `@wbs/domain`
- **THEN** `nx lint validation` fails with `@nx/enforce-module-boundaries` circular-import error

### Requirement: Runtime boundary enforcement via Nx tags

Each library MUST declare a `runtime:isomorphic`, `runtime:bun`, or `runtime:browser` tag in its `project.json`. `@nx/enforce-module-boundaries` MUST forbid `runtime:browser` libraries from importing `runtime:bun` libraries and vice-versa. `runtime:isomorphic` MAY be imported by any consumer.

#### Scenario: Browser-only lib cannot import a Bun-only lib

- **WHEN** code in `libs/realtime` (`runtime:browser`) imports from `libs/scripts` (`runtime:bun`)
- **THEN** `nx lint realtime` fails with a runtime-boundary violation

#### Scenario: Correct runtime tags are assigned

- **WHEN** each lib's `project.json` is inspected
- **THEN** `validation`, `domain`, `contracts`, `observability` are tagged `runtime:isomorphic`
- **AND** `config`, `scripts` are tagged `runtime:bun`
- **AND** `realtime` is tagged `runtime:browser`

### Requirement: `@wbs/validation` is the DAG root with ArkType primitives

`@wbs/validation` MUST export (at minimum) the ArkType `type` function, a `defineSchema` helper, a `parseOrThrow` helper, a `ValidationError` class, an `InferSchema<T>` type helper, and a branded-type helper. It MUST NOT depend on any other `@wbs/*` library.

#### Scenario: Library depends on nothing

- **WHEN** `libs/validation/package.json` is inspected
- **THEN** the `dependencies` object contains no `@wbs/*` entry

#### Scenario: Public API is available from the root export

- **WHEN** a consumer writes `import { type, defineSchema, parseOrThrow, ValidationError } from '@wbs/validation'`
- **THEN** the import compiles with no errors and all symbols are non-undefined at runtime

### Requirement: `@wbs/contracts` is the single source of wire-level schemas

The schemas for every HTTP request/response shape exchanged between apps and the internal `be-01` ↔ `gw-01` contract MUST be defined in `@wbs/contracts` and imported by both producer and consumer. No duplicated schema definitions SHALL exist across `apps/*`.

#### Scenario: Contract schemas are imported, not copied

- **WHEN** a static scan across all `apps/*` source finds references to `/internal/push` payload shapes
- **THEN** every such reference imports a schema from `@wbs/contracts`
- **AND** no inline `type({ subscription: "string", seq: "number", … })` declaration exists outside `@wbs/contracts`

### Requirement: `@wbs/realtime` provides the reconnecting WebSocket client and TanStack DB adapter stub

`@wbs/realtime` MUST export a `ReconnectingWsClient` factory with the properties described in design D17 (exponential-backoff with jitter, heartbeat, per-subscription `last_seq` tracking in localStorage, resume-handshake) and a `createTanstackDbAdapter` function that wraps it as a TanStack DB sync engine. The client MUST be browser-only.

#### Scenario: Client survives a server-side disconnect

- **WHEN** an active `ReconnectingWsClient` experiences a server-side disconnect
- **THEN** the client attempts reconnection with backoff starting at 500 ms
- **AND** on reconnect sends a `{"type":"resume"}` frame with the stored `last_seq` values

#### Scenario: Client stops retrying after the configured ceiling

- **WHEN** 1 hour of continuous reconnect failures elapses
- **THEN** the client emits `onStateChange("closed")`
- **AND** does not attempt further reconnect attempts until the caller re-initializes the client

### Requirement: `@wbs/observability` provides structured logging and Prometheus integration

`@wbs/observability` MUST export (at minimum) `createLogger(service)` producing a pino logger whose output conforms to the log-field schema, the log-field ArkType schema itself, pino serializers, and typed wrappers over Prometheus counters/gauges/histograms. A sub-path export `@wbs/observability/server` MUST additionally expose an Elysia `/metrics` plugin bound to the `@elysiajs/opentelemetry` Prometheus exporter. The sub-path export MUST be tagged `runtime:bun` so browser code cannot import it.

#### Scenario: Library exposes the documented public surface

- **WHEN** a consumer writes `import { createLogger, LogRecord, Counter, Histogram, Gauge } from '@wbs/observability'`
- **THEN** the import compiles
- **AND** every imported symbol is non-undefined at runtime

#### Scenario: Browser-only code cannot import the server sub-path

- **WHEN** code in `libs/realtime` (`runtime:browser`) writes `import { prometheusPlugin } from '@wbs/observability/server'`
- **THEN** `nx lint realtime` fails with a runtime-boundary violation

### Requirement: `@wbs/config` parses env vars and decrypted secret files into validated config

`@wbs/config` MUST export (at minimum) a `defineConfig(schema)` helper (returns a typed, validated config object), standard env-variable schemas (port, log-level, URLs, JWT keys, internal auth), a SOPS-decrypted-file loader that reads a dotenv-style stream and merges it with process env, and config-assertion helpers that surface clear errors on startup.

#### Scenario: Missing required env variable produces a startup error with field name

- **WHEN** an app boots with `defineConfig(schema)` where the schema requires `INTERNAL_AUTH_SECRET` and the env does not set it
- **THEN** startup fails with a non-zero exit code
- **AND** the emitted error message includes the exact variable name `INTERNAL_AUTH_SECRET`

#### Scenario: SOPS-decrypted-file loader merges values into config

- **WHEN** `@wbs/config`'s decrypted-file loader is given a dotenv-formatted stream containing `INTERNAL_AUTH_SECRET=abc`
- **THEN** `defineConfig(schema).internalAuthSecret` equals `"abc"`
- **AND** neither the plaintext stream nor the decrypted value is written to disk by the loader

### Requirement: `@wbs/scripts` provides typed script helpers for `tool-*` projects

`@wbs/scripts` MUST export (at minimum) a `$` wrapper around `Bun.$` that surfaces structured errors (stdout, stderr, exit code, command), an SSH command builder that composes host + commands + stream piping, typed JSON/YAML file readers, and Dagger invocation argument helpers. The library MUST be tagged `runtime:bun` and SHALL NOT be importable from browser code.

#### Scenario: `$` wrapper surfaces structured errors on non-zero exit

- **WHEN** a `tool-*` script invokes `$("\`false\`")`and`false` exits non-zero
- **THEN** the wrapper throws or returns an error object containing `{ exitCode, stdout, stderr, command }` (not a raw rejection string)

#### Scenario: Browser-tagged code cannot import `@wbs/scripts`

- **WHEN** code in `libs/realtime` (`runtime:browser`) adds `import { $ } from '@wbs/scripts'`
- **THEN** `nx lint realtime` fails with a runtime-boundary violation
