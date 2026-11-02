# Verification

## Dash

Tasks 1.1–1.4 on `feat/twilight-cli-optique-dash`, based on `plan/dash-host-jobs`. Task 1.1 is
ticked on the spec's transitional clause (requirement 1: until its grammar is typed, a command
whose module parses its own grammar passes its words through unchanged); tasks 1.5–1.9 type the
rest.

### Pass-through commands (shrinks per tasks 1.5–1.9)

None since _Dash typing_ below (tasks 1.5–1.9). Before it: `bootstrap-authority`,
`inspect-authority`, `recover-publication`, `submit-admission`, `render-observation-units`,
`run-activation-checks`, `bootstrap-observation`, `migrate-observation`, `record-progress`,
`record-progress-v2`, `account-outcomes`, `report-capacity`, `resources`, `mcp token`,
`pool import`; typed: `plan-enrollment`. D1, D6 and D9 below are superseded by D-A2.

### Assumptions

- **D1. Delegated commands pass their words through.** Every Dash command except
  `plan-enrollment` is a `command(name, object({ command, argv: passThrough({ format: 'greedy' }) }))`
  whose `argv` reaches its module unchanged. The brief keeps the handlers' signatures
  (`(argv, deps)`), and each module parses its own grammar with its own refusal wording, usage
  line and `Proof:` comments, pinned by its own tests (`usage: dash account-outcomes …`,
  `Usage: render-observation-units …`, `usage: mcp token …`). Typed Optique options in front of
  them would either refuse first in different words or accept what the module refuses
  (`--flag=value`, any option order), and the module would re-parse a rebuilt `argv`. Moving each
  grammar into `cli-parser.ts` changes that handler's signature and tests; that is a later,
  per-command change. `resources …` is the pass-through the brief named.
- **D2. `mcp token` and `pool import` are nested commands.** The parser matches the two words;
  the handlers receive `['token', …]` and `['import', …]` as before. `mcp <other>` now refuses
  `usage: twilight-dash mcp token [...] (Unexpected option or subcommand: \`<other>\`.)`, where it
refused `usage: mcp token --resource <url> …`. No test pinned that line.
- **D3. `run` is called from `cli-parser.ts`'s `readDashInvocation`, not `entrypoint.ts`.** The
  entrypoint and the tests share one path (stdout, stderr and `onExit` injected; nothing reaches
  `process`), so the tests exercise the refusal mapping the entrypoint prints. `cli-parser.ts`
  imports only `@optique/core` and `@optique/run`, so `mcp token` still loads none of `cli.ts`.
- **D4. Refusal wording.** An argv whose first word names no Dash command refuses
  `Unsupported Dash command: <word>` (empty argv: `… undefined`, as before). Any other parse refusal
  is `usage: twilight-dash <command> <generated usage> (<reason>)`. `plan-enrollment` keeps its
  old reasons (`Missing required Dash flag: --x`, `Duplicate Dash flag: --x`,
  `Dash flag has no value: --x`); an unknown flag or extra word now reads Optique's
  ``Unexpected option or subcommand: `--x`.`` where it read `Unsupported Dash flag: --x`.
- **D5. `--flag=value` is accepted by `plan-enrollment`.** Optique's `option` always accepts the
  `=` spelling and has no switch to refuse it; the same eight values reach the planner in the same
  order. Before, `--fleet=x` refused `Unsupported Dash flag: --fleet=x`. Stated by
  `accepts the --flag=value spelling and plans the same arguments`.
- **D6. `<command> --help` on a delegated command still reaches the command,** which refuses it
  in its usage line as before; `help <command>` prints the generated help.
- **D7. `runDashArguments(argv, deps)`** parses then dispatches, for the in-process tests that
  hold an argv; it refuses `mcp`/`pool`, which only the entrypoint dispatches.
- **D8. Help is byte-stable.** `run` gets `colors: false` and `maxWidth: 120`, so neither the
  terminal's colours nor its width (`process.stdout.columns`, `COLUMNS`) changes help or refusals.
