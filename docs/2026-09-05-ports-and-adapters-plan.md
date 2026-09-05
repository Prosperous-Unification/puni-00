# Ports-and-adapters plan — 2026-09-05

be-01 split into a framework-free core, one SQLite source, one in-memory source and one
Elysia HTTP adapter, with conformance kits that decide whether a new source or a new
HTTP framework is a correct implementation. Settled in a grilling session on 2026-09-05;
**not started**. Three OpenSpec changes, one per wave, created when each wave starts.

Vocabulary: **port / adapter / source / unit of work / endpoint / conformance kit** as
defined in `CONTEXT.md` → Architecture; **module / interface / seam / depth** from
`.claude/skills/improve-codebase-architecture/LANGUAGE.md`. Decisions with alternatives
are ADR 0014 (packages) and ADR 0015 (unit of work), both `proposed` until their wave
merges.

## 0 · What is already true (measured 2026-09-05, `main` @ `2c839252`)

The external analysis this plan started from said services import concrete repositories.
They do not. Checked by import, not by grepping the word:

| Fact                                                                                                     | Evidence                                                                                                          |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Store ports exist: 22 `*Store` interfaces, `implements`-ed by 16 drizzle classes                         | `apps/be-01/src/repository/index.ts` (2,017 lines, type-only), `grep '^export class' repository/*.ts`             |
| Services import **types** from the barrel; six **value** imports leak from repository modules            | `stepIsInUse`, `isForeignKeyViolation`, `MEASURE_METRICS`, `PERSON_KINDS`, `bodyByteLength`, `STEP_POSITION_STEP` |
| Zero Elysia imports in `service/` and `repository/`                                                      | `grep -rl "from 'elysia'"` → `app.ts`, 10 controllers, `middleware/caller.ts`, `openapi/hand-parsed-body.ts`      |
| Drizzle / `bun:sqlite` confined to `repository/` plus two JSDoc mentions in `service/`                   | `outer-transaction.ts`, `write-lock.ts` (comments only)                                                           |
| Runtime globals in services: `Bun.password` (auth), `setTimeout`/`setInterval` (3 files), `fetch` (push) | all but `Bun.password` already injectable                                                                         |
| A composition root exists: `services.ts` (stores → services), `boot.ts` (connection, lock, app)          | `bootBe01` is tested                                                                                              |
| In-memory stores exist for 12 ports but are **documented as laxer than production**                      | `testing/*-fixture.ts`, 23 files; `step-fixture.ts` JSDoc says what it does not model                             |
| Two repositories implement **no** port and open their **own** connection per call                        | `SavedPlanRepository`, `SavedPlanCaptureRepository` (`openConnection` option)                                     |
| The HTTP contract is owned by Elysia: TypeBox schemas (~35 calls), OpenAPI from Elysia's route table     | `@elysiajs/openapi` in `openapi-plugin.ts`; `openapi.json` committed and diffed; mcp-01 derives tools from it     |
| Two batch routes parse bodies by hand because Elysia strips unknown keys                                 | `hand-parsed-body.ts`, `plan-command-schema.ts` (JSON Schema written by hand, documentation only)                 |
| gw-01's WS controller already takes a `WsSocket` interface                                               | `apps/gw-01/src/controller/ws.controller.ts`                                                                      |

So the job is not "remove leakage". It is three seams that exist as folder conventions and
have to become **enforced contracts with two implementations each**, plus one seam (HTTP)
that does not exist yet.

## 1 · Decisions (settled 2026-09-05)

