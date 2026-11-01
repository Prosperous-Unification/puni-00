# Verification

## Dash

Tasks 1.1–1.4 on `feat/twilight-cli-optique-dash`, based on `plan/dash-host-jobs`. Task 1.1 is
ticked on the spec's transitional clause (requirement 1: until its grammar is typed, a command
whose module parses its own grammar passes its words through unchanged); tasks 1.5–1.9 type the
rest.

### Pass-through commands (shrinks per tasks 1.5–1.9)

`bootstrap-authority`, `inspect-authority`, `recover-publication`, `submit-admission`,
`render-observation-units`, `run-activation-checks`, `bootstrap-observation`,
`migrate-observation`, `record-progress`, `record-progress-v2`, `account-outcomes`,
`report-capacity`, `resources`, `mcp token`, `pool import`. Typed: `plan-enrollment`.

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
