# API recovery verification

Task 1 implements the bounded unsupported API-model recovery operation. Root owns review, Git, publication, WBS and host gates. This is not completion of S7a or supported physical continuation.

## Final native commands

All commands ran in `/home/df/.codex/worktrees/f3cd/puni-00` using Bun 1.4.4. Exact immediate executable `/home/df/.bun/bin/bun` SHA256 is `10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235`.

```sh
/home/df/.bun/bin/bun test apps/twilight-structure/twilight-dash/cli/src/agents/api-model-adapter.test.ts apps/twilight-structure/twilight-dash/cli/src/runs/execution-history.test.ts apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/execution-history.db.test.ts apps/twilight-structure/twilight-dash/cli/src/runs/reconcile-api-activity.test.ts apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/reconcile-api-activity.db.test.ts --timeout=15000
/home/df/.bun/bin/bun x nx run twilight-dash:lint --skip-nx-cache
/home/df/.bun/bin/bun x nx run-many --targets=typecheck --projects=twilight-dash,tool-devsync --parallel=1 --skip-nx-cache
/home/df/.bun/bin/bun test tools/tool-devsync/src/eslint-boundaries.test.ts -t 'Dash API recovery fixture reaches only' --timeout=60000
/home/df/.bun/bin/bun x eslint apps/twilight-structure/twilight-dash/eslint.product.mjs tools/tool-devsync/src/eslint-boundaries.test.ts
/home/df/.bun/bin/bun x --bun openspec validate twilight-agentic-workflows --json
```

| Native capture          | Observed result                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `release-regression`    | exit 0; 462 pass, 0 fail, 1655 expect calls, five files; 58.34s                                                                                   |
| `release-dash-lint`     | exit 0; actual full Dash ESLint target, uncached; 46.6s                                                                                           |
| `release-typechecks`    | exit 0; both Nx targets execute `tsc --build --force`, sequential and uncached; 10.3s                                                             |
| `release-policy`        | exit 0; 1 pass, 0 fail, 13 expect calls; exact admission, forbidden judge/WBS/relative imports, real unlisted peer and actual fixture source lint |
| `verified-tooling-lint` | exit 0; both changed policy/tooling paths; later changes to these paths were none                                                                 |
| `verified-openspec`     | exit 0; one affected change valid; only existing long-requirement warnings remain                                                                 |

The root's unchanged baseline was 410/0/1389 across the prior three files (`api-recovery-baseline-1793847685289`); it was reused, not repeated before implementation. The added semantic registrations have 26 cases each for memory and actual SQLite, including close/open of the actual retained store and replacement actual API adapter. Fixtures use accepted Burokrat binding, installed MockLanguageModelV4/MockProviderV4 registry and actual API-model factory. The turn cut dispatches a real SDK mock turn and leaves its response unrecorded. No paid provider runs. Forwarding faults alter actual observations or hold actual dependencies; no canned executor success establishes recovery.

## Native evidence and restoration

Local retained evidence is `.superpowers/sdd/api-recovery-tasks/`. Each named capture has `.start.json`, `.stdout`, `.stderr` and `.finish.json`. Frozen helpers record their own script and absolute immediate Bun identity before the child invocation, exact argv/cwd and nonsecret environment, regular stdout/stderr file descriptors, exit/signal, source vectors before/after and descriptor closure. Environment is explicit PATH/HOME, NX_DAEMON=false, NX_SKIP_NX_CACHE=true and TOOL_WIKI_TRUSTED_NODE_MODULES pointing at this locked install. These are immediate-child captures, not full environment or Nx descendant provenance. Every captured immediate Bun exit signal was null; existing SQLite crash tests intentionally signal their own children.

`proof-campaign.json`, `supplement-campaign.json`, `lookup-proof.json`, `final-timing-proofs.json` and `policy-proof-campaign.json` retain fault/restoration vectors. `proof-inspection.json` reviews every original/supplemental/policy fault output; none is a parser/import/setup timeout credited as a guard proof. Archived scripts/sources are evidence and must not be executed.

