# Verify: twilight-cli-optique

## Navigator (tasks 2.1, 2.2), 2026-11-02

Tree: `feat/twilight-cli-optique-navigator` from `plan/twilight-cli-optique` 0d1a529c6 (N-A1).
Tests ran with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

### Commands and results

| Command                                                                                     | Result                                                                                                                                              |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun add --exact @optique/core@1.3.6 @optique/run@1.3.6`                                    | `package.json` and `bun.lock` lines identical to PR #807's                                                                                          |
| `bunx nx run twilight-navigator:test --skip-nx-cache`                                       | `109 pass`, `0 fail`, `Ran 109 tests across 4 files`                                                                                                |
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
| F5 `maxWidth` dropped                                         | `help parity holds under any terminal width`                                    | `COLUMNS=30` help differed from the in-process help                                       |
| F6 object `unexpectedInput` dropped                           | `refuses an unknown flag before any read`                                       | Optique's ``Unexpected option or subcommand: `--force`.``                                 |
| F7 `--change` wrapped in `optional`                           | `refuses a missing flag before any read`                                        | reached the reader: `plan export is missing: …`                                           |
| F8 entrypoint `process.exitCode = 1`                          | `refuses an unsupported command before any read, exit 2 through the entrypoint` | `Expected: 2`, `Received: 1`                                                              |

### Not verified

- The one `tool-devsync` failure is a timeout in `performance-level.test.ts`, which reads no
  Navigator file; alone it passed in 38.14 s against its 40 s limit, so the full-suite failure
  is load, not this change. The full suite was not rerun green.

- The host gate (`bin/h2puni-gate.sh`) was not run for this branch.
- Completion scripts were checked for their shape and the dynamic candidate list, not sourced
  into a live bash, zsh or fish session; they need a `twin` on `PATH` (N-A9).
