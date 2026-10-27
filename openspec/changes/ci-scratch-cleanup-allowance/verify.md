## Scope

Fresh main `830e774d2302d852432c51ded1e1b38e85728f66`; cleanup hook only. No feature code, tracing, CI split, job or phase budgets, migrations or serialized formats are adopted.

## Checks (Bun 1.4.4, 2026-10-25)

- Initial actual-preload tests against main: 0 pass, 2 fail. The finite 100ms `rmSync` delay exceeded the inherited 20ms child hook deadline.
- `bun test --preload ./tools/test/scratch/preload.ts tools/test/scratch --timeout=30000`: 7 pass, 40 assertions. Existing subprocess-output cases need real child-process access: sandbox run passed 4 but failed 3 missing child-output cases; authorized unsandboxed replay passed all 7.
- Remove only the explicit cleanup allowance, run the first new regression: 0 pass, 1 fail (expected child exit 0, received 1). Restore the hook: both new tests pass, 27 assertions.
- Child controls retain inherited and reduced 50ms hook failures, two ordinary hangs timing out at 20ms, and absence of both real scratch directories after every child is joined. The delay is injected into a copy of the actual remover at its exact `rmSync` boundary; the actual preload is copied without replacing its callback.
- `bun x tsc --build --force tools/test/scratch/tsconfig.json`: exit 0.
- Configured `nx run tool-test-scratch:lint --skip-nx-cache`: exit 0, including the Nx graph. Initial direct ESLint had no graph and warned the boundary rule was skipped; the configured run supersedes that partial check.
- `nx run tool-devsync:test-levels:verify --skip-nx-cache`: exit 0.
- Prettier on both source files, budget documentation and change artifacts: pass.
- `openspec validate ci-scratch-cleanup-allowance --strict`: pass; `openspec validate --all --json`: 286/286 pass.

## Limits

The short-delay controls establish hook scoping, finite failure and physical cleanup; they do not measure a loaded hosted filesystem. Synchronous hook overruns are reported after return and cannot interrupt a blocked syscall. The existing best-effort remover error policy is unchanged. Hosted CI and a host-wide gate remain separate, unrun checks. AstraHigh independently approved the frozen seven paths: 7 tests / 40 assertions passed, actual single-line allowance omission failed as intended, and the restored new tests passed 2 / 27. Both runtime hashes matched the reviewed bytes. Normal staged pre-commit hooks passed lint, format, plaintext secrets and private nesting; migration, website and document-cap hooks had no matching paths. Tool Wiki reported inactive/uncertified because its external activation root is not provisioned; this is not a certification claim.

## Hosted cleanup overrun follow-up intent — 2026-10-27

Published PR760 head055d4008fa12129ed2bd8fee05ea52bdef15853c has terminal workspace job122497810881 failure in run40591788802. The gate artifact reports tool-devsync973pass/1unnamed teardown timeout,974tests/50files/805.64s; all22 named final process-observation cases passed. The shared afterAll cleanup exceeded its30000ms allowance at31094.74ms. This is separate from the two Fleet fixture failures already repaired in682db5b6c.

Read-only diagnosis recovered only artifact12777736848, nx-gate-log-workspace-1.zip564786B SHA2564677dbe28c460b1705da1611a2a36d8830a4be9c55203db1bf81103c6a49cb62, matching upload. Its bounded nx-gate.log member4189051B SHA2565d9d51dc9141062b50266b3a9e0391002a2d72164054d5df77d20aea7f7cb9b4 was read without extraction. Source scratch/devsync inputs match published055d and9f4bb094.

One copied actual preload/remover replay with31 seconds injected at the rmSync boundary reproduced the same unnamed hook failure with30000ms (exit1,31.029s; named tests pass and physical cleanup completes). Changing only the copied hook to60000ms passed (exit0,31.046s,2tests and physical removal). Each child had a45-second external ceiling. These are controlled finite-delay observations, not hosted filesystem measurements; the particular hosted syscall/filesystem cause remains unknown. Full diagnosis and exact replay records are retained under `/tmp/puni-devsync-055d-diagnosis/` and the observability private task38 report.

