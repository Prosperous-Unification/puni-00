# dash-activation-relocation verification

Observed commands, results and R5 proofs per slice. Bun tests run under
`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

## S0: split without behaviour change

| Injected fault                                                        | Observed failure                                         |
| --------------------------------------------------------------------- | -------------------------------------------------------- |
| `export { ProcessReviewInvoker } from './review/invoker'` in facade   | surface equality `+ "ProcessReviewInvoker"`              |
| `Date.now()` appended to `review/invocation-journal.ts`               | scan `review/invocation-journal.ts reads a clock`        |
| `bun:sqlite` import in `review/invocation-journal.ts`                 | scan `review/invocation-journal.ts imports bun:sqlite`   |
| `new Database(process.env.PARSER_PATH ?? ':memory:')` in declarations | scan `relationships/declarations.ts opens a SQLite file` |

Each fault was restored and the test passed again.

Correction (review F2, 2026-10-12): an earlier note here called the spy in `retained raw tuple
mismatch refuses before the digest dependency is touched` vacuous. That note was wrong. The probe
behind it put the injected `hashBytes` call into the first `byPath.get(path)` in
`review-selection-objects.ts`, which is not the `read` port the test drives.

The review re-ran the probe correctly: a `hashBytes(new Uint8Array())` call before the tuple check
in `read` fails the test with `injected digest dependency reached`, both on main and at S5. The spy
on the facade namespace intercepts.

## S2: clocks

Observed 2026-10-12 on branch `batch-10/080-activation-relocation-s2` (from S1 `9f48574b1`, then
merged S1's `acaefb93a`).

`src/clock.ts` holds Dash's only `Date.now` and `performance.now`. `Monotonic` is a required
dependency of `runObservationTick` (and `ObservationCliConfig`), `ObservationFence`,
`createGitHubPullRequestSource`, `ReviewRetrievalOptions`, `LocalReviewAcquisitionInput`,
`OwnedReviewCandidateInput` and `runPinnedOfflineGh`. `WallClock` is a required argument of
`FileJournalLock.acquire`, `FileInvocationJournal.create`/`open` and `ProcessReviewInvoker`.
`runObservationService` takes `{ fetcher, clock: WallClock, monotonic }`. The two fixture child
processes that call `runObservationTick` or `runObservationCli` from outside `testing/`
(`observation-tick-process.ts`, `observation-cli-process.ts`) moved under `activation/testing/`,
so the production scan does not see them as composers. The AST detector is now
`tools/test/clock-reads/detector.ts` (project `tool-test-clock-reads`, alias
`@tools/test-clock-reads`); its own test moved beside it and runs in `tool-test-clock-reads:test`.

| Command                                                                                                                                                                | Result                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Dash suite at S1 head `9f48574b1` (without the S1 env fix)                                                                                                             | 1524 tests across 34 files; 1 fail (`common freeze core …`, the missing `TOOL_WIKI_TRUSTED_NODE_MODULES` that `acaefb93a` fixes) |
| `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT TOOL_WIKI_TRUSTED_NODE_MODULES=… bun test --preload ../../../../tools/test/scratch/preload.ts src --timeout=60000` (Dash) | 1526 pass, 0 fail, 5451 `expect()` calls, 34 files                                                                               |
| the same with `TMPDIR=/var/tmp`                                                                                                                                        | 1526 pass, 0 fail, 5455 `expect()` calls, 34 files                                                                               |
| Burokrat `no-ambient-clock`, `judge-facade`, `packaging/bundle`, `cli` tests                                                                                           | 19 pass, 0 fail (20 before: the detector's own test moved out)                                                                   |
| `bun test --timeout=10000` in `tools/test/clock-reads`                                                                                                                 | 1 pass                                                                                                                           |
| `bun test tools/tool-devsync/src/{workspace-targets,eslint-boundaries,workspace-projects,adr-index}.test.ts`                                                           | 65 pass, 0 fail (one new case)                                                                                                   |

Dash count change: `authority/no-ambient-clock.test.ts` (1 test) is replaced by
`no-ambient-clock.test.ts` (2 tests: `only clock.ts reads the wall clock`, `only the two
composition roots compose the clocks`), and `service refuses absent injected clocks before any
provider call` is new: 1524 − 1 + 2 + 1 = 1526.

Load-sensitive tests:

- `terminal close crossing only the tick deadline preserves committed completion` and its sibling
  `deadline crossing during terminal write records cancellation before COMMIT` drive
  `activation/testing/scripted-monotonic.ts`. The whole-tick budget is 60 s, so the real deadline
  timer cannot fire, and the scripted clock jumps past the tick deadline exactly where each test
  places the crossing.
- `protected registration FIFO refuses promptly without blocking the reader` keeps its child
  process. `review-journal.ts` reads no clock: the bound is the `timeout` around a child whose
  blocking `open(2)` on a FIFO would never return, which no injected clock can interrupt and which
  cannot run in-process without hanging the test runner. The bound was widened from 2 s to 30 s,
  so a loaded host's Bun start-up cannot fail it, and the `O_NONBLOCK` negative was re-observed
  under the new bound.

| Injected fault                                                         | Observed failure                                                                                                               | Restored |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------- |
| (a) `performance.now()` appended to `activation/observation-tick.ts`   | `only clock.ts reads the wall clock`: `+ "activation/observation-tick.ts"`                                                     | pass     |
| `Date.now()` appended to `authority/claims.ts`                         | same test: `+ "authority/claims.ts"`                                                                                           | pass     |
| (b) `options.monotonic ?? monotonicClock()` in `runObservationService` | `only the two composition roots compose the clocks`: `+ "activation/observation-service.ts"`                                   | pass     |
| (c) `scriptedMonotonic().advance` made a no-op                         | `deadline crossing during terminal write …`: `- "kind": "cancelled"`, `+ "kind": "complete"`, `+ "requestCount": 0`            | pass     |
| (d) `monotonic` dropped from `runDash`'s required-dependency list      | `runDash refuses missing dependencies`: `error: Dash accepted incomplete dependencies`                                         | pass     |
| (e) `Date.now()` appended to Burokrat `evidence/manual.ts`             | `the Burokrat package reads no clock outside the Dash-owned sites`: `{ line: 1058, path: "evidence/manual.ts", text: "Date" }` | pass     |
| `O_NONBLOCK` dropped from the registration open                        | FIFO test: `Expected: 0`, `Received: 124` after 30 s                                                                           | pass     |
| `'performance'` removed from the detector's clock globals              | detector test: `- 29` (the `performance.now()` sample line)                                                                    | pass     |
| Burokrat `ALLOWED_BUROKRAT_EDGES` emptied                              | graph oracle: `+ "twilight-burokrat -> tool-test-clock-reads"`                                                                 | pass     |
| Dash `['twilight-dash', 'tool-test-clock-reads']` removed              | graph oracle: `+ "twilight-dash -> tool-test-clock-reads"`                                                                     | pass     |
| Burokrat test override widened to `^@tools/`                           | `lets Burokrat tests reach only the clock-read detector`: `- "^@tools/test-clock-reads$"`, `+ "^@tools/"`                      | pass     |
| Burokrat product policy returns `[]`                                   | `bunx eslint …/twilight-burokrat/cli/src`: `4:1 error … @nx/enforce-module-boundaries`                                         | pass     |
| `^@tools/test-clock-reads$` removed from the Dash test override        | uncached `twilight-dash:lint`: `4:1 error … @nx/enforce-module-boundaries`                                                     | pass     |

`runObservationService` gained no clock check of its own: an omitted clock throws at its first
read inside the tick, before any GET, which `service refuses absent injected clocks before any
provider call` shows (exit 1 and zero fetches for each omission; exit 0 with fetches once both are
present). An explicit check there could not be made to fail distinguishably, so none was added.

## S4: launcher bundle and units

Observed 2026-10-12 on branch `batch-10/080-activation-relocation-s4` (from S2 `025bcc28a`).

`src/packaging/build.ts` exports `launcherBuildConfig()` (Bun.build, target `bun`, format `esm`,
entry `activation/observation-service-cli.ts`) and `buildLauncher(destination)`, which
`twilight-dash:build` runs to write
`dist/apps/twilight-structure/twilight-dash/cli/observation-service.mjs` (git-ignored by `dist/`)
and print its SHA-256. The target is uncached and has no `dependsOn`, as Burokrat's `build` is
uncached; its inputs name the three source roots the bundle reads. `render-cli.ts` became
`units/bundle.ts` without its `import.meta.main` block, so `render-observation-units` in `runDash`
is the only way to render (V5 names no other CLI). The rendered units are
`twilight-dash-observation.{service,timer}`; the template file names and every other byte except
the timer's `Unit=` are unchanged, and host directories, account and digests stay layout inputs.
Before S4, `units.test.ts` never ran `systemd-analyze`; it now runs `systemd-analyze verify` on
the rendered pair, requires exit 0 and empty output (an unknown key exits 0 with a warning), and
throws when `Bun.which('systemd-analyze')` is null. This host has `/usr/bin/systemd-analyze`
(systemd 255).

| Command                                                                                                                     | Result                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run twilight-dash:build --skip-nx-cache`                                                                           | `c549751b4ade830bef29d6d680b676041bd78da6d7e2add0f0df1ea4d789140f  …/dist/apps/twilight-structure/twilight-dash/cli/observation-service.mjs`; target succeeded |
| Dash suite at S2 head `025bcc28a`                                                                                           | 1526 pass, 0 fail, 5451 `expect()` calls, 34 files                                                                                                             |
| Dash suite after S4                                                                                                         | 1533 pass, 0 fail, 5473 `expect()` calls, 35 files                                                                                                             |
| the same with `TMPDIR=/var/tmp`                                                                                             | 1533 pass, 0 fail, 5477 `expect()` calls, 35 files (second run; see below)                                                                                     |
| `bunx tsc --build --force apps/twilight-structure/twilight-dash/cli/tsconfig.json`                                          | exit 0                                                                                                                                                         |
| `bunx nx run twilight-dash:lint --skip-nx-cache`                                                                            | `Successfully ran target lint for project twilight-dash`                                                                                                       |
| `bun test tools/tool-devsync/src/{workspace-targets,eslint-boundaries,workspace-projects,adr-index,toolchain-pins}.test.ts` | 87 pass, 0 fail                                                                                                                                                |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                    | 183 items, 183 passed, 0 failed                                                                                                                                |

