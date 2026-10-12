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

## S3: observation store ownership

Observed 2026-10-12 on branch `batch-10/080-activation-relocation-s3` (from S2 `025bcc28a`).

`runDash` gains `bootstrap-observation <service.json>` and `migrate-observation <service.json>`
(`activation/observation-commands.ts`). Each parses exactly one non-flag argument, then reads the
protected service configuration through `readObservationStateConfig`, the same reader the
observation service uses. The typed refusals (`ObservationStoreError.failure`) are decided before
the observation lock is taken. `bootstrap-observation` is `initializeObservationState` (v9) then
`migrateObservationRecoveryState` (v10), each under its own hold of `observation.lock`, so it
creates exactly the store the service tests build. `migrate-observation` reads `user_version`
through a read-only handle and runs the steps from that version: 8 runs `migrateObservationState`
then `migrateObservationRecoveryState`; 9 runs the second only. It prints
`{"path","status":"migrated","from","to":10}`.

| Command                                                                                                                                                                | Result                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Dash suite before S3 (S2 head `025bcc28a`)                                                                                                                             | 1526 pass, 0 fail, 5451 `expect()` calls, 34 files                                              |
| `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT TOOL_WIKI_TRUSTED_NODE_MODULES=… bun test --preload ../../../../tools/test/scratch/preload.ts src --timeout=60000` (Dash) | 1537 pass, 0 fail, 5518 `expect()` calls, 36 files                                              |
| the same with `TMPDIR=/var/tmp`                                                                                                                                        | 1537 pass, 0 fail, 5522 `expect()` calls, 36 files                                              |
| `bunx tsc --build --force apps/twilight-structure/twilight-dash/cli/tsconfig.json`                                                                                     | exit 0                                                                                          |
| `bunx nx run twilight-dash:lint --skip-nx-cache`                                                                                                                       | `Successfully ran target lint for project twilight-dash`                                        |
| `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts $(git ls-files '*.sql')`                                                                                     | exit 0 (the dumps are `.sqlite-dump`, not `.sql`)                                               |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                               | 183 items, 183 passed, 0 failed                                                                 |
| `bun test tools/tool-devsync/src/{workspace-targets,eslint-boundaries,workspace-projects,adr-index}.test.ts`                                                           | 65 pass, 0 fail (a first run concurrent with the Dash suite saw 9 fail; rerun alone 65/0 twice) |

Dash count change: `observation-commands.db.test.ts` adds 9 tests and `schema-golden.test.ts`
adds 2, so 1526 + 11 = 1537 across 36 files.

| Injected fault                                                                | Observed failure                                                                                                                                                                                      | Restored |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `CHECK (sequence >= 1)` weakened to `>= 0` in `AttemptDefinition`             | golden equality: `- … CHECK (sequence >= 1) …`, `+ … CHECK (sequence >= 0) …`; the Burokrat-written store: `observation recovery table malformed: activation_observation_attempt`                     | pass     |
| exact-definition comparison removed from `readRecovery` (renamed-column dump) | still refused before any attempt, later: `- "observation recovery table malformed: activation_observation_attempt"`, `+ "Validation failed: classification must be a string or null (was missing) …"` | pass     |
| `current` check removed from `migrate-observation`                            | `Dash accepted migrate-observation and printed {"path":…,"status":"migrated","from":10,"to":10}`                                                                                                      | pass     |
| absent pre-check removed from `migrate-observation`                           | canary: `Expected: "absent"`, `Received: "unreadable"` (the read-only open still created nothing)                                                                                                     | pass     |
| absent pre-check and the read-only flag both removed                          | canary: `- []`, `+ ["activation.sqlite"]`                                                                                                                                                             | pass     |
| read-only flag alone removed                                                  | 9 pass: masked by the absent pre-check; recorded, not claimed as a proof                                                                                                                              | —        |
| `exists` pre-check removed from `bootstrap-observation`                       | `error: observation state already exists` (untyped) in the bootstrap and canary tests                                                                                                                 | pass     |
| every `lstat` failure mapped to absence                                       | search-denied test: bootstrap reached the lock, `observation protected path malformed: …/state`                                                                                                       | pass     |
| `version` check removed (version-7 store)                                     | `error: observation migration requires version 8` (untyped)                                                                                                                                           | pass     |
| `activation_request` table check removed (foreign v9 file)                    | `error: observation state partial: activation_request` (untyped)                                                                                                                                      | pass     |
| grammar loosened to `argv.length === 0`                                       | `Dash accepted bootstrap-observation and printed {…"status":"bootstrapped","version":10}`                                                                                                             | pass     |
| `--` test dropped from the grammar                                            | `bootstrap-observation --force`: `Expected: "usage: …"`, `Received: "observation service configuration unavailable"`                                                                                  | pass     |

