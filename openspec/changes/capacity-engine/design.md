# design — `capacity-engine`

The shape is non-trivial in three places: the profile's simultaneity rule, the
float graph's soundness, and the argument that the placement terminates. Each
is here because a reader who meets only the conclusion would re-open it.

The written source is `tmp/plan-capacity-2026-08-11.md` (plan v2, cross-reviewed
by codex — 21 findings, 2 critical — and agy — 6, 1 critical). This change is
its **C1**. Where the plan and the merged code disagreed, the code won; the
deltas are the last section.

## D1 — width is static, and a compressed slice stays one node

A slice of width `W` keeps its key, its bar and its row. It gets a duration of
`effort / W` and holds `W` slots for that whole duration.

`W` sub-slices was rejected: node identity would change when a numeric field
changed, and bars, dependencies and caches all lose their referent. It is the
same objection that killed the dual-unit alternative in `schedule-on-item-role`.

Runtime-dependent width was rejected for a mechanical reason: `offsets[]` is a
prefix sum computed **before** placement and the anchor arithmetic reads it, so
a width that depended on free capacity could not be summed at all.

**The identity claim, narrowed.** `Slice.days` reaches the engine only through
`finalDays()` over a validated `ThreePointEstimate`, whose three fields are
`number>=0` — finite and non-negative — or through `null`. For every value of
that class `E / 1 === E` exactly: division by one is exact in IEEE-754, and
`-0 / 1 === -0`, which the prefix sum's `0 + -0` already normalises to `+0` on
both sides of this change. The claim is made about that class and no wider one,
and the class's boundary is a test of its own (`estimate.test.ts`: a non-finite
estimate cannot reach `Slice.days`).

## D2 — named work consumes a team slot

`serviceTeam.size = N` bounds how many slices of that team's work run at once,
**including slices somebody is named on**.

The plan's first version excluded named work, arguing `person_team` is
many-to-many and global so there is no non-arbitrary answer to "which of kat's
teams does her hour come out of". That argument is aimed at the wrong key. The
slot is keyed on the **work item's** `serviceTeamId`, not on the person's
memberships: the work belongs to Platform, the work takes a Platform slot, and
who does it is a second and independent fact.

The two constraints compose without interacting. A named slice needs its person
free (queue of one, exactly as before) **and** one slot of its item's team.
`schema.ts`'s decoupling — _"A team labels the work; a person does it; the two
need not match"_ — is preserved word for word.

## D3 — a named person overrides parallelism, in the open

`personId !== null` ⇒ `W = 1`. One human cannot work beside themselves, and
`assumedAssignee` means one named assignment covers every role of the item — so
naming one person on a `maxParallel: 3` item collapses the whole item to width
1 and serialises its roles.

Not refused at the write path: a 400 on "assign kat to this item" would be
hostile. It is made visible instead — the cell, the bar's facts and the export
all say it — which is C3's work. C1 carries the number out (`ScheduledSlice`
reports both `effort` and `width`) so C3 has something true to print.

Rejected: "kat plus two others". The engine would be claiming people the plan
has not named.

## D4 — blocked means wait, not stretch

An item of width 3 against a team of 4 with 2 slots busy does not run at width 1
and widen later. It waits for the earliest instant at which 3 slots are free for
its **whole** duration. Stretching would make duration depend on placement
order, which re-opens D1 from the other end.

Backfill happens by construction rather than by rule: a later-popped narrow
block searches from its own floor and drops into a hole the wide block left.

## D5 — the team label reaches leaves, most-specific wins

`effectiveTeamOf(rows)` — a leaf's own label or the nearest ancestor's, with the
ancestor it came from — is exported from `libs/domain` and computed in exactly
one place.

Most-specific rather than `Math.max`, and the difference is deliberate: a
`startNoEarlierThan` floor takes the strictest of the chain because it is a hard
constraint, while a label is a statement about **whose work this is**, and the
one written closest to the work meant that work. `priorityByLeaf` reads the same
way for the same reason.

It returns a `Map` for the whole plan rather than answering about one row,
because every consumer of it draws a whole plan; a per-row call would re-walk
the ancestry for each of them. It lives in `libs/domain` rather than in be-01
because C3's four renderers read it too, and a second copy is the one that
drifts.

**No write copies a label down.** A stored second copy goes out of date the
moment anybody moves a row.

## D6 — team size is global, and the seam for fixing that is built

`serviceTeam.size` is global, because the directory is, and each project's
schedule consumes up to N slots. Two projects labelled `Platform` each get 4.

codex 12 argued for `project_team_capacity(project_id, service_team_id, size)`
in this change instead, and the objection is quoted rather than summarised:

> A global number that gives every project all N is neither a capacity nor an
> allocation. Two projects sharing a team will each be told they have the whole
> team, and the plans will both be wrong in the same direction.

It is the better long-term model and it is **not** this change, for two reasons.
First, it is exactly the shape the tool already has for people: a named person
is global and unbounded across projects, and every plan this tool has ever
printed has that property — capacity is inheriting an accepted limitation, not
introducing a new one, and fixing it is a change about projects sharing people.
Second, it is the number Dany asked to type, on the page he asked to type it on.

