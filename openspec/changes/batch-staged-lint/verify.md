# Bounded staged-lint verification

Verified locally on 2026-11-01, branch `fix/staged-lint-batches`, base
`10efe191678bd018aa17ca40d0b9f69466c09da9`. Implementation slices 1.1 and 1.2
are complete. Task 2.1 remains open: independent review and the actual 609-path
observability integration acceptance belong to the parent agent. This is not a
full repository gate or an archive decision.

## Evidence

Raw stdout, stderr, exit status, UTC start and elapsed milliseconds are retained
under `/tmp/puni-task88-evidence/`. `manifest.jsonl` records exact argv and cwd
without serializing inherited environment variables. Each label below names
`<label>.stdout`, `<label>.stderr` and `<label>.json`. The capture and mutation
scripts are retained there as `capture.ts` and `mutations.ts`.

The installed dependencies were reconciled with `bun install --frozen-lockfile`
(exit 0, 0.362s; label `dependencies`). No lockfile or dependency declaration
changed. Runtime: Bun 1.4.4; normal ESLint shebang resolves Node v24.20.0 via Volta.

## RED and GREEN

Focused command:

```sh
bun test --preload ./tools/test/scratch/preload.ts tools/tool-git-hooks/src/hooks/staged-lint.test.ts --timeout=10000
```

| Label                | Exit | Observed output                                                               | Elapsed |
| -------------------- | ---- | ----------------------------------------------------------------------------- | ------- |
| `red`                | 1    | 1 pass / 12 fail; old hook rejects `-leading.js` as an option; helper absent  | 1.458s  |
| `red-missing-eslint` | 1    | Tightened executable-path assertion: 0 pass / 1 fail before CLI existed       | 0.119s  |
| `green-initial`      | 1    | 12 pass / 1 fail; signal-name expectation exceeded wrapper contract           | 3.487s  |
| `green`              | 0    | 13 pass / 0 fail                                                              | 3.619s  |
| `green-restored`     | 0    | 13 pass / 0 fail, 36 assertions after mutation restoration and proof comments | 4.065s  |

The first RED's missing-executable case initially passed on an overly broad
`eslint` substring. It was strengthened to require the fixture's exact missing
executable path and independently watched fail before implementation.

Fixtures execute the production CLI and real installed ESLint, with a minimal
fixture-owned configuration. Its observing rule records the actual filenames,
cwd and PIDs; startup/exit events prove four distinct serial processes covering
two projects, a nested project and root sources. Spaces and a leading hyphen
survive as source arguments. Actual `no-debugger` diagnostics block later project
and workspace batches. No successful child is faked.

## Failure proofs

All mutation runs use that focused command plus `-t <test filter>`. Each mutation
was restored in `finally`; `mutation-restoration.json` records exact source hash
and successful byte comparison. Adjacent production `Proof:` comments name the
observed faults.

| Check                        | Injected fault                                                         | Production-path test                     | Observed output / label                                                                           |
| ---------------------------- | ---------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Nonempty invocation          | Remove usage guard                                                     | `empty invocation`                       | CLI wrongly exits 0; 0 pass / 1 fail, `proof-empty`                                               |
| Read failures propagate      | Swallow all read errors                                                | `genuinely unreadable`                   | chmod 000 independently produces EACCES; CLI wrongly exits 0; 0 pass / 1 fail, `proof-unreadable` |
| JSON parse boundary          | Replace JSON.parse with `{}`                                           | `present invalid manifest`               | Malformed `{`, null, array, number and string wrongly pass; 0 pass / 5 fail, `proof-json`         |
| Manifest object boundary     | Disable object guard                                                   | `present invalid manifest`               | Null, array, number and string wrongly pass; 1 pass / 4 fail, `proof-shape`                       |
| Child failures/signals block | Disable child outcome guard                                            | `rule violation\|terminated by a signal` | Both real rule violations and SIGTERM wrongly pass; 0 pass / 3 fail, `proof-child`                |
| Installed tool required      | Replace only fixture node_modules symlink with an empty .bin directory | `missing installed ESLint`               | Production spawn names exact missing executable, CLI nonzero; restored suite test passes          |
| Project grouping             | Force every source into workspace batch                                | `distinct serial`                        | One lifecycle replaces four; 0 pass / 1 fail, `proof-grouping`                                    |

Ordinary absent project manifests are separately accepted while searching upward;
absence is not substituted for an unreadable present manifest. The missing-tool
fixture never mutates real installed node_modules.

The signal config sends SIGTERM to its own ESLint runtime before its exit hook.
Volta converts the descendant's signal to direct-child exit 1 without exposing
signalCode (`signal-api`). The test checks nonzero, an actual ESLint batch failure
and a start-only lifecycle. The production code retains its signalCode guard for
runtimes that expose it; no direct signalCode observation is claimed here. A
one-off diagnostic probe also found `/usr/bin/node` absent; the installed Volta
runtime remains unchanged.

## Scoped checks

| Command                                                | Exit / output                                                   | Elapsed  | Label             |
| ------------------------------------------------------ | --------------------------------------------------------------- | -------- | ----------------- |
| `bunx nx run tool-git-hooks:test --skip-nx-cache`      | 0; 431 pass / 0 fail across 18 files, 1294 assertions; run once | 111.305s | `owner-suite`     |
| `bunx nx run tool-git-hooks:lint --skip-nx-cache`      | 1; one no-unnecessary-condition on constant `while (true)`      | 20.930s  | `lint`            |
| Same lint after `for (;;)` correction                  | 0; target succeeded                                             | 13.409s  | `lint-final`      |
| `bunx nx run tool-git-hooks:typecheck --skip-nx-cache` | 0; target succeeded                                             | 7.445s   | `typecheck`       |
| Same typecheck after loop correction                   | 0; target succeeded                                             | 1.714s   | `typecheck-final` |
| `bun node_modules/.bin/openspec validate --all --json` | 0; 307 valid / 0 failed (288 changes, 19 specs)                 | 3.837s   | `openspec-all`    |

Affected Nx format validation and final OpenSpec output are recorded under
`format-final` and `openspec-final`. The normal `git commit` hook transcript and
timing are recorded under `normal-commit`; the final SHA and its observed outcome
are recorded in `.superpowers/sdd/tasks/task-1-report.md` after the commit.

Initial Nx lint/typecheck reported daemon socket failure then fell back to normal
execution. Inherited NO_COLOR/FORCE_COLOR launcher warnings and preexisting
OpenSpec warnings remain in raw logs. They were not suppressed or counted as
clean diagnostic output. Every actual check failure above is retained.

## Remaining acceptance

- Independent implementation review and the actual large staged-file commit:
  pending, parent-owned; task 2.1 stays open and blocks archive.
- Full format/test/lint/typecheck/build host gate, CI, and production docs target:
  not run for this bounded local prerequisite; parent owns merged-candidate gates.
- Delta `staged-lint-batches` is not synced to main specs; sync/archive remain pending.
- No push, deployment, final integration merge or packet publication performed.
- Batching releases process state between projects. A single project can still
  exceed available memory; no peak-memory ceiling or 609-path acceptance is claimed.
