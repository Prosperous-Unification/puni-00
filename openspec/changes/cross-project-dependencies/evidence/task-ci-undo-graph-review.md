# Independent backend graph undo review

Verdict: **APPROVE for bounded integration** of `b1747da4c450add7a851e3d9c41b2f0a0a3366b0` onto its parent `b01b1938ae142f581fda399210e572c543084d95`. No blocking findings. This is approval of the two-file fix, not a claim that the feature branch or full CI gate passes.

Reviewed the clean `/tmp/puni-backend-graph-fix` checkout, repository instructions/index, commit diff, archived conditional undo specification/design, `applyRestore` and its replay callers, ordinary dependency admission, connected graph validation, and relevant SQLite/memory tests. No source, index, HEAD, or branch changes were made.

## Findings

- The CI evidence in `/tmp/puni-backend-nx.log` identifies the original undo test failure at `prepareDependencyGraph`: an optional historical edge naming an absent work item was passed into the strict trusted-state graph validator. The workspace log records the failed backend test target among the failed jobs. This matches the supplied job 119760779123 failure evidence; I did not independently query GitHub.
- `openspec/changes/archive/2026-08-10-conditional-undo/specs/wbs-domain/spec.md:182` explicitly requires restoring the branch while skipping outside edges whose far endpoint disappeared or whose ordinary dependency rules no longer allow restoration, reporting how many were omitted. Design D8 says the same and names `canDepend`. The change restores this precise contract; it does not require inventing a new behavior/spec.
- `work-item.resource.ts:8277` starts the projected graph with all live and required internal dependencies. Only historical optional outside edges enter the admission loop. Each accepted edge is appended before considering the next, so multiple individually plausible edges cannot collectively bypass cycle admission.
- Graph preflight receives this exact selected edge set, before any restore writes. The later writer iterates the same `externalDependencies` selection. Endpoint/project writes and fresh dependency IDs retain their previous behavior. Reparenting and restored rows are included in the projected tree. No guard was weakened, catch/default introduced, or required edge filtered out.
- Missing predecessor and successor cases now both retain a valid surviving outside edge. Newly cyclic outside edges are omitted with the existing count/reason response. Existing/internal edges remain unfiltered: absent endpoints still throw through `prepareDependencyGraph`, and graph cycles/typed endpoint conflicts still reach structural refusal. The post-apply graph check also remains intact.
- `/tmp/puni-backend-negative.log` contains the claimed watched negative: bypassing selection yielded 1 pass / 3 fail. The cycle restoration refused as stale history; both missing-endpoint restorations threw at the strict graph guard. The adjacent Proof comment accurately describes those observations. I inspected this supplied mutation run rather than mutating the read-only review checkout.

## Fresh verification

At the reviewed SHA:

```sh
bun test apps/wbs/be-01/src/service/undo.db.test.ts apps/wbs/be-01/src/controller/connected-command-admission.controller.db.test.ts libs/wbs/application/core/src/service/dependency-graph.test.ts libs/wbs/application/core/src/module/work-item/work-item.resource.test.ts --timeout=10000
```

Passed: 343 tests, 0 failures, 2212 assertions, four files (43.69 seconds), exit 0. Output: `/tmp/puni-backend-review-tests.log`. Includes all four outside-edge restoration cases, connected replay-restore failure with no partial effects, both absent legacy endpoint directions, and the live-tree corrupt predecessor refusal.

```sh
bunx tsc --build --force libs/wbs/application/core/tsconfig.json
git diff --check HEAD^ HEAD
```

Both exited 0. Typecheck output: `/tmp/puni-backend-review-tsc.log` (empty). Final `git status --porcelain` was empty and HEAD remained the reviewed SHA.

Not run by this review: full backend suite, backend-specific typecheck, lint/format/build, full host gate, or refreshed hosted CI. Those remain integration verification responsibilities; the original multi-project CI had other failing targets outside this bounded fix.