The seam is built so the fix is a function body: the adapter builds `slotsOf`,
whose only implementation today returns the team's global `size`. A per-project
allocation becomes one additive table and one first lookup, with the global
number as the fallback.

## D7 — priority orders the queue, capacity bounds the slots

`goesFirst` is untouched: priority, then CPM start, then float, then work-item
number, then role order. Capacity never reorders; it decides **when** the slice
already chosen can fit.

The consequence, plainly: **priority decides who is placed first, not who starts
first.** A priority-1 block needing 3 slots can be overtaken by a priority-2
block needing 1, because the narrow one fits a hole the wide one cannot use.

`priority-column`'s written requirement says _"the smaller number is placed
first and starts earlier"_. That sentence is now too strong under contention.
**Editing it is C4's task**, with a new scenario for the overtake; this change
adds no scenario that contradicts it, because every scenario here that involves
priority is uncontended.

Rejected: reserving the earliest feasible future window for a popped
high-priority block. It idles slots that work is available for, it makes the
schedule finish later in wall-clock for the sake of a display promise, and it
makes a block's start depend on blocks not yet popped.

## D8 — float carries the whole blocking set

The plan's first version added **one** capacity edge, from the block whose
finish opened the window. codex 1 showed it reports float that is not there,
and the counterexample is small enough to be a fixture:

> Pool of 2. Width-1 blocks A and B hold both slots, ending on days 5 and 7.
> Width-2 block X therefore starts on day 7 and ends the project. With only
> B→X in the graph, A appears free to slip indefinitely — but A ending on day 8
> pushes X, and with it the project.

That is a **false green**: a row reported as having slack it has none of. It is
the class of fault that killed the first leveling algorithm, and it does not
ship. It is the headline regression test of this change (`reports no float on a
block whose slack another block's finish is holding`), and it is watched failing
with the graph narrowed to one edge.

**The replacement.** During the window scan for a block X, every reservation
active at an instant where `usage + W > N` is recorded — the reservations that
actually had to end for X to fit. Each gets an edge to X in the augmented graph.
In the counterexample both A and B are in the set, A gets a late finish of 7,
and its float comes out as **2**, the true answer.

**The error is one-sided by construction, and that is the claim.** The set is
the union of the causes of a disjunctive constraint — "at least one of these
must move" — which a DAG cannot express. Edging all of them makes the graph at
least as tight as reality: float can be reported _smaller_ than it truly is,
never larger. No row is ever reported movable when it is not.

The direction is **named** by a test, not demonstrated by one.
`under-reports float rather than over-reporting it, and says so` pins the
**tight** case — A's reported float, 6-2 = 4, is exactly the disjunctive answer
— and asserts `a.latestFinish <= x.latestStart` with `float >= 0` over every
slice, which does gate the one-edge fault: with only B→X, A's late finish is the
project finish 12 against X's late start of 10, and the `<=` fails. What no
fixture in the suite carries is a constructed case where the blocking set
reports float _smaller_ than the true answer, which is what §6 item 20 asked
for. The one-sidedness is argued here and its negative is gated there; the
demonstration is owed, and is a follow-up rather than a C1 gap.

Rejected: exact capacity sensitivity (re-place the plan with each block
delayed). Correct, and `O(V)` full schedules per query.

`resourcePredecessorId` stops being the graph and becomes what it always was on
screen: a **display referent**, chosen from the blocking set as the latest
finisher, ties by placement order. A capacity-floored slice with an empty
blocking set is impossible and therefore throws, matching `floorWordsOf`'s
existing refusal one layer down.

## D9 — simultaneity is aggregated, and that is not tidiness

The profile is held as events **aggregated by timestamp**: a sorted array of
`{ at, delta, acquires, releases }`, one entry per instant.

Reservations are half-open `[start, finish)`, so at an instant where one block
ends and another begins the release must be seen before the acquisition. Raw
`+W`/`-W` entries evaluated in insertion order can report a transient
over-capacity that never existed and push a block to a later window. Summing
every delta at one timestamp before the instant is evaluated is what makes the
answer independent of the order the entries arrived in — which is the
determinism claim, and is asserted by scheduling a shuffled copy of the same
plan.

## D10 — the placement terminates, and the argument is not chronology

Every reservation is written once and never moved, so a window search reads a
profile that cannot change under it. The candidate start walks strictly forward
through a finite event list. Past the last event usage is 0, and `W <= N` is
guaranteed by the adapter's clamp and refused up front if the two readings ever
came apart — so a window always exists.

The acyclicity of the augmented graph is **placement order**, not time: a
capacity edge points from a reservation already placed to the block being
placed. `lateTimes` walks `order` backwards and `order` is placement order, so
the backward traversal stays topological even when a later-popped block starts
earlier in time. A fixture with pop order and start order deliberately reversed
asserts exactly that.

## D11 — `hasResourceEdges` is read from the edges actually emitted

