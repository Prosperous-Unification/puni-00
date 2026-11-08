# CI global hook diagnostics

The exact-head remote CI job 120844592598 (run 40084491151) ended with
3322 pass, 2 skip and 2 fail across 136 files in 4106.48 seconds. Its final
passing file, `src/lib/edge-policy.test.ts`, registers no hooks. Bun then
reported `(unnamed) [10669.05ms]` and `a beforeEach/afterEach hook timed out`
under the target's unchanged 10000 ms budget. This message alone does not
identify which hook ran. The independent process-model child failure is
outside this diagnostic change.

The scratch preload registers one global `afterAll(removeProcessRoot)`.
The helper caches one lazily allocated process root; `scratchSync` and
`scratchAsync` add children, while many remote tests also remove individual
fixtures. `removeProcessRoot` calls synchronous recursive `rmSync`. Its
existing best-effort catch and exit/signal hooks are unchanged. Neither the
large suite nor the final log proves that scratch removal caused this CI
failure, or that a filesystem operation was slow.

The preload now emits two short synchronous stderr markers around its actual
cleanup call: `source=afterAll event=start` and `source=afterAll event=return
elapsedMs=<integer>`. The latter describes a normal return from the existing
helper, not successful deletion. A thrown error still propagates. Markers
contain no paths, fixture names, file contents, environment or traversal;
there is no timeout increase. `writeSync` makes the entry visible before a
synchronous stall rather than waiting for the event loop to drain a stream.

## Focused evidence

All commands below ran in `/tmp/puni-scratch-diagnosis` with the official
`/home/df/.bun/bin/bun`, which printed `bun test v1.4.4 (38afee6c8)`.

- RED: `bun test tools/test/scratch/scratch.test.ts --preload
./tools/test/scratch/preload.ts --timeout=30000 --test-name-pattern
'traces the global cleanup'` against the unchanged preload exited 1:
  expected two markers, received zero. Log: `/tmp/puni-scratch-trace-red.log`.
- Placement fault: temporarily replacing hook registration with an immediate
  cleanup call made the same test exit 1 because the child scratch root
  survived. Restored registration afterward. Log:
  `/tmp/puni-scratch-trace-placement-red.log`.
- Controlled attribution: temporarily injected a synchronous 250 ms
  `Atomics.wait` immediately before `rmSync` inside the actual
  `removeProcessRoot`. Two fixture files allocated scratch and passed under
  `bun test /tmp/puni-scratch-delay-control/first.test.ts
/tmp/puni-scratch-delay-control/second.test.ts --preload
./tools/test/scratch/preload.ts --timeout=100`. It exited 1 after printing
  both markers with `elapsedMs=251`, followed by `(unnamed) [251.03ms]` and
  Bun's same beforeEach/afterEach timeout diagnostic. Restored `index.ts`
  byte-for-byte afterward. Log: `/tmp/puni-scratch-trace-delay-control.log`.
  This is injected latency, not a reproduction of actual CI filesystem latency.

The two-file regression test runs the real preload in a child, checks that
both suites finished before the single marker pair, checks elapsed format
and absence of fixture paths/names in the markers, and checks the allocated
root disappeared. Existing failure, signal, plain-process and multi-file
budget tests remain in the focused suite.

## Final checks

- `bun test tools/test/scratch/scratch.test.ts --preload
./tools/test/scratch/preload.ts --timeout=30000`: 6 pass, 0 fail;
  `/tmp/puni-scratch-trace-final.log`.
- `NX_DAEMON=false bun x nx run tool-test-scratch:lint`: exit 0.
- `NX_DAEMON=false bun x nx run tool-test-scratch:typecheck`: exit 0.
- `bun x prettier --check` over both changed scratch files and this evidence:
  exit 0.
- `bun x openspec validate cross-project-dependencies --json`: exit 0,
  one change valid; existing long-requirement warnings remain.

Nx reported sandbox socket denial and ran plugins in its main process; both
project checks completed successfully. An initial direct ESLint run without
a cached Nx graph skipped module-boundary analysis, so the final lint used
the Nx target instead.

## Limits

The original 68-minute remote target was not rerun locally. No SSH, Docker,
native integration, workflow or deploy actions ran for this change. Actual
CI timeout cause remains unknown until another affected run captures these
markers. A full host gate is not claimed. The first sandboxed full scratch
run had three existing child stdout failures (`child exited without its
scratch path`); the authorized local-only run outside the sandbox passed.
