# Design

## The term, first

CONTEXT.md's **Plan document** already lists `snapshot` under _Avoid_, so this
change does not introduce a second meaning for the word. The domain term is
**Saved plan** — Dany's own words ("Save plan") — and the tables, routes and
types spell it that way. The queue item stays `wbs-plan-snapshots`; the product
vocabulary does not.

A Saved plan is not a Plan document: a Plan document leaves the tool for a reader
and can be imported back into a **new** project; a Saved plan never leaves the
database, is never imported, and is never applied to any project. CONTEXT.md
gains the term in slice 1.

## The shape of the problem

Three facts on `main` decide everything below.

| Fact                                    | Where                                                      | Consequence |
| --------------------------------------- | ---------------------------------------------------------- | ----------- |
| `plan_event` is a log of **commands**   | `schema.ts:1767`; `command-journal.ts:105` writes it        | Replay would be a second implementation of every command's inverse |
| …and it is pruned at 365 days           | `PLAN_EVENT_RETENTION_DAYS`, `repository/index.ts:1893`     | A saved plan built on it would expire |
| Dates are **derived**, never stored     | `schedule()` pure, `libs/domain/src/schedule.ts:1771`       | Re-deriving later restates history |
| No whole-plan version counter exists    | `project.revision` excludes work items, `schema.ts:207-215` | A saved plan cannot be a pointer |