The coherent proposal/spec/tasks update precedes source implementation. Scope is only the cleanup allowance and directly covering budget/regression/docs evidence; ordinary test/job/phase budgets and cleanup semantics stay unchanged. Keep slow proof out of the default fast suite. Implementation, new-source checks, independent review and current hosted verification remain pending.

## Revised-source verification — 2026-10-28

Implementation base: `95a471e0c51b1e365cac798661b1382a98854a9f`. Bun 1.4.4 matches
`.bun-version`. Only `afterAll(removeProcessRoot, 30_000)` changes to `60_000`;
the helper, ordinary command budgets, inherited/reduced failures, signal behavior,
job/phase limits and default test collection are unchanged. The fast exact-budget
expectation and adjacent proof/budget documentation are updated. No permanent slow
test or opt-in framework was added.

Evidence directory: `/tmp/puni-cleanup-task39/`. JSON records retain exact argv,
exit status and elapsed wall time; paired `.stdout`/`.stderr` logs retain output.
The original `/tmp/puni-devsync-055d-diagnosis/` bytes were only read.

### TDD and production-path negative

- RED, before production edit: `bun test --preload ./tools/test/scratch/preload.ts
tools/test/scratch/cleanup-budget.test.ts --timeout=30000 --test-name-pattern
'the cleanup allowance is scoped'`: exit 1, 0 pass / 1 fail / 1 filtered,
  1 assertion, 0.033s. Expected `/60_?000/`, received the actual `30_000` hook.
  Records: `fast-red.{json,stdout,stderr}`.
- GREEN: `bun test --preload ./tools/test/scratch/preload.ts tools/test/scratch
--timeout=30000`: exit 0, 7 pass / 0 fail, 40 assertions, 7.020s.
  Records: `scratch-green.{json,stdout,stderr}`.
- Fault: omit only the production hook's explicit allowance, run the same focused
  test file with `--test-name-pattern 'the actual preload allows'`: exit 1,
  0 pass / 1 fail / 1 filtered, 5 assertions, 0.163s. The actual callback/remover
  fixture failed `Expected: 0, Received: 1` after its injected 100ms cleanup exceeded
  the inherited 20ms deadline. Records: `allowance-omitted.{json,stdout,stderr}`.
- Restore the exact production bytes, then run that file without the name filter:
  exit 0, 2 pass / 0 fail, 27 assertions, 0.617s. Inherited and reduced 50ms hook
  failures, ordinary 20ms hangs and physical removal remain covered.
  Records: `restored.{json,stdout,stderr}`. Adjacent `Proof:` comments identify
  both the changed-budget negative and allowance-omission fault.

### Single revised-source slow proof outside the default suite

Reused the old 30-second RED from `cleanup-replay.json`: exit 1, 31.029s,
2 named passes followed by the unnamed hook failure at 31000.61ms. Its retained
stderr SHA256 remains
`2a46986bded12525bb6b50be2def534ee906966b7262c8798ef773a4d558446c`;
the old replay JSON remains
`51422ebfe7bc9ce57f79e313092949015dfb859fdfc37223c105deebb639f26d`.
It was not rerun.

Executed `python3 /tmp/puni-cleanup-task39/replay.py` from the implementation
worktree. That retained one-off harness copied the revised preload byte-for-byte,
kept its actual callback, and copied the actual helper while injecting the same
31000ms finite `Atomics.wait` immediately before `rmSync`. The injected helper
and both tiny suites match the existing diagnosis fixture byte-for-byte. It ran:

```sh
TMPDIR=/tmp/puni-cleanup-task39/cleanup-revised-60000/temp \
  /home/df/.bun/bin/bun test \
  --preload /tmp/puni-cleanup-task39/cleanup-revised-60000/preload.ts \
  --timeout=30000 \
  /tmp/puni-cleanup-task39/cleanup-revised-60000/first.test.ts \
  /tmp/puni-cleanup-task39/cleanup-revised-60000/second.test.ts
```

