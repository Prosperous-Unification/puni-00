# Import directory port verification

Draft scoped verification. Base: `741840881376327bca23140cb8367c7528818dca`.

The committed production K6 baseline reports one finding, imported-plan resource to directory resource, and `unevaluated: []`. The retained oracle fails on that baseline with `concrete directory resource edge remains`. The exact external policy is the unchanged tree-announcement policy; candidate and negative proofs are pending review and commit.

Baseline focused import module test: 9 pass, 0 fail, 16 assertions. The first K6 attempt failed on missing `@noble/hashes`; frozen Bun installation passed after an approved sandbox escalation (`Checked 1573 installs across 1447 packages (no changes)`). The corrected K6 baseline completed successfully.

No domain terms or ADR required for this reversible extraction. No composition runtime changes. Full local Nx gates, full survey and browser checks are intentionally unrun under the laptop memory constraint. The coordinator owns release gates; this change remains draft and makes no WBS090 closure or certification claim.

## Focused candidate checks

All commands below completed with exit 0 on the extracted working tree, serially for the two test suites and core typecheck:

```sh
# From libs/wbs/application/core:
bun test ./src/module/plan-import/module.test.ts --timeout=10000
# From apps/wbs/be-01:
bun test ./src/controller/import-export-organization.controller.db.test.ts --timeout=10000
# From repository root:
bunx tsc --build --force libs/wbs/application/core/tsconfig.json
bunx eslint libs/wbs/application/core/src/ports/import-directory.ts libs/wbs/application/core/src/ports/directory-outcome.ts libs/wbs/application/core/src/module/directory/directory.resource.ts libs/wbs/application/core/src/module/plan-import/imported-plan.resource.ts
bunx prettier --check libs/wbs/application/core/src/ports/import-directory.ts libs/wbs/application/core/src/ports/directory-outcome.ts libs/wbs/application/core/src/module/directory/directory.resource.ts libs/wbs/application/core/src/module/plan-import/imported-plan.resource.ts openspec/changes/import-directory-port-boundary/*.md openspec/changes/import-directory-port-boundary/specs/import-directory-boundary/spec.md
BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate import-directory-port-boundary --json
git diff --check
```

Import module: **9 pass, 0 fail, 16 assertions**. Mounted organization: **29 pass, 0 fail, 122 assertions**. The module suite was repeated to retain its output; it passed again. Core typecheck and changed-file ESLint emitted no diagnostics. OpenSpec: **1 passed, 0 failed**. Test transcripts and validation output are retained in evidence. Expected injected endpoint failure logs belong to passing negative tests. MemAvailable observations ranged from approximately 18.6 to 20.9 GB.

The external policy SHA-256 is `5885c9123745f2ff469cf8f486abc3ba4b8bb729d4f3628eaccd501006fc9422`; Bun is `1.4.2+744846f84`, trusted external TypeScript is `6.0.2`, and the current production CLI subtree is `1850e2b5a12d6131c888b246c5132ef3204672b1`. The unchanged lockfile SHA-256 is `15651c976776d7c1ab3a87935b53dae67e73939c6f7d06dec12ed10598cfe80c`.
