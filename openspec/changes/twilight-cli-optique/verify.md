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

- **D-A1. Two copies of the change directory.** This branch's `verify.md`, `spec.md`,
  `tasks.md` and `design.md` differ from `plan/twilight-cli-optique`'s (Navigator); they reconcile
  when PR #805 reaches main. The shared spec lines (the refusal requirement and the Navigator and
  Burokrat scenarios) now use that plan's wording verbatim, `one error: line whose message begins
…`; the Dash additions (`--flag=value`, the handler and per-command help scenarios) stay.
  Nothing here edits the Navigator or Burokrat sections of `verify.md`.
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
  and `--candidate-sha is not a 40-hex sha` when the faulty token is the last one or a flag value
  that fails its own check; a valueless flag followed by another flag lets that flag be taken as
  the value, and the word stranded after it is then the reported error (D-A11); `account-outcomes` keeps `period bounds must be UTC
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
- **D-A11. A redacted operand names its position.** `redactOperands` writes `<word N>` (1-based
  after the command words), with `after --flag` when a flag precedes it: `report-capacity /c`
  refuses ``Unexpected option or subcommand: `<word 1>`.``, and
  `run-activation-checks … --candidate-sha --candidate-policy p …` refuses
  ``… `<word 5 after --candidate-policy>`.``, which points at the flag left without a value. A value
  given twice is shown at its first position.
- **D-A12. `launchers.test.ts` waits in whole seconds.** Run 1's failure was the inner test `an
unenrolled host runs the gate on the legacy lock in the launcher checkout`, which expected
  `heavy lock: waited 0s behind 0 tickets` and read `waited 1s` (its wrapper prints the inner
  output on failure, so the full run's log had it). The assertion now pins `waited \d+s behind 0
