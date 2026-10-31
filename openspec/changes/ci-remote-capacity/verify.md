# Verification

Authoring follows the approved fixed exception and measured trigger recorded in proposal/design. Cold hosted complete leaf execution and required aggregate success remain mandatory acceptance evidence and have not yet run. No native, SSH, Docker or deployment actions are authorized by this change.

## Cleanup slice

Official Bun 1.4.4: actual-preload/remover test began RED (expected exit 0, got 1). With only `afterAll(removeScratchAfterAll, 30_000)` added, `bun test tools/test/scratch --preload ./tools/test/scratch/preload.ts --timeout=30000` passed 8 tests/59 assertions. Each finite owned copy injects 100 ms immediately before actual rmSync, retaining two physical fixture-removal checks and marker assertions. Removing only the allowance from the actual source made the passing replay fail again. Restored afterward. The control with an explicit scaled 50 ms hook allowance still fails on the 100 ms hook; two ordinary hangs still fail at 20 ms while cleanup passes. Existing later-file subprocess deadline tests also pass. Logs: `/tmp/puni-cleanup-budget-{red,green,omission-red}.log`.

The inherited-budget source RED and allowance omission exercised the real copied preload/remover; no timing code was added to the production helper. `index.ts`, callback body, markers/error policy, ordinary target budgets and outer phase/job limits are unchanged. Hosted cleanup success remains unverified for this new head.

## Fixed execution source and discovery proofs

The canonical `tool-remote-scripts:test` command/inputs/env/dependencies and canonical host scripts remain unchanged. New CI-only `test:ci:model`/`test:ci:rest` targets are cache:false, copy every canonical input and the test default env explicitly, retain actual Nx executor environment, and require dependency builds. Only rest depends on the unchanged real Caddy target. Remote rest owns typecheck/build and full-mode lint; workspace still owns independent affected lint. Both independently validated runtime calls share the existing remote plan bit. The source runner rejects additional CLI args, unsupported raw command/cwd/preload/config/target/default/env, changed Bun pin, absent/unreadable/aliased required test files and unsuccessful or empty execution. Its 16 KiB stderr tail validates a real Bun summary while stdout/stderr continue streaming. A fresh receipt carries exact head, leaf, counts, elapsed time and exit zero; nonzero children retain their status.

The real tiny Bun canonical run and both actual leaf runs prove complete disjoint union, preserving every original discovery token and exact no-dot literal ignore. Controls include new src tests, src-shadow substring matches, similar basenames and nested exact-suffix paths. An actual Nx fixture invokes the configured aliases against tiny owned tests, overriding hostile ambient CLAUDECODE/AGENT; physical markers prove prerequisite builds in each independent invocation and Caddy exactly once, only in rest. No native program or container runs in these fixtures.

The runner began RED (missing leaf implementation), then passed actual Bun/Nx tests. Twenty runner omission/fault watches were observed as assertion failures and restored: required presence, alias, readability, canonical command and dependency, leaf inputs/env, default environment and wildcard defaults, unexpected target configuration, ambient environment, immutable head, empty child, failed child status, unknown leaf, dotted ignore, widened ignore, dropped discovery token, Bun pin and selection environment. Exact receipts/log paths are `/tmp/puni-remote-leaf-omissions.json`, `/tmp/puni-remote-leaf-more-omissions.json`, `/tmp/puni-remote-leaf-pin-omissions.json` and `/tmp/puni-remote-leaf-omission-*.log`. Missing and unreadable fixtures are distinct cases. Adjacent `Proof:` comments name these production-path faults.

Six dispatcher/workflow omission watches also failed and were restored: removing the model leaf from the actual Bash required reducer, duplicating the physical model selection in place of rest, omitting leaf dispatch, dispatching it twice, dropping mode refusal and dropping full-head equality. The tests execute production Bash/runtime functions; actual Nx/Bun execution is separately proven above. Logs: `/tmp/puni-remote-execution-omissions.json` and `/tmp/puni-remote-execution-omission-*.log`.

## Source approval boundary and limitations

Automatic review initially rejected a combined workflow/dispatcher edit-and-test request because this subagent lacked trusted user authorization in its inherited context. No denied edit executed. The author prepared an unapplied minimal two-file private patch, using explicit repository formatting; parsed YAML showed unchanged triggers, permissions, concurrency, env and all unrelated jobs. Astra approved that limited source diff. ROOT then presented trusted user-goal/developer authorization and exact hashes in a source-edit-only request; automatic review approved, and ROOT applied the exact bytes. No bypass, workflow dispatch, publication or deployment occurred. Subsequent local unit/omission tests use that authorized source.