The Python subprocess imposed a separate 45-second ceiling. Exit 0, 2 pass /
0 fail, 31.026s; both reported scratch directories and their enclosing process root
were absent, and the dedicated temp directory was empty after the child exited.
`revised-replay.json` records each path, absence and full SHA256 map;
`cleanup-revised-60000/{stdout,stderr}.log` retain output. `replay.py` is the exact
executed harness and refuses overwriting its existing fixture; reproduction can
copy it and choose a fresh `evidence` directory before running it.

SHA256 identities:

- Production and copied revised preload:
  `22e56a8f5db855e86dad3b7f3c67b989c122d15a7f6e06f8245418590a968521`.
- Unchanged actual helper:
  `0c3240faa4151f84394584cf792ed4e38ec6835a961bf54bec9664aaebe5cc8a`.
- Revised fast cleanup regression:
  `2316a319ff22e281d27cc868ebaa7f54214985111b9d3697c9b780665ac980cb`.
- Injected actual helper copy:
  `d9d05eee72ab785d72af1c79d7e52d6157f8851c900e0cde4855c695f5136b61`.
- Revised slow-proof stderr:
  `5d80d5fdc70cee818a0dd9853cd1a458e93026456a46b519208dda4fa5fd6960`.

### Scoped checks and limits

With `NX_DAEMON=false NX_TUI=false` and installed local tools:

- `bun x nx run tool-test-scratch:lint --skip-nx-cache`: exit 0, 2.882s;
  configured lint includes the Nx graph. Only output warning: Node ignored
  `NO_COLOR` because `FORCE_COLOR` was set; no lint or skipped-boundary warning.
- `bun x tsc --build --force tools/test/scratch/tsconfig.json`: exit 0, 0.112s.
- `bun x nx run tool-devsync:test-levels:verify --skip-nx-cache`: exit 0, 2.555s,
  `Verified declared test collections`.
- `bun x openspec validate ci-scratch-cleanup-allowance --strict`: exit 0, 0.584s.
- `bun x openspec validate observability-environment-parity --strict`: exit 0,
  0.600s.
- Final Prettier check on the three source/docs paths and all four cleanup change
  artifacts: exit 0, 0.354s. Final strict validations after evidence edits: cleanup
  exit 0, 0.692s; observability exit 0, 0.654s. `git diff --check`: exit 0.
  Exact final argv/output are in `final-static.json`.

No full devsync/Fleet suite, full Nx/build gate, host gate, network/runtime,
Docker/SSH operation, hosted retry, push, merge or deployment was run. Scoped
independent review and current hosted verification remain pending with the
controller. This source repair does not close observability 3.1, canonical 4-of-11
or live acceptance. The particular hosted filesystem/syscall cause remains
unmeasured. Finite injected latency establishes allowance behavior and actual
physical removal; it cannot establish hosted storage performance or interrupt a
blocked synchronous syscall. The existing best-effort removal error policy remains
unchanged.

## Independent follow-up review — 2026-10-27

Scoped review of95a471e0c..5860cee466 approved spec compliance and task quality with no blocking findings. Parent verified the exact five-path surface, source/copy/output hashes, unchanged actual remover/project configuration and recorded physical absence. The reviewer read the frozen diff and one focused replay-evidence set without rerunning checks or the slow proof. A disclosed Node NO_COLOR/FORCE_COLOR lint environment warning remains non-blocking; there was no lint-boundary skip or test-output warning. The numeric runtime change is only the60-second cleanup callback argument; default tests, ordinary/job/phase budgets and cleanup behavior remain unchanged.

Source implementation and review are complete. Current published revision CI remains a separate unchecked task and will be observed after the reviewed bundle is pushed. No old green or modeled filesystem latency is treated as current hosted verification.
