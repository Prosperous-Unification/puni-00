# Task 4.3 graph foundation handoff

Implementation is frozen in `/tmp/puni-cross-graph`, branch `feat/cross-project-graph`. Root owns normal-hook explicit-path commit and integration. No Git metadata mutations were performed by this worker. Task 4.3 remains incomplete until production command/service/transaction wiring and mounted rollback proofs land; no OpenSpec or WBS files were edited.

The worker started from a7688e9f0. Root independently cherry-picked the reviewed test-only fixture fix as **6463cff37** (`test(wbs): preserve typed history fixture discriminants`, source7e1b083d5). That commit touches only `service/compensating.test.ts` and is auxiliary, not part of this graph delta.

## Frozen explicit file manifest

1. `libs/wbs/domain/domain/src/connected-step-node.ts` (new)
2. `libs/wbs/domain/domain/src/connected-step-node.test.ts` (new)
3. `libs/wbs/domain/domain/src/slice-edges.ts`
4. `libs/wbs/domain/domain/src/index.ts`
5. `libs/wbs/application/core/src/service/connected-dependency-graph.ts` (new)
6. `libs/wbs/application/core/src/service/connected-dependency-graph.test.ts` (new)
7. `libs/wbs/application/core/src/service/dependency-graph.ts`
8. `libs/wbs/application/core/src/service/dependency-graph.test.ts`
9. `libs/wbs/application/core/src/index.ts`

## Implementation and integration interfaces

- Domain `ConnectedProjectGraph`, `ConnectedGraphInput`, and `ConnectedGraph` use the Astra shapes exactly. `resolveConnectedGraph` preserves existing local graph nodes/edges and their provenance, combines ownership and relationship maps, and expands external authored endpoints with their own project's tree/slices. It validates project/work-item ownership uniqueness, required endpoint project/item/slice/step facts, local/external classification and relationship identity consistency. Identical repeated external relationship evidence is included once; conflicting identities throw. Existing sn1/node positions remain unchanged. No project-level cycle approximation is added.
- `resolveAuthoredEdges(dependency, predecessorContext, successorContext)` is the one extracted authored expansion helper in `slice-edges.ts`. Local `resolveStepNodeGraph` and connected expansion both call it; existing FS/SS/FF whole/node/descendant-step semantics remain in the existing endpoint resolver. No second endpoint algorithm was introduced.
- `resolveDependencyGraphContext(projectId, state)` exposes each local tree, grouped slices, local graph and scoped local relationships. Existing `resolveDependencyGraph(state)` remains graph-returning; both share private `prepareDependencyGraph` without inventing a project identity. Preparation reuses the existing `slicesOf` call and estimate-presence placeholders. No schedule or hold reduction is invoked.
- Core `ConnectedDependencyGraphState` contains `{projectId,state:DependencyGraphState}[]` and `external:ScopedTypedDependency[]`. `resolveConnectedDependencyGraph(state)` adapts contexts once to the shared domain resolver.
- `ConnectedDependencyGraphReader` requires `ConnectedDependencyGraphReads` and `ConnectedGraphReadAuthority`. The read ports are narrow, read-only, required, and bound to the same caller-owned observation: project identity/reach/steps, work items, estimate identity, legacy relationships, and `TypedDependencyStore.listIncident`. `assertActive()` enforces observation lifetime. `requireProject(projectId)` must enforce current same-organization ownership/read authority, including readable restricted projects, before project labels/tree reads. Existence-only or permissive authorities are forbidden by the contract; this worker did not implement a permissive production adapter.
- `reader.read(projectIds, changes=[])` discovers the complete bidirectional incident graph to a fixed point. Each project has one incident read and one full fact capture per evaluation, and each relationship is represented once. Stored owner mismatch, unrelated incident rows, conflicting stored/effective identities, missing/mismatched required projects and cross-owned work-item rows throw.
- `ConnectedDependencyGraphChange` requires `projectId`; optional `rows`, `steps`, `estimates`, `legacy`, `reach` replace only supplied local facts. Optional `typed` is the COMPLETE proposed successor-owned typed set (local and external), never an additive patch. Omitted fields preserve stored evidence; `[]` explicitly clears. Replaced owners' old rows are removed before effective closure; seeds preserve both old and new endpoint projects, including newly joined components. Both stored corruption and effective-state conflicts are checked separately.
- `reader.findCycle(projectIds, changes=[])` reads fresh per invocation, then delegates to existing `findStepNodeCycle`; the output is `StepNodeCycle|null`, independent of dates, calendars, engines, cache, holds reduction, admission writes or events.
- `reader.findStepReferences(projectId,stepId)` follows incident relationships and matches BOTH endpoint project and step identity, returning sorted relationship IDs.

