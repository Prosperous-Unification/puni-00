# Verification in progress

WBS120 remains blocked by its prerequisite130 and requires independent review and hosted acceptance. This slice does not complete WBS120, grant coverage or trusted activation, sync specs or archive the change.

## Basis and scope

Isolated shared clone `/tmp/puni-wbs120-yaml-closure-sol-20261016` starts at merged main `fb7bc379ceadfffcce6c2c984941e603519a5867`, tree `bf43443a469c4a73a0ce903531574f4cd91c106d`. The coordinator authorized the bounded YAML support design supplied by the remaining-WBS architect: the existing release-owned root list gains yaml, and the existing packaged installed-consumer oracle exercises its real named parser import and public return type without candidate node_modules. Brainstorming, grilling and domain-modeling guidance were read together; this extends existing terms and authority without a new glossary term or ADR. Optional design.md is omitted because the shared closure mechanism is unchanged.

Read the trusted-module implementation and tests, package build, toolkit release, activation and relocation callers, installed consumer fixture and tool-fleet's actual `parseAllDocuments` import. Root package.json and bun.lock already contain yaml; neither was edited. Existing dependencies are exposed through an ignored node_modules symlink; no install or dependency write was performed.

## Focused evidence

- [Closure RED](evidence/closure-red.log): adding yaml to the literal supported-root expectation before production enrollment failed with `Expected to contain: "yaml"`, 0 pass / 1 fail.
- [Closure GREEN](evidence/closure-green.log): after enrolling yaml, all 14 trusted-modules tests pass with 29 assertions. This includes nested resolution, ancestor decoys, malformed manifests/maps/operands, absent and unreadable manifests, scoped/nested symlinks and transport metadata preservation.
- [Scenario allocation](evidence/scenario-allocation.json): three global YAML-TRUSTED-DECLARATIONS IDs allocated through the production allocator; existing journal events preserved.

The installed vendor oracle now imports real `parseAllDocuments`, exports its return type, asserts the yaml import and declaration, proves candidate node_modules absent, removes/restores copied YAML and alters/restores its declaration, requires refusal without JSON for both faults, and reruns extraction after restoration. These packaged controls have not been executed locally. Extending this oracle does not itself prove packaged acceptance.

Changed-file Prettier formatting and `git diff --check` passed. Scoped ESLint over the three changed TypeScript files reported no errors; its Nx module-boundary rule explicitly skipped because no cached ProjectGraph exists ([log](evidence/scoped-eslint.log)). Pinned OpenSpec 1.12.0 strict validation passed 1/1 ([receipt](evidence/openspec-strict.json)); all-item validation passed 241/241 (223 changes, 18 specs; [receipt](evidence/openspec-all.json)). These checks do not supply the pending installed-consumer proof.

## Command and source provenance

The following invocations were executed on 2026-10-16 from `/tmp/puni-wbs120-yaml-closure-sol-20261016` with Bun 1.4.2. The linked logs are original output-only captures: they do not embed commands, exit-status receipts or a working-tree digest. This section records the invocations from the session transcript, rather than adding retrospective metadata to those logs.

RED ran on base `fb7bc379ceadfffcce6c2c984941e603519a5867` with only the literal `'yaml'` added to the supported-root expectation in `trusted-modules.test.ts`; production `trusted-modules.ts` was still blob `4c5494b481ed169adcb89bc056e61d9c7966a3cd`, without YAML enrollment. GREEN ran after enrollment, before commit: its production blob `f458eb59a6a40234f71ef1f4db499ad366d78a38` and test blob `4ca76341050ebfc8225ce6863cf686c3bb8b6120` are retained in implementation commit `0a8431777f7c92342bfb5c6748db0b2b0d82de7d` (tree `d0a3d897939935a1b52e59e450f17254aadd7b8e`). No whole working-tree identity was captured at either test invocation.

