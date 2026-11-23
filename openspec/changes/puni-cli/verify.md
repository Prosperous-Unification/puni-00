# Verification

## Grammar foundation, commit 39f8a616e, 2026-11-09

This is a partial implementation of tasks 1.1 and 1.2. The root composes the three installed Optique grammars, canonical names and aliases through provider-owned grammar facades. Shared Dash coherence checks run after parsing. The grammar consumer alone receives exact facade allowances, retaining all inherited constraints; the actual Nx graph retains the three provider edges and pins their sole source importer and static edge type.

Task 1.1 stays unchecked: all-leaf discovery/refusal coverage depends on completing the seven delegated Burokrat grammars in 1.3. Runtime facades currently publish request types only. There is no installed PUNI executable or runtime dispatch in this slice. Package execution, trusted-launcher conversion, version support, remaining public naming, generated helpers, client inventory, script conversion, deployment and the exact-commit host gate remain unverified and required.

### Red, review and green

- Initial root scaffold: 0 passed, 23 failed; actual implementation then passed 23 tests.
- Additional production-profile/account-outcomes coherence and inline-operand negatives: 28 passed, 4 failed before the guards; corrected root then passed 33 tests.
- The first boundary probe ran without a project graph: Nx skipped its boundary rule and 11 negative cases failed. It is not evidence of a green boundary. `NX_DAEMON=false bunx --no-install nx graph --file=/tmp/puni-cli-project-graph.json` generated the real graph; the approved facade imports then failed until the narrow policy was added. The final boundary suite has 13 cases.
- The terminal mutation initially survived because Optique treats both nonempty `FORCE_COLOR=0` and `FORCE_COLOR=1` as enabled. Correcting the test to compare empty `FORCE_COLOR`/`NO_COLOR=1` with forced color and narrow columns killed both color and width mutations.
- The first wider regression run had 273 passed and 3 failed: exact app/product inventories and the graph oracle did not yet include PUNI. Added the exact PUNI row and source/static-edge exception; broad project-pair allowances were not added.
- Astra found multiline/embedded-`Error:` secret leaks, terminal controls and overlapping argv redaction. Each confirmed defect received a failing subprocess regression before repair. Full-diagnostic redaction now runs once against original argv candidates before reason extraction and whitespace normalization. Complete-input tail tests did not reproduce an unquoted-provider leak; those are additional coverage, not a claimed historical defect.
- Shared Navigator flags and Burokrat positional/JSON input boundaries now reject whitespace-only operands. Root tests cover duplicate and blank values for every Navigator leaf flag. Help-command refusals attribute aliases to the selected namespace, including non-release Dash ops status 64.
- Astra rereview found no remaining actionable findings in this slice; its independent elevated root run passed 76 tests, 0 failed, 193 assertions. It did not verify installed runtime, packaging, the full gate or all mutation receipts.

### Fresh targeted commands

Local host: pop-os; Bun 1.4.4. Native CLI worktree: `/home/df/.codex/worktrees/6ce4/puni-00`, branch `feat/puni-cli-composition`, base `f16969480`. Commands were run with access to that worktree and its caches. A sandbox-only reviewer run hit subprocess pipe `EPERM`; the elevated production-process rerun passed.

```text
bun test apps/puni/cli/src/cli-parser.test.ts tools/tool-devsync/src/puni-boundaries.test.ts tools/tool-devsync/src/workspace-inventory.test.ts tools/tool-devsync/src/workspace-targets.test.ts tools/tool-devsync/src/workspace-projects.test.ts tools/tool-devsync/src/lint-policy-cache.test.ts apps/twilight-structure/twilight-navigator/cli/src/cli.test.ts apps/twilight-structure/twilight-burokrat/cli/src/cli.test.ts apps/twilight-structure/twilight-dash/cli/src/cli.test.ts --timeout=60000
319 passed, 0 failed, 1374 assertions, 9 files; exit 0.

bunx --no-install tsc --build --force apps/puni/cli/tsconfig.json tools/tool-devsync/tsconfig.json apps/twilight-structure/twilight-navigator/cli/tsconfig.json apps/twilight-structure/twilight-burokrat/cli/tsconfig.json apps/twilight-structure/twilight-dash/cli/tsconfig.json
Exit 0. The earlier tool-devsync compile exposed an inferred expect.toEqual record mismatch; an explicit Record<string, unknown> comparison fixed it before this rerun.

bunx --no-install eslint <owned PUNI source/policy, six provider facades, three provider parsers, two workspace tests>
Exit 0. Earlier fixture typing/import/control-regex lint findings were corrected.
```

Raw local logs are `/tmp/puni-cli-final-{regressions,typecheck,lint}.log`. Format and OpenSpec validation receipts are recorded below after the final artifact checks; neither is inferred from tests.

### Provably breakable guards

Mutations run one at a time against production source with a named test failure required, then restore the original bytes even on failure. No network operation was performed by the discovery fault: the injected fetch was intercepted by the discovery preload. Source `Proof:` comments identify the corresponding oracles.

| Injected fault                              | Observed failing production-path oracle                       |
| ------------------------------------------- | ------------------------------------------------------------- |
| Remove `n` alias                            | Typed planning alias equivalence                              |
| Remove Optique exit interception            | One-line process refusal                                      |
| Bypass operand redaction                    | Inline secret absent from actual stderr                       |
| Remove required diagnostic guard            | Broken-parser dependency preload throws                       |
| Skip shared Dash coherence validation       | Production dev-fast and both account-outcomes coherence cases |
| Remove controlled printed exit              | Root help prints and returns                                  |
| Drop color override                         | Cross-terminal discovery byte equality                        |
| Drop width override                         | Cross-terminal discovery byte equality                        |
| Return 1 for non-release ops usage          | Dash alias ops status 64                                      |
| Ignore help namespace attribution           | Help alias Burokrat/Dash ops status                           |
| Normalize before redacting                  | Multiline secret absent from actual stderr                    |
| Extract marker before redacting             | Embedded-`Error:` secret absent from actual stderr            |
| Bypass flag redaction and control stripping | ESC absent from actual stderr                                 |
| Remove Navigator nonblank lookahead         | Every Navigator leaf whitespace-only flag case                |
| Remove Burokrat operand nonblank guard      | `read-candidate` blank input refuses                          |
| Remove Burokrat JSON-path nonblank guard    | `validate-plan-tasks` blank input refuses                     |
| Remove grammar allow list                   | Actual root grammar passes effective ESLint                   |
| Broaden facade alias                        | Runtime alias denied from grammar                             |
| Broaden allowed consumer                    | Grammar alias denied from neighbor                            |
| Remove inherited ring constraints           | Effective production policy equality                          |
| Import provider runtime eagerly             | Actual subprocess discovery preload refuses module load       |
| Read ambient clock eagerly                  | Actual subprocess discovery preload refuses clock read        |
| Fetch during parsing                        | Actual subprocess discovery preload refuses network access    |
| Add another PUNI provider importer          | Actual Nx graph exact-source assertion                        |
| Add an implicit provider edge               | Actual Nx graph static-edge assertion                         |

Receipts: `/tmp/puni-cli-mutation-receipt.json` and `/tmp/puni-graph-proof-receipt.json`; graph receipt has both named failures and `restored: true`. The confirmed overlapping-operand defect also has a pre-fix failing subprocess log (`/tmp/puni-cli-overlap-red.log`) and the post-fix root run above.

### Remaining required checks

At this foundation checkpoint no full local suite, installed-package test, startup-budget measurement, Bash/Node-free client test, trusted closure mutation sweep, script-inventory completeness proof, deployment, CI result or canonical h2puni/h4claw gate is claimed. These are required by later tasks and the combined goal. This grammar slice does not establish completion of the CLI or entity scope.

### Artifact check receipt

- Owned-file Prettier check: exit 0; all matched files formatted. The first pass named one facade whitespace issue; it was fixed and the complete owned-file check rerun.
- `bunx --no-install openspec validate --all --json`: exit 0; 343 items passed, 0 failed (323 changes and 20 specs).
- Final grammar mutation rerun: all 23 named fault cases failed their production-path oracles and were restored; graph proof separately killed both extra-importer and implicit-edge faults.
- After restoration, root/boundary/workspace graph test rerun: 107 passed, 0 failed, 280 assertions across 3 files, exit 0.
- `git diff --check`: exit 0 before staging.

## Typed policy grammars, 2026-11-09

Task 1.1 now meets its source grammar/discovery/boundary acceptance. The seven commands from twilight-cli-optique 3.4 publish typed Optique requests in provider-owned policy-parser.ts, and their handlers consume those requests directly. Module usage strings and hand argument loops were removed; remaining transitional argv adapters reuse readInstalledRequest and do not sit on the typed handler path. Check now stays optional, with dated-rule-only enforcement downstream. Toolkit preparation preserves its verified identity comparison; relocation retains its explicitly modeled path defaults. Typed activation calls are wired into the existing installed provider entry.

Task 1.3 stays open for actual installed PUNI execution in 2.1. The existing installed Burokrat regression is additional evidence, not a PUNI installation or Bun-only client claim. Root runtime dispatch, the C9 hashed typed-child bridge, trusted Bun launcher/bootstrap, release identity migration, inventory and remaining client naming remain required. C9 is now a testable delta requirement and a runtime-task obligation.

### Review and regression findings

- Initial request tests: 0 passed, 19 failed before replacing raw argv tails; all 19 then passed. The matrix now tests every required activation flag independently and malformed/duplicate/blank values.
- First broad request/handler run: 291 passed, 39 failed. Several tests pinned old usage text; rule tests also lacked the TOOL_WIKI_TRUSTED_NODE_MODULES environment explicitly supplied by their owning Nx target. This was not accepted as a green run.
- With the target's environment, 326 passed and 3 failed: two real workflow parser regressions (a repeated --steps could become its own value while approve became the filename) plus README help generated without package-version support. Added root witnesses, rejected the reserved repeated flag value, and regenerated version-aware help. Focused rerun: 115 passed, 0 failed.
- Activation/date checks first passed 47 and failed 3 old diagnostic assertions. Updating the expected Optique refusals preserved named missing flags/status. A new assertion then incorrectly accessed stdout on a helper exposing only a parsed verdict; corrected it to assert no verdict, and all 17 dated-rule tests passed. Final combined results below include these cases.
- A broad command using an unprefixed directory filter also selected three emitted JavaScript test copies in dist/out-tsc: 628 source tests passed, 3 duplicate-module load errors failed the command. The corrected explicit ./ source-path command passed, and puni-cli:test now declares ./src. No generated output was deleted to hide the discovery mistake.
- Legacy installed-package assertions still expected placeholder help/footer and hand-parser missing-flag text. They were updated to exact typed check/explain/template discovery and Optique missing-option diagnostics. The full package test body subsequently passed, including actual check/template/explain execution, nonpassing verdict output, inactive lint response, toolkit corruption and rebuilding.
- Fresh Astra code review found no blocking correctness regression. Its sole P3 stale README paragraph was corrected to typed nested discovery and optional check now semantics. Its independent three-suite run passed 237 tests. The reviewer did not verify broad suites, package installation or host gates.
- Final source filenames name policy/request contracts: policy-parser.ts, request-adapters.test.ts and root burokrat-grammar.test.ts; this mechanical rename followed the initial tests, with final path checks and all 20 mutations rerun afterward.

### Fresh checks

Run from the isolated CLI worktree with Bun 1.4.4:

- Combined source suite: 628 passed, 0 failed, 2803 assertions, 14 files; exit 0. Command: TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test ./apps/puni/cli/src ./tools/tool-devsync/src/puni-boundaries.test.ts ./tools/tool-devsync/src/workspace-projects.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/cli.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/request-adapters.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/rules/rules.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/rules/scenarios.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/rules/job-catalogue.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/templates/templates.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/workflow-binding.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/policy/relocation-activation.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/no-ambient-clock.test.ts --timeout=60000. At that run the adapter test still had its pre-rename delegated-adapters filename; final path rerun follows.
- After final filenames, root/boundary/graph/request/clock suite: 345 passed, 0 failed, 1109 assertions across 7 files; exit 0. Log: /tmp/puni-policy-final-targeted.log.
- Actual all-leaf discovery tests cover all 93 installed leaves: 187 passed, 0 failed, 766 assertions. They invoke real nested help, Bash dynamic completion and unknown-option refusal for each leaf, and independently pin the advertised leaf inventory including mixed validate/workflow-binding branches.
- NX_DAEMON=false bunx --no-install nx run puni-cli:test --skip-nx-cache: exit 0, 309 passed, 0 failed. No cached test result was accepted.
- bunx --no-install tsc --build --force apps/puni/cli/tsconfig.json apps/twilight-structure/twilight-burokrat/cli/tsconfig.json: exit 0 after final filenames. Log: /tmp/puni-policy-final-typecheck.log.
- Owned TypeScript ESLint: exit 0 after final filenames. Log: /tmp/puni-policy-final-lint.log. All owned source/spec files were formatted; final format and OpenSpec summary are recorded after artifact checking.

### New production-path faults

Every fault below failed its named oracle, then the production source was restored. The 20-fault sweep was repeated at the final filenames; /tmp/puni-delegated-mutation-receipt.json reports 20 observed failures and restored: true. Proof comments are adjacent to the corresponding checks.

| Injected fault                                       | Observed failing oracle                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Remove operand nonblank pattern                      | Check whitespace-only repository refusal                                              |
| Remove flag-value nonblank pattern                   | Check whitespace-only rule-option refusal                                             |
| Replace selection choice with string                 | Template bogus-selection refusal                                                      |
| Remove instant finiteness check                      | Tomorrow yields usage refusal, not an internal date error                             |
| Remove instant round-trip equality                   | February 30 refuses before IO                                                         |
| Make check now required                              | Undated complete check request remains accepted                                       |
| Remove scenario path pattern                         | ../outside.md refuses before IO                                                       |
| Accept repeated --steps as its value                 | Repeated flag / flag-as-filename root negatives                                       |
| Remove catalogue nonblank segment check              | Whitespace step segment refusal                                                       |
| Remove catalogue uniqueness check                    | Duplicate step segment refusal                                                        |
| Make template subject optional                       | Incomplete verify request refusal                                                     |
| Make workflow steps optional                         | Binding request without steps refuses                                                 |
| Make activation mapping optional                     | Isolated required-mapping case                                                        |
| Make relocation base optional                        | Isolated required-base case                                                           |
| Make resource lane optional                          | Both preparers' isolated required-lane cases                                          |
| Make cwd identity optional                           | Both preparers' isolated required-cwd cases                                           |
| Remove adapter operation guard                       | Help passed to writeExplainCommand gives its named refusal                            |
| Remove adapter command guard                         | Template list passed to writeExplainCommand gives its named refusal                   |
| Remove required toolkit source guard                 | Missing toolkit refuses before authority reads                                        |
| Re-enter the argv adapter in typed template dispatch | Actual child with deliberately broken argv adapter still executes the typed operation |

An additional source mutation removed template verify from the real provider grammar. The root's exact leaf inventory failed; it was restored (/tmp/puni-delegated-leaf-mutation.json). This is separate from merely changing a test's expected string.

### Limits

The verified legacy provider package still contains the existing Bash launcher. These tests do not establish a new installed PUNI artifact, clean C9 child environment, preserved generated MCP helper startup, complete script inventory, Bun-only execution, release publication, deployment or canonical host gate. Those remain required by the active full goal.

### Final typed-policy artifact receipt

- Final-path legacy provider package build and installed dispatch: 3 passed, 0 failed, 87 assertions, exit 0; /tmp/puni-policy-final-package.log. This includes the real toolkit corruption/rebuild body, not only discovery.
- Complete owned-file Prettier check: exit 0, all matched files formatted; /tmp/puni-policy-final-format.log.
- bunx --no-install openspec validate --all --json: exit 0; 343 items passed, 0 failed (323 changes, 20 specs); /tmp/puni-policy-final-openspec.log.
- git diff --check: exit 0 before staging.
- Foundation commit39f8a616e used normal hooks; the tool-wiki hook explicitly reported inactive/certified:false because its optional external activation root was not provisioned. That output is not a certification or a host-gate result.

## Startup boundary probes, 2026-11-09

Astra performed 23 asserted Linux x64 observations against Bun 1.4.4 revision 38afee6c84fcf48c0edb2466aa4b27d287a59c30, GNU env 9.4. Consolidated receipt: /tmp/puni-bun-startup-evidence.json; reproducible sources and detailed receipts: /tmp/puni-bun-startup-Eymi9J. No repository product implementation was changed by the probes.

- Ordinary interpreted and default compiled entries executed candidate bunfig preloads and loaded dotenv. Disabling all four compile autoloads prevented candidate config but did not prevent BUN_OPTIONS preloads. BUN_BE_BUN=1 redirected a compiled executable into candidate ./dash instead of the app. Compilation was therefore rejected as the startup boundary.
- BUN_INSPECT_PRELOAD also executed before code despite --no-env-file, --config=/dev/null and the initial three-variable sanitizer. Removing this additional variable closed the observed alternate preload path.
- Protected shebang: #!/usr/bin/env -S -u BUN_INSPECT_PRELOAD -u BUN_OPTIONS -u NODE_OPTIONS -u BUN_BE_BUN bun --no-env-file --config=/dev/null.
- The explicit env sanitizer helper prefix with the selected Bun, the same flags, installed entrypoint and dash passed all hostile controls, a PATH containing only Bun (no Bash or Node), and spaces in the selected Bun path, installed path and key operand. Direct [bun, entrypoint] invocation bypassed shebang controls and executed preloads; the original C6 helper prefix was amended before implementation.
- Killed controls: removing BUN_OPTIONS erasure executed its preload sentinel; removing BUN_INSPECT_PRELOAD erasure executed its sentinel; omitting the config override executed candidate preload; omitting no-env-file contaminated the app with dotenv. The tested separate --config /dev/null spelling did not protect startup; the equals form is required by this pinned-runtime evidence.
- NODE_OPTIONS --require/--import did not execute on this Bun, so no execution negative is claimed for deleting that variable's erasure. Tested BUN_INSPECT/BUN_INSPECT_CONNECT_TO forms had no observed effect; no additional blanket purge was added. Environment erasure and actual runtime-execution proofs must remain distinguished.

Only Linux x64/GNU env is verified. Trusted Bun selection/PATH and OS loader are assumptions. Mac env -S, the actual package/activation chain and the MCP 10-second budget remain unverified acceptance checks. [ADR 0087](../../../docs/adr/0087-sanitize-puni-startup-before-bun-runs.md) records the decision; product startup guards and their production-path negatives still need implementation.

### Shared startup implementation checkpoint

The pure startup composer in apps/puni/cli/src/startup.ts now produces the shared protected shebang and selected-runtime argv. It is not yet wired into a production PUNI package or generated pool helper. Actual OS/Bun fixture execution went from 0 passed/11 failed with the bare launch baseline to 11 passed/0 failed. Both executable and helper starts ran with only Bun on PATH, inside candidate config/dotenv, with spaced runtime/installation/operand paths.

All 10 injected faults failed named process tests and were restored: retain each of the four startup variables; load dotenv; load candidate config; split the config argument; bypass sanitizer for helpers; accept relative runtime; accept relative installed entrypoint. For NODE_OPTIONS and BUN_BE_BUN these are observed application-environment erasure failures, not a claim that they executed a preload in interpreted Bun. Receipt: /tmp/puni-startup-mutation-receipt.json. The initial mutation harness stopped after three faults because its final-list-element anchor omitted the closing-list form; it restored source, was corrected, and all 10 then ran successfully.

Further Astra probes verified runtime-shaped flags after the installed entrypoint reach application argv unchanged: 46 exact-forwarding checks, 3 separator checks, and a positive control moving preload before the entrypoint. Bun strips a literal first application double dash; no claim of byte-exact forwarding for that one token is made. Receipt: /tmp/puni-bun-startup-Eymi9J/trailing-options-receipt.json. Production root argument parsing/integration still remains to be tested.

A fresh Astra composer review found that an absolute selected Bun path containing equals is interpreted by env as an assignment (actual process exited127 trying to execute --no-env-file). A new negative failed before the explicit prerequisite guard; the paired actual-process test preserves equals signs in installed entrypoint paths. The unsupported runtime path now refuses before launch construction, with no broad rejection of installed or operand paths.

Final startup composer checkpoint: fresh Astra rereview cleared the equals-path fix; 13 process tests passed with41 assertions. The final mutation receipt has11 killed/restored faults, adding removal of the explicit env-assignment runtime-path guard. Root plus ADR-index regression passed323tests (1055assertions), owned lint passed, and app TypeScript build passed after its test reader adopted Bun.ReadableSyncSubprocess instead of the overly broad spawnSync return type. These component checks still do not establish root/package/helper integration.

## Typed validator request checkpoint, 2026-11-09

The hashed validator role's source now supports the internal --puni-request-v1 one-shot stdin protocol. It reads raw bytes, rejects malformed UTF-8/JSON or a malformed closed version 1 envelope, accepts only the 50 installed validator variants and invokes typed handlers without entering either argv parser. JSON-omitted undefined properties are restored after schema validation. Workflow binding receives caller-directory context; ordinary host inputs are anchored without lexical collapse, while canonical-absolute-only authorities and repository selectors remain verbatim. The actual standalone validator-role bundle executes a typed template request outside the checkout.

This is a component checkpoint. The parent runtime facade, verified clean child environment, toolkit/package version update, root entrypoint, installed PUNI package and generated helper wiring remain required. Task 1.2 stays unchecked. No new artifact is published, activated or certified by these source checks.

### Review and implementation evidence

- Independent grammar-derived request fixtures exercise all 50 transport variants. The unsafe JSON-only baseline produced 51 passed / 69 failed; a preliminary harness error from missing readInvocation options was corrected before recording that RED. Initial closed schema passed 120; six added catalogue/source/date negatives failed before their restrictions were implemented. Final request tests include every declared field's presence/type/nonblank contract, literal selections, nested policy members and envelope members.
- Initial actual stdin bridge:0 passed / 6 failed. The first implementation exposed two test-oracle mistakes (adapters/library was not a registered template ID); asserting the actual registered module ID corrected those tests, and 6 passed. Two caller-relative/native-symlink file cases then failed with the wrong-cwd ENOENT before anchoring was implemented. A raw invalid-byte case failed with a replaced template character before fatal UTF-8 decoding was added. The actual standalone validator bundle subsequently passed its outside-checkout dispatch test.
- Astra independently audited every command's host/absolute/selector/context path distinction and reviewed the implementation. It independently reproduced malformed callerDirectory bytes dispatching template list, then verified the fixed probe exited 1, emitted no stdout and only the fixed transport diagnostic. Its escalated focused suite passed 188 tests/206 assertions before the later generic field cases. Un-escalated child-process tests failed with sandbox EPERM, reproduced by an unrelated one-line Bun pipe-write child; those were unavailable sandbox checks, not product failures. No material finding remained after the UTF-8 fix.
- Final source review cleared removing an unobservable finiteness branch and narrowing the catch to UTF-8/JSON/schema decoding. Invalid Date errors remain fixed transport refusals; unexpected failures in trusted typed restoration now propagate. The reviewed JSDoc was qualified accordingly.

