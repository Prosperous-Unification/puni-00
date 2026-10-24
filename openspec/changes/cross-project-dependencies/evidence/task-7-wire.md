# Connected solver wire/Python checkpoint (wire 5, scheduler 18, solver 0.4.0)

Worktree `/tmp/puni-cross-solver-wire`, base `aa249987b`. No Git metadata mutations. Root owns integration, backend coordinator/cache, WBS, and gate. The separate lookup refusal file `libs/wbs/domain/contracts/src/http/project-address-shapes.ts` is **excluded** from this wire manifest; root integrated its follow-up as `205df84a4` from `/tmp/puni-lookup-refusal-followup.md`.

## Implemented

- Strict local/connected wire-5 request and response arms, exact required schema fields, local scope echo, connected scope/question echo, signed directional boundaries, fixed foreign owner/placement and person-holder provenance. Normative schema and installed Python copy remain byte-identical; historical wire files remain unchanged. Local golden corpus and existing local behavior remain green.
- `buildConnectedSolverRequestPair` projects only selected-project decisions from the authoritative resolved graph, retains every expanded authored pair and relationship identity, computes conservative incoming/outgoing FS/SS/FF integer bounds, captures foreign fixed placements, rounded shared-person bookings, movement reference, nullable feasible baseline and separate untrusted seed. Safe preflight includes incoming floors and reference extent. Direct 0.2/1/1.2 Q48 window returns Astra-approved prepared terminal `{kind,stage,request,evidence}` with lower10/upper9, not a persisted certificate.
- Python schema/model/solve validates connected owner/boundary/occupancy evidence, installs every local start inequality and foreign booking, probes a declared witness against the full model, treats a seed only as advice, and distinguishes initial-model boundary infeasibility from ordinary infeasible and unknown. Bun connected parser/revalidator checks exact identity, reconstructed request correspondence even for nonpublishing responses, incoming/outgoing offsets, and existing local numeric/capacity/objective checks.
- Host supervisor admits wire 5 alongside 1–4. Isolated configured setup built installed solver 0.4.0; its local golden request returned feasible, and the installed console script returned a scoped wire-5 boundary-infeasible response for the connected fixture. Three authorized backend image/client script files now use current version/scope; focused script tests pass.
- Scheduler contract version 18; exact metadata-only `contractVersion:17→18` in both domain golden corpus JSON files, with parsed `cases` deep-equal true. Two historical dual-optimized-scheduler document enumeration lines changed only to tag local request/response and add required `scope`; active drift suite passed.

## Verification evidence

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-contracts:test --skip-nx-cache`: 512 pass, 0 fail (`/tmp/puni-wire-contracts-final.log`). Fresh typecheck and sequential lint targets passed (`/tmp/puni-wire-contracts-typecheck.log`, `/tmp/puni-wire-contracts-lint-afterfix.log`).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false PATH=/tmp/puni-solver-wire-venv/bin:$PATH bunx nx run wbs-solver-py:test --skip-nx-cache`: 273 pass, 0 fail (`/tmp/puni-wire-python-final.log`). Disposable interpreter dependencies were installed from exact hash-locked requirements, separate from the installed-runtime check. The initial missing-module and sandbox DNS failures were setup failures, not behavior/R5 proofs.
- Configured `wbs-solver-py:setup-local-solver --skip-nx-cache` passed on authorized network escalation in this isolated worktree (`/tmp/puni-wire-setup-local-solver-escalated.log`): Python 3.14.7, installed wbs-solver 0.4.0, golden request feasible. Installed connected request/response: `/tmp/puni-wire-installed-connected-request.json` and `/tmp/puni-wire-installed-connected-response.json`.
- Configured `wbs-solver-supervisor-protocol:test` 12 pass/0 fail and typecheck/lint passed (`/tmp/puni-wire-supervisor-final.log`, `/tmp/puni-wire-protocol-typecheck.log`, `/tmp/puni-wire-protocol-lint-final.log`).
- Configured `wbs-domain:test` 1331 pass/0 fail/1 existing performance skip after exact fixture re-key; before re-key 1327 pass/4 version failures/1 skip (`/tmp/puni-wire-domain-test-final.log`, `/tmp/puni-wire-domain-test-green.log`). Domain typecheck/lint passed (`/tmp/puni-wire-domain-typecheck.log`, `/tmp/puni-wire-domain-lint-afterfix.log`).
- Focused backend image/client script tests 8 pass/4 active-version failures before update, 12 pass/0 fail after (`/tmp/puni-wire-backend-smoke-{red,green}.log`). Changed TypeScript ESLint and Prettier checks passed; `git diff --check` and schema byte `cmp` passed.

