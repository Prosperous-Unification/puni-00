# Agentic integration with current main

Restore the already specified receiver/executor behavior on current main75585eebdd42d78e1c06057f9e9f418495f49f94 without implementing the other session's credentials work. Local merge parent2a4f1c346b1d62f6995bec041ea9aac7df6faff6 already combines receiver5ba, executor3ae, binding6f09 and storage79. Current main adds four independent migrations and replaces the old pair-only credential helper with its verified CredentialPin/credentialPinOf contract. Preserve both parents' behavior, schemas, strict refusal models, complete rollback evidence and runtime current-person enforcement. No new workflow, auth policy, schema or public API is proposed.

## Global Constraints

- Root owns commits, tracked plans/verify/docs, index/merge state, parent coordination, PRs and canonical full gates. One source implementer only; no commits, git checkout/ours/theirs/staging, subagents or branch changes from worker. Bun/Nx only, including temporary edit/hash/fault scripts; no Python.
- Resolve only the37 named conflict paths below plus composition.ts, runtime-authority.ts and the new controller pin test. If an actual auto-merge defect requires any other edit, report exact cause/path before expansion. Preserve all unrelated/current-main changes. Never rewrite machine credential, consent, verifier, migration SQL/down/hash or authorization implementation.
- Consume current CredentialPin and credentialPinOf; do not recreate credentialPairOf, cast machine/consent to upstream pairs, choose a person from account membership, or default pins to null. Existing current admission/eligibility remains the authority. Runtime credential consumption must precede replay under current authorization; no historical receipt grants current reach.
- Independent complete migration oracles must contain both parents' additions in unique numeric timestamp forward/reverse order. Rename only the unmerged runtime folder to20261022121000_add_runtime_commands, now latest; keep all SQL/down byte hashes and main migration identities unchanged. The old runtime timestamp collides with current main audience scope and existing rollback correctly refuses it. Retain complete row/hash/full-ledger/rollback refusals and exact schema expectations. Never derive expected names from actual output or replace exact sets with subsets. Existing capture validation must reject an old branch identity without mutation; no implicit migration or ledger repair.
- All safety checks newly changed by integration need a real production-path negative from a valid green baseline, watched fault/removal and exact restoration, with adjacent truthful Proof. No fake receiver/admission outcomes. Existing unchanged guards need no blanket recertification. Verifier-principal fixtures may supply actual verified authentication values to the real mounted app; don't claim credential cryptography or live verification from that dependency seam.
- No live provider/credential/fleet/WBS update, new tenant/limits/compute/CTT/cross-project code, backend recovery claim or S0/S7a completion. Root canonical gates currently target immutable earlier packet heads; they don't certify this integration tree.

### Task 1: Restore current-main composition and runtime credential-pin consumption

**Files:** Resolve exactly these37 existing conflict paths, retaining both parents' meaningful changes:

- apps/wbs/be-01/src/migration-cli.db.test.ts
- apps/wbs/be-01/src/person-account-migration.db.test.ts
- libs/wbs/adapters/store-sqlite/src/browser-auth-lifecycle.db.test.ts
- libs/wbs/adapters/store-sqlite/src/calendar-marker-migration.db.test.ts
- libs/wbs/adapters/store-sqlite/src/claim-occupancy-schema.db.test.ts
- libs/wbs/adapters/store-sqlite/src/delegation-use.db.test.ts
- libs/wbs/adapters/store-sqlite/src/email-challenge-migration.db.test.ts
- libs/wbs/adapters/store-sqlite/src/email-verification-migration.db.test.ts
- libs/wbs/adapters/store-sqlite/src/enterprise-sso-migration.db.test.ts
- libs/wbs/adapters/store-sqlite/src/identity-migration.db.test.ts
- libs/wbs/adapters/store-sqlite/src/migrate-down.db.test.ts
- libs/wbs/adapters/store-sqlite/src/migrate.db.test.ts
- libs/wbs/adapters/store-sqlite/src/optimized-schedule-cache.db.test.ts
- libs/wbs/adapters/store-sqlite/src/organization-activation.db.test.ts
- libs/wbs/adapters/store-sqlite/src/organization-audit.db.test.ts
- libs/wbs/adapters/store-sqlite/src/organization-bridge.db.test.ts
- libs/wbs/adapters/store-sqlite/src/organization-ownership-freeze.db.test.ts
- libs/wbs/adapters/store-sqlite/src/organization-ownership.db.test.ts
- libs/wbs/adapters/store-sqlite/src/organization-records.db.test.ts
- libs/wbs/adapters/store-sqlite/src/project-rank.db.test.ts
- libs/wbs/adapters/store-sqlite/src/project-settings.db.test.ts
- libs/wbs/adapters/store-sqlite/src/project-solution.db.test.ts
- libs/wbs/adapters/store-sqlite/src/project.db.test.ts
- libs/wbs/adapters/store-sqlite/src/saved-plan-created-by-id.db.test.ts
- libs/wbs/adapters/store-sqlite/src/saved-plan-migration.db.test.ts
- libs/wbs/adapters/store-sqlite/src/shared-people-audit.db.test.ts
- libs/wbs/adapters/store-sqlite/src/shared-people-mode.db.test.ts
- libs/wbs/adapters/store-sqlite/src/shared-people-rollback.db.test.ts
- libs/wbs/adapters/store-sqlite/src/space-rollback.db.test.ts
- libs/wbs/adapters/store-sqlite/src/space.db.test.ts
- libs/wbs/adapters/store-sqlite/src/step-blockage-receipt.db.test.ts
- libs/wbs/adapters/store-sqlite/src/step-code-migration.db.test.ts
- libs/wbs/adapters/store-sqlite/src/step-estimate-unit-migration.db.test.ts
- libs/wbs/adapters/store-sqlite/src/step-parallel.db.test.ts
- libs/wbs/application/core/src/module/plan-commands/plan-commands.feature.ts
- libs/wbs/domain/contracts/src/http/refusal.ts
- libs/wbs/domain/domain/src/index.ts

Additionally update libs/wbs/application/core/src/module/plan-commands/composition.ts only for existing runtimeTransaction verified-pin extraction and libs/wbs/application/core/src/module/plan-commands/runtime-authority.ts only for consuming the existing CredentialPin type across borrowed admission; create apps/wbs/be-01/src/controller/runtime-credential-pin.db.test.ts for the real composed route/current pin regression. No other earlier executor or credential implementation edits. Root owns verification text and this plan.

**Interfaces:** Current contracts principal.ts exports CredentialPin=CredentialPair|{personId:string} and credentialPinOf(upstream/machine/consent/first_party); credentialPairOf is removed. Runtime openRuntime currently still imports/calls the removed helper and its runtime-only execute overload/admission types remain pair-only. Use the current main contract consistently through this runtime consumer and delegate existing eligibility/person pin checks. Refusal registry must preserve both runtime codes and all main codes, undefined bare runtime person_not_bound plus main{personId} and command-context variants, credential_not_for_person and both step/machine-credential in_use details. Domain barrel exports both runtime-basis and existing main machine-credential. No authentication implementation is changed.

