# Configured frontend acceptance after immutable V1 support

Base: `36f7871e463e18f64900b883c2fdc7ab6d49345e`. Isolated worktree:
`/tmp/puni-frontend-v1-expectation`. This correction changes a mounted frontend
acceptance expectation only; production behavior and activation authority are unchanged.

## Root cause and correction

The mounted real-HTTP incompatibility test retained the earlier decoding-only
expectation that every observed request omitted `X-WBS-Dependency-Semantics`.
The browser client now explicitly opts into immutable V1 for protected operations;
the generic fetch transport still defaults to no claim and keeps exempt operations
outside admission. Existing shared-client protected/exempt and browser protected/auth
matrices describe this boundary. This test observes protected project and directory
requests and now requires their exact `cross-project-dependencies-v1` header value.

The fetch fixture continues forcing the exact HTTP409 incompatibility envelope.
The mounted compatible-client instruction and absence of successful export remain
required. No refusal was changed to success and no production header was removed.
The earlier decoding-only verification record remains historical evidence for its
original commit; its no-claim statement is superseded by immutable V1 support.

## Red-green and production-path negative

From `apps/wbs/fe-01`, configured Vitest with `TZ=UTC`,
`--no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000`:

- Original focused selection (`src/components/wbs/plan-read-and-write.test.tsx -t
'shows resource dependency incompatibility through the real HTTP client'`):
  1 failed, 91 skipped, 6.87 seconds. Expected header absence received presence.
- Corrected whole file: 92 passed, 0 failed, 42.65 seconds.
- Watched fault: temporarily replace the browser's `DEPENDENCY_SEMANTICS` opt-in
  argument with `undefined`. The same mounted focused selection failed its exact
  claim assertion: expected `cross-project-dependencies-v1`, received `null`;
  1 failed, 91 skipped, 7.74 seconds. A `finally` restored the original source,
  and its diff was empty. An adjacent `Proof:` names the injected fault.

## Verification and limits

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph --file=/tmp/frontend-v1-graph.json`
  followed by scoped ESLint on the changed TSX file: passed, exit 0.
- `bunx tsc --build --force apps/wbs/fe-01/tsconfig.json --pretty false`:
  passed, exit 0.

The prior host gate at `9f257ca84` exited 1 with 4695 frontend tests passed and
one failed across 235 files; this packet does not rewrite that failed gate as green.
The first local complete configured frontend attempt (`NX_DAEMON=false
NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:test --skip-nx-cache
--outputStyle=static`) exited 130 after task scheduling, before test output.
Its cause is unverified. The repeat's execution session subsequently became
unavailable with only scheduling output in its log; an unsandboxed process check
found no matching Nx or Vitest process. Its exact exit status was not captured,
so that repeat is inconclusive.

A fresh invocation of the same configured command outside the sandbox completed
on unchanged committed `960f88403e5936de0e8fdac0a30b26ca72f3d6d1`, with
durable log and exit capture:

- Node dependency target: 84 files, 1023 passed, 0 failed, 47.84 seconds.
- Full UTC DOM suite: 235 files, 4696 passed, 0 failed, 1213.98 seconds.
- Pacific/Auckland suite: 4 files, 5 passed, 0 failed, 7.55 seconds.
- Nx: both tasks passed, exit 0, cache bypassed, total 21 minutes 10 seconds.

The local evidence is `/tmp/frontend-v1-full-final.log` and
`/tmp/frontend-v1-full-final.exit` (the latter contains `0`). Scoped Prettier and
`git diff --check` passed. Normal code commit hooks passed, including scoped lint,
formatting, secrets and nesting checks; Tool Wiki explicitly reported its existing
inactive activation root without claiming certification. No test timeout or runner
configuration was changed for these runs.

Dependencies reuse the existing workspace installation through an ignored
`node_modules` symlink; no fresh frozen install was performed. Vite emitted its
existing native-config warnings for `__dirname` and an extensionless config import,
plus the existing `NO_COLOR`/`FORCE_COLOR` warning. No host gate, whole-repository gate,
push, live database work or deployment is claimed here. Integrated exact-SHA host
acceptance belongs to the parent delivery.
