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

## 2. Navigator (into main)

- [ ] 2.1 `src/cli-parser.ts` for `admit-progress`, `plan-reference`, `receipt-to-commands`;
      `runNavigator` takes the parsed object; `UsageRefusal` and exit 2 kept — test: existing
      tests; the "Missing Navigator flag" scenario; negative as 1.2.
- [ ] 2.2 Help and completion; README.

## 3. Burokrat (into main, after the `JOB-CATALOGUE` slice is open)

- [ ] 3.1 `src/cli-parser.ts` for every `runCli` command, `--now` as a required option where
      the command is dated (C5); `runCli` takes the parsed object; `process.exitCode = 1` for
      findings unchanged — test: existing `cli.test.ts` and `invoke-cli.test.ts`; the
      "Burokrat without --now" scenario; `no-ambient-clock.test.ts` unchanged and passing with
      `cli-parser.ts` among the scanned sources; negative as 1.2.
- [ ] 3.2 `--version` from the manifest, help, completion; `bundle.test.ts` and the pack test
      record the new bundle size; README and the npm README.
- [ ] 3.3 `verify.md`: commands, output, the fault table for the three CLIs.