Original campaign source SHA256 `d3e90e6509d99ff379f514eb92a4114f574f773fa3aa8f5168d09b38dbcbba0f` was restored after each of 28 controls. P28's version-only predicate removal survived existing active-state exclusion and is uncredited; that redundant predicate was removed, producing exact `103ff096227e78b1e8bd331a4318bd0cce2a2020426d05fe368494cb95157937`. All five supplemental controls restored that exact source. The final production SHA256 is `983c0ebf4cbd9d80b2f8f6182b897c7e5ceb552f33320b7ae17bfb95465c2d7c`. `release-source-map.json` verifies identical transpiled runtime output after annotations, formatting and local type-owner reuse. Policy controls restored exact `57b5871f55f45d936c9856bbbb9537dc04e7319e605823c995c296538d5a54e2`; final annotated/formatted policy `8bfe8db0a2d74d0b901013ad9bc8b3579df5c60dac4a6a00b0d1e970a0baa843` has identical transpiled output. The map independently rereads all six final source paths and matches the final regression's start vector.

## Proof map and limits

All failed controls below exited 1 with one selected failing test, and the exact restored same selector exited 0. P28 alone survived and receives no guard credit. Counts and exact selectors remain in the named native stderr and campaign manifests.

| Controls                  | Injected fault and observed scope                                                                                                                                                                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01, S04                  | Alias submitted guard / reread selection after held IO: original valid target changed or incorrectly refused. Snapshot correctness, not a claim that providers accepted stale writes.                                                                                                                             |
| P02                       | Replace verified history delegation with raw provider history: required missing/corrupt/unreadable artifact rejection disappears before query. Artifact faults enter through the ArtifactStore read boundary; these are not physical chmod proofs.                                                                |
| P03–P07                   | Relax selection, actual kind/version/profile, or final profile recheck: mismatching descriptor or adapter changed during renewal loses refusal. The trusted descriptor association is not adapter introspection.                                                                                                  |
| P08–P11                   | Remove revision/renewal refusal or cancellation checks: stale cuts query actual adapter, abandoned work renews, or renewal-time cancellation records. Provider fencing independently still refuses stale publication.                                                                                             |
| P12–P16, S05              | Remove preparation/locator correlation or relax lookup/resume kind/reason/unknown-key decoding: foreign or malformed replies derived from actual backend methods lose rejection. Existing nested codecs keep their own prior proof ownership.                                                                     |
| P17                       | Remove retention metadata refusal handling: a later unchanged evidence-shape guard still rejects but loses the intended metadata_conflict cause. Diagnostic-only proof.                                                                                                                                           |
| P18–P20, P26              | Remove fresh/replay refusal routing, semantic artifact decoding or original reason restriction: typed refusals or retained-evidence validity fail. Existing atomic provider replay/fencing remains its owner's proof.                                                                                             |
| P21/P22, S01/S02, E01/E02 | Remove actual local awaits. Final refined real barriers observe retention settling early as **threw**, publication settling early as **returned**. No fake return was injected. Both refinements and final cleanup-preserving cases were restored green. No successful retention is claimed from the early throw. |
| P23, S03                  | Map unsupported to interruption with fabricated determinate evidence: original checkpoint oracle fails and actual reserved capacity falls 1 to 0. Actual replacement admission still refuses under independent provider rules; replacement admission is not credited as a failed guard.                           |
| P24/P25                   | Remove wrapped-queued / command-family refusal: TypeError or later artifact-shape error replaces typed refusal. Diagnostic/refusal proofs, not publication claims.                                                                                                                                                |
| P27/P28                   | Removing active-state exclusion queries from a settled checkpoint. Version-only removal is masked by that exclusion and was removed as redundant.                                                                                                                                                                 |
| B01–B04                   | Remove only the new fixture allowance or widen only its alias/relative/path scope: real effective-policy admission or denial fails with fatalErrorCount 0 at each evaluated import. Exact restored source lint passes. Unaffected allowances receive no new proof credit.                                         |

Positive cases cover exact historical acknowledgement replay without renewed query/revision/capacity change, concurrent fresh-query convergence, current takeover owner preserving original turn owner, held query/retention/publication takeover, intervening revisions, cancellation before/after renewal and after query, strict malformed/foreign observations, retention metadata conflict, private original causes and real logical-recovery/write protocol exclusions.

## Preserved unsuccessful attempts

