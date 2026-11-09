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
