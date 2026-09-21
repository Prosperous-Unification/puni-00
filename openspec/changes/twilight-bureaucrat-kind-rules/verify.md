# Verification Report

**Change**: `twilight-bureaucrat-kind-rules`
**Verifier**: Codex executor

## Commands and results

### Part A — adopted-set ratcheting

Executor attempt `010-7-rules.A.20260920T133333Z` on base `1280a734`, then the planner. The executor stopped at source lint on one autofixable `simple-import-sort/imports` error in `rule-policy.ts` (`RelativePath` written before `RelationshipRequest`); the planner ran `bunx eslint --fix` on that file and completed this part's verification.

| Command                                                                                                                                     | Result                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused rules suite, baseline                                                                                                               | exit 0; 19 pass, 0 fail                                                                                                                                                                     |
| Strict OpenSpec validation, baseline                                                                                                        | exit 0; 103 passed, 0 failed                                                                                                                                                                |
| Focused rules suite, tests first                                                                                                            | exit 1 as expected; 18 pass, 4 fail of 22                                                                                                                                                   |
| Focused rules suite, implemented                                                                                                            | exit 0; 22 pass, 0 fail (baseline plus three)                                                                                                                                               |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`                                                                                 | exit 0                                                                                                                                                                                      |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source`                                                                               | executor: exit 1 on the import order; planner, after the autofix: exit 0                                                                                                                    |
| Focused rules suite after the autofix, run as the target runs it                                                                            | exit 0; 22 pass, 0 fail. Run bare, two adapter tests fail on `trusted TypeScript runtime modules are not configured`: the target sets `TOOL_WIKI_TRUSTED_NODE_MODULES`, a bare run does not |
| `NX_DAEMON=false bunx nx run-many -t test test:package -p twilight-bureaucrat tool-devsync --skip-nx-cache`, planner, agent variables unset | exit 0; both projects' targets succeeded                                                                                                                                                    |

### Part B — F7 file-size ratchet

Executor attempt `010-7-rules.B.20260920T141318Z`.

| Command                                                                 | Result                                                                                                                              |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Focused rules suite, baseline                                           | exit 0; 22 pass, 0 fail                                                                                                             |
| Strict OpenSpec validation, baseline                                    | exit 0; 104 passed, 0 failed                                                                                                        |
| Focused rules suite, tests first                                        | exit 1 as expected; 4 pass, 29 fail of 33; observed `sizeCeilings must be removed` and `rule policy names an unregistered rule: F7` |
| Focused rules suite, implemented and after formatting                   | exit 0; 33 pass, 0 fail (baseline plus eleven)                                                                                      |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`             | exit 0                                                                                                                              |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source`           | exit 0, no diagnostics                                                                                                              |
| Owned-file Prettier write; `NX_DAEMON=false bunx nx format:check --all` | write exited 0; repository-wide check exited 0 with no output                                                                       |
| Strict OpenSpec validation, final                                       | exit 0; 104 passed, 0 failed, unchanged from baseline                                                                               |

Planner, after part B, 2026-09-20:

- Replayed B2 outside the sandbox (`lines > ceilings.ceiling` changed to `>=`): `allows a file exactly at the ceiling` failed with a finding `40 lines exceeds the ceiling 40` where none was expected; restored byte for byte; the rules suite then passed 33 of 33.
- The first whole-suite run FAILED, in a test the sandboxed executor cannot run: `buildPackage > builds the canonical executable for use outside the repository` exited 1 on `rule policy states no mode for F7`. Registering a rule makes every rule policy owe it a mode, and the packaged-build test writes its own policy. The planner added `F7` (observe) to that policy with a `Proof:` comment naming this failure. Every later part that registers a rule must add it there too.
- After that fix: `twilight-bureaucrat:test:package` 44 pass, 0 fail; the whole `twilight-bureaucrat:test`, `lint:source` and `typecheck` succeeded; `tool-devsync:test` and `typecheck` succeeded in the first run; format check clean.

### Part C — kind resolution and module layout

Executor attempt `010-7-rules.C.20260920T151312Z`.

