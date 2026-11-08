# Task117 current-head CI compatibility: source frozen for staged publication

**Partial repair, not hosted GREEN or Task117 complete.** Baseline `42e1c6cccef285a288f7a5ee7693cf6695cc3d54`. Exactly six authorized fixture files changed; no production path, index, commit, push, subagent, provider policy, workflow, native operation, retained state/request, deployment or runtime installation changed. Root's unpublished admin proposal/input artifacts were preserved. Root owns independent review, owning Fleet typing, public evidence/tasks, normal commit and fresh push.

## Authoritative groups and decisions

CI42146094743 terminal failure is5341pass/7existing opt-in skips/186fail,5534tests/130files,1063.06s. The unchanged raw log is3357526B SHA256 `9bfcd21d937648615f46851edd4c2c6b9d802f9e384d697e492753776d7375ea`; clean locator `/tmp/puni-ci42146094743-clean.log`. The186 errors are exactly82 failed-settlement,53 staging-native-control,49 release,1 outer repair and1 guest parser. `ci-failure-names.txt` records their first reported test names.

1. **Repair outer/release: fixture pollution, no production regression demonstrated.** The child created `ack-before-mutation` inside the closed `raw-repair-*` namespace. Both original success and release order reproduced `settlement-namespace-invalid` at the first after-allocation full accounting call. The sentinel now lives in the disposable root, outside retained state; the original reservation-sync negative checks that same root path. Full accounting still enumerates and refuses unknown entries. All61 v1 release controls and10 outer controls pass in final coverage, including durable credit, absent/unreadable/malformed proofs and source/profile/counter/cleanup failures.

2. **Settlement child EOF: a causally reproduced fixture resource defect; original hosted child detail was not captured.** The tiny geometry assignment `raw.RAW_BYTES=4096` also changed the original `raw.worker_limits()` AS and FSIZE to4096. Local3.12/uv3.14 original complete cases sometimes passed using inherited allocator space. A controlled ordinary16MiB allocation immediately after the real setter produced `MemoryError` and the same `settlement-client-eof`; the added test reproduces this RED. The model now calls the original limit setter under captured native RAW_BYTES8589934592, then immediately restores4096 logical geometry. The positive checks actual AS/FSIZE8589934592, NOFILE64, CPU900, CORE0 after real allocation. The permanent wrong-limit negative changes only the fixture's native-size assignment back to logical size and observes both EOF and the child's MemoryError. Cgroup/service models and all production limits are unchanged. Test-only DiagnosticPipe adds at most8192 bytes of already captured disposable child stderr to an exception note, preserving real pipe/EOF/exit behavior and expected exception handling. No hosted child cause beyond the log's EOF is asserted.

3. **Guest unique MemAvailable: masked watched guard, fixture only.** The original duplicate parser fault correctly raised `guest-capacity-malformed`; with that one AST guard bypassed, the nonexistent `/qualified-state` raised later `raw-state-absent`, which `refuse_selected` swallowed. Saved baseline bytes reproduce both exact categories. A real private empty disposable directory now lets the watched omission reach `unsafe selected guard`, while the ordinary parser still refuses. No production parser or accounting check changes.

4. **Staging53: hosted cause still unresolved.** Original CI fails at `runtime_paths` aggregate `runtime-mapping` before native fixture handoff. Local3.12, installed uv3.14.7, FORCE_COLOR, and the actual155B Ubuntu startup hook under a disposable package-shaped versioned symlink do not reproduce its rejected path. No extra alias or production relaxation was added. The test fixture now appends a bounded failure-only note with candidate count and at most16 rejected paths of256 characters each, including deleted-map cases. It reads the actual failing runtime_paths frame and preserves the original refusal. A real foreign startup-hook test first REDs because the note is absent; after instrumentation it verifies that actual rejected path is present and still watches omission of only the original aggregate guard expose the foreign runtime. The next natural CI push must supply the missing hosted rejected-path evidence. Passing local controls do not establish hosted compatibility.

## RED/GREEN and exact coverage

All following paths are `/tmp/puni-task117-evidence`.

