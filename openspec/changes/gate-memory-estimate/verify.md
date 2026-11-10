## Scope and source

Isolated public caller branch `ops/gate-memory-estimate-20261110` starts directly at
`fe7178a6c363053390849bc98daaad10297c5aae`. The production-field changes are gate
`envelope.memoryGib` from 6 to 10 GiB and its provisional memory rationale in `provenance.basis`. Enforcement remains observe; CPU 4, tmp 8 GiB, gate_tree, container
CPU 1 / memory 1 GiB, estimated kind/expiry, existing container caveats and all other job descriptors remain identical.
Scripts, trust/checkout/full-check/admission/scope logic and runtime binaries are unchanged.
One existing calibrated-p95 test fixture now owns its 6 GiB synthetic envelope; its independently
chosen 6.5 GiB negative and 6 GiB boundary expectations and production rule are unchanged.

No host, queue, current job, pool configuration or frozen target was changed. Private site/role
worktrees were untouched; the licensed site is absent from this public branch, so no public
site-tree identity is claimed.

## Observation basis

These are provisional estimates, not calibrated/full-gate measurements:

| Receipt                                                                         | Safe observation                                                                                                              | SHA256                                                             |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `/tmp/puni-gate-memory-profile-r_7b5xnd/receipt.json`                           | local forced WBS typecheck exit 0; max single child RSS 8,046,416 KiB; Go limit 3 GiB did not bound it                        | `62885e0dfdbb86ee3796a81b628517f8af0ae6956540fc166a0e70d29cb8a74a` |
| `/tmp/puni-gate-affinity-profile-hw6ypzhe/receipt.json`                         | local one-CPU forced typecheck exit 0; max single child RSS 9,676,704 KiB                                                     | `64dd6f03ff45016274a567b98b5adc6841ad0d8ed52a33fe86ceccb8df63b76d` |
| migration-control `.local/h4-public-gate/memory-observation-20261110T0558.json` | existing unrelated H4 scope: 6 GiB MemoryHigh, 7.55 GiB current/7.62 GiB peak, high events +2946 in 10 s, scope full PSI ≈98% | `5399cf4c8219e97fb03cbbfbad47d629144ffaf1051d0223fad383441d67a485` |

Root supplied H4 allocatable 10 GiB. No new remote probe or Go/CPU tuning was performed. These
receipts do not measure whole-process-tree RSS or certify a 10 GiB full-gate peak.

## Caller versus target

`readCataloguedJob` reads `infra/jobs/catalogue.json` from the caller's committed HEAD; the
canonical launcher resolves/passes the explicit target SHA separately. `jobEnvironment`
uses the admitted descriptor, and `scopeArguments` keeps ordinary observe MemoryHigh at that
reservation. `resolve_gate_tree` requires a canonical assigned unit distinct from the caller,
then `resolve_gate_commit`/`run_pinned_checkout` resolve and check out the target inside it.
A new caller outside pool units therefore retains the existing trust/checkout/check sequence.

`launcherCheckouts` is inspected by mode/concurrency-eligibility verification; it is not an
allowlist of ordinary caller cwd values. Neither `readCataloguedJob(cwd,type,argv)` nor the
ordinary launch path requires its caller cwd in that configuration list. This conclusion does
not authorize changing a configured launcher or bypassing enrollment/admission.

Before commit, invoking the real reader against this caller selected committed fe717 and 6 GiB,
ignoring its uncommitted 10 GiB working file, exactly as required. After the ordinary commit,
repeat that read to record the new caller HEAD/10 GiB with unchanged explicit target fe717.
Parent owns any later transport/execution; this preparation runs no gate.

## Scoped checks and breakability

Existing contracts/job-catalogue, rules/job-catalogue and resources/host-pool tests: 31 passed / 60 assertions
at baseline. Raising memory exposed 30 passed / 1 failed: the calibrated-p95 test inherited the repository
estimate but expected 6 < 6.5. Root authorized only its explicit synthetic 6 GiB fixture repair;
its same named finding and boundary remain required. Restored output is retained under
`/tmp/puni-gate-estimate-20261110/existing-tests-restored.log`.

The one-off `profile.test.ts` in that owned temporary directory uses the actual parsed working
catalogue and existing `vectorFits`/`scopeArguments`. Its lower bound is derived from both raw
receipt child-RSS observations, not an assertion merely mirroring 10. It checks empty-host fit,
blocking on a positive prior memory reservation, refusing another positive-memory admission,
refusing a host below the measured lower bound, and observe scope without MemoryMax.

Proof: old 6 GiB produced 4 named failures / 2 passes; 10 GiB restored 6 passes / 9 assertions. Independent
profile faults 6, 9, 11 and cap each produced named failures; exact original/restored catalogue
SHA256 both `f5945b15932abf93c76f90cf3077ada56ed23e0c38063ac2e2be5a506b5ff225`.
The restored 6 checks passed again. `faults.json` and named logs in that owned directory record
actual output. This is pure local profile/admission evidence, not a live native scope/job.
No production guard or launcher behavior was added or weakened.

After the fixture repair, all 31 existing tests passed with 60 assertions. Scoped ESLint passed
with a freshly generated local Nx graph, so module-boundary checking was not skipped. Format,
strict OpenSpec (one change, zero issues) and whitespace checks passed. The initial ESLint
warning about a missing graph was resolved before the final run. No whole-project typecheck or
build was run: production TypeScript and runtime binaries are unchanged; the only TypeScript
edit is the synthetic test fixture. Independent read-only review closed clean on catalogue SHA256
`f5945b15932abf93c76f90cf3077ada56ed23e0c38063ac2e2be5a506b5ff225`, including
the exact preserved container caveat and the receipt-derived fault evidence. The
actual full gate, live 10 GiB admission, peak, host pressure and success remain unverified.

## Canonical public identities

Working diffs for all five paths and all gate scripts/production admission code are empty
against frozen fe717. The five exact tree IDs remain:

| Public path                          | Tree ID                                    |
| ------------------------------------ | ------------------------------------------ |
| `apps/website/fe-01`                 | `9394c24e8acc1cab3b13fe9fa580850532a7d867` |
| `apps/website/be-01`                 | `a313b29030f0a4c0738e8246876632ffa72c1df1` |
| `libs/website/domain/contracts`      | `aee6624a10e47515da722b2e7bec003437416c82` |
| `libs/website/adapters/store-sqlite` | `d075febdafc6487e4c2913e7b46982509184b777` |
| `libs/website/adapters/analytics`    | `d7b467a2c7ba2e59bc9b4893f1daeee7d1bf27db` |
