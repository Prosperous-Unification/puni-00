# verify — `steps-schema-rename`

Implemented 2026-08-31. The precondition was **not** read against the live
deploy host: asked whether to take that reading, Dany answered "Prod is not
concern / Dev can be broken". The gate that would take it ships regardless — see
below for why that is the point rather than a leftover.

## The precondition this change rests on

| Fact                            | How it was checked                                                   | Result                                                                   |
| ------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| the gate refuses a live release | `bin/assert-no-prod-release.sh` + `assert-no-prod-release.test.ts`   | 7 pass, three negatives watched (below)                                  |
| no prod release is deployed     | `ssh h2puni … bin/assert-no-prod-release.sh /home/puni1/wbs/state`   | **not run, ruled unnecessary** — Dany, 2026-08-31: "Prod is not concern" |
| the lint cannot lose the gate   | `bunx nx test tool-git-hooks` + the real migration with `bin/` moved | refused with "the waiver rests on nothing"; clean with the script back   |

`LLM_README.md`'s open findings 1 and 2 are both prod-phase and record Dany's
2026-08-06 ruling that work stops at dev, so "no prod release exists" is the
documented state, and on 2026-08-31 Dany declined the live reading on top of it.

**The gate ships anyway, and that is the point.** It is not evidence that was
skipped; it is the check that makes skipping it recoverable. The day a colour is
recorded, `bin/assert-no-prod-release.sh` refuses this migration by name and
prints design D2's expand/contract as the change that must be written instead.
The migration lint refuses the migration outright if that script ever leaves the
tree, so the exception cannot outlive the check that bounds it.

## Commands

| Command                                                         | Result                                                                     |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `bun test` in `apps/be-01`                                      | **1251 pass, 0 fail**, 89 files                                            |
| `bun test src/assert-no-prod-release.test.ts` in `tool-deploy`  | 7 pass, 0 fail                                                             |
| `bun test src/hooks/migration-lint.test.ts` in `tool-git-hooks` | 9 pass, 0 fail                                                             |
| `bunx nx format:check --all`                                    | exit 0                                                                     |
| `bunx nx run-many -t test lint typecheck build --skip-nx-cache` | `Successfully ran targets test, lint, typecheck, build for 23 projects`    |
| `bunx nx run tool-deploy:build` (shellcheck)                    | clean; watched failing on an injected `SC2086`                             |
| migration lint on both new SQL files                            | clean                                                                      |
| secrets scan on every changed file                              | clean                                                                      |
| `openspec validate --all --json`                                | 28 items, 28 passed, 0 failed                                              |
| `bin/h2puni-gate.sh --all`                                      | **not run** — the heavy-work lock helper does not run on this Mac          |
| `CI=1` Playwright on shifted ports                              | **not run** — no be-01 API surface changed; see below                      |
| dev deploy + applied-set read-back                              | **not run** — task 4.2, needs a push and `./bin/dev-deploy.sh` from h1claw |

## What the schema looks like now

Read back from a database built from nothing (`runMigrations` against the real
folder), not from the schema file:

- tables `step`, `step_progress`, `step_measure`; no `role`, `role_progress` or
  `role_measure`.
- `step_id` on `estimate`, `actual`, `assignment`, `plan_event`, `step_progress`
  and `step_measure`; no `role_id` anywhere.
- indexes `step_project_name`, `actual_by_step`, `step_progress_by_step`,
  `step_measure_by_step`.
- `REFERENCES "step"("id")` in all five referencing tables.

**The residue, recorded rather than left to be found.** FK and CHECK constraint
_names_ keep the spelling they were created with —
`fk_estimate_role_id_role_id_fk`, `fk_actual_role_id_role_id_fk`,
`fk_assignment_role_id_role_id_fk`, `fk_role_progress_*`, `fk_role_measure_*`,
`role_progress_state`, `role_measure_metric`. SQLite renames tables, columns and
indexes; a constraint name lives inside its table's own `CREATE` text, so moving
one means rebuilding the table — seven rebuilds, with `foreign_keys` off and an
integrity guard each, to change strings no query names and no reader reaches
for. The spec asks that no **table, column or index** name carry the word, and
none does. `schema.ts` declares the two CHECK names as the database actually
holds them, with the reason on the line above each.

## Failure proofs (R5)