| #   | Question                                                              | Decision                                                                                                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | What does "swappable source" require of ADR 0007's outer transaction? | A behavioural **unit of work** port: a batch lands whole or not at all, observable through the stores' own reads. SQLite meets it with savepoints (ADR 0007 becomes the adapter's method). A source that cannot pass the rollback case is not a valid source. ADR 0015.            |
| D2  | Where do the pieces live?                                             | Four packages: `libs/core` (ports, services, kits), `libs/store-sqlite` (drizzle adapters, schema, migration runner), `libs/store-memory` (conformant in-memory source), `apps/be-01` (Elysia adapter, boot, CLIs). Direction enforced by Nx tags + ESLint. ADR 0014.              |
| D3  | What is the framework-independent controller?                         | **Endpoints as data**: an `EndpointSpec` per route — method, path, ArkType schemas for params/query/body, caller requirement, pure handler `(input) → HttpReply`. OpenAPI is emitted from the specs, not from Elysia.                                                              |
| D4  | Second adapters as living proof?                                      | **No** second HTTP adapter and no Fastify — "good idea, overkill for now" (Dany). The store kit gets two implementations for free by tightening the existing in-memory fixtures until they pass it. The HTTP kit runs against Elysia only, with the mounting recipe documented.    |
| D5  | Scope across apps                                                     | be-01 fully. gw-01's two controllers are lifted onto the same `EndpointSpec` / adapter so one adapter type serves both apps; gw-01's services do not move. mcp-01 untouched except where the OpenAPI emitter moves.                                                                |
| D6  | The six value leaks                                                   | Vocabulary (`MEASURE_METRICS`, `PERSON_KINDS`, `STEP_POSITION_STEP`, `stepIsInUse`, `bodyByteLength`) moves into core. `isForeignKeyViolation` is a SQL fact: the store returns a typed refusal (`{ ok: false, reason: 'unknown_reference' }`) and no service sees a driver error. |
| D7  | Order                                                                 | Wave 1 HTTP port → Wave 2 store port + unit of work + kits → Wave 3 package extraction. Each its own OpenSpec change and PR, gate-green on its own.                                                                                                                                |
| D8  | Packaging                                                             | This document + three OpenSpec changes (`http-endpoint-port`, `store-port-and-unit-of-work`, `core-lib-extraction`), each created when its wave starts with intent / design / tasks / verify.                                                                                      |
| D9  | Records                                                               | ADR 0014 and 0015 written now as `proposed`; flipped to `accepted` by the merging PR of their wave. CONTEXT.md terms written now.                                                                                                                                                  |

## 2 · Target shape

```
libs/core          @wbs/core           tags: scope:shared, type:core, runtime:isomorphic
  ports/           *Store, UnitOfWork, Clock, Broadcaster, PasswordHasher, Timers, IdentityResolver
  services/        every class now in apps/be-01/src/service (unchanged bodies)
  http/            EndpointSpec, HttpReply, caller requirements, the endpoint table per resource
  kits/            storeConformance(factory), unitOfWorkConformance(factory), httpConformance(mount)
libs/store-sqlite  @wbs/store-sqlite   tags: scope:shared, type:store, runtime:bun
  drizzle adapters, schema.ts, db.ts (openConnection, pragmas), migrate.ts / migrate-down.ts
libs/store-memory  @wbs/store-memory   tags: scope:shared, type:store, runtime:isomorphic
  the in-memory source, promoted from apps/be-01/src/testing/*-fixture.ts
apps/be-01                             tags: scope:app, runtime:bun
  elysia adapter (mount(specs) → Elysia), boot.ts (composition root), migrate-*-cli.ts, openapi emitter
```

**Dependency direction, enforced:** `core` depends on `@wbs/domain`, `@wbs/contracts`,
`@wbs/validation` and nothing else. `store-*` depend on `core`. `be-01` depends on all
three. ESLint `no-restricted-imports` bans `elysia`, `drizzle-orm`, `bun:sqlite` and the
globals `Bun`, `process`, `fetch`, `setTimeout`, `setInterval` inside `libs/core/src` (type
imports allowed where they cannot open a connection or a socket). Nx `type:core` may only
depend on `type:domain | contracts | validation`; `type:store` on those plus `type:core`.

**What does not move.** The migration SQL folder `apps/be-01/drizzle/` and the three
`migrate-*-cli.ts` entrypoints: the blue/green swap (`tools/tool-remote-scripts/src/swap.ts`,
`lib/docker.ts`) invokes them by path, the Dockerfile copies them, and `libs/domain`'s test
inputs name the folder. The runner moves into `store-sqlite` and takes the folder path as an
argument, which it already does. Moving the folder is a deploy-contract change and is its own
day, after Wave 3.

## 3 · The three seams

### 3.1 HTTP: endpoints as data (Wave 1)

