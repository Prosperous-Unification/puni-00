# Ports-and-adapters plan — 2026-09-05

be-01 split into a framework-free core, one SQLite source, one in-memory source and one
Elysia HTTP adapter, with conformance kits that decide whether a new source is a correct
implementation. Settled in a grilling session on 2026-09-05, **revised the same day** after
two codex reviews (gpt-5.6-sol xhigh, gpt-6-astra xhigh; §8 has the disposition of every
finding). **Not started.** Three OpenSpec changes, one per wave, created when each wave starts.

Vocabulary: **port / adapter / source / unit of work / write coordinator / endpoint / request
policy / conformance kit** as defined in `CONTEXT.md` → Architecture; **module / interface /
seam / depth** from `.claude/skills/improve-codebase-architecture/LANGUAGE.md`. Decisions
with alternatives are ADR 0014 (packages) and ADR 0015 (unit of work), both `proposed` until
their wave merges.

**Changed on review, for Dany to confirm** (each was an interview decision; the evidence is
in §8): Wave 1 keeps TypeBox and `@elysiajs/openapi` and moves only the handlers — ArkType
and a spec-emitted document become an optional Wave 4 (D3). gw-01 is out of scope entirely
(D5). No blanket `unknown_reference` refusal (D6). Core is `runtime:bun`, not isomorphic (D10).

## 0 · What is already true (measured 2026-09-05, `main` @ `2c839252`, re-checked on review)

The external analysis this plan started from said services import concrete repositories.
They mostly do not. Checked by import, not by grepping the word:

| Fact                                                                                                                                                                                                                 | Evidence                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Store ports exist: **16** `*Store` interfaces in the barrel plus `EventLogRepo` beside it, `implements`-ed by 17 drizzle classes                                                                                     | `apps/be-01/src/repository/index.ts:64–2023` (2,063 lines; exports three **constants**, so not type-only), `event-log.ts:13`                                    |
| Two repositories implement **no** port, open their own connection per call, and the service depends on their **class types**                                                                                         | `SavedPlanRepository`, `SavedPlanCaptureRepository`; `saved-plan.service.ts:288` names both classes                                                             |
| Services import types from the barrel; **seven** value imports leak from repository modules                                                                                                                          | `stepIsInUse`, `isForeignKeyViolation`, `MEASURE_METRICS`, `PERSON_KINDS`, `bodyByteLength`, `STEP_POSITION_STEP`; `PLAN_EVENT_RETENTION_DAYS` in `services.ts` |
| Zero Elysia imports in `service/` and `repository/`                                                                                                                                                                  | `grep -rl "from 'elysia'"` → `app.ts`, 10 controllers, `middleware/caller.ts`, `openapi/hand-parsed-body.ts`                                                    |
| Drizzle / `bun:sqlite` confined to `repository/`                                                                                                                                                                     | two JSDoc mentions in `service/` only                                                                                                                           |
| Runtime and platform in services: `Bun.password` (auth), `node:async_hooks` (broadcast), `node:crypto` (saved-plan), `jose` + `@wbs/auth` (auth), `Buffer` (`bodyByteLength`), `fetch`/timers as injectable defaults | `auth.service.ts:1,76`, `broadcast.ts:2`, `saved-plan.service.ts:7`, `saved-plan.ts:173`, `push-client.ts:31`, `retention-timer.ts:61`                          |
| A composition root exists but is **split**: `services.ts` builds most services; `boot.ts` builds the saved-plan pair and `buildApp` builds `PlanCommandRunner`                                                       | `services.ts`, `boot.ts:102–125`, `app.ts` (`new PlanCommandRunner`)                                                                                            |
| In-memory stores exist for every port but are **documented as laxer than production**; the harness composes 12 of them                                                                                               | `testing/*-fixture.ts` (23 files), `harness.ts:55`, `replay-fixture.ts:12` (in-memory event log)                                                                |
| **The write lock guards publication, not writes.** Route writes (e.g. `StepService.add`) and the retention prune never take it                                                                                       | `gateway-broadcaster.ts:108–112` ("every other publisher is an HTTP route that never takes the lock at all"), `step.service.ts:139`, `event-log.ts:94`          |
| Undo rolls back on a **returned** `{ ok: false }`, then discards the stale journal entry after rollback and before releasing the lock                                                                                | `plan-commands.ts:74` (`Refused` thrown inside a batch), `:222–236`                                                                                             |
| The origin check is **global** for unsafe cookie-bearing requests and **additional** on login/register; write-scope is resolved **before body parsing**                                                              | `app.ts:169–178`, `auth.controller.ts:126,328`                                                                                                                  |
| The OIDC callback sets three separate `Set-Cookie` headers and re-reads the raw request                                                                                                                              | `auth.controller.ts:231–238,271,350`                                                                                                                            |
| The HTTP contract is owned by Elysia: TypeBox (~35 calls), OpenAPI from Elysia's route table; mcp-01 needs `operationId`s and inline object bodies                                                                   | `openapi-plugin.ts`, `openapi.json` committed and diffed, `mcp-01/src/openapi-tools.ts:128–178`                                                                 |
| The two batch routes parse bodies by hand: unknown fields are **ignored**, derived fields are **refused**, errors are `400 { error, at, kind }`                                                                      | `hand-parsed-body.ts:31`, `work-item.controller.ts:541,809`, `work-item.controller.test.ts:1480`                                                                |
| Saved-plan authorization and announcements live in the **controller**                                                                                                                                                | `saved-plan.controller.ts:210–222`                                                                                                                              |
| Existing guards are aimed at folders that will move: drizzle rules and the `bun:sqlite` ban name `apps/be-01/src/repository`; `test:unit` lists libs by name                                                         | `eslint.config.js:116,154`, `package.json:11`                                                                                                                   |