Integration must construct these capabilities from the admitted current write transaction and expire them with that scope. It must not open a second connection, fabricate organization ownership, route graph reads through a scheduler, broaden other-project writes, or retain graph captures across staged commands. After-write guards should use staged facts without overlays; before-write guards should supply explicit project overrides and complete owner typed sets. The existing `DependencyGraphGuard` facade and its owned-empty local shortcut are deliberately unchanged in this lane: bind/replace them in the integrator before enabling external authoring. No production claims are made for current facade behavior with external relationships.

The full plan-capture lane can adapt its per-project captured graph facts to `ConnectedDependencyGraphState` and reuse these resolvers. Its scheduling/capture ownership and lifetime remain separate. Barrels export the new domain graph and core reader/value interfaces. The context helper stays available from its existing explicit `service/dependency-graph` module, matching existing import style.

## Verification

Final focused regression command (exit0, **146 pass /0 fail /346 assertions**, nine files):

```sh
bun test libs/wbs/domain/domain/src/connected-step-node.test.ts libs/wbs/domain/domain/src/slice-edges.test.ts libs/wbs/domain/domain/src/schedule-typed-dependency.test.ts libs/wbs/domain/domain/src/schedule-shapes.test.ts libs/wbs/domain/domain/src/dependency.test.ts libs/wbs/domain/domain/src/step-node.test.ts libs/wbs/domain/domain/src/typed-dependency.test.ts libs/wbs/application/core/src/service/connected-dependency-graph.test.ts libs/wbs/application/core/src/service/dependency-graph.test.ts
```

Full output: `/tmp/puni-graph-final-tests.log`.

Fresh typechecks, both exit0 with empty diagnostic logs:

```sh
bunx tsc --build --force libs/wbs/domain/domain/tsconfig.json
bunx tsc --build --force libs/wbs/application/core/tsconfig.json
```

Logs: `/tmp/puni-graph-final-domain-types.log`, `/tmp/puni-graph-final-core-types.log`. Initial core check showed only the two known compensating fixture inference errors; the root's reviewed auxiliary commit removed those. The first domain typecheck also caught incomplete PlannedRow fields in the new test fixture; corrected with actual position/priority/frozenNumber fields and rechecked successfully.

Changed-path ESLint, exit0 with no diagnostics (all nine manifest paths), after `NX_DAEMON=false bunx nx graph --file=/tmp/puni-graph-projects.json` (exit0) generated the required module-boundary graph:

```sh
bunx eslint libs/wbs/domain/domain/src/connected-step-node.ts libs/wbs/domain/domain/src/connected-step-node.test.ts libs/wbs/domain/domain/src/slice-edges.ts libs/wbs/domain/domain/src/index.ts libs/wbs/application/core/src/service/connected-dependency-graph.ts libs/wbs/application/core/src/service/connected-dependency-graph.test.ts libs/wbs/application/core/src/service/dependency-graph.ts libs/wbs/application/core/src/service/dependency-graph.test.ts libs/wbs/application/core/src/index.ts
```

