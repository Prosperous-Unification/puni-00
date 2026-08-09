# Resource planning configs — plan v3 (2026-08-09)

v1 was cross-reviewed the same day: codex 16 findings (3 critical), opus 15
(4 critical), heavily convergent. agy then reviewed **v2** (10 findings, 2
critical): it re-confirmed the `capacity` wire window, caught v2 dropping
v1's anonymous-lane cap (agy 1), the uncontrollable fallback pool in
`people_by_role` (agy 6), and the missing cross-project role check on C4's
PUT (agy 8); two of its findings are rejected with reasons. Every real
finding is folded in; disposition table at the bottom; the open questions the reviews raised are
**all resolved by Dany (2026-08-09)** — the disposition rows referencing
them are the historical record. The reviews reshaped the plan: **configured
and effective capacity are now two named numbers** and the collision between
them at the default of one got its own decision (widen and warn);
`boundBy: 'capacity'` is treated as the un-dual-emittable wire break it is
(opus 2); the engine proofs moved onto a corpus that actually contains
people (opus 3); the live-plan identity net is kept alive instead of
re-captured over (opus 4); and every pool-key edge an implementer could have
resolved two ways is resolved here (codex 8, opus 7).

Dany's asks: **(1)** a per-project resourcing config with three modes — a raw
number of people; a number per role (and finish the phase→role rename); a
number per team, each team optionally split per role — **default one person
for the whole project**; **(2)** the Gantt respects it: dependencies as
today, parallelism capped by the configured heads where nothing else binds; a
named assignee is **one of** the configured heads, never an addition;
**(3)** plan the teams/services split — one team per work item, several
services per work item, services assignable to teams without constraining
anything in the WBS table.

Base: `main` @ `4f2b583`, with the 2026-08-09 batch (D1, T2, G1, H1, T1, D2,
G2 — `docs/plans/2026-08-09-directory-table-header-gantt.md`) queued ahead.
**Line citations below are against `4f2b583` and will drift as that batch
lands; symbols are the durable reference** (opus 14). Execution model as
before: one OpenSpec change per row, each with its own R4 design interview;
Opus subagents implement; Dany merges between; codex+agy re-review after C2
and after C4/S1.

---

## The engine model: pools and lanes

One generalization of `resource-leveling`'s `busyUntil` (the only serializer
the engine has, `schedule.ts` `placeSlices`): every slice draws from a
**pool** with a **configured headcount**. This deliberately reverses
`resource-leveling`'s recorded non-goal — "capacities, part-time people,
calendars per person, or a toggle" — for capacities only; the reversal is
named in C1's proposal (opus 11).

- A pool holds lanes, **materialized lazily** — only ever as many as were
  concurrently demanded, so a pathological headcount cannot allocate
  anything; the API still refuses above 1,000 (opus 12).
- **A named person is one of the lanes.** Their lane _is_ the global
  `busyUntil[personId]` entry, in whatever pool their slice falls. Anonymous
  lanes are pool-local finish times, and there are **at most
  `max(0, C − distinct named assignees in the pool)`** of them (agy 1 — v2
  dropped v1's cap and a one-head pool with Kat named would have read as
  two lanes): with named ≥ C, anonymous work borrows named lanes only, and
  total lanes never exceed `C′`.
- **Configured vs effective capacity** (codex 1, opus 1): a pool's
  configured headcount is `C`; its effective width is
  `C′ = max(C, distinct named assignees whose slices fall in it)`. Named
  people are never forced to share a lane — two humans are two humans — so
  when named > C the pool runs wider than configured. `C′ − C` per pool is
  computed by the engine and surfaced (the **over-subscription count**) —
  **resolved (Dany, 2026-08-09): this is the shipped behavior**, widen and
  warn, never refuse; refusing would make assignment order matter and undo
  could resurrect assignments into a full pool. Every invariant below is
  stated over `C′`, and the "headcount 1 ⇒ zero overlap" property is stated
  over unassigned corpora only, where `C′ = C`.
