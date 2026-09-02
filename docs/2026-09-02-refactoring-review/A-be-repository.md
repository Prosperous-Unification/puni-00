# Sweep A — `apps/be-01/src/repository/`

Read-only sweep of every non-test `.ts` file in `apps/be-01/src/repository/`, at
`main` `3346bb15` (155 commits past the audit's `5ec3b5f`). 25 non-test files,
**9,301 LOC**; 24 test files, 11,773 LOC.

`apps/be-01/src/repository/migrations/` **does not exist**. The migration SQL
lives at `apps/be-01/drizzle/<stamp>_<name>/{migration,down}.sql`, reached only
through `migrate.ts` and `migrate-down.ts` by path argument. Noted because it is
the first thing an agent looks for and does not find.

## What changed here since the audit's `5ec3b5f`

Twelve commits touched this directory; three are structural.

- **`b8331b74` — audit columns.** `audit.ts` (59 LOC) and `audit.test.ts` are new;
  `WriteStamp` (`index.ts:49`) reached ~50 mutating store methods; `schema.ts` grew
  `auditColumns()` / `auditColumnsBesidesCreatedAt()` (`schema.ts:39`, `:52`) onto
  26 tables. ADR 0012 is the record.
- **`d4e737c7` — role → step.** `role.ts` → `step.ts`, `role-measure.ts` →
  `step-measure.ts`, `role-progress.ts` → `step-progress.ts`; physical tables and
  indexes renamed. The domain noun now reaches the schema, which closes half of the
  audit's D4.
- **`266324df` — external refs.** A fifth dimension on `LabelledWorkItem`
  (`index.ts:478`), the `work_item_external_ref` table, and the sixth read in
  `listByProject`.

Net effect on the audit's own numbers: **D2 got worse** — `index.ts` went
1,903 → **2,017** lines; `schema.ts` 1,429 → **1,756**. **R4 got worse** — the four
identical satellite repositories are now 570 LOC and their four `listByProject`
bodies are byte-identical modulo the table name.

---

## File by file

Every finding carries a `file:line`. "none" means nothing found, not nothing looked for.

### `schema.ts` — 1,756 LOC

**Role.** The whole physical schema: 26 drizzle tables, their indexes, checks, and
~1,300 lines of JSDoc arguing each column. Also exports the two enum tuples the
domain reads (`MEASURE_METRICS:716`, `PERSON_KINDS:1450`).

**Reuse.** `auditColumns()` (`:39`) and `auditColumnsBesidesCreatedAt()` (`:52`) are
the folder's one genuinely deep reuse seam — two functions covering 26 tables' worth
of three columns — and they work. Counter-example on the same page: `check('role_progress_state', …)` (`:705`)
and `check('role_measure_metric', …)` (`:811`) still carry the **pre-rename** names
after `d4e737c7`; the constraint names in the database say `role` while the tables,
columns and code say `step`. Second: the metric list is written twice, once as the
TS tuple (`:716`) and once as a SQL string literal (`:812`); same for
`PERSON_KINDS:1450` vs `check('person_kind', …):1504`, and for
`step_progress`'s enum (`:692`) vs its check (`:705`). Three pairs that must agree
and are kept in step by nothing.

**Performance — and this is the sharpest finding in the sweep.** Three indexes exist
**in the database and not in `schema.ts`**:

| index                                               | created by                                                    | declared in `schema.ts`?                               |
| --------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| `actual_by_step` on `actual(step_id)`               | `drizzle/20260831120000_rename_role_to_step/migration.sql:74` | **no** — `schema.ts:622` declares only the primary key |
| `step_progress_by_step` on `step_progress(step_id)` | `…:76`                                                        | **no** — `schema.ts:696`                               |
| `step_measure_by_step` on `step_measure(step_id)`   | `…:78`                                                        | **no** — `schema.ts:805`                               |

`step.ts:221–238` writes three comments claiming to read _through_ these indexes.
The claim is true of the running database and false of the declared schema, so the
next `drizzle-kit generate` will emit three `DROP INDEX` statements and the counts in
`StepRepository.usageOf` and `.remove` silently become full scans. Nothing tests this.

Indexes genuinely missing, measured against `WHERE` clauses elsewhere in this folder:

- `assignment(person_id)` — scanned by `directory.ts:1077` (`removePerson`'s count) and
  `directory.ts:1170` (`projectsAssigning`). Primary key is `(work_item_id, step_id)`
  (`schema.ts:1562`), so neither query has an index.
- `assignment(step_id)` — scanned by `step.ts:371` inside the step-removal transaction.
- `estimate(step_id)` — scanned by `step.ts:220` and `step.ts:334`; primary key leads
  with `work_item_id` (`schema.ts:553`). The one satellite table that did **not** get a
  by-step index in `d4e737c7`, and nothing says why.
- `work_item(service_team_id)` — scanned by `directory.ts:1147` (`removeTeam`'s
  label-nulling `UPDATE`).
- `dependency(successor_id)` — `dependency_pair` (`schema.ts:1617`) leads with
  `predecessor_id`, so the `or(...)` at `dependency.ts:92` is half-indexed and half a scan.

**Readability/DDD.** `workItemService` (`:1316`) is a _join table between a work item
and a service_ and shares its identifier with `WorkItemService`, the 3,700-line
application class — the audit's D4 collision, unchanged. `work_item.service_team_id`
(`:376`) is a **team**, documented as "a leftover" — an R2 name that needs a paragraph
to disambiguate, which is R2's own definition of a missing type. Comment/code drift:
`schema.ts:139` tells the reader `revision` is "bumped in SQL rather than in this
process", which is true, and `revision.ts` is where; nothing links the two.

---

### `index.ts` — 2,017 LOC

**Role.** The type-only barrel: 15 store interfaces, ~48 row and outcome types,
`WriteStamp`, and 4 constants. Imported by **72** non-test files across be-01.

**Reuse.** `EstimateStore:865`, `ActualStore:920`, `StepProgressStore:979` and
`MeasureStore:1050` declare the same four methods, in the same order, with three
JSDoc blocks that say so in prose ("Deliberately the same four methods as…",
`:915`, `:970`, `:1035`). `StoredEstimate:857` / `StoredActual:895` /
`StoredProgress:953` / `StoredMeasure:1015` and `EstimateKey:1751` / `ActualKey:904` /
`ProgressKey:962` / `MeasureKey:1026` are four two-field keys written four times.
Likewise `TagWritten:535`, `WorkItemTypeWritten:562`, `ServiceWritten:589` — three
identical discriminated unions whose own JSDoc says "`{@link TagWritten}`'s shape, one
dimension over".

**Performance.** Type-only; none directly. Indirectly it is the reason four separate
transactions exist where one would do — see `moveAll` below.

**Readability/DDD.** Nine exports are consumed by **one** file, and for seven of them
that file is their own implementation, so the barrel is pure indirection for them:

| export                | line    | sole non-test consumer    |
| --------------------- | ------- | ------------------------- |
| `TagWritten`          | `:535`  | `repository/directory.ts` |
| `WorkItemTypeWritten` | `:562`  | `repository/directory.ts` |
| `ServiceWritten`      | `:589`  | `repository/directory.ts` |
| `ServiceTeamWritten`  | `:1246` | `repository/directory.ts` |
| `PersonWritten`       | `:1271` | `repository/directory.ts` |
| `PersonInsert`        | `:1195` | `repository/directory.ts` |
| `DirectoryRemoved`    | `:1357` | `repository/directory.ts` |
| `NewStep`             | `:174`  | `repository/step.ts`      |
| `StepWritten`         | `:187`  | `repository/step.ts`      |

Four more are exported and referenced **only inside `index.ts` itself**:
`DirectoryWriteRefusal:1221`, `ExternalRefWrite:731`, `OidcAccountIdentity:82`,
`StepWriteRefusal:185`. And `StepRemoval:243` has **zero** consumers anywhere — the
`StepRemoval` that `apps/fe-01/src/lib/wbs-api.ts:460` declares is a differently-shaped
type of the same name in another app, which is an R2 ambiguity across the wire.

Doc-comment bug: a stray unterminated `/**` at `:714–715` opens a second comment block
inside `WorkItemPatch` before the `externalRefs` doc.

`ExampleRepo:60` / `Example:54` are scaffold: `example.ts` is imported by nothing but
`example.test.ts`.

The `CommandJournalStore` methods (`:1934–1974`) are the **only** mutating store methods
in the folder that take no `WriteStamp` — `append`, `flip`, `restamp`, `discard`. That is
consistent with `command_journal` carrying no audit columns, but the asymmetry is stated
nowhere at the interface, so a reader comparing signatures sees four methods that look
like they were missed by ADR 0012.

---

### `directory.ts` — 1,328 LOC

**Role.** `DirectoryRepository`: tags, work item types, services, external systems,
service teams, people, memberships, team↔service ownership, and assignments. 24 public
methods over 13 tables.

**Reuse.** The densest copy site in the folder.

- Five `isDuplicateXName` predicates at `:59`, `:66`, `:71`, `:78`, `:83` — identical
  bodies differing only by the index name in the string. Each is a string match on a
  SQLite message, so each is also a silent 500 the day a migration renames its index
  (`step.ts:28–40` documents exactly that having happened once).
- Four `addX` methods — `addTeam:331`, `addTag:366`, `addService:393`,
  `addWorkItemType:847` — are the same nine-line insert-`onConflictDoNothing`-then-select
  body four times, differing by table and by the noun in the throw message.
- Three `renameX` — `renameTag:515`, `renameService:544`, `renameWorkItemType:868` —
  identical transaction bodies, differing by table and by the `projectsX` helper called.
- Three `removeX` — `removeTag:789`, `removeWorkItemType:919`, `removeService:992` —
  identical 30-line transactions: count through the join, refuse if `!cascade`,
  `bumpWorkItems`, `DELETE … RETURNING`, build the removal.
- Four `projectsX` private helpers — `projectsAssigning:1164`, `projectsLabelled:1190`,
  `projectsTagged:1202`, `projectsTyped:1220`, `projectsServiced:1241` (five) — the same
  `select projectId from <join> inner join work_item where <join>.<col> = ?`. The JSDoc at
  `:1216` concedes it: "That method line for line, and the sameness is deliberate."
- Four `usageOfX` — `:749`, `:762`, `:900`, `:970` — one line each, differing by helper.

**Performance.**

- **`assignmentsOf` (`:1263–1276`) reads the entire `assignment` table and filters in
  JavaScript.** There is no `WHERE` clause on `:1274`; the filter is `rows.filter(...)`
  at `:1275`. Called per plan read from the service, this is a full-table scan of every
  assignment in every project on the deployment to answer a question about one subtree.
  The fix is `inArray(assignment.workItemId, [...])`, which the very same file already
  writes at `:241`.
- **`usageRowsIn` (`:127`) issues a bare `reader.select().from(workItem)`** — no column
  list — after this same class's JSDoc at `:298–307` argues at length that a bare
  `select()` is how the retired `service_team.size` reached `/api/teams`. It leaks
  `created_at`, `updated_at` and `created_by` (a user id) into
  `DirectoryUsageRows.workItems` and thence into every removal-confirmation payload.
- `usageRowsIn` runs **nine queries** for every usage read (`:127`, `:128`, `:135`,
  `:145`, `:172`, `:187`, `:214`, `:219`, `:229`, `:235`, `:246` — eleven counting the
  conditional two), each scoped to _whole projects_, and is called from four `usageOfX`
  fast paths **and again inside each refusing transaction** (`:802`, `:936`, `:1013`,
  `:1083`, `:1142`). A refused tag removal on a plan with 2,000 work items reads the whole
  plan twice.
- `removePerson:1089` uses `.returning()` with no column list to obtain a `.length`.
- The five `bumpWorkItems` calls (`:805`, `:939`, `:1016`, `:1096`, plus the inline
  `revision: bumpedWorkItem` at `:1146`) are each one statement, correctly batched — no
  finding.
- `listPeople:572` and `listTeams:317` read `person_team` and `team_service` unfiltered.
  Directory-sized, and the comment says so; acceptable.

**Readability/DDD.** `usageRowsIn:109–271` is a **162-line free function** that reads
eleven tables and assembles five maps — reads only, but far past 80 lines, and it is the
one place where the four label dimensions plus refs are folded onto a row, duplicated
almost exactly by `work-item.ts:152–236`. `await Promise.resolve()` appears **fifteen
times** (`:440`, `:516`, `:545`, `:603`, `:673`, `:750`, `:763`, `:790`, `:873`, `:901`,
`:924`, `:971`, `:997`, `:1036`, `:1072`, `:1120`, `:1301`) purely to make a synchronous
drizzle transaction satisfy an `async` signature — a lint appeasement with no meaning,
and a reader's first question on every method. The class doc at `:279–291` justifies one
repository for teams+people+"who belongs to which"; it now also holds tags, types,
services and external systems, four dimensions that share no read.

---

### `work-item.ts` — 955 LOC

**Role.** `WorkItemRepository` (7 methods) and `SubtreeRepository` (1 method) — the tree
itself, its five label/ref dimensions, and the wide duplicate/restore write.

**Reuse.** `listByProject:152–236` is the same five-join-plus-fold as
`directory.ts:127–213`; the two must agree about what a `LabelledWorkItem` is and are
kept in step by nothing. The respacing loop is written three times, identically:
`insert:264–276`, `move:696–701`, `insertSubtree:809–814`. `joinRowsFor:75` exists only
to derive join rows from the retired `service_team_id` column and its own doc (`:71–73`)
schedules its deletion.

**Performance.**

- **`.returning()` with no column list at `:547`.** `updated` is the full `WorkItemRow`
  including `createdAt`, `updatedAt`, `createdBy`; it is returned as
  `{ ok: true, workItem: updated }` typed `WorkItem`, which TypeScript accepts because
  excess-property checking does not apply to a variable. At runtime the three audit
  columns travel out of the store. This is precisely the leak `WORK_ITEM_COLUMNS`
  (`:96`) and its JSDoc (`:84–95`) exist to prevent, in the same class, 450 lines later.
- **`setFrozenNumbers:713–722` issues one `UPDATE` per work item in a loop.** A freeze on
  a 2,000-row plan is 2,000 statements inside one transaction. It is the single call the
  interface doc (`index.ts:846–851`) argues must be atomic — atomic it is, batched it is not.
- **`remove:760–762` issues one `DELETE` per id in a loop** after already batching the
  estimate delete at `:759` with `inArray`. The reverse order is forced by `parent_id`;
  the per-statement shape is not.
- `patch` issues up to **six** validation `SELECT`s (`:409`, `:436`, `:448`, `:474`,
  `:498`, `:515`, `:529` — seven) before its one `UPDATE`, each a separate round trip.
- `insertSubtree:818–824` inserts rows one statement at a time; the comment at `:816–817`
  gives a real reason (parent ordering within one `VALUES` list), so this one is defensible.

**Readability/DDD.**

- **`patch` is 378 lines (`:308–685`), reads seven tables and writes six**, mixing
  precondition reads, an `UPDATE`, and five replace-whole join rewrites. It is the
  longest function in the folder and the one an agent must load whole to change any
  dimension.
- Its no-field guard (`:309–350`) is a **hand-kept list of twelve `=== undefined`
  clauses**, and the file records that the list was forgotten **four separate times** —
  proofs at `:313`, `:324`, `:330`, `:338`, `:345`, the last of which says "the third time
  this exact omission has been made in this condition". This is a check that only fails
  in production; R5's "provably breakable" is satisfied by tests written after each
  failure rather than by a shape that cannot have the fault.
- `crypto.randomUUID()` at `:646` mints ref ids inside the repository, while
  `SubtreeCopy`'s doc (`index.ts:1649–1650`) states "The caller has already decided every
  id, so nothing here is generated on the way in". Two id policies, one folder.
- `Reflect.deleteProperty(stored, 'teamIds')` at `:820` strips a field from a shallow
  copy to keep it out of a `.values()` — the same job the destructure at `:378–390` does
  properly, twelve hundred lines apart.
- `isOrphanedNotBeforeReason` (`:429`) is the one invariant correctly delegated to a pure
  function in `@wbs/domain`. It is the model for everything else the transactions decide
  in SQL.

---

### `step.ts` — 440 LOC

**Role.** `StepRepository`: a project's steps, and the six-table removal transaction.

**Reuse.** `usageOf:216–277` and `remove:319–439` count the **same five things twice** in
two different query shapes — `usageOf` with `eq(x.stepId, stepId)` (`:220`, `:227`,
`:233`, `:242`), `remove` with `inArray(x.stepId, stepInProject)` (`:334`, `:345`,
`:354`, `:366`, `:371`). The two must give the same answer for the fast path and the
authority to agree, and only a test can say they do. `StepUsageRows` is assembled twice
inside `usageOf` alone (`:250` and `:270`).

**Performance.**

- The five counts in both methods `SELECT` whole result sets and take `.length`
  (`:251`, `:271`, `:385`, `:430`) where `count(*)` would return one row. On a step used
  across a large plan, `remove` materialises every estimate, actual, progress, measure and
  assignment row just to compare against zero.
- `usageOf` runs **six** queries (`:217`, `:224`, `:230`, `:239`, `:243`, `:257`) and
  `remove` runs **eleven** statements. The three "read through `<index>_by_step`" comments
  at `:221`, `:228`, `:234` name indexes absent from `schema.ts` (see above);
  `estimate(step_id)` has no index at all, so `:220` and `:334` are scans today.
- `.returning()` with no column list at `:411`, used only for `.length` — no leak, but it
  fetches every column of the deleted row.

**Readability/DDD.** `remove:319–439` is **120 lines** mixing five reads, a refusal, five
deletes, two revision bumps and an outcome build. `assignmentsIn:57` and
`directory.ts`'s `usageRowsIn` reader parameter are the same `Pick<SQLiteBunDatabase, 'select'>`
idiom declared independently in two files. `isDuplicateName`'s doc (`:28–40`) is the
folder's best piece of writing — it names the exact coupling between a string literal and
a migration — and the fact that the coupling exists at all in five more places
(`directory.ts:59–85`) is the finding.

---

### `project.ts` — 388 LOC

**Role.** `ProjectRepository`: the project row, its per-account open history, its steps.

**Reuse.** `stepsOf:370–387` is `StepRepository.listByProject` (`step.ts:98–113`) **line
for line** — same projection, same `orderBy(step.position, step.id)`, same argued reason.
Its JSDoc at `:361–363` names the duplication and declines to remove it. Both are live:
`work-item.service.ts:1357`, `:3851` and `project.service.ts:149`, `:155` call
`projects.stepsOf`; `step.controller` calls the other.

**Performance — and the second real defect.**

`findById:216`, `findBySolutionSlug:223`, `list:232` and `update:355` all use a bare
`select()` / `.returning()`. `toProject` (`:74–146`) destructures **eight** named fields
and spreads `...rest` (`:113`, `:136`), so `createdAt`, `updatedAt` and `createdBy`
survive it. The JSDoc at `:373–376` claims the opposite in as many words — "those pass
every row through a mapper that names the fields, so the audit columns fall off there" —
and it is wrong: a rest spread names nothing.

Consequence, traced: `project.controller.ts:168` returns `{ project: found.project, … }`
and `:207` returns `{ project: outcome.result }`, and neither route declares an Elysia
`response:` schema. **`GET /api/projects/:id` and `PATCH /api/projects/:id` put
`updated_at` and `created_by` — a user id — on the wire**, undeclared by `Project`
(`index.ts:104`) and unmentioned in `openapi.json`. `listFor:263` is projected and is
therefore safe, which is what makes the inconsistency invisible from any one test.

Also: `list:232` reads every project with no limit; `update:320–329` is a second
hand-kept eight-clause `=== undefined` guard with `work-item.ts:309`'s drift shape.

**Readability/DDD.** `toProject:74–146` is the folder's only real anti-corruption
mapper — four separate refusals of malformed stored data, each with a watched proof —
and it belongs in the domain, not beside a drizzle client. `withOwnerName:164` is the same
idea for a `LEFT JOIN`. Both are the deepest code in this directory and the least
reachable by a test that does not open SQLite.

---

### `estimate.ts` — 128 · `actual.ts` — 139 · `step-progress.ts` — 139 · `step-measure.ts` — 164

**Role.** Four repositories over four satellite tables keyed on `(work_item, step)`
(`step_measure` adds `metric`). Read-all-for-a-project, set, remove, move-all.

**Reuse.** The audit's R4, now measurable to the line. The four `listByProject` bodies
(`estimate.ts:44`, `actual.ts:38`, `step-progress.ts:38`, `step-measure.ts:48`) differ
only by table name, column list and one `orderBy` term. The four `set` bodies
(`:74`, `:74`, `:75`, `:91`) differ only by conflict target and the columns in `set:`.
The four `remove` bodies (`:93`, `:88`, `:89`, `:105`) differ only by an extra `eq` in
the measure's. The four `moveAll` bodies (`:118`, `:124`, `:124`, `:149`) differ only by
table — **except** that `estimate.ts:118` bumps unconditionally while the other three
guard on `SELECT changes()` (`actual.ts:131`, `step-progress.ts:131`,
`step-measure.ts:156`). That difference is argued in `actual.ts:107–112` and is real; it
is also exactly the kind of parameter a shared seam would name once instead of a reader
having to diff four files to find it.

**Performance.**

- **All four `listByProject` do the same two-query dance**: read every work item id in the
  project (`estimate.ts:45`, `actual.ts:39`, `step-progress.ts:39`, `step-measure.ts:49`),
  then `inArray(x.workItemId, ids)`. On a 2,000-row plan that is a 2,000-element `IN`
  list built in JavaScript, four times per plan read, where
  `innerJoin(workItem, eq(x.workItemId, workItem.id)).where(eq(workItem.projectId, …))`
  — the shape `work-item.ts:160` and `directory.ts:131` already use — needs one query and
  no list.
- **Four separate transactions and up to four separate revision bumps per act.**
  `work-item.service.ts:1682–1685` calls `estimates.moveAll`, `actuals.moveAll`,
  `progress.moveAll`, `measures.moveAll` back to back on every create that gives a leaf
  its first child. Each opens its own `db.transaction` and each calls `bumpWorkItems` on
  the same two ids. Under ADR 0007 those are four nested savepoints inside the batch's
  `BEGIN IMMEDIATE`, and the `changes()` guards exist only to stop three of the four
  bumps being spurious — a cost the shape creates and then pays to avoid.
- `SELECT changes()` is issued as a separate statement three times (`actual.ts:131`,
  `step-progress.ts:131`, `step-measure.ts:156`); correctly inside the transaction in all
  three, unlike `plan-event.ts` (below).

**Readability/DDD.** Every one of the four class docs _states_ that it is a copy —
`actual.ts:16` "Deliberately shaped as a copy of `EstimateRepository`",
`step-progress.ts:16`, `step-measure.ts:16` — which is CLAUDE.md's §1 pattern verbatim:
the repo knows two things must behave identically and achieves it by copying. The
declared reason ("the failure this shape prevents is the one where estimates follow a
subtree and actuals quietly do not") is an argument **for** one implementation, not four.

---

### `dependency.ts` — 112 LOC

**Role.** `DependencyRepository`: finish-to-start edges, three writes, one read.

**Reuse.** none.

**Performance.** `removeAllFor:90–111` selects and deletes on
`or(predecessorId = ?, successorId = ?)` (`:92–95`); `dependency_pair`
(`schema.ts:1617`) leads with `predecessor_id`, so the successor arm is a scan of
`dependency`. It is called **per work item in a loop** —
`work-item.service.ts:2258` (`for (const gone of doomed) await …removeAllFor(gone, stamp)`)
and `:3520` — so deleting a 50-row subtree is 50 transactions, 50 half-scans and 50
`bumpWorkItems` statements, all nested as savepoints inside the batch. A
`removeAllForMany(ids)` taking `inArray` would be one transaction, one scan, one bump.

**Readability/DDD.** `removeAllFor`'s doc (`:77–89`) is exact about which revisions move
and why. No finding.

---

### `capacity.ts` — 154 LOC

**Role.** `CapacityRepository`: how many of one team may work at once on one plan.

**Reuse.** none.

**Performance.** `set:112–152` issues two existence `SELECT`s (`:116`, `:122`) before its
one write; both are primary-key lookups, so cheap, but three statements per capacity edit.
`slotsFor:56` and `listFor:75` are the same query answered as a `Map` and as an array —
two round trips whenever a caller wants both, and one is derivable from the other in
memory.

**Readability/DDD.** The clearest small store here. `CapacityStore`'s doc
(`index.ts:1384–1387`) states the model rule — no read of `serviceTeam.size` anywhere —
and the file honours it.

---

### `priority-band.ts` — 127 LOC

**Role.** `PriorityBandRepository`: a project's five priority bands.

**Reuse.** none.

**Performance.** `replace:102–125` is delete-all-then-insert-five inside one transaction —
correct for a whole-ladder write. No finding.

**Readability/DDD.** `listFor:61` answers `DEFAULT_PRIORITY_BANDS` from `@wbs/domain` when
the project has no rows, so absence never reaches a caller. That is a domain default read
from the domain — the pattern the rest of the folder should copy. No finding.

---

### `event-log.ts` — 111 LOC

**Role.** `DrizzleEventLogRepo`: the SSE/subscription log and its sequencer.

**Reuse.** The **only store that declares its own interfaces in its own file**
(`RecordedEvent:4`, `EventLogRepo:11`) instead of in `index.ts`. It works, and it is the
existence proof that the barrel is a convention rather than a requirement.

**Performance.** `JSON.parse(r.message)` per row at `:70` on every catch-up read.
`pruneBeyond:92–110` runs the `DELETE` (`:94`) and then reads `SELECT changes()`
(`:108`) as a **separate, untransacted statement** — the comment at `:104–107` correctly
argues against two full scans and then leaves the count exposed to exactly the concurrent
write it warns about, because nothing wraps the pair. `recordEvent:33–50` is correctly
transacted.

**Readability/DDD.** The only file writing raw `sql` template literals throughout
(`:34`, `:39`, `:45`, `:62`, `:78`, `:86`, `:95`) where every sibling uses the query
builder — a second dialect in one folder, and the one an agent will pattern-match on if
it opens this file first.

---

### `plan-event.ts` — 101 LOC

**Role.** `PlanEventRepository`: a plan's history, read and pruned. Deliberately has no
`append` — `CommandJournalStore.append` writes both rows.

**Reuse.** `asEvent:88` and `command-journal.ts`'s `asEntry:184` are the same
row-to-domain mapper with the same `JSON.parse`-the-text-columns job, written twice.

**Performance.** `pruneOlderThan:70–77` has `event-log.ts`'s bug in a stronger form: the
`DELETE` at `:71` is **awaited**, then `SELECT changes()` at `:72` is issued on the
connection outside any transaction. Between the two, ADR 0007's shared connection can
carry another statement, and the returned count is then a different statement's. The four
satellite stores do this correctly inside a transaction; these two do not.
`listFor:44` is a bare `select()`, saved from leaking only because `asEvent` names its
ten fields. `JSON.parse` runs twice per row (`:97`, `:98`) on every history read.
`filter.kinds` (`:50`) has no index behind it — `plan_event`'s two indexes
(`schema.ts:1751–1752`) are `(project_id, created_at)` and `(work_item_id, created_at)`.

**Readability/DDD.** none beyond the above.

---

### `command-journal.ts` — 197 LOC

**Role.** `CommandJournalRepository`: the per-account undo/redo stack, plus the plan-event
write that rides in its transaction.

**Reuse.** `asEntry:184` ↔ `plan-event.ts:asEvent:88` (above).

**Performance.** `append:69–119` is well built — `seq` chosen by a correlated subquery in
SQL (`:79`), the prune compared against `max(seq)` in SQL (`:97`), and the plan event
written inside the same transaction (`:105`). `stateOf:157–171` runs the same query twice
with a different `undone` value and awaits them **sequentially** (`:171`), where one
`GROUP BY undone` — or one `SELECT DISTINCT` — answers both. `entriesFor:124` is a bare
`select()`, again saved by the mapper.

**Readability/DDD.** `flip:131`, `restamp:138`, `discard:145` take no `WriteStamp`, and
`command_journal` carries no audit columns (`schema.ts:1658–1677`) — correct, but the
only four mutating methods in the folder shaped that way, and `index.ts` does not say so.

---

### `revision.ts` — 96 LOC

**Role.** The three revision expressions and the two batch-bump helpers. The `RevisionWriter`
structural type (`:17`) is what lets a bump run inside or outside a transaction.

**Reuse.** This is a **good** seam and the one to imitate: `bumpedWorkItem:29`,
`bumpedProject:32`, `bumpedWorkItemOnReparent:51`, `bumpWorkItems:75`, `bumpProject:90` —
five exports, twenty-plus call sites, one place to change the rule.

**Performance.** `bumpWorkItems:80` deduplicates before the `IN`, so a caller naming an
id twice writes once. `bumpedWorkItemOnReparent:52` decides in SQL what would otherwise
be a read-then-write. No finding.

**Readability/DDD.** `bumpedWorkItemOnReparent:52` is a **domain rule expressed as a SQL
expression** — "a row that changed parent counts, a row that only changed position does
not". It is the single fact the audit's D2 names as the reason `undo.test.ts` is 1,891
lines and wires twelve repositories: `revision + 1` lives inside a SQL statement, so the
rule cannot be tested without a database. It is 25 lines of JSDoc and one line of SQL, and
the pure function it wants to be is `(oldParent, newParent) => boolean`.

---

### `audit.ts` — 59 LOC

**Role.** Three helpers filling the audit columns: `auditOnCreate:26`,
`auditOnCreateBesidesCreatedAt:44`, `auditOnUpdate:57`.

**Reuse.** The second good seam. Three functions, ~50 write sites.

**Performance.** none.

**Readability/DDD.** The doc at `:6–19` is honest about the gap the type system leaves —
"a required parameter proves the stamp arrived and says nothing about whether it was
used" — and names `audit.test.ts` as the closer. The gap is real and the closer is a
regex over the folder's source, which is the coupling under _Agentic-workflow notes_.

---

### `db.ts` — 138 LOC

**Role.** The only file allowed to import `bun:sqlite` and the drizzle adapter. Opens the
connection, sets and **asserts** the three pragmas, exposes `Drizzle`, `Connection`, and
`drizzleOuterTransaction` — ADR 0007's `BEGIN IMMEDIATE`.

**Reuse.** none.

**Performance.** `drizzleOuterTransaction:119–137` is ADR 0007 in eighteen lines and is
correct: `BEGIN IMMEDIATE` at `:129` takes the write lock up front rather than at the
first write. `busy_timeout` 5s (`:6`) and WAL (`:24`) are the blue/green requirements.
No finding.

**Readability/DDD.** `openDatabase` already calls `assertPragmas` (`:34`); `migrate.ts:198`
calls it again immediately after `openDatabase` — a redundant assertion, harmless.
`openDatabase:20` and `openConnection:78` build a drizzle client two different ways
(`:52` vs `:81`), the second without the `logger` hook. Minor.

---

### `user.ts` — 233 LOC

**Role.** `UserRepository`: local accounts, the OIDC identity resolution, and username minting.

**Reuse.** `USER_COLUMNS:32` is the right pattern, used at `:56`, `:63`, `:106`, `:114`,
`:132`, `:144`, `:152`, `:177`. The duplicate-username string match at `:96` is the sixth
copy of `directory.ts`'s five `isDuplicateXName` predicates, written inline rather than
reusing `constraint.ts`.

**Performance.** `availableOidcUsername:204–229` is an **unbounded `for (let attempt = 0; ; …)`
loop issuing one `SELECT` per attempt** (`:221`). Collision is astronomically unlikely
given the SHA-256 suffix, which is why it is unbounded — but nothing caps it and nothing
can observe it looping. `ensureLocalIdentity:54–68` issues two `SELECT`s where one
`OR` would do. `resolveOidcIdentity` issues up to four `SELECT`s before its write
(`:131`, `:143`, `:151`, `:221`).

**Readability/DDD.** **`ensureLocalIdentity:54` is a public method on the concrete class
and is not on `UserStore` (`index.ts:75`)**, so `boot.ts:130` constructs
`new UserRepository(db)` directly and reaches past the port. It is also the one
synchronous write method in the folder. `looksLikeEmail:231` is a regex predicate — a
domain rule ("this legacy username is an address") living beside a drizzle client, and the
only place that rule is stated.

---

### `migrate.ts` — 223 LOC

**Role.** Forward migrations, with a two-group `foreign_keys = OFF` protocol and a
post-migration OIDC data repair.

**Reuse.** `FOREIGN_KEYS_OFF_MARKER` is declared at `migrate.ts:10` **and again** at
`migrate-down.ts:7`, as two identical string literals in two files that must agree. If
either drifts, a rebuild migration runs with foreign keys on and fails, or a rollback runs
with them off and corrupts silently.

**Performance.** `applyOnly:103–117` copies migration folders into a fresh
`mkdtempSync` directory on every start where a FK-off migration is pending, then deletes
it. `restoreDowngradedOidcIdentities:131` probes `sqlite_master` on **every process
start** (`:132–138`) whether or not the recovery table has ever existed. Both are
start-up-only. `runMigrations:196` opens a second connection to the same file.

**Readability/DDD.** `restoreDowngradedOidcIdentities:131–194` is **63 lines of raw SQL
knowledge about one specific migration** (`oidc_identity_downgrade`) living in the generic
runner — R3's "knowledge lives with what it describes" inverted. It belongs beside
`20260…_add_oidc_identity`, and the runner should ask the migration folder for a repair
step rather than knowing about it.

---

### `migrate-down.ts` — 225 LOC

**Role.** Rollback: read the ledger, decide what to reverse, run each `down.sql` in its own
transaction. `migrationsToRollback:42`, `duplicateMigrationStamps:98` and
`readMigrationFolders:126` are pure and separately exported — the folder's best testable
factoring.

**Reuse.** `FOREIGN_KEYS_OFF_MARKER:7` (above). `AppliedMigration:14` and
`MigrationFolder:22` are declared here rather than in `index.ts` — second existence proof,
with `event-log.ts`, that the barrel is optional.

**Performance.** `rollbackTo:169–225` toggles `PRAGMA foreign_keys` around each migration
(`:199`, `:213`, `:218` — three sites for one flag, two of them in error paths) and opens
one transaction per migration. `readMigrationFolders:126–157` does `existsSync` +
`readFileSync` per folder plus a SHA-256 per folder, on every rollback invocation. All
CLI-time. No production finding.

**Readability/DDD.** `rollbackTo:169–225` is 57 lines mixing ledger reads, hash
verification, pragma toggling, statement splitting and transaction control; the three pure
functions above it show what the rest could be. The pragma flag is set and cleared at
three separate points rather than in one `try`/`finally`, which is how a rollback that
throws between `:199` and `:200` would leave foreign keys off for the process.

---

### `health-probe.ts` — 35 LOC

**Role.** `probeSchema:30` — one `sqlite_master` query answering `'ok' | 'schema_missing'`.

**Reuse.** none. **Performance.** none — one indexed catalogue read per health request.

**Readability/DDD.** The doc at `:22–28` states what the probe **cannot** catch (an
unlinked inode) as plainly as what it can, and corrects an earlier finding that overstated
it. This is the folder's best example of R5 done right. No finding.

---

### `example.ts` — 18 LOC

**Role.** `ExampleRepository` over the `examples` scaffold table.

**Reuse.** none. **Performance.** `findById:15` is a bare `select()`; irrelevant, the row
has three columns.

**Readability/DDD.** **Dead.** No non-test file imports it; `Example` and `ExampleRepo`
(`index.ts:54`, `:60`) have no consumer either. `schema.ts:37` calls the table "scaffold"
and `audit.test.ts:51` exempts it by name. It survives only because `migrate.test.ts:367`
and `migrate-down.test.ts:632` assert the table exists — a claim about migration history,
not about this file.

---

### `constraint.ts` — 18 LOC

**Role.** `isForeignKeyViolation:16` — one string match, plus a doc explaining why a caller
must establish _which_ key before turning it into a refusal.

**Reuse.** It is the one string-match predicate that was extracted. The six duplicate-name
predicates (`directory.ts:59`, `:66`, `:71`, `:78`, `:83`, `user.ts:96`, `step.ts:44`) are
the seven that were not — and this file is the proof the extraction is possible.

**Performance.** none. **Readability/DDD.** none — the doc at `:10–14` is exact.

---

## Deepening candidates (this area)

### 1 · One satellite store behind four names

**Files.** `estimate.ts:1–128`, `actual.ts:1–139`, `step-progress.ts:1–139`,
`step-measure.ts:1–164`, `index.ts:857–1084` (four record types, four key types, four
interfaces), plus the four fixtures the audit counted.

**Problem.** Four repositories over four tables that share a key, a grain, and every
structural rule about where a row may live. Each class doc _says_ it is a copy of the one
above it (`actual.ts:16`, `step-progress.ts:16`, `step-measure.ts:16`). The four
`listByProject` bodies also share a performance fault — read every work item id, then build
a 2,000-element `IN` list — and one of the four `moveAll` bodies (`estimate.ts:118`) has
drifted to an unconditional bump the other three guard against.

**Solution.** One implementation parameterised by the table, its value columns, its key
width, and one flag for whether the move bumps unconditionally. The four store interfaces
stay as four names on the same shape so no caller changes. The `IN` list becomes an inner
join on `work_item.project_id`, once, for all four.

**Benefits.** _Locality_: the rule "a satellite follows its work item through every
structural change" is stated once instead of asserted four times in prose. _Leverage_: the
next satellite table — and the changelog says there have been three in six weeks — is a
descriptor, not a file. _Tests_: `estimate.test.ts`, `actual.test.ts`,
`step-progress.test.ts` and `step-measure.test.ts` (1,428 LOC together, each opening
SQLite) become one table-driven suite over four descriptors plus one behaviour suite per
genuine difference — the metric key and the unconditional bump.

**Deletion test.** Delete `actual.ts`, `step-progress.ts`, `step-measure.ts` and route
their three interfaces at the parameterised class: nothing else in the repo changes.
`work-item.service.ts:1682–1685` still calls four `moveAll`s; `services.ts` still
constructs four stores. The three files are pure repetition and the deletion test says so.

**Effort.** ~1 day for the collapse, ~½ day for the test rewrite.

**Risk.** Low. `audit.test.ts:110` asserts `writes.length > 40`; the collapse removes ~9
insert/update sites, and the count is currently well above the floor — check it before
merging, because that assertion failing is the intended alarm and would be a false one here.

**ADRs.** None contradicted.

---

### 2 · The three leaks a projection convention cannot prevent

**Files.** `project.ts:216`, `:223`, `:232`, `:355` and `toProject:74–146`;
`work-item.ts:547`; `directory.ts:127`; `project.controller.ts:168`, `:207`.

**Problem.** The folder's convention is "spell the column list out, because the audit
columns are recorded and not published", argued in four separate JSDoc blocks
(`directory.ts:298–307`, `work-item.ts:84–95`, `step.ts:99–102`, `dependency.ts:22–26`).
Three reads break it, and one of them documents itself as safe when it is not:

- `project.ts:373–376` claims `toProject` names the fields; it spreads `...rest`
  (`:113`, `:136`), so `updated_at` and `created_by` survive and reach
  `GET /api/projects/:id` and `PATCH /api/projects/:id` through
  `project.controller.ts:168`, `:207`, neither of which declares a response schema.
  `created_by` is a user id.
- `work-item.ts:547` `.returning()` with no column list, 450 lines below the constant that
  exists to stop it.
- `directory.ts:127` bare `select().from(workItem)`, in the same class whose JSDoc argues
  the case against bare selects.

**Solution.** Make it structural rather than conventional: one exported column map per
table beside the table in `schema.ts` (`WORK_ITEM_COLUMNS` already exists at
`work-item.ts:96` and `USER_COLUMNS` at `user.ts:32` — promote them), and one lint or
source-reading test in the shape of `audit.test.ts` that fails on a bare `select()` or
`returning()` in this folder. Change `toProject` to name its output fields instead of
spreading.

**Benefits.** _Locality_: the published shape of a table is stated next to the table
rather than in four JSDoc paragraphs that argue for it. _Leverage_: the same check covers
every future column, including the next batch of audit-style columns. _Tests_: a wire-shape
assertion becomes possible without booting Elysia — today the only thing that would catch
this is an integration test asserting a _negative_ about a JSON body, which nobody writes.

**Deletion test.** Not a pass-through — this is a defect, and deleting nothing fixes it.

**Effort.** ~3 hours for the three call sites; ~3 hours for the guard test.

**Risk.** Low, but **verify first**: fixing `project.ts` changes the JSON body of two live
routes. If any client reads `created_by` today it is reading something no type promised.

**ADRs.** None contradicted. ADR 0012's consequence section says the columns are
"recorded" — this is what makes that true.

---

### 3 · Rows out of the barrel, per-module

**Files.** `index.ts` (2,017 LOC, 72 importers) and the nine single-consumer exports listed
above.

**Problem.** The audit's D2 at 2,017 lines rather than 1,903. Seven of the nine
single-consumer exports are consumed by their _own implementation file_, four more are
referenced only inside `index.ts`, and `StepRemoval:243` has no consumer at all while a
differently-shaped type of the same name lives in fe-01. The barrel is the read set for
any change here: an agent editing `directory.ts` loads 2,017 lines to find the seven types
only `directory.ts` uses.

**Solution.** Move each store's own outcome types next to its implementation and re-export
only what crosses the folder edge. `event-log.ts:4–26` and `migrate-down.ts:14–26` already
do this and nothing objects. Keep in `index.ts` exactly the store **ports** and the row
types the service layer names, which is what the barrel's own header
(`index.ts:13–22`) says it is for.

**Benefits.** _Locality_: `TagWritten` sits where the only code that builds one sits.
_Leverage_: adding a directory dimension stops touching a 2,000-line file that 72 other
files import — today that file's mtime invalidates everything. _Tests_: a store's test can
import one module rather than the barrel, which is the precondition for the audit's item 4
(lifting the pure rules to `libs/domain`).

**Deletion test.** Delete `StepRemoval:243`, `DirectoryWriteRefusal:1221`,
`ExternalRefWrite:731`, `OidcAccountIdentity:82`, `StepWriteRefusal:185` as _exports_
(keep them as local types where referenced): `tsc --build` stays green and no runtime
changes. That is the deletion test passing for five of them outright.

**Effort.** ~1 day for the seven directory types and two step types; ~2 days for the full
split.

**Risk.** Low mechanically. Contradicts nothing, but it is a prerequisite for the audit's
#4 rather than a substitute — do it as the first slice of that, not separately.

---

### 4 · The five duplicate-name predicates become one

**Files.** `directory.ts:59`, `:66`, `:71`, `:78`, `:83`; `step.ts:44`; `user.ts:94–99`;
`constraint.ts:16`.

**Problem.** Seven string matches on SQLite constraint messages, each naming a physical
index by literal. `step.ts:28–40` records that this exact coupling already broke once — the
`role` → `step` rename made the literal stop matching, silently turning every duplicate
step name from a 409 into a 500 — and it broke in the one place that has a comment about it.
Six other literals have no such comment. `constraint.ts` is the proof the extraction works.

**Solution.** One `isUniqueViolation(err, index)` beside `isForeignKeyViolation` in
`constraint.ts`, taking the index name, plus one test that asserts every index name it is
called with exists in the schema — which is the check that would have caught the rename.

**Benefits.** _Locality_: the "bun:sqlite has no typed errors" fact is stated once.
_Leverage_: the index-existence test covers every future unique index for free.
_Tests_: the failure mode becomes a compile-or-test-time failure instead of a
production 500.

**Deletion test.** Delete all five `isDuplicateXName` in `directory.ts` and call the shared
one: the five call sites (`:500`, `:530`, `:559`, `:736`, `:887`) each gain one argument.
Nothing else changes — pure pass-through, and the test confirms it.

**Effort.** ~2 hours. **Risk.** Very low.

---

### 5 · Two batch writes and one N+1

**Files.** `work-item.ts:713–722` (`setFrozenNumbers`), `work-item.ts:760–762`
(`remove`), `dependency.ts:90–111` (`removeAllFor`) with its callers
`work-item.service.ts:2258` and `:3520`.

**Problem.** A freeze on a 2,000-row plan issues 2,000 `UPDATE`s. A subtree delete issues
one `DELETE` per row after already batching the estimate delete with `inArray` on the line
above. A subtree delete's dependency cleanup opens one transaction per work item, each
scanning `dependency` on an unindexed `successor_id` and each issuing its own
`bumpWorkItems`. Under ADR 0007 each of those transactions is a savepoint inside the
batch's `BEGIN IMMEDIATE`, so the outer write lock is held across all of them.

**Solution.** `setFrozenNumbers` becomes one `UPDATE … SET frozen_number = CASE id WHEN …`
or a temp-table join. `remove` keeps its reverse ordering but batches per depth level.
`DependencyStore` gains `removeAllForMany(ids, stamp)` — one transaction, one `inArray`
pair, one bump — and the two service loops call it once. Add the
`dependency(successor_id)` index.

**Benefits.** _Locality_: "a delete of a subtree is one act" becomes one statement instead
of a loop in the service. _Leverage_: the write lock ADR 0007 warns about is held for
proportionally less time on exactly the operations that hold it longest. _Tests_:
`db.ts:44–49`'s `logger` hook already exists so a test can count statements —
`project.test.ts:259` does this — so "a freeze costs one statement" becomes assertable,
which today it is not.

**Deletion test.** N/A — no pass-through here.

**Effort.** ~½ day plus one migration for the index.

**Risk.** Medium on `remove`: the reverse-order deletion is load-bearing for `parent_id`
and the comment at `work-item.ts:728–734` explains why. Batch only where the ordering
argument does not apply, and keep the existing test that asserts a rejected write leaves
nothing behind (`work-item.ts:1766–1768` documents it).

**ADRs.** ADR 0007 is the _reason_ to do this, not an obstacle: it says the process-wide
write lock is the price and "would be the first thing to revisit"; shortening the batch is
the cheap half of revisiting it.

---

### 6 · The three phantom indexes, and `schema.ts` as the source of truth

**Files.** `schema.ts:622`, `:696`, `:805`; `step.ts:221`, `:228`, `:234`;
`drizzle/20260831120000_rename_role_to_step/migration.sql:74`, `:76`, `:78`.

**Problem.** `actual_by_step`, `step_progress_by_step` and `step_measure_by_step` exist in
the database and not in the declared drizzle schema. `step.ts` writes three comments
claiming to read through them. Next `drizzle-kit generate` drops them.

**Solution.** Declare the three indexes in `schema.ts`, add the four genuinely missing ones
(`assignment(person_id)`, `assignment(step_id)`, `estimate(step_id)`,
`work_item(service_team_id)`) in one migration, and add a test that diffs
`sqlite_master` against `schema.ts`'s declared indexes on a freshly migrated database.
`service-untouched.test.ts:1–60` is the pattern — it already asserts schema shape from
`pragma` output rather than from the ORM.

**Benefits.** _Locality_: `schema.ts` becomes true. _Leverage_: the diff test catches every
future divergence, including the one this candidate is about. _Tests_: it is a T0-ish
check — one migrated temp database, no service wiring.

**Deletion test.** N/A.

**Effort.** ~4 hours including the migration and the diff test.

**Risk.** Low. Verify the four new indexes against real query plans before adding them —
`assignment(person_id)` and `estimate(step_id)` are clear from the `WHERE` clauses;
`work_item(service_team_id)` is on a column marked for deletion (`index.ts:366–375`,
"keeps the name for one release"), so it may be cheaper to wait for that removal than to
index a dying column.

---

### 7 · `stepsOf` deleted

**Files.** `project.ts:370–387`, `step.ts:98–113`.

**Problem.** Two identical projections with identical `orderBy`, in two classes, with a
JSDoc (`project.ts:361–363`) that names the duplication and declines to fix it because
"the schedule reads its step order through here".

**Solution.** Delete `ProjectRepository.stepsOf`; give the four callers
(`work-item.service.ts:1357`, `:3851`, `project.service.ts:149`, `:155`) the `StepStore`
they already have in scope as `this.opts.steps`.

**Deletion test.** Delete it and `tsc` names exactly four call sites, all in the service
layer, all of which already hold a `StepStore`. Two of them (`project.service.ts:149`,
`:155`) return `{ project, steps }` — one line each. That is a clean pass.

**Benefits.** _Locality_: "a project's steps come in step order" is stated once.
_Leverage_: small, but it removes a method from `ProjectStore` (`index.ts:2016`) and
therefore from every fixture implementing it. _Tests_: `project.test.ts:168` and
`step.test.ts:281` currently assert the same fact through two stores; one goes.

**Effort.** ~1 hour. **Risk.** Very low.

---

### 8 · `example.ts` deleted

**Files.** `example.ts:1–18`, `index.ts:54–63`, `example.test.ts`, `schema.ts:57–63`.

**Deletion test.** Delete `example.ts`, `Example`, `ExampleRepo` and `example.test.ts`:
nothing in `apps/` or `libs/` references any of them. Keep the `examples` **table** — it is
in the migration history and `migrate.test.ts:367` and `migrate-down.test.ts:632` assert it
survives a round trip, which is a claim about migrations, not about this code. Also drop
`'examples'` from `audit.test.ts:51`'s `EXEMPT` set once the table has no drizzle writes.

**Benefits.** One fewer store in the barrel, one fewer file in `audit.test.ts`'s scan,
one fewer thing an agent has to decide is not the pattern to copy.

**Effort.** ~30 minutes. **Risk.** None.

---

### 9 · `bumpedWorkItemOnReparent` becomes a pure predicate

**Files.** `revision.ts:51–53`, `work-item.ts:753`, `:849`, and the audit's cited
`service/undo.test.ts` (1,891 LOC, twelve repositories).

**Problem.** The rule "a row that changed parent counts as changed; a row that only moved
position does not" is a SQL expression. The audit names this as the specific reason the undo
suite has to wire twelve real repositories to test one rule.

**Solution.** A pure `changesParent(oldParentId, newParentId): boolean` in the domain, and
either compute the bump in the caller (which already knows both parents — it built the
`Reparented` list) or keep the SQL and test the predicate separately with the SQL as one
integration case rather than the only case.

**Benefits.** _Locality_: the rule moves next to the other tree rules in `libs/domain`.
_Leverage_: it is the smallest of the ~3,700 pure lines the audit wants lifted, so it is a
good first slice with a measurable payoff. _Tests_: the rule gets T0 unit tests in
milliseconds; the undo suite keeps one integration case instead of resting on twelve.

**Deletion test.** Not a pass-through.

**Effort.** ~4 hours in isolation; it is really the first task of the audit's item 4.

**Risk.** Low, but **note the tension**: `revision.ts:43–49` argues the comparison must
happen in SQL because "SQLite evaluates a `SET` against the row as it was". Moving it out
means the caller must supply the old parent, and it currently does not. Do not remove the
SQL — extract the _predicate_ it encodes and keep the expression as the writer.

---

## Agentic-workflow notes

**Read set.** Touching any store means loading `index.ts` (2,017 lines) and `schema.ts`
(1,756 lines) before the file you came for. Editing `directory.ts` is 5,101 lines minimum;
editing `work-item.ts` is 4,728. Both barrels are >85% JSDoc, so the tokens are prose about
decisions rather than code — high value once, pure cost on every subsequent visit. The
directory holds 9,301 non-test LOC and 11,773 test LOC; `migrate.test.ts` alone is 4,005.

**Barrel fan-out.** `index.ts` has **72** non-test importers across be-01, so any edit to it
invalidates the typecheck for most of the app. Nine of its exports have exactly one
consumer and seven of those are the export's own implementation
(`TagWritten:535` → `directory.ts`, `NewStep:174` → `step.ts`, and five more), so an agent
pays 2,017 lines of read to reach types that never leave one file. Five more are exported
with no consumer at all (`StepRemoval:243`, `DirectoryWriteRefusal:1221`,
`ExternalRefWrite:731`, `OidcAccountIdentity:82`, `StepWriteRefusal:185`) and therefore
look load-bearing to anything that greps.

**Hidden coupling 1 — the source-reading test.** `audit.test.ts:80` finds writes by
`text.matchAll(/\.(insert|update)\((\w+)\)/g)` over `readdirSync(FOLDER)`
(`audit.test.ts:53–60`). Three consequences an agent will not predict:
(a) moving a write **out of this directory** — which is exactly what candidates 1 and 3
do — removes it from the check silently; (b) `EXEMPT` (`:51`) is a set of drizzle _variable
names_, so renaming a table binding in `schema.ts` changes what is exempt; (c) the floor
assertion `writes.length > 40` (`:110`) fails if a consolidation removes enough write
sites, and it will read as a regression when it is the intended outcome. The test's own doc
(`:27–31`) names limitation (a); nothing names (b) or (c).

**Hidden coupling 2 — literals that shadow migrations.** Seven string matches on SQLite
constraint messages name physical index names (`directory.ts:59`, `:66`, `:71`, `:78`,
`:83`; `step.ts:44`; `user.ts:96`). `step.ts:28–40` records that the `role` → `step` rename
broke one of them and turned a 409 into an uncaught 500. An agent renaming a table has no
way to know six more literals exist unless it greps for `UNIQUE constraint failed`.
`FOREIGN_KEYS_OFF_MARKER` is a second instance: two identical literals at `migrate.ts:10`
and `migrate-down.ts:7` that must agree, in two files an agent rarely opens together.

**Hidden coupling 3 — comments that assert facts the code does not hold.** Three comments
in `step.ts` (`:221`, `:228`, `:234`) name indexes absent from `schema.ts`.
`project.ts:373–376` states `toProject` strips the audit columns; it spreads `...rest`
(`:113`) and does not. An agent that trusts JSDoc — which R3 tells it to — is misled at
both sites, and neither has a test.

**Test wiring.** **24 of 24** test files in this directory call `mkdtemp` and open a real
SQLite database (`grep -c mkdtemp *.test.ts` — every file returns ≥2). There is no in-memory
or fixture tier here at all, which is the repository half of the audit's R3. Any change to a
store means running SQLite; nothing in this folder is testable at T0 except
`migrationsToRollback`, `duplicateMigrationStamps` (`migrate-down.ts:42`, `:98`) and
`audit.ts`'s three helpers.

**The `await Promise.resolve()` tell.** It appears 15× in `directory.ts` and ~25× across
the folder, always as the first statement of an `async` method whose body is a synchronous
`db.transaction`. It is there to satisfy `require-await` against an interface that promises
a `Promise`. An LLM reading these files will pattern-match it as meaningful and reproduce
it; it means nothing, and ADR 0007 explains why the underlying synchrony exists. Worth one
sentence in the folder's doc so the next agent stops copying a lint appeasement as if it
were a concurrency idiom.

**Where a change is cheapest.** `revision.ts` (96 LOC), `audit.ts` (59), `constraint.ts`
(18), `health-probe.ts` (35) and `db.ts` (138) are small, self-describing, and have real
leverage — 386 lines that ~50 write sites depend on. Every candidate above that succeeds
does so by making one of these bigger and one of the two barrels smaller.