Log: `/tmp/puni-graph-final-lint.log`. Initial direct lint lacked a cached Nx project graph and skipped that rule; final lint ran with the graph and had no such warnings. Initial lint also found import/export ordering and test fixture Promise/Bun assertion lint issues; corrected rather than suppressed.

Same nine paths with `bunx prettier --check`: exit0, all matched files formatted (`/tmp/puni-graph-final-format.log`). `git diff --check`: exit0. No any, unchecked casts, non-null assertions or eslint-disable directives introduced in production.

Full Nx lint/test/build gates, backend mounted controller tests, module-specific checker, CI secrets/migration checks, SQLite observation adapter proofs and h2/h4 gate are **not run** in this foundation lane. They remain root/integration verification; no scheduling, browser, deploy, push or merge was performed.

## TDD and R5 observations

New domain and reader tests were written before production modules; initial missing-module RED logs are `/tmp/puni-graph-domain-red.log` and `/tmp/puni-graph-reader-red.log`. These are feature-absence/import diagnostics, not safety-proof claims. The context-helper test initially failed on its absent export (`/tmp/puni-graph-context-red.log`). A later missing-local-endpoint behavior test failed with an actual accepted graph before adding local supplied-context endpoint validation (`/tmp/puni-graph-local-facts-red.log`), then passed.

**40 isolated injected faults were observed failing their targeted production-function tests, each immediately restored and re-run GREEN.** Adjacent `Proof:` comments name the injected fault and observed case. No fault remains applied.

Fault runners: `/tmp/puni-graph-mutations.py` (28 initial faults), `/tmp/puni-graph-lifetime-mutations.py` (five separately removed lifetime assertions), `/tmp/puni-graph-extra-mutations.py` (stale incidents/full capture and project-level cycle refusal). Four additional single fault invocations exercised wrong-project reach, two isolated local endpoint checks and isolated duplicate empty-project ownership (40 including the earlier batches). Each invocation used `bun test <actual production test file> -t <case>`; the initial runner asserts a nonzero test assertion failure, then restores the file and asserts exit0. Per-fault output is `/tmp/puni-graph-fault-<name>.log`; restored output is `/tmp/puni-graph-restored-<name>.log`. Initial runner summary: `/tmp/puni-graph-mutation-summary.log`.

Fault names / effects:

