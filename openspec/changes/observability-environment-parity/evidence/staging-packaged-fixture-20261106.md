# Task114 isolated CI fixture repair

Source frozen against baseline `4c0a1aef699806e9a3b870dde7a5cda0ef7038ad`. This agent changed only `lab-staging-native-control.test.ts`, existing `lab-staging-native-cold-fixture.py`, and `lab-staging-channel.test.ts`, plus this private report. No production changes, index operations, commits, pushes, subagents, provisioning, native services, retained-state changes, or b9 replay occurred.

## Isolation and authoritative failures

Current-head infra42129215502 failed5271pass/7opt-in-skip/55fail across5333tests. Original raw log `/tmp/puni-ci42129215502-failure.log` is1980709B, SHA256 `7c006ba066ccb5075e54a7264bdb1ae813b8188ae8402a31b474f017f8da4142`. Its52 staging-control failures reach the original aggregate `runtime_paths` `runtime-mapping` guard. Two channel cleanup mutants fail before their intended witness because they select both staging and newly added publication close loops. The separate metadata-bounds10s timeout belongs to Task113 and was not modified or tested here.

`git archive` of the exact baseline supplies394 files under `/tmp/puni-task114-evidence/tree`. All tests run there against committed helper/control bytes. The three owned fixture changes were copied there;391 other files retain their baseline hashes. This agent did not read or execute the concurrent Task113 writer's partial worktree production helpers. Current-source integration and the single owning Fleet typecheck belong to root after both writers freeze.

## Runtime mapping diagnosis and narrow repair

The real installed Ubuntu hook `/usr/lib/python3.12/sitecustomize.py` is a symlink to `/etc/python3.12/sitecustomize.py`. The latter is155B with SHA256 `43d81125d92376b1a69d53a71126a041cc9a18d8080e92dea0a2ae23be138b1e`. The existing fixture aliased executable, stdlib and libpython observations but omitted the versioned packaged configuration identity.

The reproduction copies that actual installed hook into a disposable package-shaped `etc/python3.14/sitecustomize.py`, links its corresponding `usr/lib/python3.14/sitecustomize.py`, and imports it through the real SourceFileLoader before fixture execution under installed physical Python3.14.7. A temporary filesystem observation seam exposes only this exact package identity as `/etc/python3.14/sitecustomize.py`; reads, opened descriptors, bytes and hashes remain real. No module `__file__` is fabricated. A read-only frame trace at the original aggregate guard shows `/etc/python3.14/sitecustomize.py` as the sole rejected path. Original production sources refuse with the same CI category before any component service handoff.

The repair adds one exact fixture alias: `/etc/${Path(physical_stdlib).name}/sitecustomize.py` maps to the fixed native `/etc/python3.12/sitecustomize.py`. It derives the selected configuration version before the fixture models native3.12. No directory-prefix allowance, caller-selected hook identity, arbitrary named module alias, `runtime_paths` replacement, or production `is_runtime_path` change is introduced. A real module named `sitecustomize` imported from an unrelated path before provider initialization remains refused. New grouped `foreign-runtime` evidence also loads a real foreign same-named source file, observes the unchanged aggregate refusal, then watches only that category's omission expose the actual foreign path in the runtime closure.

To keep existing file caps, the existing runtime provider moved to a prefix of the already allowed cold fixture. Its worker entry below the single boundary remains byte-identical to the baseline4683B entry (SHA256 `128c81b712808387e8c1166a8be56d873a50809df30018e59da496233b4bd2bc`). TypeScript bounds the complete cold source at8192B and requires exactly one nonempty provider boundary before extraction. Actual copied-fixture faults for oversized source, missing boundary and duplicate boundary each refuse module load. Removing that guard admits oversized source to the real AST-entry test. These observations are recorded adjacent to the check and retained in `extraction-proof.json`.

The original source runtime/version/executable/owner/hash checks and cold exec/helper-loaded closure still execute. The full campaign includes original baseline/unexpected-loaded-path/changed-runtime-byte cold cases, watched omissions, authenticated started packets, real descriptor reads, process waits and signal cleanup. They remain component evidence only; native target3.12 policy and qualification are unchanged.

## Cleanup mutant diagnosis and repair

