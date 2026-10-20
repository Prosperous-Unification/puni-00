# Reference-only recovery, 2026-10-19

The reference extraction is recovered onto main `3e8d0742` in an isolated branch
without the preceding directory
or following estimate extractions. WBS100 remains `blocked_by_proxy`; this
receipt establishes scoped recovery checks, not release or certification.

## Immutable selections and preservation

| Selection                  | Commit                                     | Tree                                        |
| -------------------------- | ------------------------------------------ | ------------------------------------------- |
| Fresh main base            | `3e8d0742154e90a606b23d305dd6e424bb9c7d06` | See committed selection in the size reports |
| Recovered source           | `40d40ff6219aae3d2115dd39eee6ca36f1cd9e61` | `11ea76d6a530a021dc11a273fb5a2a61c1724888`  |
| Disposable oversized fault | `d6026f83be7c0af4c325406961ebc3eacb58363c` | `a55f571d355612230ff9b167567f0a4a9d8768ef`  |

Source commits `8dc10bcdd2d0c5a3f2a20f57e1e3e6804670e3a7`,
`b14503a2e696701c1c3a3d00a7e29559eb1119ef` and
`ee750cb7070eb06d4b828eba7ccb3ddf16ae2d0b` were applied without committing,
then committed normally as one recovery. All three production files and all
27 original packet files remain byte-identical to `ee750cb7`:
[preservation inventory](evidence/recovery-2026-10-19/preservation.json.txt).
The original proposal, tasks and [verification](verify.md) retain their
historical base and observations; they do not describe this successor's proof.

The main reference field matched the original predecessor before extraction.
The reference files import no extracted directory modules. Neither directory
nor estimate source changes belong to this recovery. Directory integration
remains separately coordinated with PR566.

Worktree: `.worktrees/wbs100-reference-recovery-20261019`, branch
`integration/wbs100-reference-recovery-20261019`. Dependencies use a symlink to
the existing workspace installation; no fresh frozen install is claimed.
The initial mounted, static, hook and direct-size observations ran serially
under the retained [900 MiB process-tree guard](evidence/recovery-2026-10-19/rss-guard.py.txt).
The guard samples every 50 ms; reported peaks are sampled, not hard allocation
limits. Node commands inherit a 640 MiB heap setting from the guard.

## Mounted behavior and watched faults

From `apps/wbs/fe-01`, the baseline and final restored commands were:

```sh
bunx vitest run src/components/wbs/reference-set-field.test.tsx src/components/wbs/depends-card.test.tsx --maxWorkers=1
```

The baseline inherited the shell environment; fault and restored runs set
`TZ=UTC`. Both complete runs passed 50 tests across two files. Final restored
peak was 508020 KiB. Vite emitted its existing native-loader `__dirname`
warning. No test source changed.

The [retained reproducer](evidence/recovery-2026-10-19/mounted-faults.py.txt)
requires exactly one matching production expression, restores it in `finally`,
requires exit 1 and a named failed test for each fault, then runs both suites.

| Injected production fault           | Existing observing case                                                             | Observed assertion                            |
| ----------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------- |
| Suppress nonempty `HiddenChipCount` | `clips the rest line, counts what it hid…`                                          | Hidden count became undefined                 |
| Remove resting `maxHeight`          | `rests every flex container of a crowded cell on one line`                          | Empty height instead of `18px`                |
| Remove own-set guard                | `adds the overriding dimension’s reading only while the row states none of its own` | Extra inherited Core line beside own Platform |
| Force `holdsOneMember` false        | `flags a type conflict, shows every type, and keeps the one picked`                 | Conflict marker absent                        |

Each fault failed its intended assertion; sampled peaks were 424708–432072
KiB. The inherited case exercises the formatter. Layout assertions use jsdom
and synthetic measurements; none proves painted browser layout. Existing
adjacent production `Proof:` comments remain unchanged with the recovered
source. Raw output and process receipts are retained beside this receipt.

## Static checks and normal hooks