```ts
interface EndpointSpec<P, Q, B, R> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string; // '/api/projects/:id/steps/:stepId'
  caller: 'public' | 'signed-in' | 'read-scope' | 'write-scope' | 'internal';
  params?: Type<P>;
  query?: Type<Q>;
  body?: Type<B>; // ArkType; body types reject unknown keys
  handle(input: {
    params: P;
    query: Q;
    body: B;
    user: Identity | null;
    headers: Headers;
  }): Promise<HttpReply<R>>;
  document: { summary: string; refusals: readonly string[] }; // what the OpenAPI emitter reads
}
interface HttpReply<R> {
  status: number;
  body: R | { error: string; [k: string]: unknown } | null;
  headers?: Record<string, string>;
}
```

- Handlers move out of the ten controllers **unchanged in logic**: the outcome-to-status
  mapping (`statusForRefusal`) is already framework-free.
- `callerGuard` (the Elysia macro) becomes the adapter's job: it reads `spec.caller`, resolves
  identity through an `IdentityResolver` port (`userFromHeaders` today), and refuses 401/403
  before `handle` runs. The `write-scope` pre-body check in `app.ts`'s `onRequest` becomes a
  caller kind so it is stated once per endpoint rather than inferred from the method.
- The two hand-parsed batch bodies become ArkType types with `onUndeclaredKey: 'reject'`, which
  is the guarantee `hand-parsed-body.ts` exists to explain: a derived field is **refused**, not
  stripped. `plan-command-schema.ts` (hand-written JSON Schema) is deleted; the document is
  emitted from the same types that validate. `number_is_derived` and the priority /
  parallelism guards keep their watched negatives, now against the ArkType path.
- OpenAPI: `documentFromSpecs(specs)` replaces `@elysiajs/openapi`; `openapi.json` stays
  committed and diffed; mcp-01 reads it unchanged. **Spike first**: ArkType 2.2
  `.toJsonSchema()` on all ~35 schemas and Elysia 1.4's Standard Schema acceptance, both
  written down in the change's `design.md` with the output. The refactoring plan's W4-3 named
  this dependency and stopped at it.
- Cookies (`auth.controller.ts` `set-cookie`, origin check) travel in `HttpReply.headers` and a
  `request-origin` guard the adapter applies from `spec.caller === 'public'` + an explicit
  `cookieOrigin` option on the auth endpoints.
- gw-01: `internal.controller.ts` and the HTTP half of `ws.controller.ts` become specs mounted
  by the same adapter. The WS upgrade itself stays Elysia's.

**Deletion test:** with the adapter deleted, every endpoint is still a typed function a unit
test can call with a literal input. That is the test surface for the controller tier from
Wave 1 on; `app.handle(new Request(...))` tests stay as the adapter's own.

### 3.2 Stores and the unit of work (Wave 2)

- Every `*Store` port stays as it is (the barrel is 68/76 store vocabulary and W4-1 measured
  that a split is not warranted). Two ports are **added**: `SavedPlanStore` and
  `SavedPlanCaptureStore`, whose classes today implement nothing and open their own
  connections. The per-call connection is the SQLite adapter's business and moves behind the
  port.
- `OuterTransaction { begin; commit; rollback }` is renamed `UnitOfWork` and gains
  `run<T>(act: () => Promise<T>): Promise<T>`, which is what every caller actually wants
  (`PlanCommandRunner` is the only caller). `WriteLock` stays a core port; the SQLite adapter's
  `UnitOfWork` takes it as the way it meets "one writer at a time".
- `isForeignKeyViolation` leaves the service. The one call site (`work-item.service.ts`) gets a
  typed `unknown_reference` refusal from the store method it wraps; the SQLite adapter maps the
  driver error, the memory adapter checks the referenced row.
- The five vocabulary values move to `libs/core` (or `@wbs/domain` where they are domain
  facts: `STEP_POSITION_STEP`, `stepIsInUse`). `schema.ts` re-exports them so no adapter changes.

**Conformance kits**, exported from `libs/core/kits`, each a function of a factory so a new
source is tested by one file:

```ts
storeConformance({
  open: () => Promise<{ stores: Stores; uow: UnitOfWork; close(): Promise<void> }>,
});
```

- One `describe` per port, moved from the existing `repository/*.db.test.ts` where the case is
  about the **contract** (what a caller can observe) and left behind where it is about SQLite
  (index choice, `ORDER BY`, pragma assertions, migration ledgers). Expected split from reading
  the 40 files: roughly two thirds move.
- `unitOfWorkConformance`: a batch of three writes across three stores where the third refuses
  leaves the first two **unobservable** through every store's reads; a batch that commits is
  observable through all; a write outside a batch is not rolled back by a neighbouring batch's
  failure. This is the case D1 hangs on.