The first combined production suite passed 131 tests and failed two stale phase-name assertions (remote vs remote-rest/model); the tests were corrected to the explicit execution names, not weakened. Initial lint found import sorting and control-regex/CLI-narrowing issues; these were corrected. An initial omission rerun stopped at a formatting-dependent injection boundary; it restored the source and was rerun with every intended assertion failure observed. No cold hosted leaf execution or complete required gate success is claimed. ROOT owns long replay/publication and actual capacity acceptance. The two original optional Docker skips, native policies, ordinary test budgets, 75-minute phases, 90-minute jobs and local/host full gate remain unchanged.

## Final bounded source checks

At `/tmp/puni-remote-capacity`, official Bun 1.4.4:

```sh
/home/df/.bun/bin/bun test \
  ./tools/tool-git-hooks/src/hooks/ci-remote-tests.test.ts \
  ./tools/tool-git-hooks/src/hooks/ci-plan.test.ts \
  ./tools/tool-git-hooks/src/hooks/ci-capacity-workflow.test.ts \
  ./tools/tool-git-hooks/src/hooks/gate-workflow.test.ts \
  ./tools/tool-git-hooks/src/hooks/pr-merge-base.test.ts \
  ./tools/tool-git-hooks/src/hooks/ci-runtime-partitions.test.ts \
  ./tools/tool-devsync/src/toolchain-pins.test.ts \
  ./tools/test/scratch/scratch.test.ts \
  ./tools/test/scratch/cleanup-budget.test.ts \
  --preload ./tools/test/scratch/preload.ts --timeout=10000
```

Exit 0: **145 pass, 0 fail, 1089 assertions across nine files in 33.62 seconds**.
Log: `/tmp/puni-remote-capacity-final-exact-tests.log`.

- `NX_DAEMON=false /home/df/.bun/bin/bun x nx run tool-git-hooks:lint`: exit 0;
  `/tmp/puni-remote-capacity-final-lint.log`.
- `/home/df/.bun/bin/bun x eslint tools/tool-remote-scripts/test/ci-leaf.ts tools/tool-devsync/src/toolchain-pins.test.ts`:
  exit 0; `/tmp/puni-remote-capacity-final-remote-lint.log`.
- `/home/df/.bun/bin/bun x tsc --build --force tools/tool-git-hooks/tsconfig.json tools/tool-remote-scripts/tsconfig.json`:
  exit 0; `/tmp/puni-remote-capacity-final-types.log`.
- `/home/df/.bun/bin/bun x prettier --check` over every changed source/config/artifact:
  exit 0; `/tmp/puni-remote-capacity-final-format.log`.
- `/home/df/.bun/bin/bun x openspec validate --all --json`: exit 0, 286/286
  changes/specs valid; `/tmp/puni-remote-capacity-final-spec.json`.
- `git diff --check`: exit 0. Parsed configuration comparison against `b2d87d487`
  confirms the entire canonical remote test target is unchanged, as are workflow
  triggers, permissions, concurrency, env and every unrelated job.

A first final-check command used the undotted directory filter `tools/test/scratch`
while TypeScript emitted ignored compiled copies under `dist`. Bun discovered those
copies too: 146 pass, seven failures in compiled scratch copies with wrong
`import.meta` fixture locations. The source tests were not failing. The corrected
command above names exact dotted source files and passed. This verification-command
correction preserves all configured canonical discovery arguments. The initial
OpenSpec command supplied two names to a one-name CLI and was rejected; the complete
`--all` command above then passed.

No full remote suite, application build, native/container tests, cold hosted jobs,
full host gate or deployment ran for this source checkpoint. The independent source
cleanup checkpoint is `a707d216d071dacb6b37ef09d981993671912445`; Astra independently
approved that slice after its actual-preload replay. Cold split elapsed times and
required aggregate success still block a claim that capacity is established.

## Review repair: explicit concurrency on both leaf commands

Astra's frozen-source review found that the new leaf `nx run` command omitted
`--parallel=2`. The pinned Nx implementation uses `nx.json.parallel` when the CLI
value is absent, and this repository sets it to four. The original static
`run-many` already retained two. The shared model/rest leaf call now explicitly
passes two as well; no root config, workflow, target, environment or deadline changes.

The actual dispatcher regression now requires that exact argument across affected/full
and model/rest. It began RED, passed with the one-argument repair, and failed again
when only that argument was deleted. The source was restored. The actual Nx fixture
also invokes both aliases with `--parallel=2`; both still produce fresh successful
Bun receipts under the runner's exact argument-count check, proving Nx consumes the
flag rather than forwarding it to Bun. Focused verification: two tests/27 assertions
passed in 2.60 seconds. Logs: `/tmp/puni-remote-parallel-author-{red,green,omission-red}.log`.