| Command                                                                 | Result                                                                                                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Focused rules suite, baseline                                           | exit 0; 33 pass, 0 fail                                                                                                                                      |
| Strict OpenSpec validation, baseline                                    | exit 0; 104 passed, 0 failed                                                                                                                                 |
| Focused rules suite, tests first                                        | exit 1 as expected; 6 pass, 37 fail of 43; the in-process tests threw `kind resolution is not implemented`, and CLI policies named unregistered `MOD-LAYOUT` |
| Focused rules suite, implemented and after formatting                   | exit 0; 43 pass, 0 fail (baseline plus ten)                                                                                                                  |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`             | exit 0                                                                                                                                                       |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source`           | exit 0, no diagnostics                                                                                                                                       |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:build`                 | exit 0                                                                                                                                                       |
| Owned-file Prettier write; `NX_DAEMON=false bunx nx format:check --all` | write exited 0; repository-wide check exited 0 with no output                                                                                                |
| Strict OpenSpec validation, final                                       | exit 0; 104 passed, 0 failed, unchanged from baseline                                                                                                        |

C1, C2a, C2b, C3 and C8a exercised kind resolution in process. C4 through C7 and C8b
exercised the production CLI.

Planner, after part C, 2026-09-20: replayed the candidate-root fault outside the sandbox (`modulePath` always joining with `/`): `allows a module at the candidate root` failed with two findings at `.`, `module directory declares no wiki index` and `module directory declares no contract file`, where none were expected; restored byte for byte. The whole `twilight-bureaucrat` `test`, `test:package` (with `MOD-LAYOUT` in the packaged-build test's rule policy, section 0.5a of the packet), `lint:source` and `typecheck` succeeded.

### Part D — K3 and K4 import direction

Executor attempt `010-7-rules.D-finish.20260920T163701Z`. D1 was supplied from the stopped
predecessor attempt; D2 through D6 were replayed in this attempt. Every fault exercised the
production CLI.

| Command                                                                 | Result                                                                                                                                                                                                      |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused rules suite, baseline                                           | exit 0; 43 pass, 0 fail                                                                                                                                                                                     |
| Strict OpenSpec validation, baseline                                    | exit 0; 104 passed, 0 failed                                                                                                                                                                                |
| Focused rules suite, tests first                                        | exit 1 as expected; the seven direction tests named unregistered `K3`                                                                                                                                       |
| Focused rules suite, implemented and after all proof restores           | exit 0; 50 pass, 0 fail (baseline plus seven); `reports a declared relationship that the candidate leaves unresolved` passed                                                                                |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`             | exit 0                                                                                                                                                                                                      |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source`           | first two runs exited 1; direct ESLint showed only autofixable `simple-import-sort/imports` errors in `check.ts` and `registry.ts`; after `bunx eslint --fix` on those two owned files, the target exited 0 |
| Owned-file Prettier write; `NX_DAEMON=false bunx nx format:check --all` | write exited 0; repository-wide check exited 0 with no output                                                                                                                                               |
| Strict OpenSpec validation, final                                       | exit 0; 104 passed, 0 failed, unchanged from baseline                                                                                                                                                       |

Pending planner verification: the whole `twilight-bureaucrat:test`,
`twilight-bureaucrat:test:package` and `tool-devsync:test` targets. The host gate was not run on
this machine.

Planner, after part D, 2026-09-20: replayed D3 outside the sandbox (in `kinds.ts`, the composition root pushed into `files` as a feature instead of into `compositionRoots`): `exempts a composition root that imports every kind` failed with a finding at `src/m/composition.ts` where none was expected, and the kind-resolution case failed with it (recorded, not a stop); restored byte for byte. The whole `twilight-bureaucrat` `test`, `test:package` (with `K3` and `K4` in the packaged-build test's rule policy), `lint:source` and `typecheck` succeeded; `tool-devsync:test` succeeded; format check clean.

### Part E — K2, K5, K6, F1 and record

Executor attempt `010-7-rules.E.20260920T171254Z`. Every required fault exercised the production
CLI. Evidence is retained as the named `.patch` and `.log` files.

| Command                                                                 | Result                                                                                                                                         |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused rules suite, baseline                                           | exit 0; 50 pass, 0 fail                                                                                                                        |
| Strict OpenSpec validation, baseline                                    | exit 0; 104 passed, 0 failed                                                                                                                   |
| Focused rules suite, tests first                                        | exit 1 as expected; 9 pass, 52 fail of 61; observed `plainTypeScriptPaths must be removed`, unregistered `F1`, and unknown `F1` from `explain` |
| Focused rules suite, implemented and after all proof restores           | exit 0; 61 pass, 0 fail (baseline plus eleven)                                                                                                 |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`             | exit 0                                                                                                                                         |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source`           | exit 0, no diagnostics                                                                                                                         |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:build`                 | exit 0                                                                                                                                         |
| Owned-file Prettier write; `NX_DAEMON=false bunx nx format:check --all` | write exited 0; repository-wide check exited 0 with no output                                                                                  |
| Strict OpenSpec validation, final                                       | exit 0; 104 passed, 0 failed, unchanged from baseline                                                                                          |