So the job is not "remove leakage". It is three seams that exist as folder conventions and
have to become **enforced contracts with two implementations each**, one seam (HTTP) that does
not exist yet, and one **pre-existing gap** (the lock) that the unit-of-work design has to close
rather than inherit.

## 1 · Decisions

| #   | Question                                                              | Decision                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | What does "swappable source" require of ADR 0007's outer transaction? | A behavioural **unit of work** port. Contract: **terminal atomicity** — once `run` settles, either every write inside it is observable through every store's reads or none is. **Isolation is not promised** (SQLite's one connection shows in-flight rows to a concurrent read; the kit documents that rather than pretends). ADR 0015.                                                                                            |
| D2  | Where do the pieces live?                                             | Four packages: `libs/core`, `libs/store-sqlite`, `libs/store-memory`, `apps/be-01`. Direction enforced by Nx tags + ESLint. ADR 0014.                                                                                                                                                                                                                                                                                               |
| D3  | What is the framework-independent controller?                         | **Endpoints as data** — `EndpointSpec` with method, path, request policies, schemas and a pure handler. **Revised:** Wave 1 keeps TypeBox schemas (a `StandardSchema` port; TypeBox 0.34 implements it) and keeps `@elysiajs/openapi`. Replacing the validator and emitting the document from specs is **Wave 4, optional**.                                                                                                        |
| D4  | Second adapters as living proof?                                      | **No** second HTTP adapter (Dany: "good idea, overkill for now"). The store kit gets two implementations by tightening the in-memory fixtures. HTTP characterization tests stay **local to the Elysia adapter**; an exported HTTP kit is written the day a second adapter exists.                                                                                                                                                   |
| D5  | Scope across apps                                                     | **Revised: be-01 only.** gw-01's `ws.controller.ts` is already framework-free; its upgrade lives in `gw-01/app.ts` and is not an endpoint; and Nx forbids app→app imports, so a be-01 adapter cannot serve it. A shared `libs/http-elysia` is a later decision. mcp-01 untouched.                                                                                                                                                   |
| D6  | The seven value leaks                                                 | Vocabulary moves to core/domain. **Revised:** `isForeignKeyViolation` is replaced by **reference-specific** store outcomes (`unknown_step`, `unknown_person`, …) that the adapter returns **only after proving that reference absent**; any other FK failure stays a thrown unknown. No blanket `unknown_reference`.                                                                                                                |
| D7  | Order                                                                 | Wave 0 collision gate → Wave 1 HTTP (narrowed) → Wave 2 stores + unit of work + kits → Wave 3 extraction → Wave 4 optional. Each its own OpenSpec change and PR.                                                                                                                                                                                                                                                                    |
| D8  | Packaging                                                             | This document + OpenSpec changes `http-endpoint-port`, `store-port-and-unit-of-work`, `core-lib-extraction` (+ `schema-and-document-from-specs` if Wave 4 runs), each created when its wave starts.                                                                                                                                                                                                                                 |
| D9  | Records                                                               | ADR 0014 and 0015 `proposed` now, `accepted` by the merging PR of their wave. CONTEXT.md terms written now.                                                                                                                                                                                                                                                                                                                         |
| D10 | **New.** What runtime does core promise?                              | **`runtime:bun`, Node-compatible, not isomorphic.** Core may use `node:crypto`, `node:async_hooks`, `jose`, `@wbs/auth`, `TextEncoder`. It may **not** import `elysia`, `drizzle-orm`, `bun:sqlite`, `@elysiajs/*`, or touch `Bun`, `fetch`, `setTimeout`, `setInterval`, `process` as globals. `Bun.password` goes behind a `PasswordHasher` port; `Buffer.byteLength` becomes `TextEncoder`. Browser reuse of core is a non-goal. |
| D11 | **New.** Who coordinates writes?                                      | The **source** owns a re-entrant **write coordinator**. Every mutating adapter method enters it; `UnitOfWork.run` enters it for the whole batch. In SQLite it is today's `WriteLock`, moved inside the adapter; in memory it is a promise queue. `WriteLock` leaves core.                                                                                                                                                           |
| D12 | **New.** Saved plans and the unit of work                             | Saved-plan capture and write are **independent operations** of the source, never enlisted in a command batch: capture reads a coherent snapshot, write refuses contention at once and checks quota inside its own transaction. Their kit cases say so.                                                                                                                                                                              |

