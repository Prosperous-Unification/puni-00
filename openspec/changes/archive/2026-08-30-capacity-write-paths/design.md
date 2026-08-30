# design — `capacity-write-paths`

The written source is `tmp/plan-capacity-2026-08-11.md` (plan v2, cross-reviewed
by codex and agy). This change is its **C2**, the row that reads: \*validation
both fields incl. the parent refusal, `WorkItemPatch` + undo, `TouchedProjects`

- `directory_changed` fan-out through inheritance, team-removal usage, directory
  concurrency test, its own watched-reds\*.

Four things here are decisions rather than transcription, and a fifth is a
constraint on when this may be **deployed** rather than on what it does. Each is
below because a reader who met only the conclusion would re-open it.

## The floor of 1 is a correctness bound, and the ceiling is not

The two guards read alike and are not alike.

`0` is refused because the engine's duration is `effort / width` and `width` is
clamped from these two numbers. A `0` in either column is a width of 0, which is
`Infinity` days for a slice with effort and `NaN` for one without — and, before
this change, nothing refused it: `windowFor` short-circuits on a zero width and
reserves nothing, `CapacityTooNarrowError` cannot fire because `0 > 0` is false,
and the plan comes back with dates no screen can draw. That was **finding 1 of
PR #48's cross-review**, rated P2 there precisely because C2's validation was
about to become the only thing standing between a typed `0` and it.

So C2 does two things rather than one. It refuses the `0` at the boundary, and
it stops being the _sole_ guard: `groupByWorkItem` — the point every slice
enters the engine through, and where the non-leaf refusal already lives — now
refuses a width that is not a whole number of at least one. A validation that is
the only guard is one schema edit away from not being one, and this engine's
stated discipline is to refuse the impossible at its own boundary.

`1000` is a **product limit and nothing more**. Plan v1 justified it from a
minimum effort of a sixth of a day; `ThreePointEstimate` is `number>=0` with no
minimum, so that argument was false and is not repeated here. Above a thousand
people on one work item the number is not a plan. That is the whole of it.

The two guards are injected **separately**, and the ceiling's negative is
`1001` rather than `1e999`. `1e999` parses to `Infinity`,
`Number.isSafeInteger(Infinity)` is `false`, and a range check probed only with
it would stay green when deleted. That exact vacuous check shipped in
`T1 column-widths-drag`; both reviewers of plan v1 caught the plan repeating it.

## `has_children` is 400, and `rolled_up` beside it is 409

The plan's §5.1 table says 400, and this follows it. The two refusals sit one
method apart and refuse the same shape of row, so the split needs saying out
loud or it reads as an oversight.

`rolled_up` refuses an estimate on a parent because the figure would be
_ignored or double-counted_ — a well-formed request that would have been legal
against a tree with no children yet, which is what 409 means everywhere else in
this API. `has_children` refuses a parallelism on a parent because the field is
one the client should never have offered: the In-parallel cell is read-only on
every parent row (C3), so a request carrying it is a client working from an
assumption this API does not hold. 400 says _do not send this_; 409 says _try
again against a different tree_.

It is a judgement, and a reviewer who prefers 409 for both is not wrong — the
argument is recorded rather than the conclusion, and the plan's own table is
what carried it.

The refusal is decided at the service, against the same read `rolled_up` uses,
rather than inside the write's transaction. That is `rolled_up`'s precedent and
its race: a child created between the read and the write leaves a number on a
row that has just stopped being a leaf. It is inert rather than wrong — the
schedule reads no parent's parallelism — and it is exactly the state
"a leaf that gains a child keeps its number" already describes.

## Inheritance widened nothing, and this says why

The plan asks for the size write's `TouchedProjects` to include _projects
affected only through inheritance_. It already does, and no query needed
changing — which is a claim worth writing down, because "we did nothing and it
was already right" is indistinguishable from "we forgot" unless the reason is
recorded and a test holds it.

`effectiveTeamOf` walks `parentId`, and a `parentId` chain never leaves its
project. So a leaf can only inherit from an ancestor in its own project, and a
project holding an inheriting leaf therefore holds the labelled ancestor too.
`projectsLabelled` reads **every** row carrying the label, parents included, so
that project is already in the list.

The line that makes this true is the absence of a leaf filter, which is an easy
thing to add as an "optimisation". `tells a project the team reaches only
through inheritance` is the fixture that stops it: with the query narrowed to
rows nothing calls a parent, it comes back `[]` where one event was owed — a
plan whose every date had just moved, and nobody told.

## `capacity_released` names the size and the row it came from, and nothing twice

Removing a sized team takes a pool away, so every slice that drew slots from it
stops queueing and the dates of the whole labelled subtree move. The rows that
_inherit_ the label carry nothing to null and would not otherwise appear in the
confirmation at all — somebody would agree to "one row loses its label" and
watch twenty rows move.

