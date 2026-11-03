## 1. Dash (into `plan/dash-host-jobs`, before `dash-host-jobs` slice 3)

- [x] 1.1 Root dependencies `@optique/core` and `@optique/run` pinned exact; `src/cli-parser.ts`
      with the root parser for every `runDash` command (`bootstrap-authority`,
      `inspect-authority`, `recover-publication`, `submit-admission`,
      `render-observation-units`, `run-activation-checks`, `bootstrap-observation`,
      `migrate-observation`, `plan-enrollment`, `record-progress`, `record-progress-v2`,
      `account-outcomes`, `report-capacity`, `resources …`) and for the entrypoint's `mcp` and
      `pool` branches; `runDash` takes the parsed object — test: every existing `cli.test.ts`
      and `entrypoint`-level test passes; where a pinned line changes, the PR names it.
- [x] 1.2 Refusal contracts (C3): `onExit` → `UsageRefusal`, `colors: false`, one `error:`
      line, exit 1, the two prefixes — test: the spec scenarios "Unknown Dash command" and a
      malformed-option case; negative: let `run` call `process.exit` and watch the refusal test
      see no `error:` line.
- [x] 1.3 `--help`, `help <command>`, `completion` — test: help names every dispatched command
      (derived from the parser, compared with the dispatcher's table); completion zsh prints.
- [x] 1.4 README and `docs/platform-map.md` section 4 line for Dash.
- [x] 1.5 The four pairwise-loop commands `record-progress`, `record-progress-v2`,
      `account-outcomes`, `report-capacity` get typed options; their handlers take the typed
      object; the module `usage` constants and loops are deleted; the pinned prefix becomes
      `usage: twilight-dash <command>`; a test states `--flag=value` acceptance; negatives
      re-watched. Handler signatures change here. Tests pinning the old wording:
      `progress/record-progress.test.ts`, `ledger/account-outcomes.test.ts`, `cli.test.ts`.
- [x] 1.6 The four authority commands (`bootstrap-authority`, `inspect-authority`,
      `recover-publication`, `submit-admission`) and the two observation-store commands
      (`bootstrap-observation`, `migrate-observation`): positional grammars typed. Handler
      signatures change here. Tests pinning the old wording: `cli.test.ts`,
      `authority/integration.test.ts`, `authority/integration-races.test.ts`,
      `activation/observation-commands.db.test.ts`, `activation/controller.db.test.ts`.
- [x] 1.7 `render-observation-units` and `run-activation-checks`. Handler signatures change
      here. Tests pinning the old wording: `activation/units/units.test.ts`, `cli.test.ts`.
- [x] 1.8 `mcp token` and `pool import`: the entrypoint fast path kept, boot time measured and
      kept; the exclusive credential group as Optique's `or`. Handler signatures change here.
      Tests pinning the old wording: `mcp/token-command.test.ts`, `mcp/pool-import.test.ts`.
- [x] 1.9 `resources` as nested commands, last. Handler signatures change here. Tests pinning
      the old wording: `cli.test.ts` and the resources module's own tests.
- Note (1.5–1.9, `feat/twilight-cli-optique-dash-typing`): every command is typed in
  `cli-parser.ts`, each handler takes `DashRequest<name>`, every module flag loop and usage
  constant is deleted, and the spec's transitional clause is removed. `account-outcomes`' two
  cross-option rules run in the parser after `run` (D-A4); `mcp token`'s credential group is an
  Optique `or`; `resources` is nine nested commands. Pinned lines changed, faults and boot time:
  verify.md, _Dash typing_.
- Follow-up (review T7): `plan-enrollment` and `ops` keep `flagValue`, which accepts a
  whitespace-only value, while the fifteen retyped commands refuse it (`operand`); unify them in
  one change that names the affected `ops` callers.
- Follow-up (review T5): if `launchers.test.ts`' namespace wrapper fails again, record the inner
  failing test from its printed output (the wrapper already prints it; D-A12 records the one seen).

## 2. Navigator (into main)

- [ ] 2.1 `src/cli-parser.ts` for `admit-progress`, `plan-reference`, `receipt-to-commands`;
      `runNavigator` takes the parsed object; `UsageRefusal` and exit 2 kept — test: existing
      tests; the "Missing Navigator flag" scenario; negative as 1.2.
- [ ] 2.2 Help and completion; README.

## 3. Burokrat (into main, after the `JOB-CATALOGUE` slice is open)

- [x] 3.1 `src/cli-parser.ts` for every `runCli` command, `--now` as a required option where
      the command is dated (C5); `runCli` takes the parsed object; `process.exitCode = 1` for
      findings unchanged — test: existing `cli.test.ts` and `invoke-cli.test.ts`; the
      "Burokrat without --now" scenario; `no-ambient-clock.test.ts` unchanged and passing with
      `cli-parser.ts` among the scanned sources; negative as 1.2.
- [x] 3.2 `--version` from the manifest, help, completion; `bundle.test.ts` and the pack test
      record the new bundle size; README and the npm README.
- [x] 3.3 `verify.md`: commands, output, the fault table for the three CLIs.
- [ ] 3.4 Type the seven delegated Burokrat commands (`check`, `explain`, `scenario`,
      `template`, `validate workflow-binding`, `prepare-activation`,
      `prepare-relocation-activation`) in `cli-parser.ts`; their handlers take the typed object;
      the module usage constants and loops are deleted; `check --now` keeps its optional,
      dated-rule-only semantics (`rules/job-catalogue.test.ts`); negatives re-watched. Handler
      signatures change here. Tests pinning the old wording: `rules/rules.test.ts`,
      `rules/scenarios.test.ts`, `templates/templates.test.ts`, `workflow-binding.test.ts`,
      `policy/relocation-activation.test.ts`, `cli.test.ts`.

Notes on 3.x (`feat/twilight-cli-optique-burokrat`, 2026-11-02): this copy of the change came
from `plan/dash-host-jobs` with 1.1–1.4 ticked; Navigator's 2.1–2.2 are ticked, and its
verify.md section lives, in the copy on `plan/twilight-cli-optique` (PRs #805, #813). The two
copies reconcile when #805 reaches main (B-A1). The Burokrat assumptions B-A1 to B-A23 are in
verify.md's Burokrat section. Seven commands stay delegated to the modules that parse them
(`check`, `explain`, `scenario`, `template`, `validate workflow-binding`, and the installed
`prepare-activation` and `prepare-relocation-activation`); task 3.4 types them.