- [x] Read actual current callers/tests plus both parent conflict sides. Preserve all independent fixture histories. Resolve the mechanical conflict markers in37 paths; no whole-file ours/theirs selection. Main migrations are20261022100000_add_machine_credential,20261022110000_widen_organization_audit_machine_credentials,20261022110100_check_machine_credential_id,20261022120000_scope_trusted_issuer_audience; receiver adds20261022121000_add_runtime_commands after correcting the draft timestamp collision. Keep exact forward/reverse order/latest/cardinality semantics across all listed fixtures.
- [x] Add real mounted-app/SQLite tests for verified machine and consent principals pinned to one of two agent persons of the same account. Matching pin works; a different otherwise-bound person is refused before runtime read/acquisition/claim-write and historical lookup/replay as the relevant endpoints permit. Use current production composition and existing test-verifier seam or existing real local machine-credential test setup; no fake receiver response or helper output. Record initial red accurately (missing removed-helper loader/type errors are setup evidence, not semantic guard proof).
- [x] Adapt only runtime consumption to current credentialPinOf/CredentialPin, preserving current authority/basis/receipt/claim behavior. Resolve refusal/detail unions without erasing either domain. Watch a temporary null/drop of the runtime pin at each actual runtimeTransaction and PlanCommandRunner openRuntime admission seam separately make the wrong-person machine/consent public-path regression accept forbidden reach; restore exact bytes and passing output. The main credential implementation stays untouched. Preserve detached current pin extraction before asynchronous admission and all source checks; do not turn recovery/cancellation into new guarantees.
- [x] Prepare a real Nx project graph before policy/lint evidence; the prior local merge hook skipped boundaries for absent graph, which is not a boundary pass. Run focused changed controller pin cases, existing runtime state/authority/claim/write/HTTP/boot coverage and affected legacy migration/backend fixtures, plus actual module/effective-policy checks. Root may choose one complete SQLite/backend target instead of overlapping file batches; record precise first failures and remaining known skips. Run relevant uncached core/contracts/adapters/backend/Dash typecheck/lint once after final changes. Report an out-of-scope failure rather than weakening a guard or assuming flakiness.
- [ ] Run final focused covering checks, format/diff and scoped OpenSpec validation. Check all10 pinned forward/down hashes against root preflight. Report exact changed-file hashes, names/counts/durations, fault/restoration strength, failures/warnings/unknowns. No commits; explicitly release source/implementation hold after stable report. Root reviews/commits final candidate and owns exact merged-SHA host gates/CI before integration acceptance.

**Report:** .superpowers/sdd/integration-tasks/task-1-report.md, evidence task-1-evidence/. Return DONE/concerns plus compact actual check status. Do not run raw full Nx/h2 gates or any second source task.

### Task1 scope amendment: unique runtime migration identity

Supersedes only the earlier instruction to preserve the colliding runtime folder name. Rename apps/wbs/be-01/drizzle/20261022120000_add_runtime_commands to20261022121000_add_runtime_commands with BOTH SQL files byte-identical. Additionally allow libs/wbs/adapters/store-sqlite/src/runtime-command.ts, libs/wbs/adapters/store-sqlite/src/runtime-ledger.db.test.ts, apps/wbs/be-01/src/controller/runtime-authority.db.test.ts and apps/wbs/be-01/src/controller/runtime-command.controller.db.test.ts only for identity references, exact complete rollback oracles and the legacy-identity capture refusal regression. Update34 already named legacy fixture catalogs in correct forward/reverse order, including latest runtime121000; preserve original rows/hash/schema/refusal/down-up assertions. Fix the existing allowed claim-occupancy fixture complete reverse expectation to include all main additions. Preserve historical old-identity evidence in verify.md. No rollback engine, guard, main migration or SQL content change. Confirm preflight10 hashes through explicit old-to-new runtime path mapping, all other paths exact. Reproduce the existing collision RED, verify new migration rollback/capture/lifecycle coverage GREEN before the single complete SQLite invocation. For retained old-branch DB negative, use actual existing capture production path and assert complete before/after ledger plus runtime tables/history unchanged; no new silent compatibility mechanism.

Additional fixture-only scope: apps/wbs/be-01/src/machine-credential-migration.db.test.ts, apps/wbs/be-01/src/machine-credential-audit-migration.db.test.ts, apps/wbs/be-01/src/trusted-issuer-audience-migration.db.test.ts. Each newly main-only test retains its complete literal rollback oracle, now prefixed by20261022121000_add_runtime_commands. Preserve all credential/schema/audit/refusal assertions and production implementations.

Local Task1 source and selected-check review accepted at310ed257bf1786164b5fcdbbc9c00dca6424c63c with no Critical/Important findings. The final checkbox stays open for root whole-branch review and exact combined-SHA host/CI acceptance. The unchanged credentials implementation is the pinned main baseline; no cryptographic verification claim is made. Full integration review covers the resulting receiver/executor composition. Existing warning/skip cleanup remains separately scoped.
