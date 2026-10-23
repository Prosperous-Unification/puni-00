# Bounded tasks 7.3/7.4 composed installed solver image source packet

2026-10-23. Source base `ca07be834b3f0e640870a06c5d0c98099aa76988`.
Isolated worktree `/tmp/puni-image-acceptance`. Parent 7.3/7.4 remain open.

The production `buildServices` source binding and detached connected admission
already exist. This packet adds acceptance over those bindings, not another
installation path. Its new `connected-composed` image client migrates a fresh
SQLite database, seeds synthetic trusted dependency authority only in that
disposable fixture, and builds the actual services/coordinator with the production
authenticated supervisor spawner. The mounted public tree starts the real Pri/Time
pair. No candidate/cache seed, replacement child, production authoring or activation
is used. The earlier fractional image scenario is unchanged and is not part of
this composed topology.

The foreign project has one one-day prerequisite. The target has a two-day job
followed by a one-day job, both priority 1, both requiring the same team of size 1,
and both depending on the foreign prerequisite. Fast places target starts 1/3;
Pri must improve them to 2/1 while the complete foreign interval stays 0..1.
Both objective responses must be durable `ok`; Pri's real priority score must
improve and its publication must be `optimized`. The image client revalidates
stored identity, canonical stage/request/response and real publication evidence;
it requires both public variants ready, complete exact target and foreign dates,
two success events and no queue/slot rows. Repeated tree reads and closing/reopening
the source plus recomposing services must preserve the entire generation, queue,
slot, cache and event ledger and must launch no third child.

The disposable supervisor host configures `maxManagedContainers=2` for the real
two-objective pair. Its fixture driver bypasses global container enumeration and
persistent deadline timers, so this smoke does not prove host-cap enforcement or
timer recovery. Production host limits are unchanged. A terminal frame precedes
host child removal, so client-side terminal serialization would not establish a
one-container lifecycle bound. Both real terminal records must report exit 0
without deadline/OOM classification. The composed caller has a 180-second process
bound in addition to the reserved child deadlines.

Both built and supplied-image smoke modes require this fifth authenticated
client. A private writable file in the invocation-owned socket directory records
each actual admission token before connecting to the supervisor. Cleanup reads
and validates the complete inventory, including after a partial failure, and
requires exactly two distinct UUIDs after success. Both modes inspect/remove only
the owned caller and the six recorded children, prove container absence, remove
the inventory and socket directory, and propagate cleanup failure. The supplied
digest remains untouched.

## Local evidence

No local Docker image was built or run. The source and root lockfiles matched
(`cmp bun.lock .../bun.lock`, exit 0), so this worktree reused the existing locked
`node_modules` through a symlink; no install or additional dependency tree occurred.

- Before the fifth invocation, focused fake-Docker tests: 0 pass / 4 fail, at both
  client inventories and the built/supplied composed-client failure injections.
  The initial sandbox run failed to listen on its temporary Unix socket (`EPERM`);
  all subsequent fake-Docker evidence uses the approved socket-capable invocation.
- `bun test apps/wbs/be-01/scripts/connected-composed-image-scenario.db.test.ts
apps/wbs/be-01/src/services-connected-publication.db.test.ts`: 5 pass / 0 fail,
  82 assertions. The first test establishes the exact production capture and
  feasible request topology and production supervisor Start decoding without launching a child; the four existing mounted
  tests retain their fixture children and do not prove installed Python.
- `bunx tsc --project apps/wbs/be-01/tsconfig.tools.json --noEmit --pretty false`:
  exit 0 on the final source packet, including the UUID-project correction.

- Restored `bun test apps/wbs/be-01/scripts/solver-image-smoke.test.ts`:
  58 pass / 0 fail, 197 assertions. Missing, unreadable, incomplete, duplicate,
  malformed, overflow and removal-failing inventory cases run in both modes.
- Independent shell mutations: omit only the composed invocation, bypass the
  inventory read-failure guard, bypass UUID/uniqueness validation, bypass the
  required count guard, and ignore inventory-removal failure. Each failed its
  selected suite: respectively 0/4, 0/4, 0/4, 0/4 and 0/2 pass/fail. All restored;
  logs remain `/tmp/composed-{omit-invocation,unreadable-guard,uuid-guard,
count-guard,inventory-remove-guard}.log` in the local workspace host.
- Standalone module import outside `bun:test`: exit 0. This checks that the image
  client does not depend on Bun's test runner to import its disposable fixtures.
- `shellcheck -s bash apps/wbs/be-01/scripts/solver-image-smoke.sh`: exit 0.
- `bunx openspec validate cross-project-dependencies --json`: 1 passed / 0 failed;
  existing long-requirement warnings remain.

