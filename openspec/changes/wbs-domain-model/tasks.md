## 1. Schema and migration

- [x] 1.1 Add `project`, `work_item`, `role` and `estimate` to `apps/be-01/src/repository/schema.ts` per `design.md`, with a `down.sql` that drops all four. Proven by `apps/be-01/src/repository/migrate.test.ts`: migrate up, assert the four tables exist, migrate down, assert they are gone and `users` survives. Migration `20260805154500_add_wbs_domain`.
- [x] 1.1a **Unplanned, and a prerequisite for 1.1's foreign keys.** `openDatabase` set `PRAGMA foreign_keys = ON` on every connection and `assertPragmas` verified only WAL and `busy_timeout` — so the pragma the domain schema leans on was requested and never confirmed. A build without foreign key support accepts the pragma and reports 0, which would make every reference in the new tables decorative. `Proof:` the test in `db.test.ts` was watched failing with "Received function did not throw" before the check existed.
- [x] 1.2 ~~Extend `buildTestServices`~~ — **that function does not exist in this repo**; the name was carried over from `wire-be-01-runtime-layer-a`'s tasks when this file was written. The fixture here is `testing/auth-fixture.ts`, so the equivalent is `testing/project-fixture.ts`: `inMemoryProjects()` holding the same guarantees the schema does, and `testProjectService()` for the ten `buildApp` call sites that only need the app to construct.

## 2. Number derivation, without a database

The riskiest code in the change. It is a pure function over a tree, so it is tested first and alone.

- [x] 2.1 Write failing tests in `apps/be-01/src/service/derive-numbers.test.ts`: roots number `010`/`020`/`030`; children nest to `010.1` and `010.2.1`; nine children stay one digit; a tenth repads the group to `010.01`–`010.10`; repadding one parent leaves a sibling parent untouched. Plus the hundredth root widening to `0010`–`1000`.
- [x] 2.2 Add the sort test that motivated the rule: assert `['010.1','010.10','010.2']` sorted byte-wise yields `010.01 < 010.02 … < 010.10` **after** derivation, and record in a `Proof:` comment that the unpadded form sorts `010.10` second. **It first passed against the empty stub** — a check that could not fail — so it now asserts every number is present and non-empty before comparing.
- [x] 2.3 Implement `deriveNumbers(tree)` in `apps/be-01/src/service/derive-numbers.ts` as specified in `design.md`. No repository import.
- [x] 2.3a A work item unreachable from any root throws rather than being returned unnumbered, which covers both an orphaned `parentId` and a parent cycle. `Proof:` watched failing with "Received function did not throw".
- [x] 2.4 Frozen anchors done. Three helpers carry it: `below` for a work item added above the first anchor (`010` yields `005`), `between` for one added among them, and `stepLastDigit`. **`between` was wrong first time** — it appended on any adjacent digit pair, so `010`/`020` gave `0105` when `011` was free. It now steps the last digit and keeps that only if it still sorts below the ceiling, which is why `010`/`011` still gives `0105`.

## 3. Projects, ownership and the restriction check

- [x] 3.1 Write failing tests in `apps/be-01/src/controller/project.controller.test.ts`: create returns a project owned by the caller with roles `Dev` and `QA`; list returns every project regardless of owner; a non-owner reads a restricted project successfully.
- [x] 3.2 **Negative test first:** a non-owner mutating a restricted project gets 403 and writes nothing. `Proof:` `canEdit` in `project.service.ts` was replaced with `return true`, and the run reported `Expected: 403, Received: 200` with exactly that one test failing — so the assertion tracks the guard rather than something incidental. Restored, green.
- [x] 3.3 Implement the controller, service and repository for project create, list, read and `PATCH` of `name`/`restricted`. `canEdit` is exported from the service because every later mutation asks the same question.
- [x] 3.4 `apps/be-01/src/repository/project.test.ts` against real SQLite, including a project whose owner does not exist being rejected — which is the end-to-end proof that 1.1a's pragma assertion buys real enforcement rather than declared-and-ignored references.
- [x] 3.5 `ProjectRepository.create` is `async` deliberately: `db.transaction` is synchronous, so a constraint violation was thrown _before_ the advertised promise existed and a caller using `.catch()` would never have seen it. Found by a test that could not observe the rejection.
- [x] 3.6 Token extraction moved out of `auth.controller`'s `/me` into `middleware/authenticated.ts`, so the project routes and `/me` agree on which headers count. The `x-wbs-token` rationale moved with it, onto the symbol.

## 4. Work item tree: create, move, delete

- [x] 4.1 Placement is its own pure function, `service/place-sibling.ts`, tested without a store: midpoint between `10` and `20` writes no sibling, adjacent siblings respace the group to tens, an unknown `afterId` throws. The service tests cover empty names and nesting.
- [x] 4.2 **Negative test, and it caught a real dud.** The rejection was first written after `{ body: t.Object(...) }` — Elysia strips unknown properties before the handler, so `'number' in body` never fired and the route answered 200. The routes now parse their bodies by hand; watched failing at 200 before that change.
- [x] 4.3 **Negative test:** `Proof:` the `strategy_required` guard was replaced with `if (false)` and exactly that one test failed. Same run proved the cycle guard: moving a work item beneath itself. Both restored, green.
- [x] 4.4 Implement create, move and delete, with numbers derived on read through `deriveNumbers`. Also a cycle guard the spec did not ask for: moving a work item under its own descendant detaches the subtree from every root, and `deriveNumbers` then throws rather than returning a project quietly missing rows.
- [x] 4.5a Unfrozen half done: deleting `020` from an unfrozen project leaves `010`, `020`.
- [x] 4.5b Frozen half done in section 5: deleting `020` from a frozen project leaves `010`, `030`.
- [x] 4.6 `WorkItemRepository.remove` applies promotions _before_ the deletion and deletes ancestors-last, both forced by the foreign keys. `Proof:` dropping the reversal fails the cascade test with `FOREIGN KEY constraint failed`.

