# APPROVE — bounded isolated dependency fanout

Reviewed commit `d8a94a83e7fa70002b9a9c1800b33293325a8df1` against base `5229c8322` in `/tmp/puni-dependency-fanout`. No blocking defect found within the explicitly bounded packet. This is not approval of completed task 5.2, task 8.4, activation, release, or deployment.

Read repository orientation/rules, task 5.2, the cross-project/live-snapshot delta requirements, `/tmp/puni-cross-tree-8.4-architecture.md`, the packet verification record, changed production code/tests, and adjacent writer/capture/harness callers. No repository source edits were made; the worktree remained clean at the reviewed SHA after checks.

## Findings

- The isolated observation reads relationship topology and incident facts on the borrowed SQLite writer, with no scheduler call or event mutation during capture. Project identities remain present after their last relationship disappears, allowing both surviving former endpoints to receive invalidations.
- Component traversal is transitive and undirected as required by component invalidation. Old and new graphs are traversed separately, avoiding invented paths formed by mixing snapshots. Changed authored keys contribute both endpoints; committed recording deduplicates and sorts recipient/cause pairs and excludes self/deleted recipients.
- Command, admitted project/step and scoped recovery composition retain event recording inside the unit of work and delivery after it returns. The mounted project PATCH witness uses an independent SQLite connection; it observes the committed name and can write during delivery. A rejected mounted command batch restores estimate/history/event/sequence tables. The borrowed-writer completion witness proves real event recording and rollback, not mounted successful progress/claim behavior.
- Capture filters relationship rows by organization and resolves each incident project through scoped capture/header reads, including existing cross-reference checks. Payloads contain only stable project IDs, not labels. The foreign component fixture remains silent, and the renamed project's stored relationships remain unchanged. This establishes bounded organization isolation; it does not establish complete refresh authorization or rendered endpoint privacy across all consumers.
- Ordinary shared capture is unchanged apart from the explicit null dependency arm; focused local/shared tests pass. There is no replacement local scheduling path or suppression of the known connected-tree refusal.

## Fresh verification

Commands ran from the reviewed worktree:

```sh
bun test libs/wbs/adapters/store-sqlite/src/fanout-capture.db.test.ts libs/wbs/adapters/store-sqlite/src/read-continuation.db.test.ts libs/wbs/application/core/src/service/committed-fanout.test.ts libs/wbs/application/core/src/service/shared-people-fanout.test.ts libs/wbs/application/core/src/module/plan-commands/module.test.ts apps/wbs/be-01/src/controller/cross-project-events.controller.db.test.ts apps/wbs/be-01/src/controller/fanout-command.controller.db.test.ts apps/wbs/be-01/src/controller/fanout-selected-rank.controller.db.test.ts
bunx tsc --build --force apps/wbs/be-01/tsconfig.json
bun tools/tool-devsync/src/typecheck-modules.ts libs/wbs/application/core/src/module
git diff --check
git status --short
git rev-parse HEAD
```

Observed: **131 pass, 0 fail, 450 assertions across 8 files**; backend reference typecheck exit 0; all configured core module typechecks exit 0; diff check exit 0; clean worktree; exact reviewed SHA. Logs: `/tmp/puni-dependency-fanout-review-tests.log`, `/tmp/puni-dependency-fanout-review-types.log`, `/tmp/puni-dependency-fanout-review-module-types.log`.

## R5 evidence assessment

Inspected existing `/tmp/puni-fanout-fault-*.log` files for incident traversal, progress fingerprint, abbreviation fingerprint, endpoint evidence, premature delivery, missing delivery, organization filter and mixed topology. Each contains the described failing production-path assertion; final fresh tests above are green after restoration. Faults were not independently reinjected because this review was requested without source edits.

The two weaker proofs are accurately bounded in the packet: removing the endpoint refusal produces a property-access error rather than unsafe success, and removing organization filtering produces a 500 from remaining scoped endpoint refusal rather than disclosure. Neither is evidence of a successful leak. The last-edge identity and organization-identity red observations are described in the committed evidence record; I did not find separate fault logs for those two and do not independently attest to their historical execution. Their final regression tests pass.

## Limits retained

Shared-mode external capture, shared-person bridges, mode switching, rank edits, all-writer coverage, mounted successful progress/claim/topology commands, own-project connected-tree delivery, complete endpoint rendering/refetch authorization, and real gateway socket/replay acceptance remain open. Keep task 5.2 and task 8.4 unchecked.

No canonical exact-SHA host gate, full CI/build/lint, fresh changed-path lint/format, browser acceptance, OpenSpec validation, frozen dependency installation, activation, release or deployment was performed by this reviewer. Existing packet lint/format claims were not independently rerun. A broad `/tmp` log search encountered unrelated private system-directory permission errors; the named evidence logs were accessible and inspected directly.