- **D9. Delegated grammars are tied to their modules.** `delegatedGrammars` in `cli-parser.ts`
  holds each delegated command's grammar for `help <command>`; one test per command asserts the
  module's exported usage line ends with `<words> <grammar>`. The parser cannot import the usage
  constants, because `cli-parser.ts` loads on `mcp token`'s fast path and the modules pull in the
  command graph. `resources` has no usage line; its action list is compared with the actions its
  module's refusal names.
- **D10.** `help`/`completion` refusals keep only the first sentence when Optique appends a help
  page (`completion` without a shell): `usage: twilight-dash completion (Missing shell name for
completion.)`.
- **D11.** Only `@optique/core` and `@optique/run` are root dependencies (C1); `@optique/testing`
  was unused and is removed, and with it `@optique/discover` leaves the lock.

### Changed pinned lines

| Test                                                | Before                                                      | After                                                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `the installed entrypoint refuses an apply command` | exit ≠ 0, stderr contains `Unsupported Dash command: apply` | exit 1, stdout empty, stderr exactly `error: Unsupported Dash command: apply\n`                                             |
| `refuses unsupported command %s before planning`    | `/command/i`                                                | `^Unsupported Dash command: <name>$`                                                                                        |
| `refuses unsupported flag %s before planning`       | `/flag/i`                                                   | ``^usage: twilight-dash plan-enrollment --fleet PATH --observation PATH.*\(Unexpected option or subcommand: `<flag>`\.\)$`` |
| `refuses missing %s before planning`                | `/<flag>/`                                                  | `^usage: … \(Missing required Dash flag: <flag>\)$`                                                                         |
| `refuses duplicate flags before planning`           | `/duplicate.*--node/i`                                      | `^usage: … \(Duplicate Dash flag: --node\)$`                                                                                |
| `refuses a valueless or empty flag before planning` | `/value/i`, `/--known-hosts-sha256/`                        | `^usage: … \(Dash flag has no value: --known-hosts-sha256\)$` (both cases)                                                  |

The old patterns would have matched the new usage line by accident (`--node` and every flag
name appear in it), so each now pins the reason.

### Commands (2026-11-01, laptop, non-root, `CLAUDECODE` unset)

| Command                                                                                             | Result                                                                    |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `bunx nx run twilight-dash:test --skip-nx-cache` (`bun test … --timeout=60000`)                     | 4155 pass, 0 fail, 121 files, 1617 s; `Successfully ran target test`      |
| `bunx nx run twilight-dash:typecheck --skip-nx-cache`                                               | `Successfully ran target typecheck`                                       |
| `bunx nx run twilight-dash:lint --skip-nx-cache`                                                    | `Successfully ran target lint`                                            |
| `bunx nx run twilight-dash:build --skip-nx-cache`                                                   | `Successfully ran target build`                                           |
| `bun install --frozen-lockfile`                                                                     | `Checked 1807 installs across 1654 packages (no changes)`                 |
| `TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test --timeout 120000 …/pilot-policy.test.ts` | 24 pass, 0 fail; no policy entry needed for the new dependencies          |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`         | exit 0                                                                    |
| `./node_modules/.bin/openspec validate twilight-cli-optique --json`                                 | 1 passed, 0 failed                                                        |
| `bunx nx run tool-devsync:test --skip-nx-cache`, `tool-devsync:typecheck`                           | 982 pass, 0 fail, 50 files; typecheck `Successfully ran target typecheck` |

### Faults (each watched red, then restored)

| Fault injected                                                                  | Test                                                                                    | Observed                                                                                                 |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `onExit` removed from `run` (falls to `process.exit`)                           | `the installed entrypoint refuses an apply command`, `… refuses a valueless flag …`     | stderr `""` instead of `error: Unsupported Dash command: apply\n`; 2 fail                                |
| unknown-command mapping removed (`refusalOf` returns the reason)                | `the installed entrypoint refuses an apply command`, `refuses unsupported command %s …` | ``error: Unexpected option or subcommand: `apply`.``; 6 fail                                             |
| `report-capacity` removed from the parser, kept in `dashHandlers`               | `help names every dispatched command and no other`                                      | diff `- "report-capacity"`                                                                               |
| value `pattern` removed from `flagValue`                                        | `refuses a valueless or empty flag before planning`                                     | no refusal (planner ran with `''`)                                                                       |
| `maxWidth: 120` removed from `run`                                              | `help parity holds under COLUMNS=30`                                                    | help printed under `COLUMNS=30` differed from the in-process bytes (per-entry command parity still held) |
| `report-capacity`'s module usage changed to `--config <file>`                   | `help shows each delegated module grammar > report-capacity`                            | expected to end with ` report-capacity --config <owner-only file>`; 1 fail                               |
| first-sentence cut removed from the `completion` refusal                        | `completion without a shell refuses in one short line`                                  | message carried the whole help page                                                                      |
| `report-capacity` removed from the parser (re-watched after the parity rewrite) | `help names every dispatched command and no other`                                      | diff `- "report-capacity"`                                                                               |
| `runDash` handler-table guard removed                                           | `runDash refuses a command no handler takes`                                            | `handler is not a function…` instead of `Unsupported Dash command: apply`                                |

### Skipped or unverified

- The h2puni gate (`bin/h2puni-gate.sh`) was not run; CI and the gate stay required.
- `twilight-dash inspect-authority` stdout before/after (the spec's byte-identity scenario) is
  covered by the unchanged `inspect-authority prints the state…` test, not a separate run.
- Bash and fish completion scripts are generated by Optique and not asserted; only zsh is.

## Dash typing (tasks 1.5–1.9), 2026-11-02

Tree: `feat/twilight-cli-optique-dash-typing` from `origin/plan/dash-host-jobs` cd95ce82d. Tests
ran with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`, laptop, non-root.