tickets`: the queue, not the wall-clock rounding. Alone, three runs passed before the change and
  one after (`10 pass`, `0 fail` inner).
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
| G14 `payload()`'s `min: 1` dropped                                         | `refuses an empty payload, an invalid instant and an unknown selection`                             | `Dash accepted resources run --config c --use u --`                           |
| G15 `instant()`'s `pattern` dropped                                        | the same                                                                                            | `Dash accepted account-outcomes … --since 2026-10-01 …`                       |
| G16 `submit-admission`'s `choice` replaced by `string`                     | the same                                                                                            | `Dash accepted submit-admission r p frozen x`                                 |
| G17 `placeholderOf` returns `…`                                            | `a stray word and a mid-line valueless flag name their position`                                    | ``(Unexpected option or subcommand: `…`.)``                                   |

### Commands

| Command                                                                                     | Result                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run twilight-dash:test --skip-nx-cache` (run 1)                                    | 4322 pass, 1 fail, 140 files, 1979 s: `launchers.test.ts in a private user, mount and PID namespace` (44.3 s; an inner assertion, D-A12, not a timeout); alone three times: `1 pass`, `0 fail` (inner `10 pass`, `0 fail`) each |
| `bunx nx run twilight-dash:test --skip-nx-cache` (run 2)                                    | 4323 pass, 0 fail, 140 files, 1941 s; `Successfully ran target test for project twilight-dash` (at 0e7c78c74)                                                                                                                   |
| `bunx nx run twilight-dash:typecheck --skip-nx-cache`                                       | `Successfully ran target typecheck for project twilight-dash`                                                                                                                                                                   |
| `bunx nx run twilight-dash:lint --skip-nx-cache`                                            | `Successfully ran target lint for project twilight-dash`                                                                                                                                                                        |
| `bunx nx run twilight-dash:build --skip-nx-cache`                                           | `Successfully ran target build for project twilight-dash`                                                                                                                                                                       |
| `bunx prettier --check` on the touched files                                                | `All matched files use Prettier code style!`                                                                                                                                                                                    |
| `bunx openspec validate twilight-cli-optique --json`                                        | `"valid": true`, `"issues": []`                                                                                                                                                                                                 |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` | exit 0                                                                                                                                                                                                                          |

No file moved and no dependency changed, so the `tool-devsync` pilot-policy test was not rerun.

### Skipped or unverified

- The h2puni gate (`bin/h2puni-gate.sh`) was not run; CI and the gate stay required.
- Bash, zsh and fish completion scripts were not re-sourced; only `completion zsh`'s header is
  asserted, as in 1.3.

### Review fixes (Fable review of 01ebcab17), 2026-11-03

T1 positional placeholders (D-A11, G17); T2 shared spec wording and D-A1; T3 negatives and
Proofs for the payload, instant, selection and blank operands of `resources init` and
`mcp token` (G14–G16, G3's test); T4 the `ops` exit-code test's budget is 30 s on the measured
basis (each of its three grammar refusals 104–117 ms idle; a `cli.ts` command such as
`inspect-authority <absent repository>` 7.2 s, 2026-11-03); T5 D-A12; T6 the PR body; T7 a
`tasks.md` follow-up; T8 the README notes the generated usage's option-first order. The full
target was not rerun for these fixes; the commands below were.

| Command                                                                                                                                           | Result                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `bun test --timeout=60000 src/cli.test.ts src/check-runs/run-activation-checks.test.ts src/mcp/token-command.test.ts src/mcp/pool-import.test.ts` | 167 pass, 0 fail, 4 files                              |
| `bun test … src/ops/launchers.test.ts` (with the namespace preload)                                                                               | `10 pass`, `0 fail` inside; wrapper `1 pass`, `0 fail` |
| `bunx nx run twilight-dash:typecheck --skip-nx-cache`, `:lint`                                                                                    | `Successfully ran target …` each                       |
| `bunx prettier --check` on the touched files                                                                                                      | `All matched files use Prettier code style!`           |
| `bunx openspec validate twilight-cli-optique --json`                                                                                              | `"valid": true`, `"issues": []`                        |
| Burokrat `check-indexes working . HEAD`                                                                                                           | exit 0                                                 |

## Navigator (tasks 2.1, 2.2), 2026-11-02

Tree: `feat/twilight-cli-optique-navigator` from `plan/twilight-cli-optique` 0d1a529c6 (N-A1).
Tests ran with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

### Commands and results

| Command                                                                                     | Result                                                                                                                                              |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun add --exact @optique/core@1.3.6 @optique/run@1.3.6`                                    | `package.json` and `bun.lock` lines identical to PR #807's                                                                                          |
| `bunx nx run twilight-navigator:test --skip-nx-cache`                                       | `112 pass`, `0 fail`, `Ran 112 tests across 4 files` (after the review fixes)                                                                       |
| `bunx nx run twilight-navigator:typecheck --skip-nx-cache`                                  | `Successfully ran target typecheck`                                                                                                                 |
| `bunx nx run twilight-navigator:lint --skip-nx-cache`                                       | `Successfully ran target lint`                                                                                                                      |
| `bunx prettier --check` on the touched files                                                | `All matched files use Prettier code style!`                                                                                                        |
| `bunx openspec validate twilight-cli-optique --json`                                        | `"valid": true`, `"issues": []`, exit 0                                                                                                             |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` | exit 0                                                                                                                                              |
| `bunx nx run tool-devsync:test --skip-nx-cache`                                             | `981 pass`, `1 fail`: `refuses a dirty, committed or content-masked checkout after execution` timed out at 40000 ms; rerun alone: `1 pass`, 38.14 s |

Navigator has no `build` target (`nx show project`: `test`, `lint`, `typecheck`).

Observed by hand from the entrypoint:

```text
$ bun …/entrypoint.ts plan-reference
error: usage: twin plan-reference --export PATH --repository URL --change NAME --planning-commit SHA --source-base SHA --requirements PATH --output DIR (Missing required twin flag: --export)
exit 2
$ bun …/entrypoint.ts --help        # generated help on stdout, exit 0
$ bun …/entrypoint.ts completion zsh ''
admit-progress Propose WBS commands … receipt-to-commands … --help   exit 0
```

### Fault table

Each fault was injected into the production source by a script that ran the named test with
`bun test src/cli.test.ts -t <name>`, then wrote the original bytes back and checked their
SHA-256; `git diff --quiet` held afterwards.

| Fault                                                         | Test that went red                                                              | Observed                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| F1 `onExit` dropped, so `run` calls `process.exit`            | `refuses an unsupported command before any read, exit 2 through the entrypoint` | `Expected: 2`, `Received: 1`; by hand the entrypoint printed 0 bytes on stdout and stderr |
| F2 `receiptToCommands` removed from the parser's command list | `help names every dispatched command and no other`                              | `- Expected - 1`, `+ Received + 0`                                                        |
| F3 value `pattern` dropped                                    | `refuses a valueless flag before any read`                                      | reached the reader: `plan export is missing: …`                                           |
| F4 unknown-command reason returned unmapped                   | `refuses an unsupported command before any read, exit 2 through the entrypoint` | stderr line differed from `error: Unsupported twin command: apply`                        |
| F5 `maxWidth` dropped                                         | `help parity holds under any terminal width and colour request`                 | `COLUMNS=30` help differed from the in-process help                                       |
| F6 object `unexpectedInput` dropped                           | `refuses an unknown flag before any read`                                       | Optique's ``Unexpected option or subcommand: `--force`.``                                 |
| F7 `--change` wrapped in `optional`                           | `refuses a missing flag before any read`                                        | reached the reader: `plan export is missing: …`                                           |
| F8 entrypoint `process.exitCode = 1`                          | `refuses an unsupported command before any read, exit 2 through the entrypoint` | `Expected: 2`, `Received: 1`                                                              |

### Review fixes (Fable review of 2887552d5), 2026-11-02

The same script, the same restoration check:

| Fault                                                | Test that went red                                                         | Observed                                                                    |
| ---------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| G1 `run`'s `colors: false` dropped                   | `help parity holds under any terminal width and colour request`            | under `FORCE_COLOR=1` 13 help lines differed; the refusal line stayed plain |
| G2 `help`/`completion` branch of `refusalOf` dropped | `<command> --help prints that command; help <unknown> refuses in one line` | `error: Unsupported twin command: help`                                     |
| G3 `completion` brief dropped (`reason` whole)       | `completion without a shell, and --version, refuse in one line`            | the completion help page inside the line                                    |
| G4 `duplicate` wording dropped                       | `refuses a duplicate flag before any read`                                 | ``(`--change` cannot be used multiple times.)``                             |
| G5 `Printed` no longer caught                        | `help and bash, zsh and fish completion print on stdout`                   | fail                                                                        |
| G6 README help block reworded                        | `the README shows the generated help`                                      | `- Expected - 1`, `+ Received + 1`                                          |
| G7 `usageOf` formats with `colors: true`             | `Missing Navigator flag: …` (under `FORCE_COLOR=1`)                        | ANSI bytes in the refusal line                                              |

### Not verified

- The one `tool-devsync` failure is a timeout in `performance-level.test.ts`, which reads no
  Navigator file; alone it passed in 38.14 s against its 40 s limit, so the full-suite failure
  is load, not this change. The full suite was not rerun green.

- The host gate (`bin/h2puni-gate.sh`) was not run for this branch.
- Completion scripts were checked for their shape and the dynamic candidate list, not sourced
  into a live bash, zsh or fish session; they need a `twin` on `PATH` (N-A9).

## Burokrat (tasks 3.1–3.3), 2026-11-02

Tree: `feat/twilight-cli-optique-burokrat` from `plan/dash-host-jobs` cd95ce82d (main
d0be12ea1 plus the whole `dash-host-jobs` change, so the `JOB-CATALOGUE` rule and
`check --now` are present). Tests ran with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

### Command grammar

`src/cli-parser.ts` declares every `runCli` command and the three the installed executable
dispatches itself; `runCli` takes the parsed command through `validatorHandlers`, one handler
per command; `bin.ts` parses with `installedGrammar` before it reads the toolkit, and forwards
the unchanged words to the toolkit's `validator.mjs`, which parses them again.

| Shape                                                         | Commands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| typed operands, plan consistency (non-empty, not flag-shaped) | `validate-progress-receipt`, `validate-plan-tasks`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| typed record and candidate operands                           | `validate-record`, `validate <kind> <json>`, `read-candidate`, `classify-candidate`, `content-manifest`, `validate-artifacts`, `extract-relationships`, `check-indexes`, `check-root-migration`, `validate-review-provenance`, `candidate-identity` (source only)                                                                                                                                                                                                                                                                   |
| typed census operands (eleven named documents)                | `freeze-exhaustive`, `verify-exhaustive`, `evaluate-exhaustive-coverage`                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| typed policy operands                                         | `lint-local`, `lint-ci`, `validate-policy-activation`, `lint` (installed only)                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| typed evidence operands                                       | `inspect-evaluation-coverage`, `inspect-performance`, `inspect-performance-sources`, `inspect-performance-levels`, `inspect-performance-scenarios`, `inspect-level-facts`, `inspect-bun-test-reports`, `inspect-test-reports`, `inspect-test-sources`, `inspect-spec-sources`, `inspect-browser` (source only), `inspect-browser-performance`, `inspect-browser-architecture`, `inspect-browser-conformance`, `inspect-browser-memberships`, `inspect-browser-scenarios`, `inspect-browser-source-levels`, `inspect-browser-levels` |
| typed operands, `--now` required (C5)                         | `inspect-browser-t2`, `inspect-browser-t2-policy`, `inspect-browser-scenario-ledger`, `inspect-scenario-ledger`, `inspect-manual`, `inspect-manual-observation`                                                                                                                                                                                                                                                                                                                                                                     |
| delegated: the module parses its words (spec requirement 1)   | `check`, `explain`, `scenario`, `template`, `validate workflow-binding`, `prepare-activation` and `prepare-relocation-activation` (installed only)                                                                                                                                                                                                                                                                                                                                                                                  |

### Assumptions

- **B-A1. Two copies of the change.** This copy (from `plan/dash-host-jobs`, 1.1–1.4 ticked)
  gets the 3.x ticks and this section. #825 (Dash typing, tasks 1.5–1.9) reached main first;
  merging it placed its "Dash typing" section before this one and took its spec wording: the
  shared pass-through clause is gone, and a malformed argument refuses with one `error: ` line
  whose message begins `usage:`, which Burokrat's output already matches. Burokrat's seven still-delegated commands
  get their own transitional sentence in the spec's first requirement and task 3.4. Navigator's
  ticks, its verify section and its plan live in the `plan/twilight-cli-optique` copy
  (PRs #805, #813); the copies reconcile when #805 reaches main.
- **B-A2. One program name.** Every usage line, the help and the completion script say
  `twilight-burokrat`, as the spec's scenario does. The two plan-consistency commands said
  `usage: twib …`; their four pins change (below). The completion script registers
  `twilight-burokrat`; `twib` users alias it. `validate workflow-binding` is delegated and keeps
  its module's `usage: twib validate workflow-binding …`.
- **B-A3. Unknown commands.** The two-line `unknown command: <name>` + hand-written usage list
  becomes the spec's one line `error: Unsupported Burokrat command: <name>` (empty argv:
  `<missing>`), from both entries.
- **B-A4. Only parse refusals gain `error: `.** A `UsageRefusal` prints `error: <line>`; every
  other failure keeps its bare first line, which tests and callers match (`cannot read JSON
