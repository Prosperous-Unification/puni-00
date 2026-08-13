# design — `capacity-per-project`

The written source is `tmp/plan-capacity-2026-08-11.md` (plan v2) as amended by
Dany on **2026-08-13**. The plan's C5 row read _"a per-project allocation behind
the seam, with the global size as the fallback"_. His two sentences that day
replaced the second half of it, and this file is mostly about what that
replacement costs and how the transition is made honest.

Seven things here are decisions rather than transcription.

## D1 — there is no fallback, and that is the whole shape of the change

Dany, 2026-08-13, both sentences quoted rather than paraphrased:

> the capacity must be configurable per project

> The global number should not matter, only per project capacity configuration
> matters.

The first sentence alone is satisfied by a per-project override in front of
`serviceTeam.size`, which is what C1's D6 designed and what this change was
scoped as. The second sentence refuses that: an override in front of a global
default **is** a design in which the global number matters, every time nobody has
typed a per-project one. So:

**Effective slots for a (project, team) pair = the pair's stored size, or
nothing.** `nothing` is _unstated_ and constrains that team's work on that plan
not at all — the same state every team was in before C1's column existed, and the
same reading `null` already has.

`serviceTeam.size` is read by **no code path** after this change. That is not a
softer claim than "removed": the column stays physically (D4) and a `grep` for
its readers is the check, so `verify.md` carries that grep as evidence rather
than as an assertion.

**What this costs, stated rather than discovered later.** Three cases start
unconstrained where the old design would have constrained them:

1. A team sized for the first time **after** the migration. It gets no rows
   anywhere, so no plan is bounded by it until somebody types a number on a plan.
2. A project created after the migration. Same, from the other side.
3. Any pair the migration did not seed.

Case 3 is why the seeding is a cartesian product rather than a join (D2). Cases 1
and 2 are the intended behaviour of Dany's second sentence and are **not**
mitigated: mitigating them means reading a global number as a default, which is
the thing that was refused. What they need instead is discoverability, and that
is what moving the box onto the plan is for (D5).

**Rejected: keeping the global number as a "default for new projects".** It is
the fallback wearing a different noun. A reader who edits the global number and
sees three plans move and two not has a tool whose rule cannot be stated in a
sentence.

**Rejected: seeding new projects from the global number at create time.** Same
objection one layer along, plus a new one: it makes a project's capacity depend
on when it was created, which is a fact no screen shows.

## D2 — the migration seeds every (existing project × sized team) pair, not only the labelled ones

The obvious seeding is the join: one row per pair where that team actually labels
work in that project.

```sql
-- what the seeding deliberately is NOT
INSERT INTO project_team_capacity (project_id, service_team_id, size)
SELECT DISTINCT wi.project_id, st.id, st.size
  FROM service_team st JOIN work_item wi ON wi.service_team_id = st.id
 WHERE st.size IS NOT NULL;
```

That is enough for the identity differential to pass — a pair labelling nothing
spends no slots, so seeding it changes no date today — and it is **not** enough
for the promise the differential is standing in for. The promise is _"existing
global sizes must not silently change existing schedules"_, and a schedule is not
only what is on screen this second. Under the join, labelling one more row with
`Platform` in an existing project the day after the migration gives that plan an
_unconstrained_ Platform where the release before the migration would have given
it four. Nobody edited a capacity, and the dates come out different.

So the seeding is the cartesian product of the projects that exist and the teams
that are sized:

```sql
INSERT INTO project_team_capacity (project_id, service_team_id, size)
SELECT p.id, st.id, st.size
  FROM project p CROSS JOIN service_team st
 WHERE st.size IS NOT NULL;
```

**The cost is rows nobody asked for**, bounded at `projects × sized teams`. Both
are directory-scale on this deployment — a handful each — and the table is two
text columns and an integer. If either ever stops being small, the join above is
the one-line replacement and this paragraph is the argument to re-read.

**It also means the seeding is not idempotent by accident.** Re-running it would
duplicate every row, and the primary key `(project_id, service_team_id)` is what
turns that into a failed statement rather than a doubled table. Drizzle's
migrator applies a file once, so this is a belt on top of a brace; the key is
there anyway because the pair is the identity of the fact.

## D3 — the rekey is in the store, and the map handed to the engine stays keyed on the team alone

C1's seam, quoted from `schema.ts`:

> The scheduler reads it through `slotsOf`, which is the seam a per-project
> allocation would be added behind

The instruction for this change said _"rekey on (project, team)"_, and the honest
reading of that is the **stored** key, not the map. `schedule()` is called once
per project, over `workItems.listByProject(projectId)` — there is no call, and no
plausible future call, in which one invocation sees two projects' rows. A
`Map<\`${projectId}::${teamId}\`, number>` inside the engine would therefore carry
a component that is constant for the whole call, every engine test would have to
spell it, and the first typo in the separator would be a silent
"unconstrained".

So:

- **The store is keyed on the pair.** `CapacityStore.slotsFor(projectId)` is one
  indexed read of `project_team_capacity` and returns `Map<teamId, slots>`.
