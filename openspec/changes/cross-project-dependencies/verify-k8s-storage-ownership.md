# Kubernetes prepared storage ownership evidence

## Scope and remaining work

Base: `fbd147694f414ac8b8c0364105e601798184710a`. Isolated checkout: `/tmp/puni-b2b-ownership`.

This packet implements the smallest complete B2b primitive: a closed **prepared-only** ownership codec, strict reusable storage binding reads, GET-only backup/Flux/cluster observation, mandatory caller-owned checkpoint preparation, and conservative original-history restart validation. It does not implement the full B2b plan. There is no production release caller or second journal. Release phases and journal schema remain unchanged at 3.

Still open: conditional UID/resourceVersion suspension and ownership annotation patching; patch readback and post-patch acknowledgment on restart; exact-owned bounded Job/Pod drain; composition with a caller-stopped backend; authoritative release persistence and continuous storage interval; controller restoration; B3 semantic admission, exposure and recovery integration. Existing release recovery limitations are unchanged. No scanner, migration, rollout, down or recovery effects are added to these ports.

The checkpoint port must be wired to the enclosing authoritative release journal before a future mutator uses it. The local tests prove the coordinator waits for its callback and exercise fsync-file, rename and fsync-directory durability in the fixture. They do not claim the production release journal is connected. `inspectStorageOwner` requires a bounded caller transport; no new CLI or kubectlEffects wiring is provided.

## TDD and focused evidence

The first codec and coordinator runs exited 1 because their implementation modules were absent. Subsequent green runs exercised the real codec, coordinator and Kubernetes JSON parser through a controlled GET transport. Missing and unreadable resources are exercised separately. Preparation succeeds while backup suspension is absent/false/true and without requiring backend shutdown. Restart keeps the original token and suspension, permits resourceVersion progress and refuses changed identity/template/suspension or any existing ownership annotation.

Commands from `tools/tool-deploy`:

```sh
bun test --preload ../test/scratch/preload.ts --timeout=10000 src/k8s/storage-ownership.test.ts src/k8s/storage-controller.test.ts src/k8s/storage-fence.test.ts src/k8s/execute-adapter.test.ts src/k8s/execute.test.ts
```

Final focused run: **249 passed, 0 failed**, 693 assertions across five files (12.83s). Raw local logs and the restoring mutation runner are in `/tmp/puni-b2b-evidence`; the proof table retains the named fault/test and exit even when those scratch logs expire.

## Watched production-path faults

All 32 faults were detected. Each fault was injected independently into the actual production implementation, focused tests were run, the exact named negative failed with exit 1, and the source was restored in a `finally` block. The final unmutated run follows all mutations. Object-boundary faults check the named diagnostic: removing the parser guard can still throw a later TypeError, which does not satisfy the explicit trusted-state boundary contract. The mutation table does not claim every boundary fault would silently return evidence.