After restoration, the same exact nine-file source command above passed **145 tests,
1089 assertions, zero failures in 37.07 seconds**:
`/tmp/puni-remote-parallel-final-tests.log`. `NX_DAEMON=false bun x nx run
tool-git-hooks:lint` and `bun x tsc --build --force tools/tool-git-hooks/tsconfig.json`
both exited zero; logs `/tmp/puni-remote-parallel-final-{lint,types}.log`. Formatting
and `git diff --check` passed. Earlier runner/dispatcher/reducer proofs and all
hosted-capacity limitations remain unchanged.

## ROOT integration on product-readiness checkpoint

The twenty integrated CI paths were byte-compared with independently approved
`c72f63b2d3026a343660a87dbf1e00dd5fe65600` before adding this evidence. On parent
`14d40188447373a40defd9cffb3ef27224b83171`, ROOT independently replayed the exact
nine-file command above: **145 pass, zero fail, 1,089 assertions in 36.93s**.
The nine short genuine-reader/reporter/watchdog controls also passed, 33 assertions.
Explicit remote-runner ESLint, forced TypeScript builds for remote scripts, Git
hooks and scratch, formatting, all 286 OpenSpec changes/specs and staged diff checks
passed. The initial configured Nx lint was a cache hit; ROOT then reran it with
`--skip-nx-cache`, observed the actual ESLint command, and obtained exit zero.
Exact commands, elapsed times and log hashes are in
[evidence/integration-c72.json](evidence/integration-c72.json).

No complete hosted capacity, native execution, final host gate or deployment is
claimed. Fresh main `b6b021dfb` includes the substantial measure/budget feature;
its reconciliation remains separate from this frozen source integration.

## Model continuation correction (2026-10-29 source checkpoint)

Hosted run `40869279277` reached the configured 4500-second model phase deadline:
61 outer cases completed successfully and six remained incomplete/unverified. The
in-flight SIGTERM refusal does not establish a product-oracle failure. Actual job,
ZIP and Nx transcript hashes remain in the independent diagnosis packet
`/tmp/puni-be344-ci-remote-model-20261029/`.

On isolated base `405a2c806c3c34e0898ccad5b679bc458f36d06c`, the core keeps 43
registrations and the new continuation owns the exact final loop's 24 registrations
(nine solver/backend plus fifteen gateway). The shared child-custody closure is
mechanically identical after export/terminal-whitespace normalization. The retained
core body is identical apart from one separately approved failure-only observation
in its existing output-refusal control. The moved final loop is identical except
terminal whitespace. Catalogs, child programs, exact case names, filtered-count
formulas, `/proc` brackets, 300000/310000 ms bounds, 1440000/1500000 ms pool bounds
and all custody assertions are preserved. `final-mechanical.log` records the exact
comparisons and observation-only diff.

Canonical project `test` discovery is unchanged. The fixed model matrix dispatches
`remote-model` and `remote-model-continuation` on separate runners; cases remain
serial within each whole file because their actual HTTP fixtures share ports. The
rest leaf excludes both exact owner paths while retaining future neighboring and
shadow paths. Every leaf validates all three raw target definitions and both owner
files. All retain canonical environment, inputs, dependency builds, noncached
execution and immutable plan/head validation. Only rest owns Caddy and static checks.
The stable required model job aggregate and gate reducer are unchanged; the matrix
is closed and fail-fast is disabled. Per model runner the limits remain 75-minute
phase, 90-minute job and 30-second termination cleanup. Combined model allocation
is now two such phases/jobs.

### Fresh finite observations

- Missing continuation dispatch and absent matrix contracts first failed in the
  actual owning tests (`contract-red.log`, `matrix-red.log`).
- `bun test` on exact `ci-remote-tests.test.ts`, `ci-plan.test.ts`,
  `ci-capacity-workflow.test.ts`, `pr-merge-base.test.ts` and
  `gate-workflow.test.ts`, with `--preload ./tools/test/scratch/preload.ts
--timeout=30000`: **120 pass, zero fail, 1025 assertions**, 31.77 seconds.
  This includes real tiny Bun canonical/three-leaf union and disjointness, both
  files' absence/readability/alias refusals, continuation target faults, empty and
  failed actual continuation children, configured Nx environment/dependency execution,
  exact affected/full dispatch, actual workflow shell identities/status and reducer
  refusals. Original session 76232 joined at exit zero (chunk `11f39e`).
- Five independent new-boundary omission controls each failed, then the same test
  passed after exact saved-byte restoration: continuation required file, exact rest
  exclusion, target validation, runtime mapping and workflow matrix membership.
  `proofs.ts` and `*-before` retain the mutations/restorations; individual raw logs
  are `*-omission-red.log` and `*-restored-green.log`. Original session 90044 joined
  at exit zero (chunk `32e1ce`). Adjacent Proof comments name these observations.