- **Lane pick, exactly** (opus 5, codex 2): candidate lanes are the pool's
  anonymous lanes plus its named people's `busyUntil` entries. For each,
  the slice's start would be `max(its other floors, lane's free time)`. Take
  the lane giving the **earliest start; ties prefer an anonymous lane over a
  named one** (people are kept free for their named work when borrowing buys
  nothing), then lowest lane index, then **person id** — not first
  appearance in the slice array, which is accidental row order
  (`listByProject` has no ORDER BY; codex 3). A named slice always uses its
  person's lane.
- **Borrowing is global, and says so** (opus 5): an anonymous slice placed
  on Kat's lane updates `busyUntil[Kat]` and gains the resource edge — one
  body, so Kat is busy in every pool she appears in. The tie rule above is
  what keeps borrowing from being gratuitous; the cross-pool counterexample
  (borrowing in the Dev pool visibly delaying Kat's QA slice) is a required
  C1 fixture, watched failing with the lane made pool-local (codex 2).
- The floor list gains `capacity`, ordered after `person`: bound only when
  strictly latest, so a tie is never a capacity wait (D6 extended). A named
  slice can never report `capacity` — its lane floor is its person floor,
  and that is correct, not a gap: the person binds. `resourcePredecessorId`
  generalizes: a capacity bind names the slice whose finish freed the lane.
- **The engine stays mode-blind.** The adapter stamps each slice with a
  `poolKey` (`null` = unconstrained) and passes `pools: ReadonlyMap<poolKey,
headcount>`. Keys are joined with the `sliceKey` convention — `\u0000`,
  for the reason written on `sliceKey` (opus 13). **A stamped key missing
  from the map is an engine throw** — the adapter owes a complete map, and
  the guard is watched failing (R5).
- `pools` is a **required** parameter and `poolKey` a **required** field
  (opus 10): an adapter that forgets to pass pools must not compile. The
  "unchanged tests" bar from v1 is dropped as impossible (codex 14) — test
  fixtures gain `poolKey: null` / `NO_POOLS` mechanically; the identity
  claim is carried by the differential's field-for-field `toBe`s, not by
  "no edits".
- Pass 1 (the people-free critical path that sets priorities) stays exactly
  as it is — capacity-free. A zero-length slice neither waits for a lane nor
  occupies one (D5 extended). Non-overlap ≤ C′ per pool holds by the
  person-queue argument: every lane's slices place against that lane's last
  landed finish, nothing is revisited.
- **At headcount 1, the whole plan is one chain and all of it is critical.**
  That is the true answer for a one-person plan — slipping anything slips
  the end — and it is stated rather than discovered (opus 6). Anonymous lane
  hand-offs are **not drawn** as links (a chain of arrows through every
  consecutive pair is noise, not information); the data stays on the wire,
  and person links keep today's rule.

Mode → poolKey resolution, entirely in the adapter — **every input defined**
(codex 8, opus 7):

| slice                                                                                              | pool                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| mode `people` — every slice                                                                        | the project pool, headcount `project.headcount`                                                                                                                                                                                                                                                                                                                                                                                                                 |
| mode `people_by_role` — slice with a `role` row                                                    | that role's pool, `role.headcount`                                                                                                                                                                                                                                                                                                                                                                                                                              |
| mode `people_by_role` — role-less or unlisted-role slice (`slicesOf`'s `unlisted` set emits these) | the project pool                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| mode `people_by_team` — item labeled with team T, T split per role                                 | pool `T×role`; a role the split names gets its row's headcount, a role it does not name gets **1**                                                                                                                                                                                                                                                                                                                                                              |
| mode `people_by_team` — item labeled with team T, unsplit                                          | pool `T`; a labeled team with no `team_headcount` row gets **1** (a team is a distinct group of humans; the default-one posture is uniform)                                                                                                                                                                                                                                                                                                                     |
| mode `people_by_team` — unlabeled item                                                             | the project pool                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| any mode — team label on a parent                                                                  | **does not reach the leaves**: labels do not inherit anywhere else in the product, and pools read the leaf's own label. **Resolved (Dany, 2026-08-09): no inheritance** — and the Gantt is honest about it: an unlabeled leaf under a labeled parent says "project pool" in its floor sentence, so the behavior is visible rather than mysterious. Inheritance, if ever, is its own change — it would move directory-usage counts and D1's delete payloads too. |

The defaults in that table are the adapter _synthesizing_ complete pools —
never a `pools.get` miss reaching the engine, whose missing-key throw guards
the adapter's completeness, not user data.

**Default.** `people` with headcount 1, for new **and existing** projects.
This deliberately breaks today's unlimited-parallel schedules everywhere:
every existing plan gets longer and — for its unassigned work — true.

---

## The changes, three lanes

**Rename lane:** R1 `roles-not-phases` — first; it touches strings everything
else touches. Its `foldedTableMinWidth(phases)` rename lands on whatever T2
has made of that seam — T2 is queued first and rewrites it (opus 14).
**Capacity lane:** C1 `capacity-in-the-engine` → C2 `resourcing-mode-people`
→ C3 `role-headcount` → C4 `team-headcount`. Strictly ordered.
**Split lane:** S1 `teams-and-services` — after D1+D2 land (they harden the
fused `service_team`; racing them churns one seam twice). C4 waits for S1 in
naming only; if S1 slips, C4 proceeds against `service_team` unchanged.

Suggested order: **R1, C1, C2, C3, S1, C4, S2** — S2 is the WBS Services
cell, split out of S1 (Dany, 2026-08-09): the cell is S1's riskiest half
(width budget, chips, journal command) and lands better on the settled
`frameLayout` seam after T1/T2 than racing it; the data model is proven
end-to-end by the directory page alone.

## R1 `roles-not-phases` (~1d)

The glossary already forbids "phase"; this finishes the job where users and
the wire still see it.

1. UI text: `RolesDialog` (né `PhasesDialog` — title, buttons, labels, the
   width sentence), the assumed-assignee sentences (`wbs-table.tsx`,
   `plan-cards.tsx`), the CSV parenthetical (`components/wbs/plan-export.ts`),
   the refusal-sentence table (`wbs-api.ts`), be-01's undo-refusal details
   (`work-item.service.ts`).
2. Wire, both directions (codex 5): be-01 dual-emits `doesEveryPhase` +
   `doesEveryRole` and fe-01 **dual-reads** (`doesEveryRole ??