- Nx graph generation passed with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`.
- All three production files passed ESLint individually, with cached graph
  available and module boundary lint active; maximum peak 794960 KiB.
- Scoped `bunx tsc -p .reference-recovery-scope.tsconfig.json --noEmit` passed,
  peak 99252 KiB. The temporary config extended
  `apps/wbs/fe-01/tsconfig.app.json`, included the three production roots and
  their transitive dependencies, and was removed afterward.
- Formatting and `git diff --cached --check` passed for the recovered packet.
- Pinned `bunx @fission-ai/openspec@1.12.0 validate wbs-reference-set-presentation-boundary --strict --json`
  passed, one valid change and zero issues. `BUN_TMPDIR=/tmp` and
  `OPENSPEC_TELEMETRY=0` were set for the strict run. The initial unscoped
  `bunx openspec` invocation failed to determine an executable; it is retained
  as a failed check, superseded by the pinned CLI invocation.

The normal source commit passed format, lint, plaintext secrets, private nesting
and both agent message hooks; sampled peak 814532 KiB. Tool Wiki reported
inactive external activation and no certification. Doc caps and migration
hooks reported no matching files. No hook was bypassed.

A temporary worktree-local hook configuration serialized execution and ran
the same ESLint invocation once per staged source file. Parsed original and
effective configurations were compared: only serialization and lint batching
differed. Staged paths were checked against `[A-Za-z0-9_./-]+` before invoking
the loop. Both configurations are retained in the evidence directory. The
oversized fault used normal hooks with only serialization changed; peak
805384 KiB. Temporary configurations were removed after the commits.

## Committed production size proof

The [observer](evidence/recovery-2026-10-19/measure-committed.mjs.txt) is the
historical comparison with only its two absolute import locations rebound to
this worktree. Its production implementations match the historical hashes:

- `read-candidate.ts`: `b0eae510766c23dad0256715680248fb75e8713599e837323ee20612bafe2772`.
- `size-ratchet.ts`: `3e1d22d2bd3b52f1e7b98879e4f831858949501b8f1a213181c13f51f3b0c216`.

The unchanged policy is the committed
`openspec/changes/wbs-plan-export-size-boundary/evidence/hosted-full-survey/recovery-full-policy.json.txt`,
SHA256 `3cff7523646c98f4b405c7aea21df6b913ce90f0c1f6545157007fc31f73a00c`.
It retains the six roots, 800-line ceiling and no pins. Commands run from the
recovery worktree selected exact commits:

```sh
bun /tmp/wbs100-reference-measure-20261019.mjs . 3e8d0742154e90a606b23d305dd6e424bb9c7d06 40d40ff6219aae3d2115dd39eee6ca36f1cd9e61 openspec/changes/wbs-plan-export-size-boundary/evidence/hosted-full-survey/recovery-full-policy.json.txt
```

The exact comparison passed: **29 to 28 findings**, only
`reference-set-field.tsx` removed and every unrelated finding equal. Substituting
fault commit `d6026f83…`, which restores only the original oversized field,
made the same assertion fail with `selected reference-set-field finding remains`.
Selecting exact good `40d40ff6…` again passed. Sampled peaks were 621984,
619908 and 643568 KiB respectively. The fault worktree was detached back to
the good source; its immutable proof branch preserves the negative candidate.
This fresh comparison does not reuse the historical **30 to 29** count.

## Remaining obligations

Full-rule surveys, browser acceptance,
fresh frozen installation, full frontend checks, hosted CI and canonical
`bin/h2puni-gate.sh <sha>` remain pending coordinator execution. No h1claw
build or test was run. The direct production rule proof is distinct from the successful installed F7
comparison recorded below. Neither establishes certification or full WBS100
evaluation.

The original `/tmp/directory-f7-consumer` executable and original `/tmp`
tarball path are absent. Independent artifact recovery located the exact
tarball at
`.worktrees/wbs-column-resize-hosted-proof/tmp/hosted-proof-attempt-3/artifact/twilight-burokrat-0.1.0.tgz`.
Its SHA256 is `f287bc11f43f628b70ecd01e11eb6784c55fd4b2fb8cbb9e439dee8e685297fd`;
the archived executable and toolkit hashes match the historical pins.
The exact archive was installed in `/tmp/wbs100-reference-consumer-20261019`
with Bun 1.4.2, `--offline --ignore-scripts`, `BUN_TMPDIR=/tmp` and dedicated
`BUN_INSTALL_CACHE_DIR=/tmp/wbs100-reference-bun-cache-20261019`. The first
attempt without that dedicated cache failed with EROFS; the retry passed at
41136 KiB sampled peak. Installed executable SHA256
`92ca1424826b325dad64a160090fb8c83521a5e581a48f6bed510a1d7d00ef4c`,
toolkit SHA256
`2417f876901efadcc817e7518a8f796985c9e62409ab6f68458b55ea21d2b69a`,
and manifest source `ac774f0c358db369c2048e537151e263cc29361e`
match the historical pins. Installed F7 observation was subsequently authorized under the separate bounded
sequence below. No known insufficient 900 MiB evaluation attempt was repeated.

No push, PR, deployment or WBS completion is claimed.

## Installed F7 diagnostic successor

After artifact recovery, the coordinator authorized a serial installed sequence
with a 4 GiB sampled process-tree RSS ceiling, a 360-second timeout and at least
12 GiB available memory before each invocation. This changed the historical
operational cap, not any policy ceiling. The retained
[guard](evidence/recovery-2026-10-19/installed-guard.py.txt) records the exact
command, cwd, memory check, peak, duration, exit and stop reason. Standard output
and error are retained separately.

The first invocation selected the committed policy file inside the candidate.
The CLI refused that trust-boundary placement before emitting a report:
`rule policy resolves inside selected candidate`. The sequence stopped, and the
coordinator authorized restarting after copying the identical policy bytes to
`/tmp/wbs100-reference-consumer-20261019/policy.json`; its hash remains
`3cff7523646c98f4b405c7aea21df6b913ce90f0c1f6545157007fc31f73a00c`.
The refusal is retained as a boundary observation, not an F7 evaluation.

From `/tmp/wbs100-reference-consumer-20261019`, each command used the same
installed consumer and external policy:

```sh
bun node_modules/twilight-burokrat/dist/bin.mjs check committed /home/df/wd/puni/puni-00/.worktrees/wbs100-reference-recovery-20261019 <exact-sha> /tmp/wbs100-reference-consumer-20261019/policy.json --rule F7
```

| Exact selected commit                                      | Findings | Peak KiB | Seconds | Available before, KiB |
| ---------------------------------------------------------- | -------: | -------: | ------: | --------------------: |
| Base `3e8d0742154e90a606b23d305dd6e424bb9c7d06`            |       29 |  2195788 |   4.350 |              23676616 |
| Source `40d40ff6219aae3d2115dd39eee6ca36f1cd9e61`          |       28 |  2134032 |   4.354 |              23703084 |
| Oversized fault `d6026f83be7c0af4c325406961ebc3eacb58363c` |       29 |  2510504 |   4.404 |              23661736 |

All three CLI invocations exited zero, reported `allowed:true` under the
unchanged observe-only policy, selected exactly F7, had `unevaluated:[]` and
`certifies:false`. Exit zero alone supplies no selected-finding proof.

The [structured oracle](evidence/recovery-2026-10-19/installed-oracle.py.txt)
requires the exact report envelope and unchanged policy identity, one selected
base finding, no selected candidate finding, and exact equality of every
unrelated finding. It passed for the recovered source. Running that same
assertion against the fresh committed oversized fault failed with
`selected reference-set-field finding remains`; reselecting the retained good
report passed. The latter reruns the comparator, not the installed evaluator.
The source, fault and policy identities are independently bound by the command
receipts and committed direct-production reports above.

This establishes the bounded installed F7 diagnostic comparison. It does not
establish all-rule survey preservation, browser behavior, full gates, trusted
activation, certification or WBS100 completion.

## All-rule survey resource boundary

The coordinator next authorized base and candidate full-rule surveys under the
same 4 GiB/360-second and 12 GiB available-memory conditions. The base command
was the installed invocation above with `--rule F7` omitted, selecting exact
`3e8d0742154e90a606b23d305dd6e424bb9c7d06`. It began with 23670060 KiB
available memory. After 10.607 seconds, the guard observed 4208832 KiB RSS,
exceeding its 4194304 KiB ceiling, and killed the process group. The recorded
process exit is -9 and stop reason is `rss_limit`. Sampling can overshoot the
configured ceiling between observations.

The sequence stopped. No candidate all-rule invocation or automatic cap increase
followed. No complete base report exists to compare, so full-rule preservation
remains unverified. The successful installed F7 comparison is independent of
this stopped full-rule attempt. The next coordinator decision is where to run
the bounded full survey with adequate resources; source recovery need not be
rebuilt.

## Evidence transport

The initial staged evidence whitespace check reported tool-emitted trailing
spaces and extra EOF blank lines. Human-readable `.log.txt` copies now normalize
only that whitespace. The exact original UTF-8 streams and SHA256 hashes for
every normalized log are preserved losslessly in
[evidence/recovery-2026-10-19/raw-log-outputs.json.txt](evidence/recovery-2026-10-19/raw-log-outputs.json.txt).
JSON `utf8` strings reconstruct the original bytes with UTF-8 encoding.
Structured installed stdout/stderr, command receipts and all historical packet
files remain unchanged. The raw original command logs also remain under `/tmp`.

## Final authorized full-survey retry

After the 4 GiB refusal was recorded, the coordinator explicitly authorized one
final resource adjustment: 8 GiB RSS, unchanged 360-second timeout, and at least
18 GiB available before each invocation. Only base and candidate full-rule
surveys were in scope, with no concurrent local heavy work. The
[separate guard](evidence/recovery-2026-10-19/installed-guard-8g.py.txt)
changes only those two memory thresholds; it preserves the first guard and all
its receipts.

The exact base invocation began with 23804836 KiB available memory. At 16.382
seconds it reached sampled RSS 8420212 KiB, exceeding the 8388608 KiB ceiling.
The guard killed the process group; exit -9, stop reason `rss_limit`. Both
stdout and stderr were empty. No candidate full survey, timeout extension,
further memory increase or additional evaluation followed. Full-rule
preservation remains unverified. The immutable reference source and successful
installed F7 comparison remain unchanged.

## Post-merge and successor observations

The earlier sections retain their original pre-merge and resource-boundary
observations. The coordinator's subsequent [receipt](../burokrat-serial-legacy-compiler/evidence/recovery-postmerge-2026-10-19/receipt.json.txt),
observed at 2026-10-19 21:14:24 UTC, records completed successful
[post-merge CI run 39317193294](https://github.com/Prosperous-Unification/puni-00/actions/runs/39317193294)
on `a82d6fa9b0d87105cdafcaef474ab51a73abebd8`, including workspace, Twilight,
all four browser shards and their aggregates. Backend `/health` returned HTTP
200 with `status:ok` and that exact commit; the dev frontend returned HTTP 200.
These observations supersede the earlier statements that this recovery had not
merged or reached dev. They do not establish a production deployment, trusted
activation or the later compiler successor's CI/gate status.

The separately identified initial installed compiler successor `0e444bcc4…`
subsequently completed a [limited all-rule comparison](../burokrat-serial-legacy-compiler/evidence/initial-installed-surveys/README.md)
over the original exact base, both recovered sources and their committed faults.
Reference findings changed 34 to 33 by removing only its selected F7 record;
the oversized fault restored the baseline. All ten unevaluated records were
preserved, including seven DNS-dependent compiler refusals. Thus evaluated
finding preservation is now observed, while full compiler acceptance and WBS100
completion remain open. The historical artifact, its failed resource attempts
and their original claims are unchanged.

## Exact-successor local full comparison

The [final local installed survey packet](../burokrat-serial-legacy-compiler/evidence/final-installed-surveys/README.md) supersedes the earlier lack of complete local compiler-backed evidence for this separately identified successor. Exact evaluator source `d7f2129598af7a3cb7ed3c7161e06d504b586891`, local archive `5dfc97149a59511d843f5f39e39c57e731c4b898cfbe2aa43920f05e5f088dee`, and unchanged policy `3cff7523…` evaluated the original base `3e8d0742…`, reference `40d40ff6…` and committed oversized fault `d6026f83…`, alongside the estimate pair. All fourteen selected rules are present; the seven compiler-dependent rules no longer refuse DNS/SMTP resolution.

The unchanged strict five-report comparison passed. Reference whole findings changed 41→40 only by removing the F7 record for the 1125-line `reference-set-field.tsx`; the actual fault restored all 41 baseline findings exactly. Reference and fault completed in 437.390/414.951 seconds at 4,141,452/4,123,484 KiB under the unchanged 4 GiB/900-second guard, with identical before/after evaluator snapshots. The unchanged equality helper rejected the real fault report and passed when reselecting the good report; that last comparison did not rerun evaluation.

All reports retain the same three explicit INV-CLASSIFY/PERF-THRESHOLD/SPEC-SCENARIOS unevaluated records, `allowed:false` and `certifies:false`. This is local full-rule preservation, not hosted full-survey or final WBS100 acceptance. Hosted bounded-parity archive `761fb162…` has a separate identity from the local `5dfc9714…` archive, despite the same source revision. Hosted full comparison and required gates remain pending coordinator evidence. The historical installed artifact, its failed resource attempts and earlier proof scope remain unchanged.

## Hosted full comparison acceptance

The later [hosted full-survey packet](../burokrat-serial-legacy-compiler/evidence/hosted-full-surveys/README.md) supplies historical task 2.3's independent hosted full-F7 and all-rule comparison component. Run 39343674302 succeeded at proof `9215cdf312904669b6734917bf66b81a7e1cef89`, independently pinning evaluator source `d7f2129598af7a3cb7ed3c7161e06d504b586891`, hosted archive `761fb162…`, original policy `3cff7523…` and all five original candidate/fault bindings. Artifact 12232405029 has ZIP SHA256 `0d342b6e8d3874430f81ceb41a5a13af9f11c274c31f222908f8a3841d05343e`.

All five full reports are byte-identical to the corresponding final local reports. The unchanged strict comparator proves only the addressed F7 finding disappears and the actual committed oversized fault restores every baseline finding. Five separate installed F7 commands independently prove 29→28→29 with empty unevaluated arrays. All twenty installed snapshots are byte-identical; all ten commands completed under the unchanged 4 GiB/900-second guard without a resource stop. Root and peer independently audited the actual artifact and command/report identities.

This supersedes the pending hosted-survey statements above. The earlier recovered-source browser and immutable hosted CI observations remain recorded in the post-merge section. Final compiler-successor CI/canonical gates remain separate coordinator obligations. All three unrelated full-survey refusals remain explicit, all reports retain `certifies:false`, and WBS100 stays open. The original task and historical packet bytes are preserved rather than relabelled as this new execution.