The first `TMPDIR=/var/tmp` run overlapped an uncached `twilight-dash:lint` and an OpenSpec
validation on this host and failed 11 `enrollment-plan.test.ts` subprocess tests (for example
`retains fleet refusal for digest through Dash`: `Expected … /lacks reviewed inventory/`,
`Received: ""`, each child ending in about 240 ms with empty stderr). That file alone under
`TMPDIR=/var/tmp` then passed 33/33, and the full rerun without concurrent load passed. S4 does not
touch the enrollment path; the empty-stderr failure under load is recorded, not explained.

Dash count change: `packaging/bundle.test.ts` adds 5 tests (marker scan, reported SHA-256, two
malformed-argv runs of the built launcher, refused ambiguous build) and `units.test.ts` adds 2
(`rendered units pass systemd-analyze verify`, `render-observation-units refuses a malformed
grammar before any effect`): 1526 + 7 = 1533. Every moved test kept its name.

The launcher is 7.4 MB because the judge facade's relationship analysis bundles the TypeScript
compiler.

Review F1 (2026-10-12) found that the launcher depended on the checkout path. Bun inlined
TypeScript's CommonJS `__dirname`/`__filename` as absolute paths. It also wrote per-module comments
with paths relative to the building process's working directory. Two builds of `b1c1112f2` at
different paths therefore gave different SHA-256s.

