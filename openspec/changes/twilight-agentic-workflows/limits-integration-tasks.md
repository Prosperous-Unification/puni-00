# Runtime organization-limits integration tasks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Root dispatches one coherent integration task and independent review.

**Goal:** Restore current-main limits consumption in the conditional runtime channel.

**Architecture:** Keep main's transaction-bound gauge and default configuration. Preserve runtime canonical identity, credential pins, immutable receipt replay and complete migration history.

**Tech Stack:** Bun, Nx, TypeScript, existing SQLite/Elysia contracts.

**Spec:** [integration design](limits-integration-design.md), [WBS bridge](specs/twilight/wbs-run-bridge/spec.md), and main's wbs-organization-limits change.

Implements [integration design](limits-integration-design.md) by restoring both parents' already specified behavior. Parent sender/coordinator acceptance remains open.

## Global Constraints

- Start from code-reviewed receipt `f978678f7b698cef085788559a1a94c2380231f6` and merge pinned main `33685ec480bc996b6d1909156167367af7279941` only in this isolated branch. Preserve older candidate heads/gates and the user checkout. Bun/Nx only, including scripts; one source implementer.
- Root owns Git/index/HEAD/merge state, all tracked intent/spec/design/tasks/verify, commits/reviews/PRs and canonical gates. Worker owns only the listed conflict resolutions/fixtures/new consumer test and ignored evidence. No subagents, commits, staging, checkout/ours/theirs or branch mutation. Report exact path/cause before any expansion.
- Consume main's existing organization limit policy/gauge/defaults through the ordinary transaction-bound claim path. Preserve credential pins/current authorization, request bytes, strict comparisons, refusal order, exact replay and atomicity. No second cap, legacy-access substitution or uncapped production fallback; no credential/provider/compute/CTT/coordinator implementation.
- Keep all SQL/down files, migration names/timestamps/hashes and rollback/capture guards unchanged. Complete fixture oracles contain both parents in numeric order. Runtime identity stays20261022121000; new main identities are20261022130000_add_organization_limits and20261022130100_widen_organization_audit_organization_limits. Old-identity simulation must match its actual pre-main source catalog, without silently including later migrations or repairing the ledger.
- Preserve every main/runtime refusal variant and its required detail. Runtime cap refusal carries claim_limit/cap/current and command index/kind through the real shared HTTP client. Refusal writes no acceptance/binding/claim/journal; exact accepted replay under current authorization adds no acquisition even after a cap reduction.
- Every genuinely changed safety check/dependency needs an observed production-path negative from green, exact restoration and adjacent truthful Proof. A missing consumed gauge producing a trusted-state500 proves the dependency and typed-outcome loss, not unsafe acceptance. Existing policy guards/history are not blanket freshly recertified.
- Run scoped checks and one final complete SQLite suite after edits/faults/formatting, with immutable before/after source/index/HEAD/MERGE_HEAD/status evidence. Do not weaken guards/timeouts, invent flakiness or repeat broad suites without a named concern. Existing skips/warnings and all failed trials remain disclosed. Older passes do not certify this head; final combined exact-SHA host/CI and broader I1/S0/S7a/activation remain open.

### Task 1: Reconcile existing limits contracts and prove conditional claim consumption

**Files:** Resolve these forty existing content conflicts, retaining both parents' meaningful changes:

- `apps/wbs/be-01/src/machine-credential-audit-migration.db.test.ts`
- `apps/wbs/be-01/src/machine-credential-migration.db.test.ts`
- `apps/wbs/be-01/src/migration-cli.db.test.ts`
- `apps/wbs/be-01/src/person-account-migration.db.test.ts`
- `apps/wbs/be-01/src/trusted-issuer-audience-migration.db.test.ts`
- `apps/wbs/mcp-01/README.md`
- `libs/wbs/adapters/store-memory/src/README.md`
- `libs/wbs/adapters/store-sqlite/src/browser-auth-lifecycle.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/calendar-marker-migration.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/claim-occupancy-schema.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/delegation-use.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/email-challenge-migration.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/email-verification-migration.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/enterprise-sso-migration.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/identity-migration.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/migrate-down.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/migrate.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/optimized-schedule-cache.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/organization-activation.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/organization-audit.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/organization-bridge.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/organization-ownership-freeze.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/organization-ownership.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/organization-records.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/project-rank.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/project-settings.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/project-solution.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/project.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/saved-plan-created-by-id.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/saved-plan-migration.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/shared-people-audit.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/shared-people-mode.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/shared-people-rollback.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/space-rollback.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/space.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/step-blockage-receipt.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/step-code-migration.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/step-estimate-unit-migration.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/step-parallel.db.test.ts`
- `libs/wbs/domain/contracts/src/http/refusal.ts`

Additionally permit `libs/wbs/application/core/src/module/plan-commands/working-plan.resource.ts` only for the narrow temporary missing-gauge dependency fault and its adjacent truthful Proof comment; restore all executable bytes. This is composition evidence, not a limit-policy change.

