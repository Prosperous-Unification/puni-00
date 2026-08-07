# Verification

## The gate, uncached

```
$ bunx nx format:write --all      # then
$ bunx nx format:check --all
(no files listed, exit 0)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      be-01   303 pass  0 fail (38 files)   — 13 new
      fe-01   433 pass  0 fail (20 files)   — 3 new

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
32 items, 32 passed, 0 failed — duplicate-subtree valid
```

`be-01:lint` failed twice on the way and is green now: `await` on bun's
`.rejects` matcher (a non-thenable, and a void expression inside another), and
an unsorted import. The rollback test awaits through a `try`/`catch` instead,
which is also the honest form — the assertions after it must not run against a
write that has not finished failing.

## The checks, and the faults that broke them

| Check                                                                           | Fault injected                                                                                                   | What the run reported                                                                                                                                                                               |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `insertSubtree` writes the whole copy or none of it (`repository/work-item.ts`) | `db.transaction((tx) => {…})` replaced by `const tx = this.db; {…}` — the same statements, run one after another | `inserts nothing when the last write in the copy violates a foreign key` failed: `["Strip", "Sockets", "Strip (copy)"]` where only `Strip` belongs. Restored, 8 pass                                |
| Internal dependencies are remapped onto the copies (`work-item.service.ts`)     | the copied edges keep `edge.predecessorId` / `edge.successorId`                                                  | `remaps a dependency inside the subtree onto the copies` failed — the copy waited for the **original's** predecessor. Restored, 46 pass                                                             |
| Only edges with **both** ends inside are copied                                 | the filter relaxed from `&&` to `\|\|`                                                                           | `leaves behind a dependency with one end outside the subtree` failed, and it failed loudly: `no copy was generated for <id>` — the R5 throw in `copyOf` catching the outside end. Restored, 46 pass |
| No copy carries a frozen number                                                 | `frozenNumber: source.frozenNumber` instead of `null`                                                            | `gives no copy a frozen number, and leaves every original with its own` failed — two rows claiming `010`. Restored, 46 pass                                                                         |
| A subtree past 500 rows is refused                                              | the `too_large` guard deleted                                                                                    | `refuses a subtree of more than 500 work items, changing nothing` failed on the outcome — `{ ok: true, result: { id } }` where a refusal belongs. Restored, 46 pass                                 |
| The route exists and is guarded (`work-item.controller.ts`)                     | the route absent, which was its state when the tests were written                                                | all four failed: happy path, 401, 404 (as `SyntaxError: Failed to parse JSON` — Elysia's own unmatched-route 404 has no body), 403 (Elysia's 404 instead). Added, 25 pass                           |
| The caret lands on the copy (`wbs-table.tsx`)                                   | the `focusNext.current` write dropped from `duplicateRow`                                                        | `copies the branch and lands the caret in the copy’s name` failed with the focus left on the Duplicate button. Restored, 433 pass                                                                   |

The `too_large` boundary has its own test rather than a fault: `copies a
subtree of exactly 500 work items` is what stops the guard quietly becoming
`>=`, since a `>=` would still pass the 501-row refusal test.

## What is not watched here

- **Cross-process atomicity.** The transaction is proved against one
  `bun:sqlite` connection with `foreign_keys` on. Two colours writing the same
  file mid-swap is the same transaction, and no test here runs two processes.
- **The in-memory fixture is not atomic**, deliberately: Maps have nothing to
  roll back, and a fixture asserting atomicity would be a check that cannot
  fail. It is stated on `inMemorySubtrees` rather than implied.
- **500 as a number.** It is a judgement — above any hand-built phase, below
  anything that makes one transaction slow — not a measurement of either bound.
- **The button on a real screen.** jsdom has no layout, so "next to Delete"
  is asserted as "in the row actions column", not as a position on Dany's
  screen.