Assumptions:

1. `PRE_RELOCATION_SHA` is `802c26bd8`, the S0 head; the S0 merge commit does not exist yet.
   Between main `21a6bd537` and `802c26bd8`, `observation-state.ts`, `controller.ts`,
   `bootstrap.ts`, `github-reader.ts` and `github-source.ts` differ only in import lines
   (`git diff 21a6bd537 802c26bd8 -- <those five>` filtered to non-import lines is empty).
2. "`withObservationAttempt` continues the sequence" is read as `withRecoveryObservation`: at v10
   that is the attempt path, while `withObservationAttempt` is the v9 path and refuses a v10 store
   (`observation state schema unsupported`).
3. `openActivationController` keeps creating an absent database. It is the creation primitive
   `initializeObservationState` uses on its temporary path, and the controller tests open fresh
   stores through it. Every observation entry point (`withObservationAttempt`,
   `withRecoveryObservation`, both migrations) already refuses absence, which
   `scheduled observation refuses absent state before provider work` proves. Making the
   controller refuse would change no observation behaviour.
4. The typed refusals are decided outside the lock, because the existing operations each take it
   themselves and a second `flock` on a new descriptor in the same process reports busy. Every
   operation keeps its own version fence inside the lock, so a racing writer gets the untyped
   inner refusal, never a second store. A bootstrap interrupted between its two steps leaves a v9
   store; `bootstrap-observation` then refuses `exists` and `migrate-observation` finishes it.
5. `bootstrap-observation` requires the state directory to exist (it refuses with
   `observation protected path absent`) and never creates it, as before. The spec states this.
6. A store file SQLite cannot read (`SQLITE_NOTADB`, `SQLITE_CANTOPEN`) is `unreadable`; a
   readable file without `activation_request` is `unsupported-version`.
7. `busy` from either step throws `observation store busy …`; it is not one of the five typed
   refusals and has no new test.

### Fixture production

The producer ran from a detached worktree of `802c26bd8` with the repository's `node_modules`
symlinked in, under `/tmp/claude-1000/s3` (mode `0700`, because the store refuses a replaceable
ancestor). Commands are in `fixtures/activation/README.md`. The producer, never committed:

```ts
// Scratch producer for DS/fixtures/activation; never committed. Run from the pre-relocation tree.
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';

import { hashBytes, serializeCanonical } from '../judge-facade';
import { GitHubReadFailure } from './github-reader';
import {
  initializeObservationState,
  migrateObservationRecoveryState,
  withRecoveryObservation,
} from './observation-state';

const output = process.env.GOLDEN_OUTPUT;
if (output === undefined) throw new Error('GOLDEN_OUTPUT is required');
const bootstrap = {
  schemaVersion: 1,
  authorityGeneration: 3,
  reviewer: {
    kind: 'external-audit-provider',
    providerId: 'review.provider',
    executorId: 'review.executor',
    protocolIdentity: 'a'.repeat(64),
    promptIdentity: 'b'.repeat(64),
  },
  journal: {
    kind: 'authenticated-external-journal',
    verifierId: 'journal.verifier',
    issuerId: 'journal.issuer',
    endpoint: 'https://journal.example.invalid/v1',
  },
  publisher: {
    kind: 'immutable-external-store',
    issuerId: 'publisher.issuer',
    endpoint: 'https://store.example.invalid/activations',
  },
  admission: { requiredWorkflow: '.github/workflows/trusted-wiki.yml', protectedBranch: 'main' },
};
const binding = {
  repositoryId: 8241,
  owner: 'Prosperous-Unification',
  name: 'puni-00',
  targetRef: 'refs/heads/main',
  policyIdentity: '3'.repeat(64),
  mappingIdentity: '4'.repeat(64),
  toolkitIdentity: '5'.repeat(64),
  readDeadlineMs: 1000,
};
const policy = {
  maxAttempts: 3,
  wholeTickMs: 5000,
  maxSubjects: 100,
  initialDelayMs: 100,
  maxDelayMs: 400,
  fallbackDelayMs: 200,
  recoveryProbeMs: 1000,
  horizonMs: 5000,
};

function store(name: string) {
  const stateDirectory = join(output, name);
  mkdirSync(stateDirectory, { mode: 0o700 });
  chmodSync(stateDirectory, 0o700);
  const bootstrapPath = join(output, `${name}.bootstrap.json`);
  const bytes = serializeCanonical(bootstrap);
  writeFileSync(bootstrapPath, bytes, { mode: 0o600 });
  let now = 1_000_000;
  return {
    advance: (to: number) => {
      now = to;
    },
    config: {
      stateDirectory,
      bootstrapPath,
      pin: {
        identity: hashBytes(bytes),
        journalIssuerId: 'journal.issuer',
        publisherIssuerId: 'publisher.issuer',
      },
      binding,
      policy,
      clock: () => now,
    },
  };
}

const fresh = store('fresh');
console.log(await initializeObservationState(fresh.config));
console.log(await migrateObservationRecoveryState(fresh.config));

const written = store('written');
console.log(await initializeObservationState(written.config));
console.log(await migrateObservationRecoveryState(written.config));
written.advance(1_001_000);
console.log(
  JSON.stringify(
    await withRecoveryObservation(written.config, () =>
      Promise.resolve({ kind: 'complete' } as const),
    ),
  ),
);
written.advance(1_002_000);
try {
  await withRecoveryObservation(written.config, () =>
    Promise.reject(new GitHubReadFailure('unavailable', 'fixture provider unavailable', 503)),
  );
  throw new Error('provider failure was not raised');
} catch (cause) {
  if (!(cause instanceof GitHubReadFailure)) throw cause;
  console.log('provider-failure recorded');
}
const database = new Database(join(written.config.stateDirectory, 'activation.sqlite'), {
  readonly: true,
});
const schedule = database.query('SELECT * FROM activation_observation_schedule').get();
const recovery = database.query('SELECT * FROM activation_observation_recovery').get();
const attempts = database
  .query('SELECT * FROM activation_observation_attempt ORDER BY sequence')
  .all();
const version = database.query('PRAGMA user_version').get();
database.close();
writeFileSync(
  join(output, 'burokrat-written-v10.state.json'),
  `${JSON.stringify({ attempts, bootstrap, binding, policy, recovery, schedule, version }, null, 2)}\n`,
);
```

Its run printed `initialized`, `migrated`, `initialized`, `migrated`,
`{"kind":"owned","value":{"kind":"complete"},"terminalOutcome":"complete"}`,
`provider-failure recorded`.

| File                               | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `activation.v10.sqlite-dump`       | `6509e4c32161425553f90eb9af5877a044023283a70591cf6ebeee142506f9e7` |
| `burokrat-written-v10.sqlite-dump` | `89cbd380b5d8e439aa6d9d4dbb3b78cff1144a120479dcef94e5f16a983b69b4` |
| `burokrat-written-v10.state.json`  | `e9f96d35347d0dfa54e203948beaac9e561f9760150e423c93349d371717c2ef` |

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

The launcher is 9.7 MB: the judge facade's relationship analysis bundles the TypeScript compiler,
and Bun inlines that CommonJS module's `__dirname`, so the bundle names the absolute
`node_modules` path it was built from. Two builds at the same path gave the same SHA-256; a build
from another checkout path would give another digest (inferred from the embedded path, not built). The units README says to rebuild from the same
path to reproduce `launcherIdentity`.

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