### Assumptions

- **D-A1. Two copies of this file.** This section is written into the change directory on
  `plan/dash-host-jobs`; the copy on `plan/twilight-cli-optique` (Navigator) differs. They
  reconcile when PR #805 reaches main; nothing here edits the Navigator or Burokrat sections.
- **D-A2. No pass-through remains.** Every command is a typed `command(...)` in `cli-parser.ts`;
  each handler takes `DashRequest<name>` (the `ops` model: modules import the type only, so
  `cli-parser.ts` still imports nothing but Optique). The module flag loops, `usage`/`USAGE`
  constants, `delegatedGrammars` and the `help shows each delegated module grammar` tests are
  deleted. Supersedes D1, D6 and D9.
- **D-A3. One operand rule.** Every value of the newly typed commands is non-blank and does not
  begin with `--` (`operand`). Before, the authority, observation and unit commands refused only
  the `--` form, `report-capacity` and `pool import` only the empty value, and `submit-admission`
  neither. `plan-enrollment` and `ops` keep their `flagValue` unchanged.
- **D-A4. Reasons.** A refusal reason is Optique's wording, except the reasons a module's tests or
  runbooks name: `run-activation-checks` keeps `repeated --x`, `missing --x`, `--x has no value`
  and `--candidate-sha is not a 40-hex sha`; `account-outcomes` keeps `period bounds must be UTC
instants like 2026-10-15T00:00:00Z` and `--until must be after --since`. An unknown flag reads
  Optique's ``Unexpected option or subcommand: `--x`.`` everywhere (an object's
  `unexpectedInput` never fires under Dash's nested `or`). `account-outcomes`' two cross-option
  rules (one log directory at least; `--until` after `--since`, compared as strings, no clock) run
  in `incoherenceOf` after `run`, because Optique has no cross-option refusal.
- **D-A5. A refusal names the deepest command.** `usage: twilight-dash resources cleanup …`, not
  the whole `resources` tree; this also shortens `ops` refusals to the `ops job run …` path (no
  test pinned the tree; the `ops` grammar is untouched, exit 64 kept).
- **D-A6. A refusal never quotes an operand.** The hand-written loops never echoed a value;
  Optique quotes them (a credential conflict, a stray word, a `choice` value, `--x=value`).
  `redactOperands` replaces each quoted operand of the line with `…`; option names, command words
  and an unknown subcommand word (`resources teleport`) stay. `Unsupported Dash command: <word>`
  still names the first word, as pinned.
- **D-A7. `resources exec|run` payloads.** `multiple(argument(...), { min: 1 })` after `--`, as
  `ops job run`; a payload without `--` whose words look like no option is now accepted (before:
  `invalid resource command flags`). The module's refusals `resources requires …`, `invalid
