# Verification

## Grammar foundation, 2026-11-09

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

No full local suite, installed-package test, startup-budget measurement, Bash/Node-free client test, trusted closure mutation sweep, script-inventory completeness proof, deployment, CI result or canonical h2puni/h4claw gate is claimed. These are required by later tasks and the combined goal. This grammar slice does not establish completion of the CLI or entity scope.

### Artifact check receipt

- Owned-file Prettier check: exit 0; all matched files formatted. The first pass named one facade whitespace issue; it was fixed and the complete owned-file check rerun.
- `bunx --no-install openspec validate --all --json`: exit 0; 343 items passed, 0 failed (323 changes and 20 specs).
- Final grammar mutation rerun: all 23 named fault cases failed their production-path oracles and were restored; graph proof separately killed both extra-importer and implicit-edge faults.
- After restoration, root/boundary/workspace graph test rerun: 107 passed, 0 failed, 280 assertions across 3 files, exit 0.
- `git diff --check`: exit 0 before staging.
