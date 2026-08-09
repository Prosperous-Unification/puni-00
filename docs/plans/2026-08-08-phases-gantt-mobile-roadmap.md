# Phases, header, Gantt, mobile — plan v2 (2026-08-08, late)

v1 was cross-reviewed the same evening: codex 18 findings (7 critical), agy 17
(5 critical), heavily convergent. Every real finding is folded in; disposition
table at the bottom. The reviews reshaped the plan: **six changes became
nine**, the leveling algorithm was replaced (v1's was proven unsound by
constructed counterexample — twice, independently), and the budget roughly
doubled. Base: PR #31 merged.

Dany's asks: **P1** phases configurable per project (estimate groups follow);
**P2.1** smaller header; **P2.2** the Gantt — dependencies, assignees (one
person, one task at a time), estimates, not-before; **P2.3** responsive
mobile-suitable UI with a shadcn-like library.

---

## The roadmap — nine changes, two lanes

**Domain lane:** R1 role-crud → S1 schedule-on-item×role → S2
resource-leveling → G gantt-view (last, meets the other lane).
**Presentation lane:** T tailwind-spike → F shadcn-foundation → H header →
P phases-ui → X live-editing-extraction → M mobile-cards.
R1 and T can start in parallel. G needs S2 + F. M needs X + F.

Suggested PR order: **R1, T, F, H, P, S1, S2, X, M, G** — each PR-sized,
Dany merges between.

---

## R1 `role-crud` — be-01 only (P1 backend)

The schema was built for this (per-project `role` table, estimates keyed by
roleId) and never given a write path (`schema.ts` says so out loud).

1. `/api/projects/:id/roles`: add (unique per project, 409 dup), rename
   (same), delete. Delete refuses by default with counts — estimates,
   explicit assignments, **and the implicit-assignment flips it would
   cause** (agy #6/codex #9: with exactly one named assignee an item's
   `doesEveryPhase` is derived; deleting a role can silently promote
   someone to "does every phase" — the count names those items, and the
   confirm is informed). `cascade: true` on a second explicit call.