### Production-path fault evidence

All source files were restored after every mutation and every sweep. The tests call the real decoder/anchorer or spawn the actual validator role; invalid schema construction or a test-load failure was rejected by the mutation harness and never counted as a killed guard.

| Injected group                                                                                             | Observed oracle / receipt                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 52 closed objects, 288 payload required fields, 75 selection literals                                      | Each independently weakened guard failed its matching unknown-property/missing-field/unsupported-selection refusal; 415 killed/restored. /tmp/puni-validator-schema-mutations.json |
| Two nested-policy member requirements and three envelope member requirements                               | Five additional faults failed their specific refusal; restored. /tmp/puni-validator-envelope-mutations.json                                                                        |
| Nonfatal UTF-8 and pre-decoded stdin                                                                       | Actual raw-byte child diagnostic failed independently for each fault                                                                                                               |
| Nonstring/blank operands; empty/whitespace/duplicate catalogue; escaped scenario source; noncanonical date | Corresponding decoder negatives admitted malformed input and failed                                                                                                                |
| Unsupported version, relative caller directory and omitted explicit-undefined restoration                  | Envelope refusal or exact typed round-trip failed                                                                                                                                  |
| Workflow child cwd substituted for caller root; omitted anchoring; lexical path collapse                   | Actual binding/host-file/native-symlink child cases failed                                                                                                                         |
| Typed request re-entered argv                                                                              | Child with both argv adapters deliberately broken failed                                                                                                                           |

The last five groups total 16 faults, all killed/restored in /tmp/puni-validator-control-mutations.json. Initial control-harness runs stopped on an assertion-marker mismatch and on an overly broad unknown-type mutation that broke schema construction; both restored source. The corrected numeric-widening fault reached the real refusal assertion, and the complete 16-fault sweep then passed.

One equivalent mutant removed the separate Number.isFinite branch and all 1074 request tests still passed: invalid Date already throws inside the fixed decode boundary. The unobservable branch was removed rather than recorded as a killed fault. The final canonical ISO round-trip still refuses February30. /tmp/puni-validator-finite-probe.log. An initial envelope.request-required mutant was similarly masked by the catch around trusted normalization; narrowing that catch made its exact malformed-envelope negative fail with the missing check, then pass restored. It is included once in the additional five requirements above.

Adjacent Proof comments identify these observations. There are 420 schema requirement/closure/selection faults and 16 additional controls; these are separate from the historical startup and grammar proofs above.

### Final checks and limits

The earlier related-provider regression passed 1233 tests/1783 assertions across seven files, including actual CLI behavior, request adapters, workflow binding and the ambient-clock detector. After nine more envelope/policy cases, the request suite passed 1083 tests; the actual standalone bundle case passed separately. Final combined root/provider/boundary regression passed 1578 tests, 0 failures, 2887 assertions across 12 files in 59.43 seconds (/tmp/puni-validator-final-regression.log). The single TypeScript build invocation for both Burokrat and PUNI solutions exited 0 with no diagnostics (/tmp/puni-validator-final-types.log). OpenSpec validation exited 0: 343 items passed, 0 failed (/tmp/puni-validator-final-openspec.log). Final owned-file ESLint exited 0 with no diagnostics (/tmp/puni-validator-owned-lint.log); Prettier check exited 0 for all 11 changed files (/tmp/puni-validator-owned-format.log). The staged diff whitespace check exited 0 before the normal commit hooks.

These checks do not establish parent environment isolation, installed PUNI acceptance, Bun-only script completion, Mac startup, generated MCP token budget, release publication/deployment, external trust activation or the exact-commit host gate. All remain visible obligations of the active full goal.

## Verified ordinary runtime checkpoint, 2026-11-09

Navigator exposes its three existing typed operations through executeRequest. Burokrat's provider parent executes the 50 installed-validator request variants through the verified validator role and versioned JSON stdin bridge. The special lint/prepare commands, old-bin delegation, root executor/entrypoint, installed PUNI package and generated helpers remain separate work; task 1.2 stays unchecked. These tests do not separately execute every one of the 50 operations through the parent.

### Trust and path contract

Package/toolkit verification precedes candidate discovery or operation inputs. The parent resolves the actual worktree root even for an interior repository operand; nested explain policy and workflow-binding caller context have independent placement tests. Physical checks cover installation, child cwd, manifest, descriptor, all five roles and dependency closure, including symlink destinations. Neighboring path prefixes remain valid. The operator must keep the trusted installation and Git metadata stable; hashing is not an immutability mechanism, and concurrent hostile metadata writers are outside C11. Random toolkit snapshots would alter existing absolute-path evidence identities, so lint retains its own distinct snapshot contract.

The Git release floor is 2.36.0; accepted upstream/Apple/Windows forms are explicit, with unknown suffixes and release candidates refused. Local Git 2.43.0 and read-only host probes of Git 2.53.0 on h2puni/h4claw satisfy this numeric prerequisite; neither host was gated or deployed. Pure template/JSON operations do not acquire a Git prerequisite.

The validator receives only selected PATH, verified runtime closure, provider-owned Git settings and a selected CI binding for lint-ci alone. Global/system config, hooks, fsmonitor, replacement objects, transport protocols and interactive prompts are constrained explicitly. No ambient HOME/XDG/locale/credentials/SSH/TMPDIR or generic environment spread is forwarded. Caller-relative CI binding preserves noncollapsed host prefixing; absent and explicitly empty selections remain distinct. The pure candidate-root decoder is shared with the original reader without introducing an ambient environment dependency into the parent.

Working selection refuses every loaded nonempty clean/process definition before freezing bytes, including unused, included, worktree and earlier definitions overridden by later empty values. Empty definitions and similarly named non-filter configuration remain valid. Configured command values are not printed. Committed/staged selection retains its separate semantics.

### RED/GREEN and review

- Navigator's three actual reader-refusal tests failed before its facade export, then passed. Its full source regression passed 117 cases before final root/provider integration checks below.
- Initial parent tests were 0pass/5fail before implementation. Placement, Git prerequisite/environment, CI-selection and process lifetime cases added independent behavioral REDs. A later Astra finding showed arbitrary parenthetical vendor suffixes were accepted; three new malformed-version cases observed RED, then passed after the literal Apple build restriction. The double-terminal-newline negative already passed on this Bun and was not counted as a discovered source defect.
- Filter controls independently executed actual clean/process sentinels before the guard. Two neighboring-name positives exposed wildcard-dot regex mistakes, which were corrected to literal separators. Earlier nonempty/later-empty and failed-query cases retain the conservative loaded-definition contract.
- Astra independently executed the earlier 42 parent cases (42pass/312assertions), then reviewed the final 55-case source and all 46 parent fault logs. It found no remaining blocker. It inspected the 13-filter-fault receipt without rerunning the sweep. Its final review distinguishes the provider subset from root/package/special-command completion.

### Production-path faults

All 46 parent faults reached actual expect assertion failures and were restored. Receipt: /tmp/puni-parent-mutations.json; exact commands and individual logs are retained there. Faults cover installed verification, each physical-placement obligation, actual root/explain/workflow selection, Git probe/query/version/floor, declared environment settings, reachable hooks/helper, CI binding selection/anchoring, launch capability, typed mode/envelope/stdin, child cwd/environment, raw streams, signal/spawn diagnostics and normal verdict status.

The child-environment omission initially survived: parent version/root observations alone satisfied the old oracle. Requiring an actual child ls-tree observation closed that gap; removing child environment then failed that assertion. This rejected attempt is not counted as a killed fault. Two preliminary harness stops misrecognized Bun's diff/unary assertion formatting; each restored source, then resumed only against its matching restored source hash. The final receipt includes all 46 once.

Explicit global/system/null-config and other declared-field faults establish the environment contract. They are distinct from behavioral hook/helper evidence: removing redundant settings is not claimed to execute a sentinel. The fsmonitor, post-index-change and lazy-fetch tests first prove their controlled programs reachable, and the corresponding injected faults execute those markers. A child emitting invalid UTF-8 bytes on both output streams and exiting 37 proves byte preservation and nonbinary status passthrough; SIGTERM retains partial output and throws, rather than returning a verdict.

All 13 shared filter faults failed their specific configuration/query/privacy/positive-control assertions and were restored: /tmp/puni-working-filter-mutations.json. An initial harness assertion-marker mismatch was corrected before the complete sweep. An earlier replacement-string editing error corrupted only the owned candidate reader; formatting refused it, the committed baseline was restored, and the intended guard was reapplied with a literal callback replacement. No malformed source or live mutant remains. Adjacent Proof comments identify the observed production-path tests.

### Checks and remaining limits

Completed component checks: root/all-Navigator/boundary/ADR regression 453pass/0fail,1779assertions across 11files (/tmp/puni-parent-root-navigator-regression.log); focused filter/Navigator 21pass/0fail,180assertions (/tmp/puni-filter-navigator-focused-final.log); three actual TypeScript solutions exit 0 (/tmp/puni-parent-post-followup-types.log); all seven owned TypeScript files lint exit 0 (/tmp/puni-parent-post-followup-lint.log); owned formatting exit 0 (/tmp/puni-parent-final-format.log); OpenSpec 343valid/0invalid (/tmp/puni-parent-final-openspec.json).

The complete Burokrat source regression settled with **3825 passed / 2 failed**, 18450 assertions across 110 files in 2373.50s, exit 1 (/tmp/puni-parent-burokrat-regression.log). The command excluded packaging/install.test.ts and packaging/consumer-bootstrap.test.ts. Both failures were obsolete Performance test expectations from the former handwritten parser: the help metavar <json> instead of PATH and the generic check-flag diagnostic. Corrected assertions require the adopted metavar and exact duplicate/unknown-option diagnostics, exit 1, empty stdout and a one-line refusal. The complete Performance file plus all 55 parent cases then passed **77 tests / 0 failures / 645 assertions**, 61.44s, exit 0 (/tmp/puni-parent-followup-regression.log). The full 110-file run was not repeated or relabeled as passing. No production semantics changed for these test corrections.

An intermediate targeted rerun passed 21/failed 1 after the metavar corrections because a later legacy check-flag assertion had not yet executed. A subsequent temporary stderr-empty strengthening also failed against the legacy installed bin, which adds error context to an otherwise structured nonpassing verdict. The final assertion preserves the original parser-acceptance intent and still validates the structured verdict/performance evaluation; it does not claim that old-bin behavior is fixed. The new ordinary parent has its separate exact nonpassing-verdict passthrough test.

After the final assertion edits and mechanical local callback rename, all three TypeScript solutions passed again (/tmp/puni-parent-post-followup-types.log) and all **seven** changed TypeScript files passed lint (/tmp/puni-parent-post-followup-lint.log). Astra reviewed this test delta and the settled logs without independently rerunning them, finding no blocker.

The actual legacy toolkit is built outside the checkout for these tests. This does not establish installed PUNI acceptance, special-command trust/Bun conversion, publication, external activation/certification, Mac startup, generated MCP helper budget or the exact-commit host gate. No current change checkbox claims those obligations complete.

## Typed preparation delegation checkpoint, 2026-11-09

The provider facade now accepts 52 variants: the existing 50 isolated validator operations plus two direct typed preparation routes. Lint remains excluded until the Bun launcher port. Preparation preserves the existing provider APIs, normalization, ambient subprocess behavior, Bash self-checks and partial-destination contract; these checks do not establish preparation child isolation or real activation certification. Root entrypoint/package/helper integration remains open.

The committed permission/planning checkpoint was merged into the isolated CLI branch as `ad1ca7b0f6cc141226a4f84bdb6988549309ee72`. Before this new slice, its targeted root/provider/boundary integration passed 393 tests/1493 assertions across 7 files, 40.72s, exit 0, and all three provider/PUNI TypeScript solutions passed (/tmp/puni-cli-permission-integration-{tests,types}.log). The worker's uncommitted 2.4a work was never integrated or edited here.

Initial path tests were 3 pass/2 fail against the identity scaffold, then 5 pass/0 fail. Initial real preparation-delegation tests were 2 pass/5 fail: the old parent reached its ordinary child instead of the typed APIs. Final 16 tests pass with 105 assertions, including actual verified toolkit defaults/overrides, caller repository/work/destination/base paths, tampered role and package binding before operation inputs. Report/async tests use controlled existing API spies; they verify the adapter seam only. Astra independently ran those 16 tests: 16 pass/0 fail, 105 assertions, 5.91s. Root's combined ordinary-parent/preparation regression passed 71 tests/500 assertions across 3 files, 37.36s (/tmp/puni-preparation-parent-regression.log).

All 37 independent faults failed actual expect assertions and were restored: 26 host/selector/identity/default contracts (/tmp/puni-preparation-path-mutations.json), nine dispatch/default/expected-identity/package-binding/async-completion contracts (/tmp/puni-preparation-dispatch-mutations.json), and two report delimiter faults (/tmp/puni-preparation-output-mutations.json). Astra inspected every fault log and cleared the source without editing it. Adjacent Proof comments name these observations.

The report delimiters were correct from the initial implementation. An escaped tool display was initially misread as literal backslashes; two guarded edit attempts found no such source pattern and wrote nothing. The TypeScript AST reported cooked delimiter bytes `[10]` for both branches (/tmp/puni-preparation-delimiter-evidence.log), and explicit byte tests confirmed them. Only deliberate literal-backslash fault injections count as the two output negatives; the initial passing checks are not reported as RED.

The first TypeScript check failed because five test fixtures omitted fields that Optique represents as required own properties with undefined values. Fixtures were corrected to the actual inferred request types; production types were not widened. Initial lint found import ordering/regex spacing, then a preferred startsWith expression in the manifest fixture; these were fixed without changing policy. Final Burokrat/PUNI TypeScript solutions passed (/tmp/puni-preparation-final-types.log), all four changed TypeScript files passed lint (/tmp/puni-preparation-final-lint.log), and OpenSpec validation passed all 343 items (/tmp/puni-preparation-openspec.json). Existing real toolkit/relocation workflows plus root grammar/boundaries passed 382 tests with 1228 assertions across 7 files in 66.96s, exit 0 (/tmp/puni-preparation-related-regression.log). Final owned-file formatting and whitespace are checked before staging. No broader full-suite repeat, canonical host gate, new activation, deployment or publication is inferred.

## Shared startup ownership extraction, 2026-11-09