- Configured uncached lint for both affected projects:
  `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint
-p wbs-be-01,tool-remote-scripts --parallel=1 --skip-nx-cache --outputStyle=static`:
  both passed, 55.4 seconds. A subsequent focused ESLint run over all changed
  TypeScript files passed with the Nx project graph present and no skipped
  module-boundary warning. The earlier pre-graph focused run is not used as
  module-boundary evidence.

## Required host follow-up, not yet observed

Actual composed installed-image acceptance is pending h2 source review and its
canonical heavy lock. No digest or installed-child publication success is claimed
by this source packet. Run the built-image smoke and then supplied immutable-image
smoke against the same reviewed source. Observe the composed success line and
exact cleanup inventories in each mode.

Under that same disposable image acceptance, independently mutate and restore:
Each production-source fault needs a corresponding rebuilt or derived image;
changing only the host checkout cannot alter services inside an unchanged supplied
digest. Restore the source and run the green image after each fault.

1. Omit `connected` configuration in `buildServices`' `bindLivePlans`: the actual
   composed client must fail at the connected placement/public tree boundary.
2. Move connected admission before the borrowed read closes: the real spawner's
   `borrowedReaders === 0` assertion must fail before a host request.
3. Force connected publication to baseline: the durable Pri `optimized` assertion
   or exact improved target placements must fail.
4. Bypass same-question healthy reuse suppression: repeated/recomposed public
   reads must fail their complete ledger or extra-attempt assertions.

The smoke invocation removal has a local production-entrypoint proof; these four
production-source faults still need actual composed-image observations and adjacent
`Proof:` comments once witnessed. Restore each fault and rerun green. The full
exact-head host gate and configured project checks remain separate obligations.
Independent Astra review approved this bounded source packet, with the fixture
host-cap and recomposition limits stated above; parent Tasks 7.3/7.4 remain open.

## P2 correction — built-image cleanup ownership (2026-10-23)

Source base `02830d4282e0fbc359e7ecb3472fa7a6cc36615f`, isolated worktree
`/tmp/puni-solver-cleanup`. The earlier cleanup description overstated built-mode
coverage: that mode suppressed supervisor kill/wait and registry-stop failures,
never proved registry absence, and left the direct baseline container unnamed.
Both modes now share checked supervisor and caller/attempt cleanup. Built mode
also inspects/removes/readbacks its UUID-named registry and direct baseline;
those names are recorded before creation, so partial runs remain owned. INT/TERM
exit through cleanup with 130/143. A refused supervisor signal fails the smoke and
allows remaining cleanup to proceed without waiting indefinitely for that child.
Original nonzero client status survives cleanup errors; Docker diagnostics remain
visible, and supervisor wait reports its exit status. Supplied image preservation
and its exact owned-container inventory are retained.

The focused new test-first run against the old script failed 7/7: supervisor exit,
registry removal refusal, ignored registry removal and registry inspect permission
all incorrectly exited 0; the direct baseline lacked an owned UUID name; TERM
skipped cleanup; and the registry survived success. The first sandbox invocation
could not open Unix sockets (`EPERM`) and is not counted as behavioral evidence;
the subsequent tests ran with socket permission and fake Docker only.

Nine independently injected guard removals each failed its selected production
entrypoint test, then were restored: supervisor wait-status propagation,
supervisor kill-failure propagation, registry cleanup invocation, removal refusal,
container absence readback, inspect permission classification, baseline cleanup
invocation, TERM controlled exit and INT controlled exit. Logs are
`/tmp/cleanup-mutation-{supervisor-wait,supervisor-kill,registry-ownership,
registry-remove-check,registry-readback,registry-inspect,baseline-ownership,
signal-exit,signal-int-exit}.log`. The corresponding tests prove remaining image,
baseline and socket cleanup, plus preservation of client exit 87 alongside the
precise injected `registry removal denied` diagnosis.

Final restored `bun test apps/wbs/be-01/scripts/solver-image-smoke.test.ts
--timeout=10000`: 69 passed / 0 failed, 255 assertions (50.67 seconds;
`/tmp/cleanup-restored-suite.log`). Scoped Prettier and `git diff --check` passed.

Scoped ESLint passed after `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx show
project wbs-be-01 --json` generated the project graph; the initial pre-graph ESLint
warning about skipped module-boundary validation is not counted as that proof.
`bunx tsc --project apps/wbs/be-01/tsconfig.tools.json --noEmit --pretty false`,
ShellCheck, and OpenSpec validation each exited 0 (OpenSpec: 1 passed / 0 failed,
existing long-requirement warnings retained). The locked root dependency tree was
reused through a scratch `node_modules` symlink; no dependency install occurred.

No real Docker build/run, installed-image acceptance, h2 gate, live mutation,
push or merge was performed. Parent tasks 7.3/7.4 and their actual installed-image
fault proofs remain open.
