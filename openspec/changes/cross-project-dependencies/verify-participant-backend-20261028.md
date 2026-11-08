# Partial backend restoration: authority boundaries and retained fences

This private source slice starts from committed integration
`bd4a837fb3d29bec7c2f46c2b4bd08a01045c66d`. It adds one backend restart
attempt under the original consumed context, owner and deadline. The original
solver stays parked; the gateway, source, controllers and ingress remain
fenced. This is partial backend readiness, not complete participant restoration
or deployment acceptance.

## Reader correction and first owning behavior

The first implementation refused before starting the backend. A temporary
owning-test diagnostic observed `unsupported edge record path` at the legacy
reader, with seven capture calls and zero inventory reads or starts. The
coordinator had passed participant-fence names to a reader whose closed name
set deliberately excludes them. The diagnostic was removed exactly.

Two closed readers now reuse the same private bounded file-reading body:
`captureParticipantFence` accepts the eight original fixed fence names, and
`captureOwnerOperationIntent` accepts six-to-twelve-digit ordinary intent
names. The legacy reader retains its original allowlist. The coordinator uses
its fence reader both when retaining and when rechecking fences; the owning
model uses the ordinary-intent reader. Publications still use the legacy
publication reader. A public string parameter validates the fence-name
boundary at runtime; internal fence collections retain their literal-name type.

The new reader owner passed 19 tests / 58 assertions, and three existing owners
passed 78 tests / 287 assertions. Omitting each new filename guard separately
made its readable-sibling-file negative fail; exact restoration made each pass.
The final formatted readers passed the same 19-case owner in 36ms. The original
I/O and legacy-name checks are reused, not described as newly requalified.

```sh
# From tools/tool-remote-scripts
bun test src/lib/closed-restoration-records.test.ts --preload ../test/scratch/preload.ts --timeout=10000
bun test src/lib/edge-policy.test.ts src/lib/solver-restoration.test.ts src/lib/dependency-activation-records.test.ts --preload ../test/scratch/preload.ts --timeout=10000
bun test src/lib/dependency-product-process-model.test.ts -t '^isolated backend restart coordinator retains fences through durable ready$' --preload ../test/scratch/preload.ts --timeout=310000
```

After the caller correction, the owning restart case passed: one inner case /
228 assertions in 87.75s, and one outer ownership case / 9 assertions in 88.04s
(session 90405, terminal `545cd5`). Four later identifier renames were purely
mechanical and independently reviewed. This original case has no database
opener; the following cases supply its missing opener coverage.

## Fourteen modeled authority cases

One matching production opener reached durable readiness. Thirteen negatives
exercise development-store access, init/foreign PID, start-time, UID, cgroup,
executable device/inode/hash/null, an opener before startup, and inner-process
changes before ready publication and before returning readiness. Each raw
collector transport delegates its ordinary producer first; the real closed
decoder and authority observer consume the injected bytes. Fault-phase,
observer-return, exact start, real loopback readiness, durable publication,
settled audit, store/ledger and retained-fence assertions prevent an unrelated
early refusal from earning credit.

```sh
# Same cwd; substitute each literal from PARTICIPANT_OPENER_CASES for exact-prod.
bun test src/lib/dependency-product-process-model.test.ts -t '^isolated backend coordinator authority boundary: exact-prod$' --preload ../test/scratch/preload.ts --timeout=310000
```

All fourteen cases passed serially: 2,674 inner assertions and 126 outer
assertions. Every inner run reported one pass, zero failures and 41 filtered
registrations; every outer run reported one pass, zero failures and 42 filtered
registrations. Both scratch cleanup hooks returned for every case. The exact
positive used session 64703, terminal `590407`; the remaining thirteen used
session 41129, terminal `cf72d4`. Original inner/outer 300000/310000ms bounds
remain unchanged.

## Watched omissions and exact restorations

Each fault below removes only its named production check. After its owning
assertion failed, the driver joined the child, restored the original source
bytes and ran the identical case again. All five restored cases passed.