C10's unchanged implementation and thirteen process tests moved to `@shared/bun-startup`; PUNI's startup module re-exports that single owner. The effective import fence keeps the same policy. The [Bun script verification](../bun-scripts/verify.md#shared-startup-extraction-2026-11-09) records the actual graph, process regressions, eleven relocated fault failures/restorations, Astra cache finding and explicit standalone packaging limitation. No CLI/package/launcher completion checkbox closes at this extraction checkpoint.

## Versioned toolkit and activation readers, 2026-11-09

ADR 0080/C13 record toolkit2 and activation4's fixed Bun launcher layout. This checkpoint implements readers, not new production writers or a launcher. `verifyToolkit` independently verifies original descriptor/role bytes and the hashed closure, returning an exact LegacyToolkit/BunToolkit role-map union. Historical verification has no current-Bun requirement. `readBunToolkit` requires schema2 and the exact runtime; the transitional `readToolkit` remains schema1/runtime-pinned for existing producers. `verifyActivation` decodes closed schema3/4 manifests and selects the fixed version path table while preserving canonical serialization, artifact/binding identities, checksums, marker and descriptor checks. `readBunActivation` requires4. The production activation writer explicitly still emits3; hand-assembled4 fixtures are reader proofs only. Package/selection/marker/validator-transport versions remain unchanged.

TDD receipts: toolkit's missing module failed0/1/error (/tmp/puni-toolkit-version-red.log); activation's missing export failed0/1/error (/tmp/puni-activation-version-red.log). Toolkit advanced through50/0,60/0,62/0,64/0 to65/0 /77 assertions; the final suite includes a schema1 toolkit pinned to today's Bun, so removing the format guard actually admits it rather than merely changing a runtime diagnostic. Activation's first new fixture run failed14 cases because hyphenated fixture labels were invalid JavaScript during the existing standalone-validator scan; renaming those fixture labels yielded27/0 /43 assertions (/tmp/puni-activation-version-green2.log). Schema negatives require ValidationError, and tamper cases name their exact refusal, preventing a later unrelated throw from masking a removed boundary.

Thirty-six toolkit and thirteen activation experiments reached named failures, restored the source, reran the same covering test successfully and matched its pre-fault source SHA256. Receipts: /tmp/puni-toolkit-version-mutations.json (36, source5dbf902cf123861edbf486e5670fd7928bc74e150dec6d5c10c8de228d908e75) and /tmp/puni-activation-version-mutations.json (13, source9de3b861d39512c074af308ed9a1842ce38697067833fde2a5fae243436e81c0); only adjacent observed Proof comments were added afterward. Toolkit faults loosen each version's required/extra roles, unknown fields and version selection, shared field requirements/value constraints, fatal UTF-8, role/closure hashes, contextual unreadability, exact runtime and both format guards. Activation faults admit historical execution, trust a manifest-supplied layout, reverse version selection, restore legacy descriptor checksum paths, loosen current schema/unknown fields, or bypass canonicalization, marker, descriptor, checksum, role digest, cardinality and duplicate checks. The reversed-layout/legacy-checksum faults make a valid current fixture fail at the named production refusal; cardinality/duplicate diagnostics also prove which structural boundary was reached.

Recorded commands from the CLI worktree:

- `bun test ./apps/twilight-structure/twilight-burokrat/cli/src/policy/toolkit.test.ts --timeout=30000`: final65/0,77 assertions (/tmp/puni-toolkit-version-green6.log).
- `bun test ./apps/twilight-structure/twilight-burokrat/cli/src/policy/activation.test.ts --timeout=30000`:27/0,43 assertions (/tmp/puni-activation-version-green2.log).
- `bun /tmp/puni-toolkit-version-mutate.ts` and `bun /tmp/puni-activation-version-mutate.ts`:36+13 RED1/restoredGREEN0 pairs, both restored true (/tmp/puni-toolkit-version-mutations2.log, /tmp/puni-activation-version-mutations.log).
- `bun test ./apps/twilight-structure/twilight-burokrat/cli/src/policy/toolkit.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/policy/activation.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/runtime-facade.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/runtime-preparation.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/preparation-paths.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/policy/release.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/policy/relocation-activation.test.ts --timeout=30000`:210/0,756 assertions,7 files,96.75s (/tmp/puni-versioned-readers-regression.log).
- `bun test ./apps/twilight-structure/twilight-burokrat/cli/src/packaging/build.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/packaging/installed-dispatch.test.ts ./tools/tool-devsync/src/adr-index.test.ts --timeout=30000`:4/0,88 assertions,3 files,33.84s (/tmp/puni-versioned-readers-packaging.log). This builds and invokes the existing legacy package, not installed PUNI/Bun-only acceptance.
- `bunx tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json apps/puni/cli/tsconfig.json`: exit0, including specs (/tmp/puni-versioned-readers-final-types.log).
- Owned five-source/test ESLint passed (/tmp/puni-versioned-readers-final-lint.log); eight current source/design files passed Prettier (/tmp/puni-versioned-readers-format-check.log); `git diff --check` passed. OpenSpec `bunx openspec validate --all --json` passed343/0 (/tmp/puni-versioned-readers-openspec.json).

Failed verification attempts remain explicit: initial toolkit/caller lint found14 unused-import/test-style errors, then the activation import order failed once; both were corrected before final lint. Strengthening the returned union caused one existing new test's un-narrowed historical role lookup to fail TypeScript; an explicit schema discrimination fixed the test. Astra source-reviewed the final role types and activation path/checksum logic, inspected65/0,27/0 and the36-pair toolkit receipt, and identified the matching-runtime proof gap before its fix. It did not independently rerun these suites or mutations. The49 fault observations are parent-run evidence.

No Bun launcher, current-format writer, snapshotter import-safe port, isolated preparer child, coordinated CI/bootstrap/installed lint switch, new package publication, activation certification, Mac startup/token budget or canonical host gate is established here. Tasks1.2/2.3 stay open. Full provider suites were not rerun for this reader component checkpoint.

Historical scope was checked against source history with Astra: a727e73fc's first schema1 writer emitted four roles without a closure identity; b9c5e4e45's writer emitted the supported five-role/closure-bound profile, retaining schema1. Baseline364d59820 already required the closure identity and read all five roles. The ADR/design/spec now explicitly preserve that supported historical profile; earliest four-role/unbound layouts remain unsupported. Extra role-map keys are an intentional new rejection: the baseline parser accepted extra digest entries but never verified those files. No blanket old-parser equivalence or archive-transport verification is claimed. Two named unchanged-unsupported-profile tests supplement the existing missing-field/extra-role coverage; no missing roles or authority are synthesized.

After the historical-profile documentation refinement, the toolkit suite passed67/0 /81 assertions (/tmp/puni-historical-profile-tests.log), including the two explicit unsupported-profile cases. The earlier210-test consumer regression predates only these extra tests and documentation/Proof comments; no production reader behavior changed afterward. C7 now distinguishes new byte identities from format-version changes, consistent with C13 and ADR0080.

Final historical-profile owned lint and both TypeScript/spec solutions passed0 (/tmp/puni-historical-profile-lint.log, /tmp/puni-historical-profile-types.log); OpenSpec remained343/0 (/tmp/puni-historical-profile-openspec.json). All eleven final checkpoint files passed Prettier and git diff --check (/tmp/puni-versioned-readers-final-format.log). Normal repository hooks are required on the component commit; their optional inactive Tool Wiki result does not certify an activation.

## Import-safe selected snapshotter, 2026-11-09

The [Bun snapshotter checkpoint](../bun-scripts/verify.md#import-safe-selected-snapshotter-2026-11-09) records the typed import-safe selected-role API, unchanged four-path process protocol, exact-arity/import and captured-byte fault proofs, and existing during-build/post-snapshot adversarial controls. It remains a prerequisite to the Bun launcher and coherent toolkit2/activation4 writer switch; no current packaging/launcher task closes here.

## Shared provider Git controls, 2026-11-09

The existing C11 explicit Git environment and supported-version preflight moved from runtime-facade.ts to provider-owned git-environment.ts so the Bun launcher can reuse them. The ordinary parent adds only its verified closure and selected lint-ci binding to the explicit environment. No ambient merge, new Git policy, candidate-placement change or generic process framework is introduced. Environment ownership and the exact released-version grammar/floor remain unchanged.

The actual ordinary-parent suite passed55/0 /395 assertions in32.83s (/tmp/puni-git-environment-regression.log). Sixteen extracted production faults each failed its named actual-parent oracle, restored the helper, reran the same test GREEN and matched the original source hash (/tmp/puni-git-environment-mutations.json, /tmp/puni-git-environment-mutations.log). They alter major/minor floors, failed version-query handling, malformed/vendor response grammar, ambient inheritance, global/system config, replacements, prompts, command-config count, hook/fsmonitor keys or values, and protocol refusal. The hook/fsmonitor/lazy-fetch cases use reachable executable sentinels, preserving the C11 controls rather than merely inspecting the factory output. Earlier46-fault parent evidence is historical; these16 are a fresh relocated subset and do not claim all46 were rerun.

Commands: bun test ./apps/twilight-structure/twilight-burokrat/cli/src/runtime-facade.test.ts --timeout=30000; bun /tmp/puni-git-environment-mutate.ts; bunx eslint apps/twilight-structure/twilight-burokrat/cli/src/git-environment.ts apps/twilight-structure/twilight-burokrat/cli/src/runtime-facade.ts; bunx tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json apps/puni/cli/tsconfig.json. Owned lint and both library/spec solutions passed0 (/tmp/puni-git-environment-lint.log, /tmp/puni-git-environment-types.log); the16-fault harness restored true. This is an unchanged-policy extraction, not Bun launcher integration, installed PUNI acceptance or a canonical host gate.

## Standalone Bun lint process ownership, 2026-11-10

C14 now has a private Bun launcher and current-format activation writer. The launcher validates its separate fatal-UTF8 version1 lint transport, verifies selected activation4 authority and physical external placement, executes the authenticated selected snapshotter, then executes only the captured validator. Working/staged/committed select observe/ratchet/CI; only committed receives the selected CI binding. Exact binary output and verdict status remain intact; required zero status additionally needs the five enforce-certificate fields. Truly absent optional authority is visible inactivity; configured broken authority refuses without fallback. Existing legacy preparation still emits activation3; no production toolkit/CI/bootstrap/package producer switch is established by this component.

Trusted-state classification is phase-specific: expected filesystem/JSON/source-syntax failures receive modeled refusals, while unexpected dependency failures retain their identity. The selected closure defaults from the configured archive root before version selection. Physical placement covers metadata, roles, closure and scratch against the actual Git worktree. Bun1.4.4's compatibility realpath was observed lexically collapsing a symlink/parent path differently from actual file access; the new resolver/runtime boundary uses native realpath. This is not a repository-wide realpath repair. PATH is frozen once against the physical trusted runtime cwd before Git/stage cwd changes, retaining absolute spelling and native relative parent semantics. An unrepresentable delimiter-containing anchor refuses.

Each asynchronous stage owns its detached process group. First cancellation gives the group bounded grace, repeated cancellation escalates, and leader exit starts group finalization before pipe EOF. Normal-exit background descendants fail even when cleanup succeeds. Only ESRCH establishes absence; denied or bounded unconfirmed cleanup fails and retains scratch, naming its group/PID and retained path. Host timers bound cleanup without ambient clock reads. Output callbacks return explicit written/cancelled outcomes. The executable owns lazy FileSinks, actual per-channel write/flush tails and a first-outcome promise; failure releases both outward waits. Cancellation/failure drains remaining child bytes without outward delivery. Pending native output may be explicitly abandoned after unref and is never reported as flushed. Replayed output cancellation cannot become a second signal.

The actual standalone executable contains reporting/release failures and exits only after normal ownership settlement or retained-scratch failure and its bounded diagnostic attempt. A diagnostic has one one-second attempt through the existing stderr sink/tail; failure is not retried and expiry/disposal prevents later writes/flushes. No automatic Bun or alternate Node reporter is used. The explicit process.exit exists only at the standalone boundary, so unconfirmed native references cannot keep it alive after bounded cleanup failure. Reusable APIs return/throw.

Initial tests/probes exposed real failures before fixes: closed consumers left a live stage; relative PATH selected candidate Git after cwd changed; leader-first exit leaked/hung descendants; cancellation replay shortened cooperative cleanup; a no-op KILL could outlive its bound; an output error recorded before a cancellation microtask was masked; and an abandoned diagnostic could start a later write/flush. The ordinary native-output tests use controlled FIFO readers, not mocked process completion. The unconfirmed-cleanup test instruments only the test-owned group signals in the actual built launcher and removes that live stage out of band afterward. An earlier wrapper's own exit call did not cover the standalone guard and is retained as an excluded weak oracle.

[The C14 proof record](verification-c14.json) contains169 canonical distinct faults, each with an actual named RED1/restored GREEN0, distinct mutant hash and exact pre/post restoration hash, plus log digests and commands. There were283 raw experiments and264 successful observations; repeats, a decommissioned guard and19 failed/surviving attempts are separately retained and do not inflate the169. All169 adjacent Proof comments name the observed test. Earlier122 proofs cover request/authority/classification foundations; changed driver/child/main checks were repeated after PATH/output work, and all26 retained output checks were repeated on the final latch implementation. Two final proofs cover a missing build pin and output-returned cancellation before native signal delivery. The missing-build-pin proof establishes its explicit diagnostic; undefined-identifier failure also refuses that unbuilt path.

Mutation survivors were investigated. Promise tests were strengthened with actual flush-start/settlement observations; diagnostic repeat is tested after successful reporting, not only behind a permanently pending tail. Redundant early closed/terminal predicates, duplicate delivery predicates, redundant failure metadata and the later redundant terminal-kind state were removed because the settled promise, rejected native tails and diagnostic-open guard already enforce those outcomes. The original failed/surviving receipts remain honest history. The first release test expected an inner Error rather than the actual AggregateError; its corrected assertion inspects the retained cause. No such wrong oracle is counted as proof.

Observed final commands from the isolated CLI worktree:

- The eleven focused test files lint-request, lint-activation, lint-child, lint-output, lint-cli, lint-cli-output, lint-runtime, lint-interrupts, run-lint, policy/activation and no-ambient-clock passed282/0,617 assertions in24.75s: /tmp/puni-c14-final-focused2.log. Exact file operands used bun test ./apps/twilight-structure/twilight-burokrat/cli/src/<name>.test.ts. The native cases cover closed stdout/stderr, first/repeated cancellation of stalled stdout, failed stderr with stalled stdout, full-stderr bounded diagnostics, complete1MiB binary output in each channel/verdict37, no-stage inactive/refusal failures and retained-scratch cleanup failure.
- bun test ./apps/puni/cli/src ./tools/tool-devsync/src/puni-boundaries.test.ts --timeout=30000 passed328/0,1069 assertions across4 files in9.00s: /tmp/puni-c14-root-grammar-regression.log.
- bun node_modules/typescript/lib/tsc.js --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json apps/puni/cli/tsconfig.json exited0: /tmp/puni-c14-final-forced-types.log. Earlier incremental zero exits are not credited as fresh compilation; the final solutions include library and test roots.
- ESLint on the24 changed TypeScript paths in /tmp/puni-c14-current-paths.json exited0: /tmp/puni-c14-final-lint.log. Earlier scoped diagnostics were fixed, including type narrowing across timers/awaits and test-only unsafe AggregateError.errors access, without weakening policy.
- The final26 output experiments /tmp/puni-c14-latch-faults.ts and two completion experiments /tmp/puni-c14-completion-faults.ts exited0. The earlier final/resume/simplified harnesses exited1 because they deliberately retained unproven survivors; only their individually verified successes are canonical. Every source was restored in finally before coherent checks.

Astra independently reproduced the original output precedence and late diagnostic bugs, reran both against the fix, and source-reviewed the final latch simplification and executable exit ownership. Its complete audit cleared all169 current adjacent proofs,283 raw attempts/566 readable logs, exact restoration/log hashes and meaningful timeout/missing-marker oracles (/tmp/puni-c14-independent-audit-report.json). Two argv oracle labels were corrected to their exact full names; the original timing parser had consumed the argv square brackets. The264 successful observations comprise169 canonical,94 superseded and one decommissioned observation. Astra did not run the final suite or mutations during that audit. No full provider-suite success is inferred: an earlier source-wide run was deliberately interrupted130 after the strict clock guard and pilot-index failures. The missing command-permissions.ts module index entry was corrected mechanically, and its actual pilot positive passed1/0; all pilot negatives/full provider repetition remain separate work. A read-only process-table check found no remaining member of that interrupted run's owned group3346938.

This checkpoint does not close PUNI tasks1.2/2.3 or Bun script-port task3.1. Coordinated current toolkit producers, self-check/bootstrap/CI consumers, installed PUNI routing/package, complete script conversion/inventory, Mac startup, MCP helper budget, activation certification, canonical host gate, deployment and publication remain unverified here.

Final checkpoint record: all30 owned files passed Prettier (/tmp/puni-c14-final-format.log); OpenSpec passed343/343 (/tmp/puni-c14-final-openspec.json); git diff --check passed. The two exact argv Proof labels and evidence/docs were the only edits after the final logic checks. The self-contained JSON records the24 source hashes, complete final check argv/log digests and independent audit receipt. Evidence-only formatting and OpenSpec checks are repeated before staging. Normal repository hooks remain required; optional inactive Tool Wiki output is not activation certification.

## Combined audit/CLI regression, 2026-11-10

Exact merge a54dbcb7c1edc45d2832a1b5be845400e6677490 combines the C14 launcher checkpoint af0cbe6637 with audited WBS foundation d4dce3f35. The source/HEAD stayed frozen for the whole broad provider run. With TOOL_WIKI_TRUSTED_NODE_MODULES set explicitly to the isolated checkout's node_modules, bun test ./apps/twilight-structure/twilight-burokrat/cli/src --path-ignore-patterns '**/packaging/install.test.ts' --path-ignore-patterns '**/packaging/consumer-bootstrap.test.ts' --timeout=60000 passed4183/0,19319 assertions across123 files in2302.10s (/tmp/puni-c14-stack-provider-regression.log, exit0). The complete reviewed pilot controls, legacy package build/dispatch, preparer/release and entrypoint regressions are included. The two named install/bootstrap files are explicitly excluded. No prior aborted count is substituted for this clean receipt.

Both Burokrat/PUNI complete TypeScript roots also passed with --build --force on this exact stack (/tmp/puni-c14-stack-forced-types.log, exit0). The JSON contains exact argv/environment/log digests. This still does not establish installed PUNI, the coordinated current producer/CI switch, a canonical host gate or deployment.

## Owned asynchronous lint Git preflight (1.2a), 2026-11-10

Lint version/root probes now use the existing asynchronous detached-group owner before activation lookup or scratch creation. Their explicit frozen cwd/PATH/Git environment and interruption subscription are shared. Cancellation returns a typed outcome before response decoding or the next stage. The released-version response validator moved to assertGitVersionResponse; ordinary synchronous callers keep their prior process behavior and response policy. No installed-parent adapter or producer default changes in this component.

Astra's controlled Bun1.4.4 probes established the cause: a synchronous Git child delays JavaScript signal delivery. PID-only signaling left it alive; signaling its launcher group killed Git but made the actual built launcher return1 before its cancellation handler ran. Four actual executable tests then failed0/4 in22.05s on missing forwarded signal receipts (/tmp/puni-lint-preflight-cancel-red.log), and passed4/0 in3.64s after async ownership (/tmp/puni-lint-preflight-cancel-green.log). Both version/root probes ignore first signals; first grace and repeated escalation retain exact130/143, prove group absence and start no snapshotter or scratch.

The first related run was118/1: its old global runLintChild rejection now faulted earlier Git preflight. The scratch-owner test was narrowed to inject its fault at the snapshotter, preserving real preflight. A separate direct API control proves unconfirmed preflight failure creates no activation scratch, and prior cancellation with no Git available returns130 before spawn. The actual two-probe observation now seeds/restores an ambient sentinel and verifies its exclusion alongside trusted cwd/config fields. Corrected caller/native tests pass48/0,201 assertions (/tmp/puni-lint-async-preflight-caller-green.log).

[The preflight proof record](verification-c15-preflight.json) contains25 canonical restored faults:9 preflight wiring/order,5 relocated response checks and11 unchanged Git-environment regressions. There are27 raw attempts and two excluded failed baselines. A restricted harness PATH initially omitted Bun, so its reachable-hook positive controls could not run; the retry adds only the selected Bun directory and observes actual marker execution in RED then absence in restored GREEN. The original rows/logs remain excluded. A generic environment anchor was also refused before mutation because it matched two contexts; the probe-only resume succeeds. A premature20-proof commentary count was corrected to18 before the retries.

Astra inspected every canonical receipt/log/current anchor/restoration and the seeded sentinel, then found an ordering oracle gap. Deleting validation proved it was required before optional inactivity, but did not prove it preceded repository metadata. The extra fault moves validation after the actual root query; its marker assertion fails specifically expectedfalse/receivedtrue, then restores GREEN. That25th receipt hashes source already bearing the previous24 Proof comments; both annotation states are recorded honestly. The malformed-response null guard proves its explicit diagnostic; removal still refuses through a null access.

Final six-file regression passed142/0,734 assertions in60.22s (/tmp/puni-c15-preflight-final-tests.log): run-lint, lint-child, lint-cli-output, runtime-facade, lint-cli and strict no-ambient-clock. This includes the ordinary verified-parent cases. Both complete Burokrat/PUNI TypeScript roots passed --build --force (/tmp/puni-c15-preflight-final-types.log); five changed TypeScript files passed ESLint (/tmp/puni-c15-preflight-final-lint.log); all nine then-owned files passed Prettier (/tmp/puni-c15-preflight-final-format.log); OpenSpec passed343/343 (/tmp/puni-c15-preflight-final-openspec.json). No checks overlapped mutation windows. Final evidence/task-only formatting/OpenSpec/diff checks repeat before commit.

Astra found no production blocker, verified all52 original raw logs and the additional ordering pair, and did not independently rerun tests or mutations during final audit. Task1.2a closes; parent1.2 and1.2b/1.2c/1.2d remain open. Actual installed-parent topology, unsolicited launcher death, strict current package assembly, coherent toolkit/activation/bootstrap/CI switch, full client/Bun conversion, canonical host gate and deployment remain unfinished. The earlier4183-test broad provider receipt belongs to its exact preceding combined stack; it is not claimed as a repeat after this async change.

## Current installed-lint identity and physical preflight helper (1.2b partial), 2026-11-10

The strict readInstalledBunToolkit API now joins package-manifest1 expected identity to verified toolkit2 bytes and exact Bun, without changing current producer defaults. Both caller directory operands are resolved natively before child paths are joined. The legacy execution API remains for the coordinated producer switch. Shared manifest/descriptor/role verification now checks regular-file status before synchronous reads: accepted historical bytes/digests remain unchanged, while FIFO and other nonregular inputs deliberately refuse instead of potentially blocking. Stable operator-owned files remain a prerequisite; a stat/read pair is not concurrent-write isolation.

The new async readInstalledLint helper verifies package/toolkit identity, owns supported-Git/actual-root probes, then checks physical installation, toolkit cwd, manifest, descriptor, all5 exact current roles and copied closure targets. Digests cannot grant candidate placement. The closure must also not contain the candidate. A package directory may be an ancestor of the candidate only when every authority asset independently remains outside it. Prior cancellation performs no installation/probe IO; version/root cancellation keeps the existing detached-group owner.

Astra found a lookup-origin ambiguity in the initial helper: it rebased trusted raw PATH against the selected toolkit before that provider's placement was known. A controlled pair of Git executables proved the candidate marker actually ran before refusal (0/1 RED, /tmp/puni-installed-runtime-origin-red.log). The final API requires a caller-created frozen LintRuntime selected independently from the provider. It passes that runtime unchanged through both probes, checks its cwd against the discovered candidate, and returns its frozen configuration for later launcher wiring. C14/spec now make that trust origin explicit. Git/PATH/origin remain stable trusted prerequisites, not authentication of arbitrary PATH entries or a general Git sandbox. Archive launcher semantics remain separate.

[The installed helper evidence](verification-c15-installed.json) contains32 final canonical restored faults and64 matching logs, all independently reconciled by Astra. Original30 faults/60 logs remain preserved:29 IDs replayed on final source, one toolkit-relative factory wiring proof retired, and3 independent caller-runtime proofs added. Two initial placement proofs only moved refusal to the next guard; their final fixtures now keep all other asset targets external and admit the invalid placement when each guard is removed. The final rebasing fault reconstructs a relative component from its frozen origin and redirects it to the candidate toolkit; RED fails on actual candidate-marker execution before inspecting diagnostics. FIFO guard removals hang their bounded child until explicit SIGKILL; restoration refuses before read.

All62 raw mutations succeeded as RED/restored-GREEN controls, without overlap with source-sensitive checks. A v2 import-style anchor mismatch stopped before mutation31 after30 restored successes; the remaining2 proofs resumed with the corrected exact anchor. The evidence separately preserves earlier named/unnamed TDD failures, the intentionally changed directory diagnostic, and a corrected test expectation for the existing Git2.36 floor. Package context/schema rows prove diagnostics or phase order as documented; they are not claimed to permit corrupt bytes when removed.

Final regression is257/0,888 assertions across7 actual files in106.59s (/tmp/puni-installed-final-tests.log), covering current reader/preflight, historical toolkit verification, ordinary installed dispatch, typed preparation and actual release/relocation preparers. All14 historical/current FIFO cases and real permission-denied manifest/descriptor/closure controls pass. Full Burokrat/PUNI TypeScript roots pass --build --force, and all5 changed TypeScript files pass ESLint. An earlier190/0 command collected only3files because2 preparation selectors did not exist; it is not credited with preparation coverage. The4 correctly located suites then passed62/0 and are included in the final7-file regression.

Astra verified all32 current receipts,64 logs, baseline/current comment reconstruction, mutant hashes, exact test hash and preserved original logs; no remaining blocker in this helper checkpoint. It did not independently rerun tests. Task1.2b remains open: this module is not yet the actual facade/optional-inactivity route. Nested parent→launcher→stage ownership, unsolicited launcher death, package production, coherent toolkit/activation/bootstrap/CI switch, complete PUNI/Bun surface, exact-commit host gate and rollout remain pending. This publication is a component checkpoint under the still-active whole-scope goal.

## Installed typed lint and ordered parent ownership (1.2b/1.2c), 2026-11-10

Dedicated executeLint now connects the published strict installed preflight to the delivered toolkit2 Bun launcher. Its typed stdin, frozen Git authority, selected activation/closure, caller-relative scratch and protected launch capability cross the actual installed process boundary. Package identity and physical placement precede optional inactivity. Existing52 ordinary/preparation commands retain their dispatcher.

ADR0082 records the distinct private argv and ordered READY/START/control/FINISHED IPC protocol. It preserves queued/repeated controls and the first reason without native-signal coalescing; START gates request IO. The child alone owns escalation of its detached stages. Logical control release precedes broker disposal and attempts every removal even after failures. FINISHED means lifecycle settlement, including retained cleanup failures. The parent owns native exit observation, both stream drains and channel settlement; native death never proves detached stages absent. It retains original errors and raw stderr, replays only discarded terminal diagnostics and preserves normal exit1 after cancellation. No parent escalation timer competes with the stage owner.

Actual tests cover grandchild grace/repeated escalation, Linux subreaper cleanup after unsolicited launcher death, native FIFO-stalled output, closed consumers, exact large binary streams, faulty native reader/exit/send/disconnect ports, queued controls, failed registration/teardown and late callbacks. Authenticated controlled launchers exercise invalid notices and exact environment/cwd; these are protocol fixtures, not a completed package producer. A v1-only launcher refuses before operation IO and receives no standalone retry.

[The control verification record](verification-c15-control.json) preserves67 successful named RED/restored-GREEN cases over63 distinct source mutations,134 canonical logs, all4 earlier surviving attempts and their8 logs, exact source/mutant/restoration hashes and archived proof-era source. The READY deletion case proves notice delivery, not registration ordering. Removing stdout draining proves delivery; separate actual native-exit/channel-settlement probes prove waiting for active stdout and stderr drains. The earlier exit-marker-only await selector survived and remains excluded. Missing IPC/sender cases prove fixed diagnostics; cancellation/disconnect secondary failures prove error retention. A nonunique anchor refused before that fault was applied. A test preloader initially used an unsupported launch argument; its12/1 harness failure is retained and receives no production-failure credit.

Fresh combined regression passed365/0,1318 assertions,14 files in119.64s; both forced Burokrat/PUNI TypeScript roots, scoped15-file lint, OpenSpec343/343, formatting21 files and diff checks passed. The earlier363/0 run and four corrected test matcher lint errors remain recorded. Native probes are Linux/Bun1.4.4 evidence and do not certify macOS.

Astra independently reconciled all67 canonical cases,63 mutant texts,142 log hashes, restoration and proof-era sources. It found no runtime blocker and did not independently rerun tests. Only1.2b/1.2c close. Parent1.2, root lazy executor/Dash facade1.2d, standalone public PUNI packaging, complete client embedding/Bun conversion, coordinated toolkit/activation/bootstrap/CI producer switch, registry identity, exact-commit host gate and rollout remain open. This component publication leaves the full entities/PUNI goal active.

## Permissions/CLI combination and compiler contexts, 2026-11-10

Merge7f1fc36de6177fbe5acf4ef17576779b3364c447 combines membershipdbb7b858 with installed controla0d873f3. Its expanded runtime group passed693/0,2387 assertions,18 files in127.73s. The four-provider forced build failed with6 distinct directory wrapper inference errors; this failure remains recorded rather than being treated as a green combination.

Type-fix2a645706f7264f63f06cd125c6ffd15fdc35185d explicitly binds each standalone directory operation's complete outcome at6 calls. Bun1.4.4 transpiles the original and fixed file to identical36876-byte JavaScript. Fresh forced builds across all4 CLI roots plus WBS core/SQLite passed; the directory service's9 tests/29 assertions, scoped lint and formatting passed. The693-test receipt belongs to the merge before this erased fix, not a claimed rerun at the later SHA. [The combination record](verification-c15-combination.json) retains exact commands, failures, source identity and log hashes. Whole WBS regression, canonical host gate and deployment remain unrun for this combination; root executor1.2d and the full entities/PUNI scope remain active.

## Explicit Dash dispatcher statuses (1.2d partial), 2026-11-10

Dash handlers, runDash and runDashArguments now return numeric statuses. Ordinary operations return0 after settlement; resources/ops return their actual lower-level status. Only the standalone executable assigns process.exitCode. Native missing-pool operations returning70 followed by or overlapping successful enrollment prove that the library leaves an unrelated global19 untouched and waits for gated enrollment before completion. The standalone native invocation independently retains70.

TDD observed0/3 against the old API. The first implementation passed127/2: both remaining failures were the new test's incorrect diagnostic prefix, after its status/global assertions passed. Forced types found6 uses of the old test-only Promise<void> observer; Promise<unknown> now preserves its rejection-only contract. The affected9-file group passed233/0,1004 assertions in236.32s; forced Dash/PUNI roots and scoped lint passed. The later4-case status/executable baseline passed4/0, followed by an expanded6-case baseline passing6/0. Both clock guard cases passed. The final coherent10-file group passed238/0,1027 assertions in250.53s, including all6 status/native cases and both clock guards. Fresh forced Dash/PUNI roots, scoped4-file lint, formatting, OpenSpec343/343 and diff checks passed.

[The status record](verification-c16-status.json) preserves8 actual named RED/restored-GREEN faults for nonzero status propagation, global status writes, awaited planning, dispatcher and argv-adapter propagation, resource forwarding/global isolation and executable assignment, with source/mutant/restoration/log hashes. Resource forwarding uses a controlled existing runResources export returning37; native missing-pool operations return70. These test the actual handlers without exercising live resource allocation authority. Astra independently cleared all8 proofs/16 logs and source reconciliation without rerunning tests. Parent1.2d remains open for the lightweight validated facade and root lazy executor/entrypoint; this partial checkpoint does not establish packaged public PUNI operations, complete native IO injection, a host gate or deployment.

## Shared typed lint executable ownership, 2026-11-10

C17 extracts the standalone ownership scope into private runLintOperation and exposes runInstalledLint for the future root. Lookup is selected independently of the provider and constructed inside bounded reporting ownership; typed execution does not enter stdin or argv transport. Standalone control release, output/broker disposal and finished ordering remain intact. The installed fixture proves exact binary verdict37, required78, optional inactivity after preflight, independent relative-PATH Git authority, bounded construction reporting and actual native cancellation with confirmed ESRCH and scratch removal. Root task1.2d remains open.

[The C17 record](verification-c17-execution.json) preserves18 unique actual named RED1/restored GREEN0 production faults:12 shared/relocated executable guards and6 new typed adapter wiring cases. There are19 successful observations/38 logs because native exit was repeated after fixture correction; the earlier success is retained separately. Removing native process.exit actually leaves the launcher unsettled with null status at the pre-cleanup observation; restoring it exits1. The Linux x64 supervisor then reaps only its owned adopted stage and restores its prior subreaper state. The earlier POSIX branch remains on other hosts; no Mac reaping qualification is claimed. Astra cleared source and all19 receipts/log hashes, with the six adjacent adapter Proof notes added afterward. Astra did not independently run final checks.

The frozen15-file group passed371/0,1337 assertions in136.26s; exact argv and log digest are in the record. ESLint on6source paths passed0. Canonical bunx tsc --build --force passed all4CLI roots plus WBS core and store-sqlite. A prior misspelled SQLite path failed TS6053 and is retained; earlier explicit JS compiler6 outputs are not relabeled as canonical compiler7. Historical initial REDs, helper typing/crypto errors and unavailable session statuses remain separately uncredited. All10 owned paths passed Prettier; post-comment ESLint, OpenSpec343/343 and git diff --check passed before publication. This component does not prove actual root routing/package integration, a producer switch, full script conversion, canonical host gating or deployment.

## Typed Dash runtime facade, 2026-11-10

C18 adds the validated import-safe executeRequest facade and lightweight grammar exports for invocation-aware root errors. Typed release/token/pool/general branches retain their actual implementations, numeric status and completion. The executable supplies clocks; no new Dash ambient reader or composer was added. Token/pool use explicit ports; release child IO/environment and heavy native adapters retain their established ownership and are not claimed to be fully injected. Generated pool helpers prepend the selected protected PUNI invocation and canonical dash. Root task1.2d remains open.

[The C18 record](verification-c18-dash-facade.json) contains12 distinct actual named RED1/restored GREEN0 production faults and24 hashed logs. They cover both coherence families, release selection/status, MCP await/transport, pool await/protected prefix/canonical namespace, heavy status, lazy graph isolation and no argv reparse. The held-response pool oracle measures early completion before releasing the network, then waits for actual native writes before cleanup even under the omitted-await fault. The eager-heavy-import fault reaches the subprocess canary; this is not an unexercised import assertion.

The final frozen10-file group passed534/0,1725 assertions in23.19s, including new facade tests, existing MCP/pool/release/CLI/clock tests and all root grammar/discovery/import-boundary tests. The focused group passed9/0,45 assertions in5.61s. Canonical bunx tsc --build --force passed Dash/PUNI and three-file ESLint passed0. Initial missing export RED, three wrong test fixtures and test lint corrections are retained separately without production coverage credit. Astra source/evidence review cleared12cases/24logs and exact restored snapshots without rerunning tests. The12 adjacent Proof notes are comment-only. Post-comment lint, OpenSpec343/343 and git diff --check passed; all7 owned paths were formatted before publication. This does not establish root routing, a coherent installed artifact, helper spawn budget, the public package, full Bun conversion, canonical host gating or deployment.

## Root typed execution and executable boundary, 2026-11-10

C19 completes the lazy root executor/entrypoint and invocation-aware error/status mapping. Main parses once, discovery performs no operation, only the selected provider runtime loads, and reusable calls return completion without writing global process status. The executable uses terminal exit only for lint after its shared owner returns. Ordinary lookup and lint share native freezing; absent lint PATH is checked inside owned reporting and empty PATH still selects the trusted origin. Parsing/context/provider-import failures remain outside that reporter. Missing installed assets refuse without source/checkout fallback.

[The C19 record](verification-c19-root.json) contains38 distinct actual named RED1/restored GREEN0 faults and76 hashed logs:31 root/policy/wiring cases,6 relocated lookup cases and one unchanged standalone exit guard repeated against the generalized native fixture. The root lint terminal-exit fault and standalone repeat both measure unsettled execution/null status and a live owned stage before cleanup, then exact adoption/reaping and prior native-state restoration. The PATH-owner fault proves reporter prefix selection; closed/full stderr completion is separately exercised by positive actual built-root cases. The main-await fault fails before lazy runtime entry and proves dispatch awaiting. Selectors can execute several cases; no exactly-one-failure claim is made.

The frozen combined regression passed769/0,2633 assertions across24 files in170.35s. Canonical forced builds passed all4CLI roots plus WBS core/store-sqlite; scoped lint passed0. Actual root tests cover all Navigator/Dash aliases and discovery/error statuses. Provider-owned tests build the actual root and execute all Burokrat aliases beside explicit external toolkit1 ordinary and toolkit2 lint fixtures, proving actual template execution, exact binary verdict37, admission78/caller-relative operands, Git canaries, native unconfirmed preflight and absent/emptyPATH/closed/fullstderr. These are separate fixture formats, not a coherent released package. Linux x64 reaping and Linux FIFO coverage are explicit; no Mac qualification inferred.

Astra reconciled all38 source/mutant/restoration receipts, archived tests and76 logs and reviewed root ownership/status boundaries without rerunning tests. Initial missing-module/boundary REDs, a fixture without HEAD, a NUL-containing test program and lint corrections are retained separately. The37 new adjacent notes leave all11 source paths Bun-transpilation-identical; the unchanged standalone guard keeps its historical adjacent proof. All16 owned paths were formatted; post-comment lint, OpenSpec343/343 and standalone git diff --check passed. Formatter output also retains all11 Bun-erased executable hashes. Final format check and normal hooks follow before publication. Package/producer defaults, stored helper budget, complete client/script conversion, canonical host gate and deployment remain open.

## Current toolkit metadata planning foundation, 2026-11-10

C20 adds only planBunToolkit: strict explicit puni-v metadata, the closed five-role schema2 roster, canonical role/closure identity and deterministic six-line SHA256SUMS with final LF. It does not build roles, establish clean-release provenance, produce usable preparers, change package identity, publish or switch defaults. The old planner stays unchanged. A synthetic toolkit1 regression fixture captures its original bytes; this is not an authenticated published archive. The current reader acceptance test uses synthetic role/closure material and establishes descriptor verification only.

[The C20 record](verification-c20-planning.json) contains19 canonical production faults,35 superseded successful observations and2 excluded unproven attempts:56 attempts/112 hashed logs. All canonical cases fail their named actual test at RED1 and restore GREEN0. Faults cover schema/roster/current tag components and end, metadata admission/fields, module order, role/descriptor checksums/LF and emitted identities, including independently malformed dependency-container/member cases requiring ValidationError. The seventeen other oracles are unchanged when those two assertions are strengthened. Absence tests establish refusal without defaults; they are not independent required-field schema proofs. Both earlier lookahead-to-dollar mutations survived because those assertions are equivalent in this non-multiline Bun runtime; one fixture initially represented literal backslash-n, and the corrected newline repeat also survived. Neither counts as proof.

The final compiler-separated regression passed160/0,309 assertions across3files in7.53s. Canonical forced Burokrat/PUNI builds and scoped lint passed0. An earlier parallel run passed159/failed1 when an unchanged FIFO case hit its1500ms child deadline; the exact case and whole group then passed after compilation finished. No deadline or required check was weakened. Astra reviewed all56attempts/112logs and closed the malformed-array finding without rerunning tests. Nineteen adjacent notes leave the planner Bun-transpilation-identical. All7 owned paths were formatted. Post-comment lint, OpenSpec343/343 and git diff --check passed; formatting retained the planner executable hash. Final format check and normal hooks follow before publication. Asset assembly, both current preparers, bootstrap/CI, coherent cutover, installed package/helpers/platform proof, full Bun ports and the canonical host gate remain open.

## Prepared activation Bun self-certification foundation, 2026-11-10

C21 extracts the unchanged full enforce-certificate predicate and adds private checkPreparedActivation over the existing ordered IPC controller. It sends a closed committed request under protected selected-Bun startup, frozen explicit Git authority, required admission and archive-default closure. The preparation owner supplies the only interruption subscription. Matching recorded first130/143 is controlled cancellation; normal1 remains R20 with complete controller-replayed stderr. Other interrupted capture is explicitly a prefix. Unexpected decoder/runtime/transport failures retain their original context. Caller authentication of bootstrap bytes and native external placement remains a prerequisite.

The initial5-file group passed77/0,208 assertions. The final12-file group passed194/0,694 assertions in87.61s. Forced Burokrat/PUNI compiler roots, six-path lint and OpenSpec passed. [The C21 record](verification-c21-self-check.json) preserves37 distinct named RED1/restored GREEN0 source faults and74 hashed logs. Tests separately cover controlled-peer diagnostics and the actual C14 launcher chain; the peer status1/PID/scratch text does not prove actual unconfirmed-stage cleanup. Adjacent Proof comments preserve identical whitespace-minified Bun executable output. Initial missing modules, import-order failure and the nonminified array-wrap comparison are retained rather than credited as success.

Astra cleared the source without independently rerunning tests; final evidence reconciliation is recorded in the JSON. Existing producers/defaults remain legacy. Both current preparers, asset provenance, bootstrap/admission/CI ports, coherent switch, public installed PUNI package, complete script conversion, canonical host gate and whole entities scope remain open. This component checkpoint leaves the whole goal active.

## Permissions/self-check combination, 2026-11-10

Merge1ce685a3590d195ef0a71787052d12c17e706242 combines C21b167cb444 and WBS88c080485 without conflicts. All10 C21 paths and37 WBS checkpoint paths retain their exact parent bytes. Fresh canonical forced builds passed all4 CLI roots plus WBS core/store-sqlite/be/gw/fe/mcp. The combined18-file runtime group passed553/0,2094 assertions in224.01s, covering all four permission families, actual root routing/parser and delivered self-check chain. [The combination record](verification-c21-combination.json) preserves commands, log hashes, exact parents and inheritance checks. Parent Astra/proof reviews remain bounded parent evidence; this merge adds no source faults or full-gate/deployment claim. The complete entities/PUNI goal remains active.

## Current preparation source authority foundation, 2026-11-10

C22 adds internal readPreparationSource without changing active producers. It verifies strict toolkit2 against caller-authenticated package digest before owned Git discovery, uses native external placement for runtime/toolkit/descriptor/all roles/closure, and checks exact full revision/HEAD plus explicit Git-reported clean status. Request/runtime snapshots precede awaits. Configured clean/process filters and indexed gitlinks at all stages refuse before status. Actual direct-status positive controls prove root and nested sentinels execute without these checks. Prior/version/commit/HEAD/filter/index/status cancellation uses the existing child owner and proves group absence with no subsequent query.

The focused final unit group passed50/0,128 assertions. Final regression passed106/0,320 assertions across5 files in21.85s; canonical forced Burokrat/PUNI roots and scoped3-path lint passed. [The C22 record](verification-c22-preparation-source.json) preserves43 named RED1/restored GREEN0 mutations and86 hashed logs. Isolated physical fixtures ensure individual guard removal reaches ready; decoder/diagnostic/order/empty-state proofs retain their narrower stated qualifications. The child stage-union extension and proof comments emit identical whitespace-minified Bun JavaScript. Missing module, diagnostic matcher, unsafe test JSON/property accesses and an omitted test import remain recorded failures.

Astra reviewed source and required stronger placement/sentinel fixtures before mutation. Its final reconciliation is recorded in JSON; no independent test rerun is claimed. Current preparers, immutable capture/output reservation, one-source builds, archive assembly, owned executable wiring, bootstrap/CI/cutover, public package, complete Bun ports, canonical gate and whole entities scope remain open. Whole goal active.

## Exact committed-source capture foundation, 2026-11-10

C23 captures an explicit commit/tree and raw selected blobs under the extracted explicit owned Git helper. It never reselects HEAD or reads live worktree bytes. The unchanged shared batch decoder verifies identity/type/framing/content hashes; old reader process/cache ownership is preserved. Canonical path/duplicate/ancestor/gitlink refusals precede batching. Private captured state backs fresh snapshot, entry and file copies. Tests retain binary NUL/LF/invalidUTF8, executable/symlink modes, BOM/Unicode/whitespace names, earlier revisions despite later checkout changes, deduplicated requests and empty trees. Cancellation at every query returns before partial-output parsing with confirmed group absence.

The focused46-case group passed101 assertions. Final7-file regression passed162/0,501 assertions in28.07s; forced Burokrat/PUNI compiler roots and seven-path lint passed. [The C23 record](verification-c23-committed-source.json) preserves45 canonical named RED1/restored GREEN0 faults, one excluded survivor,46 attempts and92 hashed logs. The identity survivor was a substring-oracle defect; only the stronger exact-diagnostic/no-next-query retry is canonical. Parser/status diagnostics, the compound LF fault and broader array-alias fault retain their narrower qualifications. Astra reconciled all proofs/epochs/notes and unchanged minified JS before a one-fixture at(0) lint correction; fresh final checks cover that correction. The first final suite lost status/output when lint rejected and is uncredited. Other fixture/generator/runner failures remain recorded.

This is captured data, not a materialized build view. Fresh output reservation, native Git-metadata/collision/link checks, both current preparers, source-bound role/closure assembly, owned executable/root preparation, bootstrap/CI/cutover, public package, complete Bun conversion, canonical gate and entire entity scope remain open. Whole goal active.

## Rank/mode and committed-source combination, 2026-11-10

Mergedec3aecd51a2252e38b1401b6ab37ec7abe614aa combines CLIbb51ac050 and WBS4eb4c062a without conflicts. All11 CLI checkpoint paths and14 WBS checkpoint paths retain exact parent bytes. Fresh forced builds passed4CLI plus6WBS roots. The combined16-file runtime group passed452/0,8804 assertions in138.21s, covering all11 rank/mode affected/controller/native/source files, root executor/parser and committed-source/blob/source-selection suites. [The combination record](verification-c23-combination.json) preserves exact parents, commands/log hashes and inheritance. Parent model/proof/Astra reviews remain bounded parent evidence, not a rerun or whole-gate/deployment claim. Entire entities/PUNI goal active.

## Fresh captured-source materialization foundation, 2026-11-10

C24 materializes into one fresh native-external private root, protecting actual closure/authority targets as well as candidate/toolkit/runtime directories. Unique parents require nonrecursive mkdir, files use exclusive creation/exact bytes/modes and awaited close, and links follow every regular write. Narrow Git HFS metadata equivalence rejects metadata without normalizing ordinary names. Preserved link targets undergo native containment validation. Error/cancellation outcomes expose retained partial-root identity; original/aggregate failures take precedence over cancellation. A reached release-time race first returned success; the final post-release cancellation read corrected it.

Focused70/0 passed266 assertions; final8-file regression passed232/0,767 assertions in41.95s, with canonical forced Burokrat/PUNI roots and scoped lint0. [The C24 record](verification-c24-materialization.json) preserves51 unique named RED1/restored GREEN0 faults,102 logs,51 adjacent notes and unchanged minified JS. The real descriptor gate proves pending close ownership before API settlement. Native permission, external-closure, escape-chain, retained-root and cause controls pass. Early/diagnostic/file-availability/collision-injection/link-order proofs retain their stated narrower qualifications; no Mac native collision claim is made. Initial missing module, terminal race, type/lint and test-fixture errors are retained. Astra reconciled every proof/source/test/log and final232/0 output without independently rerunning tests.

Build dependencies, current role builds, both preparers/assembly/self-check/archive, owned executable/root preparation, bootstrap/CI/cutover, public package, complete Bun conversion, canonical host gate and whole entities scope remain open. Whole goal active.

## Current toolkit-based Bun preparer, 2026-11-10

C25 now prepares an internal toolkit2-based first activation from exact captured candidate/reviewed bytes, the existing pure check/review plans and native-selected check-run authority. Static Nx inputs need no physical checkout. Regular operator/check-record files refuse FIFOs without blocking; review/audit inputs are copied before awaits while check records are judged later. Shared fresh-root reservation retains immediate ownership and requires disjoint work/destination roots. The written activation4 bootstrap and copied closure are checked before required full self-certification. Only then can an exclusive PUNI archive be created through owned GNU tar and awaited write/close settlement. Partial outputs and original/aggregate errors remain inspectable; first cancellation stops later work and survives terminal release.

The final10-file group passed297/0,1044 assertions in66.13s, including all52 preparer cases and the real Bun launcher/snapshotter/validator certification path. Forced native Burokrat/PUNI builds and six-path lint passed. [The C25 record](verification-c25-preparer.json) preserves43 final named killed/restored faults,86 hashed logs and43 adjacent notes with unchanged minified runtime JS. Native tar refusal/cancellation/group absence, exclusive collision, pending native close, cause aggregation, input absence/unreadability/FIFO/UTF8, source/runtime aliases and stage cancellation are covered. Earlier weak-oracle/setup/type/lint/generator and source-epoch observations remain explicitly qualified rather than counted as final proofs. The lint-child archive stage changes only its type union. Astra's source/evidence audit and its limits are retained in the record.

Current relocation preparation, source-bound builds and usable packaged preparer roles, installed preparation ownership, bootstrap/CI/default cutover, public package/client helpers, exhaustive Bun conversion, the remaining WBS entity scope, full canonical host gate and rollout remain open. Whole goal active.

## Source-bound Bun relocation preparation, 2026-11-10

C26 adds internal prepareBunRelocation and builds its validator, launcher and snapshotter from the selected committed capture using authenticated current-toolkit dependencies. Verified schema3/4 base members require native regular/contained/external placement before complete byte verification; historical roles never execute. The builder preserves selected alias/JSX/class-field/import-condition semantics, refuses macros before Bun.build, supplies captured bytes through a sealed namespace and waits for in-process builds before cancellation. Shared C25 activation4 assembly retains full certification, exclusive archive ownership and settled native writes/close.

[The C26 record](verification-c26-relocation.json) preserves65 distinct canonical actual faults,130 hashed logs and78 named RED/restored GREEN occurrences, with every mutant reconstructed and all16 frozen paths restored. Diagnostic/order proofs are explicitly bounded: opaque-loader, preserved-JSX and TypeScript-syntax guard removal still reaches later Bun/scanner refusal; malformed epoch decoding changes error class but still refuses. The macro guard mutant unexpectedly succeeds before its later marker assertion, so no mutant sentinel execution is claimed. The combined compiler policy removal/output repin is one fault, not two independent checks.

Final frozen regression passed415/0,1267 assertions across14 files in106.60s. Fresh forced Burokrat/PUNI roots and13-path lint passed0. Both base schemas run through the actual current launcher and snapshotter with a controlled certificate peer; missing full certification retains outputs and prevents an archive. A compiler-bearing fixture extracts both license and combined modification notice from actual GNU tar output and matches written bytes. The separate actual full-provider build/extraction probe supplies normal compiler and candidate-plugin-negative evidence; it does not establish a real full Burokrat certificate for this archive fixture.

Sixty-five adjacent Proof notes preserve identical whitespace-minified Bun output across all6 proof-bearing source files after formatting. Astra source/evidence review status and independently reproduced scope are recorded in JSON; no independent test rerun is implied. The native-compiler epoch precedes process/FIFO tests. Initial missing dependencies, executable-hashbang failures, fixture/oracle errors and lint/type corrections are retained separately. Historical compiler/defaults, all-five-role assets, usable packaged preparation/executable owner, public PUNI package, full client/script conversion, canonical host gate and whole entity hierarchy remain open. The whole goal remains active.

## Resource/runtime and source-bound preparation combination, 2026-11-10

Mergef105f53de05b7620988b4e4cf75b6efd7004b7e9 combines C268d88c89112574b8f596f6b2f5f977716a39c98fe and WBS resource/runtimeb7b98eb91128e09c9c0145e3d9c3038c43b7c06d without conflicts. All18 CLI and23 WBS paths retain exact committed-parent and worktree bytes; fresh forced builds passed all4 CLI roots and6 WBS roots. The compiler-separated11-file combined runtime group passed735/0,5137 assertions in235.07s, covering actual root routing/grammar, source-bound roles and preparation, resource-use/runtime HTTP admission and raw authorization/role decoding. The41 inherited hashes stayed fixed throughout. [The combination record](verification-c26-combination.json) preserves exact parents, paths, commands and raw log hashes.

Parent Astra/fault reviews and WBS conformance remain bounded inherited evidence; this combination adds no source edits or fault experiments. The whole goal, public/current asset cutover, complete client/operational Bun conversion, entity hierarchy and exact-SHA host gate/rollout remain open.

## Current five-role Bun assets and preparation ownership, 2026-11-10

C27 adds an internal usable toolkit2 producer over one committed capture and an independently trusted stable installation. Manifest/lock/Bun-pin bytes must match the capture; the fixed selected dependency topology is hashed before copying and checked again in both private copies. All five roles share the sealed captured graph, bounded configuration and pinned compiler policy. Fresh work/destination roots protect source, runtime, native installation/closure and authority-file targets; every emitted role, notice, descriptor and checksum receives settled regular-file readback. Final verification must match the planned descriptor identity. This establishes internal asset identity and usability, not clean-release provenance or publication authority.

Both newly built real preparer assets complete normal/relocation activation4 archives through the actual launcher/snapshotter and a controlled certificate peer. Normal preparation derives compiler license/modification notices from authenticated raw compiler bytes, never adjacent unauthenticated files. This orchestration evidence does not claim a full semantic certificate for the actual full-provider archive fixture.

Standalone preparation uses a closed role-specific fatal-UTF8 invocation and one bounded signal/output/report owner. Typed installed execution verifies package identity and native package placement, then calls the preparation APIs in process without argv/stdin re-entry or a new parent protocol. It does not claim execution of the toolkit preparer assets on that route. Input cancellation settles native reads, cleanup failures retain order, owned roots/archive and modeled cleanup PIDs remain visible, and hard exit follows owner settlement even when native cleanup is unconfirmed.

[The C27 record](verification-c27-assets.json) preserves108 canonical fault observations over106 distinct mutant hashes,216 raw logs,205 distinct failing names counted per fault and277 raw RED occurrences (including repeated Bun summaries), with257 GREEN occurrences. All39 original and44 supplemental frozen inputs were restored. The inherited stdin oracle is bound to its committed/current/archive bytes. Narrow diagnostic/order, compound missing-pin/command fences and limited capture qualifications remain explicit. The superseded42-success/one-timeout epoch and16-observation supplement, including all86/32 relocated logs, are excluded from final proof totals. The repaired asynchronous cyclic-error oracle kills and awaits its exact isolated child; corrected admission fixtures prove successful valid preparation before observing mutant admission.

The final compiler-separated24-file regression passes611/0,1730 assertions in223.26s, including actual full-provider five-role construction and both newly built archive workflows. Fresh forced Burokrat/PUNI builds and41-path lint pass0. One hundred eleven adjacent Proof notes preserve identical whitespace-minified Bun output across the22-source inventory, including all16 changed proof paths, after formatting. Astra independently reconstructs the source/mutant/log identities and corrected actual-admission outcomes; no independent test rerun is implied. Linux/x64 and GNU tar evidence does not establish another platform.

Public package/install/default/bootstrap/CI cutover, complete client and operational Bun conversion, the remaining WBS entity hierarchy, exact-SHA host gate and rollout remain open. Parent package tasks and the whole goal remain active.

## Captured local PUNI package and strict current execution, 2026-11-10

C28 assembles a local puni0.3.0 package from one explicit committed capture and independently admitted stable installation. One sealed session produces the root, five toolkit roles and pure observation service; the root is a package program, not a sixth toolkit role. Fourteen reviewed Dash SQL/template reads embed regular captured fatal-UTF8 text with exact BOM/CRLF/Unicode. Stable virtual module paths preserve legitimate literal strings and CJS metadata without global emitted-text rewriting. Generated package metadata exposes only bin.puni and no install hooks. Capture, production, delivery/readback and metadata assembly share first cancellation, retained roots and original/aggregate failures.

The distinct strict PUNI0.3 schema1 reader joins descriptor digest, captured revision and release tag before current ordinary/lint/preparation admission. Historical0.2.1 serialization and readers stay unchanged. Both root preparations enter their existing owner before PATH/package input and exit only after owner settlement. The producer-only validator marker selects its actual installed artifact unless a snapshot manifest takes precedence; an unmarked bundle retains the source profile. Actual current root observe/enforce and normal/relocation preparation fixtures complete full semantic certification. The mechanically extracted trusted-policy fixture retains the original35 declaration bodies and test tail; no historical certificate bytes are rewritten.

Actual Bun pack/add installs outside removed source/output trees in spaced paths under poisoned candidate startup, with Bun and declared native utilities and no first-party Bash/Node runtime. Navigator, ordinary Burokrat, Dash storage and the separate pure observation entry execute. The actual stored canonical MCP helper executes through Bun Shell, stays within its10-second assertion and preserves header-only output and401/pasted-key redaction. Sixteen installed asset absence/substitution cases and restoration, native symlink-parent/caller-relative placement, real policy artifact identities and both produced standalone preparation roles are exercised.

[The C28 record](verification-c28-package.json) preserves85 canonical observations over85 distinct mutants and170 raw logs,112 failed names counted per fault and165 restored-pass occurrences. All three archives share43 frozen input hashes. The original80-fault plan stopped after68 qualified pairs when its two-closed-case PATH-owner selector survived RED0/GREEN0; that69th attempt remains immutable and excluded. A separately recorded12-fault continuation corrects reporter selection and completes the11 unexecuted faults; five policy faults complete85 canonical observations over86 attempts. Reporter selection is not an independent early-PATH lifetime proof. All six delivered-file readback REDs stop at the no-final-verifier assertion and therefore prove ordering. Malformed grammar, structural policy options/anchors, compound metadata mapping and limited capability capture retain their bounded interpretations. Five harness refusal controls are excluded from product totals. Astra independently reconstructs all172 logs, exact mutants and restoration identities; it reruns no product test or mutation.

The full frozen source-only regression passes2095/0,6380 assertions across36 files in520.19s, with no source drift. The final compiler-separated14-file regression passes344/0,1140 assertions in227.40s, with no source drift. Eighty-six adjacent Proof notes preserve identical whitespace-minified Bun output across the43-file inventory, including all13 annotated paths. Fresh forced Burokrat/PUNI roots and37-path lint pass0; final boundary/format/OpenSpec results are pinned in the linked record. Earlier generated-test selection, stale-profile/syntax/type fixtures, incomplete-audit and weak-selector attempts remain explicitly excluded or corrected in the record.

This proves local captured-package usability on Linux/x64 with pinned Bun and declared GNU tools. It does not establish clean-release provenance, root self-authentication, registry ownership, another platform or a host gate. Public build/pack/default/bootstrap/CI cutover, every delegated installed leaf, helper-specific fault closure, exhaustive client/operational Bun conversion, the WBS hierarchy and exact-SHA host gate/rollout remain open. Parent2.1 and the whole goal remain active.

## Current audit-push admission and caller boundaries, 2026-11-14

The current typed audit-push leaf is available through the composed Burokrat namespaces; the historical installed grammar/bin and defaults remain unchanged. A configured audit joins the physically selected root toolkit-release record to the already verified current installation, then uses committed required certification through the existing selected owner. Wholly absent configuration remains an explicit inactive response after preflight. Controlled fixture certificates are output peers, not semantic certification of arbitrary content or a newly released package.

The original provider34 attempt passed31 and failed3. Two selected/validator corruption attempts failed EACCES on their owned0444 fixture paths before the operation; the third already returned78 but expected an inner diagnostic that the public wrapper intentionally hides. These were fixture/oracle corrections, not product negatives or necessity credits. The corrected current provider38 original passes38/0 with174 assertions in5.26s, original0/null and scoped owner/FD settlement. Its selected-role witness observes actual snapshotter argv and validator stdin/CI binding; callback-return controls reach both stdout/stderr cancellation interpretations. Original raw/receipt: /tmp/puni-tool-wiki-audit-push-provider38-current-v2/.

At the unchanged pre-comment source940 epoch, current11-path ESLint exits0 with empty raw; forced configured PUNI/Burokrat TypeScript roots both exit0 with empty raw; Prettier check of11source paths plus tasks.md reports all matched. Original receipts/raw are /tmp/puni-tool-wiki-audit-push-lint11-current-v2/, /tmp/puni-tool-wiki-audit-push-types2-current-v2/ and /tmp/puni-tool-wiki-audit-push-format12-current-v2/. These are source-bound targeted checks before adjacent comments and this append, not a new full gate, installed build, host check or post-comment quality result.

### Thirteen bounded observed scopes

Each of the11 provider rows has three separately authorized original native phases0/1/0, signal null, primary null, empty cleanup failures and known scoped owner/FD settlement; each selected one provider case with37 filtered. Their faults used only reviewed canonical-file onLoad source with explicit ts contents, no resolver or test overlay. The two root rows separately completed0/1/0 with one selected root case and36 filtered; all three phases used the same reviewed argv-only test overlay to select a real child preload. Exact outer-test and child-production load records have distinct positive PIDs and matching child parent PID. Root read every original before each successor, and Astra independently audited saved evidence. Adjacent comments name only the scopes below.

| Row             | Actual single effect and first owning failure                                                                           | Limit                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1              | Remove archive containment; outside-archive release symlink test:531 expected78, received0                              | Candidate exclusion stayed; one physical predicate                                                                                                  |
| A2              | Remove candidate exclusion; enclosing-archive/candidate-release test:308 expected78, received0                          | Archive containment stayed                                                                                                                          |
| A3              | Remove regular-file refusal; real owned valid-record FIFO test:444 expected78, received0 after marker/PID prerequisites | Fault raw does not report exited-versus-cancelled feeder outcome; healthy143/ESRCH is not borrowed                                                  |
| A4              | Omit full Buffer equality; wrong-digest test:352 expected78, received0                                                  | One whole-record comparison, no independent tag/LF/UTF-8/trailing-record claims                                                                     |
| A5              | Remove modeled filesystem conversion; actual ENOENT from push-audit.ts:37 through facade:299 to owning test:277         | Missing configured-root conversion only; no expect count is reported for this fault, no unreadability equivalence                                   |
| A6              | Remove unexpected-cause rethrow; test:608 expected exact undefined, received TypeError from cause.message               | Undefined identity only, no thrown-output proof                                                                                                     |
| A7              | Change decisive inner required override true to false; test:639 expected78, received0 after caller required=false       | Outer required property is masked; no per-certificate-field claim                                                                                   |
| A8              | Remove selected-cancellation forwarding; test:664 expected prior SIGTERM143, received78                                 | Shared preflight guards unchanged                                                                                                                   |
| A9              | Change committed mode to working; test:123 initial expected0, received1                                                 | Later complete argv/stdin/binding assertions were unreached in fault; no semantic certificate or separate repository/revision proof                 |
| A10             | Ignore configured-refusal stderr returned cancellation; test:224 expected143, received78                                | Actual SIGTERM callback union; no independent SIGINT or thrown-output proof                                                                         |
| A11             | Ignore inactive stdout returned cancellation; test:204 expected143, received0                                           | Actual SIGTERM callback union; no absence-policy or independent SIGINT proof                                                                        |
| Root route      | Change only runInstalledPushAudit callee to runInstalledLint; test:489:57 child expected0, received1                    | Actual stderr is unexpected root diagnostic at main:72; wrong-lint wording is source excerpt only; dedicated forwarding, not native audit lifecycle |
| Root completion | Remove audit membership from requiresExit; test:490:53 typed exit became drain                                          | Child exit0, status37/calls1/completedtrue/full payload equal; classification only, not native terminal exit                                        |

Provider journals and all33 originals remain under /tmp/puni-tool-wiki-audit-push-policy-flights-v2/ and /tmp/puni-tool-wiki-audit-push-facade-flights-v2/, indexed by root-completed-wave1.json/root-completed-wave2.json and per-row root-adjudication.json. The six separate root originals and their exact outer/child load records are under /tmp/puni-tool-wiki-audit-push-root-flights-v1/, indexed by root-completed.json. Independent reviews are /tmp/puni-ten-completed-scopes-astra-v1.md (CLI rows only,7cb019cb), /tmp/puni-cli-facade-wave2-observed-astra-v1.md (a039ec22), and /tmp/puni-cli-root-six-observed-astra-v1.md (34050f4c). Failed provider fixtures are explicitly retained; scratch afterAll return does not erase them. Native helper receipts support scoped settlement; distinct child load identities are not global process/filesystem absence or a new child-owner guarantee.

Root-route/completion now has the two bounded actual-child outcomes above and matching adjacent comments. These complete the13 named scopes in this checkpoint only. No public/default/bootstrap/host switch, shell caller conversion, full installed-client/semantic-certificate claim, complete Bun conversion, canonical gate or whole CLI/entity goal closure follows. Historical Proofs/failures retain their original scope. All broader tasks and the whole goal remain open.

## Strict normal-lint required setting, 2026-11-14

Normal root lint forwards raw TOOL_WIKI_REQUIRE_CERTIFIED into the existing executable owner. It parses once before prerequisite IO: undefined, string "0" and Boolean false mean optional; string "1" and Boolean true mean required. Other raw strings, including empty, whitespace and "true", return 64 with the fixed nonsecret diagnostic <code>tool-wiki lint: TOOL_WIKI_REQUIRE_CERTIFIED must be 0 or 1</code>. Internal lint context stays Boolean. Audit-push still forces required true independently of an invalid raw setting; its historical proofs are unchanged. This is the strict current Bun contract, not compatibility with historical shell empty-value behavior.

### Six ordinary and quality originals

/tmp/puni-normal-lint-required-ordinary-root-adjudication-v1.json reconciles these six originals. Each exits 0, signal null, settled, with empty cleanup failures and known scoped owner/FD closure; Root read every complete original. The actual 99 and bbab epochs share identical production/root/audit bytes. Only two provider-test expectation/title edits distinguish bbab. The earlier provider 18-pass/2-fail oracle (required status 78 intentionally emits a fixed 75-byte diagnostic) and redundant-String lint failure remain preserved, not product negatives.

| Original   | Epoch | Observed outcome                                    | Original receipt/raw/validation prefix                                     |
| ---------- | ----- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| root25     | 99    | 25 pass, 259 assertions, 44.34s                     | /tmp/puni-normal-lint-required-dispatch-v1/checks/root25/native            |
| push38     | 99    | 38 pass, 174 assertions, 5.28s                      | /tmp/puni-normal-lint-required-dispatch-v1/checks/push38/native            |
| types2     | 99    | configured PUNI/Burokrat roots: 0, empty raw, 6.48s | /tmp/puni-normal-lint-required-dispatch-v1/checks/types2/native            |
| provider20 | bbab  | 20 pass, 79 assertions, 23.14s                      | /tmp/puni-normal-lint-required-oracle-dispatch-v2/checks/provider20/native |
| lint3      | bbab  | 0, empty raw, 3.51s                                 | /tmp/puni-normal-lint-required-oracle-dispatch-v2/checks/lint3/native      |
| format3    | bbab  | 0, all matched, 0.28s                               | /tmp/puni-normal-lint-required-oracle-dispatch-v2/checks/format3/native    |

Recorded argv, not replay instructions: cwd /home/df/.codex/worktrees/6ce4/puni-00. The three test commands were <code>/home/df/.bun/bin/bun test --preload &lt;that prefix's directory&gt;/fixture.preload.ts ./apps/twilight-structure/twilight-burokrat/cli/src/&lt;runtime-root.test.ts|push-audit.test.ts|runtime-lint-executable.test.ts&gt; --timeout=60000</code>; the matching receipt identifies its exact single file and preload. The test-process preload neutralizes Git config then imports unchanged tools/test/scratch/preload.ts. Existing root beforeAll fixture builds retain their 120000ms allowance; the outer limit is 240000ms. Protected helper 325e/environment e795 stay unchanged.

Types used <code>bun x --no-install tsc --build --force apps/puni/cli/tsconfig.json apps/twilight-structure/twilight-burokrat/cli/tsconfig.json</code>. Lint used <code>bun ./node_modules/eslint/bin/eslint.js</code> on execute-command.ts, runtime-facade.ts and runtime-lint-executable.test.ts; format used <code>bun ./node_modules/prettier/bin/prettier.cjs --check</code> on those same complete paths. Exact argv/cwd/deadlines and original hashes are retained in the six receipts and this append's evidence manifest. These are targeted pre-comment checks. The 99 types result is not relabeled as checking current bbab test bytes; no post-comment test, formatter, lint or type result is claimed.

### Five observed local necessity scopes

The 15 separately authorized originals complete five baseline/fault/restored sequences, each with exits 0/1/0 and one selected case. N1 filters 24; N2–N5 filter 19. Healthy assertion counts are 17, 4, 5, 5, 5; fault counts are 11, 1, 1, 1, 3. Root archived/read back each canonical production file, installed/read back its exact single-file variant, read each original before the next action, then manually restored source/mode and full 941-file bbab before the restored test. Existing root build and provider absolute-import paths stayed unchanged. No source/build/spawn/test overlay was used; no compiler-internal consumed-byte identity is claimed.

| Row | Single effect and actual first failure                                                                                                                  | Limit                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| N1  | Restore root ===1 coercion; runtime-root:546 expected 64, received 37 after actual valid-0/verdict-37 and stage-reset prerequisites                     | Raw forwarding only; later invalid output/diagnostic/marker assertions unreached                                    |
| N2  | Remove strict rejection throw; runtime-lint-executable:208 expected 64, received 1 with actual deliberately forbidden validator diagnostic              | One invalid "true" witness, not every spelling; later output/diagnostic/scratch assertions unreached                |
| N3  | Remove await from owned usage write; runtime-lint-executable:288 expected 130, received 64                                                              | Modeled SIGINT owner/sink await/order only; later observations unreached                                            |
| N4  | Omit returned cancellation mapping, retaining await; same test:288 expected 130, received 64                                                            | Returned modeled SIGINT mapping only; no independent SIGTERM necessity                                              |
| N5  | Remove unexpected-cause filter; test:347 expected exact "tool-wiki lint: undefined", received "undefined is not an object (evaluating 'cause.message')" | Status 1 and empty stdout already passed; later getter-count/scratch assertions unreached; no shared-reporter proof |

Each /tmp/puni-normal-lint-required-physical-necessity-v1/N1 through N5 directory retains plan.json with the full selected title/literal command, baseline/native, fault/native and canonical/native receipt/log/validation, root-adjudication.json and source-custody journals. Every native phase used <code>bun test --preload &lt;row&gt;/&lt;phase&gt;/fixture.preload.ts ./&lt;owning file&gt; --test-name-pattern &lt;escaped exact title&gt; --timeout=60000</code>, cwd and outer limit above. Apply/restore receipts and restore.verified.json bind actual archive/variant hashes, modes, predecessor originals and full-941 restoration.

These five boundaries justify five adjacent comments only. Modeled process.emit(SIGINT) and controlled sink cancellation establish neither OS delivery nor native flushing/generic owner lifetime. SIGTERM remains ordinary coverage. Post-call empty scratch and afterAll return do not prove never-created paths or global cleanup; installed executing-launcher/selected-validator markers do not prove archive-launcher execution. No per-conjunct/all-value, shared reporter, global process absence, package/release/bootstrap/default change, complete client Bun conversion, host gate or whole-goal closure follows. Historical Proofs, failures and broader open tasks retain their scope.

## Fresh representative installed-package observation, 2026-11-14

Root reran the existing captured-package integration case on CLI source941 `f03ee2a1837f10d20ce59e72153d17ecb4bc2008800032dca7af0619bacac049`. The actual original passed: 1 pass, 0 fail, 3 filtered, 158 printed expects, 59.78 seconds. It used Bun1.4.4; Root separately reported Git2.43.0 preflight. This is fresh representative installed-artifact evidence, distinct from the historical C28 source epoch. The exact command, from `/home/df/.codex/worktrees/6ce4/puni-00`, was:

```text
/home/df/.bun/bin/bun test --preload ./tools/test/scratch/preload.ts ./apps/puni/cli/src/packaging/build.test.ts --test-name-pattern '^packs and installs the captured PUNI package outside its checkout with protected startup and all three providers$' --timeout=180000
```

The existing selected case budget was 180000 ms, with a 240000-ms outer native deadline. Local pack/add children had 60000-ms limits, ordinary installed invocations 20000 ms, and MCP/token children 10000 ms; the stored helper also asserted elapsed time below 10000 ms. The scratch preload retained its separate 60000-ms cleanup-hook allowance. These are the actual finite bounds, not startup-latency or cross-platform measurements.

The case built the captured seven-program PUNI package against the admitted existing installation, locally packed and added its dependency-free tarball with install scripts disabled, and installed under paths containing spaces. It removed its private captured checkout and package output before installed execution. The original operator workspace/installation remained present and later supplied a Navigator fixture input, so this does not establish that every source workspace was inaccessible. Installed commands used only Bun and Git on PATH, under poisoned candidate preload/config/environment with the startup sentinel absent at the asserted checkpoints.

Executed representatives included Navigator planning files, Burokrat template output, Dash private mutex/pool/bootstrap state, and the actual stored canonical MCP helper. The helper controls covered header-only success,401/pasted-key redaction and its existing time bound. The case exercised eight required asset paths with absence and tampering separately, restored their exact bytes/modes, then executed the restored template operation. The separate observation entry refused missing service configuration with 64. All three Burokrat aliases exercised inactive audit-push; a configured absent archive returned 78 despite an invalid caller-required setting. These controls do not establish configured successful semantic audit certification or every advertised/generated operation.

[Original transcript](/tmp/puni-cli-installed-current-run-v1/native.log) SHA-256 `af2d2f310e334ac8565981dc3c89a2b2e3982b4bfaf0edf90e48b3c29bd91248`; [original receipt](/tmp/puni-cli-installed-current-run-v1/native.receipt.json) SHA-256 `534f5e6e3460050653d3cdb44d86e4ada34a98146425154deb7dd0c64089f7ad`; [validation](/tmp/puni-cli-installed-current-run-v1/native.validation.json) SHA-256 `91550c1ad723a489f4d18059fc6268a184874644d2e9f974e16ef73972a30fd0`; [Root adjudication](/tmp/puni-cli-installed-current-run-v1/root-adjudication.json) SHA-256 `75ac7bdbc0d7247b0eca01c787f37638bc9b41c8a3875d101db110000fc341a7`. Root read the entire selected case and original stream, and verified CLI 941, contemporaneous WBS 468 `b1929bda` and static 371 unchanged. Native custody settled with its owner stopped/reaped, descriptor closed, primary null and cleanup empty. Scratch's printed return means the hook returned; it is not a generic cleanup-success certificate or global process-absence proof.

No new production implementation, fault necessity, public registry ownership, clean-release authority, current default/CI/bootstrap cutover, real host pool/activation, C35/denied-lease execution or full gate is credited. Exhaustive installed client/delegated operations, remaining helpers and operational conversion stay owed. Parent 2.1 and the other open tasks remain unchecked; this result does not complete the whole goal.

## Bun/PUNI repository caller checkpoint — 2026-11-15

The isolated CLI worktree received the eleven-file caller cutover after checks in a coherent full-layout private tree. Nx working lint and the staged Lefthook route invoke the protected Bun adapter, which selects the explicitly provisioned delivered PUNI main through `PUNI_EXECUTABLE`. The existing callable/completion validation and exit/drain contract remain. Native diagnostic writer factories are captured before selected module loading; executable failures make one bounded diagnostic attempt and terminate. Dynamic invocation uses `Reflect.apply` with the original receiver/arguments and an unknown result until completion validation.

Final configured checks: formatting11 passed; all three lint reports had zero errors/warnings/fatals/messages; normal PUNI and Burokrat type roots passed with the adapter included in PUNI spec coverage. Both entrypoint policy cases passed (56 filtered, 80 expects). The complete runtime file passed39/0/332 expects in47.08s, covering aliases, installed-main bytes/completion, Nx dispatch, admission refusals, context retention, retained timers, missing/unreadable selection and diagnostic replacement. The policy cases are not a host gate.

Commands below normalize only the recorded `/home/df/.bun/bin/bun` executable to `bun`. Their recorded cwd was `/tmp/puni-cli-caller-quality-v6-prep-v1/tree`, containing the exact tested candidates; the commands use the repository layout without test-location substitutions.

```sh
bun ./node_modules/nx/dist/bin/nx.js graph --file=/tmp/puni-cli-caller-quality-v6-checks-v1/graph/project-graph.json --open=false --watch=false
```

```sh
bun ./node_modules/prettier/bin/prettier.cjs --check bin/tool-wiki-lint.ts apps/twilight-structure/twilight-burokrat/cli/project.json lefthook.yml docs/runbook-tool-wiki-activation.md apps/puni/cli/README.md openspec/changes/puni-cli/specs/puni-cli/spec.md openspec/changes/puni-cli/tasks.md apps/twilight-structure/twilight-burokrat/cli/src/runtime-root.test.ts apps/twilight-structure/twilight-burokrat/cli/src/policy/gate-entrypoints.test.ts bin/tsconfig.json apps/puni/cli/tsconfig.spec.json
```

```sh
bun ./node_modules/eslint/bin/eslint.js --no-cache --max-warnings=0 --format=json bin/tool-wiki-lint.ts apps/twilight-structure/twilight-burokrat/cli/src/runtime-root.test.ts apps/twilight-structure/twilight-burokrat/cli/src/policy/gate-entrypoints.test.ts
```

```sh
bun './node_modules/@typescript/native/bin/tsc' --build --force apps/puni/cli/tsconfig.json apps/twilight-structure/twilight-burokrat/cli/tsconfig.json
```

```sh
bun test apps/twilight-structure/twilight-burokrat/cli/src/policy/gate-entrypoints.test.ts --test-name-pattern 'Nx, host gate, CI and lefthook select the whole tree without caching|trusted-wiki CI admission is paused while the local hook remains' --timeout=60000
```

```sh
bun test apps/twilight-structure/twilight-burokrat/cli/src/runtime-root.test.ts --timeout=60000
```

Original output SHA256 values, in command order: `ccffa45f523f3742f7ca3974989839856a9f5c89edaaf288f878e38da87e7af2` (147B), `17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20` (66B), `03f40e2013d542b4f2a9e544ef08aa06ce24ab221e8df3ed1f8a3308a9725471` (840B), `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (0B), `7d9977cfdced04e39c343726dff0c85513549c9d772ac3589f57ff1c673d43e6` (454B), `216470636d6f8c2955921bc9a591ed56f957c6e6ebf15523383a93c139cf91f8` (4218B). Every native receipt settled/reaped/closed without primary/cleanup failure, and current942/587/371 source/support/evidence checks matched.

The actual local publication wrote11 files and validated the resulting CLI950 roster (`8eaffc1b`); WBS587 and371 supports stayed unchanged. No new Git staging, commit or push occurred. Default installation/provisioning, the remaining client-surface census and Bun conversions, remaining guard-omission proofs, combined host gates and release/activation remain open. The three denied activation leases were not touched.

## Packed installed main and repository caller join — 2026-11-15

The existing package integration owner now also exercises the explicit delivered-main contract and the actual Nx working caller against the same locally packed and Bun-installed PUNI artifact. The fresh observation passed **1 case, 0 failures, 3 filtered, 184 expects** in 61.68s. The original captured checkout and package output had been removed before these calls. The operator workspace remained available for the real repository adapter/config and a later Navigator fixture input; this is not complete source-workspace inaccessibility.

Recorded cwd was `/home/df/.codex/worktrees/6ce4/puni-00`; the exact command was:

```sh
/home/df/.bun/bin/bun test --preload /tmp/puni-cli-installed-caller-join-dispatch-v1/git-neutral-preload.ts ./apps/puni/cli/src/packaging/build.test.ts --test-name-pattern '^packs and installs the captured PUNI package outside its checkout with protected startup and all three providers$' --timeout=180000
```

The preload imports the unchanged scratch hook and selects null global/system Git configuration with NOSYSTEM1. The existing selected case retains its 180-second allowance; the protected native owner had 240 seconds. Each of the three added calls has a 12-second child bound. No new build/install session was added: the case reuses its original capture, producer, local tarball and external spaced installation.

A protected child imported the actual installed `dist/puni.mjs` under misleading ambient `--version`, explicitly invoked `bur lint working . HEAD`, and returned only the exact optional-inactive JSON with `{kind:'exit',status:0}`. This establishes the observed import/call output contract, not arbitrary absence of lazy module effects. The actual configured Nx command then selected that same absolute entrypoint through `PUNI_EXECUTABLE`. With only Bun/Git on PATH and poisoned candidate startup, optional unconfigured lint returned the same exact inactive report; required missing activation returned 78, empty stdout and `tool-wiki lint: required admission has no external activation root` plus LF. The startup sentinel stayed absent at asserted checkpoints. Scratch-empty checks are post-call state; no independent stdin-consumption, native-flush or global-cleanup proof follows.

[Original output](/tmp/puni-cli-installed-caller-join-run-v1/native.log) SHA256 `485b2a86e70621fd82d0af2c435910d4a3ca33ce4326c122dcdb6f6a768c5e99`; [receipt](/tmp/puni-cli-installed-caller-join-run-v1/native.receipt.json) `7d88f6bea3e45509a66b0dd5d8dca85bfbe5e04b4999dd3048384c6da0ecc778`. The [validation](/tmp/puni-cli-installed-caller-join-run-v1/native.validation.json) binds original request, receipt, publication and unchanged CLI 950 `d956e8f4`, WBS 602 `f91ecd59` and static 371. Native custody was normal 0, observed/reaped/closed, primary null and cleanup empty. This is coverage that passed initially, not an invented feature RED or new guard-removal proof. Fresh test-only quality is recorded separately when observed.

Configured snapshot/validator semantic success, exhaustive installed operations, exact provisioning/public pin, coordinated Bun bootstrap/default/CI migration, native import-time cancellation and complete gates remain owed. No production change, historical archive rewrite, denied-lease use or parent task completion is credited.

## Explicit local PUNI installation: ordinary verification (2026-11-17)

PUNI now composes `dash install-puni ARCHIVE --sha256 SHA256 --destination DIRECTORY` (alias `d`) as a root-owned typed operation. It provisions a separate fresh external client; legacy standalone Dash help/runtime are unchanged. Standard external Bun package installation remains the cold-start path. An operator-supplied expected digest binds retained archive bytes to that supplied authority, not independently to a public release identity.

First observations remain separate: grammar3 failed 0/3 with 77 filtered and 7 assertions because canonical/alias parsing and composed help lacked the leaf, after standalone Dash help passed. The real packed owner failed 0/1 with 3 filtered and 94 assertions at new-command status1 versus0, after actual tar/hash/control-installation/version/caller prerequisites; later selection/digest/reuse tails were unreached. The exact import-allowance owner failed 0/1 with 48 filtered and 1 assertion at empty allowance versus the single packaging facade. These establish feature/policy absence, not guard-removal necessity. The three original logs are respectively `6b776683016a484aacc5df8c8baf7690915d5c479986fab3fd9260001dc1b7cd`, `4ee7e9687468fe5a176d472e0faefa352ae9f3e9c6f1d9a543fb88a47ad1d7f2` and `469ad36a42e302b557c1eb62b39cd9f5d0a13f97448cab4c55416348a05fc4c0`.

The unformatted implementation epoch, CLI956 `ad0945c90398886c0db779e711068c500df593ea85a379c4dba84ca5f7f6ebca`, first passed grammar80/0/203, normal PUNI types and the real packed case1/0/3filtered/220 (90.69 s; packed raw `912ecca2cc306e10ecc11130176a66ae508e18c795b9962efe5d9e088f7116ad`). Configured formatting produced the separate `6eb3470abd7d23332660c829a55fdfc5477ced2a9d87d04e9f9f4eab102e50a5` epoch with a recorded twelve-input Bun-emission comparison. Subsequent actual lint found four errors in three files; the digest predicate spelling, unused import and export ordering were repaired before fresh checks. The failed original is retained. Neither the first positive nor the formatting measurement substitutes for the final observations below.

Final source is CLI956 `/tmp/puni-cli-local-install-lint-fixed-live-v1/next-source-pins.json`, SHA `a5d9832757a46fbc8bf107c614d28c35bf19f07b72293a6e2744628f7153a333`. All seven commands ran from `/home/df/.codex/worktrees/6ce4/puni-00`:

```sh
/home/df/.bun/bin/bun node_modules/eslint/bin/eslint.js --no-cache --max-warnings 0 --format json apps/puni/cli/src/packaging/install.ts apps/puni/cli/src/packaging/archive.ts apps/twilight-structure/twilight-burokrat/cli/src/packaging/install-support.ts apps/twilight-structure/twilight-dash/cli/src/grammar-facade.ts apps/twilight-structure/twilight-burokrat/cli/src/packaging-facade.ts apps/twilight-structure/twilight-burokrat/cli/src/lint-child.ts apps/puni/cli/src/execute-command.ts apps/puni/cli/src/entrypoint.ts apps/puni/eslint.product.mjs apps/puni/cli/src/cli-parser.test.ts apps/puni/cli/src/packaging/build.test.ts tools/tool-devsync/src/puni-boundaries.test.ts
/home/df/.bun/bin/bun node_modules/prettier/bin/prettier.cjs --check apps/puni/cli/src/packaging/install.ts apps/puni/cli/src/packaging/archive.ts apps/twilight-structure/twilight-burokrat/cli/src/packaging/install-support.ts apps/twilight-structure/twilight-dash/cli/src/grammar-facade.ts apps/twilight-structure/twilight-burokrat/cli/src/packaging-facade.ts apps/twilight-structure/twilight-burokrat/cli/src/lint-child.ts apps/puni/cli/src/execute-command.ts apps/puni/cli/src/entrypoint.ts apps/puni/eslint.product.mjs openspec/changes/puni-cli/specs/puni-cli/spec.md apps/puni/cli/src/cli-parser.test.ts apps/puni/cli/src/packaging/build.test.ts tools/tool-devsync/src/puni-boundaries.test.ts
/home/df/.bun/bin/bun test ./tools/tool-devsync/src/puni-boundaries.test.ts --timeout=30000
/home/df/.bun/bin/bun node_modules/@fission-ai/openspec/bin/openspec.js validate puni-cli --json
/home/df/.bun/bin/bun node_modules/@typescript/native/bin/tsc --build --force apps/puni/cli/tsconfig.json
/home/df/.bun/bin/bun test ./apps/puni/cli/src/cli-parser.test.ts --timeout=30000
/home/df/.bun/bin/bun test --preload /tmp/puni-cli-installed-caller-join-dispatch-v1/git-neutral-preload.ts ./apps/puni/cli/src/packaging/build.test.ts --test-name-pattern '^packs and installs the captured PUNI package outside its checkout with protected startup and all three providers$' --timeout=180000
```

| Phase     | Actual result                                         | Outer budget (ms) | Raw SHA-256                                                        |
| --------- | ----------------------------------------------------- | ----------------- | ------------------------------------------------------------------ |
| lint      | 12 files; 0 errors/warnings, JSON                     | 180000            | `a7b305068135975a833ae8fcf742a99b6f381f221335dc3b2bc723194e69f764` |
| format    | 13 files matched                                      | 60000             | `17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20` |
| boundary  | 49 pass / 0 fail; 143 assertions; 11.77 s             | 180000            | `2892adbde31853db25d091c977d8e4c7027fa39c5c1ed5427d13e12306657bdc` |
| spec      | valid; 0 errors, 9 long-requirement warnings          | 60000             | `0b975632a6fee36b0a44b4d130a64ddc7b620e74ff3afae60aab2530ad96d0fd` |
| types     | normal PUNI build; empty output                       | 180000            | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| grammar   | 80 pass / 0 fail; 203 assertions; 1.151 s             | 60000             | `5b7aa769726bd101388b0f73830a95519c53c94f145776498ce1ca356801bc5f` |
| installed | 1 pass / 0 fail / 3 filtered; 220 assertions; 79.17 s | 240000            | `94344985a6fe81a02594cd983644f970d5e06b2b519c237143e0cd7b56412ea7` |

Each original is under `/tmp/puni-cli-local-install-final-v3/<phase>/native.{log,receipt.json,validation.json}`. Exact full argv, receipt/validation hashes and historical originals are pinned in `/tmp/puni-cli-local-install-records-v2/evidence.json`. Every final receipt reports normal0, original observed, stopped/reaped owner, closed transcript descriptor, primary null and no cleanup failures. Every validation matched CLI956, WBS602 and static371. OpenSpec's nine warnings are requirement-length warnings; its prior archive-omission warning is absent. The exact installer facade allowance and forbidden-neighbor/private-import cases are included in boundary49.

The packed owner accepted the actual producer tar/metadata using its Bun/Git-only PATH. It reached one-LF closed JSON selection, native absolute contained entrypoint spelling, delivered-main byte equality, unchanged source archive digest, the provisioned Nx caller's optional-unconfigured output, wrong-SHA alias refusal78 without creating a destination, and occupied-destination refusal78 with preserved main bytes. Existing provider/startup prerequisites also passed. The fixture's reported scratch cleanup return does not prove generic cleanup.

The accompanying entrypoint JSDoc only names local installation among the already implemented terminal purposes. Root separately measured that comment-only candidate with Bun1.4.4 Transpiler (target Bun, whitespace minification): before/after emission was byte-identical, SHA `66b5a3d0dc0aebb19175bfc18d8356132b373044b3d2e734e720dcb81fac6902` (1748 bytes), and configured Prettier already matched. The pinned observation is `/tmp/puni-cli-local-install-terminal-jsdoc-v1/root-emission.json`; the seven original final checks remain at the pre-doc a5d epoch. Reusable `main` returns Completion and does not exit; executable termination follows existing owner settlement. No new guard Proof comment is claimed here.

Task 3.1c and the full new safety-negative work remain open. Ordinary acceptance/refusals do not prove necessity of archive parsing, descriptor identity, retained-copy forwarding, protected placement, installed verification, cancellation, output or failure release checks. `/tmp/puni-cli-local-install-owning-negative-plan-v1/index.json` is a proposed, unrun grouping requiring rebase to final sources before test/fault bindings. Configured certified lint, all client operations, authenticated public provenance/exact public pin, normal default provisioning, CI activation, C35, and full gates remain owed; no parent checkbox or full-goal completion follows.

## Local archive uniqueness: one observed guard proof (2026-11-17)

The initial shared owning case passed1/0/73filtered/60assertions. The selectable successor's actual group passed7/0/73filtered/130assertions in9.06s, raw `a7f8ac56b0060c2071ae3e519af6980a7f8838ecd41ace7be542b86d9a11d5b9`. That group is the before-control, not a fabricated selected single-case run. Canonical CLI956 was `7c228b4565e9543df6619d4be28bb775e102fd8eced67c07574391332ccbfcfc`; WBS602 and static371 were unchanged.

The physical private source fault changed only the whole `raw.has(original) || effective.has(selected)` predicate to `false`. The unchanged test's relative core/facade URLs resolved inside its private source layout; no test/import overlay or canonical mutation supplied the fault. Two duplicate ordinary.txt members leave metadata/main counters exactly1, exposing uniqueness without their masking. This grants no independent necessity to each OR arm.

The first default-sandbox fault run failed its healthy prerequisite,0/1/79filtered/5assertions, raw `9b0aebfa0146dbc8cba11abfe8bd9413cb39bc6f86f6034c51cfe10f9f4715c7`. A separate correct-code diagnostic also failed that prerequisite, raw `1024caa23f83f716205fbc5457cf6dc59fbb4acfa25f2a84dae30830e8e20cf6`. Its retained observation captured real Bun-add status0 followed by probe status1 and `EPERM` on `process.stdout.write`; outer stderr was blank. Root separately reproduced default-versus-escalated nested-pipe behavior with tool permission as the only change. Both originals remain permission-affected prerequisite failures without R5 credit. Production IO/owners were not altered as a workaround.

Root manually launched three fresh phases with `require_escalated` at the tool boundary. The exact executable was `/home/df/.bun/bin/bun`; every command used `test ./apps/twilight-structure/twilight-burokrat/cli/src/packaging/installed-current.test.ts --test-name-pattern SELECTOR --timeout=60000`, outer180000ms. Correct-private control selected `^owns local PUNI installation archive admission: healthy$` from `/tmp/puni-cli-local-install-permission-flight-v1/correct-tree`; fault selected `^owns local PUNI installation archive admission: duplicate-ordinary$` from `/tmp/puni-cli-local-install-unique-flight-v2/tree`; the same duplicate selector then ran from the unmodified canonical CLI worktree. Complete argv and every original receipt/validation hash are pinned in `/tmp/puni-cli-local-install-unique-observed-v1/evidence.json`.

| Observation                      | Actual counts                       | Raw SHA-256                                                        |
| -------------------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| Correct-private healthy control  | 1pass/0fail/79filtered/10assertions | `05c21fe17d5d10f3abcd85af07dd1e1307778f69ffc0936f11049218f86411c6` |
| Private whole-predicate fault    | 0pass/1fail/79filtered/15assertions | `919fd4ab4af09113a237f85d5918553a1a712064f711a41c13226a058428afbb` |
| Correct canonical selected after | 1pass/0fail/79filtered/20assertions | `5e16acca8c4106f94d23a79d326457f73b51aae47f28b3f80be13cc6e24b2f0e` |

The fault first failed at test line960: destination absence expectedfalse, receivedtrue, after the real healthy install/probe, decoded metadata/main from the malformed archive, and ready/signal prerequisites. Later call-marker/status/diagnostic/archive-preservation assertions were unreached and receive no credit. The bad-input child boundary is marker-and-throw dependency emulation, not actual hostile Bun-consumer behavior; the healthy stage delegates actual Bun installation/probing.

All three phase receipts recorded the expected numeric0/1/0, normal settlement, stopped/reaped owner, closed transcript descriptor, primarynull and empty cleanup failures. Canonical956/602/371 plus private/origin pins matched before/after. This is group-before/private-fault/canonical-after evidence, not a same-tree selected triple or restoration of faulted canonical code.

Two `expect<Uint8Array>` annotations separately repair the observed TS2769 matcher inference without changing operands. Root measured their Bun1.4.4 emission equal: `279b0cdc0a74676687394f88bc1384ba971fb78fd3354239605b692bcabb255e`,38407bytes; the original bridge is pinned in this packet. Equality is not a fresh typecheck. Parent task3.1c, other new installer safety guards and the remaining retention/metadata/placement/cancellation/output failure controls remain open. No public release provenance/pin, default activation, CI or full-gate completion is claimed.

### Final ordinary checks after the uniqueness proof

On CLI956 `c255b84a262084f3322be1c5d5b9999d84761d941df2b70104b7d841fa3c32d7`, Root ran the normal Burokrat `tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json`, strict ESLint on archive.ts and installed-current.test.ts, configured Prettier on those files and this verify record, and the seven anchored installation-owning cases. All four exited0 with settled/reaped owners, closed descriptors and unchanged956/602/371 inputs. Exact commands, originals and receipt/validation pins are in `/tmp/puni-cli-local-install-final-record-v4/checks.json`.

The first lint run on the preceding source reported one unsafe return at the JSON-call-marker parser. Annotating its return `unknown` repaired it without changing assertions; Root measured equal default Bun emission `37b1e646b9e8eb1c7cc2d322a9729e96a9b3b10339eafee4be97dbbd68c60c91` (38,737bytes). The earlier two matcher type annotations were likewise erased; subsequent formatting retained exactly equal whitespace-minified output.

| Check  | Actual result                                      | Raw SHA-256                                                        |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------ |
| types  | normal lib/spec build, empty output                | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| lint   | 2 files, zero errors and warnings                  | `1a9538a63eb752d05ee491181d83cdc4abd92013715603293fe01f83f70e7d88` |
| format | 3 files, all formatted                             | `17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20` |
| owning | 7 pass, 0 fail, 73 filtered, 130 assertions, 8.95s | `1ad23e774566592ab92e8ca0c28c2b3ab1d4a20036e5973012bc230e45631aeb` |

This final appendix changes only verification prose; runtime/test source is the checked cohort above. Full installer R5, parent3.1c, release/default integration and the full entity/Bun goal remain open.

## Development-port root first RED — 2026-11-18

Root ran the reviewed four tests before any dev-port implementation. `/tmp/puni-cli-dev-ports-first-live-v1/red/native.log` SHA `8338b614488fa0ccf8ea5b33eac36575957bccb849dd2f17e3a6cd3705d552b1` records0pass/4fail/37filtered/14expects in53ms: both resolve cases reached completion status1 versus0, and both occupied-port cases received usage instead of the required busy diagnostic after their real HTTP listener prerequisite. Later listener-survival/output tails were unreached. Native custody was normally settled/reaped/closed; this is missing-operation feature evidence, not a removed-guard proof. Current959 test-only cohort `69f06fe1…` precedes implementation. No release, caller, installed, default or whole-scope success follows; all next controls remain open.

### Development-port owning-test fixture correction and clean old-root feature RED

The first seven-control run `/tmp/puni-cli-dev-ports-owning-live-v1/red/native.log` (`4dd411bb…`) printed0/7/26 but also six incorrect cleanup signal/numeric comparisons. It is not clean seven-case feature-absence evidence. Root's independent Bun1.4.4 child probes observed async normal callback{code:0,signal:null}/exited0 and SIGKILL callback{code:null,signal:"SIGKILL"}/exited137; installed bun-types incorrectly declared numeric callback signals. Test V5 retains raw callback signal until all native/numeric/streams join, then validates an OS signal name and compares128+constants.signals[name]. All prior status/unknown-native checks remain. Sync spawnSync's normal signalCode:undefined is a distinct contract and its production inspector is unchanged.

After applying only that test correction, `/tmp/puni-cli-dev-ports-owning-signal-live-v1/red/native.log` SHA `48717ed984886a859414d7d8f1ec479d2be40581da5814d04db71e519250939a` records0pass/7fail/26expects in344ms. Each first failure is the intended missing-root-command status/diagnostic; no extra native/cleanup guard failure occurred. The old root still lacked dev-ports. Later TERM/cwd/release, inspector readiness/bounds and unreadable/no-probe assertions remain uncredited by those feature failures. Actual GREEN and individual finite faults are separate required observations. Root owns assessment of the six earlier retained fixture directories; no cleanup is inferred from this source correction.

## Development-port ordinary observations — 2026-11-18

At runtime cohort963 `4ed5dd59…`, actual root API resolve/check selections passed4/0,37filtered,24expects (raw5cf3797a073934cb5d8c4dfb45f41ff8949473437c32686c1b73fbc31738bb38); actual owning controls passed7/0/48 in16.51s (rawd570cd684cd77afb22f81e32a9239366f70e04ed5eba17028fa7418da33eb919). Their exact argv/cwd/receipts/validations are retained at `/tmp/puni-cli-dev-ports-runtime-live-v1/{ordinary,owning}/native.*`. This covers the declared source main API and real own/foreign/TERM/KILL/missing-tool/frontend-unreadable controls plus two explicitly emulated inspection dependencies; it does not establish installed delivery, generation-safe PID authority, guard-omission necessity, all probe absence or caller/default/CI cutover.

The broader two-file root/discovery run had241pass/1fail/956expects: the sole strict expected-list failure omitted dev-ports and the already-live install-puni. Its observed raw is `/tmp/puni-cli-dev-ports-runtime-live-v1/full/native.log`; the amended expected set retains strict equality and all help/completion/unknown-option loops. A fresh passing run is still required. The unreadable owner now checks its independently observed frontend accept count before status/diagnostic, preserving all assertions; its fresh baseline and finite fault remain required. No parent task is closed here.

### Actual package-owned development-port Bash RED — 2026-11-18

The independent Bun1.4.4 launcher probe first found that default bun run itself selected Bash: the harmless Bun-only package script returned73 and reached the sentinel with -c; explicit run --shell=bun returned0 with exact BUN-ONLY-PROBE+LF and no marker. No owned-operation conclusion belongs to that default-launcher behavior.

Corrected caller tests explicitly selected --shell=bun and independently passed a harmless Bun-only package under identical PATH/environment before invoking the actual repository aliases. `/tmp/puni-cli-dev-ports-caller-red-live-v1/callers/native.log` then recorded0pass/2fail/28expects in252ms: both first owned-caller assertions saw Bash markertrue instead of false after the independent launcher prerequisites. Present-empty WBS_DEV_PORTS selected no port targets; this does not exercise nonempty release, full dev-start, installed/default provisioning or a new guard omission. Root authorized the narrow package projection after those real failures. Adapter ordinary/ABI/failure results and new finite negatives remain pending; old lint proofs are not reused.

### Embedded development ports and Bun package callers — actual observations 2026-11-18

AtCLI964d9db the root/discovery owners passed242 tests/956 assertions, real listener/process owners7/48, strict lint7TS, formatting12 and normal PUNI/Dash types; OpenSpec validation passed343 items. The D07 permission-denied file owner passed1/5, failed0/1/3 after only its read-error throw was replaced by continue, then passed1/5 after exact source restoration. Its first fault assertion saw frontend accepts2 instead of1; later status/diagnostic assertions were unreached. Before/fault/after outer bounds were180s/60s/60s with the same selected argv. The adjacent Proof makes only this no-subsequent-probe claim.

After the reviewed Bun adapter/package projection, both real package callers passed2 tests/34 assertions and the controlled selected-module ABI/failure suite passed12/49 atpreformatCLI967684471. Normal PUNI/Dash and standalone bin types passed atformattedCLI9670f4017. A sole unreachable optional test-helper condition was repaired without changing direct absent/relative-selection cases; fresh final quality remains required. [Durable observations](verification-dev-ports-20261118.json) preserve raw D07 originals and source/check descriptors. No adapter omission, installed/default certificate, full development-start conversion, remaining shell retirement or parent-task completion is claimed.

### Observed repository dev-port adapter effects — 2026-11-18

Seven individual selected before/fault/after sequences onCLI968f0c08 passed/failed/passed, with exact adapterf837 restoration and968/602/371 source rosters matched after each. A01 fault reached innerSIGKILL at its first signal assertion (no ready witness). A02/A03 actual ready witnesses passed before innerSIGKILL at the signal assertion; these are two boundaries for one failure-terminal effect. A04/A05 reached ready, normal status1 and then failed combined output equality: native stderr was empty and the replacement writer recorded the diagnostic; only stderr retention is independently proved. A06 whole completion-condition omission admitted drain/status256 and actually exited0 instead of1; later combined output was unreached. A07 changed the main7 diagnostic while downstream invocation still refused. A06/A07 were native-only typed mutants. All outer originals settled/reaped/closed normally; no outer signal or unresolved cleanup was substituted for an inner fixture deadline. The [durable record](verification-dev-ports-20261118.json) includes all21 originals and qualified limits. Adjacent Proofs preserve these five effect scopes; other guards, default/installed delivery and full dev-start remain open.

## Full development purpose: first source-root feature RED

On current CLI96973afa50a, Root ran `/home/df/.bun/bin/bun test apps/puni/cli/src/development/start.test.ts --timeout=20000` in the isolated CLI worktree, with outer180000ms. `/tmp/puni-cli-full-dev-first-live-v1/start/native.log` SHA256 `4ddd963411fa311d1552e39c61745b672b183cce121fb32b39f4ae9e1e644b93` records0pass/5fail/56expects in423ms. All five real-Bun/native status/bytes/PID/append-only one-launch/reset prerequisites passed. Default dash/d and local-solver first failed status1 versus0, capture first failed1 versus3, and the busy-listener owner first failed its tier/port diagnostic because old grammar refused. Later production child/counter/stream/capture/survival tails were unreached; no new guard necessity follows.

The original native receipt reports normal exit1, stopped-and-reaped owner, closed descriptor, primarynull and cleanup[]. Source/support readbacks remain in its actual validation and source epoch. This is the first missing-operation evidence; later grammar/ordinary/quality or physical fault outcomes require separate actual records. Shared native-channel capability, signals/IO-failure/drains, real Nx graph, installed/client/container cutover, default provisioning and parent completion remain open. No new Proof or checkbox is recorded here.

## Full development source implementation and lifecycle corrections — 2026-11-18

The embedded typed `puni dash|d dev --repository DIRECTORY [--local-solver]` now owns required root preflight and one local Bun/Nx foreground operation, with optional physical merged capture. The default owned parent intentionally differs from legacy Bash exec PID identity; unified usage status1 differs from the legacy script status2. Reusable main returns its completion and never exits or replaces its caller.

On formatted CLI974 `1184cecc…`, actual source-main ordinary tests passed5/85 and the two lifecycle owners passed2/14. The earlier ordinary4/1 exposed an EBADF double-close; an independent Linux read-FD observation showed that stream destruction physically closes even autoClose:false. The repair gives the read FD solely to the stream. Both later defect owners first failed: delivery retained the exact Error/attempt/rejection but waited13004ms instead of less than8000; the pending capture callback crossed expiry and exact owned FD reuse, then wrote LATE-CAPTURE+LF to the reused file. Timers now arm before delivery and the whole post-await closed/primary fence prevents that write. The unchanged owners pass with their original bounds. These are the stated dependency-fault scopes, not proof of every signal or cleanup interleaving.

Fresh strict lint passed16 TypeScript files with0 errors/0 warnings; normal PUNI/Dash build types returned0 with empty output; formatting/check passed28 selected files. Real installed Nx graph commands resolved all four namespaced continuous tiers for both serve and serve-local-solver, plus the MCP prepare → backend prepare-mcp-document finite dependency chain. No tier server was started by those graph commands. The [durable source record](verification-full-dev-source-20261118.json) binds original logs, receipts, validations, source epoch and review descriptors.

Only source implementation tasks bun-scripts2.3d.1 and puni-cli3.1d.5 close here. Actual PUNI executable IO/TTY, capture drain, remaining input/failure/finite R5 controls, installed delivery, package/default/old-script/container cutover and parent tasks remain open. The separately successful owned-PTY probe is a Bun capability observation, not current executable parity. No commit, host gate or deployment is certified by this record.

## Development executable IO: proper first observations before correction

At CLI9769cea, Root ran the actual executable IO2 owner with60000ms Bun test timeout and180000ms outer. The preserved `/tmp/puni-cli-full-dev-executable-io-live-v2/executableIO/native.log` records1pass/1fail/18expects in765ms. The direct Bun/Nx producer control, actual Root native/status0, actual producer finished state/Root parent/full written bytes/exact vector all passed before terminal length first failed:3145758 expected,1977296 received at132. Terminal hash, capture length/hash and stderr tails were unreached; this raw does not certify them. The isolated reusable-main case passed with returned JSON, unchanged caller global57 and exact callback hashes. Original outer exit1 was settled/reaped/closed.

The separate Root-owned PTY record `/tmp/puni-cli-full-dev-actual-root-tty-observed-v2.json` preserves actual line and one Ctrl-C, then its first whole-record mismatch: child tty[true,false,false] versus alltrue, with equal finished/PID/PPID/input/signal1 fields. Rootnative130/null/numeric130 and parent-forward1 are preceding ordered assertions inferred from reaching that mismatch, not a separately emitted native receipt. The leaf handler's normal0 intent remains distinct from Root's controlled130. No general descendant, all-signal or TTY parity claim follows.

This private correction stage has no corrected-source runtime/quality result. Callback compatibility, first5/2owner controls, native/cancelled delivery, same-controller wiring, reporter/release failures, installed/client/container and full-goal evidence remain separate. Existing P1 busy-refusal proof is only its observed whole verdict and retains unreached-tail qualifications.

### Source development IO/lookup quality and first package-caller RED

At CLI976 `a4dbee4d54ab4d3118756979f21612055bb303405b9d2d1198001e3c17a505ba`, Root's eight fresh phases under `/tmp/puni-cli-full-dev-diagnostic-lookup-quality-live-v1` exited0 with settled/reaped owners, closed descriptors and unchanged selected inputs. Normal PUNI/Dash types emitted nothing; strict lint covered17 TypeScript files without errors/warnings; executable IO passed3/29, ordinary start5/85, lifecycle defects2/14 and root/leaf244/965; configured formatting checked30 paths and OpenSpec validated343/343. Executable IO raw `c391c8df33974d9027981a2f11c44d05c9cad55d1eae61041a5529f2322bac19` and root/leaf raw `5b8f71e0d5998774986de1f01695bfee485b44dda36891419ea1e59c9a2eefe6` bind their exact receipts/commands there. The separate corrected lookup owner passed1/7 (2filtered) under `/tmp/puni-cli-full-dev-diagnostic-lookup-fixed-live-v1/lookup`; it followed the recorded original mutation failure and is not independent native factory proof.

The test-only new package file then formed CLI977 `960c2ae540835dd99b843e185218c27935a1395e6af9cc66edc90c0b35b6b882`. Actual `bun test apps/puni/cli/src/development/start-callers.test.ts --timeout=45000` used180000ms outer at the isolated CLI worktree. Raw `10b577ce7d409dc6b31dc38ab7eb9b7a52e3d6b45efd863a804ea62cc5b65fad` records0pass/2fail/36expects509ms. Each first failed the owned Bash marker after independent explicit-Bun-launcher, finite local Nx/native/bytes/vector/reset and caller-native prerequisites. The raw rethrows at146; exact source/order identifies the marker. Later package status/vector/capture tails were unreached. Original outer1 was normal/settled/reaped/closed with primarynull/cleanup[] and977/602/371/immutable3 matched. The independent review `/tmp/puni-cli-full-dev-client-callers-red-astra-v2.md` SHA `4302888c4789fd0d8bcbda1b53a458c57f5e4969d78d52c4e07d236cc227cefa` separately bounds this attribution.

The accompanying adapter/package/container source stage remains UNRUN. These source positives do not tick default/installed/container/parent tasks; new projection guards, configuration refusal, full installed delivery, native/TTY/signal/capture and old script/runner retirement remain owed. No host, CI, registry/default or gate action follows.

### Bounded installed development caller observation — 2026-11-18

Source CLI983 `7ffabd27836191f38a895deb9c909c74da71113a0e903de7c7e0f840828ba72b` passed normal bin/PUNI/Dash types, strict lint20TS, package callers2/46, adapter ABI13/56, executable IO3/29, formatting36 and OpenSpec343/343. Those source-only originals remain separate from the test-only installed extension at983 `d04e1524f4559575415012d94c14d0eeae2f2b4982e77386d01cc9f8fb0c16a3`.

The first actual installed attempt stopped at trusted-module copy ENOSPC on ext4:0pass/1fail/3filtered/4expects, raw `611a0b63e086882fe88fe619861fb1dd986e82d7895a039e2f7211d226aac160`. All new installed joins were unreached; this is an environment/setup failure, not feature RED. After a separate owned capacity/write+fsync/direct-exec probe, the unchanged test/source ran with explicit argv prefix `/usr/bin/env TMPDIR=/dev/shm/puni-installed-runtime-20261118-v1`; the native helper's recorded environment remained unchanged. The same300s case/360s outer passed1test/0fail/3filtered/269expects in74.98s, raw `98f524978d0d164a07638939e4d1c45468fcf4a1193d23953c646a2f239b4930`. Both outer originals settled/reaped/closed normally with source983/602/371/immutable3 matched.

The one actual build/pack/install session reached all old and new assertions: outside consumer helper copy with no provider apps, removed captured checkout/output, actual installed main, both finite local Nx baselines and package aliases, native/numeric/both-EOF/finished records, exact one-launch/vector, default0 and captured local-solver3 bytes/file/status. The passing raw does not print every subobservation. The declared initial package-manager launch erases preload variables before Bun; bare bun run has no such claim. Operator workspace availability remains explicit. Existing afterAll removed its failed ext4 fixture and successful tmpfs child root; no unrelated path was deleted and no generic cleanup certificate follows.

The [durable record](verification-full-dev-client-delivery-20261118.json) retains originals, source/argv/storage bridge, review pins and limits. This appendix uses later formatted983 `8607fb67…` as a documentation preimage only; fresh final new-test quality remains separate. Package-run TTY/signal, real container/mount/refusal, new guards/R5, current startup-profile/provisioning and legacy Forge/runner/CI retirement remain open. No parent checkbox, host/gate/default/CI action or public release provenance is certified.

## Forge coherent candidate first-observation boundary

The current authoring basis is CLI989 source roster /tmp/puni-cli-forge-selection-first-live-v1/source-pins.json (cab1c3d0cf197b4a35d8e7c642a11c5d4f7343d62182cc0cee4b5f318a2805c3). Root alone ran these first-feature owners; each original receipt is settled, reaped and streams closed with no primary/cleanup failure. These observations precede the new coherent production cohort; they do not claim its GREEN, compilation, effective CEL admission or mounted/native certification.

| Existing owner / original native prefix                              | Actual first observation  | Qualified boundary                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| /tmp/puni-cli-forge-first-live-v1/forge/native                       | 0pass1fail8expects443ms   | Original committed resources passed; missing exact PUNI volume is first failure. Later mapping/environment/command tails unreached.                                                                                                                                     |
| /tmp/puni-cli-forge-order-live-v1/admission/native                   | 0pass3fail10expects33ms   | Claim, release and restored insertion-order premise reached missing/replaced installation owner expectations. The earlier wrong restore-order premise remains separately preserved as invalid setup.                                                                    |
| /tmp/puni-cli-forge-parser-first-live-v1/selectionParser/native      | 0pass1fail2expects286ms   | Historical down/status premises passed, then existing parser refused --puni-selection. Grammar only.                                                                                                                                                                    |
| /tmp/puni-cli-forge-remaining-first-live-v1/labParser/native         | 0pass1fail1expects325ms   | Historical status passed, then parser refused --puni-installation-root. Grammar only.                                                                                                                                                                                   |
| /tmp/puni-cli-forge-boundary-repair-live-v1/boundaries/native        | 0pass2fail4expects1.91s   | Literal inherited infra2/root-empty allowance premises passed, then exact new aliases were absent. Other-option/resolved-import/neighbor-denial tails still prospective. The earlier wrong only-new-alias first expectation is retained as a contract error, not proof. |
| /tmp/puni-cli-forge-selection-first-live-v1/selectionProducer/native | 0pass1fail11expects1055ms | Actual Bun install, probe, ready/main/archive/stdout/argv premises passed; puni-selection.json absence is first failure. Exact sidecar tail was not reached.                                                                                                            |

New source/helper tests, producer serialization/factory correspondence, current SDK/host verifier, lab2/ConfigMap/policy, native supervisor, quality and R5 checks are UNRUN until Root records fresh outputs. Controlled current-profile fixtures are not an actual packaged current PUNI/container/TTY/cgroup certificate. Historical installed269 and source IO/TTY positives retain their original epochs. Full3.1c/3.1d.9c, Bun2.3d.3, source-cold-v2/default/public pin/host/CI and final gate remain open.

### Required loaded source and shipped Forge first owners (implementation candidate; unrun)

- `/tmp/puni-cli-loaded-build-config-live-v1/loadedFirst/native.log` SHA256 `398eeba4c16c28760d7045eb9e31e18ae779fe135253e26bd5919cedf490388d` (1124B): loaded source SDK: 0pass1fail41expects; first fresh-development count expected0 actual1 at1611. Actual native/compiler/SDK/install/change premises passed; later tails unreached.
- `/tmp/puni-cli-installation-boundary-first-live-v1/narrowBoundary/native.log` SHA256 `4a2ca78760e5952dc99370cfdd4b481d344a71f257f2a455ef25906b33e1361b` (1081B): narrow verifier policy: 0pass1fail2expects; inherited[] passed before old packaging versus installation facade mismatch. Remaining import/neighbor tails unreached.
- `/tmp/puni-cli-packed-forge-first-live-v1/packedGrammar/native.log` SHA256 `7e5ccccd32ec5dd06e3464a5ad77f0ca63727ae7a0d11c3299eaea31607511e2` (1767B): packed grammar: 0pass2fail2expects; existing namespace premises passed, dev-env rejected.
- `/tmp/puni-cli-packed-forge-first-live-v1/installed/native.log` SHA256 `1c05efab303624cc787bf2ccc2c50774566dac84c6edcccd4de57f1065dc9df0` (952B): real packed owner: 0pass1fail65expects,37.07s; actual installed main stat passed before missing forge-supervisor.mjs at386. Manifest/hash/relocation tails unreached.
- `/tmp/puni-forge-scanner-observed-root-v1/native.log` SHA256 `1b1e7fd724b006dd372a5aef4b7302d75607deb261138f0bd0878d8084ade02a` (1269B): Bun1.4.4 scanner capability only: type imports omitted, literal re-export/dynamic import retained, nonliteral import(path) absent. Empty imports therefore does not establish dynamic completeness.

Root reported each original native owner settled, reaped and closed. These distinct epochs establish only those first observations. The current CLI source before this private cohort is1029/92, SHA256 `d3b2cb549480adb67db12c27879eb48d599a0f382e436b88552421c6299a02bc`; raw logs retain their original earlier source epochs. The packed first session used its separately observed explicit tmpfs capacity/execution bridge; it does not establish host mounts or public provenance.

The private successor separates the explicit source compiler/observation API from the installed closed runtime. It adds no new observed Proof or parent tick. All source/packed first positives, added required-input/native and actual shipped-operation controls, normal types/strict lint/format/spec validation, per-guard omissions, actual mount/admission/container/cgroup custody, HTTP/readiness and remaining old shell/CI consumers are pending on these candidate bytes. Historical cold-v1 remains unchanged.

#### Caller Buffer retention first observation

Root observed `/tmp/puni-cli-selection-retention-first-live-v1/selectionRetention/native.log` SHA256 `909008a461c3b7c5015fba1666854db4c8e042987d22e80813ecb60b2e5f9f90`:0pass1fail30expects,5.82s, first developmentcount at1740 expected1 actual0 after healthy actual control/native joins/install0/mutated caller hash and unchanged disk record. Later outcome tails were unreached. Root reported the original native owner normal, reaped and closed; source was1029/92 SHA256 `85c97000ef2623f2acd5d9606afcb4d5e35a3951869511416cc59b104abe4323`. The private successor uses explicit owned Uint8Array copies at supplied-byte boundaries. Corrected results and independent inner-copy fault necessity remain unobserved.

### Retained runtime loader proposal after actual producer refusal

Root's actual existing packed owner at /tmp/puni-cli-packed-current-live-v21/installed/native.log reached preparation-roles.ts142's generic opaque first-party loader refusal for packaging/forge.ts131 import(moduleURL.href), before any new installed runtime assertions. The source successor keeps that generic safety boundary and proposes one exact-source/AST/role-qualified retained-byte loader. It does not claim that the new route or its producer/refusal controls have run.

The tiny runtime source alone was formatted by Root with actual canonical configuration/editorconfig: /tmp/puni-forge-loader-formatted-root-v1/forge-runtime-loader.ts SHA256 1e2558b90c9425ea212a0663f5851a58233b7bb891eb91cf9eb07aeb74816173,833B; its native receipt/observation are retained beside it. That formatting actor is not a compiler, loader or installed execution proof. The audited producer literal uses those exact bytes. All new runtime/producer/record/readback/packed controls and later finite effects remain unrun on this candidate cohort. Existing metadata/source setup observations and their earlier source epochs are retained separately; no parent completion or public/default/mount certificate follows.

### Installed Forge archive admission and exact package control — 2026-11-18

A fresh build, pack and installation outside the checkout now passes the actual protected-startup/all-three-provider integration owner:1 pass/293 assertions in74.72s. Its Forge supervision keeps the original20s limit and reaches the named frozen-install refusal; later installed development caller assertions also pass. This supersedes the earlier138-assertion startup timeout, not the outstanding full-scope checks.

```text
bun test apps/puni/cli/src/packaging/build.test.ts --test-name-pattern "^packs and installs the captured PUNI package outside its checkout with protected startup and all three providers$" --timeout=300000
```

On the same retained50,578,384-byte archive (SHA256629cbd77059984b9a8d47345a26e0abbaee2e742f5d09684588dbb28253ddae5), unchanged raw admission took9195ms while actual Bun archive decoding took333ms. A segment trie replaces only the quadratic effective-path collision scan: raw admission then took475ms and decoding336ms, with18009 file members. No archive bytes changed, no verification was cached/skipped, and no timeout increased. These primitive timings are distinct from the fresh installed integration result above.

The independent raw archive suite first passed15 semantic controls/82 assertions on the old implementation, then all17 controls/106 assertions on the new implementation, including4096/16384-file exact membership and binary payload samples. Raw/effective PAX identity, neighboring segments, directory-after-children and both collision directions are covered. Each collision predicate separately passes1/5, fails0/1/5 with the check forced false at its missing-throw oracle, and passes1/5 after exact restoration. Adjacent Proof comments preserve that scope; no mutant remains.

Configured Prettier covered only archive.ts/archive.test.ts. Current four CLI type roots pass, and the actual package program/asset producer tests pass18/105, including delivered runtime-asset metadata corruption/omission and settled cancellation controls. Whole client-surface/Bun conversion inventory, final full formatting/lint/build/OpenSpec/migration/secrets/host gates and combined WBS/CLI integration remain open. No task checkbox, publication, deployment or whole-goal completion follows from these scoped results.

### Owned execution and explicit tool-source selection — 2026-11-18

[Original source epochs, commands, logs, receipts, validation and exact restoration evidence](verification-owned-execution-source-selection-20261118.json) retain the bounded current controls. Dirty working-source capture passes2/25 assertions through actual Git and detached tracked/untracked bytes/modes/links. The earlier native cleanup-SIGTERM regression now passes1/11: an already observed build failure retains failure status. Pending independent-judge cancellation passes1/6; pending-build cancellation1/5. Captured Bun services, both Playwright stages, frontend build/preview, build failure and unknown-custody retention all pass their actual selected owners. Current CLI caller type roots pass. Full source/installed/profile/Nx delivery remains separate.

New toolkit3 controls pass4/72 assertions, and historical toolkit/release controls pass87/131. New execution retains explicit committed revision/tree or working base/capture identity. The runtime reader checks independently selected complete identity; committed-only reading refuses working source. Historical schema1/2 serialization and execution boundaries remain explicit. No new profile or release consumer is certified by these helpers alone.

Seven single-check effects each have a passing selected baseline, actual missing-throw fault, exact restoration after known native custody, and passing same-selection after control. They cover reference agreement, complete expected identity, committed-only admission, required committed tree/working capture identity, and the two closed-key branches. The first reference flight's false classifier is retained: Bun rendered the no-argument toThrow() spelling, and a separate independent annotation confirms the printed mismatched reference/selection and known restoration without rerunning it. The remaining six use the corrected diagnostic matcher. Added Proof comments credit these first oracles only. Other schema3 format/runtime/pattern/absence checks, working-capture safeguards and cancellation/disposition safeguards still require their own controls. Full0.4 profile/producer/assets/source and source-removed installed checks, four actual Nx clients, the complete client-surface Bun inventory, combined WBS integration and exact-commit host gate remain open.

## Complete WBS and CLI input integration — 2026-11-19

The private proposal combines all2556WBS and206CLI physical changes, resolves12ordinary merge conflicts, and preserves the typed PUNI policy parser, installed caller-directory context and separate historical binding acceptance. The original version1 step-list transport remains accepted after closed validation; manifest requests reach all three Burokrat aliases. Dash now admits the actual current ordinary WBS service producer and retains the independently owned Bun/Vite execution path and per-invocation database.

The combined12-file integration selection passes1578tests/2621assertions; mounted catalogue API passes37/1947. ThreeCLI, backend, frontend/MCP/gateway and tool-devsync compiler controls pass at their recorded epochs. Dedicated import, formatting and descriptor controls pass. Twenty-nine bounded omission effects restore exactly:9current request,5legacy transport,4service admission and11source-client policy controls.

The complete Performance file first records65pass/2fail/633assertions. Both stale synchronous fault observers are repaired through actual child injection; their targeted rerun passes2/40 and requires all five fault markers. No fresh whole67-pass claim follows. Current memory Source remains84pass/2fail/11275assertions, covering package/WPS creation, legacy step operations and custom-measure ownership. The full original scope, Astra review, unchanged blocked archive refinement, installed/client/script closure and exact committed host gate remain open. No parent task checkbox or release follows.

[Commands, native receipts, bounded effects, source identities and limits](verification-entities-integration-20261119.json).

The following bounded Memory package-birth repair passes86focused tests/2607assertions, the memory compiler root and changed-file lint/format. [Its WBS record](../wbs-step-catalogue/verification-memory-package-birth-20261119.json) owns the nine finite fault injections and remaining84pass/2fail whole-Source contract cutover. The full integration and original PUNI/entity scope remain open.

## 2026-11-21 — native output environment correction

The V111 pipe-backed CLI69/13 and original-probe failures are restricted-environment observations,not defects in CLI runtime output. The unchanged CLI parser passes82/0 and saved original probes pass102/0 with approved unrestricted local execution. The unnecessary generated-probe writeSync changes are reverted while all Compose coverage remains. Current product IO,ownership and historical identities remain unchanged.

Two exact copied-source Git status/warning omissions demonstrate false greens under restriction and required-rejection failures outside it. Diagnostic successors observe earlier rev-parse EPERM before the named fault. Details and the excluded/denied trace attempts live in [the incident catalogue](../../../docs/findings/checks-that-cannot-fail.md); [the evidence record](../puni-cli/verification-native-output-environment-20261121.json) binds current commands,source and outcomes. Earlier records retain their original observations; their CLI-defect interpretation is superseded.

The full original entities/PUNI goal remains active. This environment qualification does not prove installed clients,complete inventory/container/native ownership,all13 fact families/all15 historical guarantees,Astra review,performance/history fixes,host gates or delivery. Astra remains unavailable until recorded2026-11-22 10:09AM,timezone unspecified; no retry/substitute/new agent occurred.

The final proper-native combined cohort passes244 tests across4 files with585 assertions. The unchanged30×300-row rollup fixture independently retains a real performance failure: space16.8ms,cold1243.0ms,warm985.3ms against400ms,canonical presentations20cold/0warm. Its preceding equality/leaf/scan checks reach the timing bound;workload,authority and120/400ms limits remain intact. No performance candidate is revived.

### Current PAX and dependency transport — 2026-11-21

The existing independently reviewed required-long regular-file PAX correction is now applied after renewed explicit goal authorization and fresh34 first controls (26pass/8fail). Current35 archive and18 selected-copy controls pass53/0 with305assertions. The full PUNI production/test TypeScript build and four-owner lint pass. [The compact record](verification-pax-transport-20261121.json) retains exact source/review identities, receipts,21 independently failing and restored finite controls, and two excluded survivors.

The real build/pack/add advances beyond archive admission, then exposes10 transport-omitted metadata paths (54047produced/54037installed;0changed/0added). The producer now excludes those exact observed paths before selected/copied fingerprints; actual Bun pack preserves the resulting hash. Broad filename omissions remain forbidden and tested. No historical evidence or dependency-corruption check is rewritten.

The next actual package attempt passes those two boundaries and stops during source import (3pass/1fail,37assertions,54.80s). Arkregex is already in the authenticated closure; physical trusted-node-modules placement breaks sibling resolution. Copying the same authentic Ark packages into a canonical node_modules directory imports and validates successfully, but does not qualify shipped/source toolchain layout. That implementation and all downstream Browser/Performance/alias/four-Nx clients remain open.

The seven old local-installer controls all stop at a stale healthy historical package-metadata prerequisite, refused correctly by current0.4. Their later negative tails are unreached; upgrade the fixture before granting them credit. Task2.1c/3.1f.5 and every parent/full-goal requirement remain unchecked. Formal Astra/combined review, exact-SHA clean h2/h4 gates and authorized delivery remain required.

### Current canonical toolkit layout — 2026-11-21

Current unreleased0.4/toolkit3 now carries its authenticated closure at `toolkit/node_modules`; explicit historical1/2 readers retain their original directory. Producer, verifier, source/installed runtime and preparation inputs share the same selector. Current/historical toolkit and full PUNI boundary regression pass168/0 (479assertions), six real Vite/Playwright vectors pass6/0 (105assertions), and18 changed TypeScript roots plus19-owner lint pass. Five layout and six import-policy mutations each fail their own oracle and pass after exact restoration. [The evidence record](verification-canonical-layout-20261121.json) preserves source pins, receipts, failures and scope limits.

A retained authenticated local package runs source/installed Browser and Performance2/0 (103assertions), and all eight public spellings perform real operations8/0 (34assertions) with producer source/output absent and hostile startup disabled. These controlled mini-service fixtures do not qualify real WBS browser/performance or all four Nx clients. The first complete package attempt reaches352 assertions and Forge before its300s aggregate harness expires; it remains3pass/1fail/1error and retains its namespace. Only the aggregate budget changes to600s; individual native and ownership limits stay unchanged. The final complete package native exit is 1, recorded separately without crediting unreachable tails.

Task2.1c/3.1f.5 and parent tasks remain open: upgrade seven stale local-installer prerequisites, complete actual four-Nx/caller coverage and the Bun client-surface migration, obtain formal Astra review, and run exact-SHA clean host gates before authorized delivery. All nine original goal requirements remain.

The next bounded diagnostic measures full verification of the genuine178MiB archive at6.56s/6.51s. Forge performs repeated verification before install. A separate90s observation of the actual installed entry reaches its expected explicit frozen-install refusal in27.329s, exit65, with the native owner stopped/reaped and descriptors closed. This explains why the20s package-test owner expires; it does not make that owner pass or qualify later clients. Keep its measured cost and every safety recheck when resolving the fixture budget.

### Current installer and complete local client package — 2026-11-21

The fresh complete build/pack/add suite passes4/0 with507assertions (355.15s). It executes source/installed Browser and Performance, real local provisioning, Forge frozen-install refusal, development package aliases, generated MCP headers and the final asset-tamper/service cases. Only the measured Forge test observer changes20s→60s; production20s stop grace remains unchanged. [The evidence record](verification-installer-clients-20261121.json) retains all diagnostics, source pins and scope limits.

Current local-installer fixtures now supply actual schema3/0.4 healthy prerequisites before their negative tails:7/0,137assertions, plus current selected-source record1/0,13assertions. Six admission/metadata boundary faults each reach their forbidden child marker and pass after exact restoration. The broader installer/Source2/Forge file passes119/0 with1198assertions after a frozen physical dependency installation replaces only the isolated proposal symlink. Source2 code/version pins are unchanged; unknown-name/version and ownership mutation controls still run. Three-owner lint/type checking pass.

The retained archiveSHA256 is `3958406dc9964ecb352dd6d0452865b33f088899cc93a4a39aedd4df987d794c`. A real packaged `puni d install-puni` installs it separately with a schema2 record; all eight public spellings then pass actual operations8/0,34assertions with the producer/output absent and hostile startup disabled. This is a controlled integration fixture: the test capture substitutes its fixed canonical mutex literal. It is not a production/default artifact or real-host lock proof. Mini-service Browser/Performance and controlled-Nx development tests do not replace real WBS/four-Nx acceptance.

Task2.1c/3.1f.5 and parents remain open for formal Astra review, remaining actual clients, complete Bun/client-surface migration and exact-SHA host gates/delivery. All nine original goal requirements remain.

## V123 — embedded backend deployment probe

[Native receipts, source bridge and eleven finite pairs](verification-backend-probe-20261121.json)
record `puni dash|d dev-probe be ORIGIN`. The typed PUNI-only leaf uses Bun HTTP,
requests anonymous auth, refuses redirects and bounds headers/body consumption to
15seconds. HTTP200, explicit null user, boolean deployment features and the
organizations→onboarding invariant are required. Standalone Dash keeps its grammar.

The corrected feature RED is7pass/23fail before implementation. Final source/root
parser checks pass114/0 in2files, and the actual standalone Dash suite passes134/0.
Five changed code roots pass types, lint and format. All343OpenSpec entries validate.
The fresh real build/pack/add session passes4/0 with549assertions in338.17s. After
producer checkout/output removal, six actual protected executable invocations exercise
both aliases against healthy, HTTP201 and authenticated loopback responses, with no
authorization/cookie headers, curl, Bash or Node executable dispatch.

| Boundary    | Injected production fault                                                                | Observed negative and restoration                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity    | Omit validation, null-user check, either feature type or feature dependency (5 variants) | Its invalid response succeeds and fails the named refusal assertion; each passes restored. Envelope omission does not prove every record predicate independently. |
| HTTP status | Skip HTTP200 check                                                                       | HTTP201 with a valid identity succeeds and fails refusal; passes restored.                                                                                        |
| Redirect    | Follow the actual302                                                                     | Probe succeeds through the redirect and fails refusal; restored case also observes zero target requests.                                                          |
| Deadline    | Omit the request abort                                                                   | The fixture's20s release returns success and fails refusal; restored request aborts after15s.                                                                     |
| Endpoint    | Request the wrong route                                                                  | Actual captured request path differs and fails; passes restored.                                                                                                  |
| Dispatch    | Skip the typed root route                                                                | Actual anonymous success case fails; passes restored.                                                                                                             |
| Grammar     | Remove blank-origin pattern                                                              | Runtime admission fails the expected usage-refusal assertion; passes restored.                                                                                    |

Every actor settles/reaps/closes before byte/mode restoration. Current production
structure, including operators, flags and literal text, matches all observed
beforeimages after proof comments/formatting; each of the11 observed variants differs.

The disk-backed package attempt fails ENOSPC before installed assertions. An actual
native executable probe qualifies owned memory-backed temporary placement; physical
dependencies and Source2 guards stay unchanged. The first memory run reaches a new
fixture's wrong undefined signalCode assertion; a separate native async-child control
confirms null, and only that test literal changes before the fresh passing run. These
failed attempts are retained and receive no later-assertion credit. The accidentally
requested nonexistent standalone parser test was ignored by Bun:114/0 is explicitly
two files, and134/0 is the separate real standalone owner.

The package retains the controlled mutex and mini-service/Nx fixture limits fromV119.
The old backend-probe shell/deployment caller, MCP probes, complete inventory and all
real clients remain open. Formal Astra review remains pending at its recorded limit.
PR917 is still open/draft atb0d2df4 onfeat/puni-entities-cli. No public commit, push,
PR update, merge, deployment, activation, host gate or parent/goal completion follows.

## V124 — repository deployment caller uses the installed backend operation

[Native checks, source identities and scoped failure proofs](verification-backend-caller-20261121.json)
record the protected Bun `bin/dev-be-probe.ts` adapter. Manual deployment checks the
explicit absolute selected PUNI backend grammar silently before its Git/SSH work,
then uses the same embedded operation for health. The old backend Bash probe is
removed; remaining deployment/MCP Bash logic stays visible migration work.

All48caller/adapter/health tests pass223assertions in4.50s. The real complete
build/pack/add session passes4/0 with558assertions in347.82s, including the actual
repository adapter preflight and HTTP health through installed main after deleting
the producer checkout/output. The operator source caller remains intentionally;
this is not a standalone packaged-adapter or live remote deployment claim. Scoped
types, effective lint, deployment shellcheck and all343OpenSpec entries pass.

| Boundary           | Observed fault and restoration                                                                                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Selection          | Existing relative selection imports successfully when absolute admission is removed; restored refusal passes. Regular/readable and main7 cases own explicit diagnostics, while later native import/apply may still refuse.                                                                                         |
| Completion         | Whole validation omission admits status256 and exits0. Restored case refuses1; no per-conjunct omission claim follows.                                                                                                                                                                                             |
| Preflight          | Removing silence exposes help bytes; removing selected-grammar status admission reaches the retained timer deadline. Both controls pass restored.                                                                                                                                                                  |
| Invocation         | Wrong fixed purpose and late argv lookup change the captured actual vector; restored ABI cases pass.                                                                                                                                                                                                               |
| Lifetime/reporting | Omitting explicit exit/failure termination reaches controlled native kill deadlines; late stderr factory loses its diagnostic; wrong error classification exposes the private failure. Each own assertion fails and passes restored. These do not prove arbitrary descendant absence or abandoned-output flushing. |
| Import             | Removing executable-only admission performs ambient dispatch/status assignment; restored library import remains inert.                                                                                                                                                                                             |
| Deployment         | Removing early admission reaches controlled SSH without selection; skipping later health reports healthy after selected37. Restored caller cases reject correctly.                                                                                                                                                 |
| Startup            | Six startup erasure/configuration variants fail their own native controls. Two stronger valid preload payloads actually create their markers under omitted erasure, then pass restored. NODE_OPTIONS/BE_BUN own erasure only.                                                                                      |

There are22distinct current variants and24qualified flights, not34. The first driver
restores before rejecting a genuine custom-message assertion after10pairs; its stale
liveFault label does not describe an active mutation. The complete current epoch
reruns22 after the private predicate rename. Two valid no-space startup payloads
strengthen existing variants. Current TypeScript structure plus exact shebang matches
the observed beforeimages; the Bash caller differs only by its two exact proof-note
insertions. Source/mode restoration follows settled/reaped/closed native ownership.

The wider workspace run remains77pass/2fail: agent-output env is absent on e2e-local,
and broader WBS/CLI cached tests omit fixture inputs. Two reported tools/libs paths
are frontend configuration text, not real files there; neither phantom declarations
nor scanner exemptions are accepted fixes. Frozen frontend fixtures contain two
configuration tuples crossed with five package/lock epochs, distinct from the current
working frontend config. Those historical pins/captures stay unchanged.

Fresh discovery remains803sites/583unresolved, now72shell/387unknown; native Bun
execution does not silently qualify its protected env-S shebang in the static
collector. Complete inventory/Bun/client closure, actual WBS/four-Nx acceptance,
error-accessor repair, pending Astra, full original requirements, exact-SHA clean
host gates and delivery remain open. No public commit, push, PR update, merge,
deployment, activation or parent/goal completion follows.

### 2026-11-21: bounded Nx repair and implementation pause (V125)

The two V124 workspace failures are repaired without relaxing the checker:
ordinary/unit WBS tests and Navigator declare their fixture/provider inputs;
`e2e-local` declares agent-output settings. Two frontend configuration-text paths
are calculated relative to `apps/wbs/fe-01`, preserving their exact values while
avoiding phantom `tools/libs` input declarations. All other metadata semantics
and every existing assertion remain unchanged.

The combined workspace/backend caller regression now passes **79/0, 331
assertions**. The changed test's ESLint and scoped TypeScript checks exit 0.
`verification-nx-inputs-20261121.json` records commands, receipt identities,
the exact metadata/text audit and the separate frozen-frontend failure.

The 22 selected frozen-frontend cases fail before their intended assertions at
`frontend fixture inputs unsupported`. A baseline run with all seven V125 edits
absent reproduces that refusal, then restores every byte and mode. Preparation
reads the current repository inputs before admitting a known tuple; two retained
frontend configurations are crossed with five package/lock epochs. The earlier
V124 note did not establish independence from the current root configuration.
Neither historical pins/profiles nor the input guard were changed. These 22 cases
remain unverified beyond setup, rather than passing evidence for this repair.

At the user's instruction, implementation stops after this bounded repair. The
broader goal remains **paused**. The proposed restart order is recorded in
`docs/superpowers/plans/2026-11-21-puni-completion-replan.md`; writing that plan
does not execute it. No full gate, public commit, push, PR update, merge,
deployment, activation or original-scope completion is claimed.

### 2026-11-22: bounded delivery integration

The current delivery goal is to push and merge the existing batch, including necessary
merge compatibility repairs. The earlier broad CLI/script completion goal is deferred.
Commit `0be6f8781c0eadc7a691c8eb4f0889dcfba83804` was pushed to PR917 with normal hooks;
integration of main `a512c4b0b1eb8e53f2f6b0370aea4cb2c45b9dd6` is in progress.

Before the bounded timeout repair, the combined job-run owner reports60 passed,
17 skipped and2 failed: forced termination loses the native keeper before its required
private payload status can qualify. The repaired owner passes63 tests,386 assertions,
with the same17 environment skips. The actual namespace launcher owner passes41 tests;
existing protocol/control/proof owners pass104, and current native owners pass59 with
one actual-systemd skip. These are separate, overlapping scopes.

Thirteen current kill-phase, delivery and keeper-ordering cases pass after the scoped
production faults are restored. A later four-case focused run verifies simultaneous
failure causes survive the final AggregateError construction, alongside the existing
delivery and ordering controls. Actual payload/native status remains required; a
failed kill write refuses caller completion even after a later genuine payload exit.
Formal Astra review remains open. Local source bundles do not qualify installed PUNI
or real systemd/cgroup behavior; detailed limits and fault identities are in the Dash
host-jobs verification amendment.

Workflow guards pass75 tests with Node available on the child PATH. The Burokrat
entrypoint owner passes58 after its real external-trust fixture provisions the
actual TypeScript closure; its missing-runtime refusal remains tested separately.
Scoped root compatibility lint/format and Burokrat types pass. Terminal receipts
are `delivery-ci-memory-node-path-v167`,
`delivery-gate-entrypoints-provisioned-v170`, `delivery-root-compat-*-v171` and
`delivery-journal-types-v175` under the retained control directory. This is local
integration evidence, not an exact-commit host gate, CI completion or merge.