## 2 · Target shape

```
libs/core          @wbs/core           tags: scope:shared, type:core, runtime:bun
  ports/           *Store, EventLogStore, SavedPlanStore, SavedPlanCaptureStore, UnitOfWork, Clock,
                   Broadcaster, IdentityResolver, PasswordHasher, Timers, PushTransport, Logger
  services/        every class now in apps/be-01/src/service, bodies changed only where D10 demands
  use-cases/       runCommandBatch, savePlan (authorization + announcement, out of the controller),
                   replay, retentionSweep — the entrypoints a worker, a CLI or a test call
  http/            EndpointSpec, HttpReply, RequestPolicy, StandardSchema port, the endpoint table
  kits/            sourceConformance(open), unitOfWorkConformance(open), brokenSource(memory, faults)
  compose.ts       composeServices(ports) — one graph, including saved plans and the command runner
libs/store-sqlite  @wbs/store-sqlite   tags: scope:shared, type:store, runtime:bun
  drizzle adapters, schema.ts, db.ts (openConnection, pragmas, the write coordinator), migrate*.ts
libs/store-memory  @wbs/store-memory   tags: scope:shared, type:store, runtime:bun
  the in-memory source, promoted from apps/be-01/src/testing/*-fixture.ts
apps/be-01                             tags: scope:app, runtime:bun
  elysia adapter (mount(specs, policies) → Elysia), boot.ts (config, logger, composition), migrate-*-cli.ts
```

**Dependency direction, enforced.** `core` depends on `@wbs/domain`, `@wbs/contracts`,
`@wbs/validation`, `@wbs/auth` and nothing else. `store-*` depend on `core`. `be-01` depends
on all three. Enforcement is three rules, each with its own watched negative (§4, Wave 3):

- `no-restricted-imports` in `libs/core/src`: `elysia`, `@elysiajs/*`, `drizzle-orm`,
  `bun:sqlite`, `node:http`, `node:https`.
- `no-restricted-globals` in `libs/core/src`: `Bun`, `fetch`, `setTimeout`, `setInterval`,
  `process` (plus `no-restricted-syntax` for `globalThis.fetch`).
- Nx `depConstraints`: `type:core` → `type:domain | contracts | validation | auth`;
  `type:store` → those plus `type:core`.

The **existing** guards move with the code: the drizzle rules and the `bun:sqlite` ban are
re-aimed at `libs/store-sqlite/src` (with `db.ts` the one exemption), and `test:unit` in
`package.json` names the three new projects.

