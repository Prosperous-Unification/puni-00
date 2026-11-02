## 1. Dash (into `plan/dash-host-jobs`, before `dash-host-jobs` slice 3)

- [ ] 1.1 Root dependencies `@optique/core` and `@optique/run` pinned exact; `src/cli-parser.ts`
      with the root parser for every `runDash` command (`bootstrap-authority`,
      `inspect-authority`, `recover-publication`, `submit-admission`,
      `render-observation-units`, `run-activation-checks`, `bootstrap-observation`,
      `migrate-observation`, `plan-enrollment`, `record-progress`, `record-progress-v2`,
      `account-outcomes`, `report-capacity`, `resources …`) and for the entrypoint's `mcp` and
      `pool` branches; `runDash` takes the parsed object — test: every existing `cli.test.ts`
      and `entrypoint`-level test passes; where a pinned line changes, the PR names it.
- [ ] 1.2 Refusal contracts (C3): `onExit` → `UsageRefusal`, `colors: false`, one `error:`
      line, exit 1, the two prefixes — test: the spec scenarios "Unknown Dash command" and a
      malformed-option case; negative: let `run` call `process.exit` and watch the refusal test
      see no `error:` line.
- [ ] 1.3 `--help`, `help <command>`, `completion` — test: help names every dispatched command
      (derived from the parser, compared with the dispatcher's table); completion zsh prints.
- [ ] 1.4 README and `docs/platform-map.md` section 4 line for Dash.

## 2. Navigator (into `plan/twilight-cli-optique`, N-A1)

- [x] 2.1 `src/cli-parser.ts` for `admit-progress`, `plan-reference`, `receipt-to-commands`;
      `runNavigator` takes the parsed object; `UsageRefusal` and exit 2 kept — test: existing
      tests; the "Missing Navigator flag" scenario; negative as 1.2.
      Note: done 2026-11-02; refusals print one `error: ` line (pinned lines changed, N-A3–N-A6);
      the `onExit` negative and seven more faults are in `verify.md`.
- [x] 2.2 Help and completion; README.
      Note: done 2026-11-02; help parity is derived from the parser against `navigatorHandlers`;
      bash, zsh and fish completion print; no `--version` (N-A8); README shows the generated help.

### Navigator assumptions (2026-11-02)

- N-A1: Navigator merges into `plan/twilight-cli-optique`, not main, because the change's
  artifacts exist only there until PR #805 lands; C6 amended.
- N-A2: the program name is `twin`, as the spec scenario, the existing tests and the README
  name it, not `twilight-navigator`.
- N-A3: the entrypoint now prefixes the refusal with `error: `, as the "Refusals keep their
  contracts" requirement and Dash do; the scenario's line "beginning `usage: twin
plan-reference`" is the message after that prefix, as in Dash's `error: usage: twilight-dash`.
- N-A4: a flag followed by another flag mid-line (`--repository --change change …`) now refuses
  `Unexpected twin argument: change`, because Optique takes the next token as the value; still
  exit 2 before any read. A trailing valueless, empty or flag-shaped value keeps
  `twin flag has no value: <flag>`.
- N-A5: `twin --help <word>` prints the generated root help (exit 0) instead of refusing
  `takes no arguments`.
- N-A6: refusals no longer append the multi-line usage text; the command's usage is in the one
  line instead.
- N-A7: the `*_FLAGS` constants and the `FlagValues` and `USAGE` exports are gone; each handler
  takes its typed parsed request. No caller outside the package used them.
- N-A8: `twin --version` refuses `Unsupported twin command: --version` (C4 omits a version).
- N-A9: the generated completion scripts call `twin` to complete, so they need a `twin` on
  `PATH`; none is installed yet, and the README says so.
- N-A10: `--flag=value` is now accepted (`--export=<path>` reaches the reader); the old loop
  refused it as `Unsupported twin flag: --export=<path>`. Pinned by `accepts the --flag=value
spelling`.
- N-A11: `twin <command> --help` now prints that command's help, exit 0; the old loop refused
  `--help` as an unsupported flag.
- N-A12: `twin help <unknown>` refuses `usage: twin help (Unexpected option or subcommand:
\`<unknown>\`.)`, not `Unsupported twin command: <unknown>`: the first word, `help`, is a
  command, and the reason names the unknown one.

## 3. Burokrat (into main, after the `JOB-CATALOGUE` slice is open)

- [ ] 3.1 `src/cli-parser.ts` for every `runCli` command, `--now` as a required option where
      the command is dated (C5); `runCli` takes the parsed object; `process.exitCode = 1` for
      findings unchanged — test: existing `cli.test.ts` and `invoke-cli.test.ts`; the
      "Burokrat without --now" scenario; `no-ambient-clock.test.ts` unchanged and passing with
      `cli-parser.ts` among the scanned sources; negative as 1.2.
- [ ] 3.2 `--version` from the manifest, help, completion; `bundle.test.ts` and the pack test
      record the new bundle size; README and the npm README.
- [ ] 3.3 `verify.md`: commands, output, the fault table for the three CLIs.