- `red-initial`: 0/20, six held-IO barrier timeouts with the minimal refusal stub; preserved, no guard-proof credit. `red-checkpoints`: separate meaningful six-case recorded-versus-refused red. `red-operational-target` fails missing portable original-cause/target handling, then its same cases pass.
- `protocols-first` and `protocols-restored`: fixture assumptions were wrong (beginRecovery alone is not Attempt3; a scoped write guard is not AttemptGuard). Corrected actual resolved nonacceptance and exact guard pass. Early failed detached fixtures could leave temporary directories until process exit; later fixtures await all closure paths.
- `lookup-codec-baseline`: a new preparing test omitted its forwarding lookup fault; corrected wrapper passes. This setup failure is not a proof.
- `final-lint` exposed 25 fixture issues; `test-lint-autofix` left the expected consumer-policy denial; `verified-dash-lint` exposed the production type-only cross-app import. Routine fixes and existing local type-owner reuse resolve these without production permission widening.
- `verified-typechecks` exposed the new takeover test's invariant Bun matcher type mismatch; expected checkpoint narrowing resolves it. Both final affected typechecks pass.
- `policy-red` is the meaningful missing-consumer red. `policy-green` was an invalid insertion because JavaScript replacement interpreted dollar-apostrophe in the anchored alias. The invalid source is preserved; `policy-insertion-restoration.json` proves exact original-policy reconstruction against pre-edit SHA before literal callback insertion. Corrected policy and all valid-policy controls pass restoration.
- Initial login-enabled reads emitted dconf warnings and were repeated without login. One proof-inspection metadata write used the default read-only sandbox and failed EROFS; the authorized rerun persisted the audit. Neither is test evidence.

## Remaining scope

The executor/accepted-selection association is trusted composition; a falsely paired opaque adapter cannot be detected through current ports and could misattribute unsupported observation. This operation cannot start/stop/release work. It provides no worker survival, authoritative absence, effect, physical quiescence, business outcome, receiver write or full startup CLI/coordinator loop. Concurrent fresh identical queries are allowed; recorded exact retries do not query again. Version3 logical recovery and version4 write protocols keep their owners.

No dependencies, CTT, schema, migration, format/history owner, public port method or record variant was changed. No worker Git/index/ref mutation, WBS/RuntimeClient write, tenant/provider/production action, subagent or live/paid model call occurred. Full Nx suites, builds, host gates, CI/secrets/migration gates, review, commit and publication remain root-owned and are not claimed here. Direct branch/index/HEAD verification was deliberately not performed by this worker.

## Final closeout

`closeout-format-check` exited 0 for all eleven owned public paths; `closeout-openspec` exited 0 with the affected change valid. Existing long-requirement warnings remain; the added requirement no longer adds one. Exact formatting child command:

```sh
/home/df/.bun/bin/bun x prettier --check apps/twilight-structure/twilight-dash/cli/src/runs/reconcile-api-activity.ts apps/twilight-structure/twilight-dash/cli/src/runs/testing/api-recovery-contract.ts apps/twilight-structure/twilight-dash/cli/src/runs/reconcile-api-activity.test.ts apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/reconcile-api-activity.db.test.ts apps/twilight-structure/twilight-dash/eslint.product.mjs tools/tool-devsync/src/eslint-boundaries.test.ts openspec/changes/twilight-agentic-workflows/api-recovery-intent.md openspec/changes/twilight-agentic-workflows/api-recovery-design.md openspec/changes/twilight-agentic-workflows/api-recovery-tasks.md openspec/changes/twilight-agentic-workflows/api-recovery-verify.md openspec/changes/twilight-agentic-workflows/specs/twilight/activity-execution/spec.md
```

The final report is `.superpowers/sdd/api-recovery-tasks/task-1-report.md`. All temporary faults are restored. Source/index/HEAD hold releases only on the explicit parent message after closeout; branch/index verification, source review and publication remain root-owned.

## Review fix 1 — I1 external observation detachment

Root reviewed checkpoint 53d50b0cab05bfe90ca879891a73a675c729f9c6 (tree 11e7c92652f616148eef0291723f90abeab3102d). I1 identified missing mandatory R5 proof for the two existing observation clones, not a demonstrated defect in the cloning implementation. No runtime behavior or public contract changes are made.