**What does not move.** `apps/be-01/drizzle/` and the three `migrate-*-cli.ts` entrypoints:
the blue/green swap (`tools/tool-remote-scripts/src/swap.ts`, `lib/docker.ts`) invokes them
by path and the Dockerfile copies them. The runner moves into `store-sqlite` and takes the
folder path as an argument, which it already does. How a **non-SQL** source becomes
deployment-ready is that source's adapter's business (`open / health / close` are part of the
source port; there is no generic migration port — a file source has no ledger to replay).

## 3 · The three seams

### 3.1 HTTP: endpoints as data (Wave 1, narrowed)

```ts
interface EndpointSpec<P, Q, B, R> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  operationId: string; // mcp-01 refuses to invent one
  policies: RequestPolicy[]; // see below; applied in order, before parsing
  params?: StandardSchema<P>;
  query?: StandardSchema<Q>;
  body?: StandardSchema<B>;
  unknownKeys: 'strip' | 'ignore-then-refuse-derived'; // per shape, matches today's two behaviours
  handle(input: EndpointInput<P, Q, B>): Promise<HttpReply<R>>;
}
type RequestPolicy =
  | { kind: 'origin'; when: 'always-unsafe-with-session-cookie' | 'always' }
  | { kind: 'identity'; require: 'signed-in' | 'read-scope' | 'write-scope' | 'internal' };
interface EndpointInput<P, Q, B> {
  params: P;
  query: Q;
  body: B;
  principal: Identity; // non-null once an identity policy ran; the type says so
  request: { url: URL; method: string; headers: Headers }; // the OIDC callback re-reads the raw request
}
interface HttpReply<R> {
  status: number;
  body: R | { error: string; [k: string]: unknown } | typeof EMPTY; // EMPTY ≠ JSON null
  headers?: [name: string, value: string][]; // ordered multimap: three Set-Cookie on the callback
}
```

- **Adapter phases are specified, not implied.** Policies run in `onRequest`, before Elysia
  parses a body — today's write-scope guard depends on that (`app.ts:174`) and a per-route hook
  would answer 422 where 401 is owed. Negative: policies moved after parsing → malformed JSON
  with a read-only token answers 422 instead of 403, watched through `app.handle`.
- **Origin is its own policy**, applied to every unsafe request carrying a session cookie
  exactly as `hasInvalidCookieOrigin` does today, plus the additional always-on check on
  login/register. Negative: policy removed from an authenticated project POST → a
  foreign-origin cookie request writes, watched with the row's absence asserted.
- **Validation errors are translated, not passed through.** The batch routes keep
  `400 { error, at, kind }` and their "ignore unknown, refuse derived" behaviour; the schema
  routes keep Elysia's 422. Wire compatibility is the test: the existing `*.controller.test.ts`
  files run unchanged over `app.handle` for every moved controller, `work-item.controller.test.ts:1480`
  included.
- Handlers move out of the ten controllers **unchanged in logic**. `callerGuard` (the macro)
  and `app.ts`'s `onRequest` become the adapter's policy runner over an `IdentityResolver` port.
- **The document's oracle is mounting, not the spec table.** `openapi.json` keeps coming from
  the mounted app in Wave 1. A reachability test walks the spec table and requests every path
  through `app.handle`, so an adapter that skips a mount while the spec stays present fails
  there. Negative: one `mount` call skipped → `expected 200/401, received 404` at that path.
- `/health` and `/metrics` are specs too (they are in mcp-01's exclusion list and must stay
  in the document).
- **Deletion test:** with the adapter deleted, every endpoint is a typed function a unit test
  can call with a literal input. That is the controller tier's test surface from Wave 1 on.

### 3.2 Stores, the write coordinator and the unit of work (Wave 2)

- Every `*Store` port stays. **Added:** `EventLogStore` (renamed from `EventLogRepo`, already
  has a memory adapter), `SavedPlanStore`, `SavedPlanCaptureStore`. The `Source` port is
  `{ stores: Stores; uow: UnitOfWork; open(): Promise<void>; health(): SourceHealth; close(): Promise<void> }`.
