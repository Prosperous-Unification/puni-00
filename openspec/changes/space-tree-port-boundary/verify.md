# Space tree port verification

Verified 2026-10-16 in isolated worktree `.worktrees/wbs090-space-tree-port-sol`.
Immutable base: wave8 #535, `f6f867ecf059e79fcaa2083e2439a33795910c58`.

## Scope

`SpaceResourceOptions.trees` uses neutral `TreeRead`. Its shared entry remains
`Extract<Awaited<ReturnType<TreeRead['sharedTreesWithin']>>, { readonly kind: 'shared' }>['entries'][number]`.
`PlanTree` replaces the exact inline successful `tree` payload; its required
`IdentifiedSlice`, `ScheduleError` and `PlanOptimization` declarations moved
unchanged with their JSDoc into `ports/plan-tree.ts`. All four resource type
exports remain available. The concrete resource's `treeWithin` and
`sharedTreesWithin` signatures remain unchanged. `app.ts` still passes
`opts.workItems` directly, preserving the method receiver.

A normalized source comparison confirmed the payload and three supporting read
declarations match the base apart from JSDoc and whitespace. A Bun.Transpiler
comparison confirmed the base and extracted work-item resource emit identical
JavaScript. There are no runtime statement changes, new recovery paths or new
runtime safety checks. Existing domain terms suffice; no CONTEXT or ADR change.

## Committed production K6 oracle

The existing extraction policy was copied unchanged outside the candidate to
`/tmp/space-tree-k6-policy.json`, SHA-256
`5885c9123745f2ff469cf8f486abc3ba4b8bb729d4f3628eaccd501006fc9422`.
A copy is retained in `evidence/policy.json.txt`. The CLI selects only K6.

```sh
TOOL_WIKI_TRUSTED_NODE_MODULES=/home/df/wd/puni/puni-00/.worktrees/shared-restore-activation-sol/node_modules \
  bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check committed \
  . <candidate-sha> /tmp/space-tree-k6-policy.json --rule K6 > /tmp/verdict.json
python3 openspec/changes/space-tree-port-boundary/evidence/check-boundary.py.txt \
  openspec/changes/space-tree-port-boundary/evidence/baseline.json.txt /tmp/verdict.json
```

| Candidate                                            | Observation                                                     | Oracle |
| ---------------------------------------------------- | --------------------------------------------------------------- | ------ |
| Base `f6f867ecf059e79fcaa2083e2439a33795910c58`      | Two findings, selected edge present                             | Exit 1 |
| Green `7bfe2e8317de0afb3e894ad69270f7e42c6ca3b0`     | One finding, selected edge absent                               | Exit 0 |
| Direct `4295db8ea19828126929d9d0a15a605866aca3b7`    | Concrete Pick restores edge                                     | Exit 1 |
| Re-export `5aff0b10c8a889cf2d373d78afa634dc72352e65` | Concrete service re-exported through neutral port restores edge | Exit 1 |

All four CLI calls exited 0 with `unevaluated: []`, `certifies: false`.
The exact comparison removes only space-to-work-item; plan-import-to-directory
remains identical as a multiset. Observe-mode `allowed: true` is not certification.
Faults are isolated commit-tree objects with reconstructable patches; no branch
or working source was mutated for the faults. The green source snapshot precedes
only a moved JSDoc correction replacing an unexported UNSCHEDULED link with prose.

### Observed K6 alias blind spot

An initial alias fault at `0b340e29ad328c12d96bee37012b71dc6566793f`
replaced TreeRead inside its port with a locally imported concrete
`Pick<WorkItemService, 'treeWithin' | 'sharedTreesWithin'>`. K6 did not restore
the selected edge, and the exact boundary oracle passed unexpectedly. Its patch
is retained as `evidence/alias-blind-spot.patch.txt`; this is a rule limitation,
not a passing negative. The accepted transitive negative above instead uses the
explicit re-export pattern from the prior extraction. This slice makes no claim
that K6 detects every transitive alias. The new production port is an interface
with no concrete import or alias; no K6 implementation or policy was changed.

## Scoped checks

```sh
bun test libs/wbs/application/core/src/service/space.resource.test.ts \
  apps/wbs/be-01/src/controller/space-organization.controller.db.test.ts \
  apps/wbs/be-01/src/controller/person-load.controller.db.test.ts --timeout=10000
bun node_modules/.bin/tsc --noEmit -p libs/wbs/application/core/tsconfig.lib.json
bun node_modules/eslint/bin/eslint.js \
  libs/wbs/application/core/src/ports/plan-tree.ts \
  libs/wbs/application/core/src/ports/tree-read.ts \
  libs/wbs/application/core/src/service/space.resource.ts \
  libs/wbs/application/core/src/module/work-item/work-item.resource.ts
BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate space-tree-port-boundary --strict --json
```

- Owning tests: exit 0, 60 pass, zero fail, 238 assertions across three files.
  They cover hidden members, scoped assignee names, unavailable engines and
  shared incoming-calendar cache refresh. Raw output retains optimizer child
  `SQLITE_CANTOPEN` logging during fixture teardown; the tests pass.
- Changed-file Prettier check: exit 0; all selected production and OpenSpec files formatted.
- Core production noEmit typecheck: exit 0 with no output.
- Changed-file ESLint: exit 0. Its Nx module-boundary rule was skipped because
  this worktree has no cached graph; module-boundary lint remains unverified.
- Strict scoped OpenSpec validation: exit 0, one change passed, zero failed.
- Initial root dependency symlink failed before K6 evaluation because
  `@noble/hashes` was absent. Replaced it with ignored symlink to the persistent
  shared-restore-activation-sol installation; its lockfile matches byte-for-byte,
  SHA-256 `15651c976776d7c1ab3a87935b53dae67e73939c6f7d06dec12ed10598cfe80c`.
  No install ran. At selection: MemAvailable 21,066,864 kB, disk 178G available.
- The first typecheck command used a nonexistent legacy TypeScript binary path;
  the installed `.bin/tsc` command above then passed. Pinned OpenSpec needed
  cache-write sandbox escalation; restricted direct cached invocations failed
  before validation with EROFS.

Full workspace format/test/lint/typecheck/build, full Burokrat, browser checks,
all-change OpenSpec validation and `bin/h2puni-gate.sh <sha>` were not run under
the coordinator's RAM constraint. The coordinator owns exact-head host gating
and acceptance. This slice does not certify or close WBS090. No push, merge,
deployment, policy activation or archive has been performed.

Retained log files normalize terminal carriage returns and trailing whitespace; verdict and policy bytes are unchanged.

Retained fault patches use zero context to avoid trailing whitespace in empty context lines; `git apply --unidiff-zero --check --cached` passed against each exact green tree.
