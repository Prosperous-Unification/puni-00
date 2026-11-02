## Context

Read on 2026-11-01. Twilight Dash's `runDash` switches on `argv[0]` and loops over fixed flag
lists; its tests pin `usage: twilight-dash ` and `Unsupported Dash command: ` prefixes, one
stderr line and exit 1 through `entrypoint.ts`'s `refusalLine`. Twilight Navigator's
`runNavigator` throws `UsageRefusal` (exit 2 through its entrypoint) with `Unsupported twin
command:` and `Missing required twin flag:`. Twilight Burokrat's `runCli` has forty-odd
positional commands whose usage strings are thrown as errors, `--now` checked by position, and
`process.exitCode = 1` for findings; `no-ambient-clock.test.ts` scans its sources for clock
reads; its `dist/bin.mjs` is one `Bun.build` of every import. Optique 1.3.6: `@optique/core`
(parsers `command`, `object`, `option`, `flag`, `argument`, `or`, value parsers, `parse`), with
one `Date.prototype` identity check in `annotation-state.js` and no clock read; `@optique/run`
(`run(parser, { programName, args, stdout, stderr, onExit, colors, help, version, completion,
errorExitCode })`); `@optique/testing` (`parseArgs`, `captureRun`, `createCliRunner`). ADR 0064
(PR #803, merged 2026-11-01) chose the library and deferred the migration; this change is that
migration.

## Decisions

**C1. Dependencies at the root, bundled.** `@optique/core` and `@optique/run` pinned exact in
the root `package.json` (`bun add --exact`); no per-package manifest changes. Burokrat's bundle
carries them as it carries every import; `bundle.test.ts` keeps its marker checks. Why exact:
the root pins its runtime dependencies exactly (`application-exception`, `di-bag`).

**C2. One parser module per CLI, the dispatch stays the composition root's.** Each CLI gains
`src/cli-parser.ts` exporting the root parser (an `or` of `command(...)` parsers, each
`object({...})` of typed `option`/`argument` values) and the inferred argument type; `cli.ts`
keeps its command handlers and takes the parsed object instead of `argv`. The entrypoints keep
their dependency injection and `refusalLine`. Why not `run` everywhere: the handlers need the
injected clock, stdout and planners the entrypoints compose; the parser only replaces the
loops.

**C3. Refusals keep their contracts through `run`'s injection.** `run` is called with `stderr`
and `onExit` injected so a parse failure becomes the same one `error: ` line and exit code the
entrypoint tests pin today (Dash 1, Navigator 2, Burokrat 1): `onExit` throws a typed
`UsageRefusal` carrying Optique's formatted message, which the entrypoint's existing catch
prints. The pinned prefixes stay: an unknown command refuses `Unsupported <tool> command:
<name>` (Optique's `command` error options carry the text) and a missing or malformed value
refuses with a line beginning `usage: <tool> <command> …` composed from Optique's usage
formatter. Why: the three CLIs are called by scripts, runbooks and the gate; a changed exit
code or first line is a changed contract.

**C4. Help, version, completion.** `help: 'both'` (`--help` and `help <command>`), generated;
`version` from the package manifest for Burokrat (`twib --version`), omitted for Dash and
Navigator until they are published; `completion: 'command'` for bash, zsh and fish. `--help`
exits 0 on stdout. Why generated help: the hand-written `USAGE` constants drift (Navigator's
and Burokrat's already disagree on tool names).

**C5. Burokrat keeps `--now` explicit and reads no clock.** Every dated command declares
`option('--now', string())` as required; nothing in the parser module references `Date`;
`no-ambient-clock.test.ts` passes unchanged (it scans sources, not `node_modules`, and
`@optique/core` reads no clock; the one `Date.prototype` identity check is recorded here so a
future scan of the bundle is not a surprise).

**C6. Order and merge targets.** Dash first (`feat/twilight-cli-optique-dash`, into
`plan/dash-host-jobs`, before `dash-host-jobs` slice 3, which writes `ops job …` on the new
parser); Navigator (`feat/twilight-cli-optique-navigator`, into `plan/twilight-cli-optique`,
which carries this change's artifacts to main as PR #805; amended 2026-11-02, N-A1); Burokrat
(`feat/twilight-cli-optique-burokrat`, into main, dispatched after the `JOB-CATALOGUE` slice is
open so its registry and documentation edits are known). The WBS operator CLIs and the `tools/*`
CLIs stay on `util.parseArgs`; a later change may follow.

## Risks / Trade-offs

- **Pinned stderr bytes.** Tests that match whole lines (Dash's `a refused command prints one
line on stderr and exits 1`) may need their expected text changed when Optique's formatter
  words a refusal differently; the PR names each such change and why. Prefixes stay.
- **Bundle size.** Burokrat's `dist/bin.mjs` grows by the two packages; `bundle.test.ts`'s
  lower bound is unaffected, and the pack test records the new size.
- **Colour.** `run` is called with `colors: false` so stderr is byte-stable under the gate and
  in CI.
