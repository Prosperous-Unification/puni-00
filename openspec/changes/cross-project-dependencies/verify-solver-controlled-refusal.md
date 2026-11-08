# Controlled solver refusal terminal repair

The second disposable h2 run reached real stop/descendant exit, original-cgroup
emptiness, Docker-child kill/terminal proof and manual/systemd restart refusal.
Its final drain and cleanup then refused the preserved native failed state.
The measured refusal was `failed/failed`, `Result=exit-code`,
`ExecMainStatus=78`, `RestartPreventExitStatus=78`, zero MainPID/ControlPID,
empty Job and empty ControlGroup. This packet repairs that local contract;
it does not claim the physical runner passed or clean up the retained host unit.

Only `assertNoEdgeOwner` can construct the private retained-owner refusal after
successful marker lstat. A shared type predicate recognizes it; ordinary Error
text, reason-shaped objects and unknown throws cannot supply that authority.
Both legacy and policy startup validate canonical readable state, check markers
before runtime acquisition and check again inside the held lock. The actual
supervisor and fixture map only this typed refusal to 78; every other startup
failure remains 1. The shipped unit now prevents restart on 78. Fixture receipts
carry the typed reason and manual/restart authority no longer uses regex text.

The shared mandatory native projection includes Result, ExecMainStatus and
RestartPreventExitStatus. Effective authority requires exactly 78. Production
parse and actual fixture cleanup share a terminal predicate: inactive/dead or
exact controlled failed/failed, always with zero process IDs, no job and empty
current cgroup. Original-cgroup emptiness and tuple checks remain independent.
No reset-failed is introduced. Source-composition unit fixtures and the observer's
previously legacy ExecStart now carry the adopted policy argv and new properties.

## Fresh local checks

The isolated pinned toolchain was used through
`PATH=/tmp/puni-pr630-bun142-al30yoqo:$PATH`; its Bun printed 1.4.2. Earlier
current-system-Bun runs printed 1.4.4; they are not the final toolchain evidence.
Two child-stream transport cases failed in the filesystem/network sandbox and
passed in the authorized local rerun with real socket/stream support.

- Test-first controlled native failed-state regression refused the prior
  projection; all four simultaneous marker/runtime CLI cases first exited 1
  instead of 78, then passed after the repair.
- Final expanded focused `bun test` run: 273 passed, 0 failed, 2958 assertions
  across ten files (43.61s). Files: solver-runtime-admission.proc.test.ts,
  solver-unit-observation.test.ts, solver-drain-fixture.test.ts,
  solver-drain-transport.test.ts, solver-runtime-admission.test.ts,
  solver-exclusion.test.ts, backend-exclusion.test.ts, install.test.ts,
  solver-supervisor.test.ts and solver-supervisor-install-operation.test.ts.
  It used `--preload ./tools/test/scratch/preload.ts` and authorized local
  socket support. A subsequently added owner-bound final-drain case passed
  separately while preserving failed/failed evidence (1 test, 2 assertions).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t
lint,typecheck,build -p tool-remote-scripts --skip-nx-cache
--output-style=static`: all configured targets and dependencies passed.

## Watched production-path negative proofs

Every mutation was restored before final checks; local fault logs remain under
`/tmp/proof-solver-refusal-*.log`, outside Git.

| Injected fault                                                      | Observed failing tests |
| ------------------------------------------------------------------- | ---------------------: |
| Skip marker lstat; replace typed marker refusal with Error          |                 19; 12 |
| Remove legacy/policy prelock checks                                 |                 2 each |
| Remove legacy/policy inside-lock race checks                        |                 1 each |
| Remove real-directory validation; directory readability             |                 2 each |
| Force CLI exit 1; force all CLI errors to 78                        |                   4; 5 |
| Broaden retained discriminator to generic Error                     |   1 real callback case |
| Force all fixture errors to 78; force marker errors to 1            |                   2; 1 |
| Remove each terminal PID, job, cgroup or restart-prevent guard      |                 1 each |
| Remove each failed state/substate/result/status guard               |                 1 each |
| Remove active effective restart-prevent authority                   |                      1 |
| Permit each missing mandatory terminal property                     |                 1 each |
| Bypass cleanup terminal consumer; remove shipped restart prevention |                 1 each |

The CLI negatives include unreadable trusted state, symlink state, ordinary
callback errors carrying marker-like text, fake reason objects, unknown throws,
invalid configuration/arguments, lock-only contention and a real marker created
between precheck and runtime acquisition. The cleanup negatives prove that no
protected cleanup continuation runs for any terminal fault.

Actual-host acceptance, retained host cleanup, the host heavy gate, Caddy and
real-Docker exceptional cleanup tests were not run for this local repair. The
full unit suite is deferred to integrated verification; D5b, S1/S2/O4 and parent
10.2 remain open.