Pending planner verification: the whole `twilight-bureaucrat:test`,
`twilight-bureaucrat:test:package` and `tool-devsync:test` targets. The packaged-build test was
updated with observing modes for F1, K2, K5 and K6 but was not run in the sandbox. The host gate was
not run on this machine.

## Failure proofs

| Proof | Check                                   | Fault injected                                                             | Test that observed the failure                                          | Result                                                                                                                                                                            |
| ----- | --------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1    | Ratchet needs an adopted set            | Deleted the `mode === 'ratchet' && policy.adoptedSet === undefined` branch | `refuses ratchet when the policy states no adopted set`                 | Failed: expected stderr to contain `rule policy sets INV-CLASSIFY to ratchet but states no adopted set`, received `""`. Executor, and replayed by the planner with the same line. |
| A2    | Debt outside the adopted set is allowed | `effectOf` returns `refusal` for ratchet unconditionally                   | `reports ratchet debt outside the adopted set and allows the candidate` | Failed: `Expected: 0`, `Received: 1`.                                                                                                                                             |
| A3    | Debt inside the adopted set refuses     | `effectOf` returns `debt` for ratchet unconditionally                      | `refuses ratchet debt inside the adopted set`                           | Failed: `Expected: 1`, `Received: 0`.                                                                                                                                             |
| A4    | An adopted set states each prefix once  | Removed the `.narrow` from `AdoptedSetRecord`                              | `refuses an adopted set that repeats a prefix`                          | Failed: expected stderr to contain `unique adopted prefixes`, received `""`.                                                                                                      |
| B1    | Line counting                           | Returned zero from `countLines`                                            | `reports an unpinned file over the ceiling with both numbers`           | Failed: expected one F7 finding, received `[]`.                                                                                                                                   |
| B2    | Ceiling equality                        | Changed `>` to `>=`                                                        | `allows a file exactly at the ceiling`                                  | Failed: received `40 lines exceeds the ceiling 40`.                                                                                                                               |
| B3    | Stale pin                               | Deleted the stale-pin loop                                                 | `refuses a size policy that pins a file the candidate does not hold`    | Failed: expected exit 1, received 0.                                                                                                                                              |
| B4    | Pinned maximum                          | Added 1000 to the maximum                                                  | `reports a pinned file that has grown past its pin`                     | Failed: expected one finding, received `[]`.                                                                                                                                      |
| B5    | Shrunk pin removal                      | Deleted the at-or-under-ceiling branch                                     | `reports a pinned file that has fallen under the ceiling`               | Failed: expected one finding, received `[]`.                                                                                                                                      |
| B6    | Source exclusions                       | Made every path measured                                                   | `measures neither a test file nor a declaration file`                   | Failed: received two findings where none were expected.                                                                                                                           |
| B7    | Root boundary                           | Replaced the root predicate with `path.startsWith(root)`                   | `measures nothing outside the declared roots`                           | Failed: received a finding for `src2/big.ts`.                                                                                                                                     |
| B8    | Nonempty roots                          | Removed the empty-roots branch                                             | `refuses a size policy with no root, a repeated root or a repeated pin` | Failed: expected stderr to contain `at least one measured root`, received `""`.                                                                                                   |
| B9a   | Unique roots                            | Removed only the duplicate-root branch                                     | `refuses a size policy with no root, a repeated root or a repeated pin` | Failed: expected stderr to contain `unique measured roots`, received `""`.                                                                                                        |
| B9b   | Unique pins                             | Replaced the duplicate-pin return with `true`                              | `refuses a size policy with no root, a repeated root or a repeated pin` | Failed: expected stderr to contain `unique pinned paths`, received `""`.                                                                                                          |
| B10   | Required size policy                    | Removed the `policy.sizeCeilings` input disjunct                           | `refuses F7 when the policy states no size ceilings`                    | Failed: expected the required-input sentence in stderr, received `""`; exit remained 1.                                                                                           |
| C1    | Kind suffix boundary                    | Loosened the suffix pattern to match a kind segment anywhere               | `does not read a kind from a test file`                                 | Failed: expected length 1, received length 2.                                                                                                                                     |
| C2a   | Direct view delivery                    | Kept only the descendant half of the view-directory predicate              | `calls a file under a module's view directory delivery`                 | Failed: expected to contain `["m/view/panel.tsx", "delivery", "m"]`; received only the feature and nested delivery tuples.                                                        |
| C2b   | Nested view delivery                    | Kept only the direct half of the view-directory predicate                  | `calls a file under a module's view directory delivery`                 | Failed: expected to contain `["m/view/deep/row.tsx", "delivery", "m"]`; received only the feature and direct delivery tuples.                                                     |
| C3    | Nearest module                          | Kept the first enclosing module instead of the longest                     | `assigns a file to its nearest module`                                  | Failed: expected `"m/inner"`, received `undefined`.                                                                                                                               |
| C4    | Contract requirement                    | Deleted the contract observation branch                                    | `names a module directory that declares no contract`                    | Failed: expected one `module directory declares no contract file` finding at `src/m`, received `[]`.                                                                              |
| C5    | Checked wiki index                      | Counted a regular file named README instead of a checked index             | `names a module directory that declares no wiki index`                  | Failed: expected one `module directory declares no wiki index` finding at `src/m`, received `[]`.                                                                                 |
| C6    | Regular contract file                   | Included every candidate mode in the contract lookup                       | `names a module whose contract is a symlink`                            | Failed: expected messages to contain `module directory declares no contract file`, received `[]`.                                                                                 |
| C7    | Unavailable index report                | Returned an empty observed list when the index outcome was unavailable     | `refuses a candidate whose index metadata is malformed`                 | Failed: expected exit 1, received 0.                                                                                                                                              |
| C8a   | Candidate-root module containment       | Applied the named-root containment guard to the empty root                 | `calls a file under a module's view directory delivery`                 | Failed: expected the root module `""` for `view/panel.tsx`, received `undefined`.                                                                                                 |
| C8b   | Candidate-root module paths             | Always joined a module root and filename with `/`                          | `allows a module at the candidate root`                                 | Failed: expected no findings; received missing-index and missing-contract findings at `.`.                                                                                        |
| D1    | Barrel traversal                        | Returned only the direct target from `reachedTargets`                      | `sees a repository through a barrel a feature imports`                  | Failed: expected one repository finding, received `findings: []` (`D1.patch`, `D1.log`).                                                                                          |
| D2    | Forbidden-kind membership               | Treated every reached kind as forbidden                                    | `allows a feature-service that imports a resource-service`              | Failed: expected `findings: []`, received one K3 debt finding, `feature imports resource src/m/m.resource.ts through './m.resource'` (`D2.patch`, `D2.log`).                      |
| D3    | Composition-root exemption              | Classified `composition.ts` as a feature                                   | `exempts a composition root that imports every kind`                    | Failed: expected `findings: []`, received one K3 debt finding at `src/m/composition.ts` for its repository import (`D3.patch`, `D3.log`).                                         |
| D4    | Extraction failure is unevaluated       | Reported an empty observed list when relationship extraction failed        | `refuses K3 when the trusted modules are unconfigured`                  | Failed at the exit-status assertion: expected 1, received 0 (`D4.patch`, `D4.log`).                                                                                               |
| D5    | K3 forbids delivery                     | Removed `delivery` from K3's forbidden kinds                               | `names a feature-service that imports a delivery component`             | Failed: expected one delivery finding, received `findings: []` (`D5.patch`, `D5.log`).                                                                                            |
| D6    | K4 forbids feature-services             | Removed `feature` from K4's forbidden kinds                                | `names a resource-service that imports a feature-service`               | Failed: expected one feature finding, received `findings: []` (`D6.patch`, `D6.log`).                                                                                             |
| E1    | K2 forbids resource-services            | Made K2's forbidden-kind list empty                                        | `names a delivery component that imports a resource-service`            | Failed: expected one K2 finding, received `findings: []` (`E1.patch`, `E1.log`).                                                                                                  |
| E2    | K5 forbids resource-services            | Left only delivery in K5's forbidden-kind list                             | `names a repository adapter that imports a resource-service`            | Failed: expected length 1, received length 0 (`E2.patch`, `E2.log`).                                                                                                              |
| E3    | K6 reports cross-module siblings        | Forced the same-module comparison true                                     | `names a feature that imports another module's feature`                 | Failed: expected length 1, received length 0 (`E3.patch`, `E3.log`).                                                                                                              |
| E4    | K6 allows same-module siblings          | Forced the same-module comparison false                                    | `allows two files of one kind inside one module`                        | Failed: expected no findings; received one K6 finding, `feature in src/m imports feature in src/m` (`E4.patch`, `E4.log`).                                                        |
| E5    | Declared plain TypeScript is covered    | Ignored `declaredPlain` for an unkinded source                             | `names a store the policy declares plain TypeScript`                    | Failed on the exact-path invocation: expected one finding, received none (`E5.patch`, `E5.log`).                                                                                  |
| E5b   | Prefix selectors match descendants      | Disabled the prefix arm of `matchesSelector`                               | `names a store the policy declares plain TypeScript`                    | Failed on the prefix invocation: expected one finding, received none (`E5b.patch`, `E5b.log`).                                                                                    |
| E5c   | Prefix selectors stop at path boundary  | Removed the slash boundary from the prefix arm                             | `names a store the policy declares plain TypeScript`                    | Failed on the prefix invocation: expected one finding, received two because `src/more/store.ts` also matched (`E5c.patch`, `E5c.log`).                                            |
| E6    | F1 includes scoped React packages       | Removed the scoped-package prefix check                                    | `names a service that imports a scoped React package`                   | Failed: expected one finding, received none (`E6.patch`, `E6.log`).                                                                                                               |
| E7    | Delivery is exempt from F1              | Removed the delivery skip                                                  | `exempts delivery from the framework boundary`                          | Failed: expected no findings; received `delivery imports external:react through 'react'` (`E7.patch`, `E7.log`).                                                                  |
| E8a   | Exact selectors must remain current     | Deleted the absent exact-path refusal                                      | `refuses a plain TypeScript selector the candidate does not hold`       | Failed on the exact-path invocation: expected exit 1, received 0 (`E8a.patch`, `E8a.log`).                                                                                        |
| E8b   | Prefix selectors must remain current    | Neutralized the uncovered-prefix refusal                                   | `refuses a plain TypeScript selector the candidate does not hold`       | Failed on the prefix invocation: expected exit 1, received 0 (`E8b.patch`, `E8b.log`).                                                                                            |
| E9    | F1 requires its selector policy         | Removed the `policy.plainTypeScriptPaths` required-input disjunct          | `refuses F1 when the policy declares no plain TypeScript paths`         | Failed: expected the required-input sentence in stderr, received `""`; exit remained 1 (`E9.patch`, `E9.log`).                                                                    |
| E10   | F1 belongs to code shape                | Changed `plainTypeScriptRule.family` to `relationships`                    | `prints the registry record for a kind rule`                            | Failed: expected `code-shape`, received `relationships` (`E10-exact.patch`, `E10-exact.log`).                                                                                     |

