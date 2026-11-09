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

Only Linux x64/GNU env is verified. Trusted Bun selection/PATH and OS loader are assumptions. Mac env -S, the actual package/activation chain and the MCP 10-second budget remain unverified acceptance checks. [ADR 0079](../../../docs/adr/0079-sanitize-puni-startup-before-bun-runs.md) records the decision; product startup guards and their production-path negatives still need implementation.

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