input …`, `inspect-manual --now is not a UTC instant: …`, `invalid_arguments`).
- **B-A5. The dated commands are the six with `--now`.** `inspect-manual` let a missing `--now`
  reach its handler, which refused `inspect-manual requires --now <UTC instant>; …`; the parser
  now refuses first, with that reason inside its usage line, so the pinned text still matches.
  `check` stays delegated: its `--now` is optional by design (the `JOB-CATALOGUE` rule needs it
  only when selected, and `check` refuses it without a dated rule), so its semantics and
  `rules/job-catalogue.test.ts` and `architecture/job-catalogue.architecture.test.ts` are
  untouched.
- **B-A6. `--now` is a string in the parser.** The handler decodes it with
  `readEvaluationInstant`, as before, so the malformed-instant wording is unchanged and
  `cli-parser.ts` references no `Date`. `--now` may now stand anywhere among the operands and as
  `--now=<instant>` (Optique's `option`); stated by `a dated command takes --now anywhere, in
either spelling`.
- **B-A7. Delegated word counts.** `check` (4, 6 or 8 words) and `explain` (1 or 3) keep
  `cli.ts`'s count guards; a wrong count now refuses with the module's grammar instead of
  `unknown command`. `scenario` and `template` had no count guard their modules lacked.
- **B-A8. Choices where `cli.ts` checked.** Candidate selections, level modes and the provenance
  requirement are `choice` values; a bad one refuses with the usage line instead of
  `<x> candidate kind must be committed, staged or working` (no test or runbook pinned those).
  Values their modules check stay strings: `lint-local`/`lint-ci` mode and selection,
  `validate-record` kind (`RecordKind`), `lint`'s selection (the launcher's).
- **B-A9. Flag-shaped operands.** Optique refuses a `-x` operand of a typed command as an
  unknown option; before, only the plan-consistency commands refused them and the others passed
  them to their readers. `--` ends options.
- **B-A10. The installed set is unchanged.** `installedGrammar` is the validator commands minus
  `candidate-identity` and `inspect-browser` (which `bin.ts` never forwarded), plus `lint`,
  `prepare-activation` and `prepare-relocation-activation`. The hand-written `validatorCommands`
  set and its registration proofs are gone; `help names every dispatched command and no other`
  holds the set. A refused installed command line now refuses in `bin.ts`, before the toolkit is
  read (the installed-dispatch test's usage lines are the same).
- **B-A11. Optique's sink contract.** `run` assumes its `stdout` sink ends each text with a
  newline, as its default does, so `readInvocation` appends one: `--version` prints `0.1.0\n`
  (pinned by `packaging/build.test.ts`) and help ends with a blank line. Dash and Navigator write
  the text raw.
- **B-A12. One README.** The package README (`cli/README.md`) is the npm README (`files` in
  `package.json`); its new "Command line" section holds the generated `twib --help`, compared by
  `the README shows the generated help`. The hand-written `bin.ts` help is gone.
- **B-A13. Bundle size.** `bundle.test.ts` records `dist/bin.mjs` in a ±5 % band and checks it
  carries Optique; `pack.test.ts` holds only an injected-failure unit test, so the packed size is
  recorded here, not asserted.
- **B-A14. The clock guard.** `no-ambient-clock.test.ts` is unchanged and scans `cli-parser.ts`
  (F19). `@optique/core`'s one `Date.prototype` identity check (`annotation-state.js`) is in
  `node_modules`, which the scan does not read.
- **B-A15. Removed proofs.** The hand-written arity, mode and `--now`-position guards in
  `cli.ts` and their `Proof:` comments (TEST-AXES-056, -078, -090, -095, -099, -103, -105, -111,
  -115, -124, -131, -139, -143, -147, -151, BROWSER-T2-POLICY-PREVIEW-002 and the unnamed
  operand cases) are gone with the guards. Those tests still pass against the parser's refusals
  (full suite below); the parser's shared mechanisms carry their own proofs (F1–F9).
- **B-A16. Commit attribution.** Commits carry `Co-Authored-By: Claude Opus 5.5`, the model that
  wrote them, rather than the brief's Fable line.

- **B-A17. A help footer for the delegated grammars.** Optique shows a delegated command's
  usage as `[...]`; the packaged help tests pin the documented grammars
  (`twilight-burokrat check <committed|staged|working>`, `explain <rule-id>`,
  `template <list|show`, `[--performance-evidence <json>]`), so the help ends with
  "Commands that parse their own arguments:" and each grammar, wrapped at 100 columns so no
  line carries a trailing space.

- **B-A18. Delegated grammars are tied to their modules.** `check`, `explain`, `scenario`,
  `template`, `validate workflow-binding`, `prepare-activation` and
  `prepare-relocation-activation` export their usage lines (`checkUsage`, `explainUsage`,
  `scenarioUsage`, `templateUsage`, `workflowBindingUsage`, `prepareActivationUsage`,
  `prepareRelocationActivationUsage`), and `every delegated grammar is its module's usage line`
  asserts each equals `usage: twilight-burokrat <words> <grammar>`. `delegatedGrammars` stays a
  literal rather than an import: the modules pull their command graphs (the rule registry, the
  trusted-policy and relocation code) into every invocation's start, which `cli.ts` loads lazily.
  Every delegated usage now says `twilight-burokrat`: `validate workflow-binding` said
  `usage: twib …`, the two `prepare-*` commands named no program, and the footer's `template`
  metavars (`<id>`) had drifted from the module's (`<template-id>`).
