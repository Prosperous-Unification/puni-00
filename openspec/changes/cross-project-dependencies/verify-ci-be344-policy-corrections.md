# be344 CI: exact policy corrections and bounded synchronization diagnostics

The completed workspace/Twilight jobs of CI run 40869279277 failed on the exact
feature tree at `be344d9afaca6bf6c065fb54dcfd5a37900e2f24`. Its synthetic merge
`cf58798618bd642097ffcf119b42ed17a6658b02` has the same tree,
`58c52ae0ad0c8561cb6b1c57db7b45419b2225eb`; the main parent was already an
ancestor. The corpus digest owner passed in that run. No digest update or
additional main-union correction belongs to this packet.

Actual job logs, uploaded Nx ZIPs and primary-source diagnosis are sealed under
`/tmp/puni-be344-ci-failures-20261029/`. The diagnosis hashes to
`0d74fb9d6df4263e4e0a2ec6ddd49785a4239efcd93907a6aaabf00b83a3f820`;
its manifest hashes to
`e8b7d3c38ec483219b6902e50887caa083d900c618e77adbac6d908ad972f6c5`.
The independent finite policy decision is
`/tmp/puni-be344-ci-policy-independent-decision-20261029.md`, SHA256
`8fa67c68138d8fa9902fb136e809d9b5c59a04e13959b915f3e8e862d7d7b2be`.

## Exact health test graph attribution

The graph owner independently rejected the previously approved actual-backend
producer test's `tool-remote-scripts` → `wbs-be-01` edge. Its existing test-only
lint exception did not excuse this oracle. The oracle now requires the actual
edge to be static and the actual Nx file map to name exactly
`tools/tool-remote-scripts/src/lib/dependency-participant-health.test.ts`.
Missing attribution, another importer or an implicit edge refuses. Neither
product tags nor the broad edge/alias allowlists changed, and the actual typed
producer integration test remains intact.

The existing actual graph owner first passed after this correction. Two real
input faults then reached the new assertions:

| Actual fault                                                       | Intended observed refusal                                  | Exact restoration |
| ------------------------------------------------------------------ | ---------------------------------------------------------- | ----------------- |
| Additional production `.ts` importer of backend producer           | Sole-file equality received the additional production path | Same owner passed |
| Manifest implicit dependency while legitimate health test remained | Edge-kind assertion received `implicit`, expected `static` | Same owner passed |

The temporary production file was removed and the project manifest's saved bytes
were restored exactly after each fault. The manifest SHA256 is
`a98f1652972d54fd80ddcab5da14f06ab4207676800ea5b0b604256dd047f955`.
No implicit-edge exception was inferred from the valid test importer.
Adjacent Proof comments were added only after these actual failures.

Driver, commands and exact restoration receipts:
`/tmp/puni-be344-ci-policy-corrections-20261029/graph-proofs.py` and
`graph-proofs.json`; raw logs are
`graph-{extra-production-importer,implicit-edge}-{red,restored}.log` there.
Final post-comment/format actual graph owner: **one pass, four assertions**,
`graph-final.log` (terminal `0851e6`, exit 0).

```sh
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bun test tools/tool-devsync/src/workspace-projects.test.ts -t 'is satisfiable by every internal dependency in the actual repository graph' --preload ./tools/test/scratch/preload.ts --timeout=30000
```

## Six exact retained tuples across the two shipped policies

Before changing either policy, six new owning cases copied the original archived
bytes into committed fixture repositories and invoked the production
`classify-candidate` CLI consumer: three exact retained snapshot paths under
`source-role-observer/baseline` × `policy.json` and `bootstrap-policy.json`.
All six failed at the intended multiple-match refusal: **zero pass, six fail,
42 assertions**, `classification-red.log` (terminal `f10b52`, exit 1).

Both shipped policies add only `kind: path` exclusions from competing rules:

- Fixture excludes `tools/tool-remote-scripts/src/fixtures/product-readiness-byte-transport.ts.txt` and `tools/tool-remote-scripts/src/fixtures/source-role-process.ts.txt` under that retained baseline prefix.
- Test excludes `tools/tool-remote-scripts/test/source-role-process-model-child.test.ts.txt` under the same prefix.

All three paths remain ordinary OpenSpec content. The classifier's strict
zero/multiple-match refusals, OpenSpec selector, archive paths, bytes, manifests
and historical claims are unchanged. Each successful case checks exact original
mode, path, Git blob and `openspec` class. Original blob pins are respectively
`01a81c963b54de4f02404608decdf914d06f2bf6`,
`3967718006f049e2983530cbc92f99c17bb09425` and
`fe4bb3ab18ff5fba8e43158fb3493d7ea2c29a3e`.

