# Verification

## Dash

Tasks 1.1–1.4 on `feat/twilight-cli-optique-dash`, based on `plan/dash-host-jobs`.

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
  order. Before, `--fleet=x` refused `Unsupported Dash flag: --fleet=x`.
- **D6. `<command> --help` on a delegated command still reaches the command,** which refuses it
  in its usage line as before; `help <command>` prints the generated help.
- **D7. `runDashArguments(argv, deps)`** parses then dispatches, for the in-process tests that
  hold an argv; it refuses `mcp`/`pool`, which only the entrypoint dispatches.

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
