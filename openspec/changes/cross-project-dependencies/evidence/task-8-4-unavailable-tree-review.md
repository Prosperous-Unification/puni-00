# Independent unavailable-tree packet review

Reviewed commit `2869218bf82fb3f96e6a7b4e8953ece6db1bf603` against `6ca21df77` in `/tmp/puni-unavailable-tree`, using `/tmp/puni-unavailable-tree-architecture.md` and the packet evidence. Verdict: **REJECT pending one bounded presenter fix**. This is a packet review, not a whole-feature release review. No repository source was edited.

## Findings, ranked by severity

### P2 — Calendar-range refusal reattaches foreign holder labels after clearing forecasts

Location: `libs/wbs/application/core/src/module/work-item/work-item.resource.ts:9051–9064`, interacting with the changed unavailable projection at lines 9434 and 9529.

For a scheduled connected component with a shared person, `projectConnectedTree` captures a nonempty `foreignPersonHolders` map. If calendar display preflight then throws `CalendarRangeError`, `projectTree` correctly returns `scheduleError: 'calendar_range'`, null row schedules/dates, and empty slices. However, `presentConnectedTree` subsequently branches only on the captured holder-map size and adds `elsewhereHolders` from the abandoned placement, together with `waitingElsewhere: 0`.

This violates the architecture's requirement to clear selected-placement display evidence on connected calendar-range failure and the packet's claim that unavailable trees omit displayed holders. It is not hypothetical: I copied the mounted suite to an external `/tmp` test file, added the existing `shareAna(remote, target)` setup to the new range test, and ran it against unchanged production code. The response passed the null forecasts/empty slices assertions but failed `expect(tree.body).not.toHaveProperty('elsewhereHolders')`, returning the captured Remote row catalog. The current committed range test has no foreign holder and therefore cannot detect this.

Fix: condition holder transfer/catalog attachment on the final presented tree still having available placement, rather than only the earlier captured placement. Add the combined shared-person/calendar-range mounted regression and watch its production guard fail when removed. Keep the existing scheduled-holder tests green.

Reproducer: `/tmp/puni-unavailable-range-review.test.ts`. Output: `/tmp/puni-unavailable-range-review.log`. Command:

```sh
bun test --tsconfig-override /tmp/puni-unavailable-tree/tsconfig.base.json /tmp/puni-unavailable-range-review.test.ts -t 'mounted connected calendar range'
```

Observed: 1 failed test, 8 assertions, specifically the unexpected foreign holder catalog. Bun also emitted a directory-mismatch diagnostic for the external tsconfig override; the mounted request completed and the recorded failure is the concrete response assertion above. An earlier invocation pointed at nonexistent `tsconfig.json` and failed before collection; that attempt is not behavioral evidence.

## What the bounded packet establishes

- A single framework-free domain union is re-exported at the historical core import and matched by the transport schema. Both structured arms keep required evidence and nonempty project arrays; existing strings/null survive. Generated endpoint OpenAPI is tested from actual shared shapes.
- The production connected branch keeps captured readiness and incident relationships. Nonscheduled placement bypasses schedule selection and supplies no synthetic Fast schedule. Accounting projection still uses target facts. I found no introduced target-local scheduler invocation or fabricated forecast spans in these branches.
- Mounted missing-calendar and both real optimized-refusal cases return 200 with rows, links, null spans and empty slices. Paged/detail subsets preserve their narrower contracts.
- Successful calendar-unavailable create and remote-progress-permitted claim publish durable `tree_replaced` containing current rows. Local standalone engine refusal still follows the existing `plan_unavailable` branch.
- The existing three watched fault logs are present and show meaningful failures: restoring the old presenter throw produces mounted 500s including postcommit publication; removing the connected row guard exposes zero-offset placeholders; replacing the shared schema union with `unknown` accepts malformed evidence. Their adjacent comments match the observed faults. These are genuine production mutations, not mocked success values.

## Integration boundaries and evidence limits

The two known downstream type errors are real required follow-up work, not reason to weaken this union: `person-load.feature.ts:432` needs explicit mapping, and `space.resource.ts:405` needs the exact roll-up contract plus truthful displayed-engine nullability. The current space caller still defaults absent optimization to displayed Fast. Those excluded consumers must be completed before an integrated delivery can be approved. Accepting a bounded packet after the P2 repair does not approve shipping these incompatibilities.

The full architecture proof matrix is not complete here. In particular, the shared-schema test is not the actual HTTP frontend-client proof; existing mounted corruption cases do not establish missing/unreadable foreign metadata and readiness under unavailable placement; the new unavailable publication test does not itself hold delivery and count journal entries; event suppression/empty-row mutations, explicit premature claim while unavailable, peer installation, retained/aggregate/load/space behavior, arrangement admission and transitive fanout are not established by this packet. The evidence appropriately leaves overall tasks 8.4/9.2 open. Preserve these as explicit follow-up obligations.

## Independent verification

```sh
bun test libs/wbs/application/core/src/service/connected-plan.test.ts libs/wbs/application/core/src/service/connected-tree.test.ts libs/wbs/domain/contracts/src/http/work-item-response.test.ts apps/wbs/be-01/src/controller/cross-project-live.controller.db.test.ts
```

Passed: **96 tests, 345 assertions**. Log: `/tmp/puni-unavailable-review-tests.log`.

`git diff --check 6ca21df77..2869218bf82fb3f96e6a7b4e8953ece6db1bf603` passed. Source worktree status remained clean; HEAD matched the requested commit.

The combined domain/contracts/core/backend TypeScript command was rerun and reports the same two downstream TS2322 sites; output is `/tmp/puni-unavailable-review-tsc.log`. Domain/contracts-only success, lint and OpenSpec validation were reviewed from packet evidence, not independently rerun. No frontend suite, full host gate, full build, deployment or live activation was run in this review.