| Omitted check                                         | Case                | Observed owning failure                                                                     | Restored inner / outer assertions |
| ----------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------- | --------------------------------- |
| Empty pre-start opener set                            | `prestart`          | readiness returned where refusal was required                                               | 152 / 9                           |
| Grouped opener environment/PID/start/UID/cgroup check | `dev`               | readiness returned where refusal was required                                               | 189 / 9                           |
| Opener executable equality                            | `exe-null`          | readiness returned where refusal was required                                               | 189 / 9                           |
| Inner observation and equality before publication     | `late-before-ready` | expected zero ready publications, received one; the later refusal does not undo publication | 203 / 9                           |
| Inner observation and equality before return          | `late-final-return` | readiness returned where refusal was required                                               | 213 / 9                           |

The first two used sessions 30270 and 81858. The last three completed in session
1818, terminal `536b7e`, exit 0. No timeout or setup failure was accepted.
Proof comments were added only after these observations. The tuple proof covers
one grouped guard through the development-store fault, not independently
omitted tuple subclauses.

All fourteen ordinary cases and five omission/restoration pairs name production
source SHA256 `0ac1bfcc89db437fc9045795c020156cb0d3e11e88a885da5b66960df61adf9e`.
The later source changes are five factual comments and formatting. Test lint
corrections replace indexed-first reads with `.at(0)`, remove a statically true
assertion and an unnecessary test cast, and sort imports. They retain meaningful
decoder/consumption and absence assertions. The public fence-reader parameter
changes only its TypeScript input type; all eight runtime name checks remain.
These are not fourteen new full-source reruns after those mechanical changes.

Private raw receipts are retained under
`/tmp/puni-r18-participant-opener-execution-20261028` and
`/tmp/puni-r18-participant-five-guard-execution-20261028`.
The ordinary aggregate receipt hashes to
`190eecd9d8ca5ea06a7aa5074700f45607235fd65928bb6a1b78fdf3ec229ce4`;
the five-proof aggregate hashes to
`c07cdb9fc317593c67fd43a58428a85a7345eb3743b6798c8e52680cc1768a35`.
Independent actual reviews accepted the fourteen cases and each proof, including
the distinct publication failure in `late-before-ready`.

## Static checks on the mechanical correction epoch

The final remote-scripts spec compilation passed (session 21958, terminal
`ba65da`) after the proof comments, reviewed lint edits and formatting. The
first scoped lint had reported five source/test findings and missing Nx graph
coverage. A fresh graph was generated; after the reviewed edits, one remaining
test-only literal-name cast became unnecessary because the public reader now
accepts strings. Removing that cast and its unused import retained the identical
runtime negative. Uncached scoped lint then passed without graph-skip warnings
(session 77149, terminal `27c6b8`). The earlier five-error and residual-cast lint
runs remain failures, not passing verification.

```sh
# From the repository root
bunx tsc --project tools/tool-remote-scripts/tsconfig.spec.json --noEmit --pretty false
bunx nx graph --file=/tmp/puni-r18-participant-opener-execution-20261028/final-project-graph.json
```

The owning OpenSpec change validates successfully with its existing
long-requirement warnings. MCP Dockerfile deadline isolation and its separate
focused/compiler/lint evidence are recorded in
[the main reconciliation note](verify-main-reconciliation-20261028.md#integrated-baseline-gate-and-dockerfile-test-isolation).

## Remaining acceptance

These observations use modeled raw process/collector inputs and real decoder,
observer, ownership, loopback and file paths. They do not prove installed-host
kernel FD discovery, native Docker production, every new coordinator guard,
complete participants restoration, exposure or Kubernetes activation. Context,
inventory, fence and retry-specific consumer proofs remain separate obligations.
The stopped-solver backend API stays partial: full composition must restore the
pinned compatible solver before products under the same original context and
deadline. Neither an observed-running baseline rebase nor appending solver
restoration after backend startup satisfies that ordering.

The earlier committed baseline's CI success does not cover this uncommitted
slice. Exact-current-SHA host gate, CI and complete activation acceptance remain
required. MAIN/PR #630 architectural adoption and deployment remain held.