| Injected fault       | Exit | Observed failed test                                                              |
| -------------------- | ---- | --------------------------------------------------------------------------------- |
| `closed-fields`      | 1    | rejects unknown field even with resealed bytes                                    |
| `codec-object`       | 1    | malformed envelope identifies the trusted-state boundary                          |
| `codec-text`         | 1    | rejects missing owner UID even with resealed bytes                                |
| `hash-format`        | 1    | rejects invalid template hash even with resealed bytes                            |
| `fixed-source`       | 1    | rejects foreign PVC name even with resealed bytes                                 |
| `suspension`         | 1    | rejects invalid suspension even with resealed bytes                               |
| `format-stage`       | 1    | rejects unsupported format even with resealed bytes                               |
| `controller`         | 1    | rejects foreign controller even with resealed bytes                               |
| `disposition`        | 1    | rejects inconsistent disposition even with resealed bytes                         |
| `flux-binding`       | 1    | rejects missing Flux UID even with resealed bytes                                 |
| `namespace-binding`  | 1    | rejects a namespace inconsistent with its own storage even when caller repeats it |
| `digest`             | 1    | rejects altered ownership bytes and envelope                                      |
| `canonical-envelope` | 1    | corrupt prepared history refuses before a cluster call                            |
| `target`             | 1    | rejects ownership from a different transaction                                    |
| `adapter-object`     | 1    | adapter rejects malformed spec before constructing a typed observation            |
| `adapter-text`       | 1    | adapter rejects missing version before constructing a typed observation           |
| `fresh-comparison`   | 1    | resume refuses changed cluster without replacing original history                 |
| `adapter-identity`   | 1    | preparation refuses deleting backup                                               |
| `flux-suspension`    | 1    | resume refuses changed unsuspended Flux without replacing original history        |
| `adapter-kind`       | 1    | preparation refuses foreign backup kind                                           |
| `foreign-token`      | 1    | resume refuses changed foreign token without replacing original history           |
| `adapter-suspension` | 1    | adapter rejects invalid suspension before constructing a typed observation        |
| `second-read`        | 1    | rechecks observations before checkpoint and permits resourceVersion progress only |
| `checkpoint`         | 1    | checkpoints original undefined suspension before returning                        |
| `checkpoint-await`   | 1    | failed checkpoint cannot return prepared ownership                                |
| `lease-before`       | 1    | checkpoints original undefined suspension before returning                        |
| `target-dispatch`    | 1    | resume refuses changed cluster without replacing original history                 |
| `resume-validation`  | 1    | corrupt prepared history refuses before a cluster call                            |
| `lease-after-read`   | 1    | checkpoints original undefined suspension before returning                        |
| `suspension-object`  | 1    | malformed suspension identifies its trusted-state boundary                        |
| `canonical-missing`  | 1    | missing in-memory field identifies its canonical boundary                         |
| `resume-final-lease` | 1    | resume reasserts Lease before returning original-history validation               |

The initial suspension mutation survived because string `false` also tripped disposition consistency. The fixture was corrected to numeric zero, isolating the suspension type guard; the final watched suspension mutation exited 1. No timeout or unrelated test was weakened.

## Configured checks and limits

Earlier B2a evidence records 986 passes plus one failure: `first-start-adapter.test.ts` “fresh actual SQLite observation requires replay and disabled exact authority: none” exceeded its fixed 10-second timeout. Its focused retry also exceeded 10 seconds under host load 13.78. This packet preserves that risk and reruns the configured full target with a 180-second outer bound; focused success alone does not erase the earlier failed full run.

No h2puni/h4claw host gate or live k3s rehearsal was run by this packet. Disposable live validation of API defaulting, conditional patch behavior, affinity/drain timing and runtime mount enforcement remains open. The integration owner must run the isolated host gate for the integrated SHA before claiming host acceptance.

Final configured commands from the isolated checkout:

| Command                                                           | Observed outcome                                                                                                                                                                  |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run tool-deploy:test` (180s outer bound) | Exit 1: 1033 passed, 10 failed. Controlled HTTP fixtures could not listen (`EPERM`) in the sandbox.                                                                               |
| `bunx nx run tool-deploy:test` (local socket permission)          | Exit 1: 1046 passed, 1 failed. `first-start-adapter.test.ts` changed-trigger case timed out at 10147.86ms against its unchanged 10000ms bound. Full-suite acceptance remains red. |
| `NX_DAEMON=false bunx nx run tool-deploy:lint`                    | Exit 0.                                                                                                                                                                           |
| `NX_DAEMON=false bunx nx run tool-deploy:typecheck`               | Exit 0.                                                                                                                                                                           |
| `NX_DAEMON=false bunx nx run tool-deploy:build`                   | Exit 0, including its eight prerequisite tasks.                                                                                                                                   |
| `bunx openspec validate --all --json`                             | Exit 0.                                                                                                                                                                           |
| Changed-file Prettier and `git diff --check`                      | Exit 0.                                                                                                                                                                           |
| `NX_DAEMON=false bunx nx run tool-git-hooks:install`              | Exit 0; normal pre-commit, prepare-commit-msg and commit-msg hooks installed in the isolated clone.                                                                               |

The local-socket full run reached the same slow real SQLite fixture family as the earlier B2a failure, now at changed-trigger. It is not presented as a green configured suite. New ownership/controller tests and the unchanged release/adapter regression subset passed; integration acceptance still requires independent review and a green isolated host gate. No full-gate or live k3s claim is made.
