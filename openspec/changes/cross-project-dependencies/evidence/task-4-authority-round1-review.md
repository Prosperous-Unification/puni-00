# Current command authority — round 1 re-review

Verdict: **approved for the bounded current-authority foundation; original P2 is resolved. No new findings.** This does not approve the remaining external-dependency feature, runtime activation, or release.

Reviewed the four frozen uncommitted paths over `eb3d6c2a797463631030a2ed1576fd55d55907aa` in `/tmp/puni-cross-command-authority`. `/tmp/puni-command-authority-round1-sha256.txt` matched all four files before and after review. Only those four paths differ from the reviewed commit. Source and Git metadata were not modified by this reviewer.

## P2 resolution

- `admittedWrites` checks `actor.scopes.includes('write')` in its shared entry before constructing the collector or calling the mapped transaction. Both direct project update and bare step removal return exactly `{ ok: false, error: 'insufficient_scope' }`.
- `runRecoveryWrite` independently checks the same predicate before constructing pending state, opening the UoW, resolving current authority, auditing, or creating the graph.
- Principals with write scope retain the previous path unchanged: real same-writer authority resolution, fresh role/context, recovery admission, fan-out capture and transaction/repair/lifetime rules. No scope fallback, broader legacy access, external activation or WorkItemService change was added.
- The new harness accessor exposes its already composed boundary only to tests; it does not replace the resolver, UoW, writer, graph or transport with a permissive double.

The three added real SQLite tests cover direct project update, direct bare step removal and recovery removal. The project/recovery cases make a super-admin eligible to recover another owner's restricted project, so audit cannot be hidden by an ineligible fixture. They assert exact refusal, unchanged actual UoW-entry/capture/push counters, unchanged full-table snapshots, and the step's continued existence.

Inspected both independent worker bypass logs: removing only the shared guard produced `ok:true` for project update and bare step removal (2 failures); removing only the recovery guard produced `ok:true` for recovery removal (1 failure). The selected assertions fail at the actual returned outcome. Adjacent Proof comments name these observed negatives. These frozen-source mutations were not repeated by the reviewer.

## Fresh independent verification

`bun test ./apps/wbs/be-01/src/controller/command-current-authority.controller.db.test.ts ./libs/wbs/application/core/src/module/plan-commands/admitted-write.test.ts ./libs/wbs/application/core/src/module/plan-commands/plan-command-admission.test.ts ./libs/wbs/application/core/src/http/step.routes.test.ts ./libs/wbs/application/core/src/http/calendar-marker.routes.test.ts ./libs/wbs/application/core/src/compose.test.ts`

**104 passed, 0 failed, 594 assertions**, including the original 61-case authority suite, three new direct negatives, and affected admission/route/composition/repair regressions. Log: `/tmp/command-round1-review-focused.log`.

Independently ran `/tmp/command-round1-direct-probe.ts`, inspected its output, and confirmed both runner and bare removal return `insufficient_scope`, with `stepPersisted: true`. Log: `/tmp/command-round1-review-probe.log`. This copied probe changes the original vulnerability expectation to the fixed expectation; it does not pretend the original expected-vulnerability probe passes. Bun still prints the known tsconfig-override directory diagnostic; the supported focused test invocation above is clean.

`sha256sum -c /tmp/puni-command-authority-round1-sha256.txt`: four paths OK. `git diff --check`: passed.

No new full host gate, build, e2e, typecheck, lint, benchmark, deployment, or merge was run by this reviewer. Worker type/lint/format evidence remains separately attributed. Full task 4.2, checked endpoints, connected graph/derivation/fan-out, remote history/replay, mounted external positives, live consumers, activation, runtime and release obligations remain open.