So a saved plan is a **materialised document**. Not a pointer (nothing to point
at), not a re-derivation (the deriving code is about to change under TASK-219 and
TASK-240), and not an event-log checkpoint (pruned, and replay is wrong the
moment one command's semantics change).

## Two bodies, not one blob

```
saved_plan            id, project_id, name, created_by (by value), created_at,
                      input_schema_version, input_bytes, input_sha256,
                      schedule_schema_version, schedule_bytes, schedule_sha256,
                      schedule_input_sha256, scheduler_algorithm_id,
                      schedule_absent_reason
saved_plan_body       saved_plan_id, kind ('input' | 'schedule'), bytes
```

Two bodies rather than one because they version and fail independently:

- "no schedule was saved" is exactly *the schedule row is absent*, with a reason,
  rather than a sentinel inside a blob;
- `schedule_input_sha256 = input_sha256` is a checkable claim, so a schedule can
  never be rendered against an input it was not computed from;
- the two schemas move on different clocks — a new stored plan field does not
  invalidate every stored schedule.

**No `plan_event` high-water mark.** There is no per-project sequence in that
table, and project-setting writes (`ProjectService.update`) and step writes
(`StepService`) never reach it at all, so no marker in it describes the captured
plan. `Broadcaster.latestSeq` is a refresh cursor and must not be dressed up as a
plan version.

## The capture, and why one read snapshot is the whole difficulty

The live projection reads in **thirteen** separate awaited calls — ten at
`apps/be-01/src/service/work-item.service.ts:1285-1312` (project, work items,
estimates, actuals, progress, measures, dependencies, assignments, people, and
`broadcast.latestSeq`) and three at `:1364-1385` (`stepsOf`, `slotsFor`,
`listFor`). Twelve of them are reads of the plan and ride the snapshot;
`broadcast.latestSeq` is a refresh cursor and is not captured at all, for the
same reason it is not a plan version. A concurrent work-item edit, directory
cascade, step edit or setting change landing between any two of the twelve
produces a document describing a plan that never existed.

No counter repairs it: work-item edits deliberately do not move
`project.revision` (`schema.ts:207-215`), and priority-band writes move no
revision at all (`priority-band.ts:22-24`).

So the capture runs inside **one SQLite read snapshot** (`BEGIN DEFERRED` on a
read connection under WAL, held across every read of the projection). One
in-flight save per project is *not* the fix — it excludes another save and
nothing else.

`schedule()` runs **outside** that snapshot, over values already read out of it.
It is pure and needs no database; running it inside would hold the read
transaction open for the length of a scheduling run for no gain.

`created_at` is the instant that read snapshot opened, not the instant the
transaction committed. A slow capture makes them differ, and the honest label on
a comparison is when the plan was looked at.

**Write order: per-body byte checks → `BEGIN IMMEDIATE` → count and total quota
checks → header → input body → schedule body → commit.** The byte checks depend
on nothing in the database and may run first. The count and total must be read
*inside* the write transaction: outside it, two saves at 99 of 100 both pass and
both commit, and the bound is broken while "refused before any row is written"
stays technically true.

## Fail-fast, not queue — and the concurrency refusal is the same door

A large body is one big write. Under SQLite's single writer, a save that queues
holds every live edit in the project behind it. The named behaviour is
**fail-fast**.

Two properties are wanted from one mechanism, and the difference between them is
a timeout, not a lock:

- A save that cannot take the write lock **at all** — because another save of any
  project holds it — is `snapshot_busy`.
- A save of a project another save is already writing must be refused rather than
  serialised, **across processes**, because blue and green are two processes on
  one file and an in-memory in-flight marker is invisible to the other one.

So a save opens `BEGIN IMMEDIATE` with `busy_timeout` **0** on a connection of its
own: an immediate `SQLITE_BUSY` is the typed `snapshot_busy` refusal, and there is
no window in which a second save waits. The 5-second bound applies to the save's
*total* attempt including a bounded retry the caller may make, never to a single
blocking acquire.

Three connections are in play and none of them may be the same one: the capture's
read snapshot, the save's write connection, and whatever handle live edits use.
The read transaction is committed and released before `BEGIN IMMEDIATE` opens —
promoting a `DEFERRED` read transaction in place can fail `SQLITE_BUSY` under WAL
once another reader has touched the file, and by then the captured values are
already detached, so releasing it early costs nothing.

**The save's write connection is its own**, not the one live edits use. That is
the whole reason live editing keeps working: if a save shared the request
connection's write handle, edits would queue behind the body write regardless of
`busy_timeout`. TASK-231 states the connection topology it found and adds a
dedicated one if it is not already there — the guarantee in spec is about live
edits completing, and a shared handle silently voids it.

## Quota

Permanent records on a shared SQLite file that any authenticated account can
write to (`project.service.ts:30-40` — unrestricted projects) need a bound even
without retention. **8 MiB per body, 100 saved plans or 64 MiB per project**,
whichever binds first, as configuration constants. Exceeding any of them is a
typed refusal naming the limit, never a silent prune — pruning would delete the
thing the feature exists to keep.

The guard is a **byte** count. `eventsVisited` (`schedule.ts:264-277`) counts
levelling search work and says nothing about serialized size.

## Comparison

One function, `diffPlans(left, right)`, over two canonical plan-input values.
`current` is the live plan run through the same canonical projection, in memory,
written nowhere. So snapshot↔snapshot and snapshot↔current are one code path and
one test suite; the API takes two sides and there is no compare-to-live endpoint.

Cross-version diffs **normalise forward only**: an older body is upgraded in
memory to the newest schema for the diff. Stored bytes are never rewritten — that
is the same rule as the immutability requirement, seen from the reader. A body
version the reader does not know fails loudly. (A future schema that *removes* a
field needs an explicit down-conversion rule written at that change, not now.)

An open comparison does not swap under the reader: the list refreshes on the
existing broadcast, an open comparison offers a refresh affordance instead.

## Deletion and blue/green

`ON DELETE CASCADE` header→project and body→header, for `plan_event`'s stated
reason (`schema.ts:1759-1765`): blue and green share one SQLite file, and an
outgoing release that knows nothing of these tables must not have its
`DELETE FROM project` blocked by a hidden reference.

`created_by` is copied **by value**, so deleting an account cannot orphan or
erase a saved plan.

Migration is additive with a non-empty `down.sql`. Nodes that predate the routes
answer a typed unavailable outcome.

**A rollback destroys every saved plan**, and that cost is stated rather than
discovered: `down.sql` drops both tables, so rolling back past this migration
deletes records the product calls permanent. That is acceptable only while the
feature is new and no user has saved a plan they rely on. Once it is in real use,
a rollback is a data-loss decision, not a routine one, and the release that
retires these tables owes an export first.

## Integrity is checked, not assumed

A hash that nothing recomputes is a comment. Every read recomputes SHA-256 over
the stored bytes and compares it with the header; a mismatch is a typed refusal
(R5 — malformed trusted data throws, never defaults).

The header hashes must themselves be unrewritable, or the comparison
`schedule_input_sha256 = input_sha256` proves nothing: one `UPDATE` satisfies it
for a schedule computed from a different input. So the immutability guard covers
**both** tables — no `UPDATE` on `saved_plan_body` at all, and none on
`saved_plan` except `name`.

`name` is the one exception, and it is deliberate: A-1 saves immediately with the
server timestamp as the default name and lets the user name it afterwards, which
is an `UPDATE` of that column. Renaming is permissioned like delete (creator or
project owner) and touches nothing else.

## People stay named — a recorded limit

Dany chose `keep` on 2026-09-03: people and assignments are captured by value and
never rewritten, so a saved plan stays truthful about who owned what after that
person leaves the live plan.

The consequence is held rather than re-decided: **deleting a person from the live
plan no longer deletes them from stored data.** A person-erasure obligation would
need a purpose-built cross-saved-plan job this release deliberately does not
have. In exchange, no write ever touches an already-written body, so immutability
is "no `UPDATE` ever targets `saved_plan_body`" — a property a test can state in
one line.

## What was rejected

- **Frozen figures only** (the 2026-08-14 `plan_snapshot_figure` scope). Answers
  "did this estimate move" and nothing else: an added item, a reparent, an
  ownership change, a dependency and every date compare as "no change".
- **Event-log checkpoint.** Pruned at 365 days; replay reimplements every
  command's inverse; only what flows through `WorkItemService.record` is
  journaled, so anything written by another path leaves a hole.
- **Dates excluded** (schedule body always null). Not an increment toward storing
  them: bodies saved without dates can never gain them retroactively.

## Assumptions carried in, with what would falsify each

| # | Assumption | Wrong if |
| - | ---------- | -------- |
| A-1 | Name is optional; save writes immediately with the server timestamp as the default name, and naming is an edit afterwards, not a modal | users routinely rename within a minute of saving |
| A-2 | Save is fail-fast at 5 s, never queued or chunked | normal projects miss the 5 s bound routinely, seen as `snapshot_busy` on first attempt |
| A-3 | 8 MiB per body, 100 saved plans or 64 MiB per project | a normal project exceeds 8 MiB in one body — measure against the largest real plan before the limit ships |
| A-4 | `current` is projected, never stored, and consumes no quota | users expect a comparison they looked at to be retrievable later |
| A-5 | Cross-version diffs normalise forward only | a future schema removes a field rather than adding one |
| A-6 | The domain term is **Saved plan**, not "snapshot" | CONTEXT.md's Plan document entry drops `snapshot` from its _Avoid_ list |

Origin and full argument: `notes/wbs-brief-2026-09-03-plan-snapshots.md` §5 in
the ops workspace; A-6 is decided here.
