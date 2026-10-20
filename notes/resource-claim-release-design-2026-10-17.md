# Task-claimed resources: claim → hold → release for WBS

2026-10-17 · design consult for Dany · read-only analysis, no code changed.
Request, verbatim: _"I want each task to be able to claim and release resources —
like a task can be claimed by agent, but then the task can claim a work tree, a
portion of disk for tmp files, etc and these resources need to be released when
the task is done. Kinda similar to operating system. Does it make sense?"_

Everything below is grounded in files read at the `fix/mcp-store-container-path`
checkout (`eabf09a8`, 0 ahead / 1 behind `origin/main` — effectively main).
Where I could not verify something I say so.

---

## 0. Two readings, and the repo has already ruled on the boundary

The request supports two readings, and they are different designs:

- **(a) A resource model inside the WBS product.** Work items state demands on
  typed resources; the schedulers level against them; dates move when a
  resource is contended. The claim/hold/release is _simulated_ inside a
  schedule computation.
- **(b) Resource accounting for the agent/worker runtime** that executes WBS
  tasks. An agent claims a task, the task claims a worktree and a disk budget,
  a crashed holder's claims are reclaimed. The claim/hold/release is _live
  state_ with owners, leases and recovery.

**I am not picking one silently — the repo has already split them, in an
approved spec.** `CONTEXT-MAP.md` (root): _"WBS planning capacity and Twilight
runtime admission are distinct quantities; a plan carries both without
conversion and measured usage returns as a progress receipt."_ The contract is
`openspec/changes/twilight-control-plane/design.md` §"Planning, knowledge and
client portability" (lines 969–974): a `WorkPlan` carries resource units per
task in the A12 vocabulary (_human minutes, agent time, tokens, money, slots_)
beside WBS workdays; Twilight Dash reserves against **its** pools and writes
measured usage back as a progress receipt; no unit converts implicitly.

And reading (b) is **already designed** in the same document (lines 548–563):

> "Admission reserves a vector atomically before launch: agent and secretary
> slots, provider and model rate and token limits, workspace writer ownership,
> reviewer, build, browser and branch-dev-environment slots, and an attempt
> allowance from the run budget account. Starting counts as occupied. …
> Capacity occupancy cannot be preempted without proven drain; report resource
> blocking separately from starvation. … Blocked tasks expose their missing
> pool while other feasible tasks proceed."

That is Dany's worktree/disk example, specified: atomic vector claims,
occupancy from start, drain-gated preemption, starvation reporting. The repo
also already _runs_ a production-grade lease system of exactly this shape: the
solver slot machinery (`solver_slot` in
`libs/wbs/adapters/store-sqlite/src/schema.ts:2327`; design in
`openspec/changes/dual-optimized-scheduler/design.md`) — admission counted from
reservation (`lifecycle: 'starting' | 'running'`), a fencing `attemptToken`
checked on every later write, heartbeats, `admittedDeadlineAt` reclamation, and
two-phase cancel-and-drain (`beginOptimizationDrain`/`finishOptimizationDrain`)
with idempotent, racing-safe finish. Reading (b) should generalise _that_, in
Dash, not grow a second lease system inside the WBS product.

**So this note designs reading (a)** — the WBS domain model — and keeps (b) as
the runtime counterpart the plan reconciles with through receipts. **How the
two readings differ** if you pick the other one: (b) needs holders, fencing
tokens, deadlines, heartbeats, reclamation and drain (all per `solver_slot`);
(a) needs none of those, because a planned claim has no owner and no death —
it is recomputed from plan data on every schedule. Blurring them is the one
genuinely bad outcome; §3 names why.

---

## 1. Does it make sense? Verdict