Planner, after part E, 2026-09-20: replayed E9 outside the sandbox (in `rule-policy.ts`'s `assertPolicyInputs`, the `policy.plainTypeScriptPaths` disjunct replaced by `false`): `refuses F1 when the policy declares no plain TypeScript paths` failed with `Expected to contain: "rule F1 needs policy.plainTypeScriptPaths, which the rule policy omits"` against `Received: ""`, 60 pass and 1 fail; restored byte for byte. (A first attempt at this replay matched no text and changed nothing; the suite it ran was the unmutated one, 61 pass.) The whole `twilight-bureaucrat` `test`, `test:package` (with `F1`, `K2`, `K5` and `K6` in the packaged-build test's rule policy), `lint:source` and `typecheck` succeeded; `tool-devsync:test` succeeded; format check clean; OpenSpec 104 of 104.

### Part F — compiler-supported ambient non-code imports

Executed 2026-09-21 from clean baseline `d749c2c77b148effc4f17effb7d05fa5f1cd6c79`, which contains reviewed spec commit `1ee505d4`, implementation `cc99183d`, declaration-reference proof correction `e5e015ea`, and production rule-path proof `00077bc6`.

| Command                                                                                                           | Result                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test apps/wiki/cli/src/relationships/relationships.test.ts` | Two complete retained invocations each exited 0 with 25 pass, 0 fail, 420 assertions. The second was started because the first tool wrapper initially returned without a session identifier or visible exit after five passing cases; the first process continued and later also wrote its exit-0 sidecar and full summary. No source changed between them. |
| `TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test apps/wiki/cli/src/rules/rules.test.ts`                 | exit 0; 63 pass, 0 fail, 557 assertions.                                                                                                                                                                                                                                                                                                                    |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:test --skip-nx-cache`                                            | exit 0; 759 pass, 0 fail, 6,649 assertions across 39 files; Nx cache skipped.                                                                                                                                                                                                                                                                               |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`                                                       | exit 0; target executed, 0/1 cache hits.                                                                                                                                                                                                                                                                                                                    |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source`                                                     | exit 0; target executed, 0/1 cache hits.                                                                                                                                                                                                                                                                                                                    |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:build`                                                           | exit 0; target executed, 0/1 cache hits.                                                                                                                                                                                                                                                                                                                    |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:test:package --skip-nx-cache`                                    | exit 0; 44 pass, 0 fail, 307 assertions across 6 files; target and its two dependencies succeeded with Nx cache skipped.                                                                                                                                                                                                                                    |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                          | exit 0; 112 passed, 0 failed.                                                                                                                                                                                                                                                                                                                               |
| `NX_DAEMON=false bunx nx format:check --all`                                                                      | exit 0.                                                                                                                                                                                                                                                                                                                                                     |

