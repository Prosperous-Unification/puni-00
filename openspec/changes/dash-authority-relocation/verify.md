# dash-authority-relocation verification

Observed commands, results and R5 proofs per slice. Bun tests run under
`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`; Burokrat tests use the project target's
`TOOL_WIKI_TRUSTED_NODE_MODULES` and the scratch preload.

## S0: split without behaviour change

| Command                                                                                                    | Result                                                                            |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `bun test … src/admission src/cli.test.ts` at `99ab00fb0` (focused baseline)                               | 152 pass, 0 fail, 723 assertions, 9 files                                         |
| `bun test … src/admission-judge src/admission-runtime src/cli.test.ts` after S0.1                          | 152 pass, 0 fail, 723 assertions; sorted test names identical                     |
| `bun test … src/admission-judge src/admission-runtime src/cli.test.ts src/judge-facade.test.ts` after S0.4 | 153 pass, 0 fail, 726 assertions, 11 files; names identical plus the facade case  |
| multiset of `Proof:` lines under `admission/` at `99ab00fb0` vs `admission-judge/` + `admission-runtime/`  | identical (172)                                                                   |
| `bun …/cli.ts check-indexes working . HEAD`                                                                | exit 0                                                                            |
| `bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                                         | old pin failed on observed digest `a68a8631…` at 321 occurrences; re-pinned 15/15 |

| Injected fault in the facade fence                 | Observed failure                                           |
| -------------------------------------------------- | ---------------------------------------------------------- |
| export `openAuthorityStore` from `judge-facade.ts` | surface equality `+ "openAuthorityStore"`                  |
| `Date.now()` in `packet-judgment.ts`               | scan `admission-judge/packet-judgment.ts reads a clock`    |
| `node:https` import in `packet-codec.ts`           | scan `admission-judge/packet-codec.ts reaches the network` |

Each fault was restored and the test passed again.

## S1: the runtime half moves to Dash

| Command                                                                                                                                       | Result                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `bun test --preload … src --timeout=30000` in `twilight-dash/cli`                                                                             | 187 pass, 0 fail, 9 files; the 131 moved test names equal their S0 names |
| `bun test … src/admission-judge src/cli.test.ts src/judge-facade.test.ts src/packaging/bundle.test.ts src/packaging/build.test.ts` (Burokrat) | 26 pass, 0 fail                                                          |
| `bun test tools/tool-devsync/src/eslint-boundaries.test.ts`                                                                                   | 21 pass, 0 fail                                                          |
| `bun test tools/tool-devsync/src/workspace-projects.test.ts tools/tool-devsync/src/namespace-layout.test.ts`                                  | 40 pass, 0 fail                                                          |
| `bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts tools/tool-devsync/src/sync.test.ts`                                        | 67 pass, 0 fail                                                          |
| `NX_DAEMON=false bunx nx run twilight-dash:lint --skip-nx-cache`                                                                              | exit 0                                                                   |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                      | 171 passed, 0 failed                                                     |

| Injected fault                                                    | Observed failure                                                                                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| remove Dash's `authority/**` lint override                        | uncached `twilight-dash:lint`: 8 × `Imports of apps are forbidden`                                                                                |
| widen the authority allow to `^@twilight-burokrat/`               | `Dash authority reaches only the judge alias` at the exact allow-list assertion                                                                   |
| drop the `twilight-dash -> twilight-burokrat` graph pair          | graph oracle reports `twilight-dash -> twilight-burokrat`                                                                                         |
| re-add Burokrat's `submit-admission` route importing Dash's store | `submit-admission is an unknown command`: cli.ts printed `admission packet base must be an object`; bundle test found all three authority markers |
| re-add only the `bin.ts` `validatorCommands` entry                | bin.ts entry exited `null` instead of 1                                                                                                           |
| keep the handoff digest `a68a8631…`                               | observed `7b8d87be…` at 321 occurrences                                                                                                           |

## S2: the clock is required and composed once

| Command                                                           | Result                     |
| ----------------------------------------------------------------- | -------------------------- |
| `bun test --preload … src --timeout=30000` in `twilight-dash/cli` | 190 pass, 0 fail, 11 files |

| Injected fault                                                     | Observed failure                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `options.clock ?? { read: () => Date.now() }` in `requiredOptions` | `refuses construction without a clock`: SQLite half `Received function did not throw` |
| `Date.now()` appended to `claims.ts`                               | `only clock.ts reads the wall clock`: `+ "authority/claims.ts"`                       |
| `deps.clock ?? wallClock()` in `runDash`                           | same test: `+ "cli.ts"` among `wallClock()` composers                                 |
| dependency check in `runDash` turned into `continue`               | `runDash refuses missing dependencies`: `deps.planEnrollment is not a function`       |

## S3: absence refuses, bootstrap is explicit, identity is pinned

| Command                                                           | Result                     |
| ----------------------------------------------------------------- | -------------------------- |
| `bun test --preload … src --timeout=30000` in `twilight-dash/cli` | 200 pass, 0 fail, 13 files |
| `NX_DAEMON=false bunx nx run twilight-dash:lint --skip-nx-cache`  | exit 0                     |

Mandatory proof "missing versus unreadable adoption state": `authority-store.db.test.ts` cases
`refuses an absent authority instead of creating one` and `distinguishes an unreadable authority
from an absent one` (file mode `0000`; `module-wiki` mode `0600`, refused for uid 0).

| Injected fault                                                      | Observed failure                                                                                                |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `openAuthority` falls back to creation on `absent`                  | `refuses an absent authority instead of creating one` received a store                                          |
| every `lstat` failure mapped to `absent`                            | `distinguishes an unreadable …`: `absent` instead of `unreadable`/EACCES                                        |
| under-lock `exists` refusal dropped                                 | `bootstrap refuses an existing authority`: `corrupt` instead of `exists`                                        |
| post-wait `exists` refusal dropped                                  | `two bootstraps …`: `Error: authority initialization ended without a database`                                  |
| `mkdirSync(module-wiki)` restored in `resolveAuthorityDatabasePath` | `open creates no directory` and the absent case observe the directory                                           |
| `CHECK (generation >= 1)` weakened to `>= 0` in `SCHEMA`            | golden equality diff; the Burokrat dump refused `schema is incompatible`                                        |
| bootstrap grammar loosened to `argv.length === 0`                   | CLI canary: Dash accepted `bootstrap-authority <root> extra`                                                    |
| unknown commands routed to bootstrap                                | CLI canary: Dash accepted `acquire-claims <root>`                                                               |
| inspect grammar check deleted                                       | CLI canary: `authority absent` instead of usage for `--sessions a`                                              |
| `exists` refusal dropped (CLI)                                      | second `bootstrap-authority`: `authority database corrupt or incompatible: table authority_meta already exists` |

A pre-lock `exists` check was removed rather than kept: with it present, the under-lock check
could not be observed failing (8 concurrent rounds stayed green with it removed).
`enrollment-plan.test.ts` does not observe a restored `mkdirSync`, because planning never
resolves the authority path; the design's expectation there was wrong.

Dump production (pre-relocation code, S0 commit `e57278139`):

```sh
git -C <S0 worktree> archive e57278139 apps/twilight-structure/twilight-burokrat/cli/src | tar -x -C <scratch>
ln -s <repo>/node_modules <scratch>/node_modules   # plus <scratch>/tsconfig.json mapping @shared/validation
# append the `golden producer` case to <scratch>/…/admission-runtime/integration-races.test.ts:
# preparePublication('golden') → publishIntegrationRefs → finalizeIntegrationPublication,
# a submitted session `two`, a working session `three` with a conflict group, then
# `sqlite3 <db> .dump`, `sqlite3 <db> .schema` and `inspect()` before cleanup
GOLDEN_OUTPUT=<out> bun test src/admission-runtime/integration-races.test.ts -t "golden producer"
```

`fixtures/authority/module-wiki-authority.v5.sqlite-dump` is that `.schema` plus a fresh store's
meta row; `burokrat-written-v5.sqlite-dump` and `.state.json` are the dump and `inspect()`
output. They are not named `.sql`: every tracked `.sql` file is a migration, and migration lint
refuses one outside a migration tree.

## Fable review fixes (S1, S3)

| Finding                                                                             | Fix                                                                                           | Observed negative                                                                                                      |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `inspect()` ran `transact` (BEGIN IMMEDIATE, rewrite, COMMIT)                       | deferred read-only snapshot with bounded busy retry                                           | old path: file sha256 and mtime changed; on a `0444` file in a `0555` directory `attempt to write a readonly database` |
| spec said the bundle omits `bun:sqlite`                                             | spec names the authority markers and allows the judge's in-memory parser                      | — (contract text)                                                                                                      |
| refusals printed Bun stack traces                                                   | entrypoint prints one `error: <message> [codes]` line; cause codes only, never cause messages | entrypoint without the catch failed `a refused command prints one line on stderr and exits 1`                          |
| fixture helper importable from production                                           | `@typescript-eslint/no-restricted-imports` on Dash production files                           | without the override `keeps Dash authority test helpers out of production modules` failed                              |
| clock scan missed `Date()`, `Bun.nanoseconds`, `performance.timeOrigin`, entrypoint | widened pattern, entrypoint scanned                                                           | each of the three appended to entrypoint.ts named `entrypoint.ts`                                                      |

Dash suite 202/0; devsync oracles 129/0; uncached `twilight-dash:lint` exit 0.

## S4: exact-identity submission retry and the lifecycle model

| Command                                                           | Result                     |
| ----------------------------------------------------------------- | -------------------------- |
| `bun test --preload … src --timeout=30000` in `twilight-dash/cli` | 209 pass, 0 fail, 14 files |

Mandatory proof "lost-response reconciliation" (submission half): `submit.test.ts` cases
`an exact repeated submission returns the same report without a write` (CLI twice, byte-equal
stdout and database) and `a different candidate after a lost response is refused`; publication
half in S5.

| Injected fault                                            | Observed failure                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| exact-repeat branch dropped in `submitGenerationMatching` | `an exact repeated submission is a no-op`: `generation already submitted: session-a`; the CLI case: outputs differ        |
| `transact` rewrites rows when the operation wrote nothing | same test: database sha256 changed                                                                                        |
| authority comparison dropped from the exact-repeat branch | `an equal submission under a different authority binding is still refused`: returned the token                            |
| store opened before the packet is decoded                 | `submit-admission refuses before opening the store on a malformed packet`: `authority absent` instead of the packet field |
| five lifecycle sabotages                                  | `authority lifecycle matches its model across concurrent processes`; counterexamples in its `Proof:`                      |

## S5: `recover-publication` and the mandatory proofs

| Command                                                           | Result                     |
| ----------------------------------------------------------------- | -------------------------- |
| `bun test --preload … src --timeout=30000` in `twilight-dash/cli` | 213 pass, 0 fail, 14 files |

Each recovery test has process A's work done in the test process (store closed afterwards, so no
in-memory state survives). Process B is the real entrypoint, `recover-publication`, run as a
fresh Bun process.

| Injected fault                                                       | Observed failure                                                                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `updateRefs` bypassed when the marker is absent                      | `a fresh process publishes a reserved integration whose refs never moved`: `waiting` report, refs unchanged                   |
| marker-proven finalization deleted from `publishReservedIntegration` | `a fresh process finalizes a marker-proven publication without a second CAS`: `terminal` `starvation` (queued 10 min earlier) |
| `published` branch removed from `recoverPublication`                 | `repeated recovery reports the same publication and moves no ref`: `needs a certifier … is published`                         |
| `recover-publication` grammar loosened to `argv.length < 3`          | CLI canary: `authority absent` instead of usage                                                                               |

A Git `reference-transaction` hook cannot observe a stale second CAS: Git refuses the old value at
`prepare`, before the hook runs. The deleted branch shows up only through the deadline ordering.

### The six mandatory proofs (observed passing at this head)

1. **Interrupted publication before and after ref movement**: `a fresh process publishes a
reserved integration whose refs never moved`; `a fresh process finalizes a marker-proven
publication without a second CAS`.
2. **Missing versus unreadable adoption state**: `refuses an absent authority instead of creating
one`; `distinguishes an unreadable authority from an absent one` (S3).
3. **Overlapping worktree claims**: `two Bun processes atomically refuse overlap and both admit
disjoint work`; the lifecycle model's I5 (S4).
4. **Old-writer fencing**: `separate processes fence stale generations and preserve a successor
and frozen publication`; `every old-writer mutation is fenced after successor acquisition`;
   `a restarted coordinator fences a durable checking attempt and stale certification`; `a stale
attempt identity cannot reserve an equal checked candidate`.
5. **Lost-response reconciliation**: `an exact repeated submission returns the same report without
a write`; `a different candidate after a lost response is refused` (S4); `repeated recovery
reports the same publication and moves no ref`; token recovery through `inspect-authority
--session` (`inspect-authority prints the state and refuses an absent store`, S3).
6. **Rollback preserving accepted identities**: S6.

## S6: rollback proof and documents

Mandatory proof "rollback preserving accepted identities":
`integration-races.test.ts`: `the pre-relocation authority opens a Dash-written store with
identical state and continues its generations`. Dash writes a store with a published
integration and its marker, a submitted session, a live session and a released session. The test
verifies the SHA-256 of the vendored `fixtures/authority/pre-relocation-burokrat.tar`
(`502f07f7…04aa`, the exact `git archive` of the old runtime modules' import closure and
`@shared/validation` at `e57278139`; command in the fixture README), extracts it into scratch,
and loads the old `admission-runtime/{authority-store,claims,generations}.ts`. The old
`openAuthorityStore` opens the store, and its `inspect()` deep-equals Dash's. Old `acquireClaims`
continues at Dash's `nextGeneration` and refuses an overlapping path. Old `heartbeatGeneration`
accepts Dash's live token and refuses the released one (`generation is terminal: released`). No
repository history is read, so a squash, rebase or gc of `e57278139` cannot break the proof.

| Injected fault                                                                                     | Observed                                                                                                                   |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| none (built-in live half): one persisted status flipped to `publishedx` with check constraints off | old open refused `authority database corrupt or incompatible`                                                              |
| the flip removed                                                                                   | the same old open returned a store; the assertion failed                                                                   |
| digest comparison removed                                                                          | `the vendored pre-relocation archive is refused when missing or altered`: an altered archive loaded (`the archive loaded`) |
| read guard removed                                                                                 | same case: bare `ENOENT` instead of `pre-relocation authority archive is unreadable`                                       |

Documents: ADR 0050 (0048 and 0049 were taken), the pointer line in ADR 0021, `names.md` row and
bullet, `LLM_README.md` line (139 lines), and three `CONTEXT.md` terms (Generation, Publication
marker, Authority bootstrap). Dash README lists five commands.

## 2026-10-14: lifecycle fixture contention budget

PR #460 (`6586e69ae96d36b1326bf1af79e52be4b069e333`) changed no Twilight code,
dependencies or CI workflow. CI run `38541110423` failed the lifecycle property in both
attempts on exhaustion of the existing 50-attempt, 5 ms worker budget. Attempt 2 reached the
three-overlapping-acquisitions case after 60.77 seconds; the isolated property passed in
16.06 seconds. A single-CPU baseline passed in 52.68 seconds; adding competing CPU work on
that CPU passed in 75.90 seconds. These timings support scheduling pressure, but the CI logs
do not identify the particular lock holder's stall.

The deterministic reproducer holds a real SQLite reserved writer lock until all three
contenders have opened the authority and announced their acquisition attempt, then releases
it after 600 ms. With the old fixture budget, two observed runs failed: all contenders returned
`untyped: authority database remained busy after 50 attempts`, rather than one winner and two
overlap refusals. The explicit fixture options now use the production-supported ceilings of
100 attempts and 50 ms delay: at most 99 sleeps, or 4.95 seconds, per retry loop. Production
defaults, option validation, overlap checks and all six model invariants are unchanged.

This restores the existing model's eventual-linearization intent within a deliberate finite
fixture budget; no new observable production behavior or OpenSpec delta is introduced. It does
not promise progress under unlimited lock retention or unlimited operating-system starvation.

| Check or injected fault                                                                                                                                          | Observed outcome                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-dash/cli/src/authority/authority-lifecycle.model.test.ts --timeout=60000` | 3 pass, 0 fail, 106 assertions, 25.75 s; existing property 17.41 s                                                |
| Real writer held 600 ms, then released                                                                                                                           | Exactly generation 1 acquired, two overlap refusals; one persisted owner and next generation 2                    |
| Real writer kept locked                                                                                                                                          | Worker exhausted 100 attempts; test 5.82 s, no owner persisted and next generation remained 1                     |
| Production `pathsOverlap` replaced with `false`, then restored                                                                                                   | Stalled-writer regression failed: three acquired owners at generations 1, 2 and 3 instead of two overlap refusals |
| `bunx tsc --build --force apps/twilight-structure/twilight-dash/cli/tsconfig.json`                                                                               | Exit 0                                                                                                            |

Two whole-file repetitions used `taskset -c 0` for the test runner (inherited by its workers)
and a competing Python CPU loop with a 190-second deadline on the same CPU. Both passed all
three tests and 106 assertions in 96.61 and 92.51 seconds; the existing property took 81.16
and 77.42 seconds. The other CPUs were available to unrelated host work.

Additional scoped checks:

- The same Bun test command against `claims.db.test.ts` with `-t 'bounds|retries'`: 3 pass,
  0 fail, 10 assertions (write-lock convergence, reader-blocked commit convergence and bounded
  rollback); with `-t 'finite authority budget'`: 1 pass, 0 fail, 2 assertions.
- `bunx eslint apps/twilight-structure/twilight-dash/cli/src/authority/authority-lifecycle.model.test.ts`:
  exit 0 after `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph --file=/tmp/twilight-contention-graph.json`
  populated the cached graph; no skipped rules. The first direct lint attempt warned that no
  cached graph existed and skipped module boundaries, so it was repeated after graph creation.
- Prettier check on the changed test and this record, and `git diff --check`: exit 0.

The two added regression cases account for approximately 7.5 seconds of the isolated file's
duration. Existing claim/database suites already prove attempt and delay validation and
whole-transaction retry; this fix changes only the model fixture's options and its tests.
The full host gate and CI rerun belong to the integration owner; neither is claimed by these
scoped checks.

### Review correction: measure no retry duration in the parent

The parent observed the worker's attempt marker before starting its stopwatch. A parent paused
while the child retries can observe that marker late, so its elapsed time cannot establish the
child's retry duration. Both parent duration assertions have been removed. Exact 100-attempt
exhaustion, the finite 60-second test timeout, no persisted claims and the separate production
transaction-delay tests remain; all model outcomes and delayed-writer overlap assertions are
unchanged.

A temporary diagnostic paused only the test parent with `SIGSTOP` immediately after writing the
start barrier. A Python observer waited for the child's attempt marker, allowed the child one
second of retry time, then resumed the parent with `SIGCONT`. Before the correction, the exact
exhaustion assertion passed but the timing assertion failed: 4161.44 ms observed versus a
4500 ms minimum. After removing the timing assertions, the same parent pause passed: 1 test,
4 assertions, 0 failures; no owner was persisted and the next generation remained 1. The pause
instrumentation was then removed. Reproducer and logs are `/tmp/twilight-parent-pause.py`,
`/tmp/twilight-parent-paused-red.log` and `/tmp/twilight-parent-paused-green.log`.

After restoring the ordinary runner, the whole lifecycle file passed: 3 tests, 104 assertions,
0 failures in 28.25 seconds (existing property 19.67 seconds). The scoped production contention
checks passed again: 3 tests, 10 assertions, 0 failures in 2.07 seconds. Typecheck, ESLint with
the cached graph, Prettier and `git diff --check` all exited 0. The full host gate and CI remain
the integration owner's checks.