- **Write coordinator (D11).** Every mutating adapter method enters the source's re-entrant
  coordinator; `UnitOfWork.run` holds it for the batch. This closes the pre-existing gap in §0:
  a route write or a retention prune can no longer land inside an open batch's transaction.
  The SQLite coordinator is today's `WriteLock` made re-entrant (owner token on the async
  context) and moved into the adapter. Negative, the one D11 hangs on: suspend a real batch
  after its first write, start `StepService.add` from outside, refuse the batch → the step
  **is** stored and its event is consistent. Watched failing with the coordinator bypassed for
  route writes (today's arrangement).
- **`UnitOfWork.run` protocol**, because refusals here are **returned values**, not throws:

  ```ts
  interface UnitOfWork {
    run<T>(act: (scope: Scope) => Promise<Decision<T>>): Promise<T>;
  }
  type Decision<T> =
    | { commit: true; value: T }
    | { commit: false; value: T; afterRollback?: () => Promise<void> };
  ```

  A thrown error rolls back and rethrows. `afterRollback` runs after the rollback and **before
  the coordinator is released** — undo's stale-journal discard needs exactly that window
  (`plan-commands.ts:222–236`). Announcements are the caller's, after `run` returns, as today.
  `scope` carries the stores as seen inside the batch, which is what lets the memory source
  stage and swap without every service holding a staged store already.

- **Terminal atomicity, tested in the window it lives in.** `unitOfWorkConformance`: (a) three
  writes across three stores, the third refused via `Decision.commit: false` → after `run`
  settles none is observable; (b) the same with the third **throwing**; (c) a committed batch is
  observable through all three; (d) the D11 suspension case above; (e) a retention prune
  started while a batch is suspended is **not** undone by the batch's rollback (today it is —
  observed by astra's probe against the production event log). A `run` that commits any resolved
  value, a no-op `rollback`, and a coordinator that only guards publication were each watched
  failing (a), (b)/(d), (e) respectively before the kit is believed.
- **Saved plans (D12)** get their own kit cases: coherent capture (a mid-capture edit is not
  seen), fail-fast on contention, header+body atomic, quota checked inside the write, both
  independent of any open batch. `saved-plan-in-transaction.db.test.ts:120` becomes a kit case
  so a replacement source has to answer it too.
- **Reference-specific outcomes (D6).** `writeNamingStep`'s pattern — re-read, translate only
  the reference that is actually gone — moves inside the adapter per method; the service sees
  `unknown_step` and never a driver error. Negative: FK failure on a **person** while the step
  exists → throws (not `unknown_step`); step deleted → `unknown_step`. Both watched.
- **Kit admission rule.** A case belongs in `sourceConformance` if it states behaviour a caller
  can observe through the port, **whether or not both sources already pass it** — existing
  agreement is coverage, not vacuity. What earns the case its place is that it was watched
  failing against `brokenSource(memory, fault)`: a memory source with one injectable fault
  (dropped write, reversed order, accepted duplicate, no-op rollback, non-atomic capture,
  direct write outside the coordinator). Cases that are about SQLite (index choice, pragma
  assertions, migration ledgers) stay in `store-sqlite`.
- Promoting the fixtures: each `inMemoryX` is tightened until the kit passes; the `rows` /
  `stampsSeen` conveniences stay as an extra surface so the 24 suites using them keep working.

### 3.3 Core extraction (Wave 3, mechanical only after D10 is done in Wave 2)

`git mv` into the packages of §2, imports rewritten, three `project.json`s, tags, the three
enforcement rules, the two relocated guards, `test:unit` updated. `composeServices(ports)` in
core builds **one** graph — saved plans and the command runner included, which today are built
in `boot.ts` and `app.ts` respectively. Use-case entrypoints (`runCommandBatch`, `savePlan`,
`replay`, `retentionSweep`) are what a non-HTTP caller invokes; `savePlan` carries the
authorization and announcement the controller holds today (`saved-plan.controller.ts:210–222`),
so a worker cannot bypass them. Config loading and the logger adapter stay in `boot.ts`.

## 4 · Waves

Each wave: one OpenSpec change (intent ≤ 400 words, design, delta specs, `tasks.md` as TDD
slices, `verify.md` with the failure-proof table), one PR, workspace gate green, kit green.

### Wave 0 — collision gate (half a day, no code)

Four open changes touch this plan's files: `dual-optimized-scheduler` (adds
`EventLogRepo.recordEventIn(tx)` and post-commit pushing — **the source seam itself**),
`plan-json-import` (a route, a TypeBox body, another transaction caller, an MCP tool),
`gantt-calendar-markers` (schema + endpoints), `retired-schema-cleanup` (`insertSubtree`), and
TASK-241 behind them. Before each wave's change is created: list the files it edits, diff
against every open change's `tasks.md`, and either wait for the collider to merge or take
its seam-shaped item (e.g. `recordEventIn(tx)`) into this plan's design. The change's intent
names the window it ran in.

