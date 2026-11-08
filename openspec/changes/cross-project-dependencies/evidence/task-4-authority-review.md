# Current command authority review

Reviewed commit `eb3d6c2a797463631030a2ed1576fd55d55907aa` against `dd7456145`, the 61-path frozen manifest `/tmp/puni-command-authority-sha256.txt`, and the binding `cross-project-dependencies/architecture/command-admission.md`. All 61 hashes matched before review and after the independent tests/probe. The worktree is clean. No source or Git metadata was changed by this reviewer.

## Finding — P2: enforce write scope at the direct admitted-write entries

Locations: `libs/wbs/application/core/src/module/plan-commands/admitted-write.ts:49` (the shared `admit` function used by `updateProjectWithin` and `removeStepWithin`); the same omission is present at `libs/wbs/application/core/src/http/recovery-write.ts:50`.

These entrypoints now accept the actual `AuthenticatedUser`, but pass it into current organization resolution without checking `actor.scopes.includes('write')`. `SqliteCommandAccess` and `SqliteOrganizationAccess` validate organization/binding/membership/credential rules; they do not enforce operation scope. A read-only principal with a current writing organization role therefore reaches the write. The runner's new direct-entry scope guard does not protect these sibling entrypoints.

Independently reproduced against the real composed SQLite harness with a selected, valid browser binding and an activated organization. Narrowing that authenticated principal to `scopes: ['read']` gave:

```json
{
  "run": { "ok": false, "error": "insufficient_scope" },
  "remove": { "ok": true },
  "stepPersisted": false
}
```

`run` calls the real core runner; `remove` calls `OrganizationHarness.removeBareStep`, which invokes the real `createAdmittedWrites(...).removeStepWithin`. The step was physically deleted. Reproducer: `/tmp/command-review-direct-probe.ts`. Command: `bun --tsconfig-override /tmp/puni-cross-command-authority/tsconfig.base.json /tmp/command-review-direct-probe.ts` (exit 0; Bun also printed an internal directory-mismatch diagnostic after the asserted result). The recovery helper omission is established by source inspection, not a separate live probe.

Impact is bounded: current HTTP endpoint shapes check write scope before their handlers, so this is not a demonstrated mounted HTTP bypass. It is an inconsistent security boundary for the direct actor-bearing APIs that this slice exposes and tests. A direct consumer cannot safely rely on the new admitted-write boundary to enforce the supplied principal's scope as it can with the command runner.

Remedy: reject a principal without write scope with the existing `{ ok: false, error: 'insufficient_scope' }` before opening the UoW in the shared admitted-write entry and recovery helper. Add direct real SQLite negatives for project update, bare step removal and recovery write, checking no audit/history/events/fan-out/writes. Independently bypass each guard and observe the production-path negative fail; add adjacent Proof comments. Do not weaken the HTTP checks or broaden the legacy arm.

Recommendation: fix this security-boundary finding before integrating this slice. No other blocking finding was established in the reviewed scope.

## Verified architecture and evidence

- `CommandCaller` retains original authenticated principal evidence and expected access. Runner methods derive actor ID and credential pair; independent actor/pair parameters are removed. Explicit legacy wrappers are checked against the durable marker and refuse after activation.
- Both core composition and the separately mounted runner receive the required resolver. Boot constructs request organization authority before services and uses the writer's `source.db`, the same cookie verifier/revocation reader, and the same injected clock. Resolver reads do not enter a nested public UoW or open another connection.
- Execute and replay resolve inside the admitted UoW before scope admission, recovery audit, reference reads, fan-out and mutation. Current roles are used; expected kind, organization and user identity are checked. Credential-rule refusal bodies survive route mapping. The step prelude receives fresh access.
- Direct project update, direct step add/rename/remove, and bare admitted step removal revalidate current organization authority inside their own writer turn. The above finding concerns operation scope, not the queued authority revalidation.
- Delegation is retained as already verified request evidence. Current membership/credential policy is reread; there is no claim or mechanism that re-verifies the delegation signature from IDs. Existing delegation regression tests passed, but they are not a new queued delegated-command matrix.
- Fresh SQLite UoW/snapshot lifetimes are preserved. Journal repair now directly discards through fresh repair stores, without constructing a service graph or reviving expired authority. Existing external-authoring dormancy and local foreign-reference checks are retained; no WorkItemService source change is in this slice.
- The boot fixture replaces its permissive request-only organization resolver with an explicit trusted direct-context local principal and real SQLite authority. This proves composition behavior, not external credential verification.
- Activation-test edits add only the already-present external-dependency migration to the exact rollback list and advance the expected final migration. No ledger/hash/set assertion or migration source was removed or weakened.

## Independent verification

1. `bun test ./apps/wbs/be-01/src/controller/command-current-authority.controller.db.test.ts ./libs/wbs/application/core/src/module/plan-commands/admitted-write.test.ts ./libs/wbs/application/core/src/module/plan-commands/plan-command-admission.test.ts ./libs/wbs/application/core/src/compose.test.ts` — **89 passed, 0 failed**, 495 assertions. Log: `/tmp/command-review-focused.log`.
2. `bun test ./apps/wbs/be-01/src/controller/delegation.controller.db.test.ts ./apps/wbs/be-01/src/controller/organization-context.controller.db.test.ts ./apps/wbs/be-01/src/controller/command-organization.controller.db.test.ts ./libs/wbs/adapters/store-sqlite/src/organization-activation.db.test.ts` — **88 passed, 0 failed**, 705 assertions. Log: `/tmp/command-review-regressions.log`.
3. The direct write-scope probe above reproduced the deletion through the real boundary.
4. `sha256sum -c /tmp/puni-command-authority-sha256.txt` — **61 paths OK**, including after tests; final log `/tmp/command-review-hashes.log`.
5. `git diff --check dd7456145` — passed; `git status --short` — clean.

The 61-case authority suite consists of 55 combinations (11 entry operations × revocation, expiry, removal, demotion, session-policy change) and six context/legacy/trusted-state/scope tests. The queued tests use the same app's writer queue and a distinct rival SQLite connection. Their full-table snapshots include all persisted effects, and their armed fan-out callback plus push counter test that refusal occurs before observation/delivery. They are not merely mocked resolver outcomes. Expected-context mismatch tests are direct comparisons, not a purported legal database ownership/activation downgrade.

Inspected worker fault logs `/tmp/command-proofs.log` and `/tmp/command-scope-proofs.log`: eight independent authority bypasses plus execute/replay scope and repair-discard faults recorded failing selected assertions. Those mutations were not rerun by this reviewer because the reviewed source was frozen. The direct-entry read-only gap was not included in those proofs. This review does not independently establish every worker-reported lint/typecheck/format/test count.

## Bounds and checks not run

No full host gate, build, e2e, deployment, merge, benchmark or source mutation was performed. No socket escalation was needed by the selected independent tests. No independent queued OIDC SSO-enforcement or delegated-command matrix was added. Trusted-state absence/malformed coverage was run as supplied; this review does not claim a new independent unreadability injection.

This is only the principal/current-authority foundation review. Full task 4.2, endpoint wire contracts, checked external endpoint evidence/context, connected graph integration/derivation/fan-out, remote revision history/replay, mounted external positives, live consumers, lifecycle/activation, runtime and release checks remain open. Passing the focused suites does not complete the feature or authorize external authoring.
