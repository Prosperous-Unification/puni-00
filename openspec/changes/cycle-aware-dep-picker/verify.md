# Verification

## The gate, uncached

```
$ bunx nx format:write --all      # before the check, as the workflow asks
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      bun:test (be-01, gw-01, libs, tools)   724 pass  0 fail
      fe-01 (vitest)                         331 pass  0 fail  (300 before; 31 new)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
27 items, 27 passed, 0 failed — cycle-aware-dep-picker valid
```

The 31 new tests: 19 in `dep-graph.test.ts` (15 of them be-01's own cases), 5
more in `dep-picker.test.ts`, 7 in `wbs-table.test.tsx`.

`fe-01:lint` failed once on the way — a void-returning arrow shorthand in the
new fixture and an unsorted import — and is green after the fix and
`format:write`.

## Every new check, and the fault that broke it

| Check                                                                   | Fault injected                                                                                  | What the run reported                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The cycle question is asked of the tree-expanded graph (`dep-graph.ts`) | every expansion removed — the written edges, judged over every id, as be-01's first version did | 4 failed: `follows the tree when a cycle runs through a parent`, `refuses an edge whose expansion closes a cycle through a parent` (codex's), `refuses an edge between two branches whose leaves already point back` (agy's), `ignores a dependsOn naming a row it has never seen`; restored, 19 pass |
| An ancestor edge is named by its direction (`dep-graph.ts`)             | the two `isWithin` calls swapped                                                                | only `says which way round an ancestor edge runs` failed — a parent reported as sitting inside its own child; restored, 19 pass                                                                                                                                                                       |
| The arrows step over a refused entry (`wbs-table.tsx`)                  | `pickable.map` given `entries.map` — every entry offered to the highlight                       | 2 failed: `the arrows step over a greyed row` (the highlight landed on the parent) and `drops a highlight that a peer’s edit has just made a loop`; restored, 7 pass                                                                                                                                  |
| A refused entry cannot be clicked (`wbs-table.tsx`)                     | the option's `if (entry.refusal !== undefined) return;` deleted                                 | `clicking a greyed row adds nothing` failed — `addDependency` was called for the ancestor; restored                                                                                                                                                                                                   |
| The highlight is resolved over pickable entries only (`wbs-table.tsx`)  | `activeOption` resolved over `entries`                                                          | `drops a highlight that a peer’s edit has just made a loop` failed — Enter added the edge the peer's edit had just made a cycle; restored                                                                                                                                                             |
| A refused entry says so to assistive technology (`wbs-table.tsx`)       | `aria-disabled` dropped from the option                                                         | `greys the row this one sits inside, and says so` failed; restored                                                                                                                                                                                                                                    |

Two faults were tried and discarded as imprecise before the first row above was
settled: removing the expansion of the **proposed** edge alone turns two valid
parent edges into false cycles (the proposed edge names non-leaf ids that the
ordering then cannot reach), which fails three tests for a reason unrelated to
the transitive case. The injection recorded is the one that reproduces the
mistake be-01 actually made.

## What holds the two rules together

`dep-graph.test.ts` runs every `canDepend` case from
`apps/be-01/src/service/dependency.test.ts` — the fixture tree, the diamond,
both cross-review examples — with that file's expectations, folded back to
be-01's vocabulary by `asBe01` before comparing. The one licensed difference is
that fe-01 splits `ancestor` into `self`/`ancestor`/`descendant`, because the
dropdown writes a different sentence under each.

**The honest limit of that**: the cases are _copied_, not imported — fe-01 and
be-01 are separate compiles and fe-01 must not depend on be-01's source. A
change to be-01's rule that also updates be-01's own tests will not turn this
file red on its own. What it does guarantee is that the ported rule answers
today's rule identically on every case be-01 thought worth writing down,
including the two a review caught it getting wrong.

be-01's `canDepend` and its property test (`accepts what the schedule accepts,
over every pair in a fixture tree`) are untouched and still the authority. The
property test has no port: fe-01 has no schedule to compare against.

## What is not watched here

- **The grey itself.** jsdom has no colour, so `color: #999` and
  `cursor: default` are unasserted; what the tests observe is `aria-disabled`,
  the reason text, and that the click and the highlight do nothing. A browser
  is the only place to see whether the entries read as disabled at a glance.
- **The screen reader.** `aria-disabled="true"` on a `role="option"` is the
  right ARIA for an unchoosable option, unverified against an actual reader.
- **A real be-01.** No round trip was made: dev was not deployed to, and the
  prediction has never been compared against a live refusal. The fake api in
  the table tests does not run `canDepend` at all — which is why the greyed
  cases are built as graph shapes rather than as server errors.
- **Cost on a large plan.** The graph is rebuilt per call and a Kahn pass runs
  per surviving entry, so an unfiltered list on a project of hundreds of rows
  is O(rows × leaf edges) per render. Narrowing happens first, which bounds
  the common case to what is on screen; nothing was measured.