Original channel cases select `os.close(resource)` or `resource.close()` globally. Task111 introduced another matching pair in settlement publication, so the real assertion becomes `('expected one production omission', ['cleanup', 'cleanup'])` or the corresponding socket variant. Both exact failures reproduce on committed baseline helpers.

For only those two omission modes, the AST visitor now traverses the original `_close_staging_resources` function. The exact-one-mutation assertion remains. An audit executes the actual visitor class and compares function ASTs: each mode removes exactly its one original staging close; every other baseline function remains unchanged, including publication cleanup. The real mutant cases now reach their existing witnesses: retained exclusion after final coordinator close, and suppressed injected owner-close failure. Relevant success controls prove normal closes release ownership and retain exclusion until the last transferred right is closed.

## Verification and equivalent lint amendment

All evidence paths below are relative to `/tmp/puni-task114-evidence`.

| Command group                                                                       | Observed output                                                                  | Evidence                                                   |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Original cleanup mutants                                                            | 0pass/2fail,262ms; exact double-match assertion                                  | `red-channel.log`                                          |
| Original positive with packaged3.14 hook                                            | 0pass/1fail,292ms; original runtime-mapping; sole rejected config path           | `red-packaged-runtime.log`, `runtime-rejected-paths.jsonl` |
| First corrected runtime attempt                                                     | 0pass/4fail; temporary shim global `configuration` collided with fixture globals | `green-runtime-focused.log`                                |
| Corrected isolated shim namespace/FD path observations                              | 4pass/0fail,4.26s: positive, cold-runtime, runtime-provider, foreign-runtime     | `green-runtime-focused2.log`                               |
| Corrected cleanup mutants                                                           | 2pass/0fail,394ms; original leak/ownership-failure witnesses                     | `green-channel.log`                                        |
| Foreign startup before provider initialization                                      | 0pass/1 expected fail,261ms; runtime-mapping remains enforced                    | `negative-foreign-startup.log`                             |
| Complete native-control file +7 selected channel controls/mutants                   | 63pass/0fail/79filtered/192assertions;56.25s                                     | `final-targeted.log`                                       |
| First named lint                                                                    | prefer-includes error on boundary duplicate test                                 | `eslint-first.log`                                         |
| Post-amendment extraction proof                                                     | 3 fault refusals; omitted-guard positive accepts oversized source                | `extraction-proof.json`, four `extraction-*.log` files     |
| Final named lint/format/whitespace                                                  | all exit0; format all matched files clean                                        | `eslint.log`, `prettier.log`, `whitespace.log`             |
| Embedded control/cold/channel AST, file caps, immutable baseline and mutation audit | exit0;391 isolated files unchanged; exact staging-only mutants                   | `source-proof.log`, `source-proof.json`                    |

The complete63-pass campaign used control fixture SHA256 `e15fb4aae5031f87b854cecd2674723155b4b55f87a658c87ca0572cf104c392`. Named lint then required the exact equivalent replacement `coldWorker.indexOf(providerBoundary, providerEnd + 1) !== -1` with `coldWorker.includes(providerBoundary, providerEnd + 1)`. Every other fixture byte is identical. `lint-equivalence.json` binds the before/after source hashes and full-run log; the exact before bytes remain `control-before-lint.test.ts`. Both expressions test the same fixed primitive substring from the same finite offset. Root explicitly instructed not to repeat the passing full campaign for this syntax-only correction; the affected extraction faults and all named statics were rerun successfully. No second complete campaign occurred.

The84 audited outer/nested observations all use physical3.14.7; see `runtime-proof.json` and `runtime-observations.jsonl`. Earlier unsuccessful diagnostic evidence is retained rather than presented as GREEN.

## Exact commands

Tests run from `/tmp/puni-task114-evidence/tree`; named lint/format/whitespace run from `/home/df/.codex/worktrees/aa39/puni-00`.