- `duplicate-project`: original fixture was masked by work-item uniqueness and is superseded diagnostic evidence only. `duplicate-project-isolated` removes the project uniqueness check with duplicate empty contexts, independently accepts them and fails `refuses duplicate empty project identities without ownership masking`. `duplicate-work-owner` independently accepts ambiguous work-item ownership.
- `missing-project-diagnostic`, `missing-work-item-diagnostic`, `missing-slice-diagnostic`: removal still throws downstream, but loses the explicit required-fact refusal. These prove diagnostics only, **not unsafe graph acceptance**.
- `empty-slice`: accepts a whole predecessor edge at position-1.
- `local-successor`, `local-predecessor`: original non-isolated fixtures still failed downstream endpoint lookup after classification removal, so those original logs are **diagnostic only**. Stronger independently isolated `local-predecessor-isolated` and `local-successor-isolated` keep the work-item lookup valid but falsify the endpoint project; removing the corresponding equality now accepts foreign-scoped local state. Adjacent comments cite these stronger proofs.
- `external-local`: accepts local state misclassified as external.
- `conflicting-domain-identity`: accepts a conflicting reused relationship ID.
- `local-endpoint-evidence`: accepts absent required local endpoint facts in a supplied context.
- `omit-expanded-pair`: drops two remote parent expansion pairs; the four-pair literal assertion fails.
- `wrong-remote-context`: incorrectly resolves the remote parent under the predecessor's tree and throws rather than producing the required four constraints. This is wrong-context refusal evidence, not an unconstrained successful graph claim.
- `duplicate-override`: silently accepts ambiguous project overrides.
- `proposed-owner`, `proposed-successor`: each equality is bypassed independently with an isolated malformed owner fixture and accepts it.
- `stored-owner`: accepts an inconsistent successor owner.
- `stored-conflict`: accepts contradictory stored identities even when an override strips that owner, so the effective-state check cannot mask this proof.
- `effective-conflict`: accepts a proposed/retained identity collision, independently of stored consistency.
- `non-incident`: accepts unrelated relationship evidence.
- `missing-project-core-diagnostic`: removing the explicit missing-project check reaches the later required-facts fixture refusal; **diagnostic only**, not unsafe acceptance.
- `mismatched-project-core`: accepts the wrong project identity.
- `foreign-row`: accepts a cross-owned work item.
- `authority`: bypasses the required authority call and reads forbidden b.
- `expiry`: removing all lifetime assertions accepts an expired reader.
- `lifetime-boundary-1` through `lifetime-boundary-5`: individually removing each assertion fails the targeted empty-observation/after-authority/after-incidents/after-project/after-full-facts test. Assertions check refusal and that later project/tree reads have not happened; later expiry checks cannot mask those side effects.
- `incoming-closure`, `outgoing-closure`: separately omit required reached projects.
- `old-new-seeds`: loses the old disconnected component from the captured affected project set.
- `stale-incidents`: retaining incidents across evaluations misses a newly staged reverse relationship and returns no cycle.
- `stale-graph`: retaining full capture across evaluations misses a newly staged estimate-anchor cycle.
- `project-cycle-refusal`: adding a project-level reverse-edge cycle check falsely rejects A.design→B.build→A.test.
- `wrong-project-reach`: forcing all projects to the target's anchor-slice convention changes B's independently whole-item legacy attachment from1 to0.

Existing local slice-edge refusal/FS/SS/FF proofs are preserved on the unchanged endpoint resolver. Full structural caller/command guard bypasses, mounted DB atomic rollback/history/event proofs, actual SQLite borrowed ownership/lifetime and concrete same-organization authority are intentionally pending the assigned integration lane; these unit proofs do not claim those integrations.

## Self-review

Reviewed final changes against the Astra ruling: independent endpoint contexts, existing node identity and cycle algorithm, every expanded pair, per-project reach/steps/estimate anchors, unreduced held cycles, strict owner/corrupt evidence handling, incoming/outgoing discovery, old/new seeds, per-evaluation freshness and required admission/lifetime contract. No scheduling API or full-capture dependency was added. Root should commission the requested Astra independent review before committing/integrating this frozen graph delta.

Frozen content hashes: `/tmp/puni-connected-graph-manifest.sha256`.

## Followup proof audit and final correction

Root began its normal-hook base graph commit before the worker's unfreeze message arrived. The separate followup changes ONLY the domain Proof comment and adds the isolated duplicate-empty-project test; production algorithm is unchanged. Root will preserve that followup separately. Original `duplicate-project` fault evidence is explicitly superseded/diagnostic because work-item uniqueness still refused. The new `duplicate-project-isolated` log shows actual graph acceptance with the project guard removed, then restored GREEN.

All **40** fault logs were audited for an actual named `(fail)` test, exactly `1 fail`, and no unhandled setup/import error; `/tmp/puni-graph-proof-audit.log` lists every execution. Intended assertions were inspected as well. No no-match exit is counted as proof. The diagnostic-only categories above remain distinct from unsafe acceptance.

After this two-path followup: `bun test libs/wbs/domain/domain/src/connected-step-node.test.ts` passed **14 tests /0 failures** (`/tmp/puni-graph-final-domain-followup.log`); full domain `bunx tsc --build --force libs/wbs/domain/domain/tsconfig.json` passed; changed two-path ESLint, Prettier check and `git diff --check` passed. The original nine-file146-test regression and full core checks above predate only this test/comment correction. Final content hashes were refreshed in `/tmp/puni-connected-graph-manifest.sha256`.