Two common cases exercise lookup and resume through mutable clones returned by the actual API adapter. Real artifact retention is held after JSON bytes have been encoded. Only then the returned reply reason is mutated to the valid generic transport_lost value. Cases independently check exact retained original bytes/JSON, preparation or complete locator, original target/checkpoint, held capacity and published/returned/persisted unsupported reasons. Both memory and actual reopened SQLite register the same cases, and actual pending retention/publication settles before fixture closure.

Fresh native baseline fix1-baseline: 4 pass, 0 fail, 62 expect calls. Independent single-source controls remove only the route-specific structuredClone in snapshotObservation:

| Capture              | Native outcome                          | Observed failure/restoration                                                                                                                                           |
| -------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fix1-lookup-fault    | exit 1; 0 pass, 2 fail, 30 expect calls | Both providers retain original unsupported JSON but publish/return/persist transport_lost. Original target/checkpoint/capacity checks pass before the reason mismatch. |
| fix1-lookup-restored | exit 0; 2 pass, 0 fail, 32 expect calls | Exact same selected provider cases green after byte-exact restoration.                                                                                                 |
| fix1-resume-fault    | exit 1; 0 pass, 2 fail, 28 expect calls | Same consequential post-retention reason mismatch for both providers.                                                                                                  |
| fix1-resume-restored | exit 0; 2 pass, 0 fail, 30 expect calls | Exact same selected provider cases green after byte-exact restoration.                                                                                                 |

Both controls restored the exact reviewed production SHA256 983c0ebf4cbd9d80b2f8f6182b897c7e5ceb552f33320b7ae17bfb95465c2d7c before the next control and before adjacent Proof comments. There were no setup/import/parser/timeouts or immediate-child signals in these controls. These prove external observation detachment under retained IO; they do not establish physical continuation, absence, quiescence, business outcomes or additional provider-fencing guarantees. Unchanged historical proof campaigns and tooling checks are not repeated or newly credited.

Local append-only evidence: fix1-checkpoint.json, fix1-production-before.ts, fix1-proof-campaign.json, fresh fix1-* native regular-FD captures, and archived fix1-proof-driver.ts/fix1-native-helper.ts. The fresh helper records the same absolute Bun SHA256, argv/cwd/necessary nonsecret environment, regular stdout/stderr, status/signal and source/restoration identities as the initial task. Complete final counts, source/runtime correspondence and release are appended after required final verification.

### I1 final verification and correspondence

The immediate child commands below each ran once with only the matching clone removed and once after exact restoration. Their capture labels and native counts are in the table above; the original unsupported bytes and original target/checkpoint/capacity assertions complete before each intentional reason-drift failure.

```sh
/home/df/.bun/bin/bun test apps/twilight-structure/twilight-dash/cli/src/runs/reconcile-api-activity.test.ts apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/reconcile-api-activity.db.test.ts -t 'detaches actual lookup reply across held artifact retention' --timeout=10000
/home/df/.bun/bin/bun test apps/twilight-structure/twilight-dash/cli/src/runs/reconcile-api-activity.test.ts apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/reconcile-api-activity.db.test.ts -t 'detaches actual resume reply across held artifact retention' --timeout=10000
```

Final relevant cohort fix1-final-regression: **466 pass, 0 fail, 1717 expect calls across five files** (56.00s). Actual uncached Dash lint fix1-final-lint exits 0 (45.3s); forced uncached Dash typecheck fix1-final-typecheck exits 0 (8.1s); changed-file formatting fix1-final-format and affected validation fix1-final-openspec exit 0. Only existing OpenSpec long-requirement warnings remain. No unchanged tooling checks, policy proofs or old source-fault campaigns were repeated.

fix1-source-map.json preserves the reviewed pre-comment production SHA256 983c0ebf4cbd9d80b2f8f6182b897c7e5ceb552f33320b7ae17bfb95465c2d7c and final adjacent-comment-only SHA256 f8f78feb04febc4b9d01e5f5319a982713ae5dead92a3387b8459bb23f4582a0. Identical normalized emitted runtime is 2f354c2a8f317a15094008f07b3681e648759a5d9c54d393719c8417103579cd. It independently verifies all six final source identities against the final regression start vector. The full accepted composition and physical-recovery limits remain unchanged. This supplies I1 evidence without retroactively crediting the initial campaigns; scoped re-review and approval remain root-owned.

