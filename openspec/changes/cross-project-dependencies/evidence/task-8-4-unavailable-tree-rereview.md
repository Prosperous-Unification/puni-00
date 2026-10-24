# Unavailable-tree packet rereview

Reviewed `5de47861a51a2c3cb5da30b5d38252fed4adf048` in `/tmp/puni-unavailable-tree` against the previously rejected `2869218bf82fb3f96e6a7b4e8953ece6db1bf603`. Verdict: **APPROVE for bounded packet integration**. The prior P2 finding is resolved; no new findings in this correction. This does not approve whole-feature completion or release.

The new guard in `work-item.resource.ts:9036` checks the final presented `tree.scheduleError`, after calendar conversion can refuse an otherwise scheduled capture. Every unavailable result returns its current rows and incident `connectedDependencies` before holder transfer, waiting-count recalculation, holder catalog attachment or resource-label attachment. The guard therefore covers connected calendar-range refusal as well as initially unavailable placement. It introduces no local scheduling or additional reads.

The scheduled path remains the existing code below that guard: foreign person predecessors become qualified elsewhere holders, target-local person arrows survive, waiting counts are recomputed consistently, and resource labels retain their existing path. The fresh mounted scheduled-holder/Gantt and mixed local/foreign wait regressions passed.

The corrected mounted range test now uses `shareAna(remote, target)`, so its captured placement actually contains foreign holder evidence. It verifies HTTP 200, `calendar_range`, null row forecasts, empty slices, zero person/capacity waiting counts and absence of optimization, holder catalogs and resource labels. I inspected `/tmp/puni-unavailable-holder-red.log` and `/tmp/puni-unavailable-holder-proof.log`: both fail precisely at the unexpected `elsewhereHolders` assertion with the captured Remote row catalog. The adjacent `Proof:` comment accurately names the removed guard and observed regression. I did not repeat a production mutation during this read-only rereview.

## Independent verification

```sh
bun test libs/wbs/application/core/src/service/connected-plan.test.ts libs/wbs/application/core/src/service/connected-tree.test.ts libs/wbs/domain/contracts/src/http/work-item-response.test.ts apps/wbs/be-01/src/controller/cross-project-live.controller.db.test.ts
```

Passed with exit 0: **96 tests, 345 assertions**, including the combined shared-person/calendar-range regression. Full output: `/tmp/puni-unavailable-rereview-tests.log`. Expected refusal tests emit error logs; the optimized-unavailability fixture also logs its already documented unsupported connected optimizer path. Neither is a new finding in this correction.

`git diff --check 2869218bf82fb3f96e6a7b4e8953ece6db1bf603..5de47861a51a2c3cb5da30b5d38252fed4adf048` passed. Source worktree remained clean and HEAD matched the requested commit. No repository source was edited.

## Approval limits

All broader boundaries from `/tmp/puni-unavailable-tree-review.md` remain in force. In particular, the recorded TypeScript errors in `person-load.feature.ts:432` and `space.resource.ts:405` require integration fixes; truthful nullable displayed-engine roll-ups also remain required. I inspected the new TypeScript log but did not rerun typecheck. Lint, formatting, OpenSpec validation, frontend coverage, full host gate, full build, deployment and live activation were not independently rerun here. The remaining task 8.4/9.2 proof matrix is not established by these focused suites and must stay open. This approval accepts the bounded domain/transport/presenter packet and its P2 correction only.