- Actual Bun no-match collection separately reports **43** core and **24**
  continuation registrations. Each intentionally returns exit one for zero selected
  tests; these are collection receipts, not executed-case passes.
- `bunx tsc --build --force tools/tool-remote-scripts/tsconfig.json
tools/tool-git-hooks/tsconfig.json`: exit zero (session 92469, chunk `d47727`).
  After the approved failure-only observation, remote owning lib/spec compilation
  ran again and exited zero (session 78762, chunk `c661ef`).
- Explicit scoped ESLint over the nine affected TypeScript paths, with
  `NX_DAEMON=false`: exit zero on final bytes (session 15387, chunk `de2223`).

### Known unchanged control limitation

The first finite extraction-control selection executed 14 cases: **13 pass and one
fail** (`custody-controls.log`, session 84560 joined exit one, chunk `60e387`). The
unchanged `model child output refusal joins exact owned child before returning`
reported Missing expected rejection. Root ran that exact single unchanged control
at idle baseline `5db2a0526`; it also failed, with the same missing rejection
(`/tmp/puni-remote-model-baseline-output-control-20261029.log`, original
`9fea16`/`0843dc`). This is an observed baseline limitation, not an extraction pass
or a diagnosed cause.

One authorized temporary observation run then passed and logged the original
`modeled product process child output bound exceeded` rejection. Exact bytes were
restored afterward (`output-diagnostic.log`, exit zero chunk `7dc566`). Cause
remains **unknown**. No repeated reproduction or guard/program/bound adjustment was
made. The final tiny fulfillment-only `.then` logs the same returned child's
status, failure and already bounded stderr only when the original rejects assertion
must fail; it returns that same child and preserves the original oracle, child
program, 100 ms timer, 1000 ms deadline and cleanup. It received scoped static
verification; that single case was not rerun on final bytes solely to seek green.

No full local model leaf, real HTTP model case, native qualification, full host gate
or deployment ran for this checkpoint. Fresh exact-source hosted core and
continuation jobs **and their required aggregate must finish successfully** before
claiming the observed CI deadline corrected. No complete controls PASS, full-goal
completion, MAIN adoption or deployment is claimed.

Private finite artifact SHA256 receipts:

- `contract-red.log`: `43f6b82f416189afc777434bfd1d6e7ebc622f029d0771954de89bf9918c4b0a`.
- `matrix-red.log`: `535480cbe5f45404e279859b803bb1cf3e68f54f8d651fcc831ad072a08da35a`.
- `final-contracts.log`: `71a2263104e5b15805567ee57538be6e1d181686a27266ffe92a2a9e227a92b1`.
- `proofs.log`: `5b93f31d1de35f360506aecb010834183fa220e6fc30f73f41a3c572474b4996`.
- `final-mechanical.log`: `dfc7be25b0c173051f5a3859d44b80de51a922a33ba979376ede919580eed49e`.
- `custody-controls.log`: `ee04ff388c3109c4d312a6162e7e220b44369ed36fcb9d9bd83e7920a48586dc`.
- `output-diagnostic.log`: `a65e9bbe4cc892f2ab6c95db44b5ce550ee504475b2eaa1324070374ea3b7892`.
- `core-collection.log`: `41c0757bd97d96fe66e48b210707cb27cc6fe18dd7333ee6f2430dc5b1649dfa`.
- `continuation-collection.log`: `4b7fbb59818c3adef59fdd8bebbb28b97fdcd151468259502fc797bfeea8a10c`.
- `types.log`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- `final-remote-types.log`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- `final-lint.log`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

Final document/static checks: `bunx openspec validate ci-remote-capacity --strict`
exited zero (`openspec-final.log`, original chunk `b8945d`). The first strict
validation reported only an overlong requirement warning; moving its unchanged
refusal clauses into a dedicated scenario resolved it. Root's baseline failure
provenance is sealed in
`/tmp/puni-remote-model-baseline-output-control-20261029.receipt.json`, SHA256
`e0751be751012d246db3ea571c4361088c1703fbb56cc556c2ac2536a604076e`.
Parsed comparison confirms the canonical target and every preexisting project
target are unchanged, and workflow bytes outside `gate_remote_model` are unchanged
(`unchanged-contracts.log`). Final scoped format/diff receipts and exact file pins
are retained in the private frozen handoff packet. Normal commit hooks and fresh
hosted matrix acceptance remain Root-owned.

## Hosted completion of the fixed model partition