## Observed R5 fault proofs

| Fault injected into production path                                                                                                               | Observed focused failure/log                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Incoming FS ceil→floor                                                                                                                            | 0.2/1/1.2 contradiction became a request; 5 pass/2 fail, `/tmp/puni-wire-fsceil-mutant.log`                                                                   |
| Incoming SS ceil→floor; outgoing SS floor→ceil; outgoing FS floor→ceil; incoming FF real-duration ceil→floor; outgoing FF fixed-finish floor→ceil | Fractional bound assertions failed, 1–2 focused failures each; `/tmp/puni-wire-{ss-incoming,ss-outgoing,fs-outgoing,ff-incoming,ff-outgoing}-mutant.log`      |
| Only first resolved graph edge projected                                                                                                          | Four-pair fixture received one bound, 4 pass/4 fail, `/tmp/puni-wire-expanded-mutant.log`                                                                     |
| Bun incoming/outgoing result bound checks disabled                                                                                                | Invalid feasible offset published, 5/1 and 6/1, `/tmp/puni-wire-{boundary,outgoing}-mutant.log`                                                               |
| Bun canonical request correspondence disabled                                                                                                     | Missing authored boundary on unknown accepted, 8/1, `/tmp/puni-wire-correspondence-mutant.log`                                                                |
| Bun connected questionHash check disabled; boundary no-active check disabled                                                                      | Wrong question or fabricated terminal accepted, 13/1 each, `/tmp/puni-wire-{scope-echo,parser-no-active}-mutant.log`                                          |
| Connected reference omitted from preflight horizon                                                                                                | Horizon 58 despite reference 48000, 10/1, `/tmp/puni-wire-horizon-mutant.log`                                                                                 |
| Host wire-5 compatibility absent; old solver version guard disabled                                                                               | Host start rejected valid wire5 (11/1); old0.3 prepared wire5 (12/1), `/tmp/puni-wire-version-mutant.log` plus test red output                                |
| Python incoming/outgoing model inequalities disabled                                                                                              | 8 and 5 failures among 269 tests, `/tmp/puni-wire-python-{incoming,outgoing}-mutant.log`                                                                      |
| Python boundary terminal mapping disabled; unknown relabelled as boundary                                                                         | 6/269 and 1/272 failures, `/tmp/puni-wire-python-{classification,unknown}-mutant.log`                                                                         |
| Python witness probe used seed; occupancy comparison disabled                                                                                     | Invalid declared witness accepted (1/271); missing booking accepted (1/272), `/tmp/puni-wire-python-{seed,occupancy}-mutant.log`                              |
| Connected schema `occupancy` no longer required; installed schema accepted unknown scope member                                                   | Bun drift test 16/1; Python behavior test plus byte-copy guards 3/271, `/tmp/puni-wire-schema-required-mutant.log`, `/tmp/puni-wire-python-schema-mutant.log` |
| Foreign occupancy holder omitted                                                                                                                  | Provenance assertion failed 11/1, `/tmp/puni-wire-occupancy-mutant.log`                                                                                       |

The frozen equations contain algebraically masked terms under `D=ceil(Qd)`: incoming FF `ceil(QF)-D` cannot exceed `ceil(Q(F-d))`; outgoing FS/FF real-duration floor terms cannot be below their fixed-coordinate floor-minus-D terms. These terms are retained verbatim for architectural fidelity, but no independent breakage claim is made. No-test and missing-module failures are not counted as proofs.