| Check                                                    | Fault injected                                                                      | Test that saw it fail                                                                                                                                                         | Watched |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| an unreadable release state refuses                      | the `[ ! -r ]` arm replaced by `cat … 2>/dev/null \|\| echo ''` and a skip on empty | `refuses an unreadable state file` — `expected 0 not to be 0`                                                                                                                 | yes     |
| a recorded colour refuses                                | the loop's `printf`/`exit 1` replaced by `continue`                                 | `refuses a recorded colour` and `… on a tier other than be` — both `expected 0 not to be 0`                                                                                   | yes     |
| a missing state directory refuses                        | `[ ! -d "$STATE_DIR" ]` replaced by `exit 0`                                        | `refuses a missing state directory` — `expected 0 not to be 0`                                                                                                                | yes     |
| the gate script is shellchecked                          | `echo $STATE_DIR` appended                                                          | `nx run tool-deploy:build` — `SC2086`                                                                                                                                         | yes     |
| the lint requires the gate                               | the `existsSync(gateScriptPath(...))` requirement removed                           | `refuses the rename migration when its gate script is absent` — `Received value must be a string: undefined`                                                                  | yes     |
| the waiver is keyed on the folder, not the statement     | none needed — a live check                                                          | `refuses the same RENAME COLUMN in any other migration`                                                                                                                       | passing |
| the lint refuses the **real** migration without the gate | `bin/assert-no-prod-release.sh` moved out of the tree                               | `bun run … migration-lint.ts <the real migration.sql>` — exit 1, "the waiver rests on nothing"                                                                                | yes     |
| `down.sql` is a total inverse                            | `ALTER TABLE estimate RENAME COLUMN step_id TO role_id;` deleted from `down.sql`    | `the step rename rolls back to the schema it found` — on the **schema** comparison, `- 'role_id' / + 'step_id'`                                                               | yes     |
| …and a count-only assertion cannot see that              | the same fault, with the schema and keyed-row comparisons removed                   | the reduced test **passed**, which is design D3's claim made rather than asserted                                                                                             | yes     |
| every reference to the renamed table is rewritten        | `runMigrations` reduced to its old whole-run foreign-key decision                   | `renames the step table with every reference to it rewritten…` — `Expected to contain: "REFERENCES \"step\""`                                                                 | yes     |
| the schema names steps everywhere                        | `ALTER TABLE assignment RENAME COLUMN role_id TO step_id` deleted                   | `names steps everywhere the database does, and role nowhere` — `Received: [ "work_item_id", "role_id", "person_id" ]`                                                         | yes     |
| no comment reconciles a physical with a domain name      | the deleted boundary paragraph pasted back onto `step`                              | `leaves no comment in the schema reconciling a physical name with a domain one`                                                                                               | yes     |
| the duplicate-name message tracks the physical index     | the string left at `role.project_id, role.name`                                     | `refuses a name the project already holds…` and `refuses a rename onto a name already in use…` — `SQLiteError: UNIQUE constraint failed: step.project_id, step.name` escaping | yes     |

## Checks that could not fail, found while writing this

**1. The rename produced two different schemas depending on which database it
landed on, and the obvious verification could not see it.** `ALTER TABLE role
RENAME TO step` rewrites other tables' `REFERENCES` clauses **only when
`PRAGMA foreign_keys` is on when the statement is prepared**. `runMigrations`
decided that pragma **once for the whole run**: if any pending migration carried
`-- foreign-keys-off-rebuild`, every pending migration ran with foreign keys
off. On a fresh database every migration is pending — including the one marker
migration, `20260824010000_add_oidc_identity` — so the entire bootstrap ran
unenforced and the rename left five tables pointing at a table that no longer
existed. On dev, where that marker migration was applied a week ago, the same
file produced a correct schema.

The first verification written for the rename — "no table, column or index name
carries the word `role`" — **passed against the broken database**, because the
word survived only inside FK clauses and constraint names. So did the whole
spec's own scenario. What found it was running the 1249 existing tests: 161
failures reading `SQLiteError: no such table: main.role`. The fix is
`pendingNeedingForeignKeysOff` in `migrate.ts`, which narrows the foreign-key-off
window to the migrations that ask for it, and the check is now the reference
clause itself plus a live write through it.

**2. A byte-exact schema comparison would have failed on every correct
rollback.** The round trip's first cut compared `sqlite_master.sql` verbatim.
SQLite rewrites that text on an `ALTER TABLE … RENAME` and re-quotes the
identifiers it touched with `"` where drizzle wrote backticks, so a table
renamed and renamed back is the same schema and a different string — a 23-line
diff, every line a quote character. Quote characters are normalised now and
nothing else is, so every **name** stays in the comparison.

**3. A guessed `Proof:` named an assertion the fault never reaches** — the
`name-links-and-height` lesson, repeating. The comment for
`names steps everywhere the database does` first named the table rename as its
fault; injected, the migration's own
`CREATE UNIQUE INDEX step_project_name ON step` fails inside `runMigrations`, so
`beforeEach` dies and the assertion is never evaluated. Corrected to the
`assignment` column rename, which the migration survives, and rewritten from the
observed output.

**4. Renaming the "it is gone" assertions in `migrate.test.ts` would have made
them unfalsifiable.** That file's raw SQL runs against whichever schema the
`runMigrations` or `rollbackTo` above it left, and the rename is the newest
migration — so below any rollback the tables are `role`, `role_progress` and
`role_measure` again. `expect(tables).not.toContain('step_progress')` after such
a rollback is satisfied the moment the rename is reversed, whether or not the
table it became was ever dropped. Those statements deliberately still say
`role_*`; each renamed line was classified by the last migration call in its own
body rather than swept.

## Skipped or unavailable checks

- **`bin/h2puni-gate.sh --all` was not run.** It `exec`s
  `bin/with-heavy-lock.sh`, which does not run on this Mac. Its two commands were
  run directly instead: `nx format:check --all` (exit 0) and
  `nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache`,
  which reported `Successfully ran targets test, lint, typecheck, build for 23
projects` with no failed tasks. **Nothing serialised this work against another agent's**, so
  this is not evidence about a composed `main` — `docs/2026-08-30-agent-loop-audit.md`.
- The pre-existing test-project typecheck errors named in
  `teams-and-assignees/verify.md` and `gw-01`'s `forward-client.test.ts` are
  still out of the gate's target list and are not this change's.
- **The browser gate was not run.** This change alters no API surface, no wire
  shape and no UI: `libs/domain` and `apps/fe-01` see the rename only as two
  comment lines. `bun run e2e` would be measuring an unchanged chart, and CI's
  `pixels` job runs the whole suite on every push regardless.
- **Task 4.2, the dev deploy, was not done.** The migration is read at startup
  (`docs/runbook-dev-deploy.md`), so it needs `git push` and `./bin/dev-deploy.sh`
  from h1claw, then the applied set read back and quoted here. That is the
  remaining task and it is an outward-facing action.
