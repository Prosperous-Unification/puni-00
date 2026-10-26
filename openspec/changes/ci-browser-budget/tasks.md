# Browser job budget implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. One exact configuration task, task review and final scoped branch review. No independent helper release; cohesive candidate gate/CI remain later requirements.

**Goal:** Let current browser checks complete within a finite measured setup-plus-test budget.

**Architecture:** Change the existing production job timeout and extend its existing parsed-workflow policy test. No new runner, retry, parser or gate framework.

**Tech Stack:** GitHub Actions YAML, Bun test, Nx, TypeScript.

**Spec:** [budget contract](specs/ci-browser-budget/spec.md), [intent](proposal.md), [evidence](verify.md).

## Global Constraints

- Isolated private branch feat/agentic-ci-browser-budget from exact3fdc85cdcffa41e57936764c8de62a2557cf166b. PR 660 and its active host gate keep that immutable source. Root adopts this plan only after the existing de55 writer releases its source hold; no concurrent implementers.
- Root owns all Git/index/HEAD/branch operations, tracked proposal/spec/tasks/verify, commits, reviews and integration. Worker edits only the two listed source paths and its ignored evidence; no staging/commits/subagents. Bun/Nx only; every shell command login:false.
- The numeric job budget is 35 minutes. Preserve four shards, names, zero Playwright retries, per-test timeouts, setup, scope, activated-organization check, artifacts and required pixels propagation. No application/authorization/provider/CTT/activation/deploy code or dependency change.
- Both failed PR 660 browser attempts remain failed and retained. No third unchanged-head retry, no flaky/fixed or application-root-cause claim. No source change retroactively certifies3fdc.
- Every changed safety guard gets an observed production-path negative and exact byte restoration. The production YAML field is the actual GitHub job budget; the policy check reads that exact parsed field. Observe removal, widening36 and restoration25 distinctly, retain all trials and add truthful adjacent Proof comments.
- No full application/browser/host gate locally or independent publication for this internal slice. Focused workflow tests and relevant uncached static checks suffice locally; final cohesive candidate needs exact-SHA canonical gate and all applicable CI. Root owns later integration with the durable-execution branch.

### Task 1: Permit a complete browser verdict with a bounded35-minute job

**Modify only:**

- `.github/workflows/ci.yml`: pixels_shard's timeout field and its stale adjacent budget rationale only.
- `tools/tool-git-hooks/src/hooks/pixels-workflow.test.ts`: existing WorkflowJob test interface and one parsed-workflow budget policy test.

**Exact source change:**

Inside pixels_shard only:

```yaml
timeout-minutes: 35
```

Replace the old budget prose within that job with a short rationale linking this
change's verify.md. Preserve all matrix, step and scope declarations. Historical
benchmarks are in evidence, not new current claims in source comments. Include the
actual observed Proof after fault runs; do not invent its counts beforehand.

Extend the test-only WorkflowJob interface:

```ts
  'timeout-minutes'?: number;
```

Add inside `describe('the CI pixels gate', ...)`:

```ts
test('keeps a finite budget for dependency setup and complete browser verdicts', () => {
  const shardJob = readWorkflow().jobs?.['pixels_shard'];
  expect(shardJob?.['timeout-minutes']).toBe(35);
});
```

The existing readWorkflow uses Bun.YAML.parse. Reuse it without a generic validator
or unrelated test refactor. This is a policy check on the actual production guard,
not a model of browser execution; report that limit explicitly.

- [x] 1.1 Read current job, its caller/aggregate and existing tests. Add the budget test first. Run `bun test tools/tool-git-hooks/src/hooks/pixels-workflow.test.ts`; observe semantic RED because actual production budget is25, not35. Setup/compile failures do not count as RED.
- [x] 1.2 Change only the exact production field and adjacent rationale above. Run the same complete focused file; all current matrix/scope/organization/artifact/aggregate checks must remain green. Preserve both recorded PR 660 failures and its unchanged head.
- [x] 1.3 From green, temporarily remove the actual pixels_shard timeout field, then independently change35to36, then independently restore25. Each actual parsed-production workflow negative must fail the budget test; use exact unique anchors, stop on ambiguity, restore bytes in finally and watch restored green after each. Record original/mutant/restored hashes and actual output; add adjacent truthful Proof after restoration. No service-timeout claims from local test exits alone.
- [x] 1.4 Prepare actual Nx graph with payload and `.meta.json` invocation paths distinct if needed. Run relevant uncached `bunx nx run tool-git-hooks:typecheck --skip-nx-cache` and `bunx nx run tool-git-hooks:lint --skip-nx-cache`, then exact formatting, focused test and diff commands below. Root holds Git/source during fault windows. Compare final two-source identities and complete staged mode/blob/path identity; raw index hashes are recorded separately. Report self-review and explicit source-hold release. Root performs normal-hook commits and independent reviews; cohesive host/CI acceptance remains open.

**Exact final commands:**

```sh
bunx prettier --check .github/workflows/ci.yml tools/tool-git-hooks/src/hooks/pixels-workflow.test.ts
bun test tools/tool-git-hooks/src/hooks/pixels-workflow.test.ts
git --no-optional-locks diff --check
```

Root handles scoped `bunx openspec validate ci-browser-budget --json` and tracked
verification prose. Worker does not mark tracked checkboxes or write Git state.

**Report:** `.superpowers/sdd/tasks/task-1-report.md`; evidence
`task-1-evidence/`. Include all argv/exits/counts/timing, semantic RED/GREEN, each
actual fault and exact restore, warnings/skips, final scope/hashes, self-review and
explicit release. Return compact DONE/DONE_WITH_CONCERNS/BLOCKED/NEEDS_CONTEXT;
no worker commits. Do not read the full plan when dispatched; root extracts Task1.