`build.ts` now fixes both causes:

- whitespace minification drops the comments;
- `normaliseLauncher` makes every occurrence of the checkout root workspace-relative, and throws if
  the root survives.

The new test `two checkouts at different paths build byte-identical launchers` copies every build
input into two temporary roots and requires equal digests. It also requires that neither bundle
names its own root, `/home/` or the workspace, and that no path comment remains. The marker test
also asserts that a real-root build contains neither the workspace root nor `/home/`.

| Injected fault                           | Observed failure                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| root normalisation and its throw removed | `bundle.includes(root)`: `Expected: false`, `Received: true`                     |
| whitespace minification removed          | `Received: "// ../../../../../../../../..node_modules/source-map/lib/base64.js"` |

After the fix, `bunx nx run twilight-dash:build --skip-nx-cache` printed
`16b4998f5491927f2f8b620f5ec08f2d90d79ee1298bcee17111df31e7d95a0f` (7,436,808 bytes).

| Injected fault                                                                                           | Observed failure                                                                                                                                           | Restored |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `import { openAuthority } from '../authority/authority-store'` plus an argv-guarded call in the launcher | `the observation launcher carries no admission authority or fleet planner`: `+ "authority_generation"`                                                     | pass     |
| bare `import '../authority/authority-store'` in the launcher                                             | none: tree-shaken, no marker in the bundle (recorded in the test's `Proof:`)                                                                               | n/a      |
| `built.outputs.length !== 1` dropped from `buildLauncher`                                                | `an unsuccessful or ambiguous launcher build refuses before writing`: `TypeError: undefined is not an object`                                              | pass     |
| `@LAUNCHER_PATH@ @SERVICE_CONFIG_PATH@` swapped in the service template                                  | `renderer binds exact …`: exact `ExecStart=` equality, `- …observation-service.mjs /etc/…/service.json`, `+ …/service.json /opt/…/observation-service.mjs` | pass     |
| `Restart=no` renamed `Restartt=no` in the service template                                               | `rendered units pass systemd-analyze verify`: `Unknown key name 'Restartt' in section 'Service', ignoring.` (exit stayed 0)                                | pass     |
| PATH holding only `bun`                                                                                  | same test: `error: systemd-analyze is required to verify the observation units; install systemd`                                                           | pass     |
| timer `Unit=` restored to `tool-wiki-observation.service`                                                | `timer artifact cannot grant execution authority`: `Expected to contain: "\nUnit=twilight-dash-observation.service\n"`                                     | pass     |
| `argv.length !== 2` dropped from `renderObservationUnitsCommand`                                         | `render-observation-units refuses a malformed grammar …` at `[]`: `Received: "Error: observation unit rendering refused; …"`                               | pass     |
| empty-or-`--` argument check dropped                                                                     | same test at `["--layout", …]`: the same received refusal                                                                                                  | pass     |
| re-observed: `Restart=no` removed (template `Proof: restart`)                                            | `observation service template requires …` and `renderer binds exact …`: `Expected to contain: "Restart=no"`                                                | pass     |
| re-observed: `ExecStart=/bin/true` added to the timer (template `Proof: timerexec`)                      | `timer artifact cannot grant execution authority`: `Expected to not contain: "ExecStart"`                                                                  | pass     |
| re-observed: the root-account check in `render.ts` replaced by `false` (`Proof: account`)                | `renderer refuses root account unsafe layout …`: `Received function did not throw`                                                                         | pass     |
