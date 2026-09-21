# R5: a step graph's walks, by hand and over `configurable-tree-traversal`

Model experiment for work item R5
(`docs/superpowers/plans/2026-09-20-wbs-agentic-planning-research.md`),
answering the concrete part of S9 in the desk research
(`docs/wbs/research/2026-09-20-step-graphs-kinds-gates-loops.md`). Run on 2026-09-20 in a throwaway Bun project outside the Nx workspace; the sources are kept beside the planning files, not in this repository.

## What was run

`bun --version` 1.4.2. `bun init -y`, then `bun add --exact
configurable-tree-traversal@0.7.0 fast-check` (resolved `fast-check@4.10.2`,
transitively `uuid@9.0.1`). `bunx tsc --version` 7.0.2.

Model (`src/step-graph.ts`): `Step { id, kind: 'agent' | 'human', optional
}`, `StepEdge { from, to }`, `StepGraph { steps, edges }` — the flat chain is
the special case where every step has one predecessor and one successor. One
interface, `StepGraphWalks` (`topologicalOrder`, `findCycle`, `reachOf`,
`sliceEdgesOf`); `src/hand-walks.ts` (iterative, no recursion, no library —
Kahn's algorithm, an explicit-stack DFS, an elimination pass) and
`src/ctt-walks.ts` (one `runCycleAwareDfs` engine over
`configurable-tree-traversal`, reused for three of the four walks) both
implement it. `src/oracle-slice-edges.ts` is `reachedSliceOf` and
`sliceGraphEdges` copied verbatim from
`libs/wbs/domain/domain/src/slice-edges.ts` in puni-00 (2026-09-20), the
oracle for the chain case.

Property tests (`bun test`): `test/properties.test.ts`,
`test/chain-oracle.test.ts`, fixtures in `test/smoke.test.ts`, arbitraries in
`test/arbitraries.ts` including an explicit diamond generator (`diamondArb`).
`bunx tsc --noEmit` ran clean after turning off `noUncheckedIndexedAccess`,
matching `schedule.ts`'s own comment that the product does not run that flag.

## Results

39 tests, 3 files, 39 pass / 0 fail, about 7,000 `expect()` calls (the count varies with the generated cases; a second run by the planner gave 6,980). Every property
below ran against **both** implementations and passed for both:

- topological order respects every edge, and visits each step exactly once (random DAG, and explicitly over diamonds)
- reach equals a naive O(V³) Floyd–Warshall closure oracle (random DAG, and diamonds)
- a random back-edge always closes a reported cycle, and the reported cycle is a real path in the graph
- removing an optional step preserves reach among the remaining (required) steps
- the chain case reproduces `sliceGraphEdges` (the oracle) for random chain lengths
- hand and ctt agree with each other on order set, reach sets and slice edges

## Fault injection

**Fault 1 — reversed edge comparison, hand-written topological sort.** In
`topologicalOrderHand`'s in-degree pass, changed `incoming.set(edge.to, ...)`
to `incoming.set(edge.from, ...)`. Result: 4 of 17 tests in
`properties.test.ts` failed — both "respects every edge" variants, "visits
each step exactly once," and the hand/ctt cross-check. Minimal counterexample
fast-check shrank to: `{steps: [s0, s1], edges: [s0 -> s1]}` → order
`[s1, s0]`. Reverted; suite back to 39/39, typecheck clean.

**Fault 2 — dropped the visited set in the CTT adapter.** In
`runCycleAwareDfs`'s `PRE_ORDER` visitor, removed the `if (seen === 'black')`
branch that returns `DISABLE_SUBTREE_TRAVERSAL` for an already-finished
vertex. Result: 2 tests failed, both on the explicit diamond fixture
(`A -> {B, C} -> D`). Run directly to see the actual output:
`topologicalOrderCtt(diamond)` returned
`["D","C","D","B","D","A","C","D","B","D"]` — ten entries for four steps,
`D` four times. Not one stray duplicate: reopening a "finished" vertex
reopens its ancestors too, so the blowup is combinatorial, not additive.
Reverted; suite back to 39/39.

Both faults were the smallest plausible-to-miss edits (a one-token flip, a
deleted `if`), and both were caught by properties that exist for correctness
reasons, not built for fault-hunting.

## Measurements

Lines, and non-comment/non-blank lines (`^\s*(\*|//|/\*|$)` excluded), for
the two implementation files (`step-graph.ts`, the shared model, is 94 lines
and counted against neither):

| File            | Total | Non-comment/blank |
| --------------- | ----- | ----------------- |
| `hand-walks.ts` | 160   | 116               |
| `ctt-walks.ts`  | 177   | 103               |

Comparable in size. The library did not shrink the code; it let three of the
four walks share one traversal engine instead of three small independent
algorithms, paid for by the visited-set and cycle-policy code its own README
says a "custom graph adapter" must supply.

Timing, `bun run bench/bench.ts`, single run, not repeated for variance:

| Graph (10,000 vertices)             | Walk                               | hand   | ctt     | ratio |
| ----------------------------------- | ---------------------------------- | ------ | ------- | ----- |
| Layered DAG (100×100, 19,800 edges) | `topologicalOrder`                 | 12.4ms | 98.6ms  | 8.0×  |
| Layered DAG                         | `sliceEdgesOf` (110,880 edges out) | 57.3ms | 578.6ms | 10.1× |
| Chain                               | `topologicalOrder`                 | 5.8ms  | 51.4ms  | 8.9×  |

`findCycle` and `reachOf` tracked the same pattern on both graphs, 6–11×
slower for ctt. Neither implementation overflowed the stack on the
10,000-long chain — the library's "iterative scheduling... without
recursive call-stack growth" claim held under Bun; the hand-written
explicit-stack DFS held by construction. Part of the `sliceEdgesOf` gap is a
genuinely less efficient CTT-side algorithm (one backward traversal per
required step, vs. hand's single elimination pass), not pure library
overhead — this experiment did not give both sides the same algorithm for
that walk. Both are well under "tens of steps" (a plan) even at 10,000
vertices: comparatively slow, not slow enough to matter at plan size.

## What the library gave, and what had to be built around it

Gave, directly usable: lazy child resolution from `makeRoot`/`makeVertex`
hints; `PRE_ORDER`/`POST_ORDER` visitor scheduling; `DISABLE_SUBTREE_TRAVERSAL`
and `HALT_TRAVERSAL` as visitor commands, used exactly as S9 anticipated;
genuinely iterative traversal, confirmed at 10,000 deep (packaging is its own
section below). Had to be built, all in `runCycleAwareDfs`: the visited set (the README says
"shared objects in separate branches are traversed independently" and
"custom graph adapters must define their own identity and cycle policy" —
fault 2 confirmed this directly); cycle policy (grey/black colouring, a grey
re-encounter reported via `HALT_TRAVERSAL`); a synthetic multi-root walk,
since a DAG has no single root the way a tree does (every step id is a
possible start, skipping already-finished ones, so a cyclic component with
no source vertex is still explored); and reading "topological order" as
reversed post-order, which nothing in the library names. `sliceEdgesOf`
needed one small traversal per required step with a stopping rule keyed to
that call's own root — the tree adapter has no native concept of "which step
is home right now." Awkward but not blocking: a repeated hint is a new
vertex _instance_ even when its logical id repeats, so identity is tracked by
the caller's own map, not the library's per-instance `CTTRef`; and `reachOf`
over CTT throws on a cycle reachable from the start vertex where the hand BFS
would silently fold it in, unresolved since the property tests only ever
feed `reachOf` a DAG.

## CommonJS under Bun, and Vite/Chromium (not tested)

Works under Bun without qualification. `configurable-tree-traversal`'s
`CTTRef` calls `uuid` on every vertex reference (`core/CTTRef.js`:
`require('uuid')`) — not dead weight, on the hot path of every walk.
`uuid@9.0.1`'s CommonJS entry pulls in Node's `crypto` built-in
(`require("crypto")` in `rng.js`/`sha1.js`/`md5.js`/`native.js`, confirmed by
grep), which ran fine under Bun's own `crypto` support; `uuid` separately
declares a `"browser"` field remapping to a crypto-free build. **Not tested
here:** whether a Vite/Chromium production bundle resolves
`configurable-tree-traversal` (itself CommonJS, no `"browser"` field of its
own) through paths that avoid Node's `crypto` — the concrete proof S9 asked
for, and it remains open.

## Recommendation for S9

**Adopt for the step graph's walks is not recommended.** CTT ran 6–11×
slower on a 10,000-vertex graph while both implementations passed identical
property tests including the diamond case; the two files are comparable in
size (116 vs. 103 non-comment lines), so the library bought a shared engine
across three walks, not brevity, paid for by exactly the visited-set and
cycle-policy code its own adapter disclaimer says a graph adapter needs. A
plan's step graph is "tens of steps," where the hand-written walks (the size
of the Kahn's algorithm already in `schedule.ts`) are neither slow nor
unclear.

Judgement, separated from the above: this covers today's four walks, not
whatever shape R7's design interview settles for the step graph (S1, S3
especially could change what "the walks" even are). Given the hand-written
walks already exist, are tested, and are faster, adding a dependency (with
its own CommonJS dependency, `uuid`) is not justified by what this
experiment found. One claim this note cannot make either way: the **work
item tree** — a real tree, roll-up by post-order fold, numbering by
pre-order — needs none of the visited-set or cycle-policy code above, since
it has no shared vertices to misidentify. That may be Dany's library's
better first use inside Twilight Structure; untested here, and left to
whichever research looks at the work item tree directly.
