# Verify

## Gate

`bunx nx run-many -t test lint typecheck --all --parallel=2 --skip-nx-cache`, run
2026-08-05 with the cache disabled so every target actually executed:

```
 NX   Successfully ran targets test, lint, typecheck for 21 projects
```

Counts at that run: 231 tests in be-01, gw-01 and `libs/*` under `bun test`, and
17 in fe-01 under vitest (fe-01 needs jsdom, which only vitest provides here).

## Failure proof

Every check below was watched failing before it was trusted. "Fault injected" is
what was changed to break it; "result" is what the run reported.

| Check                               | Fault injected                                   | Test that observed it                                                                  | Result                                                                                      |
| ----------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `foreign_keys` pragma asserted      | check absent from `assertPragmas`                | `db.test.ts` "throws when foreign keys are not enforced"                               | `Received function did not throw`                                                           |
| Numbers sort into tree order        | implementation returned an empty map             | `derive-numbers.test.ts` "produces numbers that sort into tree order"                  | **passed vacuously** — test strengthened to assert every number present and non-empty first |
| Work item reachable from a root     | guard absent                                     | `derive-numbers.test.ts` "refuses a work item whose parent is not in the project"      | `Received function did not throw`                                                           |
| Restricted project is owner-only    | `canEdit` → `return true`                        | `project.controller.test.ts` "refuses a non-owner editing a restricted project"        | `Expected: 403, Received: 200`, one test failed                                             |
| Foreign keys actually enforced      | none — positive proof                            | `project.test.ts` "refuses a project whose owner does not exist"                       | rejected with `FOREIGN KEY constraint failed`                                               |
| Client cannot choose a number       | rejection placed after `{ body: t.Object(...) }` | `work-item.controller.test.ts` "refuses a client that tries to choose the number"      | `Expected: 400, Received: 200` — Elysia strips unknown keys, so the check never ran         |
| Delete of a parent needs a strategy | guard → `if (false)`                             | `work-item.service.test.ts` "refuses a parent with no strategy"                        | one test failed                                                                             |
| No move beneath own descendant      | guard → `if (false)`                             | `work-item.service.test.ts` "refuses to move a work item beneath itself"               | one test failed                                                                             |
| Deletion ordered for foreign keys   | `[...ids].reverse()` → `[...ids]`                | `work-item.test.ts` "deletes a subtree leaves-first"                                   | `FOREIGN KEY constraint failed`                                                             |
| Frozen work item cannot move        | guard → `if (false)`                             | `freeze.test.ts` "refuses the move and writes no position"                             | one test failed                                                                             |
| No estimate on a rolled-up parent   | guard → `if (false)`                             | `estimate.test.ts` "refuses an estimate on a work item that has children"              | one test failed                                                                             |
| Roll-up sums descendants            | parent branch collapsed to the leaf path         | `roll-up.test.ts`                                                                      | four summation tests failed                                                                 |
| Subscription names are checked      | check → `if (false)`                             | `ws.controller.test.ts` "does not register a socket for an unknown subscription"       | one test failed                                                                             |
| Same, end to end on real sockets    | check → `if (false)`                             | `fan-out.integration.test.ts` "refuses a socket that asks for an unknown subscription" | one test failed                                                                             |

## Not covered

- **8.4b, resume on reconnect.** gw-01 has the protocol and be-01 has the durable
  log; the table does not use them. A client that drops and returns refetches on
  the next edit rather than replaying what it missed.
- **be-01's half of the push path in an integration test.** `EventSequencer` and
  `PushClient` have unit tests; `fan-out.integration.test.ts` calls
  `/internal/push` directly rather than through them.
- **Arrow-key movement between cells, and drag to reorder.** Neither exists, so
  neither is tested.
- **`libs/domain/wbs-item.ts` and `dependency.ts`** are scaffold-era placeholders
  that contradict the shipped domain. No consumers, left in place — see task 6.1.