#### Failure proofs

| Proof                                     | Injected production fault                                                                             | Observed production-path failure and restoration                                                                                                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1 — semantic admission                   | Forced `isCompilerSupportedAmbientImport` to return false.                                            | `omits a compiler-supported ambient non-code import without inventing a target` failed with `TypeScript import unresolved: packages/apps/consumer/src/use.ts -> './styles.css'`; red exit 1, restoration cmp 0, immediate named green 1/0. |
| F2 — no fabricated target                 | Returned `{ kind: 'target', target: 'external:ambient' }`.                                            | The same production CLI test observed a CSS import selector targeting `external:ambient`; red exit 1, restoration cmp 0, immediate named green 1/0.                                                                                        |
| F3 — unmatched imports remain fatal       | Returned ambient omission for every unresolved module.                                                | The real `./absent` case lost its exact boundary refusal and reached `Cannot find module './absent'`; red exit 1, restoration cmp 0, immediate unresolved-input green 1/0.                                                                 |
| F4 — no physical-existence gate           | Required `existsSync` for the compiler-supported virtual stylesheet.                                  | The ambient test failed with its exact CSS unresolved diagnostic; red exit 1, restoration cmp 0, immediate named green 1/0.                                                                                                                |
| F5 — extraction failure stays unevaluated | Made `readRelationshipOutcome` return an empty successful relationship report after extraction threw. | The unsupported physical-stylesheet candidate exited 0 with `allowed: true`, two permitted MOD-LAYOUT debts, and no unevaluated graph rules; test exit 1, `rules/check.ts` restoration cmp 0, separate named green 1/0/10.                 |

