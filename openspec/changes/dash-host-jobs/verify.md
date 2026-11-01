# Verification: dash-host-jobs

## Slice 1

Branch `feat/dash-host-jobs-1-catalogue`, from `plan/dash-host-jobs` at `39af9f692`. Local
worktree on the laptop; no h2puni gate was run for this slice (the plan reaches main through
one gate later, task 0.1).

### Assumptions

Each is overrulable by id, like J1 to J18.

- **S1-A1 Shape placement.** The pure `JobType` / Job envelope contract and `parseJobCatalogue`
  live in `@twilight-burokrat/contracts` (`contracts/job-catalogue.ts`), the facade Twilight Dash
  already imports for plan and progress records. Burokrat's rule reads it; Dash will admit from
  it; neither imports the other's runtime. A new `libs/shared/domain/` library was rejected: the
  contract is Twilight-suite vocabulary, not shared by WBS.
- **S1-A2 File shape.** `{ "schemaVersion": 1, "jobs": [ … ] }`, entries exactly as J2 shows.
  Calibrated provenance is `{ kind, hostClass, calibratedAt, recordCount, p95: { cpuCores,
memoryGib, tmpDiskGib }, recordIds }` with as many unique ids as the count. The shape does not
  enforce J9's three-record minimum; that stays `ops job propose`'s provisional refusal.
- **S1-A3 Argument profile grammar.** Space-separated tokens matched one to one with the
  arguments after the entrypoint: literal tokens or `<sha>` (a full 40- or 64-hex commit id);
  `""` takes none; no optional token, because J9 partitions measurements by profile.
  `parseJobArguments(jobType, args)` throws naming type, profile and arguments; Dash maps it to
  exit 64 in slice 2.
- **S1-A4 Package-script entrypoint.** `test-queued`'s entrypoint is
  `package.json#scripts.test:queued`: a JSON file and a dotted key path. The rule requires the
  file and a string at that key. JSON holds no comment, so that entrypoint carries none.
