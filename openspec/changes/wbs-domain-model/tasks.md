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

- [ ] 6.1 Add the arktype estimate schema to `shared-lib-01` and a test that `optimistic ≤ realistic ≤ pessimistic` is enforced, that fractional days pass, and that negatives fail.
- [ ] 6.2 **Negative test:** be-01 rejects an out-of-order estimate with 400 even when fe-01's check is bypassed — call the endpoint directly. Proves the two tiers are independently guarded rather than relying on the client.
- [ ] 6.3 Write failing tests for roll-up in `apps/be-01/src/service/roll-up.test.ts`: two children of 1/2/3 and 2/3/4 give a parent of 3/5/7; a role no descendant estimated is absent from the parent, and the test asserts absence rather than `0/0/0`.
- [ ] 6.4 **Negative test:** writing an estimate onto a work item that has children returns 409.
- [ ] 6.5 Test the inheritance pair: adding a first child to an estimated work item moves the estimates down in one transaction; deleting a last child writes its estimates onto the parent.
- [ ] 6.6 Implement the estimate repository, the roll-up read and the two inheritance transitions.

## 7. Broadcast

- [ ] 7.1 Write failing tests in `apps/be-01/src/service/work-item-broadcast.test.ts` against the fake `PushClient`: an estimate write pushes `work_items_changed` holding the work item and its ancestors and nothing else; a move pushes `tree_replaced`.
- [ ] 7.2 **Negative test in gw-01:** `apps/gw-01/src/controller/ws.controller.test.ts` asserts a subscribe request for a subscription that is neither `presence` nor `project:<uuid>` leaves `SubscriptionMap` empty and returns an error. Remove the format check at `ws.controller.ts:66`, watch the socket get registered, restore it. `Proof:` comment names the fault.
- [ ] 7.3 Implement the subscription format check and both payload shapes.
- [ ] 7.4 Integration test with two real sockets, following the shape of the existing presence test: socket A writes an estimate on a nested work item, socket B receives the work item and its ancestors with recalculated totals.

## 8. The table

- [ ] 8.1 Build the nested TanStack Table in fe-01: number (read-only), name, notes, then a three-column group per role. Parent rows render roll-ups, greyed and non-editable.
- [ ] 8.2 Keyboard entry: Enter adds a sibling below, Tab indents, Shift+Tab outdents, arrows move between cells. Tested with Testing Library — typing a three-level breakdown without a mouse.
- [ ] 8.3 Freeze affordances: a project-level freeze button, a per-row lock, per-row unfreeze and project unfreeze. Dragging a locked row explains why it will not move instead of failing silently.
- [ ] 8.4 Subscribe to `project:<id>` on mount, apply both payload shapes, and resume on reconnect using the existing resume points.

## 9. Gate

- [ ] 9.1 Run `bunx nx run-many -t test lint typecheck` and record the actual output in `verify.md`, with the failure-proof table for every negative test above: fault injected, test that observed it failing, result.
