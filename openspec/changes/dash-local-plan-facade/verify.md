# Task 1.1 verification

The new `twilight-dash` Bun app accepts only `plan-enrollment` and eight named flags. Its adapter passes fixed `--operation enroll` arguments to the existing `tool-fleet` `runPlan`. This local checkpoint covers only 1.1; plan-byte equivalence, required-file failures, and tasks 1.2–2.2 remain open. No apply, discovery, build, deploy, or authority-store route was added.

The first `bun test apps/twilight-structure/twilight-dash/cli/src/cli.test.ts` failed because the module did not exist. A minimal throwing dispatcher then produced a behavioral RED: 0 pass/21 fail at the command, flag, and delegation assertions (`/tmp/dash-08019-11-red.log`). The intermediate `/tmp/dash-08019-11-green1.log` was 20 pass/1 fail because the valueless-flag fixture accidentally duplicated `--node`; correcting only that fixture yielded 21/21 before the entrypoint negative was added.

`bun install --frozen-lockfile` first failed with sandbox `EROFS` on Bun's temporary directory (`/tmp/dash-08019-install.log`). The same frozen install with `BUN_TMPDIR=/tmp/dash-08019-bun-tmp BUN_INSTALL_CACHE_DIR=/tmp/dash-08019-bun-cache` passed and checked 1602 installs (`/tmp/dash-08019-install-retry.log`). The first sandboxed Nx command exited 0 without a target summary after socket `EPERM` (`/tmp/dash-08019-11-nx-first.log`); it is **not** validation evidence. Uncached Nx then exposed the relative-import boundary (`/tmp/dash-08019-11-nx-escalated.log`) and app-to-infra product boundary (`/tmp/dash-08019-11-nx-second.log`). The exact product-local import exception resolved both without changing the root lint policy. The closed namespace/graph oracles initially failed 2/40 on the new registration (`/tmp/dash-08019-11-devsync-full-first.log`) and were updated narrowly.

Final observed checks:

| Command                                                                                                                                                                            | Result                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false BUN_TMPDIR=/tmp/dash-08019-bun-tmp bunx nx run-many -t test lint typecheck build -p twilight-dash --skip-nx-cache --output-style=static` | Exit 0; all four Dash targets and `tool-test-scratch:build` appeared; 22/22 tests, 66 assertions; Bun bundled 292 modules (`/tmp/dash-08019-11-nx-final.log`).                          |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bun test tools/tool-devsync/src/workspace-projects.test.ts tools/tool-devsync/src/namespace-layout.test.ts`                              | 40/40, 45 assertions (`/tmp/dash-08019-11-devsync-full-green.log`).                                                                                                                     |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bun test tools/tool-devsync/src/workspace-targets.test.ts`                                                                               | 22/22, 75 assertions (`/tmp/dash-08019-11-workspace-targets-final.log`). An earlier invocation named a nonexistent `product-policies.test.ts`; Bun ignored it, so that log is excluded. |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bun test tools/tool-devsync/src/eslint-boundaries.test.ts`                                                                               | 18/18, 84 assertions (`/tmp/dash-08019-11-eslint-boundaries.log`).                                                                                                                      |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false BUN_TMPDIR=/tmp/dash-08019-bun-tmp bunx nx run-many -t lint typecheck -p tool-devsync --skip-nx-cache --output-style=static`             | Exit 0; both named targets appeared (`/tmp/dash-08019-11-devsync-targets.log`).                                                                                                         |

Watched faults; each temporary source/policy mutation was restored before final validation:

| Omitted or substituted boundary           | RED                                                                                                                                                                                                                                | Restored GREEN                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Dash command allowlist                    | Six unsupported commands reached planner; 0/6 (`/tmp/dash-08019-11-r5-allowlist-red.log`).                                                                                                                                         | 6/6 (`/tmp/dash-08019-11-r5-allowlist-green.log`).                              |
| Duplicate-flag guard                      | Duplicate `--node` reached planner; 0/1 (`/tmp/dash-08019-11-r5-duplicate-red.log`).                                                                                                                                               | 1/1 (`/tmp/dash-08019-11-r5-duplicate-green.log`).                              |
| Allowed-flag guard                        | Four unknown/operation/executable cases reached planner; 0/4 (`/tmp/dash-08019-11-r5-flag-red.log`).                                                                                                                               | 4/4 (`/tmp/dash-08019-11-r5-flag-green.log`).                                   |
| Value guard                               | Valueless flag lost its boundary refusal; 0/1 (`/tmp/dash-08019-11-r5-value-red.log`).                                                                                                                                             | 1/1 (`/tmp/dash-08019-11-r5-value-green.log`).                                  |
| Required-flag guard                       | All eight missing flags reached planner; 0/8 (`/tmp/dash-08019-11-r5-required-red.log`).                                                                                                                                           | 8/8 (`/tmp/dash-08019-11-r5-required-green.log`).                               |
| Exact planner lint exception              | Uncached Dash lint failed on product boundary (`/tmp/dash-08019-11-r5-import-exception-red.log`). A sibling `@tools/deploy-contract` import still failed with exception restored (`/tmp/dash-08019-11-r5-sibling-import-red.log`). | Uncached Dash lint exit 0 (`/tmp/dash-08019-11-r5-import-exception-green.log`). |
| Dash name exception                       | Live namespace test demanded `twilight-dash-cli`; 0/1 (`/tmp/dash-08019-11-r5-name-red.log`).                                                                                                                                      | 1/1 (`/tmp/dash-08019-11-r5-name-green.log`).                                   |
| Exact Dash-to-fleet graph acknowledgement | Real Nx graph reported `twilight-dash -> tool-fleet`; 0/1 (`/tmp/dash-08019-11-r5-graph-exception-red.log`).                                                                                                                       | 1/1 (`/tmp/dash-08019-11-r5-graph-exception-green.log`).                        |

The scoped exception follows the repository's existing product-local lint pattern. `apps/twilight-structure` is a suite, so its policy belongs at `apps/twilight-structure/twilight-dash/eslint.product.mjs`; it matches only `cli/src/cli.ts` and exact `^@tools/fleet-plan$`. Other app-to-infra edges remain lint-rejected. The `twilight-dash` Nx name is an exact directory exception and the new project is listed in the closed actual-project inventory.

Final changed-path `bunx prettier --check` passed (`/tmp/dash-08019-11-prettier-final.log`), pinned `bunx @fission-ai/openspec@1.12.0 validate dash-local-plan-facade --strict --json` passed 1/1 (`/tmp/dash-08019-11-openspec-strict-final2.log`), and `validate --all --json` passed 148/148 (`/tmp/dash-08019-11-openspec-all-final2.log`). `git diff --check` exited 0. No host gate, CI, push, PR, or merge was attempted for this isolated slice.

## Task 1.1 lint-boundary review amendment

Astra's review found that the first product-local ESLint override reconstructed root `@nx/enforce-module-boundaries` options without the three `ring:*` constraints. The persistent effective-policy test compares the real `cli.ts` options with `entrypoint.ts`, allowing only the exact alias difference; it also lints an allowed planner import, a sibling infrastructure import in `cli.ts`, and the planner import from the wrong file. Before correction, `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bun test tools/tool-devsync/src/eslint-boundaries.test.ts -t 'keeps every root production boundary for the Dash planner'` failed 0/1 at the missing ring objects (`/tmp/dash-08019-11-rings-red.log`). Adding the root production ring constraints to the local override made the same test pass 1/1, six assertions (`/tmp/dash-08019-11-rings-green-first.log`). The graph-oracle exception is project-pair granularity; the ESLint effective-config test enforces its file and specifier limits.

The first corrected-byte `tool-devsync` typecheck failed on a test-only Bun `expect().toEqual()` generic mismatch (`/tmp/dash-08019-11-review-devsync-targets.log`). Giving the normalized options an explicit `Readonly<Record<string, unknown>>` type corrected the assertion without changing runtime behavior; declared lint/typecheck then passed (`/tmp/dash-08019-11-review-devsync-targets-green.log`). The exact five-file focused command `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bun test apps/twilight-structure/twilight-dash/cli/src/cli.test.ts tools/tool-devsync/src/eslint-boundaries.test.ts tools/tool-devsync/src/workspace-projects.test.ts tools/tool-devsync/src/namespace-layout.test.ts tools/tool-devsync/src/workspace-targets.test.ts` passed 103/103, 276 assertions on the final test bytes (`/tmp/dash-08019-11-review-suite-final2.log`). Uncached Dash test/lint/typecheck/build passed with explicit target summary and 22/22 dispatcher tests (`/tmp/dash-08019-11-review-dash-targets.log`). Changed-path Prettier passed (`/tmp/dash-08019-11-review-prettier-final.log`), pinned strict OpenSpec passed 1/1 (`/tmp/dash-08019-11-review-openspec-strict.log`), all OpenSpec passed 148/148 (`/tmp/dash-08019-11-review-openspec-all.log`), and `git diff --check` exited 0.

## Task 1.2 production entrypoint checkpoint

The fixed adapter already connected `runPlan` in task 1.1. This slice adds real
subprocess contracts and adjacent proofs without changing runtime behavior.
`enrollment-plan.test.ts` supplies one synthetic worker cluster with a dedicated
server and an exactly observed unenrolled agent. Dash and direct fleet entrypoints
consume identical files with different unused output paths. The test compares
complete plan bytes and stdout (including digest and summary), preserves both
input files, checks the exact output names, and requires no mutation-canary log,
common-Git authority directory/database or `.puni` state. The ten PATH canaries
cover SSH/SCP, Ansible, Kubernetes, cloud, Terraform/Terragrunt, Docker, Dagger and
Git; fixture Git initialization happens before the canaries are installed.

Seven real Dash negatives preserve complete-observation, wrong machine identity,
already-enrolled target, unresolved operator identity, malformed reviewed digest,
wrong cluster and lab-provider/production-trait refusals. Each requires nonzero
exit, an anchored actual Bun error diagnostic, empty stdout, unchanged input bytes,
no output and no mutation/authority state. ANSI codes are removed before matching
error lines, so source frames cannot satisfy the diagnostic assertion.

The first two fixture runs failed 0/8 before the intended boundary because the
synthetic workers cluster had no dedicated control-plane server; they are not
implementation RED evidence (`/tmp/dash-08019-12-{first,fixture2}.log`). Fixture 3
passed 7/8; its already-enrolled negative still lacked the required Kubernetes UID
(`/tmp/dash-08019-12-fixture3.log`). Correcting that input produced the valid baseline
8/8, 84 assertions (`/tmp/dash-08019-12-baseline-green.log`) before watched faults.

Each injected fault ran separately against the production source, was restored,
and has a separate passing named-case rerun. Adjacent `Proof:` comments name the
same path and observation.

| Production fault                                           | Observed RED                                                                                 | Restored GREEN                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Dispatch `kubectl apply` after the real Dash planning call | Plan bytes still matched, but the mutation log existed (`Expected: false`, `Received: true`) | Equivalence case passes with zero canaries |
| Omit `runPlan`'s `requireEnrollmentTarget` binding         | Wrong observed machine generated a plan and exited 0                                         | Wrong-target Dash refusal passes           |
| Omit `runPlan`'s `requireLabFleet` binding                 | Lab-provider observation against a production-trait endpoint generated a plan and exited 0   | Lab/production Dash refusal passes         |

Logs are `/tmp/dash-08019-12-r5-{mutation-dispatch,enrollment-binding,lab-binding}-{red,green}.log`.
The restored complete integration suite passed 8/8, 84 assertions
(`/tmp/dash-08019-12-r5-restored-green.log`). After explicit output-presence assertions,
the five-file Dash dispatcher/integration and fleet CLI/plan/lab-provider regression
run passed 54/54, 336 assertions (`/tmp/dash-08019-12-focused-restored-final.log`).

The first uncached Dash lint/typecheck/build run passed lint/build but failed a
test-only `process.env.PATH` index-signature access
(`/tmp/dash-08019-12-nx-final.log`). After bracket access, typecheck/build/lint passed,
but Nx's colored Bun stderr exposed seven diagnostic-normalization test failures
(`/tmp/dash-08019-12-nx-restored-final.log`). Stripping ANSI before the anchored match
fixed only the test parser. Final uncached Dash test/lint/typecheck/build and
`tool-test-scratch:build` all executed and passed; Dash tests were 30/30, 152 assertions
(`/tmp/dash-08019-12-nx-corrected-final.log`). Pinned strict OpenSpec 1/1 and all
148/148 passed (`/tmp/dash-08019-12-{strict,all}.json`); diff checks passed.

Astra independently cleared exact commit `1367bfcc00b43c7b87f3817bda72ec8c512cba59`: real entrypoint equivalence, seven specific refusals, input preservation, mutation canaries, authority absence and all three production fault RED/GREEN pairs match the bounded task. Its fresh five-file run with fleet scratch preload passed 54/54, 336 assertions, exit 0 (`/tmp/dash-08019-12-astra-1367bfcc-focused.log`). Task 1.2 is complete. Task 1.3
and acceptance 2.1–2.2 remain open. No host gate, CI, push, PR, merge, discovery,
authority bootstrap, live host inventory or enrollment execution is claimed.

## Task 1.3 required-state and output checkpoint

The existing fleet IO boundary already implements these refusals. This slice adds
real Dash entrypoint contracts and adjacent production proofs; no runtime behavior
changes. Fleet and observation are each tested separately for absence, unreadability
and malformed syntax. Absence requires `ENOENT`; chmod-000 unreadability runs as
non-privileged uid 1000 and requires `EACCES`. Malformed YAML/JSON requires the
respective required-state path/context. All cases require nonzero exit, empty
stdout, unchanged remaining input bytes, no output, no mutation canary and no
authority state. Permission changes are restored in `finally` before cleanup.

Occupied output retains exact reviewed bytes. A chmod-0500 output directory refuses
with `EACCES` and no success stdout or file. Both retain input bytes and absence of
mutation/authority state. The successful equivalence case also checks mode 0600.
The initial normal integration suite passed 16/16, 173 assertions
(`/tmp/dash-08019-13-baseline.log`) against the existing implementation.

| Production fault                                                | Observed RED                                                                                                                                                                               | Restored GREEN                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Replace exclusive `wx` with overwrite `w`                       | The occupied-output byte comparison failed because the reviewed bytes were replaced by the new plan                                                                                        | Named occupied-output case passed 1/1     |
| Return empty text instead of throwing the required-read failure | All four absent/unreadable fleet/observation cases failed their anchored required-read/path diagnostic assertions; lower schema/JSON decoders still refused but lost required-read context | Four named required-read cases passed 4/4 |

Logs are `/tmp/dash-08019-13-r5-{exclusive-output,required-read}-{red,green}.log`.
Both faults were restored before normal verification. Existing fleet `Proof:`
comments remain intact; additional adjacent proofs state only observed Dash failures.

Final focused five-file command: `bun test --preload ./tools/test/scratch/preload.ts apps/twilight-structure/twilight-dash/cli/src/cli.test.ts apps/twilight-structure/twilight-dash/cli/src/enrollment-plan.test.ts tools/tool-fleet/src/cli.test.ts tools/tool-fleet/src/plan.test.ts tools/tool-fleet/src/lab-provider.test.ts`.
It passed 62/62, 423 assertions, exit 0 (`/tmp/dash-08019-13-focused-final.log`).
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t test lint typecheck build -p twilight-dash --skip-nx-cache --output-style=static`
executed and passed all four targets plus the scratch build dependency, exit 0;
Dash tests passed 38/38, 239 assertions (`/tmp/dash-08019-13-nx-final.log`).

Scoped Prettier, pinned strict OpenSpec 1/1 and all OpenSpec 148/148 passed;
`git diff --check` exited 0. Astra independently cleared exact commit `928433661f79f82eb52b3ead77c7dd1818ebae87`. Its fresh five-file scratch-preloaded run passed 62/62, 423 assertions, exit 0 (`/tmp/dash-08019-13-astra-9284336-focused.log`); both production fault logs and restored GREENs match their precise claims. Astra audited the Nx summary but did not rerun Nx, gate or CI. Task 1.3 is complete.
Acceptance 2.1–2.2 remains open. No host gate, CI, publishing, merge or live host
operation is claimed; Tool Wiki external activation remains unprovisioned.