- **B-A19. `<delegated command> --help`.** `--help` as a delegated command's sole word prints
  that command's help, as `help <command>` does, exit 0. With any other words (`check working .
HEAD policy.json --help`, `check -- --help`) it reaches the module unchanged, as do `--version`,
  `--now=…` and `--`.
- **B-A20. Completion registers `twib`.** Optique registers only `programName`; the printed
  script is rewritten to register `twib` too (bash `complete … -- twilight-burokrat twib`, zsh
  `#compdef twilight-burokrat twib` and `compdef … twilight-burokrat twib`, fish a second
  `complete -c twib …`). A script lacking the line the rewrite extends throws rather than print
  a script that completes one name. Dynamic candidates still call `twilight-burokrat`.
- **B-A21. Explicit timeouts.** `Burokrat without --now refuses in one usage line` (3.8 s) and
  `help parity holds under any terminal width and colour request` (6.7 s) spawn Bun several
  times; both carry `60_000`, so `bun test src/cli.test.ts` alone, without the Nx target's
  `--timeout=60000`, passes (G5).
- **B-A22. Micro-drifts, observed and accepted.** `twib --version extra` prints the version and
  exits 0 (before: `unknown command: --version`); `check-indexes working -- . HEAD` is accepted
  with `--` taken as Optique's options terminator, while `read-candidate working . HEAD --`
  refuses (`Expected an argument, but got end of input.`); `template` with any word count now
  reaches its module, which refuses other counts with its own usage (before: `unknown command`
  for counts other than 1, 2 and 6); the generated usage lists `--now INSTANT` before the
  operands, though it is accepted anywhere; the README help block wraps at 120 columns.
