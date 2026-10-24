# Connected publication domain handoff — 2026-10-22

Worktree: `/tmp/puni-cross-publication`, base `bc9ca9b0d`, branch `feat/cross-project-publication`. Source is frozen for independent review. Only these two untracked domain files changed; no Git metadata, barrel, scheduler, wire, WBS, or documentation files were edited:

| Path                                                       | SHA-256                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `libs/wbs/domain/domain/src/connected-publication.ts`      | `c8a449c5aba117e1f86b210219dcae5e3f69865fa7369b2e91947bdf9ec11d49` |
| `libs/wbs/domain/domain/src/connected-publication.test.ts` | `471afc29db18accb3d5afbf6c9e04211eb8cccc815825b23c700ae1997acec42` |

The new public seam exports `ConnectedStageEvidenceError`, `ConnectedPublicationDecision`, `replayConnectedStage`, and `guardConnectedPublication` from the new file. Root owns barrel exports. It canonicalizes trusted stage structure, replays all captured pins through actual `scheduleResolved`, demands exact full baseline start/finish evidence, replaces only validated local pins, replays the complete component, refuses exact foreign drift, enforces local effective deadlines, and scores project-local Time/PRI/movement with local dense priorities and supplied real movement reference. Baseline lateness is allowed; only candidate lateness is refused. The chosen schedule and baseline retain the full component.

Real-engine tests: 43 new cases cover fractional A→B→C and cumulative width-three tiling, full incoming/outgoing later-step FS/SS/FF (including zero endpoints), four expanded parent relationship pairs, shared and isolated people, project-local team/resource contention, elsewhere booking, manual and inherited fractional floors, malformed stage/candidate/reference sets and values, exact foreign reconciliation, positive/all-zero/inside-positive deadline semantics, inherited and fractional deadlines, local Time/PRI scoring (including inherited and absent priorities), and a later rank composite based on an earlier accepted replacement. Input maps remain unchanged on success and refusal.

Observed production-path mutation failures, restored to green:

| Removed/altered check                           | Observed semantic failure                                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Canonical stage validation                      | Invalid capacity mode replayed instead of `ConnectedStageEvidenceError`.                                        |
| Empty local set                                 | Stage with no B-owned slice replayed.                                                                           |
| Captured start equality                         | One-ulp C pin reconciled by scheduler and was accepted as captured truth.                                       |
| Captured finish equality                        | One-ulp forged A finish was accepted as captured truth.                                                         |
| Candidate local-map validation                  | Missing local candidate reused its baseline pin and returned a decision.                                        |
| Reference validation                            | Negative reference `-1` returned a movement score.                                                              |
| Authored edges in candidate replay              | Later-step B at 0.1 ahead of foreign FS predecessor was published.                                              |
| Candidate pins (switch to unpinned Fast)        | Local candidate makespan 4 was reported as 1.                                                                   |
| Local deadline invocation                       | Candidate finish at day 2 against deadline 0 returned a decision.                                               |
| Local-slice score filtering                     | Valid long-foreign-task scoring threw for a foreign key absent from the required local-only movement reference. |
| Local priority rank scope                       | Foreign lower-priority row changed local PRI from 1.2 to 2.4.                                                   |
| Strict `>` primary comparison (mutated to `>=`) | Equal-primary real replay chose baseline instead of optimized.                                                  |
| Finite score guard                              | Two individually finite `Number.MAX_VALUE` references published `Infinity` movement.                            |

Foreign candidate comparisons were tested separately. A real sub-drift fixture pins foreign C at `1.200000002`, then proposes B at `0.2000000015`; scheduler reconciles C to `1.2000000015` and changes its finish. Removing the foreign-start comparison alone changed the refusal to `foreign finish changed` (diagnostic failure). Removing both comparisons returned a decision (semantic failure). Removing foreign-finish alone left the exact-start and forged-capture negatives green. With deterministic immutable input, exact foreign start and exact baseline finish already determine the foreign finish. The finish comparison is retained as a defense against engine changes; it is **not** claimed to have an independent reachable mutation negative. No fake scheduler callback or second leveller was introduced.

Final checks, fresh after last production edit:

- `NX_DAEMON=false bunx nx run wbs-domain:test --skip-nx-cache`: exit 0; 1,374 pass, 1 preexisting performance test skipped, 0 fail, across 92 files.
- `NX_DAEMON=false bunx nx run wbs-domain:typecheck --skip-nx-cache`: exit 0.
- `NX_DAEMON=false bunx nx run wbs-domain:lint --skip-nx-cache`: exit 0.
- `bunx prettier --check libs/wbs/domain/domain/src/connected-publication.ts libs/wbs/domain/domain/src/connected-publication.test.ts`: exit 0.
- `NX_DAEMON=false bunx nx show project wbs-domain --json`: exit 0; project graph target read succeeded.
- `git status --short`: exactly the two untracked files above. No commit was made.

Not run in this lane: h2/h4 full gate, build, deployment, schema/Python checks, external optimizer, durable publication, cross-package integration, barrel consumers, OpenSpec validation. Root owns integrated checks and activation. Nx reported sandbox denial for its optional plugin-worker Unix socket, then executed the named targets in its main process with successful exit codes.
