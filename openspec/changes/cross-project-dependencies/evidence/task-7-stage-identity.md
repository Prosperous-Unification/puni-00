# Connected stage identity foundation handoff

Worktree: `/tmp/puni-cross-stage-identity`
Base HEAD: `9f4c968813da388aea6cc7356baa1b3ed57281a3`
No commits, pushes, barrel/package exports, version allocation, migrations, runtime/core/SQL/Python edits or original-checkout edits.

## Files frozen for review

- `libs/wbs/domain/domain/src/connected-optimization-input.ts`
  SHA-256 `1e5d2ff3812ef530e30d43dedcd1ed661c656db9c305a0cf04da36b69ac25b56`
- `libs/wbs/domain/domain/src/canonical-connected-stage-input.ts`
  SHA-256 `44f8cfccccf680e5177ba19dfef2ca8b84f782a24ffc53fd309ad3d1d74ba716`
- `libs/wbs/domain/domain/src/canonical-connected-stage-input.test.ts`
  SHA-256 `458f632dacc66c4f0c180b21899665f6d6c49678ee98f5b72ca39e621d3fd8d4`

These are the only untracked changes in the worktree. The historical `canonicalScheduleInput` implementation and tests remain untouched.

## Delivered contract

`ConnectedOptimizationStage` has the exact frozen ruling shape, domain-only imports, and the complete reduced `ResolvedScheduleInput`, scoped authored selectors, project/rank/anchor/mode/origin evidence and exact real composite starts/finishes.

`canonicalConnectedStageInput` returns deterministic JSON constraint bytes. It preserves per-leaf step order; sorts maps, nodes, edges, relationship sets and pool sets bytewise; serializes finite real values without rounding; ignores row labels/names/abbreviations/audit fields and frozen numbers. It covers row identity/tree/position/priority, each slice's effort/width/person/teams/resources, floor/deadline/elsewhere/capacity maps, complete graph provenance/type/relationship attribution, original scoped authored selectors, project ownership/ranks/anchors/origin/mode/stage owner, and local plus foreign real starts/finishes. It does not mutate capture maps or arrays.

The reduced ownership map must cover exactly every reduced row (including parents). Every project/rank is captured, including empty projects. Null anchors are accepted only for projects without active reduced slices. Existing `validateResolvedGraph`, `indexTree`, `groupSlicesByLeaf` and `checkElsewhere` remain the authoritative existing graph/slice/calendar boundaries; no leveller, endpoint-expansion engine or baseline feasibility search was introduced.

Authored selectors may name held/original rows absent from the reduced map. The canonicalizer checks available project ownership and authored graph ID/type correspondence, preserves those original selectors, and refuses malformed selector scope/step/identity evidence. It cannot prove that an original removed selector existed in the full authored capture, nor infer omitted authored edges. The core builder must validate those facts before reduction, and must validate the baseline's real hard constraints. Empty local stages/no-stage metadata remain the builder's responsibility.

SHA-256, objective, installed runtime contract, budget, quantum, wire version and the complete question tuple remain adapter/runtime work. These pure bytes do not claim that 7.3 or mandatory 7.4 persistence, Retry, restart, publication fencing or runtime readiness is delivered.

## Fresh verification

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph --file=/tmp/puni-stage-project-graph.json`: exit 0, actual graph generated before lint. Log `/tmp/puni-stage-graph.log`.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-domain:typecheck`: exit 0, uncached named target. Log `/tmp/puni-stage-types.log`.
- `bunx tsc --build --force libs/wbs/domain/domain/tsconfig.spec.json`: exit 0, explicit spec compilation. Log `/tmp/puni-stage-spec-types.log`.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-domain:lint`: exit 0, named target, no boundary-rule skip warning. Log `/tmp/puni-stage-lint.log`.
- From the domain project cwd, `bun test ./src/canonical-connected-stage-input.test.ts ./src/canonical-schedule-input.test.ts ./src/connected-step-node.test.ts ./src/schedule-connected.test.ts`: exit 0, **175 pass / 0 fail**, 4 files. New canonical suite contains **96** tests. Log `/tmp/puni-stage-focused-tests.log`.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-domain:test --skip-nx-cache`: exit 0, **1331 pass / 1 skip / 0 fail**, 91 files. The existing optional performance certification `certifies 600 slices in under 20ms elapsed` is skipped by the suite. Log `/tmp/puni-stage-domain-tests-source.log`.
- `bunx prettier --check` against all three new files: exit 0. Log `/tmp/puni-stage-format-check.log`.
- `git diff --check`: no output; since these are new untracked files, also ran `git diff --no-index --check /dev/null <file>` for each new file. Each produced no whitespace diagnostics and exit 1 (the files differ from `/dev/null`). Formatting is independently green.

