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