- **The adapter's `slotsOf` is that map.** The four lines in
  `work-item.service.ts` that looped `listTeams()` and copied `team.size` are
  replaced by the one lookup C1's comment predicted, and the comment saying
  "today's only answer is the team's global size" is replaced by what is now
  true.
- **`schedule()` is untouched.** Not one line, and that is a claim `git diff
--stat` can check.

The consequence worth naming: `slotsFor` is now the **only** thing between the
stored fact and the schedule, so a bug in it is a plan-wide date change with no
second reader to disagree with it. That is why the identity differential is at
the service boundary (D7) rather than over `slotsFor` alone.

## D4 — `serviceTeam.size` is retired from reads and kept in the table

Blue and green share one SQLite file, so a forward migration that dropped the
column would break the outgoing release mid-swap. That is the house rule, and
C1's own migration argued it at length for the additive direction:

> Nullable is also what keeps this additive across a blue/green swap: the
> outgoing release's `INSERT INTO service_team (id, name)` does not name this
> column and both colours share the file.

The same argument in reverse: this release must not drop `size`, because the
release beside it still selects it — `resizeTeam`'s `returning()` reads the whole
row, and so does `usageOfTeam`. So the column stays, and what changes is that
nothing in **this** release reads it.

Two consequences, both stated rather than hidden:

- **A stale number stays in the table**, and the day somebody drops the column
  it will be the last thing anyone sees of the global capacity. A `-- retired by
capacity-per-project` comment goes on the schema field, naming this change and
  the drop it is waiting for, because a column nothing reads and nothing
  documents is the next reader's twenty minutes.
- **`PATCH /api/teams/:id/size` is removed**, along with `resizeTeam` in the
  service and the store. Keeping the route would leave a write that stores a
  number no schedule reads — which is the single worst outcome available here,
  worse than a 404, because the box would refuse nothing and change nothing.
  The stated cost: a browser holding the pre-swap fe-01 bundle and typing in the
  old directory box gets a refusal it cannot act on. It is one release's window,
  the box is gone in the bundle beside it, and the alternative is a silent lie.

## D5 — the box moves onto the plan, because the number is now the plan's

C3 put the size input in the directory, beside the team's name and its member
count, and that was right for a global number: the directory is the global page.
A per-project number cannot live there — the page has no project — so the choice
is which project-scoped surface takes it.

**A `Teams` dialog in the plan's own toolbar**, which is `PhasesDialog`'s
precedent one button along: the roles of a project are the project's, they are
edited from the plan's toolbar in a dialog, and the button belongs to the dialog
rather than sitting beside it because Radix restores focus to its trigger. The
capacity of a team on this plan is the same class of fact and gets the same
treatment.

What it lists is **the teams this plan's work is labelled with**, effective
labels included, read through the same `effectiveTeamOf` all six consumers use —
so a team that only an ancestor carries is in the list, because its pool is what
the leaves below it spend. Not every team in the directory: a plan that does no
`Design` work has no capacity for `Design` to state, and a list of every team on
the deployment is a list nobody reads.

Rejected: **the Service/team cell**. It is a picker for a label, one row's fact;
capacity is one plan's fact about a team and would be repeated on every row that
carries the label, with N boxes writing one number.

Rejected: **keeping a box on the directory page that edits "the project you last
had open"**. It reads as global and is not.

The directory keeps names, members and removal, and **loses the box entirely**.
Leaving a disabled box, or a box showing a number from somewhere, is the D4
objection on the other tier.

## D6 — the write is one project's, so the fan-out is one project's

C2's size write announced to _every project the team labels work in_, and its
JSDoc argued that the fan-out is a stronger claim than a rename's because "a size
moves every date in the plan". Under C5 the write moves the dates of exactly one
plan, so the fan-out is that one project — which is a simplification, and worth
saying out loud because the diff makes it look like a weakening of C2's rule
rather than the same rule over a narrower fact.

**`PUT /api/projects/:projectId/teams/:teamId/capacity`**, and the four decisions
in it:

1. **`PUT`, not `PATCH`.** The body carries the whole of the fact — there is one
   field — and the same request twice is the same state. `PATCH` would invite an
   absent `size` to mean "leave it", and there is nothing else in the resource to
   leave.
2. **`{ size: null }` deletes the row**, and _unstated_ has exactly one spelling:
   the absence of a row. A row holding `NULL` would be a second spelling of one
   fact, which is the thing R2 exists to stop, and every reader would then have
   to handle both.
3. **Validation is C2's, reused rather than re-typed.** A whole number from 1 to
   `MOST_PEOPLE_AT_ONCE`; `0`, negatives, fractions, non-numbers and `1001`
   refused 400 with nothing written. The floor is the same correctness bound C2
   named — duration is `effort / width`, so a stored 0 is a plan of `Infinity`
   dates. The 1000 is read out of one constant; `directory.controller.ts` and
   `work-item.controller.ts` each held their own copy of it before this change
   and this change makes it one export, because a third copy was the point at
   which they would have drifted.
