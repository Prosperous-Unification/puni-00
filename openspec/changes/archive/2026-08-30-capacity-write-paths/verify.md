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

**CI:** run
[31617039718](https://github.com/Prosperous-Unification/wbs-tool-v1/actions/runs/31617039718)
at head `a32ee68` — `gate` pass 3m38s, `pixels` pass 7m58s, conclusion `success`.

The run before it, `31616276345`, failed `gate` on `format:check` alone: this
file, unformatted. Recorded rather than quietly replaced — a verify.md that
shows only the green run is the record defect this repo has held two changes
for. The only commit between the two is prettier's reflow of the tables below.

Filling those figures in moved this file and therefore the head, so there is a
third run,
[31617773647](https://github.com/Prosperous-Unification/wbs-tool-v1/actions/runs/31617773647)
at head `c2fca51` — `gate` pass 3m28s, and `pixels` **failing on its first
attempt and passing on a rerun**, 8m07s. The failure was
`dark-mode.spec.ts:239 › is dark at the first paint, before the app has mounted`,
against a `WebServer` log full of `ws proxy error: write ECONNRESET` and `EPIPE`.
`git diff a32ee68 c2fca51 --stat` is this file and nothing else, and the run at
`a32ee68` had already passed `pixels` on the identical fe-01 tree — so that is a
flake in the browser gate, not this change, and it is written down rather than
rerun quietly. No fe-01 or gw-01 file is touched by this branch at all.

The commit after `c2fca51` adds this paragraph and nothing else.

**The cross-review fixes** re-ran the gate on h2puni at the same numbers — be-01
**680 pass, 0 fail**, 24,318 `expect()` calls, 16.83s; `lint` and `typecheck`
pass; `format:check --all` clean; openspec 37/37 — and CI
[31625199549](https://github.com/Prosperous-Unification/wbs-tool-v1/actions/runs/31625199549)
passed both jobs first attempt at head `534d7c6`: `gate` 2m53s, `pixels` 8m0s.
That head was then rebased onto `main` @ `c085998` (#52 `gantt-handle-z` merged;
no file in common with this branch, `comm -12` over both name lists is empty),
which is the head CI runs last before the merge. This paragraph is the only
change after `534d7c6`.

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
| `fieldsOf` names `maxParallel`               | the line deleted, so the patch journals nothing           | all **three** parallelism undo tests, each at its `expectDone` (`:226`, `:245`, `:259`) — `refused: stale_undo — “Strip” has changed since then`                                                                             |
| `revertTo` carries the before-value          | the line deleted, so the inverse is `{}`                  | the same three, each reporting the undo **done** and failing on the value read back after it: `Expected: 3, Received: 5` (`:227`), `1`/`3` (`:250`), `4`/`1` (`:261`)                                                        |
| team size integer guard                      | the throw deleted                                         | `refuses a size that is not a whole number of 1 or more` — `[200, "0"]`, a team of no slots written                                                                                                                          |
| team size ceiling                            | the ceiling deleted, integer guard left                   | `refuses a size above what a team can mean` — `status: 200`, the row back as `size: 1001`                                                                                                                                    |
| `resizeTeam` refuses a missing team          | the empty-`returning` branch replaced by a fallback row   | `refuses a size for a team that is not there, and tells nobody` — `ok: true` carrying a result for an id nothing holds                                                                                                       |
| `projectsLabelled` reads every labelled row  | narrowed to rows nothing calls a parent                   | `tells a project the team reaches only through inheritance` — `[]` where one `directory_changed` was owed                                                                                                                    |
| the usage reads the **effective** team       | replaced by `row.serviceTeamId === teamId`                | `names the capacity a sized team takes with it, inherited rows included` — the inheriting leaf `API` gone from the confirmation entirely                                                                                     |
| the capacity effect is conditional on a size | the null-size arm replaced by a default of 1              | `says nothing about capacity when the team was never sized` — two rows told `capacity_released, size: 1` when nothing could move them                                                                                        |
| the engine refuses a width below one         | the check deleted                                         | `refuses a slice claiming no people at all` — `duration: Infinity`, `earliestFinish: Infinity`, `latestStart: NaN`, `float: NaN`; and `refuses a width that is not a whole number of people` — `duration: 2.4`               |

Two of those rows — the `fieldsOf` and `revertTo` pair — said something else
until the 2026-08-12 cross-review; see the section below for what they said and
why it was wrong. Both injections were re-run before the rows were rewritten.

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

## The 2026-08-12 cross-review

Three passes at head `be987f1`: `codex` (HOLD), `agy` (MERGEABLE), and a third
that ran the injections rather than reading them. Two things were fixed before
the merge, both records rather than code:

- **`revertTo`'s watched red had `fieldsOf`'s observation copied onto it.** Its
  `Proof:` comment and the table row above both said the injection fails at the
  **first** undo on `refused: stale_undo`. It does not: with the inverse reduced
  to `{}` the store takes its no-field branch, the undo reports **done** having
  written nothing, and the value assertion after it is what fails. Re-running
  both injections also showed each of them failing **three** tests rather than
  the two both rows named — `puts a reset to one at a time back to the number it
replaced` fails under both and was in neither record. Same class as #48's F8,
  and the same rule: an observation copied off the neighbouring row is not an
  observation.
- **`directory-usage.ts`'s JSDoc claimed the rows it names and the rows whose
  dates move "cannot drift apart".** They drift both ways. A parent labelled
  with the sized team whose children each carry their own is named and moves
  nothing — `slicesOf` skips a row with children, so no slot of that pool was
  ever spent on it. And releasing a pool moves the dependency successors of the
  released rows and the rolled-up brackets of every ancestor above them, which
  have a different effective team and get no effect. The payload was right and
  the sentence was stronger than the code; it now says what the read can carry.

Downgraded, recorded rather than fixed. None of these is a defect in what the
code does:

1. **No DB `CHECK` on `work_item.max_parallel` or `service_team.size`, and
   `readCommand` casts a journal it trusts** — codex's two P1, taken as P3. No
   reachable path lands a bad value: every producer of a parallelism is the
   validated controller, `create` writes 1, `insertSubtree` copies an
   already-valid row, the journal holds only patches that passed the controller,
   and an ESLint rule bans reaching around the repository layer. The second
   layer codex asks for is the engine refusal this change added, for that exact
   argument in #48's review. A `CHECK` is a genuine third layer and a follow-up.
2. **The C2-before-C3 pin is a test, not a gate.** `puts a capacity floor on the
wire, which nothing this change ships can draw` is green today, green if the
   hazard is ignored, and green after C3 fixes it; the constraint is the comment
   above it. The cheap improvement is on the other side of the wire, where
   `apps/fe-01/src/components/wbs/gantt-geometry.test.ts:422` builds its unknown
   floor as an invented `resourceCalendar` where the real sixth name is
   `capacity` — one word, after which `grep -rn capacity apps/fe-01` stops
   coming back empty for the tier that throws. This branch touches no fe-01
   file and leaves that to C3.
3. **Undo is a second path around `has_children`, and nothing says so.**
   `apply`'s `patch` arm calls the store directly, so an undo restoring a
   parallelism onto a row that has since gained children is not refused. The
   result is the documented inert number, so it is correct — but the
   `set_estimate` arm four lines below guards the same shape of row, and
   `design.md` names only the read-then-write race.
4. **A dead branch in the size route.** `directory.controller.ts:205`'s
   `'taken'` ternary and `statusFor`'s 422 fallback are both unreachable —
   `DirectoryService.resizeTeam` returns exactly one refusal, `not_found`.
5. **Each controller grew its own `MOST_PEOPLE_AT_ONCE = 1000`, and `BadSize` is
   `BadRequest` under another name.** Two limits that are the same number and
   mean different things is arguably correct; two error classes of identical
   shape with two `onError` arms that differ only in the class they test is
   duplication.
6. **The more dangerous guard is the one whose test shows less.** Deleting the
   parallelism guard answers **500** on the write itself. Deleting the size
   guard answers **200**, and the project 500s on the next read, by somebody who
   did not make the write. The size test asserts only the 400, and the table
   above draws the reader's attention to the 500.
7. **`PATCH /api/teams/:id/size` checks a token and nothing else** — the
   directory's existing model, where rename and remove are the same and remove
   is more destructive. Recorded because this route's own argument for the wider
   fan-out, "a size moves every date in the plan", is also an argument about
   authorisation that nobody has had, and dev has open registration.

The merge-safe claim was checked on the box rather than taken from the doc: no
poller, no deploy job in `ci.yml`, no `puni1` crontab or timer touching the
checkout, and `/home/puni1/wbs-dev/src` sitting at `main`'s SHA. So the landmine
binds the next hand-run `./bin/dev-deploy.sh` — for **any** reason, including
the fe-01 PRs queued behind this one.

## Plan versus reality

In `design.md`, one row per divergence, seven of them. Two are additions this
change made that the plan does not contain: the engine's own width refusal
(finding 1 of #48's review) and the landmine above (finding 2).
