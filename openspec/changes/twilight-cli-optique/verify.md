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

## Navigator

Tasks 2.1–2.2 are verified in the other copy of this change, on `plan/twilight-cli-optique`
(PRs #805 and #813), whose verify.md holds the Navigator section with its pinned-line table and
fault table. This copy came from `plan/dash-host-jobs` before those landed; the two copies
reconcile when #805 reaches main (B-A1).

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
  gets the 3.x ticks and this section; Navigator's ticks and section are in the
  `plan/twilight-cli-optique` copy. They reconcile when #805 reaches main.
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

| Fault                                                                   | Test that went red                                                                                 | Observed                                                                            |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| F1 `onExit` dropped from `run` (it calls `process.exit`)                | `Burokrat without --now refuses in one usage line`                                                 | spawned stderr `""` instead of the `error: usage: …` line                           |
| F2 `--now` wrapped in `optional`                                        | `Burokrat without --now refuses in one usage line`                                                 | the handler refused bare `inspect-manual requires --now <UTC instant>; …`, no usage |
| F3 `maxWidth: 120` dropped                                              | `help parity holds under any terminal width and colour request`                                    | 80-column `process.stdout` help: `- Expected - 61`, `+ Received + 134`              |
| F4 `colors: false` dropped                                              | same test                                                                                          | under `FORCE_COLOR=1` all 119 help lines differed                                   |
| F5 `usageOf` formats with `colors: true`                                | `Burokrat without --now refuses in one usage line`                                                 | ANSI bytes in the refusal line                                                      |
| F6 unknown-command reason returned unmapped                             | `an unknown command refuses in one line, exit 1, through both entries`                             | ``error: Unexpected option or subcommand: `apply`.``                                |
| F7 `help`/`completion` branch of `refusalOf` dropped                    | `help <unknown> and completion without a shell refuse in one line`                                 | `error: Unsupported Burokrat command: help`                                         |
| F8 `jsonPath` `pattern` dropped                                         | `refuses invalid operands ["","absent"] before reads` (plan-tasks.test.ts)                         | read the empty path: `cannot read JSON input : ENOENT`                              |
| F9 level-mode `choice` replaced by `string`                             | `a wrong operand count or mode refuses with the command usage before any read`                     | reached the reader: `not a readable Git repository`                                 |
| F10 `check` word-count guard dropped                                    | `check refuses an odd flag tail and explain a two-word tail before reading`                        | ran the check, `not a readable Git repository`                                      |
| F11 `runCli` handler-table guard dropped                                | `runCli refuses a command no handler takes`                                                        | `handler is not a function`                                                         |
| F12 `stdout` newline wrapper dropped                                    | `twib --version prints the manifest version; the validator has none`                               | `0.1.0` without its newline                                                         |
| F13 `Printed` no longer caught                                          | `help, help <command> and bash, zsh and fish completion print on stdout`                           | fail                                                                                |
| F14 `cli.ts` `error: ` prefix dropped                                   | `an unknown command refuses in one line, exit 1, through both entries`                             | `Unsupported Burokrat command: apply` bare                                          |
| F15 `bin.ts` `error: ` prefix dropped                                   | same test, installed entry                                                                         | `- Expected - 1`, `+ Received + 1`                                                  |
| F16 source-only commands added to `installedGrammar`                    | `help names every dispatched command and no other`                                                 | `+ Received + 2` (`candidate-identity`, `inspect-browser`)                          |
| F17 README help block reworded                                          | `the README shows the generated help`                                                              | `- Expected - 1`, `+ Received + 1`                                                  |
| F18 `@optique/*` external in `executableBuildConfig`                    | `the executable bundle carries the Optique parser, at its recorded size`                           | no `Unexpected option or subcommand` in the bundle                                  |
| F19 `Date.now()` appended to `cli-parser.ts`                            | `the Burokrat package reads no clock` (unchanged test)                                             | listed `"path": "cli-parser.ts"`, `"text": "Date"`                                  |
| F20 `inspect-level-facts` removed from the parser, kept in the handlers | `help names every dispatched command and no other`                                                 | `- Expected - 1`                                                                    |
| F21 `validate workflow-binding` branch removed                          | `routes an incomplete binding command before generic record validation` (workflow-binding.test.ts) | RecordKind refusal `(was "workflow-binding")` instead of `invalid_arguments`        |
| F22 help footer dropped                                                 | `buildPackage > builds the canonical executable for use outside the repository` (build.test.ts)    | help lacked `twilight-burokrat check <committed                                     | staged | working>` |

### Not verified

- The host gate (`bin/h2puni-gate.sh`) was not run for this branch; CI stays required.
- The trusted lint (`twilight-burokrat:lint`) runs an external activated validator, not this
  tree's; a future activation built from this source carries `cli-parser.ts` and the two Optique
  packages in its validator closure, which its binding must list. Not exercised here.
- Completion scripts were checked for their shape and dynamic candidates, not sourced into a
  live bash, zsh or fish session.