### Wave 1 — `http-endpoint-port` (~3 days)

1. `EndpointSpec`, `HttpReply`, `RequestPolicy`, `EndpointInput`, `StandardSchema` port,
   `IdentityResolver`; the Elysia `mount(specs, ports)` adapter with the policy runner in
   `onRequest`. Adapter-local tests: the policy matrix (origin × identity × anonymous /
   read-only / write / internal), pre-parse ordering (malformed JSON + read-only token → 403),
   ordered `Set-Cookie` (`getSetCookie()` length 3), `EMPTY` vs JSON `null`, 302 + Location.
2. Move controllers one at a time, smallest first: `smoke` → `step` → `work-item` → `history`
   → `solution` → `saved-plan` → `project` → `directory` → `internal` → `auth`. Each move: the
   existing `*.controller.test.ts` passes **unchanged** over `app.handle`; then one direct
   `spec.handle(literal)` test per refusal path is added.
3. Reachability test over the spec table; `openapi.json` regenerated from the mounted app and
   diffed; mcp-01's `openapi-tools.test.ts` green with all 28 derived tool names pinned.
4. `/health` and `/metrics` as specs. `callerGuard` and `app.ts`'s inline `onRequest` deleted.

**Negatives, minimum:** identity policy deleted → 401 matrix; origin policy deleted on a
project POST → foreign-origin write lands; policies after parsing → 422 where 403 is owed;
one mount skipped → reachability 404; `operationId` dropped from one spec → mcp-01 refuses.

### Wave 2 — `store-port-and-unit-of-work` (~5 days; Wave 0 gate first)

1. Write coordinator inside `store-sqlite`'s `db.ts` (re-entrant `WriteLock`), every mutating
   adapter method enters it; the D11 suspension negative written first and watched failing.
2. `UnitOfWork.run` with `Decision` and `afterRollback`; `PlanCommandRunner` and undo's `walk`
   moved onto it; `unitOfWorkConformance` (a)–(e) watched failing against `brokenSource`.
3. `EventLogStore`, `SavedPlanStore`, `SavedPlanCaptureStore` ports (D12 cases in the kit).
4. Reference-specific outcomes per method; `isForeignKeyViolation` deleted from `service/`.
5. `sourceConformance` assembled from the `.db.test.ts` files under the admission rule; SQLite
   kit file green; memory source tightened until green.
6. D10 in place while the code still lives in be-01: `PasswordHasher` port, `TextEncoder`,
   injectable defaults that do not name globals. Vocabulary values relocated.

### Wave 3 — `core-lib-extraction` (~2 days)

