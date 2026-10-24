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