## 5. Freeze and unfreeze

- [x] 5.1 All four in `apps/be-01/src/service/freeze.test.ts`, plus unfreezing a single work item releasing only that one.
- [x] 5.2 **Negative test:** `Proof:` the `frozenNumber !== null` guard was replaced with `if (false)` and exactly that one test failed. Restored, green.
- [x] 5.3 Implemented as `freeze`, `unfreeze` and `unfreezeProject`, with `POST /api/projects/:id/freeze`, `/unfreeze` and `POST /api/work-items/:id/unfreeze`. `setFrozenNumbers` takes the whole list in one transaction: a half-frozen project is one where some numbers moved and some did not, and no reader could tell which.

## 6. Estimates and roll-up

- [x] 6.1 The shared lib is `libs/domain` (there is no `shared-lib-01` — the scaffold prompt's name, not the repo's). **It already held an `Estimate` type with `hours` and a `low|medium|high` confidence, and a `WbsItem` with `title`/`estimateHours`** — scaffold-era placeholders describing a different product, with no consumers outside their own test. `estimate.ts` is now `ThreePointEstimate`, ordering enforced by `.narrow`. `wbs-item.ts` and `dependency.ts` are still placeholders and still contradict the shipped domain; left alone as out of scope, flagged here.
- [x] 6.2 `PUT /api/work-items/:id/estimates/:roleId` called directly with `1/5/3` answers 400 `invalid_estimate`, with no front end in the path.
- [x] 6.3 `rollUp` is a pure function over rows and estimates. `Proof:` collapsing its parent branch to always take the leaf path failed exactly the four summation tests.
- [x] 6.4 **Negative test:** `Proof:` the `rolled_up` guard was replaced with `if (false)` and exactly that one test failed.
- [x] 6.5 Both directions, plus the case that distinguishes them: a _second_ child arriving must not move anything.
- [x] 6.6 `EstimateRepository`, `rollUp` on read, and the two transitions in `create`/`remove`. Each `NumberedWorkItem` also carries `rolledUp`, so the table knows which cells are computed without re-deriving the tree shape.

## 7. Broadcast

- [x] 7.1 `apps/be-01/src/service/broadcast.test.ts`, against a recording `Broadcaster` rather than a fake `PushClient` — the service should not know a gateway exists. Six cases, including one the spec did not list: a refused mutation broadcasts nothing.
- [x] 7.2 **Negative test in gw-01.** `Proof:` the check was replaced with `if (false)` and exactly that one test failed. It also broke an existing test that subscribed to `doc:a` — a name from before any whitelist existed, now pointed at `presence`. That breakage is the guard working.
- [x] 7.3 Both shapes, plus `GatewayBroadcaster`, which records to the durable event log **before** pushing and swallows a failed push: the mutation already committed and the log already has it, so a delivery problem must not tell the caller their edit did not happen.
- [x] 7.4 `apps/gw-01/src/fan-out.integration.test.ts` — gw-01 listening on a real port, three real WebSockets with real JWTs. Two subscribed to the same project both receive the push; a third watching another project receives nothing. **What it does not cover:** be-01's half, which is `EventSequencer` then `PushClient` and has its own tests — the HTTP call here is made directly. `Proof:` the subscription guard replaced with `if (false)` fails the second case.
- [x] 7.5 The refusal frame names the subscription it refuses, which made the first version of that assertion count a rejection as a delivery. It filters on `code === undefined` now.

## 8. The table

- [x] 8.1 Built as a plain table, **not** TanStack Table. be-01 returns rows already in tree order and depth is read off the number's dot count, so there is no sorting, grouping or expansion state left for a table library to own — adding one would have been API surface with nothing behind it. Parent estimate cells render greyed and `readOnly`.
- [x] 8.2 Enter, Tab and Shift+Tab, with the three-level test. Arrow-key cell movement is **not** done — the browser's own tab order covers moving along a row, and inventing a grid navigation model deserves its own decision. Indent uses a ternary rather than `siblings.at(index - 1)`: at index 0 `.at(-1)` would return the last sibling and quietly move the row somewhere nobody asked for.
- [x] 8.3 Freeze, unfreeze-all, a lock marker on frozen rows and a per-row Unfreeze button. **Drag is not implemented at all**, so there is no locked-drag message to write; keyboard indent/outdent is the only restructuring path today.
- [x] 8.4a Subscribes on mount, unsubscribes on unmount, and **refetches** rather than applying the payload: reproducing the numbering and roll-up client-side would be a second copy of the two things most likely to disagree with the server.
- [ ] 8.4b Resume-on-reconnect not wired. The socket has the protocol; this component does not use it, so a client that drops and returns refetches on the next edit rather than replaying what it missed.

## 9. Gate

- [x] 9.1 `verify.md` written: the uncached gate output, a failure-proof table of all fourteen checks with the fault injected and what the run reported, and an explicit list of what is not covered.