doesEveryPhase`) — tiers swap independently and a new fe can face the
   outgoing be. Both drops are one named follow-up task.
3. Identifiers and files: `phases-dialog.tsx` → `roles-dialog.tsx`,
   `phasesOf`, `data-phase` → `data-role` (selectors move in the same
   commit), `e2e/phases.spec.ts` → `e2e/roles.spec.ts`, DOM ids `phase-*` →
   `role-*` with their `htmlFor` pairs — and whatever phase-named width
   parameter **survives T2**, which replaces `foldedTableMinWidth` outright
   with the resolved `frameLayout` object (agy 3): the rename targets the
   seam as T2 leaves it, possibly nothing.
4. Left alone, by name: blue/green swap phases, DOM event phases, historical
   change names, test-fixture ids. `CONTEXT.md`'s Outline card entry ("one
   line per phase") is fixed — a live glossary violation either way.
5. Proofs: grep gate — zero domain "phase" outside the named exclusions;
   e2e roles surface green; one tree read carrying both wire fields; a
   dual-read jsdom test against a phase-only payload.

## C1 `capacity-in-the-engine` (~3d) — be-01 only, no schema, no wire

The pools-and-lanes model, engine and tests, dark: the adapter passes
`NO_POOLS` until C2.

1. `Slice.poolKey: string | null` and `schedule(rows, edges, slices,
notBefore, pools)` — both required (opus 10). Existing fixtures updated
   mechanically; acceptance is the differential's field-for-field identity
   under null pools plus `schedule.test.ts`'s numbers byte-same, **not** "no
   edits" (codex 14).
2. Placement: per-pool lazy lane heap; the lane-pick rule above; named lanes
   read/write global `busyUntil` — including for borrowed anonymous work;
   floor kind `capacity`; lane hand-off `resourcePredecessorId`;
   `waitingForCapacity` beside `waitingForPerson` (same per-item counting
   rule); per-pool over-subscription counts (`C′ − C`).
3. Backward pass: lane edges join the augmented graph as resource edges do
   (D4, one more edge source); the tight-path gate (D8) includes lane
   queues.
4. **The people-bearing corpus** (opus 3): the differential's generator stays
   untouched for the identity net, and a second seeded generator names
   people on a fraction of slices and stamps pools. Corpus meta-assertions —
   some seeds produce lane hand-offs, borrowing, over-subscription, a
   cross-pool person — so a green run is not an empty one. Properties over
   it: never more than `C′` concurrent per pool; `headcount ≥ slice count`
   ≡ null pools field-for-field; headcount 1 on the **unassigned** corpus ⇒
   zero overlap; same input twice ⇒ `toBe` every field; input order
   permuted (rows, slices shuffled) ⇒ identical schedule (codex 3 — the
   tie rule is person id, not row order). **The permutation proof is
   vacuous unless the fixture makes the tie reachable** (agy 4 — slice
   priority `(number, at)` is total regardless of input order, so shuffling
   alone can never fail): the fixture holds two named lanes tying on free
   time, and the test is watched red with the tie rule deliberately
   switched to first-appearance order before it is believed.
5. The fractional case (codex 4): a PERT-fraction plan where a capacity wait
   moves both anchors and the lane queue ends the project — anchor fault and
   tight-path fault each injected, each watched red.
6. The cross-pool borrowing counterexample, watched failing with the lane
   made pool-local (codex 2).
7. Benchmark: the 600-slice fixture with pools on; budget stays 10ms.

## C2 `resourcing-mode-people` (~3d) — the mode, the default, the surface

1. Domain: `RESOURCE_MODES` + guard in `libs/domain` (the
   `ESTIMATE_METHODS` pattern).
2. Migration `add_resourcing`: `project.resource_mode text NOT NULL DEFAULT
'people'`, `project.headcount integer NOT NULL DEFAULT 1`, commented
   `down.sql`; additive, swap-safe.
3. be-01: fields in `ProjectPatch` **and the empty-patch guard**
   (`repository/project.ts`); TypeBox literals from the domain constant —
   **accepting only `'people'` until C3/C4 widen the union** (codex 6):
   an unimplemented mode is a 422 `mode_unavailable`, never stored, so
   `tree()` can never read a mode it cannot schedule. Headcount: integer,
   ≥ 1, ≤ 1000, 422 otherwise; the same bounds re-checked at the read
   boundary — SQLite columns exclude none of it (codex 9) — and a stored
   value outside them **throws** (agy 7): a headcount of zero or a mode the
   union does not hold got into the file without going through the
   boundary, which is malformed trusted data under R5, never a silent
   default. Not journaled, like the start date; stated.
4. **Peers**: `ProjectService.update` publishes nothing today (verified —
   opus 15); C2 adds a post-commit `project_settings_changed` event on the
   `role-crud` timing, and only then claims the two-client refetch test.
5. Adapter: mode `people` → every slice `poolKey: 'project'` (the reserved
   key, `\u0000`-safe), `pools = {project: headcount}`.
6. **Wire compat for `boundBy: 'capacity'`** (opus 2 — the shipped
   `gantt-geometry.ts` exhausts `BindingFloor` and throws into the error
   boundary on an unknown kind, and an added enum value cannot be
   dual-emitted): fe-01's tolerance ships **in the same release**, and the
   prod swap for this release is run **fe before be** — the deploy's
   one-tier-list-per-run contract makes that an operator instruction in
   verify.md, not a hope. The residual window — a browser holding pre-C2 JS
   across the swap — lands on the error boundary and heals on reload;
   **accepted (Dany, 2026-08-09)**, same posture as the commit-then-crash
   event window; the two-release staging was declined. And so the _next_
   floor kind never reopens this: an unknown kind becomes a **modeled
   render state** — the bar draws, the floor sentence is omitted, a warning
   is logged — pinned by a jsdom test on an invented kind, while the
   exhaustiveness claim moves to a type-level test asserting fe's
   `BindingFloor` matches the wire union, where drift fails the build
   instead of a reader's session. `'person'` with `personId: null` stays a
   throw — lane binds are `capacity`, never a fake person (opus 2's
   implementer trap, pinned by a test).
7. Wire and surfaces (codex 12, opus 9): tree payload gains `resourceMode`,
   `headcount`, `waitingForPerson` **read at last** (it is emitted today and
   consumed nowhere), `waitingForCapacity`, over-subscription counts; slices
   carry `capacity` binds and lane predecessors. The **schedule header
   note** is built here — "N wait for a person · M for capacity" over the
   table, the surface `resource-leveling` promised and nobody built; the
   over-subscription warning renders in the Resourcing control ("2 people
   assigned, 1 configured") — both budgeted, which is why C2 grew from 2d
   to 3d.
8. Settings surface: a **Resourcing** control in the toolbar settings
   cluster by `Plan with` (`wbs-table.tsx`, the project-wide-setting
   comment) — mode select + heads input. Proof is toolbar wrap behavior at
   the e2e header matrix widths — row count and frame height, **not** the
   table-fit equation, which no toolbar control can fail (codex 13); mobile:
   the control rides `toolbarControls` into the Plan-actions sheet with a
   browser proof (fifteenth check).
9. Tests: e2e Gantt inventory — specs assuming two unassigned rows run in
   parallel go legitimately red under default 1 and are rewritten through
   the sixteenth-check discipline; jsdom for the control, refusals, header
   note, and the two-client refetch.
10. **Identity nets** (opus 4): the differential keeps guarding the engine's
    null-pool path. `live-plan-2026-08-09.json` is **kept**, replayed
    through `tree()` with the project's headcount set to 999 — at that width
    the pool ≡ null pools by C1's proven equivalence, so the old capture
    stays a live end-to-end net rather than a snapshot of the new code. A
    **second** fixture is captured at headcount 1 after C2 settles on dev.

## C3 `role-headcount` (~1d)

1. Migration: `role.headcount integer NOT NULL DEFAULT 1` + down.sql.
2. be-01: the role PATCH grows the field with a stated contract (codex 9):
   `{name?, headcount?}`, at least one, atomic, same refusal table, bounds
   as C2, read-boundary re-check. The mode union widens to
   `people_by_role`. Adapter per the resolution table; role removal takes
   its headcount with the row — usage prose unchanged.
3. fe-01: the Roles dialog (R1's) gains a heads column; the mode select
   offers `people_by_role`. **The project heads input stays visible in
   every mode**, relabeled as the default pool ("everything else") — in
   `people_by_role` it governs role-less and unlisted-role slices, and
   hiding it would leave that pool real but uncontrollable (agy 6).
4. Proofs: roles 2/1 over four independent two-role items — Dev pairs
   overlap, QA serializes; a lone named assignee lands in both pools and
   the `C′` checker holds; the borrowing tie rule visible: an anonymous Dev
   slice prefers the free anonymous lane over idle Kat; jsdom dialog
   round-trip.

## C4 `team-headcount` (~3d) — after S1 for naming only

1. Migrations: `team_headcount(project_id, team_id, headcount)` PK
   `(project, team)`, and `team_role_headcount(project_id, team_id, role_id,
headcount)` PK `(project, team, role)` — two tables because a nullable
   role in one composite key is a lie in SQLite. **DB-level `ON DELETE
