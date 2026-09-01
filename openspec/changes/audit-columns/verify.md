# Verification

Run on macOS (h2puni's `bin/h2puni-gate.sh` exits **127** on this host, as it has
every session — excluded, and the CI commands were run individually instead).

## The migration, measured against a database rather than an exit code

`migrate-cli.ts` against a fresh file, then the schema read back through
`pragma table_info`:

```
tables total: 31
fully audited: 26
no gaps
```

The five that gain nothing are the five the proposal names. An exit code would
have said nothing about which columns arrived, which is why this reads them.

**The foreign key is enforced, not merely declared.** `steps-schema-rename`
shipped a `REFERENCES` clause that SQLite had not applied and the check written
for it passed against the broken database, so this asserts the clause _and_
writes through it:

```
tag references users: true
FK enforced: FOREIGN KEY constraint failed
authored row: {"created_at":5,"updated_at":5,"created_by":"u1"}
```

**The rollback runs.** `migrate-down-cli.ts --to=20260831120000_rename_role_to_step`:

```
rolled back: 20260901120000_add_audit_columns
tag columns after rollback: id,name
audit columns gone: true
```

## Watched negatives

| Check                                            | Fault injected                                            | Observed                                                                         |
| ------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `migration-lint` refuses `ADD COLUMN … NOT NULL` | the new `FORBIDDEN` entry deleted                         | `Received value must be a string: undefined` — the lint returned no issue at all |
| `audit.test.ts` — every insert names a helper    | `...auditOnUpdate(stamp)` dropped from `estimate.moveAll` | `+ ["estimate.ts: update of estimate"]`                                          |
| a new row's `updatedAt` equals its `createdAt`   | `auditOnCreate`'s `updatedAt` line deleted                | `expected null to be 1000`                                                       |
| an update leaves the author alone                | `auditOnUpdate` returning `auditOnCreate`'s three columns | `expected <sam> to be <kim>`                                                     |
| one act carries one instant                      | `auditOnCreate`'s `createdAt` changed to `Date.now()`     | the real epoch against `1500`, and the two cases above against `1000`            |

The one-instant case is asserted against the stamp's **own** figure rather than
as "the two tables agree", and that is what makes it able to fail at all: two
clock reads a microsecond apart land in the same millisecond on most runs, so an
equality between the two tables would have passed with a stray `Date.now()` in
place.

The two positive cases beside the lint's negative (`NOT NULL` **with** a default,
and the nullable audit columns) stayed green throughout, so the pattern refuses
the _statement_ rather than refusing `NOT NULL`.

## What the source test found on its first run

`audit.test.ts` reads every write in `repository/` and asserts each names
`auditOnCreate` or `auditOnUpdate`. It was written expecting to pass, and it
failed:

```
+ ["revision.ts: update of workItem", "revision.ts: update of project"]
```

`bumpWorkItems` and `bumpProject` write a `revision` column on a row that
survives the act, and nothing else in the change would have noticed them. Both
are stamped now. That finding is also what corrected the design's rule from "a
delete has no column to stamp" to "every mutating store method takes a stamp":
almost every delete here bumps a surviving parent, and `removeTeam` nulls
`work_item.serviceTeamId` besides. The method count went 37 → 47.

## Three things the existing 1261 tests found that nothing else would

Run everything, not the new test — `steps-schema-rename`'s lesson, and it paid
three times here.

**1. The audit columns were leaking into read contracts.** `db.select()` with no
projection reads every column drizzle knows about, so `assignmentsOf`,
`WorkItemStore.listByProject` / `findById`, `StepStore.listByProject` /
`findById` / `rename`, `ProjectStore.stepsOf`, `StepStore.usageOf` and four
`person` reads all began handing back three fields their declared types do not
mention — and from there into the HTTP payload and the `step_renamed` broadcast.
14 exact-shape assertions across four test files went red on it. Every one of
those reads is projected now, and the declared return types are what check each
projection is complete. Not one assertion was loosened: they were the only
detectors, and this change's own proposal says exposing these columns is a
non-goal.

Worth noting the codebase already knew this hazard — `directory.ts`'s `listTeams`
carries a comment about a bare `select()` putting a retired column "back on the
wire". The convention existed; this change had to follow it in eight more places.

**2. `resolveOidcIdentity` had grown two shapes.** It returns a stored row on the
subject path and a constructed object on the mint path, so the audit columns
appeared on one and not the other — `expect(again).toEqual(first)` caught it.
Both paths go through one named projection now.

**3. Positional `INSERT`s break on an additive migration.** Five raw
`INSERT INTO project_team_capacity VALUES ('p','t1',3)` statements in
`migrate.test.ts` failed with `table project_team_capacity has 6 columns but 3
values were supplied`. Production is unaffected — every write goes through
drizzle, which names its columns — but the columns are named in those statements
now, which is what makes them survive the next additive migration too.

## The near-miss that is now in AGENTS.md

The 76 columns were added by spreading a shared `auditColumns()` into 26 tables —
drizzle's own idiom — and one of those tables is `users`, which is the table the
helper's `created_by` points **at**. TypeScript resolved the cycle by inferring
the spread as contributing **nothing**: every row type in the schema silently
lost all three columns, and `db.select().from(tag)` came back typed
`{ id, name }`.

Nothing in the gate could see it. The migration created the columns, drizzle
wrote and read them correctly, `nx typecheck` passed (it builds
`tsconfig.lib.json`, and the schema itself is still valid), and the behaviour
tests passed while asserting on properties TypeScript believed did not exist.
The **LSP** caught it, on a test file, because the test project is out of the
typecheck gate. Fixed by writing `users`' own two columns inline with the
annotated self-reference drizzle asks for; proved with a throwaway probe
asserting `typeof tag.$inferSelect` accepts all three, which compiled clean.

Recorded as the first R5 tally entry where the thing that could not fail was a
**type**.

## Commands

| Command                                                         | Result                                |
| --------------------------------------------------------------- | ------------------------------------- |
| `bunx nx typecheck be-01`                                       | exit 0, 0 errors                      |
| `bunx bun test tools/tool-git-hooks/…/migration-lint.test.ts`   | 12 pass / 0 fail                      |
| `bunx bun test apps/be-01/src/repository/audit.test.ts`         | 4 pass / 0 fail                       |
| `bunx bun test apps/be-01/src/repository/audit-columns.test.ts` | 5 pass / 0 fail                       |
| `bunx nx test be-01`                                            | _pending_                             |
| `bunx nx lint be-01`                                            | _pending_                             |
| `bunx nx format:check --all`                                    | _pending_                             |
| `bunx openspec validate audit-columns --json`                   | valid                                 |
| `bin/h2puni-gate.sh`                                            | **excluded** — exits 127 on this host |