[CI run40888534895](https://github.com/Prosperous-Unification/puni-00/actions/runs/40888534895)
completed successfully for feature commit
`b297c2275cb860fa8f4ae13891418fa56cbb7660`. Its synthetic merge
`c8d9a869fb7a89bdee5de70da820d8bf6b6b3ba3` has parents50862bc37 and
b297c2275 and tree`50cbad76e96f7fedae63f7b00b986ac66242772a`, exactly
the feature tree. Both required model jobs, the remote gate and aggregate
job123543667320 passed, together with every other required gate and all eight
browser shards. Matching infrastructure run40888534754 also passed.

The core job passed43 tests across one file in2971.49s (phase2983s); continuation
passed24 across one file in1692.04s (phase1700s). The full original Nx logs were
retained and their actual outer-case counts checked. All individual90-minute job,
75-minute phase,30-second cleanup and original child/parent limits were preserved;
the separate-runner model allocation is two jobs. These observations establish
completion for this candidate, not a new performance threshold.

Core full-log SHA256:
`e59a5534f7026a15c51d72b7cfb6a714f989302e8a4fe5df564bbea4868d7ac3`.
Continuation full-log SHA256:
`6f4ad06aa9bad80f3437b004755765ce25cd3a293bbc5239da1c3f70e3caacb0`.
Original completed job logs, artifacts, run metadata and synthetic-tree metadata
are frozen under`/tmp/puni-b297-ci-results-20261029`.

The output-control case passed in this hosted epoch. Its earlier local failures
and single diagnostic pass remain valid history with unknown cause; this is no
synchronization repair claim. The newer private Node/frontend prerequisites and
later profile/readiness work are separate source epochs and are not certified by
this b297 run. Native/full-source/main/deployment acceptance remains open.

## R19 source leaf pre-proof history

Private evidence directory: /tmp/puni-ci-source-preparation-20261029. Initial real tiny-Bun union consumer reached Unknown remote test leaf (intended RED); minimal four-leaf union passed. Actual partition/matrix missing-source and missing explicit Node setup consumers failed before metadata implementation; routing/shell/workflow GREEN and bounded source owner/target ordinary negatives subsequently passed. At that pre-proof epoch the finite omission protocol and final source/static review were pending; the accepted later epochs are recorded below. No hosted capacity acceptance follows. Backend document preparation is tracked separately in backend-mcp-test-preparation.

Independent review exposed first-summary parsing of genuine nested child receipts. One real joined tiny nested Bun parent reproduced source refusal after an actual outer six-file PASS. Final coherent outer pass/fail/count parsing then passed that reproduction, canonical union and single count-mismatch refusal together (3/0). This preserves aggregate nonempty semantics; an earlier provisional per-parent empty-file oracle was stronger than the contract and was removed with its raw failure retained.

## R19 finite source-leaf evidence

The exact six existing parents have separate source ownership and the third isolated matrix runner. Canonical discovery, fixed deadlines, rest Caddy/static ownership and all original model/continuation owners remain unchanged. CI source tooling is pinned to Node 24.20.0 through official setup-node commit 249970729cb0ef3589644e2896645e5dc5ba9c38; this is parsed workflow evidence, not source-image Node 24.18.1 or native source acceptance.

Eight source dependency omissions were independently accepted with exact restoration: owner membership, source target validation, rest exclusion union/disjointness, six-to-five summary receipt mismatch, production CLI dispatch, matrix member, configured Node version and terminal outer summary. Actual tiny joined nested Bun positives remain covered. Removing the terminal anchor admitted a malformed final outer receipt by falling back to a genuine child summary; only the terminal non-whitespace coherent summary is now accepted. The receipt mismatch proof changes the observed summary count exactly once after genuine child execution; it is not a missing-execution detector.

Accepted raw epochs remain immutable under /tmp/puni-ci-source-v4-vciv8qaw (first nine pairs) and /tmp/puni-ci-source-continuation-z0xg7yeq (four more pairs). The V4 producer status surprise stopped at numeric130/null signal, and was restored only under separately reviewed recovery direction. The initial native hash restoration mismatch, baseline setup failure and later unlogged compound-return failure remain failed, uncredited epochs. No prior accepted pair was replayed. Four explicit-freshness native observations were separately accepted from /tmp/puni-ci-four-native-v3-zeysrnn0; its 98-body actual manifest SHA256 is 45333f3faf6f97f9dcccc43cb0d48df39304fbcb1a6345f7061cd858a729d7d4 and actual independent audit SHA256 is e979a781863fdd937fc4d648bfa4cb1298ab021b00a2ff5adcfdf6512f274437.

These are 17 finite scoped observations across distinct audited epochs. Hosted task14 remains open: new exact-head source/rest jobs and required aggregate must finish before accepting current capacity. No full source/backend runtime, source HTTP readiness, host gate, MAIN adoption or deployment is certified. Current comments/static/source review and Root normal checkpoint remain separate.

## Current scoped verification

Final commands use the repository's pinned Bun and installed Nx; original processes and both output streams joined normally with exit0. Exact commands and raw stdout/stderr/custody hashes are in /tmp/puni-ci-source-preparation-20261029/final-*.json.

- `bun test --preload ./tools/test/scratch/preload.ts` with the six explicit owning files (ci-remote-tests, ci-plan, pr-merge-base, ci-capacity-workflow, ci-runtime-selection and backend-mcp-inputs), `--timeout=30000`:259 passed,0 failed,1147 assertions in57.85s.
- The committed-target-facts owning file with the same preload and timeout:2 passed,0 failed,24 assertions; both current and bootstrap declarations match the actual static extractor.
- `bunx nx run-many -t typecheck -p tool-git-hooks tool-devsync --skip-nx-cache --parallel=2 --output-style=stream`: both projects passed. Explicit `bunx tsc -p /tmp/puni-ci-source-preparation-20261029/ci-leaf.tsconfig.json` also passed and includes the runner outside the library source tree.
- Configured ESLint over all eight changed TypeScript paths passed. The four final annotated TypeScript carriers transpile byte-identically to their independently accepted pre-annotation bodies.
- `bunx openspec validate --all --json`:310/310 passed. Existing unrelated requirement-length warnings remain warnings.

No old proof batch or full source/backend suite was rerun. Final independent source review and Root's normal checkpoint/publication remain pending; hosted capacity task14 remains open.

## Final independent source review

Astra accepted the exact 22-file source packet in `/tmp/puni-ci-source-final-independent-review-20261029.md`, SHA256 `593f00fa550a1f0313fb9e35e6331566dd2edc298a45e7048ef7328b5f349977`. The review binds all 725 evidence bodies, 17 separately audited observations, current scoped checks and comment-only equivalence. Root records this review linkage and completed CI review row as a separate factual documentation delta; runtime code is unchanged. Normal private checkpoint and incoming-main reconciliation follow. Hosted capacity task 14, full host/native/restoration acceptance, main adoption and deployment remain open.

## Seventh source parent private integration

Reviewed composer leaf7b49d10b9c649118e180a3a7e2941255a5538998 merged without conflicts into the private4c19 candidate. Final composer reviewe3edb41d and actual24 audit2ca9792c remain scoped to that component; no proof replay followed. Exactly source-readiness.test.ts joins SOURCE in the runner and actual tiny-runner fixture. Derived remainder exclusions and presence/count checks retain the same algorithms, canonical discovery, deadlines and isolated job matrix. Existing hardcoded count-mismatch fixture now transforms seven to six; historical six-parent proof comments remain historical.

Before production membership was added, the real canonical source-union consumer failed at its expected owner list: source-readiness.test.ts was absent from source ownership. Raw /tmp/puni-source-readiness-ci-union-red-20261029.log records0pass/1fail. With exact membership restored, the complete owning ci-remote-tests.test.ts file passed32tests/285assertions in5.36s, original94582 joined0d35d6 exit0. The malformed-cardinality and nested-child terminal receipt consumers passed at seven parents. Raw /tmp/puni-source-readiness-ci-union-green-20261029.log is retained. Current static checks, independent integration review and task14 hosted acceptance remain pending at this entry.

Final private integration source review PASS78770d1549fcc2dbe0969fd40a4f1f1f601040f2e801453516a38d355ad27654 verifies all16 paths and exact seven-parent selection. Four owning compilers exited0 (51311/26bc82), explicit two-file lint exited0 (47283/15875e), five-path formatting passed and required all-items OpenSpec passed310/310. The initial combined lint/format shell exposed only its final format status; the separate explicit lint receipt above is authoritative. Root marks only bounded integration task16 complete; hosted task14, full host/native/restoration, MAIN and deployment acceptance remain open. This final delta is receipt prose and that checkbox only. Normal hooks follow.

## Published seven-parent hosted acceptance

Published headad41fd64c5f64f7240c0f7ccc75ebb24641aacc1 completed CI40949936285 SUCCESS, including source123715615731, remainder123715615598 and required aggregate123751123256. All other selected runtime and browser checks succeeded; infrastructure40949936099 also completed SUCCESS. Verified synthetic4b167cd93a67e56142e069fd56e1f59f75cdfa98 has parentsmain8fd51f869 andfeaturead41 and EXACTfeaturetreefacc08ad16b33278ddcf47b0ce48c35766ec85e4. This closes hosted capacity task14 for that published seven-parent epoch.

The original source job receipt records fresh60tests/7files/2157063ms/exit0 at that synthetic head. Full raw log is privately preserved at /tmp/puni-source-readiness-ci-source-job-20261029.log, SHA2568323673e68c7d2fa1d1eb9135e41bcdfbed7a44bf31a3809948551ddef927ab9; the parsed exact receipt is /tmp/puni-source-readiness-ci-source-receipt-20261029.json. The remainder receipt records fresh3418tests/146files/4180227ms/exit0; its raw log SHA256 is40959346c9ea1569685bf66b8c18716455da107f894de5e82acc76be4c7e1198, with parsed receipt at /tmp/puni-source-readiness-ci-rest-receipt-20261029.json. Full final job identities are retained by Root. Earlier4c19 workspace failure and subsequent core/rest cancellation remain uncredited as full acceptance; the repaired ad41 run is a distinct epoch.

PR786's reversible main-only rehearsal correction independently passed its exact-head CI40953004986 and CodeQL before squash merge80174a65ce978bacb44406b0210821148184f24f. PrivateR21 reconciliation observes an EMPTYcontent merge intoad41: its complete predocument merge tree remains exactlyfacc08ad16b33278ddcf47b0ce48c35766ec85e4. Source identity is recorded in /tmp/puni-r21-reconciliation-20261029/merge-source-identity.json. Only factual receipt docs and task14 checkbox follow. No runtime or qualification replay is required for that documentary delta; Root's normal private merge hooks remain separate.

The newer source-start/devBE-opener test parent is uncommitted work in another isolated tree and is NOT certified by this run. Its23-case mixed-epoch duration projection plus the published source leaf exceeds the unchanged75-minute phase; separate exact whole-file runner preparation remains unimplemented/unaccepted here. No new deadline, missing-parent requirement or discovery exclusion is introduced by these receipts. New current-source CI, full host/native/controller/exposure acceptance, architectural PR630 main adoption and deployment remain open.

## Source-restoration whole-parent leaf — 2026-10-30

After accepted source checkpoint 6d2b86ee and private union 70ca6403, only the exact tracked `dependency-source-restoration.test.ts` parent moves to fixed `source-restoration` / `remote-source-restoration`. Existing source-seven, canonical discovery/options/summary, all old targets, deadlines and static/Caddy ownership are retained. The fourth isolated matrix member gets the same explicitly selected Node 24.20.0; strict aggregate behavior remains required.

Genuine tiny-Bun union RED 3292105 failed at the new unknown leaf after real canonical execution; parsed-workflow RED 3292097 failed both missing fourth-member and Node-condition consumers. Minimum GREEN passed real five-leaf union/disjointness and both parsed workflow cases. Four owning files then passed 122 tests/879 assertions in 43.48s. The six new required-file/target negatives, refined to record actual child launch rather than infer it from absent test output, passed 6/63 separately. Neither epoch executes the long restoration parent.

The exact reviewed seven-pair protocol c198858f/driver fdaea2a8/recipes 048d5e96 retained 27 source/saved/protocol controls and 105 fresh outputs. Original 80561 joined normal 0; each exact mutant exited 1, source bytes/mode/inode were restored, and the SAME consumer exited 0 with original stdout/stderr EOF and null signals. Independent actual review 7f84fe93 verified all 133 frozen bodies, 27 controls, seven mutants/inverses and 14 original/wrapper outcomes. Closed private receipts were not fsynced; no crash-durability claim follows.

| New dependency       | Actual witness scope                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| singleton membership | MODEL dispatch broke actual restoration membership in canonical union                                                                        |
| required parent      | missing-parent omission launched a real child; pre-dispatch marker assertion failed even though Bun later refused                            |
| required target      | omitted new loop entry executed the actual model sentinel before absent-target refusal                                                       |
| rest exclusion       | omitted exact ignore duplicated the restoration parent in actual complement                                                                  |
| runtime mapping      | wrong source target broke the first affected-mode CLI ledger; restored consumer covers affected/full, with no separate full-mode fault claim |
| matrix               | dropped fourth entry failed parsed metadata consumer; no hosted execution claim                                                              |
| Node condition       | dropped only second source equality failed parsed metadata consumer; pinned version/action remain unchanged                                  |

[Flat proof/source/actual archive](evidence/source-restoration-ci-20261030/manifest.json) preserves exact tested bytes separately from final factual comments. Current owning type/lint receipts precede only comments; final source syntax/YAML equality, formatting, file inclusion and required OpenSpec checks bind them to the frozen current source. Earlier source/runtime proof archives and all actual long-parent bounds are untouched.

Fresh complete published source, source-restoration, remainder and strict aggregate outcomes remain required by open task 20. Mixed-epoch 2351.860495+published 2157.063=4508.923495 seconds motivated isolation but is not measured combined failure, stable headroom or resource sufficiency. No new timing/native/namespace/long-source/old-generic-guard campaign ran. Final independent source review and Root's normal checkpoint/publication remain separate.

Final bounded checks: owning hook library/spec and remote spec compilers, configured six-file lint, thirteen-path formatting, required OpenSpec310/310 and scoped1/1 all pass. Inclusion evidence binds runtime CLI to the hook library, four tests to the hook spec and the leaf runner to the remote spec; subprocess execution is not mistaken for a TypeScript import. Final six-TypeScript ordered syntax and project/workflow parsed values equal the accepted seven-pair epoch after only factual comments/format. Exact before/after carriers preserve that semantic-epoch binding. All own original sessions joined; no Source runtime file or prior Source archive changed. Final source review and Root checkpoint are still required; hosted task20 remains open.

### Final private source review (2026-10-30)

Independent final source/static review passed for the exact 125-path packet
`914b6c09c9c67725a5783cbe15a59b9d90900bae0564cb9fb7fd81db0ab08b25`;
review SHA256 `dcbfd96bc212df8ed84acd76f348ba874cd1c1d4e3608e8aa5888b2cd89d237c`.
The normal private checkpoint follows this factual documentation update. Task 19
is complete; task 20 remains open for fresh published source, source-restoration,
remainder and strict aggregate results. Exact-SHA host and native acceptance,
architectural main adoption and deployment remain open or held.

## Hosted Python runner drift repair (2026-10-31)

Normal full run41224486337 targeted privatee9c22b76286da0b97784bcf7bfe03769366fd9c5
with explicit comparison7e0c05d82175b1a374e39d26fc08d3a9349069f5. Nine expanded
runtime jobs failed setup before their tests; directly inspected backend and
checks logs identify Ubuntu26.04, successful Bun1.4.4 setup and unavailable
Python3.14.4/x64. Backend raw SHA
`cddd6096161ba03de846262686bd3f81b6f429c4fd296c4ad45ea57ab8b5d8a4`;
checks raw SHA
`a3967054baf5e867b2cc75fa4051a27431245ffe73a5a510788c8ceafa34fbe7`.
The failed jobs are not test failures or repaired retrospectively. Browser jobs
and the separate normal host gate retain their own outcomes.

The official [Python build manifest](https://raw.githubusercontent.com/actions/python-versions/main/versions-manifest.json)
was captured at SHA
`fed4236f97902ffec4ba84618ad69dda292055eb0480d9441df2ae7ea8915509`;
its3.14.4/Linux-x64 entries cover22.04 and24.04, not26.04. Astra decision
`286cd26350c686c4dd9b85faaf1902f3132444875953df047635396419b9e4e4`
selects the reversible runner correction for the six setup-python definitions
only. Python/action pins, solver hashes, every check/command, matrix, selection,
timeout and other job runner remain unchanged. This restores the precise pinned
solver-toolchain contract under R4's repair exception; no new OpenSpec/ADR.

The independent literal six-job roster in the parsed real-workflow test first
failed naturally on ubuntu-latest versus ubuntu-24.04. Separately, the existing
devsync workspace-budget consumer failed naturally on its stale90 expectation
against the already specified120 configuration. Both original runs exited1
before either correction; natural RED hashes
`a1a92fb22dd983caf83852dbb77478c248ccdcf7f0f9fd48df2b62f909726166`
and `a0fead03bb9e780f3cf7f4dc70a7a55d6697b507e75b13a276baf55f8c7cdc1f`.
The budget test alone becomes120; the real120 and75-minute phase are unchanged.

Current full capacity tests7/0/137 assertions and full toolchain tests26/0/115
assertions passed. Four configured lib/spec compilers, scoped two-file lint,
three-file formatting and whitespace checks recorded exit0. Root read all33
actual pass rows and exact exit records; all three frozen source hashes match.
Parsed workflow diff is exactly six runs-on labels to ubuntu-24.04; no other
parsed production value changed. Frozen report
`/tmp/puni-ci-runner-repair-20261031/report.md` and independent source review
`50962eb1c08adb967057728bd57ecaaf89e0474c1d2c0bd66fb0bc6f92e2f150`
support local scoped acceptance. Fresh hosted Python provisioning/full checks
remain required before claiming hosted repair success. No Source Reader38
intentional mutation or native-image/production action was performed.

The ordinary h4 gate attempt for the olde9 candidate exited75 after its canonical
30-minute queue, with original SSH normal75/null signal/both actual EOFs/wait.
No requested running-SHA line was printed; candidate verification never started.
Its private report SHA
`8c614d59d6efb71d945a940600e8a8a0e927bf3ff2b533c7ad4f5807ee8a77cc`
and receipt
`ab3117cb8183a533de90653c233265cca0b8ba78b9a33ad198a6f97db6d5c653`
retain that resource refusal. The other holder remained protected; no retry,
checkout, dependency install, signal or cleanup followed. Exact-SHA host gate
acceptance, Reader38 proofs, native/controller and main/deployment remain open.
