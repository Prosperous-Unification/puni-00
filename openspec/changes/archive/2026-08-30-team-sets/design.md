<!--
Only for a non-trivial technical shape. Do not restate an ADR's rationale.
-->

## Context

R2-1 of six (`notes/wbs-brief-2026-08-13-r2-team-service.md` §6, in the
workspace). It changes the **arity** of one fact — which teams a work item's work
belongs to — and deliberately changes nothing else: not the engine, not the UI,
not the write API. Production sets stay ≤ 1, so nothing observable moves.

That makes the change unusually easy to get wrong in a way tests do not notice.
Everything below is either a decision about where the set lives, or an argument
about what proves the arity change was invisible.

## Decisions

### D1 — A join table, not a delimited column or JSON

`work_item_team(work_item_id, team_id)`, primary key the pair, both columns
cascading, plus an index on `team_id`.

The alternatives are worse in the same way. A `team_ids` text column holding
`a,b` cannot be joined, cannot be indexed by team, and gives `Payments` and
`Payments ` two spellings once a name is ever stored rather than an id — the
argument `service` (R2-5) makes for pointing at a directory row. It would also
put the directory's `DELETE` back in the application's hands: with a join table
the removal of a team is the database's problem, which is D8.

The pair as the primary key is the fact's own identity: "this work item's work is
Platform's" is either stated or not, and a second row saying it again is a second
answer to one question. Same shape as `project_team_capacity`.

### D2 — The join is the read; the column is a second copy kept for one release

Every read goes through the join (§5 of the brief lists six). The write path
still takes a scalar `serviceTeamId`, and every write that changes it writes
**both**, in one transaction — three places, all in the repository layer:
`WorkItemRepository.insert`, `WorkItemRepository.patch`,
`SubtreeRepository.insertSubtree`.

Why keep the column at all: blue and green share one SQLite file, and the
outgoing release selects `work_item.service_team_id` on every tree read. Dropping
it is R2-6, one release after the write path stops writing it (R2-4). The
brief's own words: reads switch in the change that adds the join, writes in a
later one.

Why write it in the repository rather than in the service: the column is written
in exactly three statements, all of them here, and the join has to be written in
the same transaction as each. A service-level dual write would be a second
statement outside the transaction that carries the first — the same gap
`WorkItemRepository.patch`'s `unknown_team` read exists to close.

**What this direction costs, stated because it is the one thing a reader will
want to change:** the command journal keeps recording a scalar, so an undo of a
label still travels as `serviceTeamId`. That is why `insertSubtree` derives its
join rows from each row's column rather than from a set the journal does not
carry. R2-4 turns the journal set-valued; until then the column is the journal's
spelling of the set, and `agrees with the column after every write path` is the
test that keeps that spelling honest.

### D3 — Rename the export so every call site is a compile error

`effectiveTeamOf(rows): Map<id, {teamId, fromId}>` becomes
`effectiveTeamsOf(rows): Map<id, {teamIds, fromId}>`, and the old export and its
types are **deleted** in this change.

capacity-engine's D5 named the trap: a new function that still answers `.teamId`
for "the first team" leaves all six readers compiling and silently dropping
teams. The rename plus the shape change is what makes the compiler enumerate the
readers for us. `TeamAncestryCycleError` keeps its name — the failure it reports
is unchanged.

The input shape changes with it: `TeamLabelled {serviceTeamId}` becomes
`TeamsLabelled {teamIds}`, so a caller cannot hand the new function old rows.

### D4 — The adapter refuses a set of more than one rather than narrowing it

`slicesOf` resolves one `poolId` per slice, because the engine takes one
(`Slice.poolId`, unchanged here). With a set of two the honest answers are
"throw" and "spend in both", and the second one is R2-2.

So `poolFor(teamIds, teamSizes)` throws on `length > 1`. R5: unknown is not OK,
and this is genuinely unknown — the plan says two pools and the engine can spend
one. It is an invariant assertion rather than a modelled refusal, of the same
kind as `schedule.ts`'s `no size for pool`: nothing a client can send produces a
second team while the write path writes at most one.

It is also **testable**, which is why it is a throw and not a comment:
`poolFor` is exported and asserted directly, both arms. A narrowing
implementation (`teamIds.at(0)`) is what the negative test injects.

### D5 — What proves nothing moved, and what each instrument cannot see

Two claims, and either one alone reads like the whole thing:

- **Claim A** (`repository/migrate.test.ts`): the seed writes exactly one join
  row per work item with a non-null column, and nothing else — no row for an
  unlabelled item, and `project_team_capacity` and `person_team` row-for-row
  untouched. The last two are one-line assertions and they are the cheapest
  proof that capacity stayed teams-only.
- **Claim B** (`service/capacity-migration-identity.test.ts`, which is C5's
  Claim B file and now carries this change's too — one oracle captured before
  both, and a copied replay harness would be the thing that drifts): the
  committed oracle
  `fixtures/capacity-oracle-2026-08-13.json` — 16 plans, 151 rows, all six
  binding floors, 25 capacity-floored slices, captured at `050fd45` before
  either C5 or this branch existed — replayed through this branch's service,
  answering what be-01 answered then.

Claim B is **not** a whole-document equality any more, because the payload gains
`teamIds` per row. Hand-listing the fields the oracle carries would be a list to
forget to extend, so instead: the new field is lifted off every row, the rest is
compared whole against the oracle, and `teamIds` is then asserted **separately**
to equal the singleton derived from that row's own `serviceTeamId`. Both halves
are needed — the first says nothing about the new field, and the second is the
only place the arity claim is made.

**Do not recapture the oracle.** Its own header says a capture against the branch
proves nothing; `tools/capture-capacity-oracle.ts` is committed for
reproducibility only.

What Claim B cannot see: it replays rows through the **in-memory** stores, so it
says nothing about SQLite. The join being written and read at all is
`repository/work-item.test.ts` and `repository/directory.test.ts` against real
SQLite; the migration is Claim A; and the two meet in
`service/live-plan-identity.test.ts`, which already runs a plan through the real
repository.

### D6 — One stable order for the set: by team id, from the store

`listByProject` orders the join rows by `team_id`, and `effectiveTeamsOf` passes
the row's order through untouched. Two reads of an unchanged plan therefore
answer the same array, which is what keeps a payload comparison — and a CSV
cell — from reshuffling for no reason. `teamCapacities` is ordered by the same
rule and for the same reason (capacity-per-project).

Display order is a different question and it belongs to R2-3, which sorts by
**name** for the cell, the chip and the colour. Nothing in this change sorts by
name, because nothing in this change shows more than one member.

### D7 — fe-01 reads the set and shows its one member

Every fe-01 read switches to `teamIds`; each surface then renders what it
rendered before, because the set holds at most one member. The cell's value is
`teamIds.at(0) ?? null`, the export's `Team` cell joins the names it finds with
`; `, and `TeamsDialog` takes the flattened effective sets — that last one is the
only fe-01 reader whose arity is genuinely set-valued today, since it already
took a list.

This is not the silent narrowing D4 refuses: no request can produce a second
member, and the surfaces that will show one are R2-3's whole scope. What it does
mean is that a `teamIds` of two, arriving from a be-01 ahead of R2-4, would show
one label — recorded here rather than guarded, because the be-01 that could send
it does not exist until R2-4 and the guard would be a check that cannot fail.

### D8 — The team delete is the database's job

`work_item_team.team_id` cascades, so `DELETE FROM service_team` takes the join
rows with it. Nothing in be-01 deletes them.

That is `project_team_capacity`'s argument, one table along, and it is the same
blue/green reason: the outgoing release knows nothing about this table, and its
own `DELETE FROM service_team` must not hit a constraint it cannot see.
`removeTeam` still nulls the column itself, because the column has no foreign key
and never gained one.

## Risks

- **The two spellings disagree.** A write that touched the column and not the
  join would leave a row labelled on screen and unpooled in the engine, or the
  reverse. Mitigated by writing both in one transaction in three places and by a
  test per place; `duplicate` and `restore` are the two that would otherwise be
  missed, and each has its own red.
- **`teamIds` reaching fe-01 as `undefined`.** The payload is not validated at
  fe-01's boundary (`send<T>` casts), so an old be-01 against a new fe-01 makes
  `row.teamIds` undefined and every label vanish. It cannot happen in a
  deployment — fe-01 is served by the same release that answers its requests —
  and it _can_ happen in a test that builds a row by hand, which is why the
  fixtures were updated rather than defaulted around.
- **The oracle comparison relaxing.** A `toEqual` that failed for the right
  reason (a new field) and got "fixed" by deleting fields until it passed is the
  failure mode D5's two-half shape exists to prevent. The lift-and-assert is
  written so that dropping the second half leaves the first one green — and so
  that dropping a **row's** `teamIds` fails the second.
