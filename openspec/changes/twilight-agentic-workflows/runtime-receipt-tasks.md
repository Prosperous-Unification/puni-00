# Portable runtime receipt correspondence tasks

Implements [receipt design](runtime-receipt-design.md) and the shared correspondence requirement in [WBS run bridge](specs/twilight/wbs-run-bridge/spec.md). Parent sender/coordinator acceptance remains open.

## Global Constraints

- Start from reviewed codec `e7c2e9a25e21a01cd3184e607c7659bca3f33354` in the isolated receipt worktree. Keep all older candidate heads and active gates fixed. One source implementer; Bun/Nx only, including fault scripts.
- Root owns intent/spec/design/tasks/verify, Git/index/HEAD/commits, reviews and full exact-SHA gates. Worker owns exactly six source/test/navigation paths below plus its ignored report/evidence. No subagents or Git mutation. Report concrete missing path/cause before any expansion.
- Preserve request bytes, strict decoding, existing storage/envelope/ledger/digest/current-permission checks, error messages and ordering. No credentials, SQL/migration, generic HTTP client, sender/outbox, provider, RunStore or coordinator changes.
- Export exactly the three specified synchronous predicates. Move one existing scope/claim/acceptance implementation; compare non-comment bodies against the pinned original. Only the scope function name changes. Keep the old application claim export for its existing caller.
- Predicates consume already boundary-validated values, are nonmutating and do no hashing/authentication. A match establishes complete content correspondence only. Expected digest comes from exact retained canonical bytes; actor account is not scope person; historical receipt is not current grant.
- Every new changed check/dependency needs a watched production-path negative from green, exact restoration and adjacent truthful Proof. Public predicate calls are production code, not mock predicates; distinguish public mismatch admission from actual receiver lookup/write success. Preserve moved unchanged guard history without fresh blanket recertification.

### Task 1: Share complete receipt correspondence and preserve receiver consumers

**Files — exactly six:**

1. Create `libs/wbs/domain/contracts/src/runtime-receipt.ts`.
2. Create `libs/wbs/domain/contracts/src/runtime-receipt.test.ts`.
3. Modify `libs/wbs/domain/contracts/src/index.ts`.
4. Modify `libs/wbs/domain/contracts/README.md` for navigation only.
5. Modify `libs/wbs/application/core/src/module/plan-commands/runtime-authority.ts`.
6. Modify `apps/wbs/be-01/src/controller/runtime-command.controller.db.test.ts` only to exercise public correspondence against real existing mounted receipts.

**Interfaces:** `matchesRuntimeScope(left: RuntimeScope, right: RuntimeScope): boolean`; `matchesRuntimeClaim(left: RuntimeClaim, right: RuntimeClaim): boolean`; `matchesRuntimeReceipt(scope: RuntimeScope, operation: RuntimeOperation, requestDigest: string, receipt: RuntimeReceipt): boolean`. Existing application `matchesRuntimeClaim` export stays compatible; private `matchesAcceptance` moves once. Contracts uses relative runtime value types only. No production crypto, extra decoder, self-barrel or application import.

- [x] 1.1 Add public tests before implementation for valid authority (null/known expected generation), claim and ordered write, and independent false cases for organization/project/person, ledger, command ID, digest, operation/acceptance kind, owner/generation, every request-known claim/execution field, and write applied length/index/kind. Cover receiver-generated claim ID, actor account distinct from scope person, and valid unchanged resulting basis. Missing-export RED is setup only. Move the existing comparisons once and add the complete predicate; compare preserved non-comment bodies against the original.
- [x] 1.2 Wire shared predicates into existing receiver verification, preserving its earlier strict/storage/digest checks and exact errors/order. Keep the old claim export as a compatibility export so `runtime-write.ts` remains unchanged. Augment the three real mounted public-codec authority/claim/write cases to require complete public receipt matching using observed scope, exact operation and independent SHA-256. Preserve original digest assertions and real acceptance; do not replace them with self-derived expectations or fake transport acceptance.
- [x] 1.3 From green, separately bypass each newly owned metadata comparison (three scope fields, ledger, command, digest) and watch its public predicate negative accept the mismatch. Prove actual receiver consumption by bypassing only its shared receipt predicate call: unchanged real `runtime-authority.db.test.ts` cases `throws for retained owner/generation/kind corruption before replay or lookup` must wrongly resolve. Prove the moved write-claim dependency by making shared `matchesRuntimeClaim` return true: unchanged `runtime-write.db.test.ts` cases `refuses borrowed immutable binding mismatch on %s with the live claim unchanged` must produce actual forbidden write success for present mismatches; absent binding should remain refused. Restore exact bytes and green after each distinct fault. Additional genuinely new branch checks require their own unmasked negative; do not call moved unchanged predicate bodies freshly recertified.
- [x] 1.4 After all edits/faults, run public request/receipt and HTTP-shape/client tests, actual mounted/authority/claim/write tests and generated MCP document coverage. Prepare a real Nx graph before module/effective-policy checks. Run relevant uncached contracts/core/backend/MCP typecheck/lint, exact six-file formatting, diff and normal scoped OpenSpec. Do not rerun full SQLite/storage or whole ordinary suites without a named new concern.
- [ ] 1.5 Report exact counts/exits/durations, baseline/fault/restoration logs, preserved-body comparison and final six-path hashes; self-review then release hold. Root independently reviews, commits and runs exact-head host gate/applicable CI before packet acceptance. Parent sender, host ordering, I1/S0/S7a and activation remain open.

**Report:** `.superpowers/sdd/runtime-receipt-tasks/task-1-report.md`; evidence `task-1-evidence/`. No worker commits, extra tracked paths, root docs/spec edits or full host gate.