2. **One transaction** (codex #7): delete estimates (**`estimate.roleId`
   has NO cascade today — agy #5: a bare role delete 500s on the FK** —
   handled by explicit in-transaction deletes, no schema migration
   needed), cascade-covered assignments, the role row, **project revision
   bump** (the schema comment already demands it — agy #8) **and a
   revision bump on every affected work item** so stale journal
   preconditions refuse instead of undoing against a world whose phases
   changed (codex #8). Concurrent negative test: an estimate inserted
   between count and confirmed delete is deleted by the transaction or
   refused by a revision check — never silently orphaned, never a 500.
3. **Typed durable role events** (`role_added/renamed/removed`) through
   the sequencer and replay buffer, recorded after the transaction
   (codex #10, agy #17). The client's refetch-on-event already re-reads
   roles; the spec adds the sequence-consistency rule (a tree read
   acknowledging seq N pairs with roles at ≥ that moment) and a reconnect
   replay test.
4. New projects still seed Dev+QA. `STARTING_ROLES` becomes data the
   service writes, not a cap.
5. Not journaled (like the start date), and _because_ of that, the
   revision bumps above are the guard — stated in the spec.

**~1.5 days.** All server; no UI here (P ships the dialog — resequenced per
codex #17/agy #15 so it is built once, in shadcn).

## T `tailwind-spike` — tooling only (P2.3 step 0)

Codex #12 + agy #9: prove the integration before adopting components, and
the preflight line before trusting the geometry.

1. Tailwind v4 into the Vite/Vitest/Nx/Bun stack: build, dev, test CSS
   handling, Nx cache inputs, `format:check`, production CSS, lockfile
   reproducibility. No components, no restyling — one utility class on one
   chrome element as the tracer.
2. **Preflight is scoped or off** (`@layer` isolation / no-preflight
   import): the table, its inputs, buttons, date box and pickers must
   measure identically before/after. Proof: the full h2puni fit matrix runs
   green with Tailwind in the build, and a deliberate unscoped-preflight
   commit turns the date-width and geometry assertions red (negative run,
   observed, then reverted). Keyboard suite re-run under the same proof.

**~0.5 day.** If this spike fights the stack for more than a day, that is a
finding to bring back, not a fight to win silently.

**Done 2026-08-09 — `docs/plans/2026-08-08-tailwind-spike-verify.md`.** It did
not fight the stack. Three things F must read first: 2's premise is wrong —
unscoped preflight leaves every one of `layout.spec.ts`'s 22 tests green,
because the table is styled inline and an inline style outranks every layer, so
the fault needed its own oracle (`e2e/tailwind.spec.ts`), and preflight is
unmeasured on the table rather than proven harmless — inherited declarations
still reach cells, and no test measures a row height; `ui/button.tsx`'s
long-inert Tailwind classes go live the moment utilities compile, so **T ships
a restyle of two chrome buttons that F owns** — the "no restyling" line above
did not survive contact; and the alpine/amd64 container build with Tailwind's
native modules has not been run anywhere yet.

## F `shadcn-foundation` — chrome components (P2.3a)

1. shadcn init; vendored components owned under repo rules. Tokens (font,
   radius, palette, dark-mode variables configured — dark mode itself not a
   feature here).
2. Adopt for chrome only: auth screens, toasts, dialogs/sheets, buttons and
   inputs outside the grid, the cheat sheet. Each swap keeps the existing
   aria contract and tests — the tests are the spec.
3. **Radix modals vs the page-level keydown listeners** (agy #10): an open
   dialog/sheet must not let `?`, Cmd+Z or the command chords reach the
   table underneath. One rule in the modal wrapper, tested per shortcut.
4. The table gets CSS-variable tokens only; no utility classes inside
   `<td>`; the hand-rolled menu/pickers keep their internals (routing
   matrix rationale in design.md, Radix versions explicitly rejected).

**~1–1.5 days.**

## H `header-fits-a-row` (P2.1)

As v1, built on F: one bar (brand · project picker with rename/new folded
in · presence · account menu), toolbar tightened beneath it, `main` becomes
a proper column flex — the `16rem` magic number in `TABLE_FRAME` dies,
frame takes the real remainder. Pixels: table height gains ≥120px at
1280×800; one-row header across the fit matrix; no document scroll at 125%.

**~0.5–1 day.**

## P `phases-ui` (P1 frontend)

1. shadcn dialog from the toolbar: list/add/rename/delete, delete shows
   R1's counts (including the doesEveryPhase flips) and asks again;
   cascade checkbox default off; keyboard-complete.
2. **Client-side blast radius** (agy #7, codex #8): on a role event, the
   refetch also sanitizes `unfoldedRoles` (accordion may hold a dead id)
   and purges `drafts` keyed `rowId::deadRoleId::*`; a cell being typed in
   when the columns rebuild loses focus by design (roles changing is the
   one sanctioned remount) — the refused-draft hold must still survive it,
   production-path test, and the spec says what the person sees.
3. Fit arithmetic in the dialog ("5 phases need ≥1430px before the table
   scrolls sideways"), and the three-role Playwright fixture becomes
   buildable — built here, closing C3-4.

**~1 day.**

## S1 `schedule-on-item-role` — the unit, no leveling yet (P2.2 model)

Codex #1/#2/#3 + agy #1/#2: item×role is a domain redesign; do it as its
own change, settle the semantics, keep behavior identical for today's data.

1. **Universal unit: the slice (item×role), one planner, one adapter.**
   The dual-unit "smaller diff" alternative is **rejected** (both
   reviewers, independently: node identity would change when an assignee
   is added — bars, dependencies and caches all lose their referent).
2. **Intra-item order:** a work item's slices run sequentially in the
   project's role order (`role.position` — R1 gives roles an explicit
   order; today's Dev→QA is the seed order). This is what "duration = sum
   of roles" has always meant; now it is edges, not addition.
3. **Inter-item expansion:** dependency A→B means _A's last estimated
   slice finishes before B's first estimated slice starts_; parent
   endpoints keep expanding to leaves as today, then to slices by the
   same rule.
4. **Unestimated/zero slices** take zero time and impose no wait, but
   still exist for ordering (an unestimated Dev before an estimated QA
   orders QA after Dev's predecessors). Same rule the roll-ups use.
5. **Projection back to the work item** (codex #3, agy #1.3): row Start =
   min slice start, End = max slice finish, Slack = min slice float,
   critical = any slice critical, estimated-flag unchanged (effort sums
   stay effort sums). The wire model and table read the projection —
   **zero visible change for any plan that exists today** (each item's
   slices are contiguous under CPM with no resources), and the change's
   proof is exactly that: the existing schedule fixtures produce identical
   Start/End/Slack through the new engine.
6. Not-before floors apply to the item's first slice (and thereby all).

**~1.5–2 days**, mostly planner + tests. The design interview
(brainstorm/grill/domain-model per repo workflow) happens here.

## S2 `resource-leveling` (P2.2 engine)

v1's algorithm was unsound (codex #4, agy #3: a dependency push after
serialization re-overlaps a person downstream; one forward re-run never
re-levels). Replaced:

1. **Deterministic serial list scheduling on the augmented graph.** One
   pass, one eligible set: repeatedly take the highest-priority _eligible_
   slice (all predecessors — dependency, intra-item, resource — scheduled),
   priority = (CPM earliest start, least float, WBS number, role order);
   schedule it at the max of its floors (predecessors' finishes, not-before,
   assignee's last finish); its successors become eligible. No re-run, no
   iteration — non-overlap holds by construction because a person's next
   slice is only placed after the previous placement is final. Named for
   what it is (codex #6): deterministic list scheduling, NOT
   makespan-optimal; stated in design.md.
2. **The person constraint applies to explicitly assigned slices and to
   `doesEveryPhase`-implicit ones** — the implicit person is a queue of
   one, which is the whole point. The planner input makes the assumption
   explicit per slice (codex #9), so the engine never re-derives it.
3. **Cycles:** the augmented graph (dependency + intra-item + the
   _dynamically chosen_ resource edges) cannot deadlock under serial
   generation (an eligible slice always exists in an acyclic dependency
   graph; resource edges only point backward in placement order —
   termination is structural, and the design doc carries the argument,
   codex #5). The _dependency_ cycle check stays where it is, at the
   write.
4. **Outputs per slice** (codex #16, agy #13): start, finish, float and
   critical **recomputed by a backward pass over the augmented graph**
   (resource edges included — "critical" now means what ends the project,
   through people or through edges), binding constraint kind, and
   `resourcePredecessorId` + personId when a person is the binding floor —
   the SVG draws from ids, never from prose.
5. **Perf budget** (agy #4): benchmark fixture — 200 items × 2–3 roles
   (~500–1000 slices), realistic edges — asserted under 10ms in CI's bun
   test; complexity stated O(V log V + E′).
6. Leveling is on when it binds, invisible when it doesn't (unassigned
   plan ≡ S1 exactly — proven by fixture equality, the same trick S1 uses
   against today's engine). Schedule header notes "N tasks wait for a
   person" when N > 0.

**~1.5 days** after S1.

## X `live-editing-extraction` — prerequisite for mobile (codex #13)

The collaborative machinery (drafts, commit outcomes, refused-draft holds,
peer-update reconciliation, focus intents) lives inside `WbsTable` +
`CellInput` refs today; a second renderer at a breakpoint would lose the
refused state on switch. Extract a live-editing module (per-field state
keyed by rowId::columnId, owning baseline/typed/refused/sent and the
commit pipeline) that both renderers mount; `CellInput` becomes its DOM
face. Also: `editableGrid`/`focusAdjacentCell` re-anchored on a
`[data-grid]` container instead of `closest('table')` (agy #11). Pure
refactor: every existing test green, no behavior change, plus new tests
that the module holds a refused draft across a renderer unmount/remount
(the exact mobile-rotate case).

**~1 day.** Unglamorous and load-bearing.

## M `mobile-cards` (P2.3b)

As v1 §4 (outline cards <768px; read + single-input edits: name/notes,
`o/r/p`, @-assign; no drag/keyboard-grid; toolbar in a sheet; desktop
untouched), now on X's module with the contracts named (codex #14,
agy #12): cards render the same `data-cell` ids for their inputs; focus
restoration after refetch specified and tested on the card DOM;
refused-draft persistence across breakpoint switch (X's test, run through
the real resize); picker-ownership routing on touch. Pixels gains 390×844:
no overflow, tap targets ≥44px, edit round-trip, peer-edit-while-typing.
The 08-06 "phone cards" kill is superseded by Dany's explicit ask —
recorded.

**~2 days.**

## G `gantt-view` (P2.2 chart) — last

As v1 §6 (second panel, tree-mirrored rows, workday axis, summary
brackets, dependency arrows, not-before flags, critical tint, person-links
visually distinct, hover reasons, click-to-row, read-only v1, mobile
pinned-labels + scroll), with the review's corrections:

1. **Coordinate contract** (codex #15, agy #14): the SVG user-space unit
   IS one workday — `viewBox` width = horizon in workdays; bars carry
   `data-start`/`data-finish` (engine numbers, workday offsets). Tests in
   two layers: user-space `x`/`width` strictly equal engine numbers
   (cannot drift, unit-testable in jsdom on the rendered SVG), and a
   separate h2puni pixel pass for on-screen alignment after scaling,
   pinned labels and scroll. Weekend compression is thereby exact: the
   axis renders workdays and prints calendar labels from the existing
   mapping — a bar never spans a weekend because the unit doesn't contain
   them.
2. Person-links drawn from `resourcePredecessorId` (S2's output), never
   parsed from text.
3. Rendering: React-owned SVG; `d3-scale` only if hand-rolled scales get
   fiddly (implementor logs it). No gantt libraries.

**~2 days.**

---

## Budget and honesty

R1 1.5 + T 0.5 + F 1.5 + H 1 + P 1 + S1 2 + S2 1.5 + X 1 + M 2 + G 2 ≈
**14 agent-days** (v1 said 7; codex #18 called that materially undersized
and the restructure agrees). Same execution model as the keys/fit batch:
Opus subagents, codex+agy review after F, after S2, and after G, h2puni
proofs per change, assumptions logged. Realistically 3–4 working days of
wall-clock at the cadence the last batch ran.

## Open questions for Dany (recommendations inline)

1. Role delete: refuse-with-counts (incl. "who becomes/stops being
   does-every-phase"), cascade on explicit confirm — OK?
2. Leveling always-on, no toggle (unassigned plan is provably identical to
   today) — OK?
3. **Slices as the schedule unit** (Dev-then-Review of one item = two bars,
   sequential in role order; row shows the span) — this is the deep one,
   S1's design interview settles the details, but the direction needs your
   yes.
4. Mobile v1 scope: read + single-input edits, no drag/keyboard grid — OK?
5. Gantt v1 read-only (no drag-to-reschedule) — OK?

## Disposition table (v1 review)

| finding                                    | disposition                                                                                                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| codex 1 / agy 1 (item×role underspecified) | **Accepted** — S1 defines intra-item order (role.position), inter-item expansion (last-estimated → first-estimated), unestimated-slice rule, projection.                                      |
| codex 2 / agy 2 (dual-unit not viable)     | **Accepted** — alternative deleted; universal slice + adapter.                                                                                                                                |
| codex 3 / agy 1.3 (projection undefined)   | **Accepted** — S1.5: min/max/min-float/any-critical; effort roll-ups untouched; identity proof vs today's fixtures.                                                                           |
| codex 4 / agy 3 (one re-run unsound)       | **Accepted** — algorithm replaced with serial list scheduling, non-overlap by construction; the counterexample becomes a named negative test.                                                 |
| codex 5 (resource cycles/termination)      | **Accepted** — serial generation termination argument in design.md; dependency-cycle check unchanged; no fixed-order iteration exists anymore.                                                |
| codex 6 / agy 4 (complexity, not optimal)  | **Accepted** — named deterministic list scheduling, not optimal; O stated; 200-item <10ms CI benchmark.                                                                                       |
| codex 7 / agy 5 (estimate FK, transaction) | **Accepted** — R1.2 one transaction, explicit estimate deletes (no cascade exists), concurrent negative tests. No migration needed (behavior in service, not schema).                         |
| codex 8 (revisions, journal, mid-edit)     | **Accepted** — R1.2 work-item revision bumps; P.2 mid-edit remount + refused-hold survival tests.                                                                                             |
| codex 9 / agy 6 (doesEveryPhase)           | **Accepted** — counts include implicit flips (R1.1); planner input makes the person explicit per slice (S2.2).                                                                                |
| codex 10 / agy 17 (role events/replay)     | **Accepted** — R1.3 typed durable events, sequence-consistency rule, reconnect test.                                                                                                          |
| codex 11 / agy 9 (preflight bleed)         | **Accepted** — T.2 scoped/off preflight with observed negative geometry run.                                                                                                                  |
| codex 12 (integration spike)               | **Accepted** — T exists because of it.                                                                                                                                                        |
| agy 10 (modal vs global keys)              | **Accepted** — F.3.                                                                                                                                                                           |
| codex 13 (extraction prerequisite)         | **Accepted** — X exists because of it.                                                                                                                                                        |
| codex 14 / agy 11,12 (mobile contracts)    | **Accepted** — M: data-cell parity, focus restoration, refused-draft across breakpoint, grid re-anchoring in X.                                                                               |
| codex 15 / agy 14 (coordinate contract)    | **Accepted** — G.1 workday = SVG unit, two-layer assertions.                                                                                                                                  |
| codex 16 / agy 13 (resourcePredecessorId)  | **Accepted** — S2.4 output ids + augmented-graph float/critical.                                                                                                                              |
| codex 17 / agy 15 (sequencing)             | **Accepted** — phases UI after shadcn; spike first; extraction before mobile; role backend early.                                                                                             |
| codex 18 (budget)                          | **Accepted** — 7 → ~14 agent-days, six changes → nine.                                                                                                                                        |
| agy 8 (project revision on role CRUD)      | **Accepted** — R1.2.                                                                                                                                                                          |
| agy 16 (migrations/down.sql)               | **Accepted in principle; no schema change survives v2** (cascade handled in-service) — if the S1 interview adds `role.position` as a column, THAT ships migration + down.sql per house rules. |
