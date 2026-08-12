# verify — `capacity-write-paths`

Branch `change/capacity-write-paths`, cut from `main` @ `7a26663` (#48
capacity-engine, #49 table-mechanics, #50 dark-mode, #51 declutter-one-button all
merged) on 2026-08-12.

be-01 only, plus one line of `LLM_README.md`. Two controllers, two repositories,
two services and the engine's entry check. **No fe-01 change, no gw-01 change and
no pixel** — and that is the one thing about this change that needs reading
before it is deployed rather than merged; see `design.md`, "Shipping order", and
the landmine now in `LLM_README.md`.

The API gains one route (`PATCH /api/teams/:id/size`) and one patch field
(`maxParallel`). The team-removal confirmation payload gains an effect arm
(`capacity_released`) — additive, on a payload no client renders today.

## The gate

Run on **h2puni** over ssh, 2026-08-12. Nothing was compiled or tested on
h1claw; that box denies both.

| target                                                  | result                                                                                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                            | clean                                                                                                                                                |
| `bunx nx run be-01:test`                                | **680 pass, 0 fail**, 24,318 `expect()` calls, 20.24s                                                                                                |
| `bunx nx run fe-01:test`                                | 1,205 pass across 48 files, 63.5s — untouched by this change, run because the wire types it reads did not move                                       |
| `bunx nx run-many -t lint typecheck`                    | pass, 21 projects                                                                                                                                    |
| `bunx nx run-many -t build`                             | **not run here.** `tool-bootstrap` and `tool-devsync` refuse without `shellcheck`, which h2puni does not have. CI runs it and is the gate of record. |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json` | 37 items, 37 passed, 0 failed                                                                                                                        |

`fe-01:test` was reported flaky by Nx when it ran at `--parallel=2` beside
be-01's suite; it passed on its own run in 63.5s. Recorded rather than smoothed
over.

**CI:** run `CI_RUN` at head `CI_HEAD` — `gate` `GATE_TIME`, `pixels`
`PIXELS_TIME`, conclusion `CI_CONCLUSION`.

## The failure-proof table (R5)

Thirteen checks, thirteen injected faults, each watched failing before it was
believed. Every `Proof:` comment in the diff quotes the output below rather than
a reconstruction of it.

| check                                        | injected fault                                            | observed failure                                                                                                                                                                                                             |
| -------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxParallel` integer guard                  | the throw deleted                                         | `refuses a parallelism that is not a whole number of 1 or more` — `[500, "0"]` where `[400, "0"]` was owed. The 500 is the engine's own refusal downstream: a `0` past this line makes **every read of that project** throw. |
| `maxParallel` ceiling                        | `<= 1000` deleted, integer guard left                     | `refuses a parallelism above what a plan can mean` — `Expected: 400, Received: 200`                                                                                                                                          |
| `maxParallel` `null` → 1                     | the normalisation replaced by the plain `...patch` spread | `puts a reset to one at a time back to the number it replaced` — `SQLiteError: NOT NULL constraint failed: work_item.max_parallel`                                                                                           |
| the parent refusal                           | the `has_children` check deleted                          | `refuses a parallelism on a row that has children` — `Expected: 400, Received: 200`                                                                                                                                          |
| `fieldsOf` names `maxParallel`               | the line deleted, so the patch journals nothing           | `puts a replaced parallelism back…` and `takes a first parallelism away again…` — `refused: stale_undo — “Strip” has changed since then`                                                                                     |
| `revertTo` carries the before-value          | the line deleted, so the inverse is `{}`                  | the same two, failing at the **first** undo with the same refusal: an inverse naming no field takes the whole stack down                                                                                                     |
| team size integer guard                      | the throw deleted                                         | `refuses a size that is not a whole number of 1 or more` — `[200, "0"]`, a team of no slots written                                                                                                                          |
| team size ceiling                            | the ceiling deleted, integer guard left                   | `refuses a size above what a team can mean` — `status: 200`, the row back as `size: 1001`                                                                                                                                    |
| `resizeTeam` refuses a missing team          | the empty-`returning` branch replaced by a fallback row   | `refuses a size for a team that is not there, and tells nobody` — `ok: true` carrying a result for an id nothing holds                                                                                                       |
| `projectsLabelled` reads every labelled row  | narrowed to rows nothing calls a parent                   | `tells a project the team reaches only through inheritance` — `[]` where one `directory_changed` was owed                                                                                                                    |
| the usage reads the **effective** team       | replaced by `row.serviceTeamId === teamId`                | `names the capacity a sized team takes with it, inherited rows included` — the inheriting leaf `API` gone from the confirmation entirely                                                                                     |
| the capacity effect is conditional on a size | the null-size arm replaced by a default of 1              | `says nothing about capacity when the team was never sized` — two rows told `capacity_released, size: 1` when nothing could move them                                                                                        |
| the engine refuses a width below one         | the check deleted                                         | `refuses a slice claiming no people at all` — `duration: Infinity`, `earliestFinish: Infinity`, `latestStart: NaN`, `float: NaN`; and `refuses a width that is not a whole number of people` — `duration: 2.4`               |

One near-miss worth recording, because it is the shape this repo keeps meeting.
I first wrote a fourteenth row for the size write's **read-modify-write** hazard
— the claim that `resizeTeam` writes the number it was given rather than one it
read first. I injected the fault, and the test **stayed green**: `bun:sqlite`
transactions are synchronous, so two writes through `Promise.all` serialise
deterministically and both orders end on the same number. The claim came out of
the test's comment rather than the row going into this table; the narrow write
is argued in the repository's JSDoc, where a statement without a gate belongs.

## What is **not** proved, and said so

- **The directory concurrency test is half of what the plan asked for.** §4.1's
  test is about the directory page — one editor's response held in flight, a
  peer write landing, and the older response refused the chance to overwrite the
  newer number on screen. That page is C3's. What is here is the be-01 half, and
  it is labelled in its own comment as a **characterisation** of last-write-wins
  rather than a gate.
- **fe-01 is untouched and its Gantt cannot draw what be-01 now emits.** Not a
  defect of this change and not fixable inside its surface; pinned as a test,
  written as a landmine, and stated in the PR body. See below.
- **`build` did not run on h2puni** (no `shellcheck`). CI is the only evidence
  for it.
- **No browser ran.** There is nothing on screen in this change. `pixels` on CI
  is a regression check, not a proof of anything C2 added.

## The C2-before-C3 landmine

Recorded because PR #48's cross-review found it and it was in neither of that
change's artifacts:

1. `puts a capacity floor on the wire, which nothing this change ships can draw`
   drives real requests — `POST /api/teams`, `PATCH /api/teams/:id/size`, then a
   label and an estimate on two rows — and asserts `boundBy: 'capacity'` comes
   back on the wire with `waitingForCapacity: 1`. The hazard is now a test
   somebody would have to delete.
2. `LLM_README.md`'s Landmines section carries it, which cost three lines of the
   150-line cap: findings 3–5, all closed on 2026-08-06, are collapsed into one
   line. Pruning closed findings is what a capped index is for, and the line
   still names all three.
3. Merging is safe — nothing deploys `main` automatically. The gate is
   `./bin/dev-deploy.sh` and the prod swap, both run by hand.

## Plan versus reality

In `design.md`, one row per divergence, seven of them. Two are additions this
change made that the plan does not contain: the engine's own width refusal
(finding 1 of #48's review) and the landmine above (finding 2).