CASCADE` on team, role, and project FKs** (codex 7): the outgoing D1
   binary deletes teams knowing nothing of these tables, and a restrictive
   FK would 500 it mid-swap; the negative test drives the delete through
   raw SQL the old release's shape, watched clean.
2. Adapter per the resolution table. A named assignee claims a lane in
   whatever pool their slice fell in — the pool is how many hands, never
   whose: **directory membership does not gate assignment** (the
   "somebody from another team" scenario is untouched).
3. be-01: `PUT /api/projects/:id/team-headcounts` replaces the project's
   set atomically — team rows + role rows in one transaction, typed
   `unknown_team`/`unknown_role`, **gated by `canEdit`, bumping
   `project.revision` in the same transaction (the role-satellite rule),
   publishing `project_settings_changed` post-commit** (codex 10, opus 15).
   `unknown_role` means **not a role of this project** — role ids are
   globally unique and a role from project B would insert cleanly, so the
   scope check is in-transaction and its negative is a cross-project
   role id watched refusing (agy 8). Bounds and read-boundary checks as
   C2. The mode union widens to `people_by_team`.
4. fe-01: the Resourcing control grows a per-team list — **the union of
   teams labeling this project's items and teams holding stored rows**
   (codex 15: a team whose last label was removed keeps its config visible,
   marked "not on this plan", deletable but never silently revived or
   silently dropped), plus the project-default row for unlabeled work; each
   team row: heads, or "per role" unfolded into a number per project role.
   Mode switches never delete rows; only the PUT does, and it deletes
   exactly what the visible list omits.
5. Proofs: two teams 1/2 + unlabeled default, deps crossing teams; split
   team {Dev:2, QA:1} holds a third Dev item while QA runs; a role added
   after a split schedules at the default of 1 without a 500 (opus 7d); a
   person assigned across two teams never overlaps themselves and both
   pools count them while they work there — watched failing with the lane
   made pool-local.

## S1 `teams-and-services` (~2d) — after D1+D2 land

The split, kept off the engine entirely: services never reach scheduling —
a stated non-goal. **The WBS cell is not here** — it split to S2 (Dany,
2026-08-09); S1 proves the data model end-to-end through the directory
page alone.

One verified fact this lane inherits (2026-08-09, replayed migrations,
`PRAGMA foreign_key_list(work_item)`): `work_item.service_team_id` carries
a **real FK** to `service_team(id)` — the Drizzle model omits it and
`directory-crud`'s "no FK exists" premise was wrong; that change's
proposal and tasks are amended (null labels **before** the team delete, FK
violation as the watched negative, Drizzle model aligned). S1.2's
`ON DELETE SET NULL` requirement stands on the same ground.

1. Naming: the fused "Service team" becomes **Team** in the glossary and UI
   ("Service/team" header → "Team"); the `service_team` table keeps its
   name — renaming a table is destructive under the migration rules. The
   glossary work is unconditional (opus 11): **Team** rewritten, **Service**
   added, **Directory** and **Directory usage** entries re-worded to carry
   services.
2. Schema, additive: `service(id, name unique, team_id → service_team **ON
DELETE SET NULL**)` (codex 7, opus 8 — the outgoing D1 delete must not
   500 on a table it has never heard of), `work_item_service(work_item_id
CASCADE, service_id, PK both)` + down.sqls. A service's team is a label
   on the service, constraining nothing.
3. Directory page gains a Services panel: create, rename, delete
   (refuse-by-default carrying usage — **and D1's team-usage payload is
   extended with the services a team delete would unlabel**, so D2's
   confirm keeps naming everything it touches, Dany's 2026-08-09
   sharpening; opus 8), assign-to-team single-select. `directory_changed`
   extends to services.
4. Duplicate-subtree, plan export and undo honor the new satellite even
   before it is editable from the plan: duplication copies each row's
   service set, deletion's compensating command restores it, export grows
   the column. **Any row may carry services, parents included** — a
   service is a label with the team label's semantics, never a schedule
   input; nothing accumulates because the join rows die with their work
   item (agy 9, stated rather than left to differ from the team column).

## S2 `services-on-the-plan` (~1d) — fast follow, after T1/T2 settle

The WBS Services cell, on the settled `frameLayout` seam. **The cell is a
work-item satellite and behaves like one** (codex 11): editing it bumps
the work item's revision in the same transaction (the `bumpWorkItems`
rule), is journaled as a reversible set-services command carrying the
before-set, renders one line on the outline card, and broadcasts the
ordinary work-item change. Multi-chip UI on the membership-chips pattern,
full-replace, typed `unknown_service`. Width budget measured first; if it
does not fit the frame-layout equation, it ships folded behind the
compact-columns seam and the finding goes to Dany.

---

## Budget

R1 1 + C1 3 + C2 3 + C3 1 + C4 3 + S1 2 + S2 1 ≈ **14 agent-days** (v1 said
11.5; codex 12/14 and opus 2/3/9 named the exclusions — the header note, the
people-bearing corpus, the wire-compat work, the journal/revision plumbing).
Review checkpoints: after C2 (the default flips here) and after C4/S2.

## Open questions — resolved by Dany, 2026-08-09

1. **Named assignees above the headcount:** effective capacity `C′` plus
   the loud over-subscription warning; refusal rejected (assignment order
   and undo would start mattering). Folded into the model section.
2. **The `capacity` wire window:** single release, fe-before-be swap
   order, the stale-JS error-boundary window accepted; two-release staging
   declined. With one hardening so the next enum member never reopens it:
   unknown floor kinds become a modeled render state, exhaustiveness moves
   to a type-level test. Folded into C2.6.
3. **Team labels on parents:** no inheritance; the floor sentence names
   the project pool so the fallback is visible. Inheritance, if ever, is
   its own change. Folded into the resolution table.
4. **Services in the WBS table:** the cell splits out of S1 into S2, a
   fast follow after T1/T2 settle; S1 proves the model through the
   directory page alone. Folded into the lanes, S1 and S2.
5. **The `service_team_id` FK discrepancy:** checked, the FK is real
   (replayed migrations, `PRAGMA foreign_key_list(work_item)`).
   `directory-crud`'s proposal and tasks are amended — labels nulled
   before the team delete, the FK violation as the watched negative, the
   Drizzle model aligned. Folded into S1's header note.

## Assumptions — best guess recorded, Dany can override any

1. **The default applies to existing projects.** No grandfathering; every
   existing plan's dates move (longer, and for unassigned work, true).
2. **Unlabeled, role-less, and unlisted-role work falls to the project
   pool**; an unconfigured team or unnamed split role defaults to 1 — the
   default-one posture, uniformly.
3. **One Resourcing surface** by `Plan with`, growing per mode; role heads
   also in the Roles dialog. No new page.
4. **Wire renames dual-emit and dual-read for one release**, then drop.
5. **Resourcing writes are not journaled**, matching start date and
   estimate method.
6. **C2 stores only modes it can schedule** — the enum widens change by
   change; dormant configs (role/team rows) survive switching away and
   back.
7. **All-critical at headcount 1 is shipped as the true answer**, with
   anonymous hand-off links undrawn to keep the Gantt readable.

## Disposition table (v1 review)

| finding                                                                                                         | disposition                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| codex 1 / opus 1 (over-subscription cancels the invariant and the default; named lanes never gated by C)        | **Accepted, escalated** — configured `C` vs effective `C′` split; invariants restated over `C′`; headcount-1 property scoped to unassigned corpora; the policy itself is open question 1, not an assumption.                             |
| codex 2 / opus 5 (anonymous-on-named-lane transition unspecified; cross-pool consumption unstated)              | **Accepted** — borrowing updates the person's global `busyUntil` + resource edge; lane pick minimizes start with anonymous preferred on ties; cross-pool counterexample a required watched-red fixture; consequence stated in the model. |
| codex 3 (determinism rests on accidental DB order; repeat-run proof vacuous)                                    | **Accepted** — tie rule is person id; the negative permutes row/slice order and demands identical output.                                                                                                                                |
| codex 4 (no fractional anchor/tight-path proof under capacity)                                                  | **Accepted** — C1.5: PERT-fraction capacity-wait fixture, both faults injected, watched red.                                                                                                                                             |
| codex 5 (dual-emit covers one direction only)                                                                   | **Accepted** — fe dual-reads too; both drops one named follow-up.                                                                                                                                                                        |
| codex 6 (three stored modes, one defined behavior)                                                              | **Accepted** — PATCH accepts only implemented modes (422 `mode_unavailable`); union widens per change; dormant configs persist (assumption 6).                                                                                           |
| codex 7 / opus 8 (S1/C4 FKs 500 the outgoing D1 delete; usage payload under-reports)                            | **Accepted** — `service.team_id ON DELETE SET NULL`; headcount tables DB-cascade on team/role/project; old-release-shape raw-SQL negative; D1 team-usage payload extended with services.                                                 |
| codex 8 / opus 7 (pool-key resolution: unlisted roles, parent labels, missing team/role rows)                   | **Accepted** — the resolution table defines every input; adapter synthesizes complete pools; engine missing-key throw guards the adapter, watched failing; parent-label inheritance is open question 3.                                  |
| codex 9 (headcount validation only on the project column; no read-boundary checks)                              | **Accepted** — same bounds at all three write boundaries and re-checked on read; role PATCH contract stated (at-least-one, atomic).                                                                                                      |
| codex 10 / opus 15 (C4 omits canEdit/revision/eventing; C2's refetch test assumes an event that does not exist) | **Accepted** — C2 adds `project_settings_changed` post-commit (verified: `ProjectService.update` publishes nothing today); C4's PUT gates, bumps in-transaction, publishes post-commit.                                                  |
| codex 11 (services satellite skips revision/journal/broadcast)                                                  | **Accepted** — S1.4: work-item revision bump, reversible journaled command, duplicate/export/card/broadcast each named.                                                                                                                  |
| codex 12 / opus 9 (`waitingForPerson` has no reader; the "header note" does not exist; counts invisible)        | **Accepted** — C2.7 builds the schedule header note and the over-subscription warning; wire types gain both counts; C2 budget 2d → 3d.                                                                                                   |
| codex 13 (width proof aimed at the wrong subsystem)                                                             | **Accepted** — toolbar wrap/row-height proof at the header-matrix widths; table-fit equation dropped from C2's proof.                                                                                                                    |
| codex 14 / opus 10 (required field vs "no edits" cannot both hold; optional pools makes wiring untestable)      | **Accepted** — both required, fixtures edited mechanically, identity carried by the differential's values; "no edits" bar dropped.                                                                                                       |
| codex 15 (stored team config unreachable once unlabeled)                                                        | **Accepted** — C4.4: canonical set = stored ∪ labeling; unused configs visible and marked; PUT deletes exactly what the visible list omits.                                                                                              |
| codex 16 / opus 11 (glossary left false; non-goal reversed silently)                                            | **Accepted** — reversal named in C1's proposal; unconditional CONTEXT.md work: Resourcing, Pool, Headcount, Team, Service; Resource leveling and Directory entries rewritten.                                                            |
| opus 2 (`capacity` throws in shipped `gantt-geometry`; cannot dual-emit an enum member)                         | **Accepted, escalated** — fe tolerance in-release, fe-before-be swap order as an operator instruction, residual stale-JS window stated; stricter two-release option is open question 2; `'person'`+null-person stays a pinned throw.     |
| opus 3 (properties aimed at an unassigned corpus; R5-vacuous)                                                   | **Accepted** — C1.4: second people-bearing generator with corpus meta-assertions (hand-offs, borrowing, over-subscription, cross-pool person all provably present).                                                                      |
| opus 4 (re-capturing the live fixture destroys the end-to-end net)                                              | **Accepted** — old fixture kept, replayed at headcount 999 (≡ null pools by C1's proven equivalence); the headcount-1 capture is a second fixture, not a replacement.                                                                    |
| opus 6 (headcount 1 ⇒ all-critical, links everywhere; D4's meaning shifts)                                      | **Accepted** — stated as the true answer (assumption 7); anonymous hand-off links undrawn; float/critical semantics documented in C1's design.                                                                                           |
| opus 12 (unbounded headcount; eager lanes)                                                                      | **Accepted** — lanes lazy by construction; ≤ 1000 at every boundary.                                                                                                                                                                     |
| opus 13 (poolKey encoding unspecified)                                                                          | **Accepted** — `sliceKey`'s `\u0000` convention, named reserved project key.                                                                                                                                                             |
| opus 14 (stale citations; R1 races T2's rewrite)                                                                | **Accepted** — symbols over line numbers, base-drift note in the header; R1's `foldedTableMinWidth` rename explicitly lands on T2's output.                                                                                              |

## Disposition table (v2 review — agy)

| finding                                                                                          | disposition                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| agy 1 (anonymous lane count uncapped; C=1 + one named person reads as two lanes)                 | **Accepted** — v2 had dropped v1's cap; restored explicitly: anonymous lanes ≤ `max(0, C − named)`, total never exceeds `C′`.                                                                                                                                                                                                                                      |
| agy 2 (`capacity` crashes pre-C2 JS via `GanttDataError`)                                        | **Convergent with opus 2** — already folded: fe tolerance in-release, fe-before-be swap order, residual window stated, stricter two-release option is open question 2. agy's severity noted; no further change.                                                                                                                                                    |
| agy 3 (R1 renames a function T2 deletes)                                                         | **Accepted** — R1.3 retargeted to the seam as T2 leaves it, possibly nothing.                                                                                                                                                                                                                                                                                      |
| agy 4 (permutation determinism test vacuous — slice priority is total regardless of input order) | **Accepted as a sharpening, premise half-rejected** — the _lane-pick_ tie among equal-freeing named lanes is a real input-order degree of freedom the priority table does not cover; but agy is right that a generic shuffle cannot reach it. The fixture must construct the tie and the test is watched red with the tie rule switched to first-appearance order. |
| agy 5 (Resourcing control breaks H1's one-row header)                                            | **Rejected** — the control lives in the table toolbar, not the header; the toolbar wraps by contract and its e2e proves the wrap (codex 13 already moved C2's proof onto toolbar rows/height at the matrix widths). H1's header budget is untouched.                                                                                                               |
| agy 6 (`people_by_role` leaves the fallback project pool uncontrollable)                         | **Accepted** — C3.3: the project heads input stays visible in every mode as the default pool.                                                                                                                                                                                                                                                                      |
| agy 7 (read-boundary outcome undefined; defaulting violates R5, throwing kills the read)         | **Accepted, throw** — a stored value the boundary could never have written is malformed trusted data; R5 says throw, and it does. Stated in C2.3.                                                                                                                                                                                                                  |
| agy 8 (cross-project role id inserts cleanly into `team_role_headcount`)                         | **Accepted** — `unknown_role` defined as not-a-role-of-this-project, checked in-transaction, cross-project negative watched refusing.                                                                                                                                                                                                                              |
| agy 9 (parent services and duplication semantics undefined)                                      | **Accepted** — S1.4: any row may carry services (team-label semantics), duplication copies per row, join rows cascade with the work item.                                                                                                                                                                                                                          |
| agy 10 (`project_settings_changed` forces full-tree refetch)                                     | **Rejected** — a resourcing change moves every slice's dates, so the tree _is_ the delta; refetch-on-event is the house pattern for every satellite write.                                                                                                                                                                                                         |
