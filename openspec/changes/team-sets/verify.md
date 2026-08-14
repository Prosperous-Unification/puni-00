# verify — `team-sets`

Branch `change/team-sets`, cut from `main` @ `f2d021b` (#58 capacity C5 merged)
on 2026-08-14. PR #61.

be-01, fe-01, `libs/domain` and one migration. The change is **arity**: a work
item's teams become a set, every read goes through `work_item_team`, and the
write path goes on writing at most one team and dual-writing
`work_item.service_team_id`. Production sets stay ≤ 1, so nothing observable
moves — and that claim is the whole of what has to be proved.

## The gate

Run on **h2puni** over plain ssh, at `a97e706`. Nothing was compiled or tested on
h1claw; that box denies both (`bin/block-local-builds.sh`).

| target                                                  | result                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                            | clean, exit 0                                                                                                                               |
| `bunx nx run-many -t lint typecheck --parallel=2`       | pass, **21 projects**, 42 tasks                                                                                                             |
| be-01 unit (bun **1.3.14**, in `apps/be-01`)            | **715 pass, 0 fail**, 24,646 `expect()` calls, 12.25s across **58 files**                                                                   |
| gw-01 unit (bun 1.3.14)                                 | **45 pass, 0 fail**, 8 files                                                                                                                |
| `libs/domain` unit (bun 1.3.14)                         | **49 pass, 0 fail**, 3 files                                                                                                                |
| fe-01 unit (`node vitest run`, node 22.14.0)            | **1,305 pass across 50 files, 0 fail**, 58.19s                                                                                              |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json` | **44 items, 44 passed, 0 failed**                                                                                                           |
| secrets scan over every tracked file                    | exit 0                                                                                                                                      |
| `doc-caps`                                              | exit 0                                                                                                                                      |
| migration lint over every tracked `.sql`                | exit 0                                                                                                                                      |
| `bunx nx run-many -t build`                             | **not run here** — `tool-bootstrap` and `tool-devsync` refuse without `shellcheck`, absent on h2puni. CI runs it and is the gate of record. |
| fe-01 e2e (`pixels`)                                    | CI — see below.                                                                                                                             |

The bun version is quoted beside the `expect()` count deliberately: same tree,
1.2.20 and 1.3.14 print different totals (#58's verify.md measured it both ways).

be-01 goes 696 → **715**, and every one of the 19 is new here: 4 migration cases
(the seed, capacity and membership untouched, the outgoing release's delete, the
rollback), 8 join cases in `repository/work-item.test.ts`, 4 `poolFor` cases, and
3 in the new `service/directory-usage.test.ts`. fe-01 goes 1,303 → **1,305**: the
set-not-the-column read in the table, and the joined `Team` cell in the export.
`libs/domain` goes 47 → 49 — the whole-set inheritance case and the memoisation
case, both new; the rest of that file is re-derived rather than added to.

`nx run be-01:test` and `nx run fe-01:test` are **not** how the suites were run:
under bun on h2puni the fe-01 target runs zero tests and exits 0. be-01 and gw-01
are `bun test` in their own directories; fe-01 is
`node ../../node_modules/vitest/vitest.mjs run` with node 22 on `PATH`.

**One false red, named because it cost twenty minutes and will cost the next
person the same.** The first full gate run at this head reported be-01
**545 pass / 170 fail** and a flaky `fe-01:lint`. Every failure was
`SQLiteError: disk I/O error` (196 of them): h2puni's `/tmp` is a 3.8 GB tmpfs and
it stood at **80% full**, mostly 25 stale `bunx` staging directories of 85 MB each
from 2026-08-12. Removing the ones whose owning pid was gone took it to 42%, and
the same command then gave 715/0. Nothing in the tree changed between the two
runs. If be-01 fails in bulk on that box, read `df -h /tmp` before reading the
diff.

## CI

**Run 31784631217, `conclusion: success`, first attempt, no flake.** PR #61,
head `a4112044227a1e0ba2606e77d54fa80fa03f3a32` (`a411204`), 08:36:59 → 08:45:35Z.

| job      | conclusion  | what it carried                                                                                                                                                                                                                                             |
| -------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gate`   | **success** | format, the whole run-many target, secrets scan, doc caps, compose files, migration lint. be-01 **715 pass**, gw-01 **45 pass**, `libs/domain` **49 pass**, fe-01 under `bunx vitest run` v1.6.1 inside the same target. OpenSpec **44 passed / 0 failed**. |
| `pixels` | **success** | `bun run e2e`, one real chromium against the three-app stack: **169 passed**, 7.6m.                                                                                                                                                                         |

`build` runs in that job and only there: h2puni has no `shellcheck`, so
`tool-bootstrap` and `tool-devsync` refuse it. CI is the gate of record for it,
and it is green.

The h2puni gate above ran at `a97e706`, one commit behind this run; the only
difference is `tasks.md` and `design.md` prose.

**Run 31785348703, `conclusion: success`, gate and pixels both**, at
`87ca8e31e344cd8dd079f1d1dfa0dab6c654d70b` — the head that carries this file, so
the record and the run it describes are the same tree. Two runs, two greens, no
flake and no rerun. (A third id, 31785342082, appears in `gh run list` as
`cancelled` after 13s: two pushes landed inside the concurrency group's window
and the group cancelled the older one. Nothing failed.)

## The failure-proof table

R5: every check here was watched failing with the thing it guards deliberately
broken. Each row names the fault, the test that saw it, and what the run printed.
All fourteen were watched on **2026-08-14** on h2puni.

| #   | check                                                     | fault injected                                                             | what failed, and how                                                                                                                                                                             |
| --- | --------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `effectiveTeamsOf` inherits the **whole** set             | `teamIds: own` → `own.slice(0, 1)`                                         | `inherits an ancestor’s whole set, not its first member`: `expect(received).toEqual(expected)`, `- "platform"` missing from `[ "design", "platform" ]`. 8 pass / 1 fail.                         |
| 2   | the memoisation of the walked rows                        | `for (const each of walked) found.set(each, resolved)` deleted             | `resolves a chain of unlabelled rows once…`: `expect(received).toBe(expected)` — `Received: serializes to the same string`, two equal objects. 8 pass / 1 fail.                                  |
| 3   | the ancestry cycle guard                                  | `if (seen.has(cursor)) throw …` deleted                                    | `refuses a parent chain that runs in a circle` **never returns** — the run stops after the seventh test and the shell's `timeout 120` kills it. A hang, not a red.                               |
| 4   | the migration seeds the join                              | the seeding `INSERT` struck (file cut at the second statement separator)   | `carries every label into the join, and nothing else`: `+ []` where `{ work_item_id: 'w1', team_id: 't-backend' }` was owed. 16 pass / 1 fail.                                                   |
| 5   | both foreign keys cascade                                 | `ON DELETE CASCADE` struck from both                                       | `lets the outgoing release keep removing teams against the migrated schema`: `SQLiteError: FOREIGN KEY constraint failed` at its `DELETE FROM service_team`. 16 / 1.                             |
| 6   | `patch` writes the join beside the column                 | the join `INSERT` deleted                                                  | `labels the join as well as the column` **and** `leaves the join alone when the patch does not name the label`: `+ []` where the row was owed. 14 pass / 2 fail.                                 |
| 7   | `patch` clears the join beside the column                 | the join `DELETE` deleted                                                  | `empties the join when the label is taken off`: the old row still standing. 15 pass / 1 fail.                                                                                                    |
| 8   | `insertSubtree` carries the copied rows' teams            | the derivation deleted                                                     | `carries the teams of every row a copy writes`: `Expected - 4 / Received + 0` — the copy landed with no team. 15 pass / 1 fail.                                                                  |
| 9   | `poolFor` refuses a set the engine cannot spend           | the arity guard made unreachable, so it falls through to `teamIds.at(0)`   | `refuses a set the engine cannot spend`: `Received function did not throw`. 82 pass / 1 fail.                                                                                                    |
| 10  | the usage read tests **membership**, not the first member | both `includes(teamId)` narrowed to `at(0) === teamId`                     | `names a work item labelled with the team, whichever member of its set it is`: `+ []` — a confirmation saying nothing points at a team it is about to unlabel.                                   |
| 11  | Claim B's singleton assertion                             | the fixture's join derivation replaced by one answering `[]` for every row | `answers exactly what be-01 answered…`: `Expected - 3 / Received + 1` — a labelled row whose set is empty. 2 pass / 1 fail.                                                                      |
| 12  | Claim B's lift is not the whole comparison                | (no injection needed — it was watched before the lift existed)             | the whole-document `toEqual` failed on the oracle's first labelled row with `+ "teamIds": [ "team-unsized" ]` **and nothing else in the diff**: a payload that gained a field and moved no date. |
| 13  | fe-01 reads the set, not the retired column               | `effectiveTeamLabelOf`'s own-set arm pointed back at `row.serviceTeamId`   | `reads the team out of the set, not the column beside it`: `expected 'Platform — inherited from 010 (unname…' to be null` — the cell claiming it inherits from itself. 1 failed / 425 passed.    |
| 14  | the export prints every member                            | the cell narrowed to `nameOf(plan.teams, effective.teamIds[0])`            | `prints every team of a set, joined`: `expected 'Billing, Ltd' to be 'Billing, Ltd; (unknown)'`. 1 failed / 38 passed.                                                                           |

**One check here is reasoned and not watched, and it is named rather than
implied.** `directory.ts`'s in-use count, `projectsLabelled` and `usageRowsIn`
now read the join. No fault can be injected that reddens a test while the column
and the join agree — which they do at every point in this release, by
construction — so narrowing those three reads back to the column leaves the suite
green. What makes them right is the direction of R2-4, where the column stops
being written first; what makes them safe today is that the two spellings are
written in one transaction and #6 and #7 above are what hold that.

**Two vacuous checks were found and fixed while writing this, both by running the
injection rather than by reading the code.**

- The memoisation test (#2) was first written with `rows` in tree order —
  shallowest first — and **passed with the memoisation deleted**: every row is
  already in the map before anything walks through it, so the `already` short
  circuit hands out the same object anyway. Deepest first, the fault is visible.
  R5's own rule, one more time: write the negative before you believe the line.
- The fe-01 read test (#13) first asserted only the picker's `value`, and
  **passed under its own fault**: the value is a second read of the same set, so
  it cannot say which arm of `effectiveTeamLabelOf` answered. The title can, and
  now does.

## What this change deliberately does not prove

- **Nothing here schedules against more than one pool.** `poolFor` throws on a
  set of two, which is R2-2's whole job. What is proved is that the set arrives,
  is read everywhere, and is of one member in every plan that exists.
- **Claim B replays through the in-memory stores**, so it says nothing about
  SQLite. The join being written and read at all is `repository/work-item.test.ts`
  and `repository/migrate.test.ts` against real SQLite; the two meet in
  `service/live-plan-identity.test.ts`, which runs a plan through the real
  repository and is green.
- **No browser has seen this.** The cells render what they rendered before,
  because the set is of one, and `pixels` is the only thing that can say so — it
  is in CI and nowhere else.
- **Nobody has deployed it.** Dev still serves `main`.

## Found on the way, and worth more than the change

`work_item.service_team_id` **has a foreign key.** Four JSDoc comments in this
repo state that it deliberately has none — `schema.ts`, `repository/index.ts`
twice, `repository/directory.ts`, `service/work-item.service.ts` — and the
`unknown_team` refusal's stated rationale is built on it ("nothing below this
stops a removed team's id being written").

The column was added by
`ALTER TABLE work_item ADD service_team_id text REFERENCES service_team(id)`
(`20260806190000_add_teams_and_assignees`), with no `ON DELETE` action, and
SQLite enforces it. Measured on 2026-08-14 against a migrated temp database:

- `UPDATE work_item SET service_team_id = 'ghost'` → `SQLiteError: FOREIGN KEY
constraint failed`.
- `DELETE FROM service_team WHERE id = 't1'` with one work item still naming it →
  the same error, **with no `work_item_team` row in the database at all**. This
  is what `removeTeam`'s `UPDATE … SET service_team_id = NULL` is really for: not
  cleaning up after a delete the database would allow, but making a delete the
  database refuses possible in the first place.

The behaviour is right under either reading — `unknown_team` turns a raw
constraint failure into a refusal a client can read, which is
`assignment.person_id`'s case exactly — so no code changed. The five comments
did. It is called out here because a design premise stated five times and
contradicted by the schema is the kind of thing the next change builds on.

## The record of what was run

Every command above ran on h2puni in `/home/puni1/wd/puni/wt-team-sets`, a
worktree of `/home/puni1/wbs-reds`, at `a97e706`. The injections were applied
with `python3` against the working tree and reverted with `git checkout <file>`
immediately after each run; `git status` is clean at the head this PR carries.
