# Shared executor lifecycle conformance — 2026-11-05

The reviewed I2.01 mechanical extraction registers nine shared public lifecycle cases
through the actual API-model adapter/installed SDK factory, exactly once. Ten concrete
API cases and four neighboring test files remain unchanged. This is a common oracle
foundation for adapters; full five-kind conformance remains open.

Reviewed source commit: `5196fda5419073261db88ca158f96cbc58bca2fb`;
parent: `7a97b74804781fa04c46da3f82bd5be6475c01ae`.
The unchanged production adapter SHA256 is
`f7de095b07b38a171d040c4443e853208939197b595206a588917cc6769223e1`.
The concrete test and shared helper SHA256 values are respectively
`6b46945313ba3748d407b0da878db2ef00f817e4677e453f4408b3d0dca25846` and
`b81f88755f761be52cb82207a5306947aadab3f5e4a8340e3d9eab0dc1e5fcb9`.

## Case map

Original lines refer to the packet's before/api-model-adapter.test.ts. Shared lines
refer to agents/testing/executor-contract.ts; complete original assertion sources,
review diff and both original reviews are retained in the packet.

| Original line | Shared line | Public oracle                                                                |
| ------------- | ----------- | ---------------------------------------------------------------------------- |
| 169           | 68          | Portable open, exact preparation retry, one allocation, no dispatch.         |
| 190           | 89          | Pre-aborted open allocates nothing and leaves creation key unbound.          |
| 219           | 107         | Completed exact retry emits nothing; changed payload rejects before abort.   |
| 260           | 153         | Caller input/owner remain mutable while retained request is detached.        |
| 276           | 174         | Pre-aborted turn preserves initial cause and leaves key unbound.             |
| 289           | 191         | Active duplicate uncertain; busy/pre-aborted fresh keys remain reusable.     |
| 368           | 261         | Decision before initial admission rejects without consuming its key.         |
| 378           | 277         | Foreign live/deserialized attachments reject turn, cancel and close.         |
| 394           | 302         | Closed attachment rejects retry/reopen; repeated close/cancel keeps locator. |

Expected identity, Hi/end_turn, measured120/30 and text-delta parts are independent
literals. Allocation and dispatch probes observe the real adapter/SDK path. The held
case releases its dependency, settles every admitted turn and retains primary,
settlement and close failures. No injected close-rejection proof is claimed.

## Retained native evidence and production negatives

The canonical campaign is `bound-v2-round1-1793844315374`: manifest, completion,
audit and all thirteen receipt companion families resolve inside the packet.
The cohort observed **99 pass, 0 fail, 787 assertions** across five explicit source
test files. Uncached Dash lint, forced typecheck and changed-source format succeeded.
Three distinct production guards each have before/fault/exact-restored native outcomes
**0/null, 1/null, 0/null**:

| Guard fault                        | Observed shared-oracle failure                                           |
| ---------------------------------- | ------------------------------------------------------------------------ |
| Remove active-session exclusion    | Actual second backend entry; dispatch count Expected1/Received2.         |
| Remove recorded payload comparison | Changed recorded request resolves; rejects.toThrow fails.                |
| Retain mutable caller alias        | Original replay rejects with conflicting turn key after caller mutation. |

The alias proof establishes detached recorded-key replay, without claiming prompt
copying after an await. Every fault is restored to exact original production bytes.
Immediate children are the actual absolute `/home/df/.bun/bin/bun`, version1.4.4,
SHA256 `10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235`.
Frozen intent/helper, requested/resolved argv, cwd, necessary PATH/overrides, native
regular FD streams, closure, exit and signal are retained. Nx descendants and the
full inherited environment are untraced/unarchived.

## Publication verification and limits

The UTF-8 [packet](evidence/executor-conformance-20261105.json) contains a gzip/base64
UTF-8 JSON payload with SHA256-addressed 65536-byte chunks. Decode base64, gunzip,
parse entries/chunks, concatenate each entry's chunk bytes in order, then verify its
byte count and SHA256. Paths are identifiers: use an owned scratch directory, never
restore absolute paths or execute archived helpers. The adjacent
[manifest](evidence/executor-conformance-manifest-20261105.json) lists every entry,
required receipt/review/source dependency and separately attached completed publication
captures. Its frozen verifier checks exact reconstruction, captured-original equality,
all thirteen required receipt families, source hashes and production scanner results
on every decoded entry/attachment. Corrupt entries, missing dependencies and absent
decoded inputs are rejected. Publication checks use absolute Bun and native FD captures.

The original corpus remains **527 packet entries + 77 publication attachments**.
A separate manifest supplemental group, `serialized-required-review-omission`,
retains **51 additional entries** at cutoff **2026-11-05T02:36:22.193Z**: the actual
serialized owned fixture, four completed native capture families and their frozen
scripts/helper/report dependencies. Original packet bytes and both original cutoffs
are unchanged. Decode this group's base64, gunzip its UTF-8 JSON entries, then decode
each entry's base64 and verify its byte count/SHA256.

The original direct missing-`get()` selfcheck has its narrower scope. The stronger
proof invokes the **same exact frozen verifier**, SHA256
`5f60795a9da13cae8522bdd15094a227a1bb4e2f3093213a14d3924454c2e109`,
with actual native normal/omission/normal outcomes **0/null, 1/null, 0/null**. Only
three serialized corpus reads are redirected to owned copies; no dependency lookup
is changed. The copied corpus omits `task-1-review-fix1.md` while retaining its
required-review declaration and consistently recomputing encoding/hash/count/inventory
fields. Integrity passes; the unchanged review lookup rejects the absent required
path. Parser/hash/count/setup failures are not credited. Normal corpus passes again
afterward. This is a publication dependency proof; the product guard count remains
three. The supplemental verifier reconstructs/hash-checks/scans every new decoded
entry and checks native evidence and current restored source hashes. Its own future
capture and subsequent transport are excluded explicitly. The retained supplement
report's earlier outside-manifest wording describes the prior publication cutoff.

The historical payload cutoff is **2026-11-05T02:19:50.427Z**. Live progress is replaced
by its named frozen snapshot. Own incomplete publication transport and future reviews,
gates, commits and PR transport are explicitly excluded; separately attached completed
captures have their own finite cutoff and exclude the verifying capture itself.
All original failures, setup attempts and reviews remain. Old bare-child launcher
identity is unproved and is not backfilled. Historical raw-index drift remains
unattributed; the old12886 vector equalled then-HEAD only at its audit. The bound-v2
12887 intent-to-add vector and raw036 index were stable during that campaign only;
this does not assert the current index equals HEAD after the reviewed source commit.

No runtime proof was rerun for this documentation publication. This slice changes no
SDK choice, dependency, policy, API, schema, tenant, CTT, durable backend or production
behavior and performs no paid/live-provider work. Full five-kind conformance, durable
recovery/coordination, host integration, whole-branch review, full CI/build and current
exact-SHA canonical hosted gates remain open. Root owns final review and those gates.
