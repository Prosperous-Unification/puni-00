# Native empty-hook observation repair

The disposable host runner stopped before starting its service: native
`systemctl --user show` omitted empty `ExecStartPre`, `ExecStartPost` and
`ExecStop` properties, returning 19 of the 22 requested properties even with
`--all`. The typed user-manager reads independently returned exactly
`{"type":"a(sasbttttuii)","data":[]}`. The previous strict cardinality
assumption therefore refused a valid empty-hook unit.

`observeSolverUnit` now supplies the same producer to production and the
fixture. Native unknown/duplicate fields and missing non-hook fields refuse.
Only omitted hooks trigger Manager.LoadUnit (no start), exact encoded unit
object-path binding and closed typed empty-array reads. A second native show
must have the identical projection and omission set. Only proven empty lines
are appended; native ExecStart and ExecStopPost bytes survive unchanged and
existing strict authority consumers remain in force. Fixture signals reach
both observation and guarded service effects. Required fixture tools include
busctl. Production command streams have 64 KiB bounds, fatal UTF-8, a 15s
per-command deadline, cancellation and exact-child reap; diagnostics omit raw
command/environment/bus output.

The fixture additionally accepts exact ownership-guarded native
`docker inspect <id>` for the source drain's complete snapshot, alongside its
existing narrow projection and lifecycle operations. Broad or extra-argument
inspection refuses; native complete output is returned unchanged.

## Local evidence

- Test-first regression failed on the prior producer with `solver effective
service authority is unrecognized`; initial matrix reported 14 failures.
- Native full-inspect runner regression failed before the allowlist repair
  with `unexpected exact-ID argv`.
- Final focused solver observer/host/exclusion/fixture tests: 81 passed,
  0 failed, including default deadline and native full-inspect cases (20.86s).
- Configured Nx lint, typecheck and build: passed with fresh uncached output
  (`NX_DAEMON=false NX_ISOLATE_PLUGINS=false` to avoid sandbox daemon sockets).
- `openspec validate --all --json`: 277 passed, 0 failed. Prettier check and
  `git diff --check`: passed.
- Full configured unit command first encountered sandbox Unix-socket `EPERM`;
  that known-failed run was stopped by exact cwd/argv/log-descriptor PID
  identification (exit 137 after SIGTERM did not exit). The equivalent local
  run with Unix-socket support completed: 1762 passed, 2 skipped, 0 failed,
  10958 assertions across 79 files (292.67s). The two skipped tests require
  real Docker: merely-created timer-setup cleanup and already-stopped
  container wait/removal. Nx `test:caddy`, actual-host solver acceptance and
  the host heavy gate were not run locally.
- Three additional malformed-array negatives passed (28 observer tests).
  Independently removing the hook and LoadUnit array-type guards in isolated
  source copies each produced 27 passes and 1 expected failure; ordinary
  objects with array-like length/index fields cannot stand in for arrays.
- Watched independent production guard faults: native key validation (2 test
  failures), required non-hook property (1), closed bus envelope (2), loaded
  unit signature (1), typed empty hook (2), stable second native observation
  (7). Each mutation was restored after its expected nonzero test run.
- Extending the production default timeout to 30s admitted a 16s stop child,
  failing the deadline test; restored 15s boundary passed in 15.01s.
- Removing exact fixture argv validation and independently bypassing fixture
  ownership each failed the native full-inspect runner test; both restored.

No actual service, Docker daemon or remote host operation was performed for
this repair. Disposable actual-host acceptance, independent review and the
integrated exact-SHA heavy gate remain open. This local observer repair does
not close D5b, S1/S2/O4 or parent 10.2.