## Open integration boundary

The backend coordinator/cache/publication adapter and persisted `BoundaryInfeasibleCertificate` are later slices. This checkpoint has the Astra-approved prepared finding, not delivery or storage. `revalidateConnectedSolverResult` validates wire placement; full component materialization, immutable foreign replay, real-domain publication comparison, process-outcome-to-certificate path, and questionHash generation in the hashing adapter remain for 7.3+.

Known active backend test compatibility remains open in `apps/wbs/be-01/src/services.db.test.ts`, deliberately untouched because the command lane also owns it. Actual configured `wbs-be-01:typecheck` fails only at line571: `completedSelectedChild` has `wireVersion:4` and no local `scope`; minimum compile repair is `wireVersion:5 as const, scope:{kind:'local' as const}` in the response at line562. That file has many active `buildSolverRequestPair(...,'0.3.0',...)` and emitted wire4 responses (for example lines2242–2245), requiring an owning-lane semantic sweep, not a blind text replacement. Log `/tmp/puni-wire-backend-typecheck.log`. `apps/wbs/be-01/scripts/solver-image-smoke.sh` Docker target, full backend test target, h2/h4 gates, and end-to-end publication/cache are unrun and remain unverified. Core/store fixtures such as `libs/wbs/application/core/src/compose.test.ts` (`7+0.3.0`), core shared-people tests and store SQLite chain/fanout tests (`17+0.3.0`) use explicit historical/arbitrary cache identity strings, not active current solver handshake, and were preserved pending integration review.

## Exact owned path/hash manifest

The 74 paths below exclude the root-owned lookup refusal follow-up. Each hash is SHA-256 of current worktree bytes, including the two permitted historical document lines and both domain fixture metadata-only updates.