- Both sources run it: `libs/store-sqlite/src/conformance.db.test.ts` (opens a temp file,
  runs migrations) and `libs/store-memory/src/conformance.test.ts`. Tier suffixes as today.
- Promoting the fixtures: each `inMemoryX` is tightened until the kit passes — the gaps named
  in their own JSDoc are revision bumps on satellites, cross-store deletes, and rollback. The
  `rows` / `stampsSeen` conveniences stay as an **extra** surface (`InMemoryStores` extends the
  ports) so the 24 suites that use them keep working.

### 3.3 Core extraction (Wave 3)

Mechanical: `git mv` the folders into the packages of §2, rewrite imports, add the three
`project.json`s and `tsconfig.base.json` paths, add the Nx tags and the ESLint bans. The
seams already exist by then, so the move is the point at which the **rules bite**: an import
of `elysia` in `libs/core` is a lint error the day the folder exists. `services.ts` and
`boot.ts` stay in be-01 as the composition root; `buildServices` moves to `libs/core` as
`composeServices(ports)` so a CLI, a worker or a test can build the graph without HTTP.

## 4 · Waves

Each wave: one OpenSpec change (intent ≤ 400 words, design, delta specs, `tasks.md` as TDD
slices, `verify.md` with the failure-proof table), one PR, gate-green, kit-green.

### Wave 1 — `http-endpoint-port` (~3 days)

1. Spike: ArkType → JSON Schema for the existing TypeBox shapes; Elysia 1.4 mounting an ArkType
   type as `body`. Output recorded in `design.md`. **Stop here if either fails** and choose:
   Standard Schema wrapper, or TypeBox kept behind a `Schema` port.
2. `EndpointSpec`, `HttpReply`, `IdentityResolver`, the Elysia `mount(specs, ports)` adapter,
   `httpConformance(mount)` with the caller-requirement matrix (public / signed-in / read /
   write / internal × anonymous / read-only token / write token / internal secret).
3. Move controllers one at a time, smallest first: `smoke` → `step` → `work-item` → `history`
   → `solution` → `saved-plan` → `project` → `directory` → `internal` → `auth`. Each move:
   its existing `*.controller.test.ts` passes unchanged over `app.handle`; then one direct
   `spec.handle(literal)` test per refusal path is added.
4. Batch bodies: ArkType with `onUndeclaredKey: 'reject'`; watched negatives for
   `number_is_derived`, priority floor, parallelism range **through the adapter** (the strip
   happens in the framework, so the test must go through it — `estimate-triple-visible`'s
   "assert in the window the fault lives in").
5. `documentFromSpecs`; regenerate `openapi.json`; `openapi-document.test.ts` diffs as before;
   mcp-01's `openapi-tools.test.ts` green. Delete `plan-command-schema.ts`, `hand-parsed-body.ts`,
   `@elysiajs/openapi`.
6. gw-01: two controllers onto specs; `internal.integration.test.ts` and the smoke's
   `internal-forward` check unchanged.

**R5 negatives to watch, minimum:** adapter with the caller check deleted → 401 matrix fails;
`onUndeclaredKey` set to `'delete'` → `number_is_derived` case fails; a spec removed from the
table → `openapi.json` diff fails **and** a route test 404s; `write-scope` caller demoted to
`signed-in` on one POST → read-token case fails.

### Wave 2 — `store-port-and-unit-of-work` (~4 days; **wait for the TASK-241 window**)

TASK-241 (`wbs-deadline-scheduling-core`, queued after `dual-optimized-scheduler`) edits
repositories and schema; this wave edits every repository file's test and several ports. Run
it between TASK-220 landing and TASK-241 starting, or after TASK-241 — never alongside.

1. `UnitOfWork` port with `run`; SQLite adapter over `drizzleOuterTransaction` + `WriteLock`;
   `unitOfWorkConformance` written first and watched failing against a `run` that does not
   roll back.
2. `SavedPlanStore` / `SavedPlanCaptureStore` ports; connection-per-call moves inside the
   adapter; `saved-plan-in-transaction.db.test.ts` keeps its case.