4. **A new event, `capacity_changed`, not `directory_changed`.** The FE treats
   every project event as "read again" and does not inspect the type, so the
   choice costs nothing either way and is therefore purely about the name being
   true: `directory_changed`'s own JSDoc says _"something in the global directory
   that this project reads has changed"_, and this is not that. C2 folded a
   `team_capacity_set` event into `directory_changed` because the directory row
   really did change; here it does not.

**No undo**, and the reason is not C2's. C2 said "the directory is not journalled
at all", which was true and is not the reason here — this fact is a project's,
and `estimateMethod` and `startDate` are project facts with no undo either.
Capacity joins them. The one that _does_ have undo, `maxParallel`, has it because
it rides `WorkItemPatch` and a work item's revision; a capacity write touches no
work item and moving one would be inventing a revision bump to hang an undo on.

## D7 — the identity differential is two claims composed, and neither alone is the promise

The promise is: **every plan on the deployment schedules byte-identically across
the migration.** It decomposes, and the decomposition is the part worth writing
down, because either half on its own reads like the whole thing and is not.

**Claim A — the migration produces the right numbers.** Real SQLite, migrations
rolled back to `20260812100001_add_max_parallel` (the pre-C5 tip, which is
`main@050fd45`'s schema), teams and projects written the way the outgoing release
writes them, then migrated forward. The assertion is on the table: one row per
(project, sized team), each carrying that team's global number, and nothing at
all for the unsized team. `migrate.test.ts`, the shape its priority-backfill and
`leaves teams that existed before the column unsized` cases already use.

**Claim B — the same numbers produce the same schedule.** Sixteen plans and the
exact `/work-items` answer be-01 gave each of them, captured at `050fd45` **by a
script run before this branch had a line of code in it** and committed as
`fixtures/capacity-oracle-2026-08-13.json`. The test replays the plans — read out
of the fixture, not regenerated — through this branch's service, with the per-
project store holding what Claim A proves the migration writes, and asserts every
field of every work item and every slice.

Why the oracle is a committed capture and not a copied function: C1's identity
differential copied the previous **engine** into the test file, because the engine
was one pure function and copying it was cheap. The thing that changed here is the
**adapter**, and copying `tree()` into a test file would be copying six
collaborators and their fixtures — a copy large enough that its own drift is the
likelier bug. So the oracle is data. The corollary is stated in the fixture's own
header: **re-running the capture script against this branch proves nothing**, and
the script is committed for reproducibility only.

The corpus is asserted to be worth measuring before it is used as an oracle —
`schedule-identity.test.ts`'s `generates plans worth measuring` rule. It carries
151 rows over 16 projects, all four estimate methods, two plans off the calendar,
three manual dates, all four teams and the unlabelled case, widths 1/2/3, all six
binding floors, 25 capacity-floored slices and 18 rows waiting on a pool. A
recapture that lost any of those fails the first test in the file rather than
silently making the other one vacuous.

**What the composition does not cover, and how it is covered instead.** Claim A is
about a database and Claim B about a service, and the wire between them is
`slotsFor`. Claim B holds `slotsFor`'s output fixed by construction, so a
`slotsFor` that reads the wrong column would pass both. That gap is closed by a
third test against real SQLite — write the pairs, read `slotsFor`, assert the map
— with the fault injected by pointing it at `serviceTeam.size`, which is exactly
the fallback this change refuses and therefore the one wrong answer most likely
to be written by accident.

## Plan versus reality

| the plan said                                                           | what is true                                                                                                                                         | what shipped                                                                                                              |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A per-project allocation with the global size as the fallback (C1's D6) | Dany, 2026-08-13: "The global number should not matter, only per project capacity configuration matters" — a fallback is the global number mattering | No fallback. Unstated pairs constrain nothing, and three cases start unconstrained on purpose. D1.                        |
| Seed the pairs a team actually labels                                   | A label added to an existing project the day after would then schedule differently with nobody having edited a capacity                              | The cartesian product of existing projects × sized teams, bounded and argued. D2.                                         |
| Rekey `slotsOf` on (project, team)                                      | `schedule()` is called once per project, so a project component inside the map is constant for the call and the separator is a new silent bug        | The **store** is keyed on the pair; the map handed to the engine is keyed on the team, and `schedule()` is untouched. D3. |
| The directory's size box gains a project scope                          | The directory page has no project, and "the project you last opened" reads as global                                                                 | The box moves to a `Teams` dialog in the plan's toolbar and the directory loses it. D5.                                   |
| `directory_changed` carries the write, as C2's did                      | This is not a change to the global directory                                                                                                         | A new `capacity_changed` event, which costs nothing because fe-01 does not read the type, and is true. D6.                |
| An identity differential against the pre-C5 engine                      | The engine did not change; the adapter did, and it is too large to copy into a test                                                                  | A committed capture of 16 plans' answers taken at `050fd45`, plus a migration claim and a `slotsFor` claim, composed. D7. |