```text
a983e37e0d0031a9425978c717138ce4e04af866f9e7f6ae0093c5b2b8359120  apps/wbs/be-01/scripts/solver-image-scenario.test.ts
87b7ed51365939ebed89b1df08f3784c88fcf83f6935d4ce7383c068c9221389  apps/wbs/be-01/scripts/solver-image-scenario.ts
cd2b6b6080e7d14c6be119bcdd02f3c4014b0f1796acef19591c717c028fbaf5  apps/wbs/be-01/scripts/solver-installed-client.test.ts
5f35c10bb4efa6a8013bc8f63e8fcbe8a43ea4dfa350192d9215cdc6a77f78b9  libs/wbs/adapters/solver-py/pyproject.toml
6b9c02351714fabda69c55e63afae625a7453259331bc0837e0751cb093bd1eb  libs/wbs/adapters/solver-py/src/wbs_solver/__init__.py
a098d6cb9af7ce800697c63bad49c904fb2a94e939110ff6647708c04cace1b4  libs/wbs/adapters/solver-py/src/wbs_solver/model.py
fb2bb30456605105adc522967d04b27e55374610c4f1a79fa2fe07c9f28f59d3  libs/wbs/adapters/solver-py/src/wbs_solver/solve.py
c2574a0a703c25d59722508b7156932c9668b5f211e7992194901c9f40698469  libs/wbs/adapters/solver-py/src/wbs_solver/solver-wire.v5.json
09c548c078911c4edecd6b88c150b2fd6923a96e189296d77e56c89a5e42c5fd  libs/wbs/adapters/solver-py/src/wbs_solver/validate.py
e8442e17485315cecd6d8bc88d936a8694caa0278641e85014a0250b723957ee  libs/wbs/adapters/solver-py/tests/test_cli.py
e1db1960c23bd0ec1eda4009886de0c6615cc4fd63d846a51895f69a0e43cee7  libs/wbs/adapters/solver-py/tests/test_connected.py
cfd0ed2960f6150cc43e712a0da4c2113bc635f6ad231f0dc1f1c4f53abf6b0b  libs/wbs/adapters/solver-py/tests/test_elsewhere.py
4d672faf27809cf041fe1691f3fe367411942b8c7c4e0f10caac7cc6e9629bec  libs/wbs/adapters/solver-py/tests/test_launcher.py
fd893251e1187b58d8fdddf26091187d31257035606d53a4ba3918aa8eb0bdfe  libs/wbs/adapters/solver-py/tests/test_model.py
9b529168edd14b3578f013fc6e03a146c7a1c49e6b93350758acf098475dc570  libs/wbs/adapters/solver-py/tests/test_schema_copy.py
00e9d58c1d24afe9a006642ceb34cbadeb96af993dc1a22f82f04f6ad8ec9274  libs/wbs/adapters/solver-supervisor-protocol/src/index.test.ts
7638c14e9454752d752eef89b06bc23c8dccda452a505bd45e079ff8ecceba77  libs/wbs/adapters/solver-supervisor-protocol/src/index.ts
65d54aeccb10b70880795bb3355abacb79a548765c3582e3b36ef5617d926550  libs/wbs/domain/contracts/solver/fixtures/manifest.json
3998bbe093770c900a0b30ea376c85e104865b31954fa397c4c75107334d0e8c  libs/wbs/domain/contracts/solver/fixtures/request/invalid-fractional-width.json
7fbd703c60d44969f9df748351b44796b3ab84b9b83921c870cc6a44f921d17d  libs/wbs/domain/contracts/solver/fixtures/request/invalid-missing-work-item-key.json
7be1f488acdcc4e465ad652bf2ce680f104693d16fc8f20b0104ea819e018086  libs/wbs/domain/contracts/solver/fixtures/request/invalid-positional-edge.json
d2616132ac76f97449051e9beac94ec70e98908b72b816fb3bd7ee17b94860db  libs/wbs/domain/contracts/solver/fixtures/request/invalid-unknown-key.json
20152e1720131bae112eaaba51d78a174ae2de52dca4f902091ab3e776607e2b  libs/wbs/domain/contracts/solver/fixtures/request/invalid-zero-demand-units.json
03f9c3885c9436f3a00e4e77a8c1d02b3c25d568cc3abf457e61bd2940b6deb8  libs/wbs/domain/contracts/solver/fixtures/request/invalid-zero-pool-size.json
e342d5d1f04913ecb576adbb158530d9867beae02d59fdbca90595be337ec69c  libs/wbs/domain/contracts/solver/fixtures/request/invalid-zero-width.json
cce1cc01ffb59be9ab3adfb33d524e385372ea793c0ca94840279e898da0f4ec  libs/wbs/domain/contracts/solver/fixtures/request/negative-printable-key.json
6ab45238febc8b03abbb8ac7b76038bea6e283406086deebe0170c442d2ee6c4  libs/wbs/domain/contracts/solver/fixtures/request/valid-all-zero-milestone.json
2d9d1b9cb0b905014a7b5713cca405bc2586e617298b083ebf195af3a5476bd5  libs/wbs/domain/contracts/solver/fixtures/request/valid-divisible-resource.json
b423ed1179eab9d47f74465e2cd5d21a4ac2164ca82a1ff6eb133582481afc64  libs/wbs/domain/contracts/solver/fixtures/request/valid-ff-quantization.json
a7656ab6358ffd3102ade84c3729e7c0c92653263597f3d6ca5c3c735c369598  libs/wbs/domain/contracts/solver/fixtures/request/valid-positive-with-zero-steps.json
3ba7571ac4542bf9562592fdfa32b6c4acc99048dc75c38bad81f3b1cd57dfdc  libs/wbs/domain/contracts/solver/fixtures/request/valid-quantised-baseline.json
03c4e467e7b71b83f0ec1a47cb2153c1795e0b976bd3e881ec407e4409d5003c  libs/wbs/domain/contracts/solver/fixtures/request/valid-staging-resource.json
db4cb2a4a026eecab32618ab688281a262949de4029769fdcac7a8a576a97e5e  libs/wbs/domain/contracts/solver/fixtures/request/valid-two-slices.json
fabc96a14d51b275b9350478d998bdf86dcd99884c43bf48ac1bb79faa226742  libs/wbs/domain/contracts/solver/fixtures/response/invalid-feasible-without-offsets.json
157364d60fa033b416825d684035ea595787d32c3ebe93c7bc644ef52fcafb93  libs/wbs/domain/contracts/solver/fixtures/response/invalid-fourth-stage-status.json
b1c1fcc63676ffb21a4d6b0aeb68e3fb55f115d14800a86ac22675956235b192  libs/wbs/domain/contracts/solver/fixtures/response/invalid-infeasible-with-offsets.json
3ef97311abdcd2f26822f1f25d7454888ef8a2317d971036e9416cf3beb007cb  libs/wbs/domain/contracts/solver/fixtures/response/invalid-missing-term.json
f405b2969d3456a0d1568942936ba4b09f2fdb97888fe3b6262d13c61261095d  libs/wbs/domain/contracts/solver/fixtures/response/invalid-response-optimal-status.json
9252c2cb75c8f6f26a7a6b28f97fcb9338adb7bd3455c6e0a21222a4b686188f  libs/wbs/domain/contracts/solver/fixtures/response/invalid-uppercase-term-key.json
7a54cbe94b815f072c0894b12242c0c384025c929807ef0eec783a5fb5be1d07  libs/wbs/domain/contracts/solver/fixtures/response/valid-feasible.json
bbe8c7d70c72e549fb10106a149bf1caaf317be168bc7e74251d2455bd690fd6  libs/wbs/domain/contracts/solver/fixtures/response/valid-infeasible.json
9fbe58c8890b8362cc883710dcfb151c68540affff98d66fc15d50429088a712  libs/wbs/domain/contracts/solver/fixtures/response/valid-unknown-no-incumbent.json
c2574a0a703c25d59722508b7156932c9668b5f211e7992194901c9f40698469  libs/wbs/domain/contracts/solver/solver-wire.v5.json
72f87573f246beef23f1d74c97066b01653a38840bf9546886a53fa3d2cc3fde  libs/wbs/domain/contracts/solver/src/baseline-feasibility.test.ts
69684406fd9d2cae6a63ffc0b552f50c1bbab70d4fe4fad49b5553f27dacd4e8  libs/wbs/domain/contracts/solver/src/build-connected-solver-request.ts
14cf88b2ce37eae720ec7861237aca785d377a53ecb3a996e0b73b0e493561b6  libs/wbs/domain/contracts/solver/src/build-solver-request.test.ts
f5a8442558e629d039d502b57e8b0fb14adccd5967b0c62aab388f1a24c5fdfa  libs/wbs/domain/contracts/solver/src/build-solver-request.ts
d5575b537d5d80ac2a392a9c8a141b0c59ba20cbe6409adafd532a4a93d84b7b  libs/wbs/domain/contracts/solver/src/connected-boundaries.test.ts
48d4f55d837e48889dd40e68c6e87c74ee4ac8a0224a19c845d1726cf72c3233  libs/wbs/domain/contracts/solver/src/connected-boundaries.ts
0baa29c21fc0b383269a1017fe425c92b4b06879423bebbce0262fcea346386f  libs/wbs/domain/contracts/solver/src/elsewhere-wire.test.ts
f458ea223433c928a02e974bee257382ac76e6ac97adab935f022f9c51b242bb  libs/wbs/domain/contracts/solver/src/golden-request.test.ts
0ae676e15123cdb9c3c1dfa805925211fc412d5009ecbe903de89a276f7f5156  libs/wbs/domain/contracts/solver/src/parse-solver-response.test.ts
e7cb52832ab63ec377f194e13cda0e1bb76d4fda9df1975d23e8ba91273e0d27  libs/wbs/domain/contracts/solver/src/parse-solver-response.ts
a848c165b80ff66033096251bf5f97427bdb2e3a96b1205ac89dc0507e71ed5e  libs/wbs/domain/contracts/solver/src/quantised-baseline.test.ts
3f73e3170dc798ed7e5e67b5fa3b155daa545bf0c0d227e8d48c6dc8fe41cec9  libs/wbs/domain/contracts/solver/src/resource-wire.test.ts
42317a2c288ea6878b21da4aa939ddcd240fe910167f31887e0035bb9c200fb4  libs/wbs/domain/contracts/solver/src/revalidate-solver-result.test.ts
617525e47db0a27bd01d16e1cbf9b8ee4bfbdea1d710ac42227ad9d2d8f7209c  libs/wbs/domain/contracts/solver/src/revalidate-solver-result.ts
d25456ffcd61ef4cb94299117f7e9fad079ff77e0ce08f365a7958a20f294144  libs/wbs/domain/contracts/solver/src/solver-exit-outcome.test.ts
661774e8b65a67c07fd99d9d58c0dac7ecd06d0210203252c305e2e61a8cc71e  libs/wbs/domain/contracts/solver/src/solver-failure-disposition.ts
5449d783a8bed1e2599fa64ec5f76a66383dab81ccad75794e7bb302ce5f3fa4  libs/wbs/domain/contracts/solver/src/solver-preflight.ts
47717fe07390fc5008ca2ef8ee10a3b1d7e8c1acaea12271217749ebeb8f7114  libs/wbs/domain/contracts/solver/src/solver-request-pair.test.ts
c8b9bce33f1971b000e32524bf44ba5d0e4a60a4326b2951692c5f74eb8f2136  libs/wbs/domain/contracts/solver/src/typed-dependency-solver.test.ts
4fff8ca6a575ba950fc5b89a8ade4b272a3d22a6478ab1f09f99d39ffec7b3e5  libs/wbs/domain/contracts/solver/src/wire-contract-version.test.ts
b1f0f9937d17b9b983c48647133d08c48b5bace67e285a3ca7c504b09e7671b6  libs/wbs/domain/contracts/solver/src/wire-types.test.ts
21ee63065800efe4da6d75f96dcbff768e12cec305afaf4b29547d464c998706  libs/wbs/domain/contracts/solver/src/wire-types.ts
4654976f87d8c13c7374943f5856b393ade4140fcb1ca5660a5dbd99a2b08f27  libs/wbs/domain/contracts/solver/src/wire-vocabulary.test.ts
613efc3ec6b00de7387f38b912644e4a5bb920d8fd1b87293694a2e3c3a30c33  libs/wbs/domain/contracts/solver/src/wire-vocabulary.ts
327976c08d5a084b69ca1dea9b98048ff8403eae369afdac9571b7c41d655630  libs/wbs/domain/domain/fixtures/fast-golden-corpus.json
348b7b508b7f3e8d382595cbddee778b7d0155468ceba8f8e2181e33615e67cf  libs/wbs/domain/domain/fixtures/solver-quantum-golden-corpus.json
839802370be7aea96a997672f5ab36d4264f2ccb740843e2f33bb539040005d5  libs/wbs/domain/domain/src/contract-version.test.ts
c1f0d42190ce27d675e4659fee1d5f04cdaff416283fbdf2a47abd4d3c7b0e2a  libs/wbs/domain/domain/src/contract-version.ts
1bb5c85b697dff4193cd7ab02c38138f90fe1278281d7bea4cbefa30d442ffb6  libs/wbs/domain/domain/src/index.ts
d8f205725604ef7af6163fdb895cb44c6b73381b1470d92a253e7a875f191d62  openspec/changes/dual-optimized-scheduler/design.md
62d8b33a3cca4508616eba60c217614ba38b65faa4b7feed91d875cef2aa9ace  openspec/changes/dual-optimized-scheduler/specs/scheduler-optimization/spec.md
```