- **B-A23.** The Optique facts behind B-A11 and B-A20 (the sink's newline, the registration
  lines) are Optique 1.3.6's; the tests that pin them fail on an upgrade that changes either.

### Changed pinned lines

| Test                                                                                                              | Before                                                                                                                                                  | After                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cli.test.ts` `submit-admission is an unknown command` (both entries)                                             | contains `unknown command: submit-admission`                                                                                                            | contains `error: Unsupported Burokrat command: submit-admission`                                                                                                   |
| `invoke-cli.test.ts` `invokeCli captures a refusal …`                                                             | contains `unknown command: not-a-command`                                                                                                               | exactly `error: Unsupported Burokrat command: not-a-command\n`                                                                                                     |
| `packaging/build.test.ts` (built executable, `not-a-command`)                                                     | contains `unknown command`                                                                                                                              | exactly `error: Unsupported Burokrat command: not-a-command\n`                                                                                                     |
| `packaging/installed-dispatch.test.ts`                                                                            | not contains `unknown command: <command>`                                                                                                               | not contains `Unsupported Burokrat command` (the old text could never appear)                                                                                      |
| `contracts/progress-receipt.test.ts` (in-process and process entry)                                               | contains `usage: twib validate-progress-receipt`                                                                                                        | contains `usage: twilight-burokrat validate-progress-receipt` (B-A2)                                                                                               |
| `contracts/plan-tasks.test.ts` (in-process and process entry)                                                     | contains `usage: twib validate-plan-tasks`                                                                                                              | contains `usage: twilight-burokrat validate-plan-tasks` (B-A2)                                                                                                     |
| `packaging/build.test.ts` (`--help`)                                                                              | contains `… validate-plan-tasks <plan-reference.json> <tasks.json>` and `… validate-progress-receipt <receipt.json> <plan-reference.json> <tasks.json>` | contains `… validate-plan-tasks PLAN-REFERENCE-JSON TASKS-JSON` and `… validate-progress-receipt RECEIPT-JSON PLAN-REFERENCE-JSON TASKS-JSON` (generated metavars) |
| `evidence/coverage-runtime.test.ts` `built executable registers coverage before the installed authority boundary` | `inspect-evaluation-coverage` with no operands reaches `installed package manifest is unreadable`                                                       | the same with its four operands: `bin.ts` refuses an incomplete line before the toolkit (B-A10)                                                                    |

Every other pinned usage prefix (`usage: twilight-burokrat <command>` in the evidence, manual,
rules, templates, scenarios and installed-dispatch tests) and every `--now` message holds
unchanged.

### Bundle and package size (Bun 1.4.4, `nx run twilight-burokrat:pack`)

| Artifact                      | cd95ce82d (before) | this branch (after) | Change            |
| ----------------------------- | ------------------ | ------------------- | ----------------- |
| `dist/bin.mjs`                | 9,639,774 B        | 10,333,764 B        | +693,990 (+7.2 %) |
| `dist/toolkit/validator.mjs`  | 10,770,250 B       | 11,459,958 B        | +689,708 (+6.4 %) |
| `twilight-burokrat-0.1.0.tgz` | 29,995,780 B       | 30,242,260 B        | +246,480 (+0.8 %) |

### Commands and results

At 5ac847694 unless noted (laptop, non-root):

| Command                                                                                                          | Result                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run twilight-burokrat:test --skip-nx-cache`                                                             | `2585 pass`, `0 fail`, `Ran 2585 tests across 104 files. [4530.08s]`, `Successfully ran target test`                                                          |
| the same, first run at ab1d62cab                                                                                 | `2582 pass`, `3 fail`: two packaged `--help` pins and the coverage-runtime toolkit-boundary pin, fixed by B-A17 and the coverage-runtime row above            |
| `bun test src/evidence/browser-levels.test.ts`                                                                   | `15 pass`, `0 fail`; rerun alone after an aborted second full run, started by mistake beside the first, timed out `[TEST-AXES-121]` at 60 s under double load |
| `bunx nx run twilight-burokrat:typecheck --skip-nx-cache`                                                        | `Successfully ran target typecheck`                                                                                                                           |
| `bunx nx run twilight-burokrat:lint:source --skip-nx-cache`                                                      | `Successfully ran target lint:source`                                                                                                                         |
| `bunx nx run twilight-burokrat:build --skip-nx-cache`                                                            | `Successfully ran target build`                                                                                                                               |
| `bunx nx run twilight-burokrat:pack --skip-nx-cache`                                                             | `Successfully ran target pack`; sizes in the table above                                                                                                      |
| `bunx prettier --check` on every file changed since cd95ce82d                                                    | `All matched files use Prettier code style!`                                                                                                                  |
| `bunx openspec validate twilight-cli-optique --json`                                                             | `"valid": true`, 1 passed, 0 failed                                                                                                                           |
| `bun …/cli/src/cli.ts check-indexes working . HEAD`                                                              | exit 0 (39 indexes, 2 review debt)                                                                                                                            |
| `bun …/cli/dist/toolkit/validator.mjs check-indexes working . HEAD` and `bun …/cli/dist/bin.mjs check-indexes …` | exit 0; the validator's stdout byte-identical to the source run's                                                                                             |