- **S1-A5 Profiles per type.** `gate` `<sha>` (J15's outer launcher resolves it);
  `release-build` `""` (the runbook call; tier arguments would be another profile);
  `test-queued` `""`; `solver-image-publish` `<sha>`, the source revision `publish` builds.
- **S1-A6 Estimates.** `release-build` and `solver-image-publish` share the
  `wbs-dagger-engine` container (fixed name and port 8081), so both name exclusive unit
  `dagger_engine` and declare its bound `{ memoryGib: 8, cpuCores: 6 }` from tool-dagger's
  `--memory=8g --cpus=6`. `test-queued` declares `{ 1, 1 }` like the gate, because
  `tool-remote-scripts:test:caddy` starts a Caddy container; that container is unbounded
  today, which the basis says (task 6.2 bounds it). Every basis states read-not-measured.
- **S1-A7 Expiry instant.** An `until` date is valid through its last UTC millisecond, as
  `inspect-manual` reads a deadline date: `2026-12-01T23:59:59.999Z` passes,
  `2026-12-02T00:00:00.000Z` fails.
- **S1-A8 How the instant arrives.** `check` gains `--now <UTC instant>` (parsed by the
  existing `readEvaluationInstant`), carried as `RuleContext.evaluatedAt`; the rule declares
  input `invocation.evaluatedAt`. `--now` without a dated rule selected is refused, as
  Performance evidence without PERF-THRESHOLD is.
- **S1-A9 Absent catalogue and absent instant.** A candidate with no `infra/jobs/catalogue.json`
  declares no host jobs: observed, no findings (other consumers of the package have none). A
  candidate with a catalogue and no `--now` leaves the rule unevaluated, so a full `check` of
  this repository without `--now` is not allowed, as it already is not without Performance
  evidence.
- **S1-A10 Findings, not refusals to evaluate.** Undecodable, non-JSON, non-regular or
  malformed-header catalogues are findings on the candidate; an unreadable blob is
  unevaluated.
- **S1-A11 Containers finding.** ArkType errors whose path starts at `containers` become the
  "neither none nor a bound" finding; the entry's other errors become one malformed-entry
  finding.
- **S1-A12 Task 1.1 left open.** The `puni-pr-00` companion catalogue with `website-dev-build`
  is outside this slice's brief, so 1.1 stays unticked; everything else in 1.1 is done. The
  glossary terms of 1.3 were already in `docs/twilight-structure/CONTEXT.md`.
- **S1-A13 No module index for `infra/jobs`.** No module index covers `infra/`; the README is
  a plain document, linked from the Burokrat README.

### Commands and results

Run 2026-11-01 on the laptop (load average 6 to 12, a peer worker's tests sharing it), with
`CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` unset for every test run. Outputs trimmed.

| Command                                                                                                                                                          | Result                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                                                      | exit 0; the four new Burokrat files are members of `apps/twilight-structure/twilight-burokrat/cli/README.md`                                                                                 |
| `bunx nx run twilight-burokrat:test --skip-nx-cache`                                                                                                             | `2568 pass`, `1 fail`, `Ran 2569 tests across 103 files. [4055.73s]`; the one failure was `rules.test.ts` pinning the complete-check rule list without `JOB-CATALOGUE`, fixed in `e13bba0d2` |
| `bun test src/rules/rules.test.ts src/rules/job-catalogue.test.ts src/contracts/job-catalogue.test.ts` (Burokrat cwd, target's preload and budget) after the fix | `89 pass`, `0 fail`                                                                                                                                                                          |
| `bunx nx run twilight-burokrat:typecheck --skip-nx-cache`                                                                                                        | `Successfully ran target typecheck`                                                                                                                                                          |
| `bunx nx run twilight-burokrat:lint:source --skip-nx-cache`                                                                                                      | `Successfully ran target lint:source`                                                                                                                                                        |
| `TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test apps/twilight-structure/twilight-burokrat/cli/src/policy/pilot-policy.test.ts`                        | `24 pass`, `0 fail`                                                                                                                                                                          |
| `bunx nx run tool-devsync:test --skip-nx-cache`                                                                                                                  | `981 pass`, `1 fail`, `Ran 982 tests across 50 files. [1284.68s]`; the failure is pre-existing (below)                                                                                       |
| `bunx nx run tool-devsync:typecheck --skip-nx-cache`                                                                                                             | `Successfully ran target typecheck`                                                                                                                                                          |
| `bunx prettier --check` on every touched file                                                                                                                    | clean (`bin/*.sh` are not Prettier files; `shellcheck bin/h2puni-gate.sh bin/publish-release.sh` exit 0)                                                                                     |
| `./node_modules/.bin/openspec validate dash-host-jobs --json`                                                                                                    | `"valid": true`, `passed: 1`, `failed: 0`                                                                                                                                                    |
| `bun …/cli.ts check committed . HEAD <policy copy outside the tree> --rule JOB-CATALOGUE --now 2026-11-01T16:00:00.000Z`                                         | exit 0, `"findings":[]`, `"unevaluated":[]`                                                                                                                                                  |
| the same at `--now 2026-12-02T00:00:00.000Z`                                                                                                                     | four `estimated envelope expired: until 2026-12-01 …` findings, `effect: debt` (observe mode)                                                                                                |

The new rule tests pass alone: `bun test …/rules/job-catalogue.test.ts --timeout=60000` gave
`16 pass, 0 fail`; `bun test …/contracts/job-catalogue.test.ts` gave `9 pass, 0 fail`.

### Fault injection

Each fault was applied by a scratch script, the named test file run with
`bun test <file> --timeout=60000` (CLAUDECODE unset), and the source restored.

| Fault injected                                               | Test that observed it                                                                                                 | Result             |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `until` comparison replaced with `false` (task 1.2 negative) | `fails every estimate on 2026-12-02`: exit 0 where 1 expected; 15 others passed                                       | red, then restored |
| entrypoint presence replaced with `false`                    | `names an entrypoint absent at the revision`, `names a package script entrypoint …`                                   | red, then restored |
| p95 compared with `<=`                                       | `names an envelope below its own calibrated p95` (at-p95 half)                                                        | red, then restored |
| p95 comparison replaced with `false`                         | `names an envelope below its own calibrated p95`                                                                      | red, then restored |
| containers errors folded into malformed                      | `names containers that are neither none nor a bound`                                                                  | red, then restored |
| malformed entries push nothing                               | `names a malformed entry …`, `names an entry that is not an object …`, containers case                                | red, then restored |
| duplicate ids judged over `[]`                               | `names a duplicate id`                                                                                                | red, then restored |
| absent catalogue reported not-evaluated                      | `has nothing to judge in a candidate without a catalogue`                                                             | red, then restored |
| instant guard disabled                                       | `cannot judge without the evaluation instant`: reason `undefined is not an object (evaluating 'evaluatedAt.getTime')` | red, then restored |
| `--now` not forwarded by `writeCheckCommand`                 | 12 of 16 rule cases, every one that supplies `--now`                                                                  | red, then restored |
| `--now`-without-dated-rule refusal disabled                  | `check refuses --now without a dated rule`: empty stderr                                                              | red, then restored |
| `parseJobArguments` always matches                           | `refuses arguments outside the argument profile`, `the empty profile takes no arguments`                              | red, then restored |

Each is recorded as a `Proof:` comment beside the check it breaks.

### Skipped or unverified

- `tool-devsync:test` failed one case,
  `Performance level target production boundary > refuses a dirty, committed or content-masked
checkout after execution`: `Received: "Error: Performance supervisor exited 143"` at its own
  40-second budget. It fails the same way on the base `39af9f692` with none of this slice's
  changes (run alone with `-t`, 40043 ms, same 143), so it is not caused by this slice; it is
  unverified whether it is load on this laptop or a real defect. CI and the h2puni gate decide.
- No h2puni gate and no CI run: this PR targets `plan/dash-host-jobs`, which reaches main
  through one gate later.
- `tool-devsync:lint` and `twilight-burokrat:lint` (the diagnostic wiki lint) were not run;
  lefthook's `lint` passed on each commit.
- The `puni-pr-00` companion catalogue (`website-dev-build`) is not part of this slice (S1-A12).
- Every envelope is an estimate read from scripts, not a measurement; slice 6.4 calibrates.
