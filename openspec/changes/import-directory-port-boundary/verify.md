# Import directory port verification

Scoped verification. Base: `741840881376327bca23140cb8367c7528818dca`.

The committed production K6 baseline reports one finding, imported-plan resource to directory resource, and `unevaluated: []`. The retained oracle fails on that baseline with `concrete directory resource edge remains`. The exact external policy is the unchanged tree-announcement policy; candidate and negative proofs are recorded below.

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

Import module: **9 pass, 0 fail, 16 assertions**. Mounted organization: **29 pass, 0 fail, 122 assertions**. The module suite was repeated to retain its output; it passed again. Core typecheck emitted no diagnostics. Changed-file ESLint exited 0, but warned that `@nx/enforce-module-boundaries` was skipped because no cached ProjectGraph was available; that Nx rule is unverified locally. Normal implementation commit hooks repeated this warning. The explicit production K6 boundary proof is separate. OpenSpec: **1 passed, 0 failed**. Test transcripts and validation output are retained in evidence. Expected injected endpoint failure logs belong to passing negative tests. MemAvailable observations ranged from approximately 18.6 to 20.9 GB.

The external policy SHA-256 is `5885c9123745f2ff469cf8f486abc3ba4b8bb729d4f3628eaccd501006fc9422`; Bun is `1.4.2+744846f84`, trusted external TypeScript is `6.0.2`, and the current production CLI subtree is `1850e2b5a12d6131c888b246c5132ef3204672b1`. The unchanged lockfile SHA-256 is `15651c976776d7c1ab3a87935b53dae67e73939c6f7d06dec12ed10598cfe80c`.

## Committed production boundary proof

The PM reviewed the exact source diff, signatures and OpenSpec before authorizing the normal-hook implementation commit and disposable committed fault sequence. Normal lefthook pre-commit, prepare-commit-msg and commit-msg ran on the implementation commit. Tool Wiki hook reported inactive external activation; no certification is claimed.

All four CLI invocations used the unchanged external `/tmp/import-directory-k6-policy.json`, the same production CLI subtree and external trusted TypeScript above:

```sh
TOOL_WIKI_TRUSTED_NODE_MODULES=/home/df/wd/puni/puni-00/node_modules \
  bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check committed \
  . <sha> /tmp/import-directory-k6-policy.json --rule K6 > /tmp/import-directory-<variant>.json
python3 openspec/changes/import-directory-port-boundary/evidence/check-boundary.py.txt \
  openspec/changes/import-directory-port-boundary/evidence/baseline.json.txt \
  /tmp/import-directory-<variant>.json
```

| Candidate            | Commit                                     | Production K6            | Boundary oracle |
| -------------------- | ------------------------------------------ | ------------------------ | --------------- |
| Wave9 base           | `741840881376327bca23140cb8367c7528818dca` | One selected finding     | Exit 1          |
| Neutral port         | `ebc519325acdbe9dc072dcd658137e91fe696417` | Zero findings            | Exit 0          |
| Direct fault         | `bac5027bb8ba1275aef18d81227bf996e6775536` | Exactly the base finding | Exit 1          |
| Port re-export fault | `3062712521bb7f2316d4d66db7384dbad358293f` | Exactly the base finding | Exit 1          |

All production CLI invocations exited 0, selected only K6 and reported `unevaluated: []`. Observe mode retains `allowed: true` and `certifies: false`. The oracle checks candidate findings equal baseline minus the exact selected edge; separate equality assertions confirmed both faults restore the exact baseline findings, rule selection and unevaluated set. Raw verdicts, observed oracle outputs and fault patches are retained in evidence.

Faults are separate `git commit-tree` objects parented by the implementation commit, using distinct temporary `GIT_INDEX_FILE` indexes, `git read-tree`, checked/applied cached fault patches, and `git write-tree`. Their trees are `535d762bb62333bd7f21759773ae4dbffa211ab3` (direct) and `2fe363c3da63b6d85de0d0eefa5b3b313fc933ae` (barrel). No branch checkout, source mutation or hook bypass occurred for those disposable objects. The branch retained its neutral port throughout. The adjacent ImportDirectory `Proof:` comment records both observed failures; no runtime safety check changed.

The fault patches apply to implementation commit `ebc519325acdbe9dc072dcd658137e91fe696417`, before the proof comment and this receipt. Full workspace gates, host gate, full survey, browser checks, backend typecheck, broad lint and memory/SQLite source contract suites were not run locally. The two requested focused import suites cover the retained runtime behavior; release acceptance remains with the coordinator. No push, PR, merge, deployment, spec sync or archive was performed here.

Final evidence whitespace validation caught a trailing blank line at EOF in the retained direct patch. Regenerating that patch with one context line removed the artifact; both retained patches then passed cached application checks in fresh temporary indexes and reproduced their original fault trees exactly. `git diff --check 741840881376327bca23140cb8367c7528818dca` passed across source and evidence. Scoped OpenSpec validation was repeated after the receipt and again passed 1/1. The proof comment and receipts change no executable behavior, so the focused runtime suites were not repeated.