```sh
bun test apps/twilight-structure/twilight-burokrat/cli/src/policy/trusted-modules.test.ts --test-name-pattern 'the release closure includes' > openspec/changes/wbs120-yaml-trusted-declarations/evidence/closure-red.log 2>&1
bun test apps/twilight-structure/twilight-burokrat/cli/src/policy/trusted-modules.test.ts > openspec/changes/wbs120-yaml-trusted-declarations/evidence/closure-green.log 2>&1
```

The remaining invocations ran against the same uncommitted implementation before `0a8431777f7c92342bfb5c6748db0b2b0d82de7d`; the three checked TypeScript blobs match that commit, including installed-test blob `4180c9343ee065474d42e8df1091c9a7e899b8ad`. OpenSpec validation preceded the final command-summary paragraph in this record. Its JSON receipts describe the artifact state then, rather than proving an exact later commit. Individual process exit statuses were not separately captured by the shell command batch; the recorded evidence is Prettier's successful formatting output, ESLint's warning-only output, and OpenSpec's explicit valid-item counts.

```sh
bun node_modules/prettier/bin/prettier.cjs --write apps/twilight-structure/twilight-burokrat/cli/src/policy/trusted-modules.ts apps/twilight-structure/twilight-burokrat/cli/src/policy/trusted-modules.test.ts apps/twilight-structure/twilight-burokrat/cli/src/packaging/install.test.ts openspec/changes/wbs120-yaml-trusted-declarations openspec/scenario-allocations.json
NODE_OPTIONS=--max-old-space-size=768 bun node_modules/eslint/bin/eslint.js apps/twilight-structure/twilight-burokrat/cli/src/policy/trusted-modules.ts apps/twilight-structure/twilight-burokrat/cli/src/policy/trusted-modules.test.ts apps/twilight-structure/twilight-burokrat/cli/src/packaging/install.test.ts > openspec/changes/wbs120-yaml-trusted-declarations/evidence/scoped-eslint.log 2>&1
bun /tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js validate wbs120-yaml-trusted-declarations --strict --json > openspec/changes/wbs120-yaml-trusted-declarations/evidence/openspec-strict.json
bun /tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js validate --all --json > openspec/changes/wbs120-yaml-trusted-declarations/evidence/openspec-all.json
git diff --check
bun node_modules/prettier/bin/prettier.cjs --write openspec/changes/wbs120-yaml-trusted-declarations/verify.md
```

No original standalone `prettier --check` receipt was retained; the original normal pre-commit format hook did run and report all matched files formatted. No installed-consumer invocation, hosted omission/corruption proof or exact-commit canonical gate receipt is available yet; those remain the open tasks below. This evidence correction changes only this Markdown record and preserves the implementation/test blobs named above.

## Failure-proof table

| Boundary                                                                   | Fault                                                                           | Observed outcome                                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Release-owned YAML enrollment                                              | Omit yaml from trustedDeclarationRoots with literal supported-root assertion    | Focused production closure test fails; enrolling yaml restores all 14 tests.                                     |
| Installed extraction resolves YAML independently of candidate dependencies | Build package with yaml omitted from release roots; run installed vendor oracle | Pending hosted heavy-lane proof; blocks task 2.2 and acceptance.                                                 |
| Installed closure identity                                                 | Remove copied yaml or corrupt its declaration, then restore exact bytes         | Controls authored in installed vendor oracle; execution pending hosted lane. Existing identity guards unchanged. |

## Remaining acceptance

Tasks 2.2 and 3.1 remain open. Run packaged RED/omission/restored GREEN serially on the hosted heavy lane, followed by independent review and canonical exact-SHA gate acceptance. No full Nx test/lint/typecheck/build, package build/install, hosted gate, Browser run, whole-tree relationship extraction, secrets/migration CI checks, WBS write, deployment, trusted activation, delta-spec sync or archive was performed. The delta spec needs sync; archive remains blocked.
