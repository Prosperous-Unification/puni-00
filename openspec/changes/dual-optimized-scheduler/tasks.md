# Tasks — dual-objective optimized scheduler

TDD slices for the change described in `proposal.md`, `design.md` and
`specs/scheduler-optimization/spec.md`. Every slice names the test that proves
it; every safety check names the negative test watched failing with the check
removed (R5). Nothing here is implemented yet — this is the plan TASK-218
delivers, and implementation lands as its own queue tasks.

**Order matters, and there is no corrections appendix.** A later review's
disposition is folded into the slice it changes and the superseded text is
deleted, never appended as a new section — an appendix leaves the old
instruction standing as an earlier ordered checklist item, which is exactly the
fault Sol r7 Critical 4 and 5 named. Slices 1–3 are the seam. Slices 4–7 are behaviour. Slice 8
is the UI. Slice 9 is the corpus. A slice is not done until its remote gate on
h2puni is green — no build or autotest runs on the workspace box.

## 1. Canonical input and the exact-input hash

**Whose seventh argument this is — settled here so two queue tasks cannot both
build it or both skip it.** The dependency chain is TASK-219 (this change)
→ TASK-220 → **TASK-241** (`wbs-deadline-scheduling-core`), and TASK-241's own
description claims "include deadlines in the canonical hash and versioned solver
wire, revalidate them independently in Bun, and persist/report legitimate
plan-infeasible results". Read naively that is the same work as slices 1, 2 and
4 here, by a task that cannot start until they are done. The split is by
**plumbing versus field**:

- **TASK-219 builds the seventh argument's plumbing and every consumer of it**
  — the canonical entry, the hash, the `deadlineUnits` wire field, the CP-SAT
  constraint, the Bun revalidation clause, the `plan-infeasible` row state and
  its `VariantState` member — against a deadline **source that is legitimately
  empty**, because the `deadline` column and `deadlineOffsetOf` do not exist
  yet. That is not a stub: 1.6's no-op proof *requires* the seventh argument
  defaulted to an empty map to leave every golden corpus case byte-identical,
  so the empty-source state is the proved state rather than a placeholder.
- **TASK-241 adds the field and populates the source** — the nullable
  date-only `deadline`, its migration, API, realtime, undo, `deadlineOffsetOf`,
  the §1.4 effective-deadline fold and Fast's minimum-slack ordering — and
  turns on every path TASK-219 already built and gated.

Consequence for 1.3: the tie-sensitive deadline mutation case is TASK-241's to
make green, because it needs a real deadline to mutate. TASK-219 lands it as a
**declared-pending** case naming TASK-241, never as a silently skipped or
trivially-passing one — a mutation case with no mutation is exactly the
check-that-cannot-fail failure R5 names.

- [ ] 1.1 `canonicalScheduleInput(plan)` builds the canonical JSON string,
      living beside Fast in `libs/domain/src/` so both read one normalizer —
      Fast is `libs/domain/src/schedule.ts`, not `apps/be-01/src/service/`.
      **The canonical form is the exact argument tuple of
      `schedule(rows, edges, slices, notBefore, poolSizes, reach, deadlines)`:**
      (a) every `PlannedRow` sorted by `id` with `id`, `parentId`, `position`,
      `frozenNumber` and its **as-written** `priority` — not the resolved leaf
      priority, so a parent's edit that changes no leaf today still rehashes;
      (b) authored `{ predecessorId, successorId }` edges sorted by the pair,
      with the leaf expansion derived rather than hashed;
      (c) the `slices` array **grouped by work item, groups ordered by
      `workItemId`, each group's own order preserved as given** — only the
      intra-item order is step precedence; the global order is whatever SQL
      returned, because `WorkItemRepo.listByProject` selects with no
      `ORDER BY` and `slicesOf` emits groups in row order, so hashing it made
      one unchanged project hash differently between reads and between blue
      and green — each
      slice carrying `workItemId`, `stepId`, `days` (null distinct from 0),
      `personId`, `width`, and `poolIds` as a **sorted set** (`readonly
      string[]`, never a singular `poolId`);
      (d) `notBefore` as `[workItemId, offsetDays]` sorted, already normalized
      against `project.startDate` into whole days from day zero;
      (e) `poolSizes` as `[poolId, size]` sorted;
      (f) `reach` from `project.dep_reach` (`whole-item | anchor-slice`);
      (g) `deadlines` as `[workItemId, deadlineOffset]` sorted by id, offsets
      already resolved by `deadlineOffsetOf` against `project.startDate` into
      whole workdays from day zero exactly as (d) is, and keyed by
      **as-authored** work item ids rather than the leaf expansion — the fold
      is derived, so hashing the expansion would hide a parent's deadline edit
      that binds no leaf today and binds one after a move, the same argument
      (a) makes for as-written `priority`
      (`openspec/changes/work-item-deadline/design.md` §3.4).
      Reuses the existing `sliceKey`/`indexTree`/`expandToLeaves` normalizers.
- [ ] 1.2 `scheduleInputHash(plan)` = SHA-256 of 1.1.
- [ ] 1.3 **Proven by** `schedule-input-hash.test.ts`, one **tie-sensitive**
      mutation case per canonical fact — each fixture is built so the mutated
      fact actually moves a placement, otherwise a hash that ignores it still
      passes. Cases: estimate, edge, as-written priority on a parent, `width`,
      `notBefore` floor, `personId`, pool size, **`depReach` flipped**, **two
      slices of one work item swapped**, **`poolIds` widened from one pool to
      two**, **a work-item `deadline` set on a parent that binds no leaf until
      a later move** (tie-sensitive because Fast's ready-slice ordering gains a
      minimum-slack then earliest-effective-deadline tie-break —
      `openspec/changes/work-item-deadline/design.md` §3.1 — so the mutation
      moves a real placement rather than only a solver constraint), and
      `position`/`frozenNumber` changed. Unchanged-hash cases:
      Engine, Objective, the toggle, the display variant, the clock, the acting
      user, and a plan-row reordering that yields the same tree. `budgetMs` and
      `contractVersion` are **not** hash inputs but **are** cache-key columns,
      proven in 4.2 rather than here.
- [ ] 1.4 **Negative check, watched red** — delete `reach` from the canonical
      string and watch 1.3's `depReach` case fail; repeat with the slice-array
      order flattened to a sorted set and watch the swap case fail. `Proof:`
      comment names each removed field. A hash that ignores a scheduling fact
      serves a stale schedule as current.
- [ ] 1.5 `SCHEDULER_CONTRACT_VERSION` exported from `libs/domain`, and
      `contractVersion = "<SCHEDULER_CONTRACT_VERSION>+<solverVersion>"` built
      where the cache key is built. Documented as bumped by any change to Fast
      semantics, `ASSUMED_SLICE_WORKDAYS`, `snapWorkdays`, reach or numbering
      semantics, resource tie-breaks, the canonicalizer, or the duration rule.
      **This slice performs one such bump**, because the seventh canonical
      argument, the `deadlineUnits` wire field and the materialiser all change
      together: every pre-existing cache row describes a different function, and
      the bump is what evicts them — there is no data migration of cached
      results (`openspec/changes/work-item-deadline/design.md` §3.4).
- [ ] 1.6 **Proven by** keying the existing Fast golden corpus on
      `SCHEDULER_CONTRACT_VERSION`. **Negative check, watched red** — change
      `ASSUMED_SLICE_WORKDAYS` without bumping the constant and watch the
      corpus fail. This is the guard that makes the cache key honest: without
      it a domain change leaves stale rows matching their key forever.
      **Same commit, no-op proof:** with the seventh argument defaulted to an
      empty map, every existing corpus case SHALL produce a **byte-identical**
      schedule — the re-key must not be able to hide a placement change smuggled
      in with it (`openspec/changes/work-item-deadline/design.md` §3.4, §7).
- [ ] 1.7 `WorkItemRepo.listByProject` acquires `ORDER BY work_item.id` on its
      work-item select. An argument tuple that varies between reads of an
      unchanged project is a Fast defect before it is a cache one.
- [ ] 1.8 The `ORDER BY` proof asserts the **raw argument tuple**, not the hash
      (Sol r7 Important 11). The earlier plan reversed the stub driver's rows
      and expected two different hashes through
      `listByProject` → `slicesOf` → `canonicalScheduleInput`; that fault is
      normalised away by design, because 1.1(c) reorders groups by
      `workItemId` and sorts rows by `id`, and the spec separately *requires*
      the hash to be equal when only underlying row order differs. A hash
      assertion here can never fail, which is the check-that-cannot-fail
      failure AGENTS.md R5 names. The proof instead runs the same reversed
      driver through `listByProject` → `slicesOf` and asserts the
      `schedule(...)` argument tuple — the `rows` and `slices` arrays as Fast
      receives them — is identical between reads, with a second assertion on
      Fast's own order-sensitive output for that fixture. **Watched red:** drop
      the `ORDER BY` from 1.7 and both assertions must fail while the hash
      assertion in 1.3 stays green.
- [ ] 1.9 Extend 1.3's one-mutation-per-fact set with the two it was missing:
      a `parentId` reparenting that keeps every other field identical (it
      changes leaf expansion, inherited priority and floors), and a `stepId`
      identity swap between two slices of one work item. Extend 1.4's
      watched-red removals to **every** field named in 1.1, not only `reach`
      and slice order — each removal must be observed failing on the
      production path before the field is trusted.

## 2. Solver contract types, request builder, and the Bun re-validator