**Yes for planning, with one honest restriction; and the runtime half already
exists on paper.** WBS already _is_ a claim/release scheduler for exactly one
resource type: a team's slots. The glossary (`CONTEXT.md`) defines **Pool**
("the slots one team's capacity provides on one plan"), **Slot** ("held for
the whole of a block's duration and released when it finishes. Counted, never
named"), **Block** ("its width for its whole duration, taken indivisibly"),
**Blocking set**, and **Binding floor**. The engine implements acquire/release
ledgers literally: `capacityProfile` in
`libs/wbs/domain/domain/src/schedule.ts:773` keeps per-pool event lists with
`acquires`/`releases` sets; `reserve(poolIds, node, width, start, finish)`
(schedule.ts:1056) writes the acquire and release events; `jointWindowFor`
(schedule.ts:1003) finds the earliest instant _all_ pools fit. The CP-SAT side
mirrors it: one `AddCumulative` per pool, demand `width`
(`libs/wbs/adapters/solver-py/src/wbs_solver/model.py:208–219`), one
`AddNoOverlap` per person (model.py:221–231). Generalising "team slots" to
"typed resources" is an extension of a model that exists, not a new subsystem.

**Where the OS analogy holds:** an OS has two distinct mechanisms that are
easily conflated — a _scheduler_ (plans execution against declared resource
needs) and a _kernel object table_ (live handles with owners, refcounts, and
cleanup when a process dies). WBS is the scheduler; Twilight Dash is the
kernel. Dany's sentence contains both: "a task can be claimed by an agent" is
kernel (Dash admission), "the task can claim a worktree" is both — the _plan_
says one worktree-unit is needed for the task's duration (WBS), the _runtime_
hands out worktree `wt-7` and takes it back (Dash).

**Where the analogy breaks, and it matters:**

1. **An OS allocates at request time; WBS plans the whole horizon at once.**
   There is no "request arrives, maybe blocks" in the engine — `schedule()` is
   a pure function of the plan (the seven-field `ScheduleInput`,
   `libs/wbs/domain/domain/src/canonical-schedule-input.ts:48`) and places
   every block atomically at the earliest joint window. That kills the hardest
   OS problems (deadlock, hold-and-wait) _by construction_ — see §3 — but it
   also means WBS can never answer "who holds the worktree right now". That
   question is Dash's, by the A12 contract.
2. **"Released when the task is done" does not currently happen in the plan,
   and a resource model inherits that.** The engine reads no progress, fact
   date or status field: `slicesOf`
   (`libs/wbs/application/core/src/service/work-item.service.ts:231`) emits
   slices for every leaf regardless of status, `canonicalScheduleParts`
   (work-item.service.ts:408) passes no status data, and `CONTEXT.md` says it
   outright — "**Fact start** … read by no engine". A done work item's slices
   still occupy their pools in every computed schedule; only the _drawing_
   changes (the **Done bar** replaces the slices). Whether done work should
   stop occupying is a real, separate product decision (§6 Q5) — it moves
   dates on every plan that has done items, so it is not a rider on this
   change.
3. **The engine is per-project; physical resources are not.** Both engines
   schedule one project in isolation (the `ScheduleInput` has no cross-project
   anything; `projectTeamCapacity` is keyed `(projectId, serviceTeamId)`,
   schema.ts:1610). Two projects each told "1 staging environment" will both
   plan as if they own it. Planning-side capacity therefore stays a
   _per-project statement_, exactly like team capacity today ("a fact about
   the pair, never about the team" — `docs/capacity.md`), and the single
   source of physical truth is Dash's global pools at runtime. I considered
   and rejected pretending otherwise: cross-project leveling would need a
   deployment-wide scheduling pass, a different cache identity, and a
   different collaboration model. Say the limit; don't blur it.

**The strongest argument against doing it at all:** the entire concurrency and
caching architecture — Input hash, Generation, cancel epoch, debounced
Optimized runs, broadcast convergence (`CONTEXT.md` Architecture terms;
`dual-optimized-scheduler/design.md`) — rests on the schedule being a pure
function of slowly-changing plan data. Live claim state is fast-churning
runtime data; putting it into the plan would thrash the Input hash (every
claim/release = new hash = cancelled solver runs and broadcast storms) and put
runtime truth onto a surface any signed-in account can edit concurrently.
Meanwhile the _planning_ need that is actually proven today is thin: teams and
people already cover "who/how many", and no user-visible requirement in
`openspec/` asks for generic resources. If Dany's underlying itch is only
"agents should not fight over worktrees", reading (b) alone — Dash admission,
already specced — satisfies it with **zero** WBS product changes, and that is
the honest cheapest answer. The case for (a) is forecasting: _dates that move
when a scarce non-person resource is contended_, which nothing in Dash can
ever give him because Dash does not plan. Both halves are real; they are just
different deliverables.

---

## 2. Domain model

Names follow `CONTEXT.md`'s existing language and its _Avoid_ discipline. New
terms are marked ①; everything else exists.

### Entities

**① Resource** — a claimable thing work can be labelled with, named in the
directory like a Service team: directory-wide identity, unique by name, no
global size. _Avoid: asset, pool (that is the scheduler-side projection),
resource type (that is the kind)._ Fields: `id`, `name`, `kind`, `unitLabel`
(free text: "worktrees", "MB", shown in cells and hover sentences).

**① Resource kind** — which scheduling problem the resource is, a closed enum.
The three are genuinely different problems and the model must not blur them:

| kind        | capacity means                           | claim means                      | scheduling shape                                   | examples                                       |
| ----------- | ---------------------------------------- | -------------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| `exclusive` | how many identical units exist (often 1) | 1 unit for the block's duration  | cumulative with demand 1 (capacity 1 ⇒ serialises) | a staging env, a device, a worktree-as-unit    |
| `divisible` | N integer units                          | k units for the block's duration | cumulative with demand k                           | 200 of 2048 MB tmp disk, 4 of 16 licence seats |
| `renewable` | N units **per period** (e.g. hours/week) | k units drawn per period touched | calendar-bucketed cumulative                       | a person's hours this week                     |

`exclusive` is `divisible` with capacity 1 _for the engine_, but it is kept a
distinct kind because the product semantics differ: an exclusive unit may
later want identity at runtime ("which worktree"), its UI sentence is "waits
for _the_ staging environment", and demand is fixed at 1 — a claim of 2 on an
exclusive resource is a refusal, not a clamp. `renewable` is **not buildable
on the current engines** and ships in no early increment — §4 names the exact
cost. Note the team Pool is _not_ folded into this enum: a team's pool is
derived from Capacity and label inheritance and stays exactly as it is.

**① Resource capacity** — how many units of one resource one project's plan
may use, keyed `(projectId, resourceId)`, mirroring `projectTeamCapacity`
(schema.ts:1610) field for field including the "absent = unstated = constrains
nothing" rule and the Remembered-capacity third state (`docs/capacity.md`,
"The three states"). Per-project deliberately — see §1 break 3. _Avoid: quota,
limit, size (the team table's word, kept there)._

**① Demand** — the planning statement one work item makes on one resource:
`(workItemId, resourceId, units)`, units a positive integer, 1 enforced for
`exclusive`. A **Satellite** in the glossary's exact sense ("a row that
belongs to one entity, has no identity anyone holds" — writing one moves the
owner's **Revision**), stored like `workItemTeam` (schema.ts:1113), written
through the ordinary **Command batch**, undoable through the **Command
journal** with **Preconditions** — all existing machinery, nothing new to
invent for conflict safety. Scope decision: demand is **per work item, charged
on every slice of it** (each step's block holds the units while it runs),
matching how `poolIds` already rides every slice of a leaf
(work-item.service.ts:295). Per-step demand is a later refinement nobody has
asked for. _Avoid: claim (reserved for runtime), requirement, reservation._

Deliberately **not** inherited down the tree in v1. Teams inherit
(`effectiveTeamsOf`) because a team is an organisational label; "this subtree
needs the staging env" is better stated per leaf, and inheritance here would
mean every leaf under the parent holds the env _concurrently multiplied_ —
almost never what the author meant. If inheritance is wanted later it has the
Effective-team-set precedent to copy.

**① Lease** — the _runtime_ hold: `(resource unit, holder, attemptToken,
admittedDeadlineAt, heartbeatAt, lifecycle)`. Named after the glossary's
existing "Upstream refresh lease" ("the short exclusive claim one mcp-01
process holds…"). **Lives in Twilight Dash, not in WBS tables.** WBS sees
leases only as A12 **progress receipts** attached to work items — read-only
facts ("held wt-7 for 3h12m, peak tmp 410 MB"), never schedule inputs. _Avoid:
lock, claim row, hold._

### Lifecycle

Planning side — there **is no persisted lifecycle**, and that is the design,
not a gap: a Demand is plan data; the claim→hold→release cycle is _computed_
on every `schedule()` run exactly as team slots are today — the **Block**
acquires all its units atomically at its placed start (`reserve`,
schedule.ts:1056), holds them for its duration, releases at finish. No state
machine, no orphans, no stale holds, because nothing survives the computation.

Runtime side (Dash's, stated here only so the two halves are designed against
each other): `requested → reserved (atomic vector, counts as occupied from
reservation) → active (heartbeating) → released | reclaimed (deadline passed)
| drained (cancel path)` — which is `solver_slot`'s lifecycle generalised,
with the same invariants: reservation is the counted thing, the token fences
every later write, release is conditional on the token, reclamation never
fires before the stored deadline.

---

## 3. The hard parts, named

**Deadlock / hold-and-wait.** Planning: _impossible by construction, and the
construction must be preserved._ A Block "starts only where every one of its
slots is free for all of it; it never starts narrow and widens later"
(`CONTEXT.md`), and `jointWindowFor` computes the earliest instant all pools
jointly fit — acquisition is all-or-nothing at one instant, so the
hold-and-wait Coffman condition never arises. The rule to carry into the
generalisation: **a block's whole demand vector (team slots + resource units)
is acquired atomically at one start; never add incremental acquisition** (e.g.
"grab the worktree at step 1, the disk at step 2") — that is where planning
deadlock would come from. Runtime: the control-plane design makes the same
move ("reserves a vector atomically before launch"); the residual risk is
**mid-task expansion** (a running task discovering it needs more disk).
Expanding while holding reintroduces hold-and-wait. Policy: an expansion is a
fail-fast _try_ — granted from free capacity instantly or refused, never
queued; a refused task checkpoints, releases, and requeues with the larger
declared vector. That keeps the no-wait invariant and makes the failure a
visible receipt ("declared 200 MB, needed 600") that improves the next plan.

**Starvation and priority inversion.** Planning: the existing, deliberate
rule already answers this — "a priority-1 block needing 3 slots can be
overtaken by a priority-2 block needing 1, because the narrow one fits a hole
the wide one cannot use" (`docs/capacity.md`, arguing from
capacity-engine D7; glossary **Priority**: "placed first is not started
first"). Exclusive resources sharpen it: a capacity-1 resource serialises
every demander, so a long low-priority block placed early (eligible earlier)
holds it ahead of high-priority work that becomes eligible later, and Fast
does no lookahead reservation. That is inversion, and the honest position is:
Fast keeps D7's bargain (no idle-the-pool reservations; finish-the-plan-early
wins), the Optimized engine is exactly the remedy — CP-SAT _can_ idle a
low-priority block to let a high-priority one at the resource, which is what
the `optimizer` **ScheduleFloor** already means (schedule.ts:168–193). No new
mechanism; the pair of engines is the mechanism. Runtime: the control-plane
design already mandates the aging window ("tasks that reach the aging window
outrank unaged work, oldest first") and "report resource blocking separately
from starvation" — keep both; priority _inheritance_ (the OS trick) is
useless here because you cannot speed up an agent by donating priority to it.

**Orphaned claims** (task deleted, abandoned, holder dies). Planning: cannot
exist — a Demand dies with its work item (satellite cascade), and the next
schedule is recomputed from surviving plan data; a deleted project's cached
optimized rows already drain via the two-phase protocol. Runtime: the
`solver_slot` pattern is the answer and is already proven in production
design: heartbeat + stored `admittedDeadlineAt` ("reclamation reads it and
never recomputes it"), reclaim only after the deadline, a **fresh fencing
token for the replacement** so the dead holder's late writes match zero rows,
and deletion through cancel-and-drain where "`ON DELETE CASCADE` remains a
backstop, never the mechanism" (`dual-optimized-scheduler/design.md`,
"Generations… drain closure is durable"). Dash should copy it verbatim,
including the two drain-finish paths (opportunistic on release + periodic
reconciler) that fixed the initiator-crash wedge.

**Preemption.** Planning: not a concept — plans are recomputed whole, nothing
is "taken away". Runtime: default non-preemptible; the control-plane line is
exact — "capacity occupancy cannot be preempted without proven drain". For a
worktree that is physically right (preempting = corrupting someone's working
tree); preemption is therefore always cancel-and-drain of the holder, then an
ordinary grant. Per-kind preemptibility flags are future vocabulary, not v1.

**Idempotent release.** Runtime: yes, by the token-fence construction —
release is `UPDATE/DELETE … WHERE attempt_token = :token`; the second call
matches zero rows and is a no-op; a _superseded_ holder's release also matches
zero rows and cannot free the replacement's lease. Release must also run the
opportunistic drain-finish check in the same transaction (the pattern the
dual-optimized design added after finding the crash wedge). Planning: the
question dissolves — there is no release call.

**A claim produced by a cancelled Optimized run.** It never existed, and the
existing machinery is precisely what guarantees it: a schedule's placements
are a _picture_ of claims, not claims, and a superseded or cancelled run
cannot store or broadcast that picture — every worker-owned outcome write is
conditional on current generation + unchanged cancel epoch + toggle still on +
its own attempt token (`CONTEXT.md` **Cancel epoch**, **Attempt token**;
design.md "Turning the toggle OFF advances a cancellation epoch"). The
invariant to protect in this change: **engines read Demands; nothing an
engine or solver does ever writes a hold anywhere.** The moment a solver run
acquires something real, cancellation stops being free and the whole
generation/epoch edifice stops being sufficient.

**Concurrent collaborative edits.** Demands ride the machinery that already
makes every satellite conflict-safe: the **Write coordinator** serialises
writers, a **Command batch** is all-or-none, Demand writes move the work
item's **Revision**, undo checks **Preconditions**, and a schedule recompute +
broadcast follows any batch that changed an input. A Demand edit changes the
canonical input → new **Input hash** → new Generation → in-flight solves for
the old hash are fenced out. Nothing new to design; the only obligation is
that Demands and Resource capacities enter the canonical string (§4), or
edits would serve stale cached schedules — the exact correctness rule
`canonical-schedule-input.ts:4–9` states.

**The one blur that must not happen**, restated as a falsifier: if any design
artifact ever makes `schedule()` read a Lease, or makes a solver run write
one, this design has been violated and the Input-hash cache, the cancellation
model and the collaboration model are all simultaneously wrong.

---

## 4. How the two engines change

### Fast (`libs/wbs/domain/domain/src/schedule.ts`)

Today a slice carries one `width` spent identically in every pool of
`poolIds` (`Slice`, schedule.ts:33–85; "every member spends the block's whole
width" — Dany 2026-08-13). A worktree demand breaks that: a width-2 (two
people) slice claiming 1 worktree must spend 2 in the team pool and 1 in the
worktree pool. So the generalisation is **per-pool demand**:

1. `Slice` gains `demands: readonly { poolId: string; units: number }[]` —
   the team pools entering as `units = width` (derived by the caller,
   `slicesOf`, work-item.service.ts:231, where width/pool resolution already
   lives), resource pools as the stated Demand units. `width` itself stays:
   it alone divides effort into duration (`days / width`,
   schedule.ts:27–28); resource units never affect duration.
2. `PoolSizes` (schedule.ts:100) gains the resource capacities — same map,
   same R5 rule ("an absent entry throws; a default of Infinity would be a
   pool constraint silently not applied", schedule.ts:795).
3. `windowFor(poolId, width, duration, floor)` (schedule.ts:854) is already
   per-pool-per-call and does not change. `jointWindowFor` (schedule.ts:1003)
   asks each pool with _its own_ units instead of one shared width — the
   fixpoint and both termination arguments survive unchanged, because each
   pool's answer was always a function of (candidate, width-for-that-pool)
   and reservations stay immutable. `reserve` (schedule.ts:1056) writes
   per-pool units. The `width > pool.size` refusal
   (`CapacityTooNarrowError`, schedule.ts:876) becomes per-entry.
4. Explanations generalise mechanically: `boundBy: 'capacity'` already
   carries `capacityTeamId` + `capacityPredecessorIds` + the **Blocking set**
   (schedule.ts:196–259); the binding id becomes "pool id" where a pool may
   now be a resource, and `capacityFloorWords`
   (`apps/wbs/fe-01/src/components/wbs/gantt-geometry.ts`, per
   `docs/capacity.md`) learns the resource sentence: "Waits for Staging env
   to free 1 unit — after strip (Dev)". The render invariants ("set exactly
   when `boundBy === 'capacity'`") are untouched.
5. **Cache identity**: `ScheduleInput` grows `demands` (inside the slice
   entries) and the resource capacities (inside `poolSizes`), so
   `canonicalScheduleInput` (canonical-schedule-input.ts:188) picks them up;
   `SCHEDULER_CONTRACT_VERSION` bumps; the Fast golden corpus gets the
   no-op proof for the empty state (no resources ⇒ byte-identical output) —
   the exact playbook `deadlines` just walked
   (canonical-schedule-input.ts:38–47) and the hashed-field
   one-watched-red-per-field sweep extends by one row.

`exclusive` needs nothing beyond capacity 1 — `windowFor` already serialises
a size-1 pool correctly today. `renewable` is **not expressible**: the ledger
is one event list over the whole horizon with no calendar buckets (the engine
works in fractional workdays; weekends exist only in the drawing —
**Calendar scale**, `CONTEXT.md`). Supporting it means a bucketed profile
(reset events per period boundary) threaded through `windowFor`'s interior
walk and both termination proofs — days of careful engine work plus corpus
growth. Named cost; not in any early increment.

### Optimized (CP-SAT, `libs/wbs/adapters/solver-py/src/wbs_solver/model.py` + wire)

The encoding is the one already there, generalised one step:

1. **Divisible and exclusive resources are clause 4**: one
   `model.add_cumulative(intervals, demands, capacity)` per pool
   (model.py:208–219), with the member demand becoming the slice's per-pool
   `units` instead of the shared `width`. Exclusive = capacity 1. (Persons
   stay clause 5 `AddNoOverlap`, model.py:221–231 — "a person is not a
   quantity". I considered `AddNoOverlap` for exclusive resources too —
   marginally stronger propagation — but cumulative-1 keeps one code path per
   kind-class and the re-validator symmetric; not worth two shapes.)
2. **Wire**: `solver-wire.v1.json` is the single schema with four consumers
   (design.md, "Solver wire contract"), so this is a `wireVersion` bump:
   each wire slice's `width`+`poolIds` pair becomes/gains a `demands` array;
   `pools` carries the resource capacities. Both the Bun request builder
   (`libs/wbs/domain/contracts/solver/src/build-solver-request.ts`) and the
   Python validator change against the one schema, with golden fixtures both
   suites run.
3. **Re-validator**: `pool-overcapacity` in
   `libs/wbs/domain/contracts/solver/src/revalidate-solver-result.ts` sweeps
   per-pool demand instead of width — and model.py's own module rule governs
   the change: "each constraint below names the re-validator clause it
   mirrors, and the two files are meant to be read side by side"
   (model.py:14–22). The materialiser needs no new idea: `annotate`'s
   reservation replay already calls `jointWindowFor`/`reserve` unchanged
   (design.md, materialiser decision 2), so it inherits per-pool units the
   same way Fast does.
4. **Zero-duration slices** keep occupying nothing (model.py:53–63) —
   resource demands ride the interval, so a milestone claims no units; same
   rule both sides, already proven for pools.
5. `renewable` in CP-SAT would be per-bucket cumulative over
   interval-overlap decompositions (or reservoir constraints) — model size
   multiplied by bucket count at `SOLVER_QUANTUM = 48` units/day. Real work,
   genuinely harder than the Fast half. Second reason it is deferred.
6. **Cache/identity plumbing is automatic once the hash is right**: new hash
   ⇒ new Generation per the allocation CAS; `contractVersion` bumps on both
   halves (`SCHEDULER_CONTRACT_VERSION` + `wbs-solver` version), so old
   cached rows age out by the existing retention rules. `plan-infeasible`
   stays deadline-only — resource overcapacity _of a legal input_ cannot be
   infeasible, because demand is clamped/refused at the boundary like width
   is, and the horizon bound argument ("serialising every slice after the
   last floor is itself feasible") still holds under cumulative constraints.

**Both engines express `exclusive` and `divisible` fully.** Neither expresses
`renewable`; that is stated as a capability gap with a priced path, not
hidden.

---

## 5. Implementation path, smallest first

Sizes assume the repo's gates (h2puni, golden corpus, prod-mode review for
migrations). Each increment lands alone and is verifiable alone.

1. **Resources + capacities + demands as recorded plan data — no engine
   effect.** Directory `resource` table (+ kinds `exclusive|divisible` only),
   `project_resource_capacity` mirroring `projectTeamCapacity`,
   `work_item_resource_demand` satellite; command-batch ops + undo; plan
   export and Plan document carry them; a Resources cell and a Project
   settings section (the existing modal grows a section). Visible value on
   its own: demands are authored, exported, visible on the plan — the
   declaration surface agents and Dash will later read. Migrations are
   prod-mode paths (reviewed PRs). **~2–3 days.**
2. **Fast levels demands.** `slicesOf` emits the demand vector;
   `ScheduleInput`/canonicaliser/hash + contract bump + corpus no-op proof;
   per-pool units through `jointWindowFor`/`reserve`; boundBy sentences name
   the resource. Dates now move under contention — the feature exists.
   **~3–4 days.**
3. **Optimized parity.** Wire bump, model.py clause 4 generalisation,
   re-validator, fixtures in both suites, materialiser proof. Until this
   lands, projects with demands and the Optimized engine selected still work:
   same input ⇒ same hash ⇒ the engines disagree only in quality, and the
   publication guard already protects floor cases — but ship 3 right behind 2
   so the two engines never read different constraint sets for long.
   **~2–3 days.**
4. **Explanations and reading surfaces.** Gantt hover sentence for resource
   waits (`capacityFloorWords`' sibling), a facet per resource, directory
   usage/removal refusals ("Directory usage" pattern). **~1–2 days.**
5. **Receipts (separate decision, depends on twilight-control-plane Tasks
   2/9, not on WBS):** Dash's measured-usage receipts shown read-only on work
   items. This is where "which worktree, who held it, how much disk" appears
   — as history, never as schedule input. **Not sized here.**

**Explicitly NOT in v1:** `renewable` resources (§4 names the cost); any
lease/holder/heartbeat state in WBS tables; cross-project leveling; demand
inheritance down the tree; per-step demands; preemption vocabulary; named
exclusive units in planning (**Slot** rule: "counted, never named" — identity
is runtime's); agents writing Demands (demands are authored plan data; Dash
writes receipts); any implicit unit conversion (A12 forbids it).

---

## 6. Open questions for Dany (each with a default — "yes" works)

1. **Which half do you actually want first?** If the itch is "agents must not
   fight over worktrees/disk _right now_", that is Twilight Dash admission —
   already specced in `twilight-control-plane/design.md`, zero WBS product
   change, and the WBS increments above can wait. If the itch is "the plan's
   dates should reflect scarce resources", it is increments 1–4.
   **Default: both, in that order of truth — Dash enforces, WBS forecasts —
   but build WBS increments 1–2 first since Dash's control plane is a larger
   pending change.**
2. **Resource scope:** directory-wide identity + per-project capacity (the
   Service team / Capacity split, verbatim)? **Default: yes** — it reuses the
   settled "fact about the pair" rule and the Remembered-capacity state.
3. **Exclusive units counted, never named, in the plan** (which worktree is
   runtime's business)? **Default: yes** — matches Slot; naming units in the
   plan drags lease identity into the collaborative edit surface.
4. **Renewable (hours-per-week) out until someone asks with a use case?**
   **Default: yes** — it is the only kind that needs new engine mathematics
   on both sides.
5. **Should done work items release their pool and resource occupancy in the
   schedule** (today the engine reads no status — done slices still occupy)?
   This predates resources and moves dates on existing plans the moment it
   ships. **Default: file it as its own change, decided independently of
   this design; demands simply inherit whatever slices do.**

---

_Sources read for this note: `CONTEXT.md`, `CONTEXT-MAP.md`, `LLM_README.md`,
`docs/capacity.md`,
`openspec/changes/dual-optimized-scheduler/design.md`,
`openspec/changes/twilight-control-plane/design.md` (§Admission, §Planning),
`libs/wbs/domain/domain/src/schedule.ts`,
`libs/wbs/domain/domain/src/canonical-schedule-input.ts`,
`libs/wbs/application/core/src/ports/scheduler.ts`,
`libs/wbs/application/core/src/ports/capacity-store.ts`,
`libs/wbs/application/core/src/service/work-item.service.ts`,
`libs/wbs/adapters/store-sqlite/src/schema.ts`,
`libs/wbs/adapters/solver-py/src/wbs_solver/model.py`. Not verified: the
exact `build-solver-request.ts` field mapping (located, not read line by
line) and fe-01's `capacityFloorWords` body (cited from `docs/capacity.md`'s
code map). The archived capacity specs live under
`openspec/changes/archive/2026-08-30-capacity-*`._