resource command flags`, `invalid resource revision` and `resources exec/run requires -- …`
  become usage lines; no test pinned them. `--revision` keeps `/^[1-9]\d*$/` (Optique's `integer`
  accepts `01`) and reaches the handler as a number.
- **D-A8. `mcp token`'s credential group is an Optique `or`** of `--key-file`, `--assertion-file`
  and `--github-actions-audience`; none refuses `one of … is required`, two refuse naming both
  flags. The helper budget's start (`monotonic.now()`) is now read after parsing, which the
  entrypoint does first; parsing is inside the measured boot below. The secret-shape check
  (`--key-file names a file, not a key`) and `pool import`'s pasted-contents check stay in their
  modules: they judge an operand's meaning, not the grammar.
- **D-A9. `--flag=value`** is accepted by every option (Optique has no switch to refuse it); each
  module refused it before. Stated by `--flag=value is accepted and parses as the spaced spelling`.
- **D-A10. `parseDashRequest(name, args)`** is exported for tests that call one command's module
  with what the parser hands it; it refuses a line naming another command.

### Changed pinned lines

| Test                                                                       | Before                                                                   | After                                                                                            | Why                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `record-progress.test.ts` invocation grammar faults                        | contains `usage: dash record-progress`                                   | contains `usage: twilight-dash record-progress `                                                 | task 1.5 prefix                            |
| `account-outcomes.test.ts` `grammar refuses before reading: …` (unknown)   | `/^usage: dash account-outcomes/`                                        | `/^usage: twilight-dash account-outcomes /`                                                      | task 1.5 prefix                            |
| `observation-commands.db.test.ts` `store commands refuse grammar faults …` | exactly `usage: twilight-dash <command> <service.json>`                  | `^usage: twilight-dash <command> SERVICE_JSON \(.+\)$`                                           | generated usage plus reason (C3)           |
| `units.test.ts` `render-observation-units refuses a malformed grammar …`   | exactly `Error: Usage: render-observation-units <layout.json> <new-dir>` | `^UsageRefusal: usage: twilight-dash render-observation-units LAYOUT_JSON NEW_DIRECTORY \(.+\)$` | the `usage: twilight-dash` prefix (C3)     |
| `run-activation-checks.test.ts` `refuses grammar faults …` (unknown flag)  | contains `unknown --candidate-revision`                                  | contains ``(Unexpected option or subcommand: `--candidate-revision`.)``                          | D-A4; the other four reasons are unchanged |
| `token-command.test.ts` `refuses %s` (five cases)                          | contains `usage: mcp token`                                              | contains `usage: twilight-dash mcp token `                                                       | C3 prefix                                  |
| `pool-import.test.ts` `refuses a key pasted where the file belongs`        | starts `usage: pool import`                                              | starts `usage: twilight-dash pool import `                                                       | C3 prefix                                  |
| `cli.test.ts` `help parity holds under COLUMNS=30`                         | `COLUMNS` 30 and 400                                                     | renamed `… and FORCE_COLOR=1`; adds `FORCE_COLOR=1` help and a plain refusal line                | brief: keep both negatives                 |
| `cli.test.ts` `help shows each delegated module grammar` (15 tests)        | module usage ends with the delegated grammar                             | deleted with the constants; replaced by the `typed command grammars` tests                       | D-A2                                       |

Tests that call a module directly now pass it `parseDashRequest(...)` (`run-activation-checks`,
`report-capacity`, `mcp token`, `pool import`, `resources` in `host-pool-mode.test.ts`,
including its generated `watch` script); their assertions are unchanged.

### Boot time of `mcp token` (task 1.8)

`bun entrypoint.ts mcp token --resource https://127.0.0.1:9/mcp --key-file /nonexistent/k`, 15
warm runs each, both refusing `error: --key-file: the key file does not exist [ENOENT]` after
loading `token-command.ts`: cd95ce82d min 362, median 413, max 565 ms; this branch min 323,
median 360, max 391 ms. `cli-parser.ts` still imports only `@optique/core` and `@optique/run`.

### Faults (each watched red, then restored)

Each fault was written into the production source by a script that ran the named test with
`bun test <file> -t <name>`, then wrote the original bytes back and compared SHA-256 (all
`match`, `cli-parser.ts` bb97f6604f15 before the Proof comments were updated).