An earlier root-cwd `bun test libs/wbs/domain/domain/src` invocation accidentally also discovered emitted `dist/out-tsc` test copies. It reported 2406 pass / 2 skip / 19 fail, including absent emitted theme/README/migration assets and unresolved emitted `@wbs/validation` imports. It is not claimed as a valid source-domain run. The actual named target with its declared domain cwd passed above. Historical output remains `/tmp/puni-stage-domain-tests.log`.

No full repository/host gates, builds, deployment checks or installed solver checks were run, as instructed for this isolated foundation lane. Fresh root integration review and the required host gate remain pending.

## TDD and watched production faults

Initial focused test ran against a deliberately empty canonical implementation: **0 pass / 1 actual assertion fail** (`retains exact local and foreign placements without rounding`), not an import/zero-test failure. Log `/tmp/puni-stage-tdd-red.log`. The initial full test-first sweep showed 2 pass / 71 assertion failures before implementation (`/tmp/puni-stage-full-red.log`). Later additions independently caught vocabulary, ownership, absent required facts and null/numeric original-selector acceptance before their guards were implemented (`/tmp/puni-stage-vocabulary-red.log`, `/tmp/puni-stage-ownership-red.log`, `/tmp/puni-stage-missing-red.log`, `/tmp/puni-stage-selector-red.log`).

Mutation driver `/tmp/puni-stage-proofs.ts` rewrote only the real production canonicalizer, invoked the actual focused Bun suite on each mutation, rejected nonzero runs with no named test assertion failures, and restored source in `finally`. Final run: **125 production mutations**, **108 assertion-failing mutations**, **17 surviving redundant/constant mutations**. Matrix: `/tmp/puni-stage-proofs.tsv`; individual full logs: `/tmp/puni-stage-proofs/`; driver completion: `/tmp/puni-stage-proofs-run.log`. All restored focused/domain/types/lint/format runs listed above are green. Adjacent `Proof:` comments identify actual injected faults and test names, including honest diagnostic/redundancy notes.

Important classifications:

- Removing exact reduced ownership size admits the extra retained ownership fixture; removing the row-owner check admits a bad owner on a retained parent independently of active slices.
- Removing the exact placement-map membership predicate admits matching, same-cardinality substituted local/foreign keys (`membership-placement-guard.log`). Removing finish cardinality admits surplus finishes. Start cardinality alone is redundant with exact membership plus the per-start finish lookup. The per-start finish presence/narrowing check alone is redundant with the complete exact-set check; its removal remains green and is explicitly marked redundant in source.
- Removing duplicate-slice refusal alone meets the existing graph refusal instead (diagnostic). Removing it together with the graph boundary admits the duplicate and fails `refuses duplicate slice` (`combined-duplicate-slice.log`).
- Removing connected-order refusal still throws through property access (diagnostic), and is not claimed as unsafe acceptance. Removing relationship evidence for a missing relationship still throws on later access, whereas removing that same check admits a conflicting linked type. An unsupported unused authored type independently catches the relationship-type check.
- Nonfinite rank/start faults can meet rank-consistency/reversed-interval checks after the generic finite check is removed. Combined removal admits those values; origin/anchor/effort/row/capacity/finish nonfinite faults independently fail with the finite guard removed. See `combined-nonfinite.log` and individual finite logs.
- Independent original-selector owner and expanded-edge owner fixtures distinguish both available ownership checks, without inventing a reduced-tree proof for held selectors.
- Serializer omission probes cover all 60 explicit properties. Survivor fields are constant stage kind; project ID/rank duplicated by complete rank/owner/project evidence; row ID duplicated by the exact ownership/slice/graph identity; slice step ID duplicated by graph nodes and exact placement keys; the whole node representation and its fields already determined by validated slices/positions; and edge type duplicated by authored relationship correspondence. These are genuine redundant representations, not claimed independent omission kills. Combined removal of rank representations fails the order-preserving rank mutation; combined removal of relationship/edge types fails changed-type cases. All other serializer properties have a watched failing omission case.

The sweep includes stable map/set permutations, per-field changes, exact next-representable foreign start, local/foreign placement distinctions, same-sized bad maps, full authored selector identity, provenance/attribution, label-only stability and no input mutation. It demonstrates this canonical foundation's refusals and identity coverage only; full SHA/key tuple field sweeps, earlier-stage/later-stage runtime integration, durable certificates, Retry/restart and publication proofs remain pending in the adapter/runtime integration and task 7.4.

## Retained evidence

Referenced logs, mutation matrix and drivers/probes are retained in [task-7-stage-proofs](task-7-stage-proofs/); driver/probe source is stored as text rather than discovered tests. Only trailing log whitespace was normalized. Failed initial invocations, redundant survivors and diagnostic-only observations remain explicitly distinguished.