`tool-devsync:test` was not run: no root file changed (`docs/platform-map.md` is the only file
outside the Burokrat project and this change).

Observed by hand from the installed entry (`bun …/cli/dist/bin.mjs`):

```text
$ twib --version                      → 0.1.0, exit 0
$ twib not-a-command                  → error: Unsupported Burokrat command: not-a-command, exit 1
$ twib inspect-level-facts            → error: usage: twilight-burokrat inspect-level-facts REPOSITORY COMMITTED-SHA AUTHORITY (Expected a `REPOSITORY`, but too few arguments.), exit 1
$ twib candidate-identity committed . HEAD → error: Unsupported Burokrat command: candidate-identity, exit 1
$ twib completion zsh                 → #compdef twilight-burokrat …, exit 0
```

### Fault table

Each fault was injected into the production source (or README, or the build config) by
`faults/run.py`, which ran the named test with `bun test <file> -t <name>`, wrote the original
bytes back and compared their SHA-256; all 22 restorations matched. Final run on 2026-11-02
against the tree of this section's commit.

| Fault                                                                                             | Test that went red                                                                                 | Observed                                                                            |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| F1 `onExit` dropped from `run` (it calls `process.exit`)                                          | `Burokrat without --now refuses in one usage line`                                                 | spawned stderr `""` instead of the `error: usage: …` line                           |
| F2 `--now` wrapped in `optional`                                                                  | `Burokrat without --now refuses in one usage line`                                                 | the handler refused bare `inspect-manual requires --now <UTC instant>; …`, no usage |
| F3 `maxWidth: 120` dropped                                                                        | `help parity holds under any terminal width and colour request`                                    | 80-column `process.stdout` help: `- Expected - 61`, `+ Received + 134`              |
| F4 `colors: false` dropped                                                                        | same test                                                                                          | under `FORCE_COLOR=1` all 119 help lines differed                                   |
| F5 `usageOf` formats with `colors: true`                                                          | `Burokrat without --now refuses in one usage line`                                                 | ANSI bytes in the refusal line                                                      |
| F6 unknown-command reason returned unmapped                                                       | `an unknown command refuses in one line, exit 1, through both entries`                             | ``error: Unexpected option or subcommand: `apply`.``                                |
| F7 `help`/`completion` branch of `refusalOf` dropped                                              | `help <unknown> and completion without a shell refuse in one line`                                 | `error: Unsupported Burokrat command: help`                                         |
| F8 `jsonPath` `pattern` dropped                                                                   | `refuses invalid operands ["","absent"] before reads` (plan-tasks.test.ts)                         | read the empty path: `cannot read JSON input : ENOENT`                              |
| F9 level-mode `choice` replaced by `string`                                                       | `a wrong operand count or mode refuses with the command usage before any read`                     | reached the reader: `not a readable Git repository`                                 |
| F10 `check` word-count guard dropped                                                              | `check refuses an odd flag tail and explain a two-word tail before reading`                        | ran the check, `not a readable Git repository`                                      |
| F11 `runCli` handler-table guard dropped                                                          | `runCli refuses a command no handler takes`                                                        | `handler is not a function`                                                         |
| F12 `stdout` newline wrapper dropped                                                              | `twib --version prints the manifest version; the validator has none`                               | `0.1.0` without its newline                                                         |
| F13 `Printed` no longer caught                                                                    | `help, help <command> and bash, zsh and fish completion print on stdout`                           | fail                                                                                |
| F14 `cli.ts` `error: ` prefix dropped                                                             | `an unknown command refuses in one line, exit 1, through both entries`                             | `Unsupported Burokrat command: apply` bare                                          |
| F15 `bin.ts` `error: ` prefix dropped                                                             | same test, installed entry                                                                         | `- Expected - 1`, `+ Received + 1`                                                  |
| F16 source-only commands added to `installedGrammar`                                              | `help names every dispatched command and no other`                                                 | `+ Received + 2` (`candidate-identity`, `inspect-browser`)                          |
| F17 README help block reworded                                                                    | `the README shows the generated help`                                                              | `- Expected - 1`, `+ Received + 1`                                                  |
| F18 `@optique/*` external in `executableBuildConfig`                                              | `the executable bundle carries the Optique parser, at its recorded size`                           | no `Unexpected option or subcommand` in the bundle                                  |
| F19 `Date.now()` appended to `cli-parser.ts`                                                      | `the Burokrat package reads no clock` (unchanged test)                                             | listed `"path": "cli-parser.ts"`, `"text": "Date"`                                  |
| F20 `inspect-level-facts` removed from the parser, kept in the handlers                           | `help names every dispatched command and no other`                                                 | `- Expected - 1`                                                                    |
| F21 `validate workflow-binding` branch removed                                                    | `routes an incomplete binding command before generic record validation` (workflow-binding.test.ts) | RecordKind refusal `(was "workflow-binding")` instead of `invalid_arguments`        |
| F22 help footer dropped                                                                           | `buildPackage > builds the canonical executable for use outside the repository` (build.test.ts)    | help lacked `twilight-burokrat check <committed                                     | staged | working>` |
| G1 `template` grammar back to `<id>` metavars                                                     | `every delegated grammar is its module's usage line`                                               | expected `<id>`, received the module's `<template-id>`                              |
| G2 delegated `--help` branch dropped                                                              | `<delegated command> --help prints its help; other words reach the module`                         | `kind` `command` instead of `printed`                                               |
| G3 completion printed unrewritten                                                                 | `completion scripts register twib beside twilight-burokrat`                                        | bash script without `-- twilight-burokrat twib`                                     |
| G4 missing-registration refusal dropped                                                           | same                                                                                               | `Received function did not throw`                                                   |
| G5 `60_000` dropped from the help-parity test, run as `bun test src/cli.test.ts -t 'help parity'` | that test                                                                                          | `this test timed out after 5000ms`                                                  |