1. Three packages with `project.json`, tags, `tsconfig`, `typecheck` running
   `tsc --build --force` on the **source** project (R5 #16/#17), `test`, `lint`, `lint:fast`.
2. `git mv` in three commits, imports rewritten, `bun run test:unit` green after each.
3. Enforcement and relocation from §2, each watched: `import { Elysia } from 'elysia'` in core
   → lint; `globalThis.fetch` in core → lint; `new Database()` outside `store-sqlite/db.ts` →
   lint; a deliberately failing test in each new lib → `test:unit` red; `type:store` → `type:app`
   import → Nx boundary error.
4. `composeServices(ports)` and the four use-case entrypoints; the "any trigger" proof is a
   test in `libs/core` that composes over the memory source and runs **a command batch, a
   saved-plan save with a refused actor, one replay and one retention sweep** without HTTP.
5. Docs: `LLM_README.md`, ADR 0014 / 0015 → `accepted`, refactoring plan cross-reference.

### Wave 4 — `schema-and-document-from-specs` (optional, ~2 days, own decision)

ArkType behind the `StandardSchema` port, `documentFromSpecs` replacing `@elysiajs/openapi`,
`plan-command-schema.ts` deleted. Only worth it if a second adapter is coming; until then the
document's mounting oracle (§3.1) is the stronger check. The spike both reviewers ran shows
Elysia 1.4 accepts ArkType as a body validator and answers 422 on an undeclared key, so the
risk is **wire compatibility** (422 envelope vs `400 { error, at, kind }`), not interop.

## 5 · Non-goals

- A second HTTP adapter, and an exported HTTP kit before one exists.
- gw-01 and mcp-01 (D5). A shared `libs/http-elysia` is a later decision.
- Isolation across a source's concurrent readers (D1), and browser reuse of core (D10).
- Moving `apps/be-01/drizzle/` or the migrate CLIs; a generic migration port.
- Splitting `repository/index.ts` (W4-1, refused with measurement).
- Any behaviour change visible to fe-01 or mcp-01: same routes, bodies, refusal codes, the
  same `openapi.json`. `verify.md` explains every diff line.

## 6 · Risks and how each is checked

| Risk                                                                                  | Check                                                                                                                                    |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| The coordinator deadlocks a nested `run` (batch inside a locked route)                | Re-entrancy by owner token, tested: `run` inside `run` and a store write inside `run` both complete; a second **unrelated** caller waits |
| Elysia's inference of `params`/`body` lost at the adapter, handlers typed `unknown`   | `EndpointSpec` is generic over its schemas; `tsc` on a handler reading an undeclared field must fail (watched in Wave 1.1)               |
| A kit case passes both sources for the wrong reason                                   | Every case watched failing against `brokenSource(memory, fault)` with the fault it names; the fault list is in the case's `Proof:`       |
| Terminal atomicity tested after the fact misses in-flight visibility                  | Cases (d) and (e) assert **during** a suspended batch; isolation is documented as not promised (D1)                                      |
| Wave 2 collides with an open change on the source seam                                | Wave 0 gate, re-run before each change; `recordEventIn(tx)` reconciled into `UnitOfWork.scope` or waited for                             |
| Extraction leaves guards aimed at old folders                                         | Wave 3.3's five watched negatives; `eslint.config.js` has no `apps/be-01/src/repository` path left                                       |
| Whole-workspace gate diverges from per-project runs (2026-08-30 import-sort incident) | Every wave's `verify.md` records the **workspace** gate                                                                                  |

## 7 · Open questions for the implementer

1. `Identity` shape returned by `IdentityResolver`: the same as `userFromHeaders` today.
   Narrowing per policy is a later change.
2. `STEP_POSITION_STEP` and `stepIsInUse`: `@wbs/domain` (facts about steps) rather than core.
3. Whether `Scope` exposes all stores or only the mutating ones. Recommendation: all; a batch
   reads what it just wrote.
4. Whether `dual-optimized-scheduler`'s `recordEventIn(tx)` becomes `scope.eventLog.record` —
   decided at Wave 0 by which lands first.

## 8 · Review disposition (2026-09-05)

Two headless codex runs over this document and the code: `tmp/review-codex-ports-and-adapters.txt`
(gpt-5.6-sol xhigh, 15 findings, verdict "rethink §§2–4") and
`tmp/review-codex-astra-ports-and-adapters.txt` (gpt-6-astra xhigh, 16 findings, verdict
"rethink §3.1 and §3.2"). Every file:line cited below was re-read before the disposition.
S = 5.6-sol finding, A = astra finding.

| Finding                                                                                                                                                           | Disposition                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1, A3 — the lock guards publication only; route writes and the retention prune land inside an open batch and roll back with it                                   | **Accepted, and it is a pre-existing gap between ADR 0007's text and the code.** D11 (source-owned re-entrant coordinator), kit cases (d) and (e).                               |
| S4, A2 — `run` cannot tell a returned refusal from success; undo needs post-rollback work before release; `WriteLock` has no ownership                            | **Accepted.** `Decision<T>` with `afterRollback`; re-entrancy by owner token; §3.2 protocol.                                                                                     |
| A3 — "not observable at all" over-promises on a shared connection                                                                                                 | **Accepted.** D1 narrowed to terminal atomicity; isolation explicitly not promised; ADR 0015 amended.                                                                            |
| S2, A1, A6 — origin check is global, write-scope is pre-parse; `caller` cannot express either                                                                     | **Accepted.** `RequestPolicy[]` separate from identity; adapter phases specified; three negatives added.                                                                         |
| S3, A5 — `HttpReply.headers` cannot carry three `Set-Cookie`; the callback re-reads the raw request; empty vs `null`                                              | **Accepted.** Ordered multimap, `request` on the input, `EMPTY` sentinel, adapter-local cases for 302 / cookies / 204.                                                           |
| S15, A6, A15 — ArkType blanket rejection changes the wire (422 envelope vs `400 {error,at,kind}`; unknown fields are ignored today); interop is not the blocker   | **Accepted.** Wave 1 keeps TypeBox behind a `StandardSchema` port and keeps the emitter; ArkType is optional Wave 4; `unknownKeys` per shape.                                    |
| S6, A9 — `document` too small for mcp-01 (`operationId`, inline bodies); spec-derived diff loses the mounting oracle                                              | **Accepted.** `operationId` on the spec; document still from the mounted app in Wave 1; reachability test; 28 tool names pinned.                                                 |
| S5, A7 — Wave 3 is not mechanical: `node:async_hooks`, `node:crypto`, `jose`, `Bun.password`, `Buffer`, global defaults                                           | **Accepted.** D10: core is `runtime:bun`, not isomorphic; `PasswordHasher` port; D10 work done in Wave 2 so Wave 3 is a move again.                                              |
| S7, A8 — saved-plan repositories are not ordinary Source members                                                                                                  | **Accepted.** D12: independent operations with their own kit cases, including the in-transaction quota case.                                                                     |
| S12, A11 — blanket `unknown_reference` misreports other FK failures                                                                                               | **Accepted.** D6 revised to reference-specific outcomes proven absent by the adapter; two negatives.                                                                             |
| S11, A4 — the kit admission rule ("passes both untouched → not a contract case") is backwards                                                                     | **Accepted, rule deleted.** Admission by observable behaviour; every case watched against `brokenSource`.                                                                        |
| S9, A14 — gw-01's "HTTP half" does not exist; app→app imports are forbidden; the upgrade is not an endpoint                                                       | **Accepted.** D5: gw-01 out of scope.                                                                                                                                            |
| S10, A10 — "any trigger" needs use-case entrypoints; saved-plan authorization lives in the controller; `buildServices` omits saved plans and the runner           | **Accepted.** `use-cases/`, `savePlan` carries authorization + announcement, one `composeServices`, the Wave 3.4 proof covers four triggers.                                     |
| S13, A13 — `no-restricted-imports` cannot ban globals; existing guards and `test:unit` are aimed at old paths                                                     | **Accepted.** Three rules in §2, two relocations, five watched negatives in Wave 3.3.                                                                                            |
| S8, A15 — sequencing: four open changes collide, not only TASK-241                                                                                                | **Accepted as Wave 0.** Order HTTP → stores → extraction **kept** because Wave 1 is now narrow enough not to touch the source seam; the collision gate runs before every change. |
| S14, A16 — inventory wrong: 16 stores not 22, barrel 2,063 lines and not type-only, 7 value leaks, event log is a port, saved-plan service depends on class types | **Accepted, §0 corrected.**                                                                                                                                                      |
| S15 (second half) — an exported HTTP kit with one adapter is an unvalidated abstraction                                                                           | **Accepted.** HTTP tests are adapter-local until a second adapter exists (D4).                                                                                                   |
| A12 — source lifecycle (`open / health / close`), no generic migration port                                                                                       | **Accepted.** On the `Source` port; migrations stay the SQLite adapter's.                                                                                                        |
| S8 — build package shells and enforcement **before** the seams                                                                                                    | **Declined.** An empty shell has nothing to lint; the rules bite the day files move (Wave 3). Wave 0 covers the ordering concern the finding is about.                           |
| S11 — "a successful kit certifies only the named behaviours, not that a source is correct"                                                                        | **Accepted as a sentence in the kit's JSDoc.** The kit is the definition of "correct" this repo can afford; it grows when a fault escapes it.                                    |
