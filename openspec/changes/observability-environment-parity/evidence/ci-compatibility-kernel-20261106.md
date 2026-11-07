# Task117 selected-kernel fixture follow-up

Source frozen for root review; fresh hosted confirmation remains pending. Published9034 infra42156507367 failed5488pass/7existing skips/41fail across5536tests/130files/16043assertions,1042.78s. Raw `/tmp/puni-ci42156507367-failure.log` is2109934B SHA256 `af83173939e968e37c0bfd98e53b82f12079845be18520c5686afb80644ddc5c`. Its82 rendered failing names represent41 unique staging cases. The first unexpected boundary is unchanged production `check_request` at `kernel-schema`: it requires selected7.0.11-76070011-generic/x86_64, while the fixture built its request from the actual component host's `os.uname`. The exact hosted release was not captured; the local injected foreign release is explicitly a substitute, never a hosted capture. Native kernel policy was correct and remains unchanged.

After explicit single-writer handoff, the two authorized fixture files were amended. The shared provider prefix gains exactly one91B `os.uname` model returning `os.uname_result(('Linux','','7.0.11-76070011-generic','fixture','x86_64'))`. Outer request creation and cold interpreter verification execute that identical provider. The existing runtime-provider group gains exactly one kernel-binding fault: only observed release changes to `foreign`; the unchanged real `verify_environment` refuses with `kernel-binding`, and omission of only that owning guard returns the verified source capture. Its captured observer is restored in `finally`. The adjacent Proof comment records the observed omission. No native source predicate, selected runtime policy, source role, request authority, limit, timeout, skip or extra allowance changes.

### Paused118 baseline and attribution

The cohort deliberately ran against the explicit paused Task118 checkpoint, **not a claim that partial production roles still equal9034 or are accepted**. `paused-baseline.json` names/hashes21 files, including all ten initially dirty paths. All16 source/test/control identities match the final freeze:two owned fixture changes plus14 exact unchanged non-owned identities. The five partial118 source/test identities retained throughout are:

| Paused path below tools/tool-fleet/src |  Bytes | SHA256                                                             |
| -------------------------------------- | -----: | ------------------------------------------------------------------ |
| `lab-raw-repair.py`                    | 118162 | `2437fa923f176880a2cd3db865dbd58557b5d64f65d3b02756375615a8f6a8d2` |
| `lab-repair-worker.py`                 | 112002 | `5a3edfa2816f41fe6ccaa62497a6bd45ab8da657cabdd663aad8ed061f76e9c3` |
| `lab-raw-repair.ts`                    |   7118 | `761f1463c626d1f7a038975bdc7c1358b2bf351770119f982bbd1e99c3b55548` |
| `lab-raw-repair-source.test.ts`        |  27050 | `7e67911958fe105a2871ac33bbe7756e1b35d2b5edd650b8c90bfe977554cc77` |
| `lab-raw-repair-recovery.test.ts`      |   7496 | `4d5a1e8e96ab1844b1143b58ede9f7ab6fe5aeba75f89f7a8b440e5cae923bb6` |

A first broad paused-file audit stopped on an unrelated document change. Root confirmed it intentionally updated only `failed-repair-source-consumption.md` for118readiness authority while118source/test writes remained paused. This file was preserved: paused26901B SHA256 `bdc2751358b6d3eb210282e218e70dde7af8c199b9032c50e9f271c1dd2e7b95`; observed/root-authorized27445B SHA256 `2e6d8e992876c32c56bbe490375ff56740c04d02bdb893fcb83b1cf659bdc54e`. Both identities/attribution remain in the evidence; the final audit separates source/test guarantees from owner-updated docs. No campaign was repeated for this documentation change. Native control/prepare/bootstrap four-file bytes equal9034; the CodeQL file remains7383B SHA256 `486883d69dbac907baad4f187da25ca726388b45edf11002a5f45ca4f184ca77`.

### Exact evidence and covering checks

