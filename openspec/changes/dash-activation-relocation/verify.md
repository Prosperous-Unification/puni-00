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

Finding: the test `retained raw tuple mismatch refuses before the digest dependency is touched`
spies on `hashBytes` through a module namespace. It still passed with a `hashBytes` call injected
before the tuple check, both on main `21a6bd537` and after S0. The spy never intercepts, so its
`not.toHaveBeenCalled` assertion proves nothing. This change does not fix it.

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