| Evidence                                           | Actual observation                                                                                                                                                |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initial-selected-red.log`                         | 1pass/3fail,1.57s: local staging provider passes; original outer success/release order fail namespace guard; guest watched negative unexpectedly exits0           |
| `settlement-initial-red.log`                       | Despite filename, original local complete is GREEN1pass,282ms; not a RED claim                                                                                    |
| `python314-initial-red.log`                        | Despite filename, direct uv3.14 selected provider/complete are GREEN2pass,1.146s; not a hosted reproduction                                                       |
| `settlement4096-allocation-red.log`                | Controlled16MiB ordinary allocation: child MemoryError, parent original EOF                                                                                       |
| `settlement-worker-runtime-red.log`                | New exact worker-runtime regression0pass/1fail,259ms; bounded child note exposes MemoryError at real setter's4096-byte AS                                         |
| `namespace-parser-first-green.log`                 | 4pass/0fail,1.17s: outer success/reservation-sync, release order, parser ordinary/watched pair                                                                    |
| `original-parser.log`, `omitted-parser-masked.log` | Baseline ordinary `guest-capacity-malformed`; exact AST omission `raw-state-absent`                                                                               |
| `settlement-limits-focused-green.log`              | 6pass/0fail,2.46s: complete, worker-runtime, wrong-limit negative, parent-flags/original-sync watched guards, actual failed allocating create/no-name consumption |
| `staging-diagnostics-red.log`                      | 0pass/1fail,325ms; real foreign hook refusal lacks **notes**                                                                                                      |
| `staging-diagnostics-green.log`                    | 3pass/0fail,2.88s: original cold-runtime, runtime-provider, foreign-runtime guarded/note/watched controls                                                         |
| `release-investigation.log`                        | 61pass/0fail,17.97s before final sentinel relocation completely outside retained state; original full release group                                               |
| `final-covering.log`, `.json`                      | **Frozen211pass/0fail/0skip/381filtered/893assertions**,89.75s;211 exact names in `covering-tests.json`                                                           |
| `eslint.log`, `prettier.log`, `whitespace.log`     | Named checks exit0; Prettier all matched files formatted; no lint/whitespace diagnostics                                                                          |
| `source-proof.log`, `.json`                        | Changed embedded Python/cold AST-valid; frozen identities, original caps, six+four production hashes and cold worker entry unchanged                              |

Final groups are release61, failed-settlement136, outer10, guest1 and staging3. Failed-settlement includes **84 named watched production guards**, listed in `watched-tests.json`, as well as all8 publication crash prefixes, all7 actual failure prefixes, partial/unreadable/missing/subdirectory namespace cases, complete/consumed-exited/unqualified cases, original setter/fallocate-loss consumption, legacy admission and full K capacity floors. The211-test final campaign was run once after fixture freeze. The full passing56-case staging campaign was deliberately not replayed for failure-note instrumentation; only its3 causally relevant controls ran. The381 filtered cases were outside this selected campaign, not skipped tests.

The temporary packaged availability harness selects only ordinary generic Python launchers, retaining `-I -B`;304 audited outer/nested observations all report actual3.14.7. It copies the real installed Ubuntu hook155B SHA256 `43d81125d92376b1a69d53a71126a041cc9a18d8080e92dea0a2ae23be138b1e`, imports through an actual package-shaped symlink, and maps only exact corresponding filesystem observations. It is not a hosted filesystem capture. Native3.12 validation/source pins remain fixed; no runtime is installed or upgraded. Earlier diagnostic attempts, including a file-mode **main** artifact and a diagnostic wrapper name collision, remain retained and are not GREEN evidence.

## Reproduction commands

```sh
# Exact frozen final command/argv/timing/hash are also in final-covering.json.
/usr/bin/python3 -I -B /tmp/puni-task117-evidence/run.py final-covering /home/df/.bun/bin/bun test --preload /tmp/puni-task117-evidence/packaged-preload.ts --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/lab-raw-repair.test.ts tools/tool-fleet/src/lab-repair-release.test.ts tools/tool-fleet/src/lab-staging-native-control.test.ts tools/tool-fleet/src/lab-failed-settlement.test.ts tools/tool-fleet/src/lab-guest-preparation.test.ts --test-name-pattern '^(failed settlement |conditional production settlement |settlement |accounting retains |durable native consumption |queued consumed |coordinator ownership |all active accounting |repair release |repair outer coordinator |guest single guard unique MemAvailable |native staging source (runtime-provider|foreign-runtime|cold-runtime) )'
bun x eslint tools/tool-fleet/src/lab-raw-repair.test.ts tools/tool-fleet/src/lab-repair-release.test.ts tools/tool-fleet/src/lab-staging-native-control.test.ts tools/tool-fleet/src/lab-failed-settlement.test.ts tools/tool-fleet/src/lab-guest-preparation.test.ts
bun x prettier --check tools/tool-fleet/src/lab-raw-repair.test.ts tools/tool-fleet/src/lab-repair-release.test.ts tools/tool-fleet/src/lab-staging-native-control.test.ts tools/tool-fleet/src/lab-failed-settlement.test.ts tools/tool-fleet/src/lab-guest-preparation.test.ts
git diff --check -- tools/tool-fleet/src/lab-raw-repair.test.ts tools/tool-fleet/src/lab-repair-release.test.ts tools/tool-fleet/src/lab-staging-native-control.test.ts tools/tool-fleet/src/lab-staging-native-cold-fixture.py tools/tool-fleet/src/lab-failed-settlement.test.ts tools/tool-fleet/src/lab-guest-preparation.test.ts
/usr/bin/python3 -I -B /tmp/puni-task117-evidence/verify-source.py
```

## Frozen identities and unchanged bounds

`freeze.json` records all six owned fixture and ten unchanged production identities. `task117.diff` contains the complete owned delta. No sources changed after the final campaign's freeze.

| Owned path below tools/tool-fleet/src |  Bytes | SHA256                                                             |
| ------------------------------------- | -----: | ------------------------------------------------------------------ |
| `lab-raw-repair.test.ts`              |  69281 | `178f9694e518ddcd12ae138ab0c068045e3559cac0c65b088fb1e6a83b966547` |
| `lab-repair-release.test.ts`          |  24475 | `8a6a3c85c34dfb7bcbcb037f2d3f03cb5910ef884957583eb4d5b1b42d2f689e` |
| `lab-staging-native-control.test.ts`  |  56888 | `b658491d9143c81488220f738e09da97dd43e1807911eb49b6a1170812a5c509` |
| `lab-staging-native-cold-fixture.py`  |   8092 | `e39338f975a91dc8633794623f0ed776ee50a1a046f72156788e6dc14af862d2` |
| `lab-failed-settlement.test.ts`       |  58836 | `c004678a5041259bc16e46d31e9e093eb87f76ebfc12e0d50fcba568cc10a489` |
| `lab-guest-preparation.test.ts`       | 123331 | `a2457261417631e5c00cdcf3a9f1d4c4169a9dca6daf66b26c01d9fdf740900e` |

Cold helper8092 remains below8192; control56888 remains below57344. The cold worker entry after its original provider boundary is byte-identical. Six actual source roles remain414602 aggregate/max115650; their131072 per-role and786432 aggregate caps remain unchanged. Four control/bootstrap sources retain baseline hashes. Nine fixed settlement names, K33554432, theorem surplus5537792 and all memory/FD/time/storage/outside/physical floor contracts remain unchanged. Original oldG141754548224 remains charged. Runtime4/11/Task97 remain OPEN; actual outside qualification still refuses. No consumedb9/6f/a2 request was replayed.

No full Fleet/app/browser/host/native campaign, native acceptance, independent review, owning Fleet typecheck, hosted CI GREEN, commit or push is claimed. Those remaining checks/actions are root-owned. No unavailable required tool was encountered. This handoff is source-frozen for staged publication and subsequent evidence-led diagnosis of the still unresolved53 hosted staging failures.

## Review correction: proof/index path collision

The first evidence index accidentally bound `source-proof.json` to306B command metadata SHA256 `90dadacb0507756e9d718b89c18d6e8080b98128e5ebeced08717b1dcc53d44c`. Invoking `run.py source-proof ... verify-source.py` made the runner write metadata over the verifier's same-named output; the later direct verifier regenerated the actual proof. This caused the single stale indexed artifact.

The original index is preserved byte-for-byte as `evidence-sha256.before-proof-refresh.json` (8315B SHA256 `937057b660833468cd558b27694c65e99b185e9ab1bce11ae740fd40d30a19a8`). The command metadata was reconstructed from the recorded tool output and matched its original306B indexed SHA exactly before being saved separately as `source-proof-command.json`. The actual expanded `source-proof.json` is912B SHA256 `0c4c37c2548be9617439ad4e02d61ba9ff381a496e23bec0d298c6f2974ad418`; its parsed contents exactly match the original `source-proof.log` stdout.

Independent read-only inspection rechecked all16 frozen source identities, ten unchanged production files, six parsed changed Python bodies, the unchanged cold worker entry, and original role/fixture byte caps. `proof-refresh-audit.json` records those comparisons. Only the private report and evidence metadata/index were refreshed; no source bytes or test campaign changed. Distinct proof and command-metadata paths now preserve both records.
