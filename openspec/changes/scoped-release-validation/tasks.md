# Product-scoped release validation tasks

> For agentic workers: use subagent-driven-development for the operator change and independent review; this file is the implementation plan.

**Goal:** remove the whole-public-repository gate as a product release prerequisite while preserving actual website qualification.

**Spec:** [Product release validation](specs/product-release-validation/spec.md).

## Global Constraints

- A whole-repository gate MUST NOT be a release prerequisite.
- Repository integration gates SHALL remain independently available and unchanged.
- Release preflight MUST explicitly report validation incomplete.
- A scoped result MUST NOT claim an ordinary full repository gate passed.
- The scoped website handoff MUST preserve the original parent, sources, deadlines, capacity floors, resource accounting and immutable historical publishers.
- It MUST refuse conflicting attempts across every old and new begin route and require positive retirement of the superseded owned gate before build dispatch.
- Website release qualification MUST retain frozen dependency installation, selected source checks, production origins, source and runtime attestation, migration lint and rollback, image rehearsal, Fleet validation, database activation seal, durable request readback, accepted owner notification, retained logs and versioned backup with both restore proofs.
- It MUST preserve the live landing site throughout backend preparation.

## 1. Product scope and written policy

- [ ] 1.1 Bind the existing complete private Nx workspace and five canonical product trees; run the exact complete website migration-lint input set. Proof: public/private source audits, strict Nx API graph failure, unknown-root/partial-graph and real dependency-addition observations; no CLI-exit-only qualification.
- [ ] 1.2 Replace release prerequisites in AGENTS.md, LLM_README.md and release runbooks; define preflight versus completed qualification. Validation: scoped formatting, links and OpenSpec validation; do not run the unrelated full gate for these docs.

## 2. Attended production handoff

- [ ] 2.1 Adapt immutable first-begin5c75 into a new scoped packet consuming a closed website-release-preflight/1 assertion, without ordinary-gate verdict fields. Tests: valid preflight dispatch shape and original parent reuse; negatives: crossed source/tree/project/check profile, claimed completed validation, extra full-gate fields, wrong digest, and each old/new existing or unreadable attempt. Observe guard-removed failures and add adjacent Proof comments. Preserve the existing native action/history/source/capacity behavior.
- [ ] 2.2 Repin the existing calibration publisher5754 to the scoped begin and assertion; retain actual step qualification. Tests: existing acceptance tests and crossed publisher/assertion omissions, with observed guard-removed failures. Review exact bounded diffs and frozen hashes before native use.
- [ ] 2.3 Retire only the exact owned redundant r2 repository gate through the reviewed controlled end route, record its actual canceled outcome, and positively verify all owned processes/scopes/containers and resource admission released. Keep the historical r1 unit loaded and all evidence. No full-gate pass or qualified capture is created.
- [ ] 2.4 Root issues source/scope/retirement-bound preflight with validationCompleted:false, verifies the same retained parent ready0 and all three attempt routes absent, then publishes begin once. Observe that exact action and actual private build job. Never replay uncertain publication.

## 3. Qualification and original production goal

- [ ] 3.1 Accept each real checks-enabled private build only after complete source/runtime/profile/telemetry/attribution/retirement evidence; continue retained B/C/C series and H2 rehearsal/push. Source or build failure blocks publication without substituting unrelated suites.
- [ ] 3.2 Complete the original Fleet/schema-seal/strict-TLS/request-persistence/notification/log-replacement/backup-and-both-restores acceptance while keeping the landing site live. These are original goal obligations, not evidence created by the scope change.
- [ ] 3.3 Record exact commands, results, remaining checks and R5 proofs in verify.md; independently review the policy and active operator route.

## Task dependency review

| Tasks   | Shared boundary                     | Check                                                                                                         |
| ------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1.1→2.1 | Exact source/scope receipt          | Preflight binds the audited11 private projects and five actual product trees; it does not claim tests passed. |
| 1.2→2.1 | Release prerequisite                | Written product qualification agrees with the replacement assertion; CI behavior stays unchanged.             |
| 2.1→2.2 | Publisher hash and assertion schema | Calibration loads the new exact begin and never revalidates an ordinary-gate assertion.                       |
| 2.3→2.4 | Owned gate retirement               | Root verifies positive settlement before build admission; old receipts remain immutable.                      |
| 2.4→3.1 | Preflight versus qualification      | Begin authorizes only the fixed checked build; per-step acceptance still requires actual results.             |
| 3.1→3.2 | Published artifacts                 | Actual rehearsal/push and source-pinned images precede activation; no new source family or relaxed DB seal.   |

All task text agrees with the spec. The11-project private run is intentionally conservative and remains the existing Nx execution path. There is no new runner or job type.
