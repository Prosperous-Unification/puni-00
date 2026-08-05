## 1. Schema and migration

- [ ] 1.1 Add `project`, `work_item`, `role` and `estimate` to `apps/be-01/src/repository/schema.ts` per `design.md`, with a `down.sql` that drops all four. Proven by `apps/be-01/src/repository/migrate.test.ts`: migrate up, assert the four tables exist, migrate down, assert they are gone and `users` survives.
- [ ] 1.2 Extend `buildTestServices` to seed a project with an owner, so every later test starts from a real row rather than a fixture literal.

## 2. Number derivation, without a database

The riskiest code in the change. It is a pure function over a tree, so it is tested first and alone.

- [ ] 2.1 Write failing tests in `apps/be-01/src/service/derive-numbers.test.ts`: roots number `010`/`020`/`030`; children nest to `010.1` and `010.2.1`; nine children stay one digit; a tenth repads the group to `010.01`–`010.10`; repadding one parent leaves a sibling parent untouched.
- [ ] 2.2 Add the sort test that motivated the rule: assert `['010.1','010.10','010.2']` sorted byte-wise yields `010.01 < 010.02 … < 010.10` **after** derivation, and record in a `Proof:` comment that the unpadded form sorts `010.10` second.
- [ ] 2.3 Implement `deriveNumbers(tree)` in `apps/be-01/src/service/derive-numbers.ts` as specified in `design.md`. No repository import.
- [ ] 2.4 Extend the tests to frozen anchors: a group holding frozen `010` and frozen `020` derives `011` for a work item between them; a work item between frozen `010` and frozen `011` derives `0105`; a partially frozen group reports mixed widths.

## 3. Projects, ownership and the restriction check

- [ ] 3.1 Write failing tests in `apps/be-01/src/controller/project.controller.test.ts`: create returns a project owned by the caller with roles `Dev` and `QA`; list returns every project regardless of owner; a non-owner reads a restricted project successfully.
- [ ] 3.2 **Negative test first:** a non-owner mutating a restricted project gets 403 and writes nothing. Run it with the ownership check removed and watch it pass — then restore the check and watch it fail. `Proof:` comment names the injected fault: check deleted from `project.service.ts`.
- [ ] 3.3 Implement the controller, service and repository for project create, list, read and `PATCH` of `name`/`restricted`.

## 4. Work item tree: create, move, delete

- [ ] 4.1 Write failing tests in `apps/be-01/src/service/work-item.service.test.ts`: insertion between positions `10` and `20` stores `15` and writes no sibling; insertion between `10` and `11` renumbers that group to tens and leaves other parents untouched; a work item may be created with an empty name.
- [ ] 4.2 **Negative test:** a create or update carrying a `number` field returns 400 and writes nothing, proven by removing the rejection and watching the test pass.
- [ ] 4.3 **Negative test:** deleting a work item that has children without a strategy returns 400. Then `cascade` removes the subtree, and `promote` lifts the children into their parent's place in their existing order.
- [ ] 4.4 Implement create, move and delete, with numbers derived on read through `deriveNumbers`.
- [ ] 4.5 Test the delete-and-readjust rule end to end: deleting `020` from an unfrozen project leaves `010`, `020`; deleting `020` from a frozen project leaves `010`, `030`.

## 5. Freeze and unfreeze

- [ ] 5.1 Write failing tests in `apps/be-01/src/service/freeze.test.ts`: a freeze stores every derived number; a work item created afterwards derives `011` and stores nothing; a second freeze stores `011` and rewrites neither neighbour; unfreezing a project clears every stored number.
- [ ] 5.2 **Negative test:** moving a work item that has a stored number returns 409 and writes no position. Remove the guard, watch the move succeed, restore it. `Proof:` comment names the fault.
- [ ] 5.3 Implement project freeze, single-work-item unfreeze and project unfreeze.

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