New evidence is exclusively `/tmp/puni-task117-kernel-followup`; earlier evidence indexes/campaigns are not regenerated. Each `.run.json` records exact argv, UTC start, elapsed time, exit and log hash.

| Check                                           | Actual observation                                                                                                                    | Evidence                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Unchanged positive, controlled foreign kernel   | 0pass/1fail; actual production kernel-schema;0.365s                                                                                   | `foreign-kernel-red.log`                       |
| Unchanged positive, selected metadata           | 1pass/0fail/3assertions;1.368s                                                                                                        | `selected-kernel-baseline-green.log`           |
| New shared model under controlled foreign host  | 4pass/0fail/52filtered/12assertions;4.827s, positive/runtime-provider/cold-runtime/foreign-runtime                                    | `modeled-kernel-focused-green.log`             |
| Final frozen full affected staging cohort, once | **56pass/0fail/0skip/168assertions;59.222s**                                                                                          | `final-staging-cohort.log`, `.run.json`        |
| Named lint/format/whitespace                    | All exit0; lint2.572s, format0.265s, whitespace0.008s                                                                                 | `eslint.log`, `prettier.log`, `whitespace.log` |
| Source/AST/freeze inspection                    | 16source/test/control identities;14non-owned exact paused matches; cold entry unchanged; AST-valid; four native sources unchanged9034 | `source-proof.json`, `freeze.json`             |

All56 exact names are retained in `covering-tests.json`. The previous version/executable/hash/owner negatives and omissions, explicit foreign-hook refusal, cold late-path/hash/completeness controls, packet/FD/provenance/dependency/startup-S witnesses remain. New kernel-binding negative and owning omission run inside the existing grouped provider test; it now covers five faults. All61 final outer/cold audit rows use actual3.14.7 with noSite1 and receive `fixture-foreign-host-kernel` before the shared provider replaces only fixture observations. This proves portability against a controlled foreign host, not any actual hosted kernel identity or native target qualification.

```sh
# RED before edits; foreign host is the harness default.
bun test --preload /tmp/puni-task117-kernel-followup/kernel-preload.ts --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/lab-staging-native-control.test.ts --test-name-pattern '^native staging source positive '
# Valid selected-profile baseline before edits.
TASK117_UNAME_PROFILE=selected bun test --preload /tmp/puni-task117-kernel-followup/kernel-preload.ts --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/lab-staging-native-control.test.ts --test-name-pattern '^native staging source positive '
# One final frozen affected cohort; existing timeout is unchanged.
bun test --preload /tmp/puni-task117-kernel-followup/kernel-preload.ts --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/lab-staging-native-control.test.ts
bun x eslint tools/tool-fleet/src/lab-staging-native-control.test.ts
bun x prettier --check tools/tool-fleet/src/lab-staging-native-control.test.ts
git diff --check -- tools/tool-fleet/src/lab-staging-native-control.test.ts tools/tool-fleet/src/lab-staging-native-cold-fixture.py
```

Final cold: **8183/8192B**, SHA256 `85d3f33b59b55a80fe3633b10e9f000f565285bf2db7a5d8c75adec80a7c9612`. Final control: **57342/57344B**, SHA256 `6fac2f35aeb95d6e8e6fc88767bdbe87bcfbbc926a9757408583cb311aa7b6a3`. No other code was minified, checks/comments removed, or bounds raised to fit. The cold worker entry below the shared-provider boundary remains byte-identical. Final log5049B SHA256 `15eed29caefe292e29ddcbec2311cd4e7ad2835765239bcc356bb65661265ad6`. Existing131072-byte per-role/786432-byte aggregate policy and all runtime/physical/outside/settlement caps remain unchanged; this does not accept Task118's partial source role set.

No211/19/full Fleet/app/browser/host/native campaign, target/service/admin/retained operation, consumed request replay, subagent, index action, commit or push occurred. Root owns scoped review,118resumption, final typing after118freeze and all publication. Actual hosted GREEN remains unverified until the next natural publication.
