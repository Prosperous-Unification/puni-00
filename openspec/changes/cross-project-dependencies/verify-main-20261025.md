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
