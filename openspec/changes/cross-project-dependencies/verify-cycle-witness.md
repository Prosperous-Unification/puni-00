# Cycle witness correction for task 8.1

2026-10-23. Base `a4cb2e23eda58fd3aa34fd60456704b60dbc96b4`, isolated
worktree `/tmp/puni-cycle-witness`, branch `fix/cycle-witness-attribution`.
This corrects the precise offending-reference contract in the plan-import delta
spec. Parent task 8.1 remains open and production external imports stay inactive.

## Defect and correction

`findStepNodeCycle` previously collected authored edges among all Kahn residual
nodes. That remainder contains nodes blocked downstream of a cycle, so its IDs
were not necessarily cycle witnesses. `ImportedPlanResource.writeDependencies`
selected the last imported declaration among those IDs and blamed an unrelated
internal relationship instead of the external declaration that reached the
corrupt component.

The domain correction keeps Kahn's acyclic fast path and the existing authored
`self_node` answer. Iterative Kosaraju traversals partition the remaining graph;
only edges whose endpoints share a strongly connected component contribute IDs.
A same-component edge has a return path, including a singleton's self edge.
Downstream edges and one-way bridges between cyclic components are excluded.
Graph edge order and authored-ID deduplication stay deterministic. Explicit
stacks avoid depth-dependent JavaScript recursion limits.

The domain `StepNodeCycle` and function JSDoc now describe actual directed-cycle
membership. Direct production callers inspected: `findDependencyGraphCycle`,
`DependencyGraphGuard.findCycle` in `service/dependency-graph.ts`, and
`ConnectedDependencyGraphReader.findCycle`. They forward the witness to existing
modeled refusal consumers. The importer needs no code change: with no imported
edge on the remote cycle, its existing declaration-by-declaration diagnosis finds
the external reference reaching that corrupt component.

## TDD and independently watched R5 faults

The new four-node domain cases require A ↔ B → C → D to return only the two
cyclic IDs, and two separate cyclic components joined by a bridge to return each
component's cyclic IDs in original authored order, excluding the bridge.
Against the unchanged domain implementation both failed (0 pass, 2 fail):
`incoming-0`/`internal-1` and `bridge`, respectively, leaked into the witness.
Log: `/tmp/cycle-witness-red-domain.log`.

The mounted-download/current-cycle fixture retains its source internal typed and
legacy links and its unique external `incoming-node-a` declaration. It asserts
that the classified typed declarations are exactly `incoming-node-a` then
`internal-node`, that the legacy link is retained, and that the external index is
exactly 0. A post-download reverse edge corrupts the real remote component. The
real synthetic importer must refuse at `typedDependencies[0]`, preserve the full
persisted-table snapshot and send no pushes. Before correction it failed with
`typedDependencies[1]` (0 pass, 1 fail).
Log: `/tmp/cycle-witness-red-mounted.log`.

Each temporary production mutation was applied alone and restored before the
next. Adjacent `Proof:` comments name the observed failures.

| Injected fault                                                          | Domain observation                                               | Mounted observation                                            |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| Remove the SCC edge filter (`onCycle = graph.edges`)                    | Both new tests fail on unrelated IDs: 0 pass, 2 fail             | Current cycle diagnoses `[1]` instead of `[0]`: 0 pass, 1 fail |
| Replace endpoint component equality with successor component membership | Both new tests fail on downstream and bridge IDs: 0 pass, 2 fail | Current cycle diagnoses `[1]` instead of `[0]`: 0 pass, 1 fail |

A further independent production fault removed the component-presence check.
The new `excludes an independent acyclic edge beside a legacy-only cycle`
case failed with authored ID `independent` instead of the required empty witness
(0 pass, 1 fail). That check was restored and the case passed.
Log: `/tmp/cycle-witness-fault-presence-domain.log`. This also covers the
workflow/legacy-only cycle's empty authored witness beside an unrelated DAG.

Commands for each fault:

```sh
bun test ./libs/wbs/domain/domain/src/slice-edges.test.ts --timeout=30000 -t 'names only cyclic|excludes a bridge'
bun test ./apps/wbs/be-01/src/controller/cross-project-import.controller.db.test.ts --timeout=30000 -t 'current cycle'
```

Raw logs: `/tmp/cycle-witness-fault-{filter,equality}-{domain,mounted}.log`.
After restoration the domain/connected pair passed 50 tests and the exact mounted
cycle case passed with complete snapshot equality and zero pushes.

## Verification

- Focused domain/application graph regressions:
  `bun test ./libs/wbs/domain/domain/src/slice-edges.test.ts ./libs/wbs/domain/domain/src/connected-step-node.test.ts ./libs/wbs/application/core/src/service/dependency-graph.test.ts ./libs/wbs/application/core/src/service/connected-dependency-graph.test.ts --timeout=30000`:
  **78 pass, 0 fail, 179 assertions**. Log: `/tmp/cycle-witness-focused-domain-final.log`.

- Focused mounted import/export/store regressions:
  `bun test ./apps/wbs/be-01/src/controller/cross-project-import.controller.db.test.ts ./apps/wbs/be-01/src/controller/cross-project-export.controller.db.test.ts ./libs/wbs/adapters/store-sqlite/src/scoped-import-dependencies.db.test.ts --timeout=30000`:
  **66 pass, 0 fail, 753 assertions**, 56.99 seconds. Log: `/tmp/cycle-witness-focused-mounted-final.log`.
- `NX_DAEMON=false bunx nx run wbs-domain:lint --skip-nx-cache`: passed, 15.7 seconds.
  Log: `/tmp/cycle-witness-domain-lint.log`.
- `NX_DAEMON=false bunx nx run wbs-domain:typecheck --skip-nx-cache`: passed.
  Log: `/tmp/cycle-witness-domain-typecheck.log`.
- `NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache`: passed,
  including its module prerequisite, 27.7 seconds.
  Log: `/tmp/cycle-witness-backend-typecheck.log`.
- Changed-file Prettier check and `git diff --check`: passed.
- Normal `bunx lefthook run pre-commit`: passed in 8.42 seconds, including
  staged lint, format, plaintext-secret and private-nesting checks. Log:
  `/tmp/cycle-witness-hooks.log`. Migration/doc-cap hooks had no matching files.
  Tool Wiki explicitly reported inactive because its external activation root
  is not provisioned; no certification is claimed. Commit hooks are not bypassed.
- Broad configured backend lint: **pending parent serialization**, held while
  the frontend diagnostic target uses the shared host. This is not passing
  lint evidence; the parent must run it before integration approval.

An initial surrounding regression run found an added test-fixture assertion using
`classified.dependencies`, which does not exist: 65 pass, 1 fail. The corrected
assertion checks the classified rows' actual `dependsOn` fields, and the selected
cycle case then passed before the clean three-file run above.

The existing dependency installation is reused through a `node_modules` symlink;
this is not fresh frozen-install evidence. Configured checks are serialized with
the parent agent's frontend target to avoid the previously observed host OOM.
Nx reported a denied worker socket and used its supported in-process fallback;
no target was skipped because of that fallback.

Unverified: full canonical host gate, full backend suite/build, frontend/browser/
E2E, MCP, deployed behavior, old-binary compatibility and public external-import
activation. These bounded checks do not complete task 8.1 or establish rollout
safety.