The original F1–F4 execution retained each red and byte restoration but omitted a separate GREEN immediately after each restoration; its later aggregate greens did not satisfy that evidence requirement. This omission remains recorded in `bureaucrat-ambient-task23-report.md`. All four complete red/cmp/immediate-green cycles were then replayed against unchanged `e5e015ea` and independently checksummed and approved in `bureaucrat-ambient-task23-root-review.md`. That review also independently repeated F1, restored byte-identically, and ran the ambient, real-unresolved, and original-reference cases together: 3 pass, 0 fail, 76 assertions.

The new declaration source-reference kind assertion received its own bounded proof: only the declaration-walk call misclassified `./globals.d.ts` as ambient, and `retains an original TypeScript source path reference in its emitted public closure` failed with the exact ambient-reference error; restoration cmp 0 and separate green 1/0/23. The Task 4 reviewer independently repeated F5 with red exit 1, restore cmp 0, and green 1/0/10. Both reviews found no remaining issue.

No package was published or activated. No immutable host gate was run or claimed for this Part F closure.

### Part G — declaration-only JSON inputs

Basis: `d749c2c7`. The artifact amendment is
`e7dabb26bb44df547b3fc1edc1a7f8dc1c86d1f5`, the implementation is
`9db518989bd3247869b4546daa80a1977a785761`, and the adjacent proof comments are
`8e0a953b9773c9855479110138a83f1186aaecfd`. Closure ran at that last immutable SHA in executor
attempt `bureaucrat-json-declarations.Task-5.20260921T174403Z`.

