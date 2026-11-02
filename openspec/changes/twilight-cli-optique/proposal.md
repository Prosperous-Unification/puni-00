## Why

The three Twilight Structure CLIs parse `argv` by hand: Twilight Dash's dispatcher (231 lines),
Twilight Burokrat's (878 lines, positional arguments with `--now` checked by position) and
Twilight Navigator's (95 lines). Each has its own usage strings, flag loops and refusal wording;
none has generated help or shell completion; a new command, such as the `ops job` namespace of
`dash-host-jobs`, means another hand-written loop. ADR 0064 chose Optique on 2026-11-01 and
deferred the migration; Dany asked the same day to do it while that namespace is being added.

## What Changes

**The Twilight CLIs parse with Optique.** `@optique/core` 1.3.6 (MIT, dependency-free)
describes each command as a typed parser; `@optique/run` runs it on Bun with injected stdout,
stderr and exit. Help is generated from the parsers, `completion` is a command, and Burokrat
gains `--version` from its package. Parse refusals keep today's contracts: one `error:` line on
stderr, the exit codes the entrypoint tests pin (Dash 1, Navigator 2, Burokrat 1), and the
`usage:`/`Unsupported … command:` prefixes those tests match. Burokrat keeps `--now` as an
explicit required option and still reads no clock.

**Order.** Dash first, into the `dash-host-jobs` plan branch, so `ops job` is written on the new
parser; Navigator and Burokrat to main, Burokrat after the `JOB-CATALOGUE` rule lands.

## Non-Goals

The WBS operator CLIs (`organization-*-cli.ts`, `credential-epoch-cli.ts`) and the `tools/*`
CLIs on `util.parseArgs`; changing any command's semantics, files or outputs; interactive
prompts; renaming commands (the `dev`/`ops` namespace change stays its own change).

## Constraints

- A mechanical refactor at the boundary: every refusal, exit code and stdout byte the existing
  tests pin stays, or the test that pins it is the thing changed and the PR says why.
- Two runtime dependencies at the root, bundled into Burokrat's `dist/bin.mjs` as every
  workspace import is; `no-ambient-clock.test.ts` keeps passing.
- Every new refusal path ships a watched negative (AGENTS.md R5).

## Capabilities

### New Capabilities

- `twilight-cli`: how a Twilight CLI parses, refuses, helps and completes.

### Modified Capabilities

None.

## Domain Terms

None new.

## Decisions Recorded

[ADR 0064](../../../docs/adr/0064-use-optique-for-clis.md) holds the library choice. C1 to C6
in design.md are this change's assumptions, overrulable by id.

## Impact

`package.json` (two dependencies), `apps/twilight-structure/{twilight-dash,twilight-burokrat,twilight-navigator}/cli/src/{cli,entrypoint}.ts` and their tests, the three READMEs, `docs/platform-map.md` section 4.