## Finite reviewed component publication — 2026-11-05

The [UTF-8 packet](evidence/api-recovery-20261105.json) and [manifest](evidence/api-recovery-manifest-20261105.json) publish the component approved at commit `d22ceda62eeef60a75a2f4540cf85b5cfb578efa`, tree `1b705b8091b5e0a53e66384ca378adfca240501b`. The original workspace cutoff is 2026-11-05T04:30:41.291Z; later exact-hash source recovery is a separately dated, finite addendum. The packet freezes the pre-publication eleven-path source/R4 vector and mutable progress, initial Important I1 review, fix report and scoped approval. No original failure or surviving control is removed.

Decode each `files` entry using its `chunks[file.chunk]`: apply `gunzipSync(Buffer.from(chunk.content, 'base64'))`, then require its exact `bytes` and SHA256 before writing into a fresh scratch directory. Duplicate chunks share content, not path identity. Original scripts, reconstructed fault sources and publication tools are inert evidence: inspect their bytes; never execute them from the archive. Manifest paths identify every original source, receipt, stream, helper, driver, reconstruction and review.

The new decoder independently verified **808 files**, **732 existing-original comparisons**, 143 complete original Task 1 native families and four named root families. The actual production plaintext scanner examined every decoded readable regular file: **808 scanned, zero findings, zero unreadable files**. Required credited source/helper/driver/fault/restoration/review dependencies resolve. Any remaining historical uncredited input bindings remain named hash-only limitations in the packet and verification; they are not reconstructed by guessing.

The command map is `workspace/*.start.json` → actual argv/cwd/explicit necessary environment/prelaunch absolute Bun and helper identities; the matching `.finish.json` binds native status/signal, regular stdout/stderr hashes and descriptor closure. `root/` contains only the named plan, two integrity audits and preparation/install, baseline, initial checkpoint and fix-commit families. Root audits do not archive all ad-hoc setup probes. Publication verification captures are separately bounded after the packet cutoff; their own later scan/report/reviews/commits/push/gates remain excluded, without a recursive completeness claim.

Proof graph: `proof-campaign.json` (P01–P28), `supplement-campaign.json` (S01–S04), `lookup-proof.json` (S05), `policy-proof-campaign.json` (B01–B04), `final-timing-proofs.json` (E01/E02) and `fix1-proof-campaign.json` (I1 lookup/resume) resolve to their exact native streams and restored selectors. These are **41 control pairs, 40 observed failures and one surviving uncredited control**, not 40 or 41 independent new guards. The original diagnostic, masked, stale-query, early-throw/early-return, capacity-loss and repeated-timing limits above remain authoritative. I1 retains actual post-return mutation and independent clone removal for each route across both providers.

Source correspondence independently checks exact `d3e90e65…` → redundant-predicate removal `103ff096…` → reviewed `983c0ebf…` → comment-only final `f8f78feb…`; the last three emit identical normalized runtime `2f354c2a8f317a15094008f07b3681e648759a5d9c54d393719c8417103579cd`. Policy proof source `57b5871f…` and final `8bfe8db0…` also emit identically. All eleven archived paths equal the approved commit; the six final code identities equal the final regression receipt and current source. Later historical reconstruction is labeled with its actual method/time, not claimed as retained at invocation.

Fresh publication-only negatives remove credited I1 fault bytes, corrupt the packet hash and inject a generated scanner canary into decoded text; each native verifier exits 1 for the named fault. Exact originals remain untouched. Changed publication formatting, `git diff --check` and affected OpenSpec validation are recorded in the finite manifest transport and Task 2 report. No application test, runtime fault campaign or unchanged policy proof was replayed.

This publishes only the actual API unsupported-recovery operation. Accepted selection/executor association remains trusted composition, exact recorded retries avoid queries, and concurrent fresh queries have no election promise. Full startup composition, positive physical continuation/absence/effect/quiescence, additional durable provider/transfer acceptance and S7a/full-goal completion remain open. Original captures receive no retrofitted full-environment, Nx-descendant, post-executable-hash or version guarantees. Root retains final whole-branch review, full checks, normal commit/push, fresh PR, WBS and exact-source gates.
