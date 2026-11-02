# Durable preparation dispatch implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan with independent task and whole-branch review.

**Goal:** Connect durable preparation intent to a single real executor-open invocation and retain the complete locator before exposing the live session.

**Architecture:** One semantic host helper composes existing verified preparation and execution persistence. A fresh applied intent elects the opener; duplicate or ambiguous outcomes retain the original checkpoint and capacity.

**Tech Stack:** Bun, TypeScript, existing semantic memory/SQLite stores and ActivityExecutor; no dependency or database-format changes.

**Spec:** [preparation-dispatch-design.md](preparation-dispatch-design.md), the parent activity-execution and run-coordination deltas, and ADR0061.

## Global constraints

- Base is main `dacf0f10f384ec3a21bde70db0500ba0b7a38d90`; prior foundation PR742 is merged and must not be reimplemented.
- Existing guards, migrations, SDK pins, budgets, tenant/auth/provider and CTT implementations remain unchanged.
- Root owns tracked planning, commits, final integration/gates and accurate parent status. Implementer edits only declared source/tests and its ignored report/evidence; no nested delegation.
- No WBS request, executor.turn, automatic close/cancel, live paid provider, secret discovery or production activation.
- Never derive quiescence, interrupted state, capacity release or replacement permission from coordinator death, cancellation acknowledgement or unsupported recovery.
- R5 proofs modify only newly owned helper checks temporarily, retain raw logs and exact restoration hashes, and add Proof comments only after observed intended failures. Do not modify protected existing planner/SQL checks.

### Task 1: Durable preparation host and conformance proofs

**Files:** Create `apps/twilight-structure/twilight-dash/cli/src/runs/prepare-activity.ts`, `prepare-activity.test.ts`, and `sqlite/prepare-activity.db.test.ts`. A shared test-only contract may live in `runs/testing/preparation-dispatch-contract.ts` if needed. Do not change existing fixtures/policies without root identifying a concrete necessity.

**Consumes:** `recordPreparation(runs, artifacts, guard, PreparationInput)`, `RunStore.recordExecution`, `RunStore.renewOwnership`, existing detached guard/record/locator codecs, integer arithmetic, ActivityExecutor/OpenReply/ActivitySession, and actual accepted binding/state fixture `admitExecution`.

**Produces:** Exact function/union/error described by preparation-dispatch-design. The function takes `(runs, artifacts, executor, guard, input, signal)` and `input = { preparation: PreparationInput, openedCommandId: ExecutionCommandId }`. It returns `Promise<PreparationReply>`. `PreparationDispatchError` has readonly `preparation`, `locator` (`ExecutorLocator | null`) and standard `cause`.

- [x] Write and run RED production-helper tests for happy path and deferred open. Adapter.open must read actual store history and observe preparing/capacity before producing a real opaque session object. A held locator-save promise prevents publication. Only the original object is returned after committed prepared state. A compile/import failure is initial TDD evidence only, not a safety proof.
- [x] Implement the sequence in the design using existing helpers, precise unions and exact expected revisions. Before await snapshot serializable inputs. Validate openedCommandId and actual adapter pin before side effects. Only applied opens, duplicate never opens. Check owner renewal before open and retain ambiguous state after post-dispatch failure.
- [x] Add complete negative and race cases against actual memory/SQLite providers: same-command concurrent duplicate, different-command conflict, changed payload, invalid openedCommandId, invalid/missing/unreadable retained state, wrong adapter kind/version, cancellation before open, store refusal before open, owner loss during a held renewal and during held open, malformed/mismatching locator, open throwing, unresolved/mismatching preparation reply, not_started, and locator-save refusal/throw. Assert no extra open, no exposed session, retained capacity/checkpoint and original cause/correlation as applicable. Do not assert fake traces without production helper/store calls.
- [x] Add SQLite close/reopen cases at retained preparing and prepared checkpoints. New invocation of the same command must not open again or reconstruct a live session. Explicitly record these as reopen proofs, not SIGKILL/power-loss proof. No imported fixtures from production code.
- [x] For every newly introduced safety check, run a distinct finite negative through the production helper with its check removed or dependency broken. Observe the intended failing assertion, exact source restoration and same-selector passing rerun. Retain commands/raw outputs/hashes in this plan's ignored workspace; helper-call rejection can prove only that boundary, not later provider publication. Add adjacent truthful Proof comments.
- [x] Run the complete new focused tests after final restoration/formatting, then uncached `twilight-dash:typecheck` and `twilight-dash:lint` using a fresh Nx graph. Format declared paths only. Use Bun/Nx, no alternative task runner. Report required unavailable checks and any unrelated baseline failures explicitly. Root runs broader provider/gate checks after review.
- [x] Self-review and write the full task report with exact RED/GREEN/proof commands, failures/restoration, changed files and limitations. Do not commit or edit parent task checkboxes; root publishes after independent review. Report status plus paths concisely.

Implementation task accepted after independent spec/quality review. Canonical exact-SHA host gate, applicable CI and integration remain separate release acceptance; parent6a.5 and S0/S7a remain open.
