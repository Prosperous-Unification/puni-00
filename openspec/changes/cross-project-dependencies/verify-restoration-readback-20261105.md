# Restoration store-observer lifetime repair

Baseline is published `28e9cb2695c1f4d4c60aeb6653443ef4eb0a33f2`.
This restores the existing same-live-owner committed-store observer contract;
it adds no activation or restoration authority and changes no architectural
choice. Root owns Git/WBS/evidence, Sol Medium owns the bounded implementation
and independent finite tests, and Astra High owns the lifetime decision/review.

## Observed failure and diagnosis

PR851 run41930921822's remote job126928187309 failed. Its uploaded remainder
artifact is1755755bytes, SHA-256
`5c4ac513bc39a6db0f17bd7ce65184d4960deb9e9c1cdfc30546269d7afed44c`.
It reports3771passed,2real-Docker skips,2failed and1unhandled error across3775
tests/154files. One failure group is the old top-level private custody admission,
already removed from ordinary discovery by PR854. The other is
`actual committed store observer survives source finalizers only under the same live outer owner`,
at its first `observed.inspect()` after source finalizers.

The unchanged focused ordinary case reproduced that failure at the current
baseline:0passed/1failed/3filtered/117assertions,73.63seconds,exit1.
A single separately bounded temporary diagnostic retained the original throw,
captured its hidden cause privately, and reran the SAME case once:0passed/1failed,
117assertions,90.61seconds,exit1. The classified cause was
`activation evidence monitor closed`. No raw private cause is published.
The temporary storage edit was restored byte-for-byte; Root independently
verified equality with the Git blob and SHA-256
`fdc355f58eb1d78e7e8f3ec93bfeeb6ba66ea0637524a953f7205c86423eb332`.
These are diagnosis observations, not R5 guard proofs or successful acceptance.

## Reviewed correction and proof boundary

Ordinary source finalizers intentionally close evidence. A committed-store
restoration observer still belongs to the original live outer owner and activation
deadline. Initial handoff additionally requires its original live raw monitor.
Astra approved changing only the two `inspectStores` boundaries to select the
existing `closeRaw()` for initial handoff and `checkDeadline()` for restoration.
The monitor itself, all other callers, awaited owner checks, receipt/ledger and
anchor observations, synchronous cleanup and public error redaction stay intact.

The proving batch requires the unchanged actual case, independent entry/exit
old-call regressions, deadline probes after owner checks2/4 with an entry
zero-store-open oracle, and whole ordinary restoration-file acceptance. Separate
current-source cuts cover initial monitor/closure/stability/deadline branches with
inert ports; they establish finite branch properties only. Actual private UC2,
closed historical Graph/Vite protocols, missing-before-image recovery and new
native grants are excluded. No check is recorded passed before its output exists.

The independently queued h2 gate targets the preceding28e9 candidate, not this
repair. It cannot qualify the repaired source; a required gate of the eventual
integrated candidate and complete CI remain open, alongside private native
acceptance, architectural main adoption and authorized deployment.

## Observed ordinary and finite proofs

The original focused case passed after the two boundary changes:
1passed/0failed/3filtered/119assertions in77.61seconds. With the two genuine
expiry probes added, it passed1/0/130assertions in80.99seconds.
The focused command contract, from the repository root, was:

```sh
bun test --no-env-file --config="$RESTORATION_PROOF_CONFIG" \
  --preload ./tools/test/scratch/preload.ts \
  ./tools/tool-remote-scripts/src/lib/dependency-participant-restoration.test.ts \
  --test-name-pattern='^actual committed store observer survives source finalizers only under the same live outer owner$' \
  --timeout=300000
```

The template variable names the actual owned empty Bun configuration; config and scratch paths were private per-invocation locations.
The original300000ms test allowance was retained, without widening or retry loops.
Each fault changed only its named production call; exact source bytes/SHA were
restored after each. Four independent faults were observed before one SHARED
restored invocation; these are grouped negatives, not immediate RED/GREEN pairs:

| Fault                                        | Observed failure                                                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Restore old unconditional entry `closeRaw()` | Same case refused with `stage=restoration-store-readback` before store readback.                                        |
| Restore old unconditional exit `closeRaw()`  | Same case refused with that stage after readback.                                                                       |
| Remove entry restoration deadline call       | Zero-open oracle failed: expected0 connection opens, observed1. Later loop expiry did not mask the missing entry guard. |
| Remove exit restoration deadline call        | Required rejection was absent after the fourth original awaited owner check.                                            |