The effect carries `size` and `fromId`. It deliberately carries no `inherited`
flag: `fromId === row.id` is exactly "the label is its own", so a boolean beside
it would be a second spelling of one fact, which is the rule the `NOT NULL
DEFAULT 1` on `max_parallel` exists to keep.

The size is read off the **team row**, carried on `DirectoryUsageRows` and read
inside the transaction that refused. The work items alone cannot tell a sized
team from an unsized one, and an unsized team's removal moves no date at all —
so the effect is conditional on the size, with its own negative.

## Directory concurrency: what C2 can hold, and what it cannot

codex 14 asked for a concurrency test, and the plan (§4.1) describes it on the
**page**: one editor's response held in flight, a peer write landing, and the
older response refused the chance to overwrite the newer number on screen. That
page does not exist until C3, so C2 cannot carry that assertion, and this is the
plan-versus-reality note rather than a quiet omission.

What C2 carries instead is the be-01 half, stated honestly as a
characterisation rather than dressed as a gate: the directory carries **no
revision** — a team is global rather than a satellite of any project — so a size
write is last-write-wins by design, and two editors typing different numbers
leave the second one's. `lets the later of two sizes win, and announces each of
them` records that, and says in its own comment that it is not a safety check.
The narrow write — `set({ size })` and not the whole row — is what keeps a
rename landing beside it from being reverted, and that is argued in the
repository's JSDoc where the statement is.

## Shipping order: C2 must not reach production ahead of C3

**This is a release constraint, and it is the one thing about this change that
can break a screen.**

fe-01's `ScheduleFloorView` (`apps/fe-01/src/lib/wbs-api.ts`) has five members
and none of them is `capacity`. `floorWordsOf` (`gantt-geometry.ts`) ends in a
`default:` arm that throws `GanttDataError` — deliberately, with its own watched
proof: _"the throw is for the runtime, where a payload can carry a sixth."_
be-01 has emitted that sixth since C1.

C1 was safe anyway, because nothing could set a team's size: `addTeam` writes
`size: null` unconditionally and `create` writes `maxParallel: 1`, so
`boundBy: 'capacity'` was unreachable in production. **C2 is the change that
makes it reachable** — two HTTP requests, size a team and label the work — and
C3 is the change that teaches fe-01 the word. Between them, any plan with a
sized, contended team draws its Gantt into an error boundary.

Three things follow, and all three are done here:

1. It is **pinned as a test**, not argued in prose: `puts a capacity floor on
the wire, which nothing this change ships can draw` drives the two requests
   through the real routes and asserts `boundBy: 'capacity'` comes back on the
   wire. Deleting the constraint now means deleting a test.
2. It is a **landmine in `LLM_README.md`**, which is the file every session
   reads before it knows its task — the only place a deploy-shaped hazard is
   read by the person about to deploy.
3. **Merging is safe; deploying is the gate.** `main` is not deployed by
   anything: dev is `./bin/dev-deploy.sh` by hand and prod is the blue/green
   swap by hand. So this PR may merge and sit on `main`; what must not happen is
   a dev or prod deploy of a `main` that has C2 without C3.

The alternative — teaching fe-01 the word here — was rejected. It is C3's row,
the `default:` arm is exhaustiveness-checked through `const unknownFloor: never`
so widening the union without adding the case does not compile, and adding the
case here would put C3's sentence, its referent link and its "and N others"
in a PR whose surface is be-01.

## Plan versus reality

| the plan said                                                                       | what shipped                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §7 C2 row: "directory concurrency test"                                             | The be-01 half only, labelled a characterisation. The in-flight/peer-write assertion is about the directory **page**, which is C3's.                                                                                                                |
| §6 item 26: `TouchedProjects` "includes projects affected only through inheritance" | Already true of `projectsLabelled`; no query changed. The reason is above and a fixture holds the line that makes it true.                                                                                                                          |
| §5.1: `maxParallel` on a row with children → 400 `has_children`                     | As written. The split from `rolled_up`'s 409 is argued above rather than left to be noticed.                                                                                                                                                        |
| §5.2: team size "reuses the machinery that already exists"                          | As written, through `announce`. The route is `PATCH /api/teams/:id/size` rather than a field on the rename: the rename validates through an Elysia schema and answers its own 422, and these refusals have to be named 400s a client can branch on. |
| §5.2: "the directory is not journaled today … so team size is not undoable either"  | As written, and said in the service's JSDoc rather than left to be discovered.                                                                                                                                                                      |
| §5.1: `1e999` refused                                                               | Refused, and asserted — but written into the request body as a literal, because `JSON.stringify(1e999)` is `null`, which is a legal reset. The ceiling's negative is `1001`.                                                                        |
| —                                                                                   | **Added, not in the plan:** the engine's own width refusal. Finding 1 of #48's cross-review, whose adjudication left C2's validation as the sole guard.                                                                                             |
| —                                                                                   | **Added, not in the plan:** the C2-before-C3 hazard pinned as a test and as a landmine. Finding 2 of the same review, which was in neither `design.md` nor `proposal.md` then.                                                                      |