```sh
# RED before changes:
/home/df/.bun/bin/bun test tools/tool-fleet/src/lab-staging-channel.test.ts --test-name-pattern '^staging channel watched cleanup(-sockets)? omission'
TASK114_TRACE=1 /home/df/.bun/bin/bun test --preload /tmp/puni-task114-evidence/packaged-preload.ts tools/tool-fleet/src/lab-staging-native-control.test.ts --test-name-pattern '^native staging source positive '
# One complete campaign:
/home/df/.bun/bin/bun test --preload /tmp/puni-task114-evidence/packaged-preload.ts --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/lab-staging-native-control.test.ts tools/tool-fleet/src/lab-staging-channel.test.ts --test-name-pattern '^(finite staging entry |native staging source |staging channel (quiet|closing-copies|owner-close-failure|parent-close-first) preserves |staging channel watched (cleanup|cleanup-sockets|unlock-close) omission )'
# Post-lint mechanical equivalence and checks:
/usr/bin/python3 /tmp/puni-task114-evidence/prove-extraction.py
/usr/bin/python3 /tmp/puni-task114-evidence/verify-source.py
/home/df/.bun/bin/bun x eslint tools/tool-fleet/src/lab-staging-native-control.test.ts tools/tool-fleet/src/lab-staging-channel.test.ts
/home/df/.bun/bin/bun x prettier --check tools/tool-fleet/src/lab-staging-native-control.test.ts tools/tool-fleet/src/lab-staging-channel.test.ts
git diff --check -- tools/tool-fleet/src/lab-staging-native-control.test.ts tools/tool-fleet/src/lab-staging-native-cold-fixture.py tools/tool-fleet/src/lab-staging-channel.test.ts
```

## Frozen identities and retained evidence

- `tools/tool-fleet/src/lab-staging-native-control.test.ts`: 56780B, SHA256 `80178418628050c7c0bd58a75541a4541b7e55f0af024e67477ad0ad6994b1ab`.
- `tools/tool-fleet/src/lab-staging-native-cold-fixture.py`: 7338B, SHA256 `b657083fc3bcdffa9e018c6e5983eda9359bbc5e132278b1a241b35462f2e44c`.
- `tools/tool-fleet/src/lab-staging-channel.test.ts`: 30560B, SHA256 `c8622035347ef0302ec678d07fd905df8feff20c7099fe693b70c4d4a059cc3c`.

All original caps remain: control57344B maximum, cold8192B maximum. Production controls in the isolated baseline remain:

- `staging-native-control.py`: `e30a28472334fe23c5d39ae7f694a289b24eb9836463f28ae5078034d0e735f9`.
- `repair-native-control.py`: `92c5011dac4c803c2f1e241f069f454d94c27ebdb17f9f5b199b5f7e6dd7ab7c`.
- `staging-native-prepare-draft.py`: `c9c2040f795372cfa99de0707c2fc68df5148e5929b23727a6f4601faac94b34`.
- `staging-native-prepare-bootstrap.py`: `7c23633b8e693fb5406f8947c0999fb21ddf286bc6085e75b1cb84089f9d0f03`.

- `final-targeted.log`: 5726B, SHA256 `7162d3fdce0dac15be630c3c6d46faf4f9e84338b94ece2e08da00bebf60949a`.
- `red-channel.log`: 2048B, SHA256 `cad4e8cf4277f8ff32fff2b3518090b22b7d70f3d7a29cd5eb8c240e651f301f`.
- `red-packaged-runtime.log`: 1376B, SHA256 `d8081f03d2cbfda4f169c5e49a24599227edd43cfdb764d3c5d960c23180af83`.
- `task114.diff`: 10207B, SHA256 `dc59d1a7b510020016718f96527a9e87e33a4b76d9952c15166c6719941cb3b4`.
- `lint-equivalence.json`: 664B, SHA256 `5eec637e314a76306883738eb73a29ad1743d29af3f9659d2aae0281a432edf0`.

`index.json` routes the evidence. `evidence-sha256.json` records retained top-level scripts, snapshots and logs; `baseline.json` records the394 archived files and `source-proof.json` binds final fixture copies. `task114.diff` contains the full owned delta.

## Limits and handoff

The hosted aggregate log does not enumerate its runtime paths, and this task did not capture the actual hosted filesystem or rerun CI. The supported packaged configuration gap is concretely reproduced and repaired; hosted CI GREEN is not claimed. The new exact alias deliberately leaves other foreign inputs refused.

No full86-case channel campaign, Task112 operator suite, full Fleet/app/browser/host gate, live native service qualification, metadata-bounds timeout change, provisioning, or retained attempt/request operation was performed. Task113 integration against its final production helpers, independent review, the single owning Fleet typecheck, public OpenSpec evidence, normal commit and fresh publication remain root's responsibilities. Source is frozen for that handoff.