The tight-path rule in `lateTimes` is scoped by whether any resource edge
exists, computed from `resourceSuccessors` after placement — **not** from
"a pool exists". A sized team that never contended emits no edge and must
therefore produce the previous engine's last bits.

Mechanically this is the existing `queues.some((next) => next.length > 0)`
reading a widened `resourceSuccessors`, which is why the plan's earlier
`hasQueues || hasPools` was both wrong and redundant.

The proof for this one is a **corpus**, not a fixture, and that is a finding
rather than a preference: a three-block fixture was watched staying green with
the scoping deliberately widened, because three blocks cannot carry the
floating-point drift the rule exists to keep out. It moved to
`schedule-identity.test.ts`'s thousand-plan differential, where the widened
scoping fails at seed 13.

## Batch sequencing — C2 must not reach production ahead of C3

C1 emits a sixth `boundBy`. fe-01 does not know the word: `ScheduleFloorView`
(`apps/fe-01/src/lib/wbs-api.ts`) lists five members, and `floorWordsOf`'s
`default:` arm throws `GanttDataError` — deliberately, by its own comment,
because _"a payload can carry a sixth"_. It now can.

C1 is safe on its own: nothing can write a `size`, so `boundBy: 'capacity'` is
unreachable in production. **C2 is where that stops being true** — C2 owns
validation, `WorkItemPatch` and the `directory_changed` fan-out on a size write,
which is exactly the ability to size a team, while C3 owns the `floorWordsOf`
case that teaches fe-01 the word. C2 deployed without C3 turns any plan with a
sized, contended team into an error boundary where its Gantt should be.

So: **C3's `floorWordsOf` arm ships with or before C2's write path.** Not a
release-order preference — the intervening state is a crash for a supported
plan.

Related, and C2's to close: width 0 is `Infinity` days, silently.
`widthFor` is `Math.min(row.maxParallel, slots ?? row.maxParallel)`, so a `size`
or a `maxParallel` of 0 gives width 0, and `durationOf`'s
`(slice.days ?? 0) / slice.width` is then `Infinity` (or `NaN` at zero effort).
Nothing in the engine refuses it — `windowFor` and `reserve` both short-circuit
on `width === 0`, and `CapacityTooNarrowError` does not fire because `0 > 0` is
false. Unreachable today, because `addTeam` writes `size: null` unconditionally
and `maxParallel` is only ever written as `1`. C2's validation is therefore the
**only** thing standing between a typed `0` and a plan of infinite dates, which
is a boundary this engine otherwise refuses at its own edge.

## Plan versus merged reality

The plan was written on 2026-08-11 against `main` @ `94ed488` with
`priority-column` and `critical-snap` in flight. Four more changes merged before
this one started. Where its text conflicts with the code, the code is followed
and the delta is here.

| plan said                                                                                              | merged reality                                                                                                                                                                                             | what this change did                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base is `94ed488` plus two in-flight changes                                                           | `main` @ `e3918f6`: #41 critical-snap, #42 dep-add-button, #43 priority-column, #44 gantt-declutter, #45 dep-waits-on-first-role, #46 priority-commit-polish all merged                                    | Branched from `e3918f6`. `slackOf` and `priority` are merged facts this change composes with rather than anticipates.                                                                                                                  |
| `schedule.ts` is 1088 lines; the anchor sits at `:528`, `lateTimes`' own at `:596`                     | 1897 lines before this change's edits; `SpanAnchor` at `:818`, `lateTimes`' anchor at `:952`                                                                                                               | Line references dropped in favour of symbol names, which is R3's rule anyway.                                                                                                                                                          |
| `projectOntoWorkItems` takes the per-slice minimum "where a person pulled them apart"                  | #45 made the non-tiling arm **ordinary**: a dependency now leaves the predecessor's anchor slice, so any successor edge from a middle slice splits the item                                                | The plan's §3.4 claim — "an item a pool pulled apart fails `tiles` exactly as one a person pulled apart does" — still holds, and is now one of three ways in rather than the second of two. `projectOntoWorkItems` is untouched.       |
| Migration folders named `20260812T1200_add_team_slots`                                                 | House format is `YYYYMMDDHHMMSS`, as `20260809090000_add_role_position`                                                                                                                                    | `20260812100000_add_team_slots` and `20260812100001_add_max_parallel`.                                                                                                                                                                 |
| The identity differential is "1000 seeded plans + the captured live plan, no `size`, no `maxParallel`" | The corpus in `schedule-identity.test.ts` was **rescoped by #45**: multi-role plans with dependencies move by design, so oracle parity holds only for plans with no dependencies and for single-role plans | The unchanged-fields differential rides the corpus as #45 left it. The sized-uncontended differential (D11) is a new run of the corpus against **this** engine unpooled, which needs no oracle and is not affected by #45's rescoping. |
| C0 would measure "both columns at their intended widths"                                               | `priority-column` merged first, so the Prio column is in the baseline and only one new column was left to measure                                                                                          | C0 measured the In-parallel column against the merged 14-column baseline. Its answer is in `verify.md` and it constrains C3, not this change.                                                                                          |