The implementation slice selected five production CLI behaviors before production code. Its red
ran a nonzero selection and retained the expected three mismatches: implementation-only JSON
reached the generic declaration-emit failure, the public JSON case failed before the specific
source/target refusal, and the multi-source bundle was published under only its first source. The
genuine compiler-error and measured single-source/invalid-JSON bundle cases already passed. The
prior executor's raw output and exact red pass/fail totals are not in this checkout; the planner
must reconcile those retained artifacts rather than infer a count here.

#### Failure proofs

Commit `8e0a953b` records the observed production-path reds next to their owning assertions. Each
fault was restored before that commit. The prior mutation patches, `cmp` output and individual
green counts are not present in this checkout, so they remain planner evidence to replay; the fresh
focused green below ran all five behavior groups together.

| Proof                            | Injected production fault                                                            | Named production test and observed mismatch                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 — JSON classification         | Forced `isJsonSource` to return false.                                               | `extracts every TypeScript declaration while retaining real JSON dependency edges` failed because targeted emit reached a compiler-classified JSON input and reported `declaration emit failed ... project.json: no diagnostic`. |
| G2 — complete TypeScript mapping | Suppressed the callback assignment for `json-helper.ts`.                             | The same test failed with `declaration output missing ... json-helper.ts`.                                                                                                                                                       |
| G3 — forward/reverse JSON graph  | Skipped JSON targets in the import loop.                                             | The same test's exact forward-edge assertion received `[]`; the reverse edge derives from that retained import list.                                                                                                             |
| G4 — public closure              | Returned false instead of throwing for the missing JSON declaration dependency.      | `refuses a JSON dependency retained by the public declaration` received exit 0 and a public identity that omitted `schema.json`.                                                                                                 |
| G5 — compiler diagnostics        | Removed the pre-emit diagnostic refusal.                                             | `refuses a genuine compiler error before declaration emit` received exit 0 instead of `TypeScript compiler failed:` for `MissingType`.                                                                                           |
| G6 — bundled ownership           | Removed the multi-source callback refusal and mapped the bundle to the first source. | `refuses a multi-source bundled declaration` received exit 0 with only the first source represented.                                                                                                                             |

#### Closure commands and results