3. `unknown_reference` refusal; `isForeignKeyViolation` deleted from `service/`.
4. `storeConformance` assembled port by port from the existing `.db.test.ts` files (the file
   moves are the diff; the cases do not change). Sqlite kit file green.
5. Memory source tightened port by port until the kit is green. Every gap closed is a case
   that was watched failing on the fixture first.
6. Vocabulary values relocated; `schema.ts` re-exports; ESLint rule `libs/core` may not import
   `../repository/*` values (in Wave 2 still spelled as a folder rule inside be-01).

**R5 negatives:** rollback case with `rollback()` emptied → observable rows; memory
`unknown_reference` check removed → kit fails on the memory file only; `SavedPlanStore` port
method removed → `tsc` fails in `services.ts`.

### Wave 3 — `core-lib-extraction` (~2 days, mechanical)

1. `libs/core`, `libs/store-sqlite`, `libs/store-memory` with `project.json`, tags,
   `tsconfig`, `typecheck` running `tsc --build --force` on the **source** project (the
   solution-config trap CLAUDE.md records as R5 #16/#17), `test`, `lint`, `lint:fast`.
2. `git mv` in three commits, one per package, imports rewritten, `bun run test:unit` green
   after each.
3. ESLint bans in `libs/core/src`; Nx `depConstraints` for `type:core` and `type:store`;
   watched failing on a deliberate `import { Elysia } from 'elysia'` in a core file and on a
   `type:store` → `type:app` import.
4. `composeServices(ports)` in core; `boot.ts` calls it with the SQLite source; a second caller
   in `libs/core`'s own test composes it over the memory source and drives one command batch
   end to end without HTTP — the "run on any trigger" proof.
5. `LLM_README.md`, `CONTEXT.md`, ADR 0014 / 0015 → `accepted`, `docs/2026-09-02-refactoring-plan.md`
   cross-reference (W4-1 and W4-3 are superseded in part by this plan).

## 5 · Non-goals

- A second HTTP adapter (Fastify, Nest, Bun.serve). The port is designed for one; the kit and
  the recipe are what a second adapter would run.
- Moving gw-01's services or mcp-01's tool derivation.
- Moving `apps/be-01/drizzle/` or the migrate CLIs (deploy contract).
- Splitting `repository/index.ts` (W4-1, refused with measurement).
- Any behaviour change visible to fe-01: same routes, same bodies, same refusal codes, same
  `openapi.json` modulo schema-dialect noise, which the diff test will show and the change's
  `verify.md` must explain line by line.

## 6 · Risks and how each is checked

| Risk                                                                                    | Check                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ArkType JSON Schema differs from TypeBox's enough to break mcp-01's tool derivation     | Wave 1 step 1 spike; `openapi-tools.test.ts` in the gate                                                                                                                                  |
| Elysia's own inference of `params`/`body` lost at the adapter, handlers typed `unknown` | `EndpointSpec` is generic over the four ArkType types; `tsc` on a handler reading an undeclared field must fail (watched in Wave 1.2)                                                     |
| Memory source "passes" the kit because the kit only asserts what SQLite happens to do   | Every kit case moved from a `.db.test.ts` is first run against the **current lax fixture** and must fail there; a case that passes both untouched is not a contract case and stays behind |
| `UnitOfWork.run` hides the synchronous-connection constraint ADR 0007 depends on        | The SQLite adapter asserts it holds the `WriteLock` on `run` entry and throws otherwise; `boot.db.test.ts`'s one-lock case stays                                                          |
| Wave 2 collides with TASK-241                                                           | Sequencing rule in §4; the change's intent names the window it ran in                                                                                                                     |
| Whole-workspace gate diverges from per-project runs (2026-08-30 import-sort incident)   | Every wave's `verify.md` records the **workspace** gate, not per-project runs                                                                                                             |

## 7 · Open questions for the implementer

1. Does `IdentityResolver` return the `Identity` shape `userFromHeaders` returns today, or a
   narrower one per caller kind? Recommendation: the same shape; narrowing is a later change.
2. `@wbs/domain` vs `libs/core` for `STEP_POSITION_STEP` and `stepIsInUse`. Recommendation:
   domain (they are facts about steps, not about storage).
3. Whether `libs/store-memory` is `runtime:isomorphic` (usable by fe-01 for an offline mode) or
   `runtime:bun`. Recommendation: isomorphic; it costs nothing and is the one door this plan
   leaves open on purpose.
