# Task 1.3 report — existing source-family migration

## Scope completed

- Moved the twelve existing steps, estimates, directory and eventLog bodies
  into four family files and composed them as typed case registrations.
- Added one deterministic two-project seed and real per-case openers for
  `openMemorySource` and `openSqliteSource`.
- Replaced legacy declaration-time reporting with shared execution reports;
  SQLite records twelve executed passes, while memory records eleven executed
  passes and one unexecuted `not-offered` gap.
- Removed the old memory exclusion, ran the excluded case directly and retained
  only the gap whose actual source failure remains `unknown_step` versus
  `written`.
- Ran add, rename, estimate, remove, range and prune decorators through the
  actual SQLite factory and the same shared registration bodies.

## TDD and R5 evidence

The inventory test first failed because `existingStoreRegistrations` did not
exist. The first real SQLite run then failed all setup paths because the new
fixture omitted required project estimate settings; adding the real project
shape made all twelve shared cases pass. Removing memory's declaration gap ran
the actual case and failed on `Expected: "unknown_step"` / `Received:
"written"`, so the gap was retained with that evidence.

Each of the six required behavioral faults produced an `observed` proof only
after its named production method was reached. The actual outputs were:
`Wiring` missing in favor of `faulted add`, `Renamed` replaced by `faulted
rename`, realistic days 2 becoming 3, `work-a-two` surviving removal, range
`[1]` becoming `[]`, and prune count 2 becoming 0. Adjacent Proof comments name
the injected fault and shared-runner test.

## Verification

- Focused case/source suite: 5 pass, 0 fail, 71 assertions.
- Conformance target: 29 pass, 0 fail, 47 assertions.
- Memory target: 23 pass, 0 fail, 226 assertions.
- SQLite target: 647 pass, 0 fail, 2,051 assertions across 60 files.
- Conformance, memory and SQLite typecheck targets passed, including the
  missing-family compile fixture.
- All three relevant lint targets passed. OpenSpec strict validation and all 75
  artifacts passed. Prettier and the final diff check passed.

## Scope boundary and skips

No later source family was implemented and no adapter behavior was changed.
Complete source declarations and dedicated conformance targets remain owned by
Task 7.1/7.2. The full workspace, build, deploy and browser gates were skipped
because this slice moves existing adapter contract cases and has no such
surface.

An attempted root-scoped `bun test libs/...` is not counted: direct TypeScript
build output under `dist/out-tsc` was also collected and failed from unresolved
workspace aliases/migration paths. The official project-scoped Nx targets
listed above replaced it and passed.