After all four faults and exact restorations, the SAME expanded consumer passed
1/0/130assertions in52.02seconds. Before the final test-oracle refinement, the full ordinary restoration file passed
**4tests,0failures,614assertions** in289.97seconds, with its existing one-shot,
expired-owner, full-ledger, nonselected authority and original-anchor cases.
Scratch teardown returned. No private constructor acceptance was invoked.

The independent finite file extracts the current two branches plus unchanged
`closeRaw`/`checkDeadline` and checks their AST placement after the original owner
awaits around the store loop. Its source snapshot was SHA-256
`38e132724d1a1f518e7e443a3a658644775511478667295cda5439ab0555f4e9`.
The default live-source run passed8/0/16assertions. Five in-memory source fault
groups each exited1: mode6failing cases, closed-monitor2, raw closure4, raw
stability4, deadline2. Exact Error reference checks preserve the inert original
refusal. These are finite branch/placement properties, not native closure,
original operation ownership or initial-handoff execution qualification.

Astra High independently reviewed the stable functional diff and actual proof
logs, finding no functional/security blocker. Its requested exit-proof comment
placement correction was implemented adjacent to the exit branch. Configured
statics, final formatting and publication are recorded only after fresh output.

## h2 queue outcome

The preceding28e9 h2 gate request ended authoritatively with exit75 at
2026-11-05T00:35:03Z after its normal1800second queue budget. The other canonical
holder remained `gate:b1fd7fd1`. No running-SHA marker, candidate checkout or test
execution occurred. This is host-capacity refusal, not a test verdict. No process
was killed or silently restarted. A gate of the eventual repaired candidate is
still required.

## Final instrumentation and checks

Configured lint rejected the first test's cross-project `@wbs/store-sqlite/db`
spy import. The allowlist and production API were preserved. The final test uses
the neighboring tests' delegated `node:fs.openSync` instrumentation and resolves
returned descriptors through `/proc/self/fd` to the two original SQLite mains.
This observes main-file ANCHOR opens, not SQLite connection calls directly.
The entry probe requires zero opens; the exit probe requires both distinct stores,
exact owner-call count and expired-clock observations. All spies restore in
`finally`. Existing receipt/ledger/identity negatives still establish contents.

Astra High reviewed this instrumentation delta and found no missing oracle or
functional/security blocker. Repeating the entry-deadline omission with the final
oracle failed as intended: expected0 main-file opens, observed2, exit1 in108.09s.
After exact source restoration, the FINAL full ordinary file passed
**4tests,0failures,614assertions in344.56s**. This final run supplies the restored
consumer observation for the revised entry fault. The final current-source
finite file passed8/0/16assertions. These later observations do not rewrite the
first oracle's grouped-fault chronology.

Forced uncached `tool-remote-scripts:typecheck` and configured uncached
`tool-remote-scripts:lint` both passed with a populated Nx graph. Only the Node
color-environment warning appeared; no module-boundary skip warning occurred.
Initial test-only AST/narrowing errors were corrected before final typecheck.
The earlier direct finite-file lint skipped that boundary rule and is not used
as the configured lint proof. Prettier on the three source files and
`git diff --check` passed. Exit proof comments are adjacent to the exit branch;
the entry proof names main-file anchor opens precisely.

Root independently verified the three final source SHA-256 values:

| Source                                       | SHA-256                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `dependency-activation-storage.ts`           | `3b040592cdbe663799a9415b01d6c78621fc93d5fba21cff4423ad94fa0c92fc` |
| `dependency-participant-restoration.test.ts` | `ae27e785bb59f670f92a850b74415d0aa595eedc272ea5ee8875df02cb08c6c9` |
| `dependency-store-observation.test.ts`       | `60ccc5b8dad4ca32941c602ad0f0d5df493192e4e59e7dcc3c8a5a5da70d01d1` |

Both Sol source leases are released. Root owns final documentation checks, normal
commit hooks and publication. Fresh main has advanced to
`149e6e85b5f578b74cb31112a0068698da0b1269`; its separate gate-host role changes
were independently reviewed for a private integration after this checkpoint.
No Ansible apply or live host validation is included, and no earlier ordinary
check or queue result qualifies a later combined candidate automatically.

Root's current-document/index check passed after staging the two new paths.
The first unstaged check refused those untracked diagnostic paths and supplies
no pass credit. Fresh `openspec validate --all --json` exited0:333/333 passed,
0failed (313changes,20specs). Both evidence documents were formatted before the
normal commit; no pre-commit hook bypass is used.