- [x] 2.0 **Publish the priority resolver before anything imports it.** Add
      `export` to `function priorityByLeaf` in `libs/domain/src/schedule.ts`
      and re-export it from `libs/domain/src/index.ts`. Nothing else moves: it
      keeps its signature `(rows: readonly PlannedRow[], index: TreeIndex) =>
      Map<string, number>` and Fast keeps calling the same function, so the
      existing golden corpus is the proof that publishing it changed nothing.
      This slice exists because 2.2's named seam is an import of a symbol
      `libs/domain` does not currently publish, and an ordered plan that
      reaches 2.2 first cannot proceed (deepseek r9 Important 1).
      **Landed** at `6863752d`. The re-export needed no edit — `index.ts`
      already carries `export * from './schedule'`, so the missing half was
      always the `export` keyword alone, and the code diff across 2.0 and 2.8
      together is exactly two of them (`priorityByLeaf`, `durationOf`); every
      doc line beside them is comment. **The seam is now asserted from the
      BARREL** in `solver-seams.test.ts`, not from `schedule.ts`, and the
      watched red is why that distinction is the whole slice: with `export`
      removed from `priorityByLeaf` again — the exact pre-2.0 state — `tsc
      --build --force` exits **0 with a zero-byte log** and the entire
      pre-existing 327-test domain suite passes. Only the barrel test fails,
      335/1. The defect is invisible from inside the module, because the symbol
      is right there and its own tests pass; it is only visible from where the
      consumer stands. Second red: the barrel's `export * from
      './solver-quantum'` commented out, 335/1 on the quantum case alone.
- [ ] 2.1 `libs/contracts/solver/solver-wire.v1.json` is the **single
      normative definition** of the request and the response — prose in this
      file, in design.md and in the long-form note is descriptive only (Sol r6
      Critical 1, Sol r7 Critical 5).
      **The four request members that reached this slice with a meaning and
      no shape are settled, and the schema is where to read them rather than
      this paragraph.** `edges` was answered by `libs/domain/src/schedule.ts`
      in run 1. Run 2 settled the other three the same way, and each carries
      in its own `$comment` the source it was read from: `PoolSizes =
      ReadonlyMap<string, number>` (`schedule.ts:95`) and
      `project_team_capacity.size`'s floor of 1 for `pools`; the response's
      normative "that offsets **map**" and `MOVEMENT`'s subscript access for
      `baselineOffsets` and `fastHint`. The one result there that is not a
      shape: those two carry the **same value** — design.md's quantisation
      decision 2 says both *are* the quantised Fast baseline and 2.11 produces
      both from one re-run — so two fields hold one value, and their equality
      is an enforced builder invariant rather than a coincidence.
      `stageBudgetSplit` was never in that list: `STAGE_BUDGET_SPLIT =
      [0.60, 0.25, 0.15]` fixes it as a three-element array of fractions.
      **What JSON Schema cannot say is written into the request's own
      `$comment` as eight numbered invariants**, each with the watched red that
      proves it, and each checked by the builder before spawn and again by the
      Python entrypoint: hint equals baseline; the key set of `baselineOffsets`
      equals that of `fastHint` and both equal the set of slice keys; every
      offset lies within `horizonUnits`; every pool a slice names has an entry
      — `schedule.ts:718`'s `no size for pool ${poolId}` throw promoted to the
      wire, where a default would be a capacity constraint silently not
      applied; every edge endpoint is a known key; the split sums to 1; no
      duplicate object key, **which no schema anywhere can reject**, because
      `JSON.parse` and `json.loads` both silently keep the last — so both
      consumers compare the parsed key count against the raw member count; and
      the `bigint` overflow preflight.
      **The encoding hazard is in the key itself, and it reached the schema as
      an absence.** `sliceKey(workItemId, stepId)` joins the two ids with a
      literal **U+0000** and renders a null `stepId` as the empty string
      (`schedule.ts:105`; read the separator there rather than transcribing it
      — pasting it into a document writes a real NUL byte, after which every
      `grep` over that file reports binary and prints nothing, which is how
      this paragraph found its own hazard, and run 2 reproduced it in a probe
      script). So the key definition is a non-empty string and **nothing
      else**: a printable-character `pattern` would reject every valid request.
      Proven rather than asserted — a two-slice request with real U+0000 keys
      validates against the schema and round-trips through `json.dumps` and
      `json.loads` with the NUL intact. The golden corpus must carry such a key
      **verbatim** rather than a sanitised stand-in, and any logging of a
      request must not be the place this is discovered.
      **The FIFTH member — the response's `status` — is now settled too, and
      by the same method: candidate (a) was refused by an artifact rather than
      by preference.** It is a **run-outcome** enum of exactly
      `feasible | unknown | infeasible`, a different question from the
      per-term `status`: that one reports a stage's proof strength, this one
      reports whether a schedule is being returned at all and, if not, which
      of the two reasons applies. `infeasible` is pinned verbatim by spec.md's
      "SHALL admit `infeasible` as a first-class outcome"; `unknown` is pinned
      by the same sentence's "SHALL NOT be mapped onto `unknown`", which is
      only meaningful if `unknown` is itself a response status; `feasible` is
      the only other outcome any matrix row produces. **`optimal` is excluded
      by design.md's own words** — the per-stage `'optimal'` "never claims the
      published schedule is optimal, which the design has said from the start
      it is not" — so reusing the stage vocabulary would have written a claim
      the design denies, and that is what closed candidate (a).
      **The `status`-to-payload conditional came out of the matrix's `n/a`
      column, not out of the enum:** `feasible` carries `offsets` and
      `objectiveValues`, `unknown` and `infeasible` carry **neither**, because
      `value` is defined only on a published schedule; `offsets` is *absent*
      rather than `{}`, since an empty map passes the schema and then fails the
      key-set invariant one layer later, reporting a vocabulary decision as a
      corrupt payload. So `required` on the response names only `wireVersion`
      and `status`, and spec.md's "SHALL carry only …" is read as the closed
      maximum it is rather than as a floor.
      **A later-stage INFEASIBLE has no wire encoding, deliberately.** The
      matrix's own `k > 1` argument is that the previous incumbent already
      satisfies every added constraint, so the solver holds a counterexample to
      its own answer; it exits non-zero **without** emitting a response rather
      than emit a proof it can refute, and the coordinator records the run as
      `invalid-output` exactly as that row says. Falsifier: an artifact that
      requires the coordinator to tell "the solver crashed" from "the solver
      contradicted itself" *from the response* would need a fourth status.
      Five golden fixtures carry the decision as watched reds: the two
      payload-free valid responses, a response-level `optimal` that must be
      refused, and the conditional in both directions.
      It carries `wireVersion` as a required
      literal, states the unit of every numeric field, and includes every field
      staged solving needs — on the request `fastHint`, `baselineOffsets`,
      `stageBudgetSplit`, `quantum` and `horizonUnits`; on the response, the
      per-term `objectiveValues` shape. **Split deliberately (found run 2):**
      as one run those six were an untagged enumeration mixing the request and
      response vocabularies, which is exactly what rule (b) below rejects, so
      2.1's own prose failed 2.1's own check.
      Every integer objective field in both directions has an inclusive
      `Number.MAX_SAFE_INTEGER` maximum; this is the Bun/JSON exactness bound,
      not merely CP-SAT's wider signed-64-bit range.
      Exactly four consumers read that one file: the Bun request builder and
      `parseSolverResponse` in `libs/contracts/solver/src/`, the `wbs-solver`
      entrypoint (validating against the copy installed beside it with the
      pinned `jsonschema` dependency), and a shared golden corpus under
      `libs/contracts/solver/fixtures/` that both suites run. **Watched red:**
      a consumer that accepts a message the schema rejects, or rejects one it
      accepts, fails the contract test; and a TypeScript type that drifts from
      the schema fails it too. **A repository check enforces the "descriptive
      only" claim (Sol r8 Critical 4, restated Sol r9 Critical 1):** three
      rounds running, an obsolete prose schema in one of the four **descriptive
      artifacts** was an implementation instruction contradicting the real one.
      **Those four are named here because "those four files" read as the four
      consumers of the sentence before it, which are code and carry no prose
      (found run 2):** this file, design.md,
      `specs/scheduler-optimization/spec.md`, and the long-form note.
      **The note is not in this repository** — it lives in the Claire workspace
      as `notes/wbs-dual-optimized-scheduler-design.md`, 1609 lines, and no
      copy of it exists under `openspec/`, `docs/` or `notes/` here (grepped
      run 2 for every form of `solver`, `CP-SAT` and `solver-wire`;
      `dual-optimized-scheduler` is also the only `openspec/changes/*` entry
      that mentions the solver at all). So a **repository** check in
      wbs-tool-v1 can cover three of the four and not the fourth, and it must
      say which it covered rather than reporting a three-file pass as a
      four-file one. **DECIDED (run 3, 2026-09-03): the note is NOT copied in;
      it is out of the check's scope, and the check SHALL name it as uncovered
      in its own output** — a line naming the file and the repository it lives
      in, printed on a pass as well as a failure, so "3 of 4" is never read as
      "4 of 4". Three reasons, and the first is the decisive one: the note's §6
      is a **review ledger**, and this change's standing rule is to amend
      normative text and never history, so a second copy would have to be
      either synced — two sources of truth for a ledger — or frozen, after
      which the check would enforce against a stale artifact. Second, the
      note's content is *already* required to be descriptive-only against a
      normative schema, so its drift can mislead a reader but cannot instruct a
      consumer; the exposure a copy would close is smaller than the exposure it
      would open. Third, the obligation the copy was meant to create already
      exists and has been met three runs running: whoever amends the wire
      amends the note in the same chunk. **Falsifier:** hand this change to an
      implementer who does not have the Claire workspace and the "descriptive
      only" claim over four becomes unverifiable at exactly the moment it
      matters — then copy the note in and freeze it deliberately. The check is
      **set equality, not a ban on prose**, because a planning artifact that
      may not name a field cannot say what the schema must contain, and the
      earlier "no field list outside the schema" wording rejected design.md,
      spec.md and this file on the round it was written. Definitions: an
      **enumeration** is a maximal run of three or more backticked
      identifiers joined only by commas, `and` or `/`; a **vocabulary** is one
      named tuple this change defines. The check knows eight vocabularies —
      the four wire sets parsed from `solver-wire.v1.json`'s `required`
      arrays (`request`, `response`, `slice`, `objective-term`), the cache
      composite key, the plan-read `optimization` block, the
      `optimization_generation` row and the `solver_queue` row — because a
      check that does not name its vocabularies misattributes every table
      tuple to the wire and is unrunnable. Then: (a) an enumeration inside a
      `<!-- wire-fields:<set> -->` span (the span runs from the tag to the end
      of its sentence or to the next tag) SHALL equal that set exactly,
      failing with file, line and symmetric difference; (b) an untagged
      enumeration is attributed to the vocabulary it overlaps most and, when
      that overlap is two or more, SHALL be a **subset** of it — a partial
      mention is legal, a run mixing two vocabularies or naming a
      non-member is not; (c) `OptimizedResult` and `StoredObjectiveValue` are
      the stored shapes, have their own authority in the codec requirement,
      and are excluded by name. **Watched red:** the superseded sentence
      "Each slice SHALL carry its `sliceKey`, an integer `durationUnits`,
      `width`, `personId`, set-valued `poolIds`, a resolved `priorityWeight`,
      and a resolved `notBeforeUnits`." is kept as a negative fixture; the
      check SHALL reject it naming `sliceKey`, and a check that passes it is
      not implementing rule (b). That sentence was live in spec.md until Sol
      r9 Critical 1, against design.md's and 2.2's `key` — set comparison is
      what catches it, and the banned-prose wording would have deleted the
      evidence instead. A prototype of rules (a)–(c) was run over the four
      files at `af05ead1` and reported no divergent enumeration; it has not
      been re-run since, so that is a statement about that head and not
      about this one.
- [ ] 2.2 `buildSolverRequest(plan, objective, baseline)` in
      `libs/contracts/solver/src/` beside the schema it validates against —
      **Bun owns duration and graph derivation, Python owns placement only.**
      <!-- wire-fields:slice -->Each slice carries `key` (`sliceKey()`'s result), an **integer** `durationUnits` (2.8)
      computed exactly as Fast computes it — `ASSUMED_SLICE_WORKDAYS` for a
      null `days` **without** dividing by `width`, `days / width` otherwise
      **without** `snapWorkdays`, then `× SOLVER_QUANTUM` and rounded **up**
      only when the estimate does not divide (2.8) — `width`, `personId`,
      `poolIds`, `priorityWeight`
      (the **dense rank** `(R + 1) − rank(p(s))` over the `R` distinct
      priorities present in this canonical input, resolved by **importing
      `priorityByLeaf` from `libs/domain` rather than reimplementing it** —
      which **2.0 must publish first**, because `schedule.ts` declares it
      `function priorityByLeaf`, unexported, and `libs/domain/src/index.ts`
      re-exports only what `schedule.ts` exports, so the seam this plan names
      does not exist yet (deepseek r9 Important 1; Sol r8 Critical 7) — it is a nearest/most-specific **override**, taking the
      first non-null value walking leaf-upward, not a floor or a minimum
      across ancestors, so leaf 5 under parent 1 resolves to 5 — `0` when no
      priority reaches the leaf — the absolute priority is never a weight, because
      `asOptionalPriority` accepts any safe integer and `P_max + 1` loses
      precision at `Number.MAX_SAFE_INTEGER`; the builder also computes the
      exact worst case `Σ w(s) × horizonUnits` and fails pre-spawn with
      `objective-overflow` above `Number.MAX_SAFE_INTEGER`, so every integer
      remains exact through Bun and JSON; the preflight accumulator uses
      `bigint` and converts only after comparing with
      `BigInt(Number.MAX_SAFE_INTEGER)`), and
      `notBeforeUnits` (the latest of the leaf's own floor and every
      ancestor's), and `deadlineUnits` (`integer | null` — the **effective**
      deadline for that slice, folded over the tree by the same leaf-upward
      walk and already converted to `(D + 1) × quantum` so Python applies it
      without seeing the tree, `null` meaning unconstrained).
      `edges` are already leaf-expanded with `reach` applied and
      already include the intra-item step-order edges, so Python never receives
      the tree, `parentId`, or `dep_reach`. `horizonUnits` is the **serial
      bound** `max(0, ...notBeforeUnits) + Σ durationUnits`, seeded with zero so a
      plan with no manual floors at all (the common case) has a defined value
      — not the Fast makespan
      plus remaining effort, which is not an upper bound once the optimizer may
      idle a slice — checked against `2^31 − 1` before spawn (2.10). The
      request also carries `wireVersion` and `fastHint`; every field and unit
      comes from 2.1's schema rather than from this sentence.
      **Partly landed (2026-09-03):** the dense-rank `priorityWeight` is in
      `libs/domain/src/priority-weight.ts` — `priorityWeights(leafPriorities)`
      over `priorityByLeaf`'s output, plus `priorityWeightOf` for the absent
      leaf, which is most leaves on most plans. It went to `libs/domain` rather
      than beside the builder for two reasons: a dense rank over a plan's
      distinct priorities needs no wire type at all, and `libs/contracts` has
      **no** `@wbs/domain` import today, so opening that edge is a boundary
      decision of its own rather than a side effect — the more so because
      `@nx/enforce-module-boundaries` is SKIPPED in the gate (`No cached
      ProjectGraph is available`) and would not have caught a bad one. The tag
      constraints do permit it: both libraries are `scope:shared` +
      `runtime:isomorphic`. The rest of 2.2 is unstarted.
      **Its `libs/domain` seams are all published now** — `sliceKey` (already
      was), `durationUnits` and `SOLVER_QUANTUM` (2.8), `priorityByLeaf` (2.0)
      and `priorityWeights`. **Its other two slice fields are not domain
      imports at all**, and this is worth knowing before starting rather than
      halfway through: `notBeforeUnits` converts the `notBefore:
      ReadonlyMap<string, number>` that `schedule()` already takes as an
      ARGUMENT — resolved by the caller, exactly as `personId`, `width` and
      `poolIds` on a `Slice` are — so there is no resolver in `libs/domain` to
      import and none is missing. `deadlineUnits` is the effective deadline
      already folded, which is TASK-241's contract and a stated boundary of this
      change, not a gap. Checked by search, not assumed: `libs/domain` holds no
      deadline resolver, and `not-before.ts` holds only
      `isOrphanedNotBeforeReason`, which is a validation predicate rather than a
      floor walk.
      **The two folds are now published (2026-09-03), and the floor half was
      NOT a new function:** `libs/domain/src/leaf-constraints.ts` exports
      `leafFloorsOf` and `leafDeadlinesOf`, and `schedule()` now *calls*
      `leafFloorsOf` where it used to fold `notBefore` inline. That direction
      matters — the builder must carry the very same numbers as
      `notBeforeUnits`, and this exact fold was already wrong once for a month
      (2026-08-10: a floor written on a parent was accepted, stored, echoed back
      and constrained nothing), so a second copy in `libs/contracts` is the
      copy that would get it backwards. `leafDeadlinesOf` is new and is the
      fold's **mirror, not its twin**: `Math.min`, because the tighter of a
      leaf's own date and any ancestor's is the one that binds, and with **no
      zero seed**, because a floor's identity is day zero and a deadline has
      none — an unconstrained leaf is absent from the map and the wire spells
      that `deadlineUnits: null`. Both reds watched on h2puni at `f5053b1d`:
      `min` → `max` fails 3 of the 12 new tests, and `own ?? 0` in place of the
      `undefined` check fails 3 (a different 3 — a day-zero deadline is a real
      and very tight constraint, and the seed silently wins every later
      comparison). Neither the `(D + 1) × quantum` conversion nor
      `deadlineOffsetOf` is here: that is TASK-241's boundary, and
      `deadlineOffsetOf` exists nowhere in the repository today — checked by
      search, not assumed. What remains of 2.2 is the builder itself.
      **The two unit conversions landed with the `@wbs/domain` edge
      (2026-09-03):** `libs/contracts/solver/src/solver-units.ts` exports
      `notBeforeUnitsOf` and `deadlineUnitsOf`. They are separate from the folds
      because the folds are Fast's own rules and shared with the placement,
      while the conversions exist only because CP-SAT places integers. **The
      asymmetry is the content:** a floor bounds a START, so day `N` is
      `N × quantum` and there is no `+ 1`; a deadline names an inclusive
      FINISH DAY, so it is `(D + 1) × quantum` — an exclusive instant, because
      the last instant of day `D` is the first instant of day `D + 1`. Dropping
      the `+ 1` requires finishing by the start of the due day, loses a workday
      on every deadline in the plan, and makes a one-day task due the day it
      starts infeasible; watched red on h2puni at `9264f0dc`, 3 fail.
      **The boundary decision this paragraph flagged is now MADE, not deferred:**
      `libs/contracts` imports `@wbs/domain` as of this file. Argued rather than
      lint-approved — `@nx/enforce-module-boundaries` is still skipped in the
      gate — so `solver-units.test.ts` carries an explicit edge test that
      resolves the alias under the contracts target's own `cwd`
      (`libs/contracts`), which is a different question from whether `tsc`
      accepts it and is the assertion that fails first if the alias is dropped.
      Contracts gates at `9264f0dc`, dirty=0: lint 0, typecheck 0, **77 pass /
      0 fail across 6 files**.
      **`buildSolverSlices` landed (2026-09-03)** in
      `libs/contracts/solver/src/build-solver-slices.ts`: the whole slice
      projection, one wire slice per canonical slice in the order given, taking
      the three folded maps (`floors`, `deadlines`, `weights`) rather than the
      tree. Every field is copied or read from a published seam; the function's
      own content is the assembly and two refusals. **One deliberate divergence
      from `schedule()`, argued rather than inherited:** the floor is carried on
      EVERY slice of a leaf, where `schedule()` puts it on the first alone and
      lets the intra-item chain carry it. Same feasible region — the request's
      `edges` already carry that chain — but the schema's field is per-slice and
      defines itself as the *fold*, so a zero on a later slice would be that
      slice claiming to be unfloored, and a position-dependent projection would
      need a second grouping rule beside `groupByWorkItem`'s. The deadline is on
      every slice for the simpler reason that an item due on day `D` has no
      slice that may finish after it. **Two refusals, both watched red:** a
      duplicated `(workItemId, stepId)` (three wire maps are keyed by
      `sliceKey`'s result, so a duplicate is one row silently overwriting
      another in all three and the re-validator would report the key-set
      mismatch as a *solver* fault), and a **fractional** width — `width: 0` is
      already refused twice upstream, but `1.5` yields a perfectly finite
      duration and would reach the schema's `type: integer` as a malformed
      request the builder itself wrote. Contracts at `42b23ab5`, dirty=0: lint
      0, typecheck 0, **87 pass / 0 fail across 7 files**; domain unchanged at
      356/0.
      **`buildSolverPools` landed (2026-09-03)** in
      `build-solver-pools.ts`, with `poolIdsNamedBy` beside it because the
      request builder needs that same set for its own key-set checks. It emits
      **only the pools the request names**, not every size the project holds: a
      size for a team no slice is labelled with constrains nothing, and the
      request is hashed as a cache key, so shipping it would invalidate a cached
      result on an edit to a team this plan does not use. It enforces the
      schema's **cross-field invariant (4)** pre-spawn — `schedule.ts`'s
      `no size for pool ${poolId}` throw promoted to the wire — and refuses a
      size below 1 or fractional rather than clamping, because a pool of 0 slots
      is a plan of `Infinity` dates and clamping invents a slot nobody has. All
      three refusals watched red at `e61124c6`, 3 fail. Contracts at `e61124c6`,
      dirty=0: lint 0, typecheck 0, **94 pass / 0 fail across 8 files**.
      **`horizonUnits` and both pre-spawn overflow refusals landed
      (2026-09-03)** in `solver-preflight.ts` as
      `preflightSolverRequest(slices)`, returning `parseSolverResponse`'s
      discriminated shape rather than throwing — the failure token is what the
      cached row records. The horizon is the SERIAL bound
      `max(0, ...notBeforeUnits) + Sum durationUnits`, zero-seeded; the
      objective worst case is `Sum w(s) x horizonUnits`. **Both accumulate in
      `bigint` and convert only after comparing**, and that is not decoration:
      with a `number` accumulator the horizon check passes by having already
      lost precision above its own bound — the check failing OPEN. Watched red
      at `d665bef5`, 1 fail. The horizon is checked **first** on purpose: when
      both bounds break, the horizon is the cause and the objective failure its
      consequence, and naming the consequence sends a user to their priorities
      when the plan is simply too long. **MOVEMENT's own worst case
      `Sum |offset - baseline|` is NOT checked yet** and is owed — it needs
      `baselineOffsets`, which is 2.11's. Contracts at `d665bef5`, dirty=0: lint
      0, typecheck 0, **103 pass / 0 fail across 9 files**.
      **`STAGE_BUDGET_SPLIT` and its invariant landed (2026-09-03)** in
      `stage-budget.ts`: the constant `[0.60, 0.25, 0.15]` plus
      `isValidStageBudgetSplit`, a predicate rather than a one-off assertion
      because the builder must check whatever it is handed. It enforces the
      schema's stated builder invariant — that the three sum to 1 — which JSON
      Schema cannot express. **The tolerance's justification was WRONG on the
      first write and the gate caught it:** `0.6 + 0.25 + 0.15` is exactly `1`
      in doubles, not `0.9999999999999999`. The real case is order dependence —
      `0.7 + 0.2 + 0.1` is not `1` while `0.1 + 0.2 + 0.7` is — so an exact
      comparison would accept or refuse one authored split according to the
      order its shares were written in. Both the comment and the test now say
      the measured thing. Contracts at `de7cb086`, dirty=0: lint 0, typecheck 0,
      **113 pass / 0 fail across 10 files**.
      **`edges` landed (2026-09-04), the seam first.** `libs/domain/src/slice-edges.ts`
      now owns both rules and `schedule()` **calls** it, the direction
      `leafFloorsOf` went: the intra-item step chain (an inline `for` loop in
      the node loop) and the join (inline after it). `reachedSliceOf` moved with
      them, verbatim, retyped against a structural `EstimatedSlice` so the two
      modules do not cycle; it is exported from there and re-exported by the
      barrel, and no other file in the repository imported it — fe-01's
      `gantt-geometry.ts` has its own documented copy, untouched. **An edge's
      ends are named by POSITION (`{ leafId, at }`), never by `sliceKey`:** a
      plan may hand two slices of one leaf the same `stepId`, `groupByWorkItem`
      accepts that and the placement tells them apart by index, so a key-based
      edge list would merge them silently *before* `buildSolverSlices` could
      refuse the duplicate. `schedule()` converts a position with
      `firstNodeOf(leafId) + at`; `buildSolverEdges` in
      `libs/contracts/solver/src/` converts it with `sliceKey`, which is the
      whole of what the contracts side does — the schema's `$defs/edge` comment
      calls that conversion "real work rather than a rename" and it is now the
      only work left in it. Its own guard is a BOUNDS check, not a
      `=== undefined` narrowing: indexing is typed as total here so the
      narrowing form is dead code eslint deletes, and `own.at(-1)` would have
      wrapped round to the last slice and keyed it silently.
      **Two measurements that changed what is written here.** (1) The emission
      order (every chain, then every external) is PRESERVED, not proven to
      matter: with the two loops swapped the whole 356-test pre-existing domain
      suite stays green and only the new order case fails, so the placement is
      order-insensitive on that corpus and the doc says so instead of claiming a
      contract. (2) The reach applied to the successor side inside the NEW file
      gives 348/17 across `schedule*`, which is what proves the refactor is
      wired rather than dead code. Gates on h2puni with `NX_DAEMON=false`:
      domain lint 0, typecheck 0, **365 pass / 0 fail across 28 files** at
      `74fa84a5`; contracts lint 0, typecheck 0, **118 pass / 0 fail across 11
      files** at `59ee41bf`; dirty=0, 0 emitted `.js`.
      **Still unbuilt in 2.2:** the **grouping** `buildSolverEdges` and
      `buildSolverSlices` both take as a lookup — `groupByWorkItem` is still
      private to `schedule.ts`, and the assembly owes either its publication or
      an argued equivalent, because the two builders' keys only line up while
      the grouping preserves the canonical list's per-leaf order (asserted by
      the `buildSolverEdges` oracle case, not assumed);
      `baselineOffsets`/`fastHint` (2.11's quantised baseline, which cannot
      precede it) with MOVEMENT's preflight; and the assembly itself.
- [x] 2.3 `parseSolverResponse(raw: string)` — **the named framing seam.**
      Rejects anything that is not exactly one well-formed JSON line: two
      lines, trailing text after a valid line, empty stdout, an unknown
      `status`, an unknown key, a missing key. Lands in
      `libs/contracts/solver/src/`, which the same commit made a **compiled and
      linted** directory: `libs/contracts` included `src/**` only, so a module
      here would have been exercised by the suite (its target runs with `cwd:
      libs/contracts` and bun scans recursively) and never typechecked or
      linted — measured, with both includes at their old values a real type
      error in `solver/src` gives `tsc` exit 0 and zero errors.
      It returns a **result**, never a throw: every rejection is the
      coordinator's `invalid-output`, which is a value it records, and four
      refusal codes distinguish the four distinct repairs — `empty-output`,
      `not-one-line`, `malformed-json`, `schema-violation`. Text after a valid
      line on the SAME line is `malformed-json` rather than `not-one-line`,
      deliberately: one is a framing fault and the other is a serialiser fault.
      The structural half is written against the constants `wire-types.ts`
      exports and `wire-types.test.ts` pins to the schema, and **the golden
      corpus is its oracle** — every response fixture is enumerated out of the
      manifest and run through the parser, which fails if it accepts one the
      schema rejects or rejects one it accepts. That is the manifest's own
      stated contract, so no second copy of the schema's rules exists to fall
      out of step, and this is why 2.3 needs no JSON Schema validator
      dependency. **Note for 2.1:** the response corpus has no unknown-key
      fixture (only `request/invalid-unknown-key.json`), so that case is
      covered by 2.5's raw-string cases and not by the corpus.
- [ ] 2.4 `revalidateSolverResult(request, response)` — every offset present and
      non-negative, every edge respected, every `notBeforeUnits` floor
      respected, no pool over capacity at any instant (checked against **all**
      of a slice's `poolIds`, since the whole width is spent in each), no
      assignee double-booked, **every effective deadline respected**, and
      `objectiveValues[T].value` recomputed from
      the final offsets and matched. The deadline clause is stated on the
      **materialised** schedule in the real fractional domain —
      `lastWorkdayOf(start, finish) <= effectiveDeadlineOffset` for every slice
      — and **not** in quantised units, because checking it in units would
      re-implement the inclusive-ceiling rounding a second time and could
      disagree with the End date the column prints, the same argument
      `sameOrder` already makes. A violation is `invalid-output`, never
      `plan-infeasible`: a solver that returns a feasible schedule breaking a
      deadline is a broken engine, not an infeasible plan
      (`openspec/changes/work-item-deadline/design.md` §3.6). Every objective `value`, `stageValue` and
      `bound` **on the wire response**, and every recomputed `PRIORITY`,
      `MAKESPAN` and `MOVEMENT` in quantised solver units, must be a
      non-negative safe integer; an unsafe value is `invalid-output`. This is
      the wire rule and runs before the publication guard; the *stored*
      numeric domain follows `publication` and is 4.12b's rule, not this one
      (Sol r12 Critical 1).
      **`value` is the only recomputed field**
      (Sol r7 Critical 1): `stageValue`, `bound` and `status` are statements
      about a stage, not about the published schedule, and a later stage may
      legitimately improve an earlier term below its own incumbent, so
      recomputing against `stageValue` would reject valid answers. The one
      cross-field relation that must hold **is** checked: `value <= stageValue`
      whenever both are present, because every later stage adds an inequality
      at `stageValue` and a published value worse than it is a real contract
      violation. **Watched red:** a response whose `value` disagrees with the
      offsets is rejected; a response whose `value` is strictly better than
      `stageValue` is **accepted**; a response whose `value` is worse than
      `stageValue` is rejected.
      **Two of three halves landed** in
      `libs/contracts/solver/src/revalidate-solver-result.ts`: the placement
      rules (offset key-set equality, the 2.9 domain, floors, edges, pool
      capacity against **all** of a slice's `poolIds`, assignee non-overlap)
      and the objective arithmetic (the safe-integer wire rule, `value <=
      stageValue`, and all three terms recomputed with a `bigint` accumulator
      so the check cannot round the overflow it exists to find). **The deadline
      clause is NOT implemented** and is the only part left: it is stated on
      the materialised schedule in the fractional domain, so it waits on 4.9's
      `materialiseOptimized`. It is named in the module header rather than
      stubbed. A fifth kind of refusal appeared that this slice did not
      predict — `malformed-request`, for a request that cannot support a
      verdict at all (duplicate slice key, an edge naming no slice, a pool
      membership with no capacity, a slice with no baseline offset). Blaming
      the solver for those sends the repair to the wrong side of the seam.
- [ ] 2.5 **Proven by** `solver-contract.test.ts`: a valid response passes;
      each violation in 2.4 is rejected as invalid-output, one case each; and
      each of 2.3's six framing cases is fed to `parseSolverResponse` **as a raw
      string**, not through a child process — a process cannot reliably produce
      the two-line and trailing-text cases on demand.
      **Framing half landed** in
      `libs/contracts/solver/src/parse-solver-response.test.ts` — all six cases
      as raw strings, plus the corpus agreement suite. The file name differs
      from the one this slice guessed on purpose: the tests live beside the
      unit they prove, and 2.4's re-validator will bring
      `revalidate-solver-result.test.ts` with it. What remains here is 2.4's
      violation cases, which cannot be written until 2.4 exists.
- [ ] 2.6 **Proven by** `solver-request.test.ts`: a null-`days` slice becomes
      `ASSUMED_SLICE_WORKDAYS`; a width-3 slice of 6 days' effort becomes 2
      days; a `whole-item` and an `anchor-slice` plan produce different edge
      sets from identical rows; an unprioritised leaf gets `priorityWeight` 0.
      **Priority resolution is proved in both numeric directions (Sol r8
      Critical 7)**, because the unprioritised-leaf case alone passes under a
      minimum-across-ancestors rule too: leaf 5 under parent 1 resolves to 5,
      leaf 1 under parent 5 resolves to 1, and a null leaf under parent 7
      under grandparent 3 resolves to 7. **Watched red:** replace the import
      with a minimum-across-ancestors resolver and the first and third cases
      must fail. **The third fixture is deliberately 7-under-3 and not
      3-under-7 (Fable r18 Minor 2):** under the minimum rule
      `min({3,7}) = 3`, which is the same answer the nearest-ancestor override
      gives, so a 3-under-7 fixture stays green under the injected fault and
      an implementer sees one failure where two are promised. With 7 nearer,
      override gives 7 and minimum gives 3, so the case distinguishes the
      fault and still proves nearer-over-farther.
- [ ] 2.7 **Negative check, watched red** — remove the dependency check from 2.4
      and watch the "edge violated" case pass when it must fail; then send
      the pre-quantisation `days / width` from 2.2 and watch 2.6's width case fail.
      `Proof:` comment names each removed check. Re-validation is the only thing
      standing between a wrong solver and a published schedule; a check that
      cannot fail is exactly the failure mode AGENTS.md R5 names.
      **First half landed:** the `Proof:` block at the top of
      `revalidate-solver-result.ts` names twelve removed checks and the single
      case each one turns red, all run on h2puni. It records one check that was
      measured dead (an `Object.hasOwn` guard whose removal changed nothing) and
      deleted rather than documented. The `days / width` half still waits on
      2.2's request builder.
- [x] 2.8 `SOLVER_QUANTUM = 48` exported from `libs/domain`, and
      `durationUnits(slice)` = `Math.ceil(durationOf(slice) * SOLVER_QUANTUM)`
      with an exact-multiple assertion within `DRIFT` before the ceiling
      applies. **Fast's real arithmetic, restated because the plan had it
      wrong:** `durationOf` returns `ASSUMED_SLICE_WORKDAYS` for `days === null`
      **without** dividing by `width`, and `days / width` otherwise **without**
      calling `snapWorkdays`; `snapWorkdays` only removes drift near an integer
      and preserves genuine fractions. **Watched red:** a `days: 1, width: 2`
      fixture must read 0.5 workdays end to end; a `days: null, width: 3`
      fixture must read `ASSUMED_SLICE_WORKDAYS`, not a third of it.
      **Landed** in `libs/domain/src/solver-quantum.ts`, with `durationOf`
      **exported** from `schedule.ts` rather than restated — the plan restating
      it is how both arms came to be wrong in the first place. The snap is
      `snapWorkdays` itself, applied to the product rather than to the duration:
      `durationOf`'s result is a genuine fraction that must not be snapped (0.2
      is not drift) and only the product is supposed to be a whole unit, so the
      domain keeps ONE 1e-9 window. `workday.ts`'s "applied at the discrete
      calendar boundaries and nowhere else" is corrected to name this fourth
      site and to carry the reason the window survives the change of unit: a
      sixth of a day is eight solver units, so `DRIFT` is still nine orders
      below the smallest real fraction an estimate can quantise to.
      `durationRoundedUp(slice)` ships beside it because 2.2 records the
      per-slice rounding, and the alternative was 2.2 multiplying and comparing
      against its own copy of the drift window.
      **Three watched reds, each on the h2puni gate at `b1b6201c`:** the snap
      dropped for a bare ceiling → 332/1, failing the overshoot case ALONE
      (`65/6` workdays over width 5 is exactly 104 units and the double is
      `104.00000000000001`, which a bare ceiling reads as 105); the ceiling
      dropped → 331/2, the rounding case plus the integrality invariant across
      all 96 widths; the assumption divided by `width` in `durationOf` → 332/1.
      **That third count is the finding:** breaking Fast's own assumed arm fails
      NO pre-existing test in the 327-test domain suite. Nothing held that arm
      until this slice did, which is exactly why the plan could restate it wrong
      and go unnoticed.
      **A defect this slice CREATED and closed in the same run:** publishing
      `durationOf` put a caller outside `groupByWorkItem`, which refuses
      `width < 1` precisely because `durationOf` divides by it — a width of 0 is
      `Infinity` days for a slice with effort and `NaN` for one without. Since
      `Math.ceil(Infinity)` is `Infinity`, an unrefused width would have reached
      the wire as a *duration* and been diagnosed there as the builder's own
      request violating its own schema. `quantise` now throws, which is
      `groupByWorkItem`'s own choice on the same input: malformed input, not a
      missing default. A null estimate never divides, so it stays finite at
      every width and stays an answer. Watched red: guard deleted -> 343/1.
- [x] 2.9 The re-validator rejects any offset that is not a non-negative
      integer unit within `horizonUnits`. **Watched red:** feed it a
      fractional offset and a negative one.
      **Landed** in `revalidate-solver-result.ts`; the watched red disables the
      domain guard and fails that case alone, 69/1. `horizonUnits` bounds the
      OFFSET and not the finish, because it is the CP-SAT variable domain; a
      finish past the horizon is 2.4's makespan arithmetic.
- [ ] 2.10 `horizonUnits > 2**31 - 1` fails before spawn with
      `horizon-overflow`, and the `Σ w(s) × horizonUnits` worst case past
      `Number.MAX_SAFE_INTEGER` fails before spawn with `objective-overflow`;
      the same safe-integer ceiling applies to the worst-case `MOVEMENT` sum
      and every request/response objective integer. Bound calculation uses a
      `bigint` accumulator so the preflight cannot itself round an overflow.
      Both are **first-class members of the one failure state
      machine** (7.1), not a bare return from request construction: it writes
      the same `status='failed'` marker row and emits the same
      `schedule_optimization_failed` event as any other reason, so a client
      already showing `Optimizing…` reaches Retry rather than waiting on a
      child that was never spawned. **Watched red:** a synthetic plan past each
      bound must not reach a process, and both a connected client and a freshly
      loaded one must reach `Optimization unavailable · Retry`. A dense-rank
      fixture whose exact sum is `Number.MAX_SAFE_INTEGER` round-trips, while
      the same fixture at one greater never spawns; a response altered by one
      at the boundary is rejected rather than rounded to the same value.
- [ ] 2.11 The **quantised Fast baseline**: re-run Fast's placement over the
      rounded durations to produce `fastHint` and `baselineOffsets` in integer
      units, and take stage 1's upper bound from **that**, never from real
      Fast. **Watched red** — the fixture that proves the earlier plan was
      wrong: three serial slices with `days=1, width=5` (real Fast finishes at
      28.8 units, the rounded model needs 30). Assert the hint is feasible,
      `MOVEMENT` is defined against it, and — via **task 4.11b, the real-domain
      publication guard**, which is where that comparison actually lives — the
      stored variant's primary term measured in the real domain is not worse
      than the real Baseline schedule's, falling back to Fast's own
      materialised schedule tagged `'quantisation-floor'` when quantisation
      costs more than the search won. Also assert the **request** carries the
      quantised offsets: on this fixture `baselineOffsets` and `fastHint` must
      be the 30-unit integer values, never real Fast's 28.8-unit ones, checked
      against the golden request fixture and `solver-wire.v1.json`.

## 3. Cache, slot and queue tables (PROD MODE — reviewed PR, no self-merge)

- [ ] 3.1 `optimized_schedule_cache` in `apps/be-01/src/repository/schema.ts`:
      composite PK `(projectId, inputHash, objective, contractVersion,
      budgetMs)` → `generation`, `status`
      (`'ok' | 'failed' | 'plan-infeasible'`), `resultJson`
      (NULL iff failed), `failureReason` (NULL unless failed), `createdAt`.
      Integrity is declared, not assumed: `projectId` FK to `project(id)`
      `ON DELETE CASCADE`; `CHECK (status IN ('ok','failed','plan-infeasible'))`;
      `CHECK ((status='ok' AND resultJson IS NOT NULL AND failureReason IS
      NULL) OR (status='failed' AND resultJson IS NULL AND failureReason IS
      NOT NULL) OR (status='plan-infeasible' AND resultJson IS NOT NULL AND
      failureReason IS NULL))`; `CHECK (objective IN ('pri','time'))`.
      **Assumption A1 (TASK-219, dev mode): the `plan-infeasible` payload
      reuses `resultJson`**, holding a versioned `PlanInfeasibleResult` —
      `{ dtoVersion, items: [{ ownerWorkItemId, boundWorkItemId,
      effectiveDeadlineOffset }] }`, `ownerWorkItemId === boundWorkItemId` when
      a leaf's own date binds — discriminated by the row's own `status` rather
      than by a fourth nullable column. Rationale: `resultJson` is already the
      row's versioned payload with a decoder whose failure is already defined
      as `corrupt`, and a fourth column would add a fourth CHECK arm and a
      second decode seam for one state. **Consequence that must be stated, not
      implied:** a `plan-infeasible` row whose `resultJson` fails to decode
      reads as `corrupt` on exactly the same rule as an `ok` row does, and is
      therefore retryable, while a decodable one is not. **Falsified if** the
      offending-item list ever needs to be queried by SQL rather than read
      whole, at which point it becomes its own table and this assumption is
      wrong rather than merely superseded.
- [ ] 3.2 `optimization_generation`: PK `(projectId, contractVersion)` →
      `generation` (integer not null), `inputHash` (text nullable),
      `cancelEpoch` (integer not null default 0), `admissionState`
      (`'open' | 'draining'`, not null default `'open'`), `updatedAt`. This is the sole
      home of the generation identity; it is deliberately **not** on `project`,
      because `SCHEDULER_CONTRACT_VERSION` is bumped while blue and green run
      against one file and a single project-row pair would let the release
      computing H1 and the release computing H2 alternately increment one
      counter and delete each other's rows for ever.
      `solver_slot`: PK
      `(projectId, contractVersion, generation, objective, budgetMs)` →
      `ownerId`, `attemptToken`, `lifecycle` (`'starting' | 'running'`, with
      `CHECK (lifecycle IN ('starting','running'))`) and
      `CHECK (objective IN ('pri','time'))` on the key's own `objective`
      column (Fable r18 Important 1 — the blanket stored-enum rule covers it
      and every instantiating list omitted it), nullable `pid` (NULL
      while `starting`, since the process does not exist at reservation time
      — Sol r12 Critical 2), `startedAt`, `heartbeatAt`,
      `cancelRequestedAt`, `admittedDeadlineAt`. **`budgetMs` is in the key and
      the deadline is a stored absolute instant (Sol r8 Critical 2, kimi r8
      Important 3)**: `budgetMs` is a cache-key column, so without it a 60 s
      and a 120 s solve for one objective collapse into one row, the
      liveness lookup behind `pending`/`retrying` and Retry's `already-running`
      cannot be evaluated against the full key at all, and a coordinator
      configured at the smaller budget reclaims a larger-budget child that is
      still inside its own deadline. `solver_queue`: PK
      `(projectId, contractVersion, objective, budgetMs)` — **not** keyed by generation,
      so a project holds at most one queued entry per objective **per budget**
      per contract version (the PK's own bound; an entry that did not name its
      budget could not tell the dequeue which budget to launch, which is why
      `budgetMs` is in the key) and a new generation replaces rather than
      accumulates — with
      columns `generation`, `admittedCancelEpoch`, `budgetMs`, `enqueuedAt`,
      `CHECK (objective IN ('pri','time'))` on the key's own `objective`
      column (Fable r18 Important 1), and
      an index on
      `(enqueuedAt, projectId, contractVersion, objective, budgetMs)`. The
      dequeue order is
      `ORDER BY enqueuedAt, projectId, contractVersion, objective, budgetMs`,
      which is total (Sol r7 Minor 15): `objective` breaks the tie between a project's
      PRI and Time entries enqueued in the same millisecond, and
      `contractVersion` breaks the tie between blue and green enqueuing the
      same project and objective in that same millisecond. All three companion
      tables carry `projectId` FK to `project(id)` `ON DELETE CASCADE`, so
      deleting a project cannot leave rows consuming the global 16-slot budget.
      Retirement: an `optimization_generation` row untouched for
      `GENERATION_RETENTION_DAYS = 30`, or whose contract version is retired at
      deploy, first enters `admissionState='draining'` and is deleted only by
      the drain protocol in 3.9b.
- [ ] 3.1b `project.optimization_delete_pending_at`, internal nullable
      timestamp, in **this** slice's additive migration (Sol r12
      Important 5). It is the durable cross-process fence 3.9b's drain and
      its process test read, not a user setting and not a read-payload
      field, so it must exist before any drain code lands; slices 3 and 3b
      ship as separate reviewed PRs, so leaving it in 3b made this slice
      unimplementable against its own declared schema. Repository mapping is
      internal-only; the read payload is unchanged. Covered by 3.7's
      `down.sql` and its rollback-then-re-apply proof.
- [ ] 3.3 Forward migration under `apps/be-01/drizzle/` — additive only. Blue
      and green share one SQLite file during a swap, so the outgoing release
      must keep running against the migrated file untouched.
- [ ] 3.4 **Proven by** `optimized-schedule-cache.db.test.ts`: forward migration
      creates the four tables; it is idempotent on an already-migrated file; a
      rollback and re-apply leave every pre-existing table intact; the outgoing
      release's queries still run after the migration; each CHECK rejects its
      malformed row (an `ok` row with a NULL `resultJson`, a `failed` row
      with one, an unknown `objective`); and deleting a project cascades its
      cache rows away only through `finishOptimizationDrain` after the real
      slot count reaches zero.
- [ ] 3.5 **Negative check, watched red** — drop the status/nullability CHECK
      and watch 3.4's "an `ok` row with a NULL `resultJson` is rejected" case
      fail. `Proof:` comment names the removed constraint. SQLite text columns
      otherwise hold any combination a past bug wrote.
- [ ] 3.6 This slice touches `apps/be-01/drizzle/**`, a prod-mode path: PR with
      green CI and a real review, `status: review`, no self-merge.
- [ ] 3.7 `down.sql` beside `migration.sql` — AGENTS.md mandates it, migration
      lint and `readMigrationFolders` refuse without it, and an aborted
      blue/green deploy cannot return to the applied set. Proved by
      apply → rollback → re-apply against the applied set, not by inspection.
      The rollback assertion **enumerates** what this slice added — the
      **four** tables `optimized_schedule_cache` (3.1),
      `optimization_generation`, `solver_slot` and `solver_queue` (3.2), plus
      `project.optimization_delete_pending_at` (3.1b) — rather than counting
      them. **The count is four, not three (Fable r14 Important 1):** "three
      companion tables" beside the cache is the phrase this enumeration was
      written from, and an implementer building `down.sql` from a
      three-item list ships a rollback that strands one table — the aborted
      blue/green failure this task exists to prevent.
- [ ] 3.8 `CHECK (failure_reason IS NULL OR failure_reason IN
      ('timeout','invalid-output','no-solution','internal-error','oom',
      'horizon-overflow','objective-overflow'))` — any non-null text was
      previously accepted. `optimization_generation.admission_state` also has
      `CHECK (admission_state IN ('open','draining'))` plus an explicit read
      validator; it is a scalar enum, not an enum hidden in `resultJson`.
      **`solver_slot.lifecycle` is the third one and was missing its validator
      (Fable r14 Important 2):** 3.2 declares its `CHECK` inline, but a
      `CHECK` alone is not the stored-enum rule — it gets an explicit read-time
      validator beside `admission_state`'s, throwing and naming the column and
      the stored value, and the negative test below injects an unknown
      lifecycle exactly as it does for the other scalar enums.
      **`solver_slot.objective` and `solver_queue.objective` are the fourth and
      fifth, and were missing everything (Fable r18 Important 1):** both are
      `'pri' | 'time'` in their own scalar column and in their table's PK, both
      now carry the inline `CHECK` declared at 3.2, and both read paths get the
      **existing** `isObjective` validator — the validator list does not grow,
      only the column list does, because these are the same stored enum the
      cache's `objective` column already validates. The dequeue is why this is
      not cosmetic: it reads `solver_queue.objective` into the typed spawn
      identity (6.3), so a row corrupted by a past bug would launch a
      garbage-objective solve whose failed-marker write then violates the
      cache's own `CHECK (objective IN ('pri','time'))` — no marker and no
      `schedule_optimization_failed` event could ever be written for that key,
      which is the unnotified wedge rounds 7-12 spent closing, reached through
      the one column the sweeps never audited.
      **Negative injection, watched red:** write `'prio'` directly into
      `solver_slot.objective` and into `solver_queue.objective` with the
      `CHECK`s dropped, and each read path must throw naming the column and the
      stored value; remove either validator and the corrupted row must reach
      the spawn identity instead.
- [ ] 3.9 **Proven by** `optimization-generation.db.test.ts`, run through the
      production repositories: a blue/green pair with two distinct
      `contractVersion` values neither reallocates nor deletes the other's
      rows, while a real plan edit still fences both; and a retired contract
      version's rows are removed with everything keyed to them, **after the
      drain below**. **Watched red:** move the generation back onto `project`
      and the blue/green case must fail.
- [ ] 3.9b **Deletion and retirement are two-phase cancel-and-drain, proven by
      a real two-coordinator process test** (Sol r10 Critical 2).
      `optimization-drain.proc.test.ts` samples the **real OS process count**
      throughout, not a mocked spawner. Name and implement two repository/service
      seams: `beginOptimizationDrain(projectId, contractVersion?)` and
      `finishOptimizationDrain(projectId, contractVersion?)`. Begin is one
      transaction: for contract retirement it sets the targeted generation's
      `admissionState='draining'`; for project deletion it first sets the durable
      `project.optimization_delete_pending_at` marker and then sets every one of
      that project's generation rows to `draining`; it also advances
      `cancelEpoch`, stamps `cancel_requested_at` on the affected `solver_slot`
      rows, and deletes the affected `solver_queue` rows. Both admission and
      dequeue transactions reject a generation unless `admissionState='open'`
      and reject any project carrying `optimization_delete_pending_at`. The
      project is hidden from ordinary reads and writes as soon as that marker
      commits, but its physical row remains to keep slot rows and their capacity
      accounting alive. The system then drains, leaving those slot rows
      **counted and undeleted** until each is released by its owner or passes
      its stored `admittedDeadlineAt`. Finish runs in a transaction, observes
      zero affected slot rows while the same durable closed state still holds,
      and only then deletes the generation or project row and lets the
      `ON DELETE CASCADE` take the remainder. The
      cascade remains declared as the orphan backstop, not the mechanism.
      **Finish is not the initiator's job (Sol r12 Critical 3).** A crash
      between `begin` and `finish` previously left the project hidden with
      admission closed for ever, and admission is exactly what a draining
      project rejects, so no later read could sweep it. Two further paths
      call the same transactional `finish`: (a) **opportunistic** — every
      slot release and every reclaim sweep re-reads the durable marker in the
      same transaction that removes the last affected row and finishes when
      zero remain; (b) **reconciliation** — `reconcileOptimizationDrains()`
      on coordinator startup and every `DRAIN_RECONCILE_INTERVAL_MS = 60000`,
      scanning `draining` generations and delete-pending projects, reclaiming
      affected slots past their stored `admittedDeadlineAt`, and finishing
      those with none left. Both are idempotent, no-ops on an absent target,
      and safe to race: the precondition is the lock, and the loser observes
      the row already gone. Neither path reopens admission.
      **Third watched red:** crash immediately after `begin`, restart a
      *different* coordinator, advance past slot expiry, and require physical
      project deletion, optimization-row cleanup and terminal contract
      retirement with admission still closed throughout; remove the
      reconciler and the project must stay wedged and undeletable. Two
      reconcilers run concurrently must produce the same end state and no
      error.
      **Watched red:** restore the immediate slot cascade — delete the project
      row while its child still runs — and the sampled process count must
      exceed 16 as a second project admits into the freed capacity. A second
      red uses two coordinators: one begins a drain while the other attempts
      both admission and dequeue; removing either closed-state predicate must
      let work start after the zero-slot observation and before final deletion.

## 3b. Project settings columns and API (PROD MODE — reviewed PR, no self-merge)

- [ ] 3b.1 Additive migration on `project`: `optimization_enabled` boolean not
      null default **false**, `schedule_engine` text not null default `'fast'`,
      and `schedule_objective` text not null default `'pri'` — **three
      columns, all user-facing settings**. `optimization_delete_pending_at`
      is **not** here: slice 3's drain code and its process test read that
      column, and the two slices ship as separately reviewed PRs, so a marker
      created only in 3b left slice 3 unimplementable against its own
      declared schema (Sol r12 Important 5). It moves to 3.1b. The defaults are
      what make OFF-by-default true for every existing row; no backfill can
      guarantee that retroactively. The generation counter, the input hash and
      the cancel epoch are **not** added here (Sol r7 Critical 4): they are per
      contract version and live in the `optimization_generation` table slice 3
      creates.
- [ ] 3b.2 Repository mapping in `apps/be-01/src/repository/project.ts`; the
      three settings in the project read payload; a PATCH contract in
      `project.controller.ts`/`project.service.ts` under the **existing
      project-write authorization** — these are project settings, so a reader
      may not change them.
- [ ] 3b.3 A `project_settings_changed` variant on `ProjectEvent`, emitted by
      `ProjectService.update` when any of the three change, carrying the new
      values. `schedule_optimized` stays reserved for stored solver results.
- [ ] 3b.4 **Proven by** `project-settings.db.test.ts` and
      `project.controller.test.ts`: an unmigrated row reads
      `false`/`fast`/`pri`; a PATCH of each setting survives a reload; a
      read-only collaborator's PATCH is refused and emits nothing; a successful
      PATCH emits exactly one `project_settings_changed` and no
      `schedule_optimized`.
- [ ] 3b.5 **Negative check, watched red** — make `optimization_enabled`
      default true and watch 3b.4's unmigrated-row case fail. `Proof:` comment
      names the changed default. A toggle that defaults ON silently starts
      solvers for every existing project on deploy.
- [ ] 3b.6 This slice touches `apps/be-01/drizzle/**`, the **second** prod-mode
      path in this change: PR with green CI and a real review, `status:
      review`, no self-merge.
- [ ] 3b.7 `down.sql` plus rollback-then-re-apply coverage that names and
      removes **each of the three** columns this slice adds
      (`optimization_enabled`, `schedule_engine`, `schedule_objective`); the
      assertion enumerates them rather than counting, so a column left behind
      is schema drift the test catches. `optimization_delete_pending_at`
      belongs to slice 3's own `down.sql` (3.1b, 3.7).
- [ ] 3b.8 `CHECK (optimization_enabled IN (0,1))`, `CHECK (schedule_engine IN
      ('fast','optimized'))`, `CHECK (schedule_objective IN ('pri','time'))`,
      and explicit read-time validators `isScheduleEngine` /
      `isScheduleObjective` in the project mapper that throw naming column and
      value — the shape `toProject` already uses for `estimateMethod`,
      `depReach` and `estimateRounding`. **Watched red:** write an unknown
      value for each of the three and the boolean directly and read through
      the production path.

## 4. Cache read/write, generations, validity and the failed marker

- [ ] 4.1 Repository functions: read the pair for the full key; write an `ok`
      row; write a `failed` row; allocate the next generation in the
      `optimization_generation` row for `(projectId, contractVersion)` **and**
      delete that contract version's older-generation cache and queue rows in
      one transaction — **slot rows are not deleted**, because freeing the
      count before the children are proved dead is what let six real children
      run while SQLite counted two. Neither write is a blind `upsert`: each is
      a conditional insert whose transaction first asserts the writer's own
      live `solver_slot` row still carries its `attemptToken`, and whose
      `WHERE` also requires the generation still current for that contract
      version, the cancel epoch unchanged, and `optimization_enabled` still 1.
      A superseded run therefore cannot store, evict, overwrite an `ok` with a
      `failed`, or emit a second outcome record for one key.
- [ ] 4.1b Retention, both rules. (1) Allocation deletes that contract
      version's older-generation cache rows. (2) A committing outcome keeps the
      `MAX_LIVE_BUDGETS = 2` most recently written budgets for
      `(projectId, objective, contractVersion, inputHash)` and deletes the
      rest. **Rule 2 is a bound, not an exclusion** (Sol r7 Important 9): the
      earlier "delete every other row whose `(inputHash, budgetMs)` differs"
      made a budget change a livelock, because a config change is not a code
      change, so blue and green can read 60000 and 120000 under one
      `contractVersion` and each deleted the other's row on every store —
      alternating solves for ever on an unchanged plan and holding the 4/16
      ceilings busy. The per-contract generation table cannot fix that; only
      the bound can. The bound every artifact states is **`MAX_LIVE_BUDGETS`
      (2) rows per project per objective per live contract version, so at most
      4 outcome rows per project per live contract version** — never "two rows
      total", and never "superseded rows are deleted when their replacement
      commits", which is the exclusive rule this task struck (Sol r8 Important
      8). **Proven by** (a) raising `budgetMs` three times and
      bumping `contractVersion` with no plan edit, asserting at most two rows
      per project per objective per live contract version; and (b) a two-release
      fixture reading different budgets against one file — each stores once,
      each then hits its own row, and the injected spawner sees exactly two
      solves across ten alternating reads. **Watched red:** restore the
      exclusive rule and (b)'s spawn count must rise with every read.
- [ ] 4.2 **Proven by** `optimized-cache.db.test.ts`: same input → hit with
      **zero calls on the injected spawner** (asserted on the spawner, not on
      elapsed time); a changed effort, edge or pool → miss; a `contractVersion`
      bump → miss; a **raised `budgetMs` → miss** (the old smaller-budget row is
      not served); a `status='failed'` row never satisfies a read and is
      overwritten by the next run for that key; a new generation deletes every
      prior row for that project including its `failed` ones; an undo to a
      previous hash misses; and a row whose `resultJson` fails to decode is
      **left in place** and reads as `corrupt` (4.8), never deleted and never
      treated as a miss.
- [ ] 4.3 **Negative check, watched red** — let a `status='failed'` row satisfy
      a read and watch the "never satisfies a read" case fail. `Proof:` comment
      names the relaxed predicate. Serving a failure marker as a schedule would
      publish an empty plan as an optimized one.
- [ ] 4.4 A `failed` row suppresses an automatic re-spawn for its exact key and
      blocks neither an explicit Retry nor a new hash's generation.
      **Proven by** a case in `optimized-cache.db.test.ts`: ten reads by three
      collaborators against a failed key spawn nothing; **a same-hash edit
      spawns nothing**; a Retry on the same key spawns exactly one; a new hash
      spawns the normal pair.
- [ ] 4.5 **Negative check, watched red** — put `failed` back into the
      auto-spawn set and watch 4.4's "ten reads spawn nothing" case fail.
      `Proof:` comment names the restored branch. Every read becoming a re-solve
      is the timer retry Dany explicitly rejected, wearing a different hat.
- [ ] 4.6 **ABA fence, proven by** `optimization-generation.test.ts`: run hash
      A, edit to B (cancelling A), undo to A, then let the original A child
      return a valid result. Its write is rejected, no rows are deleted, no
      `ok` row becomes `failed`, and no event is emitted.
- [ ] 4.7 **Negative check, watched red** — drop the generation predicate from
      4.1's conditional write and watch 4.6 fail. `Proof:` comment names the
      removed predicate. `inputHash` alone cannot tell a resurrected run from a
      current one, which is the whole reason the generation exists.
- [ ] 4.8 `isOptimizedStatus` / `isObjective` / `isFailureReason` validators on
      the cache read path, throwing rather than casting or defaulting.
      **Watched red:** an unknown value for each, injected as a stored row.
      A row whose `resultJson` fails to decode is **left in place**, not
      deleted (Sol r7 Important 13): the earlier "delete it and treat it as a
      miss" contradicted the decoder throwing, contradicted AGENTS.md R5, and
      silently turned corruption into a read-triggered solve — the timer retry
      Dany rejected, arriving through the cache instead of the clock. The
      variant reads as the sixth state `corrupt`, carrying the decoder's
      message; it never satisfies a read and never auto-spawns, exactly like
      `failed`, and Retry overwrites it through the ordinary admission path.
      **Watched red:** write a truncated and a wrong-`dtoVersion` `resultJson`
      directly, read through the production path — the row survives, the
      payload reads `corrupt` with the reason, ten reads spawn nothing, one
      Retry produces exactly one child; then restore the delete-and-miss
      behaviour and the spawn-count case must fail.
- [ ] 4.9 `materialiseOptimized(canonicalInput, offsets)` in `libs/domain`
      is what produces the `schedule` member of `resultJson`; the offsets map
      is never persisted or
      returned as a schedule. Fast has **no** annotation-only pass to call, so
      **this task begins** by splitting `placeSlices` into
      `chooseStarts(canonicalInput)` and `annotate(canonicalInput, starts)`,
      proved behaviour-preserving by the existing Fast golden corpus **before**
      anything optimized is built on it; `materialiseOptimized` is then
      `annotate` over the dequantised
      offsets. `annotate` replays the person and pool ledgers in ascending
      start with ties broken by the canonical slice order, calling the
      **existing** `jointWindowFor(poolIds, …)` and `reserve(poolIds, …)`
      unchanged — the whole width in **every** named pool, which is what
      `Slice.poolIds` and Dany's 2026-08-13 decision 3 say and what Fast does
      (Sol r7 Critical 3). "First pool in sorted `poolIds` with free capacity"
      is struck: it was a different resource model that could accept a
      materialised schedule overbooking a second team, and a different
      resource-successor graph, float and wait count. **The floor is
      resolved by Fast's own loop, not by comparing the joint window to the
      pinned start (Sol r8 Critical 1, kimi r8 Critical 1):** build
      `[predecessor, stepOrder, notBefore, person, capacity=w.start]` in that
      order and take a candidate only when it is **strictly** later than the
      running answer, so a tie keeps the floor named first and `capacity`,
      last, loses every tie — `schedule.ts` 1234–1252 verbatim. Only then
      compare `pinnedStart` to the resolved start: equal keeps the resolved
      `boundBy`; strictly later is `optimizer`, asserting
      `jointWindowFor(…, pinnedStart).start === pinnedStart`; strictly earlier
      is `invalid-output`. The struck three-way split reported `capacity` for
      the common unmoved slice — where `jointWindowFor` returns `binding: []`
      by construction, so `capacityTeamId` had no rule and
      `capacityPredecessorIds` was empty beside `boundBy: 'capacity'`,
      violating the render invariant — and reported `optimizer` for a slice
      merely pinned at its predecessor floor. `capacityPredecessorIds` is
      `jointWindowFor`'s accumulated blocking set across rounds and pools
      **filtered by `finishesByStart` (`placed[b].finish <= start`)**, which is what
      `placeSlices` does at 1271–1308: the scan is conservative and records
      reservations that may legally continue alongside the slice, and
      promoting one into the backward graph gives it a late finish before its
      early finish and negative public float. The same filter applies to each
      binding pool's candidate set before `capacityTeamId` is chosen — the
      pool whose **valid** blockers hold the latest finisher, ties by pool id —
      and to the resource-successor edges. `annotate` derives from those
      ledgers the resource-successor edges `lateTimes` consumes — so `duration`, `estimated`, earliest/latest, `float`,
      `critical`, `boundBy`, `resourcePredecessorId`, `capacityPredecessorIds`,
      `capacityTeamId`, `width`, `effort`, the work-item projections and both
      wait counters come out of the one code path that produces them today,
      with resource edges and late times derived from the **optimized**
      placement rather than copied from Fast.
- [ ] 4.10 The floor precedence is the complete ordered list `projectStart |
      predecessor | stepOrder | notBefore | person | capacity | optimizer`; the
      earlier list stopped at `notBefore` and would have labelled a
      person-bound or capacity-bound optimized slice `optimizer`, erasing its
      resource predecessor, its team and both wait counts.
      `ScheduleFloor` gains the additive member `'optimizer'`, used exactly
      when a start is strictly later than every floor of its slice — an
      optimizer may deliberately idle a low-priority slice and that start has
      no value in today's union. `floorWordsOf` gains its case. The render
      invariant holds: under `'optimizer'`, `resourcePredecessorId` is null,
      `capacityPredecessorIds` is empty and `capacityTeamId` is null, so
      "set exactly when `boundBy === 'capacity'`" is still true.
- [ ] 4.10b **Two orders, not one** (Sol r7 Important 7). Ledger replay is
      chronological (ascending start, canonical tie-break); the order handed to
      `lateTimes` is a **topological** order of the augmented graph — plan
      edges, step-order edges and the reconstructed resource-successor edges —
      computed by Kahn with the ready set drained in ascending
      `(start, canonical slice order)`, so it stays fully determined by the
      hashed input. Chronological order is not topological on legal data:
      `durationOf` preserves an explicit `days: 0`, `windowFor` treats a zero
      duration as legal no-work, so a zero-duration predecessor and its
      successor can share a start and the id tie-break can order them
      backwards — after which `lateTimes`, which walks its `order` backwards
      and immediately reads `late[next].latestStart`, reaches the predecessor
      before the successor has a `Late`. Fast is audited for the same hazard in
      this slice and fixed the same way if `placeSlices`' placement order can
      produce it. **Watched red:** a two-slice fixture with a zero-duration
      predecessor whose id sorts **after** its successor, sharing one start —
      passing chronological order to `lateTimes` must throw or produce a wrong
      `latestStart`, and the topological order must not.
- [ ] 4.11 Materialiser proofs run **through the real plan-read payload**
      (`work-item.service.ts`), not against the domain type. **Watched red:**
      (a) return Fast's own annotations against optimized dates — the float
      and `boundBy` assertions must fail; (b) report a deliberately idled
      slice as `projectStart` instead of `'optimizer'`; (c) set
      `capacityTeamId` on an `'optimizer'` slice — the render invariant test
      must fail; (d) **the contended two-pool case, on the production path**
      (Sol r7 Critical 3): one slice naming two pools that each have room only
      after different reservations end, so the joint window is later than
      either pool's own earliest fit. Reserve into only the first pool and the
      second pool's capacity assertion must fail; take `capacityPredecessorIds`
      from the releases at exactly the pinned start and the accumulated-set
      assertion must fail; take `capacityTeamId` as the first sorted pool and
      the latest-finisher assertion must fail; (e) **the long-plus-short
      capacity-2 case** (Sol r8 Critical 1): pool size 2, long width-1 A on
      0–10, short width-1 B on 0–5, an optimized width-1 X pinned at 5 — drop
      the `finish <= start` filter and X must report A as a capacity
      predecessor, adding an A→X edge that gives A a late finish before its
      early finish and exposes negative public float; (f) **the unmoved slice
      at its predecessor floor with pool room** (kimi r8 Critical 1): restore
      the three-way `w.start === pinnedStart` split and the slice must report
      `boundBy: 'capacity'` with an empty `capacityPredecessorIds` and a null
      `capacityTeamId`, failing the render invariant.
- [ ] 4.11b **The real-domain publication guard** (Sol r10 Critical 3). No
      numbered slice implemented this at all; 2.11 pointed at a "6.x
      publication guard" that does not exist, so the guarantee had no owner.
      It runs **after 4.9's materialisation and before any cache write**, in
      `libs/domain`, on the materialised schedule: (a) compute the **Baseline
      schedule** — *real* Fast, fractional `days / width` intact, over the same
      canonical input; (b) recompute the variant's **primary** term
      (`MAKESPAN` for Time, `PRIORITY` for PRI) on both the materialised
      optimized schedule and the Baseline schedule, **in the real domain**;
      (c) if the optimized primary is **strictly worse** than the Baseline's,
      substitute the Baseline's own materialised schedule and store it with
      `publication: 'quantisation-floor'`, every `value` recomputed in the real
      domain, null `stageValue`/`bound` and `status: 'unknown'` (4.12b);
      otherwise store the solver's schedule with `publication: 'solver'`.
      The predicate is **worse**, never "not strictly better": an *equal*
      primary may carry a strictly better secondary term, and discarding that
      result would throw away a real improvement the user asked for.
      **Proven by** two fixtures, both on the production write path: (i) the
      width-5 case — three serial `days=1, width=5` slices, real Fast at 28.8
      units against a quantised model that needs 30 — where the solver's
      quantisation-optimal answer is *worse* in the real domain and the stored
      row must be Fast's schedule tagged `'quantisation-floor'`; (ii) an
      **equal-primary, better-secondary** fixture where the optimized primary
      ties the Baseline's and its secondary is strictly better — the stored row
      must be the **solver's**, tagged `'solver'`.
      **Watched red:** weaken the predicate to "not strictly better" and (ii)
      must fail by substituting Fast; score in the **quantised** domain instead
      of the real one and (i) must fail by publishing the worse schedule as
      `'solver'`; move the guard after the cache write and (i) must fail with a
      `'solver'` row already durable.
- [ ] 4.12b The cached row stores an **`OptimizedResult`, not a bare schedule**
      (Sol r7 Critical 6). `objectiveValues` is what records how far a
      partially staged run got, and the publication guard must persist
      `'quantisation-floor'`, but `Schedule` carries neither and the cache had
      only `scheduleJson`, so both were discarded at storage. The column
      becomes `resultJson` holding
      `{ dtoVersion, publication: 'solver' | 'quantisation-floor',
      objectiveValues: Record<'makespan'|'priority'|'movement', ObjectiveValue>,
      schedule: <encodeSchedule(schedule)> }`, with `StoredObjectiveValue =
      { value: number, stageValue: number | null, bound: number | null,
      status: 'optimal' | 'feasible' | 'unknown' }` and
      `encodeOptimizedResult` / `decodeOptimizedResult` as the seam.
      **`quantisation-floor` lives only in `publication` (Sol r8 Critical 5,
      kimi r8 Important 2)**: the matrix fixes the status enum at three values
      and generates the wire schema and the 4.8 validator from it, so a fourth
      value there left the codec rejecting the row the guard must store.
      **No column `CHECK` is generated for it**: `publication` and per-term
      `status` live inside `resultJson`, so 4.8's `decodeOptimizedResult` is
      their only validator (Sol r10 Important 11). The stored shape is
      **identical to the wire shape** — `stageValue` and `bound` are already
      nullable on the wire (matrix row `UNKNOWN, no incumbent, k > 1`), so
      storage widens nothing. For a `quantisation-floor` row every `value`
      is recomputed **in the real domain on the stored Fast schedule**,
      `stageValue` and `bound` are null, `status` is `unknown`, and 2.4's
      `value <= stageValue` relation is not applied — it is a within-stage
      relation with no meaning across the quantised and real domains.
      **The numeric domain is per-`publication`, not blanket (Sol r12
      Critical 1).** `decodeOptimizedResult` requires a non-negative **safe
      integer** for every non-null number of a `'solver'` row (quantised
      solver units, the wire's own rule) and a **finite non-negative number
      that need not be an integer** for each `value` of a
      `'quantisation-floor'` row (real domain, fractional workdays, the same
      unit as the stored offsets), rejecting `NaN`, infinities and negatives
      in both. A blanket safe-integer rule is unsatisfiable: `durationOf`
      keeps `days / width` fractional (`libs/domain/src/schedule.ts:539-541`),
      so the mandated width-5 floor row's real makespan is 0.6 workdays /
      28.8 units and the decoder would reject the row the guard must store.
      **Watched red:** a width-5 floor row must round-trip through SQLite and
      the real plan read with the stored schedule equal to Fast's, null
      `stageValue`/`bound` and `publication: 'quantisation-floor'`; put
      `'quantisation-floor'` back into `status` and the read-time enum
      validator must reject it.
      **Second watched red, the fractional one (Sol r12 Critical 1):** that
      same floor row's reloaded `value` must be **bit-equal** to `scoreReal`
      re-run on the reloaded Fast schedule — asserted against the scorer, not
      against the literal `0.6`, because `0.2 + 0.2 + 0.2 !== 0.6` in
      IEEE-754 — and the row must decode with `Number.isSafeInteger(value)`
      false; apply the safe-integer rule to floor rows and this case must
      fail, while a `'solver'` row carrying that same non-integer value must
      still be rejected.
      **Two further negatives, both valid JSON** (Sol r10 Important 11, which
      is where the JSON-held enums are actually enforced): (a) a syntactically
      valid `resultJson` whose `publication` is `'fast'` — `decodeOptimizedResult`
      throws naming `publication` and the unknown value, and the row reads as
      `corrupt`; (b) a syntactically valid `resultJson` whose last term carries
      `status: 'proved'` — the same seam throws naming the term and the value.
      Neither may be caught by a database constraint: assert directly that the
      migration adds **no** `CHECK` over `resultJson`, so a *malformed* payload
      (a truncated string, already covered above) still inserts and still
      surfaces as `corrupt` rather than failing the write.
      `publication` is stored rather than inferred, because a
      `quantisation-floor` row **is** Fast's schedule and the comparison
      indicator must not present it as a solver win. **Watched red:** a
      partially staged row (`status: 'unknown'` on the last term) and a
      `quantisation-floor` row each reload through SQLite and the real plan
      read with every field intact; a `resultJson` holding a bare
      `encodeSchedule` output makes `decodeOptimizedResult` throw naming the
      missing `dtoVersion`; and storing through the old
      `scheduleJson`-shaped write makes the metadata assertions fail.
- [ ] 4.11c **The capacity arrow's referent is the chosen pool, and it is
      tested** (Sol r13 Minor 5 renumbered this from a duplicate `4.11b`;
      `4.11b` is the real-domain publication guard and is referenced as such
      by 2.x and 6.x, so a tracker could have closed one while skipping the
      other). (Sol r12 Minor 6). For a `capacity` floor,
      `resourcePredecessorId` is taken from the filtered blockers of the pool
      `capacityTeamId` names, ties broken by placement order **within that
      pool** — never from the union across binding pools, whose tie-break can
      point the arrow at a slice from a different pool and split it from the
      team sentence that explains it (Fast selects from
      `capacityTeamBlockers` for this reason,
      `libs/domain/src/schedule.ts:1283-1288 for the rule, 1311-1334 for the selection loop it constrains`). 4.9's and 4.11's existing
      cases prove pool filtering and team selection but not the referent, so
      an implementation selecting from the union passes all of them.
      **Watched red:** a fixture with two eligible binding pools whose latest
      valid finishers finish at the same instant — select from the union and
      the emitted `resourcePredecessorId` must belong to a pool other than
      `capacityTeamId`, failing the case.
- [ ] 4.12 `CACHE_DTO_VERSION`, `encodeSchedule`, `decodeSchedule`
      in `libs/domain`: both `Map`s become arrays of entries sorted by key, and
      `waitingForPerson`, `waitingForCapacity` and `eventsVisited` are stored,
      because `JSON.stringify` renders a `Map` as `{}` and an implementation
      could pass every type-level test and store a row that reloads empty.
      `decodeSchedule` throws naming the defect on an unknown `dtoVersion`, a
      duplicate key, a key disagreeing with its entry's own slice key, or a
      missing projection. **Watched red:** a non-empty round trip through
      SQLite and the real plan read, plus those three negatives.

## 5. The `wbs-solver` Python package

- [ ] 5.1 New versioned package with a lock file, OR-Tools CP-SAT declared, one
      `solve` entrypoint over stdin/stdout. No import surface, no daemon, no
      port. Version readable by the coordinator for `contractVersion`. The
      entrypoint calls `prctl(PR_SET_PDEATHSIG, SIGKILL)` **before** reading
      stdin, so a reparented child dies with its parent rather than waiting to
      be found. In production this is a **re-assertion**, not the first
      install: 6.2b's launcher wrapper sets it before the bind and the setting
      survives the `exec` onto the same pid (Fable r14 Minor 4). It is kept as
      defence in depth for the direct-spawn smoke test, where no launcher ran.
- [ ] 5.2 Objectives, stated as executable mathematics rather than prose:
      `MAKESPAN = max finish`; `PRIORITY = Σ priorityWeight(s) · finish(s)`;
      `MOVEMENT = Σ |start(s) − baselineOffsets[s]|`. PRI minimizes
      `(PRIORITY, MAKESPAN, MOVEMENT)`, Time minimizes
      `(MAKESPAN, PRIORITY, MOVEMENT)`, each by **staged optimization** —
      optimize a term, then constrain it for the later stages **exactly as
      the design's stage-status matrix says and never otherwise**: an equality
      only when the stage proved OPTIMAL, `term <= incumbent` for FEASIBLE and
      for UNKNOWN-with-incumbent, stop-and-publish-the-previous-incumbent for
      UNKNOWN-without at a later stage, `no-solution` for UNKNOWN-without at
      the first stage, `plan-infeasible` for INFEASIBLE at the first stage, and
      `invalid-output` for INFEASIBLE at any later one. That
      matrix is the single authority; this task restates none of it. Never a
      weighted sum, which overflows on realistic horizons. Neither is a total order; ties
      exist and are not broken reproducibly in production.
- [ ] 5.3 **Proven by** the Python suite (CI only) — unit: each of the three
      cost terms computed on a hand-built instance, both stagings, request
      parse round-trip, response serialization.
- [ ] 5.4 **Proven by** the oracle cases: 2–6 slice hand-verified instances with
      known optimal offsets per objective, including one where PRI and Time
      disagree, one exercising `notBeforeUnits`, one exercising a two-pool
      slice, and one exercising an intra-item step-order edge. The solver
      reproduces each exactly.
- [ ] 5.4b **Bounded CPU and memory per child, with values** (Sol r12
      Important 4; Sol r13 Important 3). The process ceiling bounds processes, not resources:
      CP-SAT starts its own search workers and grows until something kills
      it. Production solves set `num_search_workers` from
      `solverSearchWorkers` (default 2); the pinned determinism config keeps
      1. Every child runs under `solverMemoryLimitMb` (default 512 MB),
      enforced outside the solve — a per-child cgroup/systemd `MemoryMax=`
      scope as the deployment mechanism, with the coordinator classifying a
      crossing as `oom` only from the scope's `memory.events`
      `oom`/`oom_kill` evidence (or the systemd kill result), because
      CP-SAT allocates in native C++ and an overrun can abort with no
      catchable Python exception; the wrapper's `RLIMIT_AS` pre-exec is a
      best-effort backstop only (address space, not RSS) and does not by
      itself classify. A native abort with no OOM evidence is
      `internal-error`, never `oom`. Record the implied fleet worst case
      (16 × 2 = 32 CP-SAT search workers, ~8 GB solver RSS) as a deployment
      obligation beside the ceilings.
      **Proven by** `solver-resource-limits.proc.test.ts`: the effective
      `num_search_workers` read from a real spawned production solve equals
      `solverSearchWorkers`; a fixture that forces native CP-SAT allocation
      past the limit is killed, the scope's `memory.events` evidence
      produces the `oom` classification, the coordinator survives, the slot
      is released, and exactly one `failed` marker with `failureReason:
      'oom'` is stored; a separate generic crash without OOM evidence is
      stored `internal-error`, never `oom`.
      **Watched red:** remove the memory limit and the overrun case must
      grow past the ceiling without producing `oom`; remove the
      `num_search_workers` setting and the effective-configuration assertion
      must fail.
- [ ] 5.5 **Proven by** the determinism case under the pinned config only —
      `num_search_workers=1`, fixed `random_seed`, and CP-SAT's
      **deterministic** time limit, never a wall-clock assertion. Production is
      multi-worker wall-clock and explicitly not reproducible; the case asserts
      the pinned config alone.
- [ ] 5.6 **Proven by** the budget case, built to be flake-free: a deterministic
      limit small enough that the instance is provably unsolved at it (an
      instance whose search tree is measured, not guessed) returns `feasible`,
      never `optimal`, and never crashes. A wall-clock "too small" budget is not
      a guarantee and is not used.
- [ ] 5.7 **Negative check, watched red** — let the solver read the wall clock
      instead of `baselineOffsets` and watch 5.4's oracle case fail; separately
      collapse the staged optimization into a weighted sum and watch the
      PRI/Time-disagree oracle fail. `Proof:` comment names each fault. Any
      input the hash does not cover breaks cache identity, and a weighted sum
      silently reorders the terms.
- [ ] 5.8 Staged optimization implements the exact anytime rule:
      `STAGE_BUDGET_SPLIT = [0.60, 0.25, 0.15]` with early remainder donated
      forward; OPTIMAL fixes an equality; FEASIBLE or UNKNOWN-with-incumbent
      adds `term <= incumbent` (**never** an equality — fixing an unproven
      incumbent is not lexicographic minimisation). **Every remaining outcome
      defers literally to design.md's stage-status matrix, which is the single
      authority** (Sol r7 Critical 2); this task states no rule of its own,
      because the two that were stated here contradicted it. In particular:
      UNKNOWN with no incumbent reports `no-solution` **only at stage 1** and at
      `k > 1` publishes the previous stage's incumbent, and INFEASIBLE reports
      the typed state `plan-infeasible` **at stage 1 only** — effective
      deadlines enter before the objective terms, so stage 1 is the one stage
      whose infeasibility can be the user's plan — and `invalid-output` at
      every later stage, since stage 1 already produced a deadline-satisfying
      incumbent and every later stage only adds inequalities to a
      feasible model. The published result is the last stage's incumbent,
      feasible by construction. <!-- wire-fields:objective-term -->`objectiveValues` reports the
      **four**-field per-term shape `{ value, stageValue, bound, status }` exactly as
      `solver-wire.v1.json` and design.md's matrix define it; `value` is the
      term on the published offsets (2.4), `stageValue`/`bound`/`status`
      describe the stage **and are null where the stage produced none** — the
      matrix's `k > 1` UNKNOWN-without-incumbent row writes
      `{ value: <recomputed>, stageValue: null, bound: null, status: 'unknown' }`
      for `Tₖ` and every later term, so "describe the stage" is never a
      requirement that they be populated. **This task previously wrote a three-field shape and
      deferred `value` to a nonexistent 5.8b (Sol r8 Critical 4)** — an
      implementation instruction that contradicted 2.4 and the schema on both
      the field list and, in the long-form note, on the accepted outcome set.
      No task, design paragraph or note prose spells an alternate request or
      response field list; 2.1 is the single normative definition and every
      other mention points at it.
- [ ] 5.9 The **quantised** Fast baseline is supplied as both a CP-SAT solution
      hint and an upper bound on stage 1's term. That bound holds **only in the
      quantised model** (Sol r10 Critical 3): it guarantees the solver never
      returns a quantised primary worse than quantised Fast's, and it says
      nothing about the real domain, because rounding `days / width` up can
      itself cost more than the search wins. The real no-worse-than-Fast
      guarantee is made by **task 4.11b's publication guard**, not here.
      **Watched red:** remove the bound and run a fixture where the search's
      first incumbent is worse than quantised Fast on that term.
- [ ] 5.10 Replace 5.7's weighted-sum mutation, which could stay green: on a
      bounded 2-6 slice fixture, sufficiently large coefficients encode the
      same lexicographic order exactly, so PRI/Time disagreement proves
      nothing about staged versus weighted. The mutation instead substitutes
      the implementation's **own** coefficient constants into a fixture built
      so the second term's swing exceeds the first term's coefficient gap —
      an answer that necessarily changes — plus a separate integer-overflow
      guard test for the weighted form's bound.
- [ ] 5.11 Packaging into the deployed artifact: the Dagger/image path installs
      the pinned Python runtime and the locked OR-Tools environment, copies
      the package and **both** its console scripts — the solve entrypoint
      `wbs-solver` and the lifecycle launcher `wbs-solver-launcher` (6.2b) —
      into the be-01 runtime, and exposes the installed version to the
      coordinator as the `solverVersion` half of `contractVersion`. An Nx
      target runs the Python suite in the gate. **Both scripts are proved from
      the built image (Fable r14 Important 3):** the existing direct spawn of
      the solve entrypoint stays as the package smoke test, and a second proof
      spawns `wbs-solver-launcher` and drives the production path through a
      real bind. Without it a green gate coexists with an image whose launcher
      is absent, which fails every production solve at bind time — the exact
      packaging failure this task exists to close.
      **Watched red (two):** build the image without the package; the spawn proof
      must fail with `internal-error` rather than silently falling back. Then
      build it with the solve entrypoint but **without** the launcher: the
      smoke test still passes and the launcher-path proof must fail.

## 6. OptimizationCoordinator — admission, spawn, cancel, restart

- [ ] 6.1 Coordinator in `apps/be-01/src/service/`: with the toggle ON, publish
      Fast, consult the cache, and request admission for variants **absent at
      the current full key** — on a debounced edit *and on a read*. A read
      admits an absent variant, which is how an enabled project recovers after
      a restart, a contract-version bump or a cache eviction without waiting
      for someone to type; it **never** auto-admits a variant holding a
      `failed` or a `corrupt` row for that exact key, and a same-hash edit is
      suppressed for those two terminal rows only. **This replaces the earlier
      "never on a read" wording (Sol r8 Important 9)**, which contradicted 6.6,
      the spec's two-concurrent-first-reads scenario and the design's selection
      rule, and would have left a cold enabled project on Fast for ever. Child
      killed at `solverBudgetMs + 5000`; a result is written only under the
      generation predicate of 4.1.
- [ ] 6.2 **Admission in SQLite, not memory**: one transaction that reclaims
      slots whose stored `admittedDeadlineAt` has passed, refuses at 4 rows for
      the project and 16 rows globally counting **every** unreleased row
      including those already asked to cancel, rejects unless the matching
      generation has `admissionState='open'` and the project has no
      `optimization_delete_pending_at`, then inserts the
      `(projectId, contractVersion, generation, objective, budgetMs)` slot with
      `ON CONFLICT DO NOTHING` so concurrent cold reads coalesce to one spawn,
      stamping a fresh 128-bit `attemptToken` and
      `admittedDeadlineAt = startedAt + budgetMs + 5000 +
      SLOT_RECLAIM_MARGIN_MS` **from the admitting coordinator's own budget**.
      **The insert is `lifecycle='starting'` with a NULL `pid` (Sol r12
      Critical 2)** — the PID does not exist at reservation time, and the
      reservation is what the ceiling counts, so a `starting` row counts
      against 4 and 16 identically to a `running` one and expires by the same
      `admittedDeadlineAt`.
      Expiry is read from that column and never recomputed from the observing
      coordinator's config. `ownerId` is a UUID minted at coordinator boot;
      `heartbeatAt` is refreshed every 5 s for live slots and the row is
      deleted when the child exits. **This is the whole admission protocol
      (Sol r8 Critical 3).** The earlier text here named the three-column key
      `(projectId, generation, objective)` and a `budgetMs + 30s` reclaim, both
      superseded by 3.2 and 6.10–6.11; an implementer following it would have
      lost the blue/green, cancellation and old-owner fences the design calls
      mandatory. No alternate key shape or reclaim rule is restated anywhere in
      this plan.
- [ ] 6.3 `solver_queue` FIFO ordered by `enqueuedAt`, then `projectId`, then
      `contractVersion`, then `objective`, then `budgetMs` — the trailing terms
      are what make the order total, because a project's PRI and Time entries
      can share a timestamp and blue and green can enqueue the same project and
      objective in that same millisecond (Sol r7 Minor 15) — one entry per
      `(projectId, contractVersion, objective, budgetMs)`, the row carrying
      `budgetMs` because the dequeue cannot otherwise say which budget to
      launch (Sol r8 Critical 2). Enqueue **persists the cancel
      epoch it was admitted under** as `admittedCancelEpoch`; without a stored
      epoch the dequeue re-check has nothing to compare against (Sol r7
      Important 8). Dequeue re-reads the `optimization_generation` row and
      discards the entry without launching if its generation is no longer
      current, `admissionState != 'open'`, `cancelEpoch != admittedCancelEpoch`,
      the project's toggle is no longer ON, or
      `optimization_delete_pending_at` is non-null. **Watched red:** enqueue PRI and Time at the identical
      timestamp and assert a single deterministic dequeue order; enqueue the
      same project and objective from two contract versions at that same
      timestamp and assert the same; toggle OFF while an entry is queued and
      assert it is discarded without a spawn; drop `admittedCancelEpoch` and
      the OFF-while-queued case must fail.
- [ ] 6.4 Cancellation, and the two paths are **not** the same operation. A
      newer edit changes the hash and therefore allocates the next generation.
      An **OFF toggle does not**: the toggle is excluded from the hash, so
      allocation is required to reuse the generation for an unchanged hash and
      "OFF allocates the next generation" was unimplementable. OFF is one
      transaction that clears `optimization_enabled`, increments `cancelEpoch`
      for every contract version of the project, sets `cancel_requested_at` on
      all of that project's `solver_slot` rows and deletes its queue rows.
      Owners observe the durable signal on their heartbeat round trip and kill
      their child, so a child owned by the *other* backend is cancelled too — a
      local process handle cannot reach it and `PR_SET_PDEATHSIG` is irrelevant
      while that coordinator is alive. Both paths reject with a typed
      `cancelled` outcome and write no row. Idempotent and project-scoped.
- [ ] 6.4b **Proven by** `optimization-cancel.two-coordinator.test.ts`: blue
      owns a live PRI child and a live Time child, green serves the settings
      PATCH turning optimization OFF. **Watched red** with the epoch condition
      removed: both real children exit within one heartbeat interval, and
      neither can store a result, write a failure marker, or emit any event.
- [ ] 6.2b **Spawn handshake: reserve, spawn, bind, fence** (Sol r12
      Critical 2; Sol r13 Critical 1; Fable r14 Important 3). **The launcher's seam, which no
      task named until now:** it is created by this task as a second console
      script `wbs-solver-launcher` in the **same** `wbs-solver` distribution —
      not a be-01 file and not a separate package — because it must be present
      wherever `wbs-solver` is, must version-lock to it (both sides of the bind
      protocol change together), and the image build already installs exactly
      that one distribution. It imports no CP-SAT. `wbs-solver` remains the
      only *solve* entrypoint; spec.md's "exactly one entrypoint" is scoped to
      the solve contract accordingly, and 5.11 installs and proves both scripts.
      *Assumption, falsifiable:* if the launcher ever needs a dependency the
      solver distribution must not carry, split it into its own version-pinned
      package and give 5.11 a second install proof. After 6.2's `starting` insert the coordinator spawns a small
      **lifecycle launcher** — a distinct entrypoint, not `wbs-solver`
      itself — with `--attempt-token` and `--child-deadline-epoch-ms` as
      **argv**, never as request fields — both are clock/identity derived and
      would destabilise the golden corpus and reopen the no-clock rule. The
      launcher's **lifecycle wrapper** (distinct from the deterministic
      solve, which still reads no clock, database or environment) arms that
      absolute instant, installs `PR_SET_PDEATHSIG`, re-checks `getppid()`,
      then blocks on stdin for the bind verdict **before reading the
      request**. The coordinator binds with
      `UPDATE solver_slot SET pid=:pid, lifecycle='running' WHERE <key> AND
      attempt_token=:token AND lifecycle='starting'` (with `:pid` the
      launcher's); one row means `bound`, after which the launcher
      **`exec`s `wbs-solver` in place** — the same pid — so `wbs-solver`
      first exists only after its row is `running`; zero rows means `abort`
      plus kill and no further admission on that token. The launcher exits
      **without `exec`ing** on `abort`, a closed stdin, or
      `BIND_TIMEOUT_MS = 5000`, so no `wbs-solver` process is ever created.
      **Proven by** `optimization-spawn-handshake.proc.test.ts`, a real
      two-coordinator process test that pauses the owner between the
      `starting` insert and the bind while time advances past the row's
      stored `admittedDeadlineAt` (not merely past the reclaim margin), lets
      the peer reclaim and admit a replacement whose launcher binds and
      `exec`s `wbs-solver`, and samples the real OS `wbs-solver` process
      count throughout: the delayed bind matches zero rows, its launcher
      exits without `exec`ing so no `wbs-solver` is created, and the sampled
      count of live `wbs-solver` processes never exceeds the `running` row
      count nor 4 per project / 16 globally.
      **Watched red:** let the launcher `exec` `wbs-solver` without waiting
      for the bind verdict — or drop the `lifecycle='starting'` predicate
      from the CAS — and the paused-owner case must show two live
      `wbs-solver` processes against one reclaimed slot.
      **Second case, the verdict that never arrives:** the test above proves
      only the *zero-row* path, where a live coordinator writes `abort`. Add a
      case whose coordinator neither binds nor aborts and stays alive, so
      `PR_SET_PDEATHSIG` never fires: assert the launcher exits on its own
      after `BIND_TIMEOUT_MS = 5000` with stdin still open, that no
      `wbs-solver` process is created for that token, and that the `starting`
      row is reclaimed by `admittedDeadlineAt` and not by a live holder.
      **Watched red:** remove the timeout and let the launcher block on read —
      the launcher must still be alive when the assertion runs.
      **Fourth trigger, the bind into a spent budget:** reclamation is
      `now > admittedDeadlineAt` and runs only inside sweeps, so an owner
      paused between `childDeadlineAt` and `admittedDeadlineAt` — a
      `SLOT_RECLAIM_MARGIN_MS`-wide window against an unswept row — still
      binds with its token intact and its budget already spent. The launcher
      SHALL treat a `bound` verdict with `now >= childDeadlineAt` as abort and
      exit without `exec`ing, because a non-positive duration is undefined at
      both arming mechanisms. Add the case to this proc test: pause the owner
      into that window, let the bind succeed, assert no `wbs-solver` process is
      created and the slot is released. **Watched red:** arm the child anyway
      with the non-positive remainder — the test must show either a
      `wbs-solver` process or an unbounded one.
- [ ] 6.5 Restart: nothing resumed, no queue rebuilt. Orphan handling is not a
      PID search — 5.1's `PR_SET_PDEATHSIG` kills the child, slot expiry
      restores capacity, and the container/cgroup boundary is recorded as a
      deployment obligation. Startup **does** run 3.9b's
      `reconcileOptimizationDrains()` once before serving and then on its
      interval; that is the only startup sweep, and it resumes no solve
      (Sol r12 Critical 3).
- [ ] 6.6 **Proven by** `optimization-coordinator.test.ts`, asserting on an
      injected spawner rather than timing: a cold input spawns exactly two; a
      full hit spawns none; **two concurrent first reads spawn exactly one per
      objective**; a second edit mid-solve kills the old pair (asserting the
      child process actually exited, not that a flag was set) and writes no
      stale row; the per-project count never exceeds 4 during termination
      overlap; the queue discards a stale-generation entry at dequeue; the
      queue discards a still-current-hash entry whose project toggled OFF while
      queued.
- [ ] 6.7 **Proven by** `optimization-admission.db.test.ts`: **two coordinator
      instances against one SQLite file** — the blue/green case — admit 16
      children between them, not 32, and 4 for one project, not 8; and a
      coordinator killed without cleanup has its slots reclaimed once
      `now > admittedDeadlineAt` — never by a missed heartbeat — rather than
      leaking capacity forever.
- [ ] 6.8 **Proven by** `optimization-orphan.proc.test.ts`, a **real
      process-boundary test**, not a mocked restart: spawn an inert child that
      calls `PR_SET_PDEATHSIG`, kill the coordinator process, and observe (a)
      the child terminates and (b) the slot is reclaimed once its stored
      `admittedDeadlineAt` passes and the count recovers.
- [ ] 6.9 **Negative checks, watched red** — remove the dequeue generation
      re-check and watch 6.6's stale-entry case fail; remove the toggle
      re-check and watch the toggled-OFF case fail; move admission back into an
      in-memory counter and watch 6.7's two-instance case fail; drop
      `PR_SET_PDEATHSIG` and watch 6.8 fail. Four faults, four `Proof:`
      comments, because one check passing does not prove the others exist.
- [ ] 6.8b **Restart semantics, one implementable rule** (Sol r10 Important 7).
      `optimization-restart.db.test.ts`: (a) an in-flight child is never
      adopted or resumed by the restarted coordinator; (b) a durable
      `solver_queue` entry whose generation is current, whose
      `admittedCancelEpoch` matches and whose project is still ON **survives
      the restart and launches** — it is not discarded, and the earlier
      "entries left by a dead process are discarded by the generation
      re-check" claim was unimplementable; (c) an entry failing any one of
      those three predicates is discarded without a spawn; (d) a restart with
      an unchanged plan **reuses** the generation rather than allocating a new
      one, matching 6.10's allocation rule; (e) an absent variant is
      re-admitted in that same generation only once any orphan `solver_slot`
      row for its key is released or passes its stored `admittedDeadlineAt`.
      **Watched red:** drop (e)'s orphan wait and the restarted coordinator
      must spawn a duplicate beside a still-live child, breaking the sampled
      per-project ceiling; separately, make the restart allocate a fresh
      generation and (d) must fail against 6.10.
- [ ] 6.9c **Four eviction authorities, four separate reds** (Sol r10
      Important 9). The four-part `(generation, cancelEpoch, enabled,
      attemptToken)` predicate governs **worker-owned outcome writes only**;
      three other paths evict under their own authority and have no child
      token to present. Each gets its own test and its own watched red, so
      weakening one cannot silently weaken another: (a) *worker outcome* —
      drop the `attemptToken` term and a reclaimed-then-superseded owner's
      late store must succeed where it should have matched zero rows;
      (b) *allocation eviction* — require a token in the allocation
      transaction and the cold-start hash change must fail outright, since no
      child exists yet; (c) *OFF cleanup* — require a token in the
      `optimization_enabled = 0` transaction and the queue rows must survive
      the toggle; (d) *deletion/retirement eviction* — require a token in the
      drain protocol and 3.9b's phase 2 must fail. Assert in (b), (c) and (d)
      that the eviction is authorized by the CAS, the epoch increment and the
      drain phase respectively — not by a token.
- [ ] 6.9b **The empty project bypasses both solvers** (Sol r7 Important 12).
      A project with no slices is legal — `schedule` handles it explicitly with
      `projectFinish = Math.max(0, ...placedFinishes)` and empty maps — but
      `MAKESPAN = max finish` has no empty-set identity, so it was undefined on
      a plan the product allows. `horizonUnits` is **not** a second reason: its
      `notBeforeUnits` max is seeded with zero (task 2.2; its overflow check is
      2.10 — task 2.3 is `parseSolverResponse` and never built the horizon,
      Sol r13 Minor 5), so it is defined for
      every plan, including one with slices and no manual floors — the common
      case (kimi r10 Minor 4). The coordinator short-circuits: a
      canonical input with zero slices, or one whose durations are all zero,
      allocates no slot, spawns nothing, writes no cache row and emits no
      event; the plan read returns Fast with every variant `idle`. **Watched
      red:** a cold read with optimization ON and zero work items — no call on
      the injected spawner, no row, no event, and a renderable payload; then
      add and delete the only work item and assert the same, since that
      transition is what would otherwise leave a stale row. Remove the
      short-circuit and the spawner assertion must fail.
- [ ] 6.10 Generation allocation is one transaction against the
      `optimization_generation` row for `(projectId, contractVersion)`, and
      there is exactly one allocation algorithm in this plan — 4.1's (Sol r7
      Critical 4). Equal `inputHash` reuses the generation; a different or NULL
      hash sets the hash and increments under
      `WHERE project_id = :p AND contract_version = :c AND generation = :seen`,
      deleting that contract version's previous-generation **cache and queue**
      rows in the same transaction and marking its `solver_slot` rows
      `cancel_requested_at` **without deleting them**, so the row count stays
      an upper bound on live children. A first enable, or the first appearance
      of a new `contractVersion`, has no row to compare against: allocation
      therefore begins with an `INSERT … ON CONFLICT DO NOTHING` of
      `(generation = 1, inputHash = :H, cancelEpoch = 0)` and re-reads, so two
      concurrent first writers coalesce onto one generation rather than one
      failing (Sol r7 Important 8).
      **Watched red:** two concurrent allocators for one hash must produce one
      generation and one child per objective; two concurrent *first* allocators
      for a project that has never optimized must produce one row and one
      child per objective; an allocator for a different hash must not coalesce
      onto the current slot; a restart on an unchanged hash must allocate
      nothing; and deleting the slot rows at allocation must make 6.7's
      two-instance ceiling case fail.
- [ ] 6.11 Slot fencing: admission mints an unforgeable 128-bit
      `attemptToken`; heartbeat, release, the outcome write and the event write
      all carry it, and 6.2b's bind CAS is the first statement that presents
      it. The two deadlines are deliberately different:
      `childDeadlineAt = startedAt + budgetMs + 5000`, armed for that earlier
      instant **twice — inside the child and outside it (self-found, round
      10)**: the wrapper passes `childDeadlineAt − now` as CP-SAT's
      `max_time_in_seconds` so a progressing solve stops itself and returns a
      publishable partial, and the per-child systemd scope (the same scope
      5.4b's memory limit requires) carries `RuntimeMaxSec` for that instant so
      the child is `SIGKILL`ed whether or not it can act. **A Python `SIGALRM`
      alone is not sufficient and must not be written as the mechanism:**
      `wbs-solver` is a Python package, the handler runs only when the
      interpreter regains the GIL, and `CpSolver.Solve()` is one long native
      C++ call — the same reason 5.4b moved the memory bound outside the solve.
      SQLite alone stores and observes
      `admittedDeadlineAt = childDeadlineAt + SLOT_RECLAIM_MARGIN_MS` (15 s).
      Reclamation mints a new token and is exactly `now > admittedDeadlineAt`,
      using the absolute value stamped once at admission from that row's own
      `budgetMs` (6.2), so the **external** kill lands a full margin before the
      row can release capacity — the exit half of 6.2b's ceiling, which would
      otherwise rest on a wedged process honouring its own bound.
      **Watched red:** arm the deadline only in-process, run a fixture whose
      native solve ignores it past `admittedDeadlineAt`, and assert the live
      `wbs-solver` count exceeds the `running` row count. **`SLOT_HEARTBEAT_TTL_MS` is struck (Sol r9
      Critical 4):** a TTL derived from the observing coordinator's current
      `solverBudgetMs`, or added to a refreshed `heartbeatAt`, is not the admitted
      child's absolute deadline, and across a 60 s/120 s blue-green overlap it
      either reclaims a live child or holds a dead slot past the promised bound —
      either way the claim that SQLite rows upper-bound live processes fails.
      `heartbeatAt` survives for cancellation observation and diagnostics only.
      **Watched red:** change the observing coordinator's configured budget and
      assert neither row's expiry moves.
      `PR_SET_PDEATHSIG` is followed by a `getppid()` re-check so a parent dying
      inside that window is not missed. **Watched red:** a real child is observed
      gone before a sweep at `admittedDeadlineAt` deletes its slot and admits a
      replacement; arming the child at `admittedDeadlineAt` must make that test
      fail. An old owner's late heartbeat, release and write each match zero
      rows; sampled OS process count never exceeds 4 per project or 16 globally
      across rapid generations under two coordinators.

## 7. Failure path and events

- [ ] 7.1 Non-zero exit, timeout, OS kill, OOM and failed re-validation each
      write exactly one `status='failed'` row with a typed `failureReason`
      (`timeout | invalid-output | no-solution | internal-error | oom | horizon-overflow | objective-overflow`), keep
      Fast visible, and never retry — not on a timer, not on a read, and not on
      a same-hash edit. A **cancelled** run writes no row at all. Failure is
      variant-specific. **"Publish nothing" is struck** (Sol r7 Important 14):
      in this codebase `GatewayBroadcaster.publish` *is* the event operation, so
      the phrase read as a prohibition on the failure event that 7.4 and 7.6
      require. The rule is exact — a failure publishes **no**
      `schedule_optimized` and stores no schedule, and it **does** publish
      exactly one `schedule_optimization_failed` in the same transaction as its
      marker row, including for a pre-spawn `horizon-overflow` or
      `objective-overflow`.
- [ ] 7.2 `schedule_optimized` added to `ProjectEvent` in
      `apps/be-01/src/service/broadcast.ts`, carrying `(projectId, generation,
      inputHash, objective, contractVersion, budgetMs)` (7.7). **The cache row
      and the `event_log` record are written in one SQLite transaction** and the
      broadcaster pushes from the committed record, so the guarantee is one
      durable replay record per newly stored outcome plus one best-effort
      post-commit push (7.9), idempotent for receivers. Never emitted on a
      cache hit.
      Toggle/Engine/Objective changes emit `project_settings_changed` (3b.3)
      instead.
- [ ] 7.3 Retry is a route, not an unnamed "action": its contract, statuses
      and authorization are 7.11. It re-reads the current `inputHash`, refuses
      a moved plan with the current hash in the body, then launches only the
      `failed` or `corrupt` variant for the unchanged key — an **absent** variant is `idle`, admitted by the cold read (6.1) rather than by Retry, which answers `409 not-retryable` naming it (Sol r9 Critical 3). Its `failed` row is
      **overwritten by the replacement outcome, never deleted first**, so
      concurrent reads see `retrying` rather than `failed` or a cold miss that
      would auto-spawn.
- [ ] 7.4 **Proven by** `optimization-failure.test.ts` and
      `optimization-events.test.ts`: each of the seven failure kinds — including the two pre-spawn ones, `horizon-overflow` and `objective-overflow`, which write the marker and emit the failure event although no process ever started — keeps Fast
      and writes exactly one failed row; a **cancelled** run writes none; PRI
      failing leaves Time selectable; a stored result writes exactly one
      `event_log` row with the right payload; **a crash injected between the
      cache write and the event write leaves neither** (asserted on the
      `event_log` row, not on a broadcaster spy); a cache hit emits nothing; an
      Objective switch emits `project_settings_changed` and no
      `schedule_optimized`; Retry after a hash change starts a fresh generation
      rather than the stale variant.
- [ ] 7.5 **Negative checks, watched red** — emit `schedule_optimized` on a
      cache hit and watch the "cache hit emits nothing" case fail; then split
      the cache write and the event write into two transactions and watch the
      crash-injection case fail. Two `Proof:` comments. A broadcast per read
      would make every collaborator refetch unchanged data; a split write is a
      result nobody is told about.
- [ ] 7.6 A newly written failure marker emits `schedule_optimization_failed`
      in the same transaction as the row, carrying `(projectId, generation,
      inputHash, objective, contractVersion, budgetMs, failureReason)` and no
      schedule. Without it the read returns Fast, success emits
      `schedule_optimized`, and failure emitted nothing — so a client on
      screen sat at `Optimizing…` for ever and manual-only Retry was
      unreachable. A cache **hit** still emits nothing; a hit is not a new
      outcome. **Watched red:** both variants fail with no other event; the
      client must reach `Optimization unavailable · Retry` with no refresh.
- [ ] 7.7 `budgetMs` joins both event identities. It is a cache-key column and
      changes neither hash nor generation, so without it a larger-budget
      result announced itself under the smaller-budget identity and a client
      holding that identity ignored the only notice that should move it.
      **Watched red:** raise the budget, store, assert the client refetches.
- [ ] 7.8 Name the seam rather than assume it: `EventLogRepo.recordEventIn(tx,
      subscription, message, createdAt)` writes inside the caller's
      transaction, and `GatewayBroadcaster.pushRecorded(subscription,
      recorded, event)` buffers and pushes an already-recorded sequence
      without recording it twice; today `recordEvent` opens its own
      transaction and `publish` does both. `publish` becomes those two calls.
- [ ] 7.9 The guarantee is narrowed in every artifact to **one durable replay
      record plus one best-effort post-commit push** — `event_log` is a replay
      buffer consulted on resume, not a dispatched-and-acknowledged outbox,
      and a process can die after commit and before the push, so "delivered
      at least once" over a live socket was false. **Watched red:** kill
      between commit and push; the record must exist and a client resuming
      from its last sequence must receive it.
- [ ] 7.10 The plan-read DTO: `tree()` returns an `optimization`
      block — `enabled`, `engine`, `objective`, `inputHash`, `generation`,
      `contractVersion`, `budgetMs`, `displayed`, `variants: { pri, time }`,
      `comparison` present iff `displayed !== 'fast'`. A variant is one of seven:
      `ready`, `pending`, `retrying`, `failed` with reason, `corrupt` with the
      decoder's message, `plan-infeasible` with every offending work item and its
      **effective** deadline, or `idle`, distinguished by the cache row **together
      with** a live slot or queue entry matched on the **full** key including
      `budgetMs` — which is
      what lets a retry in flight read as `retrying` while its marker row
      survives, instead of forcing either a permanent "unavailable" or a
      delete that would make the next read auto-spawn. Arrays hold Fast unless
      the selected variant is `ready`. `corrupt` renders the same
      `Optimization unavailable · Retry` control as `failed`; the round-7
      disposition added it to spec.md and left this union, the design's
      `VariantState` list and 8.3–8.4 at five members (Sol r8 Critical 6).
      `plan-infeasible` renders `Plan infeasible · N work item deadlines` and
      **no** Retry control, and Retry answers `409 not-retryable` for it — the
      same divergence trap, so this union, the design's `VariantState` list,
      spec.md and 8.3–8.4 move to seven together or the gate is red.
      **Proven through the real controller payload** in the cold, queued,
      retrying, failed, **corrupt**, **plan-infeasible**, partial-success and
      full-hit states.
- [ ] 7.11 `POST /api/projects/:projectId/optimization/retry`, body
      `{ objective, inputHash }`, under the same project-write authorization as
      the settings PATCH, running the ordinary admission transaction so two
      concurrent retries produce one child. `202` with the new state,
      generation and hash; `409 stale-input-hash` carrying the current hash;
      `409 already-running` evaluated against the **full** cache key including
      `budgetMs`; and a single `409 not-retryable` naming the current state for
      everything else. **Retry accepts a `failed` row or a `corrupt` one (Sol
      r8 Critical 6)** — a corrupt row is a `status='ok'` row, so the earlier
      `not-failed` guard forbade the only recovery path 4.8 and the codec
      requirement offer it. The marker or corrupt row is never deleted before
      its replacement outcome commits, and is then overwritten exactly once.
      **Watched red:** two concurrent Retries on one corrupt row must produce
      one child with both responses `retrying` and the bad row intact until the
      replacement commits; a Retry against a `ready` variant must return
      `not-retryable` naming `ready`; restore the `not-failed` guard and the
      corrupt-row Retry case must fail. A Retry against a `plan-infeasible`
      variant must likewise return `not-retryable` naming `plan-infeasible`:
      admitting it would spend a slot re-proving the same certificate and put a
      Retry affordance on an answer that cannot change.

## 8. UI — toggle, selectors, indicator

- [ ] 8.1 Project Settings hidden toggle bound to `optimization_enabled` (3b),
      OFF by default, project-scoped and persisted through the PATCH contract —
      **not** component-local state.
- [ ] 8.2 Engine (Fast / Optimized) and Objective (Priority-first /
      Finish-first) selectors bound to `schedule_engine` and
      `schedule_objective`, project-scoped and persisted. Switching to an
      already-cached output starts no solve. Both react to an incoming
      `project_settings_changed` event so collaborators converge.
- [ ] 8.3 The one compact indicator: Earlier by N days / Later by N days / Same
      deadline + reordered / Same deadline + same order, plus
      `Optimization unavailable · Retry` on **both** the `failed` and the
      `corrupt` variant states (Sol r8 Critical 6 — the round-7 disposition
      added `corrupt` to spec.md and left this list at five states),
      `Plan infeasible · N work item deadlines` on the `plan-infeasible` state
      with **no** Retry control and the offending items listed on demand, and
      `Optimizing…` while the selected variant is admitted but not stored — with Fast on screen
      throughout, never a blank plan or a spinner over it. No toast, no modal,
      no timer retry, no second indicator. On `plan-infeasible` the indicator
      SHALL NOT fall back to reading Fast's late plan as a satisfied baseline:
      Fast stays on screen, stays usable, and stays labelled `Late by N
      workdays` per missed item — Fast's lateness is a report, never a verdict
      of feasibility (`openspec/changes/work-item-deadline/design.md` §3.1).
- [ ] 8.4 **Proven by** `optimization-indicator.test.tsx` and
      `optimization-settings.test.tsx`: each of the four comparison outcomes
      renders its exact wording with the right day count; a `failed` variant
      renders Retry; a `corrupt` variant renders the **same** Retry control; a
      `plan-infeasible` variant renders the count wording, lists its offending
      items on demand, and renders **no** Retry control while Fast stays on
      screen with its per-item `Late by N workdays` labels intact; a
      pending variant renders `Optimizing…` over Fast offsets;
      no toast or modal role appears in the tree in any of those states; a
      toggle change issues the PATCH and **survives a remount** (proving it is
      persisted, not local); and an incoming `project_settings_changed` moves
      the selector without a local click.
- [ ] 8.5 **Negative check, watched red** — hold the three settings in
      component state instead of the project row and watch 8.4's remount and
      incoming-event cases fail. `Proof:` comment names the reverted binding.
      Local-only controls are exactly the failure the persistence slice exists
      to prevent.
- [ ] 8.6 A user-facing feature: file one lane-q Browser Use Cloud QA task after
      deploy.
- [ ] 8.7 `sameOrder(a, b)` is the exact relation, computed server-side on the
      **materialised** schedules and shipped as one boolean beside the
      day-count delta: it holds iff for every pair of slices present in both,
      `sign(startA(s) - startA(t)) === sign(startB(s) - startB(t))` compared in
      the **real fractional-workday domain**, never in quantised units (Sol r7
      Important 10) — real Fast's starts need not lie on the 1/48 grid, so two
      distinct Fast starts can collapse to one unit and rounding can reverse a
      tie, and the quantised rule would then label the same pair differently
      from design.md and the spec. It is blind to a uniform shift and to
      iteration order, and it treats ties as first-class — a tie broken and a
      tie created are both reordered. **Watched red / scenarios:** uniform
      two-day shift (same order, later deadline); a tie broken (reordered); a
      tie created (reordered); a zero-duration slice moved across another's
      start (reordered); and a **fractional fixture whose verdict differs
      between the two domains** — two slices 1/96 of a workday apart, same
      order in the real domain and tied after quantisation — which is the only
      case that proves the domain choice, since the whole-day and tie cases
      pass under either rule. Client-side computation is forbidden, so client
      and server cannot label the same pair differently.
- [ ] 8.8 The failure indicator is driven by `schedule_optimization_failed`
      rather than by a refetch, and shows per variant.
- [ ] 8.9 The FE mirror in the same slice as the union change:
      `ScheduleFloor` in `apps/fe-01/src/lib/wbs-api.ts` and the exhaustive
      `floorWordsOf` switch in
      `apps/fe-01/src/components/wbs/gantt-geometry.ts` gain `'optimizer'`.
      **Watched red:** three optimized fixtures whose starts are respectively
      equal to a person floor, equal to a capacity floor, and strictly later
      than both — asserting predecessor edges, late times, both wait counters,
      the API union and the hover words, so a resource-bound optimized slice
      keeps its explanation instead of being labelled `optimizer`.

## 9. Corpus and regression safety

- [ ] 9.1 Extend the generated corpus to >=1,000 seeds covering
      scheduler → API → Gantt for both objectives and both engines, including
      the people, capacity, priority, **dependency-reach and manual-floor**
      facts the current generator omits.
- [ ] 9.2 The existing Fast corpus (schedule-shapes / identity / capacity /
      leveling / priority / benchmark) keeps passing unchanged, and is **keyed
      by `SCHEDULER_CONTRACT_VERSION`** (1.5) so a Fast change without a bump
      fails it. Fast is the preview and fallback, never the optimality claim.
- [ ] 9.3 The known capacity/floor hand-off audit finding (backward-graph
      hand-off dropped → false float) stays open and documented. The optimizer's
      re-validation must not mask it: a corpus case reproducing it is asserted
      to still reproduce.

## 10. Gate and close

- [ ] 10.1 Remote gate on h2puni: **`bin/h2puni-gate.sh`** (it takes the
      host-wide lock; `AGENTS.md` 466–473 forbids the raw full Nx gate there),
      **`bunx @fission-ai/openspec@1.3.0 validate --all --json`**, the Python suite, and the
      **positive/negative built-image spawn proof** — this change's packaging
      claim is a Python-enabled built image, so a gate without `build` cannot
      observe it. The actual CI run (`.github/workflows/ci.yml`) is retained as
      the merge gate; its job runs `bunx nx format:check --all` and
      `bunx nx run-many -t test lint typecheck build`, so **format and build are
      part of the real gate** (Sol r9 Important 5). `openspec/config.yaml`'s
      "There is no CI" line was stale and is corrected in this slice so later
      plans do not inherit an under-scoped gate. Record the actual output in `verify.md` with the failure-proof
      table (fault injected, the case that observed it failing, result) for
      every watched-red check in slices 1–9.
- [ ] 10.2 Terminal review of the exact head: the Anthropic↔OpenAI peer plus
      Gemini; every Critical/Important finding dispositioned.
- [ ] 10.3 Slices 3 and 3b each ship as a reviewed PR (`status: review`, no
      self-merge) — both touch `apps/be-01/drizzle/**`. The remaining slices
      are dev-mode and follow the normal PR + green CI + merge path.
      **Slice order is a correctness constraint, not a preference (Sol r12
      Important 5):** every column a slice's own code and tests read is
      created by that slice's own migration, so slice 3 carries
      `optimization_delete_pending_at` (3.1b) and slice 3b carries only the
      three user-facing settings. Verify before starting either PR that no
      task in a slice references a column another slice creates.