| Fault                                                                      | Test that went red                                                                                  | Observed                                                                      |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| G1 log-directory rule in `incoherenceOf` disabled                          | `refuses what no single option can: no log directory, an inverted period`                           | `Dash accepted account-outcomes … --since … --until …`                        |
| G2 `--until` after `--since` rule dropped                                  | the same; and `account-outcomes.test.ts` `grammar refuses before reading: …`                        | the inverted period accepted; `expected a refusal`                            |
| G3 `operand`'s `pattern` dropped                                           | `refuses a blank operand for every command`                                                         | `Dash accepted bootstrap-authority ' '`                                       |
| G4 `redactOperands` returns `reason` unchanged                             | `a refusal never quotes an operand`                                                                 | `("--key-file" "wbs_mk_00000000-canary" and "--assertion-file" "wbs_mk_…" …)` |
| G5 subcommand slot not counted in `depth`                                  | `a refusal never quotes an operand`                                                                 | `resources teleport` refused with `` `…` ``                                   |
| G6 `usageLine` formats with `colors: true`                                 | `help parity holds under COLUMNS=30 and FORCE_COLOR=1`                                              | ANSI bytes in `error: usage: twilight-dash resources init …`                  |
| G7 `commandPathOf` never descends                                          | `resources <action> refuses an unknown flag in its own usage line` (nine)                           | the whole `resources (init … \| watch …)` usage                               |
| G8 `parseDashRequest` name check disabled                                  | `parseDashRequest refuses a line naming another command`                                            | `Received function did not throw`                                             |
| G9 `--revision` pattern loosened to `/^\d+$/u`                             | `refuses two credentials, none, a malformed revision and a blank operand`                           | `Dash accepted resources cleanup … --revision=0 …`                            |
| G10 `resources` removed from the parser, kept in `dashHandlers` (re-watch) | `help names every dispatched command and no other`                                                  | `- Expected - 1`                                                              |
| G11 `onExit` removed from `run` (1.2 negative re-watched)                  | `the installed entrypoint refuses an apply command`                                                 | stderr lost the `error: Unsupported Dash command: apply` line                 |
| G12 `checkRunOption`'s `duplicate` dropped                                 | `refuses grammar faults and unusable directories before any effect`                                 | ``(`--check-runs` cannot be used multiple times.)``                           |
| G13 credential `or` replaced by three optional options                     | `token-command.test.ts` `refuses two credentials`; `cli.test.ts` `refuses two credentials, none, …` | the helper resolved and requested a token; `Dash accepted mcp token …`        |

### Commands

| Command                                                                                     | Result                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run twilight-dash:test --skip-nx-cache` (run 1)                                    | 4322 pass, 1 fail, 140 files, 1979 s: `launchers.test.ts in a private user, mount and PID namespace` (44.3 s, under load); alone three times: `1 pass`, `0 fail` (inner `10 pass`, `0 fail`) each |
| `bunx nx run twilight-dash:test --skip-nx-cache` (run 2)                                    | 4323 pass, 0 fail, 140 files, 1941 s; `Successfully ran target test for project twilight-dash` (at 0e7c78c74)                                                                                     |
| `bunx nx run twilight-dash:typecheck --skip-nx-cache`                                       | `Successfully ran target typecheck for project twilight-dash`                                                                                                                                     |
| `bunx nx run twilight-dash:lint --skip-nx-cache`                                            | `Successfully ran target lint for project twilight-dash`                                                                                                                                          |
| `bunx nx run twilight-dash:build --skip-nx-cache`                                           | `Successfully ran target build for project twilight-dash`                                                                                                                                         |
| `bunx prettier --check` on the touched files                                                | `All matched files use Prettier code style!`                                                                                                                                                      |
| `bunx openspec validate twilight-cli-optique --json`                                        | `"valid": true`, `"issues": []`                                                                                                                                                                   |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` | exit 0                                                                                                                                                                                            |

No file moved and no dependency changed, so the `tool-devsync` pilot-policy test was not rerun.

### Skipped or unverified

- The h2puni gate (`bin/h2puni-gate.sh`) was not run; CI and the gate stay required.
- Bash, zsh and fish completion scripts were not re-sourced; only `completion zsh`'s header is
  asserted, as in 1.3.
