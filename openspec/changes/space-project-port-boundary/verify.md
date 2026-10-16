# Space project port verification

Verified 2026-10-16 in isolated clone `/tmp/wbs090-space-project-port`.
Exact aggregate #514 base: `f3686898014b9488b33081aa7003acac470b0b51`.
The coordinating agent verified this public head and its running host gate;
this clone used that exact local object. Sandbox remote DNS was unavailable.

## Scope

`SpaceResourceOptions.projects` uses neutral `ProjectRead extends ProjectList`.
`readWithin(id: string, access: ResourceAccess)` retains
`Promise<ZonedProjectWithSteps | null>`. ProjectWithSteps, ZonedProject and
ZonedProjectWithSteps moved unchanged into the port and remain re-exported
from the project resource. `app.ts` still supplies `opts.projects` directly.
No runtime statement, authorization, work-item edge, cache or policy mode changed.
Existing domain terms suffice; no ADR or design document was needed.

## Committed production K6 oracle

The retained tree-announcement policy was copied unchanged outside the candidate
to `/tmp/space-project-k6-policy.json`, SHA-256
`5885c9123745f2ff469cf8f486abc3ba4b8bb729d4f3628eaccd501006fc9422`.
Trusted dependencies remained outside candidate materialization at
`/home/df/wd/puni/puni-00/node_modules`.

```sh
TOOL_WIKI_TRUSTED_NODE_MODULES=/home/df/wd/puni/puni-00/node_modules \
  bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check committed \
  . <candidate-sha> /tmp/space-project-k6-policy.json --rule K6 > /tmp/verdict.json
python3 openspec/changes/space-project-port-boundary/evidence/check-boundary.py.txt \
  openspec/changes/space-project-port-boundary/evidence/baseline.json.txt /tmp/verdict.json
```

| Candidate                                                  | Observation                                  | Boundary oracle |
| ---------------------------------------------------------- | -------------------------------------------- | --------------- |
| Base `f3686898014b9488b33081aa7003acac470b0b51`            | Three debts, selected edge present           | Exit 1          |
| Green `124f1416d244e0f6cff63a362ff7c9dc8e1d07cb`           | Two debts, selected edge absent              | Exit 0          |
| Direct fault `5af4efe2d8b968010084759329e64378246cf6d4`    | Concrete Pick restores edge                  | Exit 1          |
| Re-export fault `1045afe42845b85fb416cd551c46d0b5be048214` | Neutral-looking port re-export restores edge | Exit 1          |

All production CLI invocations exited 0, reported `unevaluated: []`, selected
only K6 and retained `certifies: false`. The oracle compares unrelated findings
as a multiset and requires exactly two remaining debts. Remaining edges are
imported-plan to directory and space to work-item. Observe-mode `allowed: true`
is not certification. Fault commits are isolated commit-tree objects with
reconstructable patches; the working tree was restored after each construction.
The final source sorts imports and uses a JSDoc import link for the moved timezone-store reference relative to the first green candidate. The initial scoped lint and normal commit hook caught import sorting and an unused JSDoc-only import; both were corrected before final verification.

## Runtime refusal proof

Temporarily replaced the `canOpenAll` null-read refusal with an awaited read.
The existing hidden-member subset failed three tests: adding after the hidden
anchor, moving a hidden member/anchor, and removing the hidden member. Its
visible-member test passed. Restored the exact original statement and watched
all four tests pass (10 assertions). The existing adjacent test Proof comments
name these faults; no runtime safety check changed. Raw negative and restored
logs are retained. No new filesystem boundary requires absence/unreadability
proofs.

## Scoped verification

```sh
BUN_TMPDIR=/tmp bun install --frozen-lockfile
bun test libs/wbs/application/core/src/service/space.resource.test.ts \
  apps/wbs/be-01/src/controller/space-organization.controller.db.test.ts \
  libs/wbs/adapters/store-sqlite/src/space.db.test.ts \
  libs/wbs/adapters/store-sqlite/src/space-rollback.db.test.ts --timeout=10000
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p wbs-core,wbs-be-01 --skip-nx-cache
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint -p wbs-core,wbs-be-01 --skip-nx-cache
BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate space-project-port-boundary --strict --json
BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate --all --json
```

Frozen install checked 1573 installs across 1447 packages, no changes, after
sandbox escalation (initial restricted install failed EROFS). Focused tests:
63 pass, 0 fail, 242 assertions across four files. Scoped typecheck: four tasks
successful. Scoped lint: two tasks successful. Strict change validation: one
passed; all validation: 225 passed, zero failed. Raw outputs are retained.

Full workspace format/test/lint/typecheck/build, browser checks and
`bin/h2puni-gate.sh <sha>` were not run; the coordinator owns exact-head host
gating and release acceptance. No push, merge, deployment, policy activation
or archive was performed. WBS090 remains blocked_by_proxy overall.

Retained fault patches replayed against green into isolated temporary indexes and produced exactly the recorded direct and re-export fault trees. Raw log files have terminal carriage returns and trailing spaces normalized for committed-range whitespace checks; verdict and policy bytes remain unchanged.
