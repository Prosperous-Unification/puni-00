# Main reconciliation, 2026-10-25

This local checkpoint combines feature `a3eb493a52e71dfe03949bc60f826f7b50de2b33`
with main `6fbef52a57899353ea6c1a1903ef5402347ed27f`. It does not approve feature
publication, architectural adoption, deployment or completion. PR630 remains a draft.

## Source preservation

Main contributes 48 commits across 182 paths. Eleven paths needed textual resolution;
15 files received manual reconciliation or integration corrections. The remaining
168 changed paths match Git's automatic three-way merge exactly. One manually
reviewed cleanup test remains byte-identical to the feature parent, so the net
changed-path count before this receipt is 182.

- Ordinary document11, connected12 and the lazy historical10 factory remain separate.
  Main's live-tree demand fields are omitted before file-local export demand shapes.
- Connected scheduled and unavailable trees now attach demand/catalog presentation
  from the target member's captured reads. No live reread or component-wide demand
  disclosure is introduced; document export still derives its own file-local demands.
- The backend capability endpoint references main's renamed input-refusal schema.
  Both invalid-body and invalid-query refusals remain declared400 responses.
- Cleanup retains the feature's synchronous trace and finite30-second allowance.
  Both parent policy declarations and module memberships are preserved exactly:
  full policy498 binary entries, bootstrap478, with no broader wildcard.
- Main's resource/claims UI and feature connected-dependency UI coexist. The legacy
  demand fixture uses genuine contexts bound to the current stores and transaction.

## Observed checks

All commands ran with Bun1.4.4 and the frozen lockfile in the isolated reconciliation
worktree. The lockfile and package manifests were unchanged.

| Check                                                                                 | Observed result                                             |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `bun install --frozen-lockfile`                                                       | exit0;1493 packages installed                               |
| Connected tree and legacy-demand tests                                                | 67 pass,156 assertions; independent reviewer repeated67/156 |
| Connected document shapes, cold contract memory, ordinary and connected export suites | 112 pass,319 assertions                                     |
| Scratch cleanup suite                                                                 | 8 pass,59 assertions                                        |
| Infrastructure shape suite                                                            | 3 pass,72 assertions                                        |
| Mounted route and backend capability suites                                           | 10 pass,1773 assertions                                     |
| Nine frontend/config/connected/resource/claims/writer suites                          | 447 pass;160.44s                                            |
| Core, contracts, scratch, frontend, backend, gateway and MCP TypeScript builds        | exit0                                                       |
| Changed TypeScript lint and formatting                                                | exit0; final UI lint used a generated Nx graph              |

The connected presenter regression first failed all four actual tree/treeWithin
scheduled/unavailable cases. Omitting only the production attachment reproduced all
four failures; restoring it passed4 tests/28 assertions. Three poisoned live readers
were unused, foreign/unused catalog entries were absent, and the captured packet
remained unchanged.

Narrowing only the capability endpoint's400 schema to invalid_body made the existing
production boundary audit fail with `getDependencyCapability invalid_query: null`.
Restoring the exact schema passed the same audit. An earlier infrastructure test
launched from the default checkout is excluded from this checkpoint's evidence.

## Checkpoint boundary and remaining checks

Independent Astra review approved the frozen15-file source packet with no blocking
finding, after checking parent equivalence, critical automatic callers and a fresh
67-test replay. This is source approval for a normal local checkpoint only.

Two policy comparisons passed before checkpoint. Two production pilot cases did not:
their fixture clones committed HEAD and overlays only pilot paths, so the old feature
HEAD lacks main's new workflow-binding OpenSpec directory referenced by the updated
README. This failure is not counted as a pass. The actual HEAD-bound pilot and index
checks must be replayed after a normal local commit; their fixtures/selectors and
normal hooks must remain unchanged.

Initial UI lint skipped its boundary rule without an Nx graph; the final graph-backed
lint passed without that warning. Nx used its in-process graph fallback after a
sandbox socket refusal. Local child tests needed approved sandbox escalation; their
successful exact-tree replay is the reported result. The existing Vite native-config
warning about `__dirname` remains.

The required `openspec validate --all --json` passed291 items with zero failures.
An additional strict feature validation exited1 on28 existing requirement-length
warnings. All nine feature spec hashes match the audited feature parent; no spec
body changed during reconciliation. Strict validation is not recorded as passing.

Feature-wide CI, the exact feature-head host gate, native acceptance and activation/
restoration/adoption remain unverified. The host gate for separately merged PR721
does not establish feature acceptance. No WBS note update is claimed: the connected
WBS tool was unavailable. No architectural merge or production action occurred.

## Post-checkpoint replay

Normal local checkpoint `f48cfbd913c456ea89f300dbf8ffc821e695c463` has the exact
reviewed source tree. All15 reviewed source hashes and both verification receipts
matched the frozen precommit tree; the worktree was clean. The first normal lint
hook exhausted Node's default4GB heap. With approximately12GB host memory available,
the identical full hook passed using process-local
`NODE_OPTIONS=--max-old-space-size=8192`. No hook, staged file or check was omitted.

These actual post-checkpoint commands ran from the reconciliation root with
`TOOL_WIKI_TRUSTED_NODE_MODULES` set to that root's installed `node_modules`:

```sh
bun test --preload ./tools/test/scratch/preload.ts apps/twilight-structure/twilight-burokrat/cli/src/relationships/committed-target-facts.test.ts apps/twilight-structure/twilight-burokrat/cli/src/policy/pilot-policy.test.ts --timeout=60000 -t 'matches what the static extractor reads|pins exact pre-index tuples|refuses a stale Burokrat test command'
bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD
```