Additionally permitted existing runtime fixtures (only deployment-default composition,
complete migration catalogs/oracles and the precise old-identity fixture):

- `apps/wbs/be-01/src/controller/runtime-state.db.test.ts`
- `apps/wbs/be-01/src/controller/runtime-authority.db.test.ts`
- `apps/wbs/be-01/src/controller/runtime-claim.db.test.ts`
- `apps/wbs/be-01/src/controller/runtime-write.db.test.ts`
- `apps/wbs/be-01/src/controller/runtime-command.controller.db.test.ts`
- `apps/wbs/be-01/src/controller/runtime-credential-pin.db.test.ts`
- `apps/wbs/be-01/src/runtime-command.boot.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/runtime-ledger.db.test.ts`

Create `apps/wbs/be-01/src/controller/runtime-claim-limit.db.test.ts` for actual
mounted runtime cap consumption. Resolve only files that require changes; permission
to inspect a fixture is not a requirement to churn it. No permanent edit to main's
limit policy/gauge/defaults or to any SQL. If an actual auto-merge defect needs
another source path, report exact path and cause to root before editing it.

**Interfaces:** Consume main `organizationDefaultLimits` source/boot option and
`TEST_ORGANIZATION_DEFAULT_LIMITS`; runtime claims keep the existing
`RuntimeClaimRequest`, `RuntimeCommandRefusal`, generic HTTP client and mounted routes.
Use `OrganizationHarness.openComposed()` and real SQLite. Existing cap fixture writes
a complete `organization_limits` row with `max_concurrent_claims`; use current schema
and actual main fixture conventions. No new helper framework or fake receiver.

- [ ] 1.1 Read both parent sides and actual callers/tests; resolve forty conflicts
      without whole-file ours/theirs. Keep main's defaults/gauge wiring and every refusal
      variant, current credential pins, runtime bytes and shared comparators. Retain both
      navigation entries. Complete all literal forward/reverse migration sets, latest
      identities and old-branch provenance; preserve all original SQL/down bytes. Record
      setup/merge failures separately from semantic RED.
- [ ] 1.2 Add actual mounted HTTP/SQLite cases before any required runtime adaptation:
      at cap, a fresh otherwise eligible runtime claim gets the closed typed `claim_limit`
      reply including `cap`, `current`, `at: 0`, `kind: 'claimWorkItem'`; compare complete
      claim/binding/receipt/journal/ledger observations before/after so refusal writes no
      acceptance or work. Below cap, exactly one immutable binding/receipt and one claim
      commit. After acceptance lower the cap below usage and repeat the exact request:
      original full receipt returns without adding rows, changing authority, journal or
      ledger. Preserve current authorization before replay. Tests must use real receiver,
      application transaction and main gauge; direct SQL may arrange cap fixtures, not
      substitute outcomes. The existing shared HTTP client must parse the typed refusal.
- [ ] 1.3 Make the smallest consumer/fixture restoration needed for those cases and
      existing runtime suites. Every genuinely new/changed check gets watched green→fault
      failure→exact-restored-green proof. For a changed dependency proof, temporarily
      remove the main gauge at its actual graph getter and observe the real mounted cap
      case lose its typed reply to the expected trusted-state error; preserve the actual
      failure strength and final bytes. Do not call this an unauthorized-success proof or
      duplicate main's existing policy proofs. Preserve original and restored hashes and
      both logs; retain any unsuccessful fault-driver trial honestly.
- [ ] 1.4 Prepare a real Nx graph, then run module/effective-policy checks and relevant
      uncached contracts/domain/core/memory/SQLite/backend/MCP typecheck/lint. Run focused
      new runtime-cap + existing state/authority/claim/write/mounted/pin/boot and main
      ordinary-claim-cap coverage, public codec/receipt and HTTP/MCP shape coverage, and
      changed migration/rollback/ledger cases. Finish exact changed-file formatting,
      diff/migration lint and scoped normal OpenSpec. After all edits/faults/formatting,
      run complete SQLite exactly once, with before/after source hashes, index, HEAD,
      MERGE_HEAD and full status freeze checks; no broad overlapping repetitions absent
      a named new concern. Do not weaken existing timeouts/guards or assume flakiness.
- [ ] 1.5 Report exact argv/exits/counts/durations, all initial failures/warnings/skips,
      original/mutant/restored source identities and observed outcomes, protected complete
      migration hashes and final changed-file hashes. Self-review and release source hold.
      Root owns commit, independent task/whole-branch review, published combined exact-SHA
      canonical host gate/applicable CI and truthful acceptance; prior gates are historical.
      Latest-main drift, external retained stores, I1/S0/S7a and activation remain explicit.

**Report:** `.superpowers/sdd/limits-integration-tasks/task-1-report.md`, evidence
`task-1-evidence/`. No worker commits, Git/index/HEAD/merge-state mutation, subagents,
root artifact edits, full host gate or new source task. Return DONE/concerns with a
compact check summary and explicit source-hold release.
