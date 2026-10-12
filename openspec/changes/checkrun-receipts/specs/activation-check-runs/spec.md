## ADDED Requirements

### Requirement: Dash records activation check runs

`twilight-dash run-activation-checks --candidate-repository <checkout> --candidate-sha <sha>
--candidate-policy <path> --check-runs <dir>` SHALL parse its whole grammar and refuse a check-run
directory that exists or lies inside the candidate before it reads the candidate. It SHALL refuse
a checkout whose HEAD is not the candidate revision, or that has modified or untracked files,
before it runs anything. It SHALL run the checks that `planCandidateCheckRuns` plans, in plan
order, and run a planned skip probe only after its check exits 0. It SHALL stamp each run's
`startedAt` before the check and its `endedAt` after the probe, from the injected wall clock only.
It SHALL write each stream to `streams/<sha256>` and then `check-runs.json`. A failing check SHALL
be recorded, not refused.

#### Scenario: Grammar or directory fault

- **WHEN** a flag is unknown, repeated, missing or valueless, the sha is not 40-hex, or the directory exists or is inside the candidate
- **THEN** the command refuses without calling the executor and creates no directory

#### Scenario: Not the committed candidate

- **WHEN** HEAD is another revision or `nx.json` is edited
- **THEN** the command refuses naming HEAD or `nx.json` without calling the executor

#### Scenario: Failed bun test check

- **WHEN** a check with a planned skip probe exits 1
- **THEN** the executor is called once and the run records `skipProbe: null` with exit code 1

#### Scenario: Golden reproduction

- **WHEN** the writer is given the golden ledgers' plans, instants and streams
- **THEN** it produces their `check-runs.json` and `streams/` byte for byte

### Requirement: Preparers judge check runs instead of running checks

`prepare-activation` and `prepare-relocation-activation` SHALL require `--check-runs <dir>`. They
SHALL judge the ledger against the plan they derive themselves, through the same
`planCandidateChecks` derivation, and SHALL run no check and read no clock. They SHALL refuse with
a `CheckRunRefusal` whose reason names the broken rule:

- `absent` or `unreadable` ledger, and `malformed` JSON or schema;
- `broken-chain`: a sequence number, a `previous` link or the `head` seal disagrees with the runs;
- `foreign-authority`: a recorder other than `twilight-dash run-activation-checks`;
- `mismatched-candidate`: another revision or tree identity;
- `missing-check` for a planned check with no run;
- `mismatched-check`: another id, order or argv; a probe that is absent after a pass, unplanned,
  or has another argv, directory or environment; or a run that nobody planned;
- `out-of-order` when `endedAt` is before `startedAt`, and `overlapping` when a run starts before
  the previous run ended;
- `missing-stream` or `stream-mismatch`.

Equal instants SHALL pass both instant rules.

#### Scenario: Each refusal

- **WHEN** a ledger breaks exactly one rule above
- **THEN** `readCheckRuns` throws a `CheckRunRefusal` with that reason, and a ledger that breaks none is accepted

#### Scenario: Instant boundaries

- **WHEN** a run ends at its start instant, or starts at the instant the previous run ended
- **THEN** the ledger is accepted, and moving either instant 1 ms earlier refuses it

#### Scenario: Another revision's runs through the command

- **WHEN** `prepare-relocation-activation` receives runs recorded for the base revision
- **THEN** it exits 1 with `check runs refused (mismatched-candidate)` and writes no archive

#### Scenario: Packed binary on Dash-written receipts

- **WHEN** the installed `bin.mjs prepare-activation` receives the golden `passing` ledger for the reproducible candidate
- **THEN** it prepares a certified activation, and with the golden `skipping` ledger for the skipping variant it refuses with `check skipped work`

### Requirement: Burokrat reads no clock

No Burokrat package source SHALL contain a clock reference as `findClockReads` defines it. The
guard SHALL have no list of exceptions.

#### Scenario: A clock read returns to a preparer

- **WHEN** `new Date().toISOString()` is appended to `policy/prepare-activation-cli.ts`
- **THEN** `the Burokrat package reads no clock` fails naming that file