| Command                                                                                              | Result                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Five named JSON/compiler/bundle behaviors in `relationships.test.ts` with trusted repository modules | exit 0; 5 pass, 0 fail, 57 assertions; 25 filtered out.                                                                                                                                                                             |
| Complete `relationships.test.ts` with trusted repository modules                                     | exit 0; 30 pass, 0 fail, 468 assertions.                                                                                                                                                                                            |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck --skip-nx-cache`                          | exit 0; target succeeded with cache skipped.                                                                                                                                                                                        |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source --skip-nx-cache`                        | exit 0; target succeeded with cache skipped.                                                                                                                                                                                        |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:test --skip-nx-cache`                               | exit 0; 764 pass, 0 fail, 6,697 assertions across 39 files.                                                                                                                                                                         |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:build --skip-nx-cache`                              | exit 0; target succeeded with cache skipped.                                                                                                                                                                                        |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:test:package --skip-nx-cache`                       | executor sandbox: exit 1; 23 pass and 2 unnamed failures because `Bun.serve` received `EPERM: operation not permitted, listen`, followed by teardown of the uninitialized server. Pending planner verification outside the sandbox. |
| Named strict OpenSpec validation before closure edits                                                | exit 0; one item, id `twilight-bureaucrat-kind-rules`, valid true, zero issues.                                                                                                                                                     |
| `GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all` before closure edits           | exit 0.                                                                                                                                                                                                                             |

#### Production tool-fleet extraction

The production committed-candidate CLI ran at
`8e0a953b9773c9855479110138a83f1186aaecfd` with
`TOOL_WIKI_TRUSTED_NODE_MODULES` set to the installed `node_modules` of the unchanged integration
worktree. `realpath` proved that trusted module directory was outside this implementation lane. The command exited 0,
stdout was exactly one JSON document, and stderr was empty. Structural `jq` assertions proved:

- exactly one import selector maps `tools/tool-fleet/src/plan.ts` through
  `@tools/fleet-operation-plan-schema` to `infra/fleet/schemas/operation-plan.json` as a value
  import;
- the JSON provider's reverse edge names the same `plan.ts` source, specifier and import kind;
- exactly one public selector exists for `plan.ts`, with three nonempty declaration entries;
- no declaration line that is an import or export-from statement names the operation-plan JSON;
  the JSDoc words `operation-plan bytes` were not treated as an import;
- two TypeScript import selectors have source `infra/local/vm-lab.ts`, so the wrapper remained in
  the configured program.

The relationship command wrote its report, request and empty stderr only under the attempt's
evidence directory. It did not publish a repository relationship or policy artifact and proves
only extraction plus the selected public closure; it does not prove F1 or K2 through K6 evaluated.

The packet's supplied compiler-API probes came from the previous planner's session directory and basis
`d749c2c7`; they intercepted emit callbacks and wrote no emitted files. The corrected one-source
System/outFile production baseline with explicit `rootDir` exited 0 and mapped
`dist/bundle.d.ts`. Its valid two-source counterpart also exited 0 in the old implementation but
mapped that bundle only to `src/index.ts`; the callback probe named both sources, establishing the
false-success boundary now refused. The real fleet targeted probe emitted every TypeScript source,
including `infra/local/vm-lab.ts`, while only the compiler-recognized operation-plan JSON produced
no targeted output. The `plan.ts` declaration probe erased the JSON import. These supplied probes
were provenance for the maintained production tests, not rerun closure gates.

No JSON public identity support was added. A JSON dependency retained by an emitted public
declaration refuses with its declaration source and JSON target.

Pending planner verification: rerun `twilight-bureaucrat:test:package` where a local listener is
permitted; reconcile or replay the prior slice's raw initial-red counts and G1 through G6
patch/cmp/immediate-green artifacts; run the whole `tool-devsync:test` target after staging. The
host gate is unavailable on this machine and was not run.

Planner, after Part G, 2026-09-21, outside the sandbox on `8e0a953b` plus this closure:
`NX_DAEMON=false bunx nx run twilight-bureaucrat:test:package --skip-nx-cache` exited 0 with 44 pass,
0 fail across 6 files (the sandbox run above failed only because `Bun.serve` could not listen). The
planner also replayed G4 by hand before the proof commit: the public JSON refusal replaced by
`return false` made `refuses a JSON dependency retained by the public declaration` fail on
`Expected: 1`, `Received: 0`; the file was restored and compared with `cmp`. Earlier the same day,
from a separate checkout of `9db51898`, the production CLI over `tools/tool-fleet/tsconfig.lib.json`
exited 0 where the unchanged tree exited 1 with an empty-detail declaration emit failure. The
fixture this part tests against was corrected by the planner before implementation: it extends the
fixture entrypoint instead of replacing it, and sets `outDir`, which a compiler probe over eight
variants showed to be what makes a declaration-only emit report `emitSkipped` with no diagnostic.
