# Frontend origin probe concurrency repair — 2026-10-23

The configured frontend target's DOM-free prerequisite launched enough Vitest forks
that a cold backend-config import exceeded the origin probe's existing 20-second
subprocess bound. The failure precedes app construction and the in-process request;
there is no backend listener or network dependency in this probe.

The repair bounds `vitest.node.config.ts` to four workers. The probe and case
budgets stay at 20 and 30 seconds. Existing integration coverage is the oracle:
`lets a shifted browser login reach authentication through the configured backend origin`.
No new source-text/config-value assertion is needed to duplicate that oracle.

## Investigation and watched red

Base: frontend packet `8c4195576d30317b1d66aaf5ece1eacede47cbf3`, isolated shared clone
`/tmp/puni-frontend-origin` on pop-os. Native worktree creation was unavailable
because the original checkout's `.git` is read-only in this session.

Focused original case passed outside the process sandbox (5.08-second suite).
The sandboxed run failed `spawnSync bun EPERM`, a separate process restriction;
all subsequent runtime checks ran outside that sandbox.

Temporary diagnostic instrumentation replaced the probe's static imports with
sequential dynamic imports and printed monotonic phase timestamps. A focused
run completed backend-config import at 9.455 seconds, fixture import at 9.870,
app construction at 9.908 and response at 10.109. No production code changed.

Configured command:

```sh
NX_DAEMON=false NX_ISOLATE_PLUGINS=false NODE_OPTIONS=--max-old-space-size=4096 bunx nx run wbs-fe-01:test --skip-nx-cache --outputStyle=static
```

With the original worker setting and diagnostics, exit 130 with an explicit
Vitest verdict: 81 files passed, one failed; 1011 tests passed, one failed.
The origin probe failed `spawnSync bun ETIMEDOUT` at 20.503 seconds. It printed
`probe:start` and never completed its first backend-config import. Process
inspection observed more than twenty forks at roughly 560–660 MiB RSS each;
a later sample had twelve workers totaling 4510 MiB. Available memory dropped
from about 15 GiB to 10 GiB. Other lanes shared the host, but the team paused its
broad checks for this experiment.

Raw red: [configured-unbounded.log.txt](evidence/frontend-origin-concurrency/configured-unbounded.log.txt).

## Controlled green experiment

One variable changed: `maxWorkers: 4` in the DOM-free config. Same configured
command and same subprocess/test budgets, with the temporary phase diagnostics.
A process sample observed exactly four workers totaling 989 MiB early in the run.
The node prerequisite passed 82 files / 1012 tests in 59.37 seconds (red: 43.56).
Backend-config import completed at 4.708 seconds, fixture import at 4.985,
app construction at 5.005 and response at 5.147.

The failed original setting and the controlled passing setting exercise the same
real config import, backend fixture and mounted login route. This is the negative
proof for the concurrency bound; removing it reproduces the production target's
original failure without enlarging its timeout.

The controlled configured target and restored-probe focused results follow, with
their source scope and the checks this lane did not run stated explicitly.

The controlled full target exited 0 in 22m48s: node 82 files / 1012 tests,
UTC view 231 files / 4638 tests (1300.06 seconds), Auckland 4 files / 5 tests
(7.19 seconds). Raw green: [configured-four-workers.log.txt](evidence/frontend-origin-concurrency/configured-four-workers.log.txt).

The original probe file was restored in full; the retained runtime diff is only
the node-config worker bound and its adjacent observed proof comment. Scoped
`bunx eslint apps/wbs/fe-01/vitest.node.config.ts`, Prettier over that config and
this packet passed. The initial unstaged `git diff --check` excluded the then-untracked
raw logs; review found that the committed delta failed because of CRLF trailing
whitespace and a blank EOF. The correction normalizes log whitespace only and
checks the entire repair delta, including the evidence files.

Scope of that full green: the command launched with the temporary diagnostic
probe. After its node prerequisite passed, the probe source was restored while
the serial UTC view phase was still running. Therefore the node-tier result
above covers the diagnostic variant; UTC view and Auckland completed against
the restored source. The parent lane subsequently ran the exact restored-source
`wbs-fe-01:test:unit` target on `f83a9bacc726a9c090450c97126f99dd07d44d91`:
uncached, 82/82 files and 1012/1012 tests passed in 38.6 seconds. This receipt is
reported by the parent lane; it was not run by this repair lane.

Restored-probe focused verification passed (exit 0, one case, 5.01 seconds):

```sh
TZ=UTC bunx vitest run playwright-config.test.ts -t 'shifted browser login' --no-file-parallelism --maxWorkers=1 --testTimeout=30000
```

Raw focused: [focused-restored-probe.log.txt](evidence/frontend-origin-concurrency/focused-restored-probe.log.txt).

The full configured lint/typecheck and h2 gate have not been run by this repair
lane. The parent lane owns serialized broader verification and integration;
this packet makes no claim about those unrun checks.

The initial commit's normal hooks passed: scoped lint, format, plaintext secrets,
private nesting and both commit-message stages. Tool Wiki reported its modeled
`inactive` state because no external activation root is provisioned. The review
correction reruns Prettier, normal hooks and whitespace checks over both its own
delta and the complete repair delta. Log normalization preserves all substantive
observations; token equality before and after normalization was asserted.
