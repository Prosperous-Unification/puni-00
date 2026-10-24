# Command authority round 1 — P2 direct write scope

Base: eb3d6c2a7. Worktree: /tmp/puni-cross-command-authority. Four changed paths, frozen for root commit and Astra re-review. No Git mutations, WBS/docs/OpenSpec edits, subagents, new external functionality, builds or host gates.

The shared admit function in admitted-write.ts and runRecoveryWrite now check the actual authenticated principal's write scope before constructing the collector or entering the UoW. Both return the existing { ok: false, error: 'insufficient_scope' } refusal. JSDoc and adjacent Proof comments record the boundary. Existing HTTP guards, current SQLite authority resolution, principal evidence, transaction/lifetime behavior, recovery policy and explicit legacy runner behavior are preserved.

The real SQLite OrganizationHarness exposes its existing process RecoveryWriteBoundary to this test only. Three direct negatives exercise project update, bare step removal and audited recovery removal. Project/recovery cases use another user's restricted project with a current super-admin principal, so recovery audit is eligible. All three use a verified selected browser principal narrowed to read scope. They assert insufficient_scope, unchanged actual borrowed-UoW admission count, fan-out capture count, push count, full-table snapshot (including audit/history/events/revisions) and persisted step. The counters observe the existing real source and transport sink; no permissive resolver or replacement UoW establishes the proof.

## Verification

- Initial TDD red: all three new tests returned ok:true instead of insufficient_scope (3 failures). Evidence: /tmp/command-round1-red.log.
- Guards restored: 3 new tests passed, 27 assertions. Evidence: /tmp/command-round1-green.log.
- Independent R5 shared-admit guard removal: project update and bare step removal both returned success and failed their selected toEqual assertions (2 failures, exit 1).
- Independent R5 recovery guard removal: direct recovery removal returned success and failed its selected toEqual assertion (1 failure, exit 1).
- Every mutation restored the original source in finally. Logs: /tmp/command-round1-proofs.log; /tmp/command-round1-proof-shared-admit-write-scope.log; /tmp/command-round1-proof-recovery-write-scope.log.
- Final affected tests: 104 passed, 0 failed, 594 assertions across 6 files. Command: bun test ./apps/wbs/be-01/src/controller/command-current-authority.controller.db.test.ts ./libs/wbs/application/core/src/module/plan-commands/admitted-write.test.ts ./libs/wbs/application/core/src/module/plan-commands/plan-command-admission.test.ts ./libs/wbs/application/core/src/http/step.routes.test.ts ./libs/wbs/application/core/src/http/calendar-marker.routes.test.ts ./libs/wbs/application/core/src/compose.test.ts. Evidence: /tmp/command-round1-focused.log.
- Actual dedicated types: NX_DAEMON=false bunx nx run-many -t typecheck -p wbs-core,wbs-be-01 --parallel=2 — all 4 targets passed, including core/backend module targets; 0 cache hits. Evidence: /tmp/command-round1-types.log.
- Generated Nx graph: /tmp/command-round1-graph.json. The restricted socket environment used Nx's documented in-process plugin fallback. Evidence: /tmp/command-round1-graph.log.
- Named lint: bunx eslint followed by the exact four paths from /tmp/command-round1-paths.txt — exit 0. Evidence: /tmp/command-round1-lint.log. Import autofix was applied before the final check.
- Named Prettier --check over those same four paths and git diff --check — exit 0. Evidence: /tmp/command-round1-format.log.

## Reviewer probe, with its original expectation preserved

Unchanged original command: bun --tsconfig-override /tmp/puni-cross-command-authority/tsconfig.base.json /tmp/command-review-direct-probe.ts. It now exits 1 at its old expected-vulnerability assertion. This is not claimed as a passing probe. Evidence: /tmp/command-round1-original-probe.log.

The observed output is:

```json
{
  "run": { "ok": false, "error": "insufficient_scope" },
  "remove": { "ok": false, "error": "insufficient_scope" },
  "stepPersisted": true
}
```

A separate copy, /tmp/command-round1-direct-probe.ts, changes only the final expectation to require insufficient_scope and a persisted step. The same Bun command with that copied path exits 0. Evidence: /tmp/command-round1-fixed-probe.log. Both commands still print the pre-existing Bun internal directory-mismatch diagnostic associated with --tsconfig-override; the focused supported Bun test invocation above is clean. The original reviewer probe was not edited.

## Bounds

No additional broad regression, full host gate, e2e, benchmark, deploy or external dependency integration was run for this two-guard correction. SQLite/memory adapter sources and WorkItemService were unchanged. Earlier checkpoint evidence remains separate; this report establishes only P2 and its affected regressions. Root owns commit, integration, independent review and the eventual full gate.

## Frozen SHA-256 manifest (4 paths)

```text
0bde7c59ed8e21ae6013a17b5066dbc5d4524671b7549cfcd8b1d6da526a1cf9  apps/wbs/be-01/src/controller/command-current-authority.controller.db.test.ts
f09d448f899ff3f79b491f749243ee5a9262a82ac28203331a7569beeee394ae  apps/wbs/be-01/src/testing/organization-harness.ts
87056e0718e60b0163d8689f6994844dfd1a62511aa13cdcb8ebaaa15e52e52e  libs/wbs/application/core/src/http/recovery-write.ts
387cdb9efadc675228797c00214a710dbc08a7597fcaa7d7f810cabc586cb473  libs/wbs/application/core/src/module/plan-commands/admitted-write.ts
```