For each shipped policy, a same-byte unlisted neighboring fixture archive still
refuses exactly two matching rules. Actual active fixture/test source bytes
retain their fixture/test classifications. Existing unknown-content and
ambiguous-content owners also pass unchanged. The exact before/after tuple
cases supply breakability evidence for the declaration changes; no broad
omission campaign was added.

Final post-comment/format selection: **ten pass, 100 assertions**,
`classification-final.log` (session 12941 joined at terminal `50732a`, exit 0).
The bounded scenario is recorded in the existing
`twilight-burokrat-rule-model` inventory-classification requirement.

```sh
bun test apps/twilight-structure/twilight-burokrat/cli/src/inventory/classification.test.ts -t 'classifies exact retained source snapshot|retained source snapshot boundary|refuses an ordinary path that matches' --preload ./tools/test/scratch/preload.ts --timeout=60000
```

## Previously masked pilot semantics reached their own consumers

The actual CI pilot positive and ten semantic negatives had all stopped at the
same early archived-fixture classification refusal. The exact eleven affected
cases now pass through the real committed-candidate/external-trust CLI fixture:
**11 pass, 13 filtered, 218 assertions, 146.67 seconds**,
`pilot-affected.log` (session 48736 joined at terminal `cc9a97`, exit 0).
Every case retained its original 60000ms ceiling and original assertion/golden.
The scratch cleanup hook returned. The complete literal selector/command is
retained in the final private handoff; no other pilot cases or package campaign
were run.

## Synchronization causes remain unproved

A separately authorized single local diagnostic run of each remaining CI owner
passed without changing readiness/marker timing, production guards or expected
outcomes. Minimal test-only observations were saved privately and both files
were then restored to exact original bytes:

- SQLite: one test, three assertions; worker opened at about 11ms, original readiness consumer saw one at about 2087ms within the unchanged five-second window, then production returned `node_done`. Logical worker close was observed and joined, followed by original owning Bun process/stdout/stderr join. The 30-second owner bound stayed intact.
- Cutover: one test, five assertions; original restore child exited zero with its actual report. Its unchanged 50ms shell marker producer exited/closed zero with both pipe closures observed. The enclosing child/test process and readers joined under the original 10-second owner bound.

The initial diagnostic selector accidentally included Bun's display separator
and collected zero tests; that collector-only failure was retained, and the
corrected unique literal title selected one actual case. No actual diagnostic
case was repeated. Diagnostic listeners can perturb timing, so these local
passes do not establish the cause or absence of the original CI failures.

Private diagnostic summary:
`/tmp/puni-be344-sync-diagnostics-20261029/summary.md`, SHA256
`de324d8ad3a6e285f49330cc465b2d23c71674e6eceae6fefb69ef54f155eae7`;
manifest SHA256
`a15acfd821e85db2f30bb7783db533a7be96563c2a1d594d872f1e048956739f`.
The whole owning Bun process was reaped; Bun's logical worker close event alone
was not treated as full thread exit. No synchronization fix, timeout increase,
extra repetition or CPU/native campaign is claimed.

## Scoped checks and limits

Both owning spec compilers passed with no diagnostics:

```sh
bunx tsc --project tools/tool-devsync/tsconfig.spec.json --noEmit --pretty false
bunx tsc --project apps/twilight-structure/twilight-burokrat/cli/tsconfig.spec.json --noEmit --pretty false
```

Receipts: `devsync-spec-compiler.log` (terminal `03cc23`, exit 0) and
`burokrat-spec-compiler.log` (session 44501 joined `e620e4`, exit 0).
Scoped ESLint of the two changed spec files passed (`lint.log`, session 1720
joined `8eae19`, exit 0). Both owning OpenSpec changes validated: one item each,
zero failed; cross-project validation retains its existing long-requirement
warnings (`openspec-rule-model.log`, `openspec-cross-project.log`, terminals
`f414ad`/`9bcd5a`, exit 0).

Final owned-file formatting, whitespace checks, exact semantic JSON comparison,
archive-byte preservation and frozen source pins are retained in
`/tmp/puni-be344-ci-policy-corrections-20261029/` and its final handoff.
All original diagnostic/proof/test sessions joined. No source-worktree Git mutation was performed
by the implementer, and no other worktree or fixed port was used.

This packet corrects only the two reviewed policy mismatches. It does not fix
or explain the two synchronization CI failures, establish full CI success,
qualify an installed/native/source-image topology, complete participant
restoration, authorize main adoption or deploy. Root owns normal source
integration, independent review and subsequent CI/gates.