### Not verified

- The host gate (`bin/h2puni-gate.sh`) was not run for this branch; CI stays required.
- The trusted lint (`twilight-burokrat:lint`) runs an external activated validator, not this
  tree's; a future activation built from this source carries `cli-parser.ts` and the two Optique
  packages in its validator closure, which its binding must list. Not exercised here.
- Completion scripts were checked for their shape and dynamic candidates, not sourced into a
  live bash, zsh or fish session.

### Review fixes U2–U6 (Fable review of 84b8e86c2), 2026-11-03

| Command                                                                                                                                                                                                                                                               | Result                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `bun test src/cli.test.ts` (single file, Bun's default 5 s timeout)                                                                                                                                                                                                   | `31 pass`, `0 fail`, `Ran 31 tests across 1 file. [41.63s]` |
| `bun test --timeout=60000` on `rules/rules`, `rules/scenarios`, `templates/templates`, `workflow-binding`, `policy/relocation-activation`, `packaging/bundle`, `packaging/build`, `packaging/installed-dispatch`, `evidence/performance`, `evidence/coverage-runtime` | `280 pass`, `0 fail`, `Ran 280 tests across 10 files.`      |
| `bundle`, `invoke-cli`, `no-ambient-clock` tests                                                                                                                                                                                                                      | `8 pass`, `0 fail`                                          |
| `twilight-burokrat:typecheck`, `:lint:source` (`--skip-nx-cache`)                                                                                                                                                                                                     | `Successfully ran target …`                                 |
| `bunx prettier --check` on the touched files; `openspec validate twilight-cli-optique`                                                                                                                                                                                | clean; `"valid": true`                                      |

Faults G1–G5 are in the fault table above. The fault runner restored each file (SHA-256
match). After G1–G5, `registerShortName`'s table gained a `Partial<…>` type annotation for
`lint:source`; it changes no emitted code. The full suite was not rerun for these fixes.