The four policy/fact cases passed100 assertions in78.64s, including the actual
immutable candidate positive and stale-command negative; no fixture or selector was
changed. Working-index validation exited0 and reported40 indexes. It also reported
nonfatal review debt: the memory adapter README has52 direct entries against40.
This is recorded debt, not a zero-warning result.

Independent review rechecked the clean checkpoint, committed/working source hashes
and these actual results. Draft branch submission solely to obtain feature CI is
source-approved under standing authorization; architectural merge, adoption,
deployment and feature completion remain held. The final evidence-only commit
preserves all15 reviewed source hashes. The existing PR remains a draft, with
auto-merge disabled and its operational body unchanged.

## First integrated CI feedback

Draft head `a0ad0b34cb77febb030d12413c8066aa759b39dc` was submitted only for
verification. CI run40176150295 passed the frontend, remote and Twilight partitions
and all eight browser shards plus their aggregate. Its final conclusion is failure.
Infrastructure run40176150346 passed both fleet checks
and the k3s rehearsal. These outcomes do not close the full feature gate.
The pull-request run reports feature headA0 above, but its selected test tree is
GitHub's synthetic merge `e801b2b922f5b65dca4dc6a1b442ebb37a232d4a`, based on main
`93b6f3555ede68c08d3d83b571f1fcd15a44f37b`. That main includes the concurrently merged
admin-only resource deletion fix. CI results are attributed to that merge tree,
not to an identical local A0 source tree. Fetching main changed no checkout; an
object-only merge check against A0 was clean. The active fixture and packaging
proofs run on the explicitly identified local source and retain that boundary.

The completed backend partition reported4461 passing tests,3 skips and18 failures;
the SQLite suite in the workspace partition reported2390 passes,1 skip and3 failures.
The solver smoke also failed: its ordinary image client imported the composed test
scenario statically, but the image deliberately excludes backend testing fixtures.
The existing production bundle check independently detected that import. A bounded
packaging correction is under implementation; production exclusions, the genuine
composed scenario and the existing bundle guard remain required.

Independent Astra inspection approved bounded test-fixture reconciliation for the
remaining backend/storage failures. Existing production formats remain ordinary
document11, connected document12, ordinary saved input9 and connected saved input10.
Connected fixture headers, future-version negatives, the exact supported-version
reply, a missing second real claim and migration-specific fixture baselines need
correction. Full refusal/ordering, row and ledger assertions must remain; no format
renumbering, production guard change or timeout increase is approved by this ruling.

The remote-model partition failed two children during source-startup manifest
construction, before their intended injected faults. In an independently installed
copy pinned to this same head, both exact children passed with their original
conditions and deadlines: lost-exec-reap128 assertions/69.43s and missing-done133
assertions/67.51s. Bounded diagnostic instrumentation did not observe a scanner
failure. This local replay does not explain or clear the CI failure; no speculative
candidate fix is justified. An initial diagnostic-only restrictive umask caused a
different fixture-permission refusal and was corrected before the reported replay.

The queued feature host gate for this obsolete head was cancelled before checkout
or any tests, with exit143. It supplies no passing evidence. The separate merged
PR721 host gate continues independently and cannot establish feature acceptance.
PR630 remains draft, with auto-merge disabled; architectural merge, activation and
deployment remain held.

The bounded eight-file backend fixture correction passed the complete affected
files:273 tests/1570 assertions in89.75s. A separate selector covering all17 original
non-packaging backend failures passed17 tests/116 assertions in7.99s. Scoped lint,
format and frozen-hash checks passed. Independent Astra source review found no
blocking issue or weakened assertion and independently replayed6 cases/41 assertions
in4.72s. These are focused results, not a replacement for the next complete CI run.

The three storage fixture files passed139 tests/389 assertions in23.80s, with
scoped lint and format passing. Expected migration additions now come from the
checked on-disk name/hash set, independently of the observed database answer.
Full row/ledger equality remains. The dormant rollback baseline excludes unrelated
later migrations before its snapshot, and only the historical capture case uses
the current schema with explicit synthetic fixture authority. Deleting an actual
retained resource-provider ledger row after rollback made the unchanged complete
baseline comparison fail; restoring the fixture passed the selected test.
Independent Astra storage source review approved the frozen three-file packet and
replayed the three originally failing cases:3 passes/10 assertions in2.91s. Hashes
remained unchanged. This approval does not extend to architectural adoption or merge.

The six-file smoke packaging correction separates the fifth composed test driver
from the four ordinary image-client modes. Only the fifth invocation receives a
read-only mount containing its exact21 excluded fixtures plus that test driver;
the selected image digest and original in-image scenario are unchanged. Staging
checks regular files, readability, byte readback, exact membership and permissions,
and cleanup owns only its fresh directory. Those supplied fixture hashes describe
external test-harness bytes; they are not immutable-image or native-adoption proof.

All six frozen hashes matched. The root ignore, Dockerfile, genuine composed scenario
and existing production bundle guard remained byte-identical to HEAD. Restored
fixture/production-boundary tests passed20 cases/110 assertions in10.67s; focused
build/supplied-image staging and cleanup controls passed16 cases/119 assertions
in7.79s. Thirteen watched guard omissions failed their intended controls and were
restored. Backend TypeScript, scoped lint, formatting and ShellCheck passed. The
actual Docker smoke remains required in CI: local daemon access was denied and no
physical container success is claimed from these harness tests.
The final frozen complete harness passed91 tests/355 assertions in64.34s.
Independent Astra source review approved all six hashes without a blocking finding,
replayed20 fixture/bundle cases/110 assertions and16 smoke controls/119 assertions,
and inspected the13 omission logs. Its first smoke replay hit a sandbox Unix-socket
permission refusal; the approved exact replay passed. This approval permits a normal
draft checkpoint and further verification, not architectural merge or activation.
