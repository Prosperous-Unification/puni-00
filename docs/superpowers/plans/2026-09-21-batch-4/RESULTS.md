# Batch 4 integration results

Batch 4 applies unexpected-failure reporting at the backend, gateway and MCP boundaries, and lets Burokrat recognize compiler-bound ambient imports without requiring a physical asset or inventing a dependency edge.

| Packet                   | Behavior                                                                                                                                                                                                                    | Verification record                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 040.7                    | Unexpected backend failures retain the generic 500 response and absent Content-Type, with one sanitized correlated operator report. Modeled refusals retain their status and content.                                       | `openspec/changes/adopt-failure-reporting/verify.md`      |
| 040.9                    | Forward and resume rejections produce one sanitized report after cancellation checks. Existing WebSocket frame bytes remain exact; close, cancellation and authentication/identity refusals remain silent.                  | `openspec/changes/adopt-failure-reporting/verify.md`      |
| 040.8                    | Unexpected MCP failures return a generic tool error and occurrence reference linked to one diagnostic record. Correctable input, upstream 4xx, authentication and unknown-tool protocol errors retain their classification. | `openspec/changes/adopt-failure-reporting/verify.md`      |
| Burokrat ambient imports | Bound ambient imports need no physical asset and create no invented edge. Unresolved real imports still fail extraction; unsupported physical CSS keeps the affected rules explicitly unevaluated.                          | `openspec/changes/twilight-burokrat-kind-rules/verify.md` |

## Independent review corrections

Gateway tests originally compared Error values structurally, which accepted a distinct Error with the same message. Strict object identity now protects both forward and resume boundaries. Root independently observed the corrected check fail under the same-message substitution, restored exact bytes, and ran the focused group successfully.

MCP review likewise strengthened fetch/body-read object identity and required the production composition to preserve a non-secret diagnostic marker and emit exactly one report. Root independently duplicated the real reporter invocation, observed the production count fail at two, restored exact bytes and ran server/main tests: 24 passed, zero failed, 90 assertions.

Ambient-import review added a proof for the source-reference guard and documented how emitted declaration sites map back to bound source imports. The original first four mutation attempts lacked separate immediate green reruns; all four complete cycles were then transparently replayed on unchanged source. The verification record distinguishes original and corrected evidence. An independent full-check mutation also proved that extraction failure cannot silently become an allowed result with no unevaluated rules.

Automatic approval review rejected a temporary raw-error-disclosure fault for MCP body reading before any mutation bytes were written. A fixed synthetic refusal instead proved the missing-report behavior; the record does not claim the rejected fault executed.

## Verification

The final lane checks passed on their immutable reviewed implementation or closure baselines:

| Check                               | Observed result                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| Backend whole target                | 1,091 passed, one existing opt-in orphan-process skip, zero failures                   |
| Gateway focused / whole target      | 58 / 128 passed, zero failures                                                         |
| MCP focused / whole target          | 56 / 148 passed, zero failures; whole target 634 assertions                            |
| Observability whole target          | 28 passed, zero failures                                                               |
| Burokrat relationships / rules      | 25 / 63 passed, zero failures                                                          |
| Burokrat whole target               | 759 passed, zero failures, 6,649 assertions across 39 files                            |
| Standalone Burokrat package         | 44 passed, zero failures, 307 assertions across 6 files                                |
| Staged devsync                      | 359 passed, zero failures, 864 assertions                                              |
| Required scoped static/build checks | exit 0                                                                                 |
| OpenSpec / formatting               | all 112 validations passed; final named MCP validation and all-files formatting passed |

The backend's opt-in orphan-process case was skipped because WBS_SOLVER_ORPHAN_IMAGE was absent. Host solver-image verification remains separately required. The Burokrat relationship suite ran twice because a wrapper initially failed to expose its process status; both original and repeated processes completed successfully, and both transcripts are retained. No source changed between them.

Fresh composed checks on integrated code commit `f209df12afcb88ccd5d9ce169e2b05b0e3f406e1`
passed without changing HEAD or leaving worktree edits:

| Composed check           | Observed result                                                          |
| ------------------------ | ------------------------------------------------------------------------ |
| Shared failure reporting | 20 passed, zero failed, 56 assertions                                    |
| Observability            | 28 passed, zero failed, 66 assertions                                    |
| Backend                  | 1,091 passed, one documented opt-in skip, zero failed, 18,628 assertions |
| Gateway                  | 128 passed, zero failed, 3,567 assertions                                |
| MCP                      | 148 passed, zero failed, 634 assertions                                  |
| All-files formatting     | exit 0                                                                   |
| All OpenSpec artifacts   | 112 passed, zero failed; parsed summary assertion passed                 |

The MCP closure review also corrected two evidence overclaims: the original 500/302 fault reds
stopped at missing-report assertions before inspecting the returned body. Compound assertions now
observe reporter count, marker presence, and the exact response together. Each corrected fault
failed, restored byte-identically, and passed separately; the independent reviewer repeated the
302 fault and observed both claimed facts.

The delivery PR must record whole composed Chromium, canonical h2puni gate with its printed exact SHA, and CI gate/pixels verdicts before merge. Standalone activation-dependent lint remains a separately reported prerequisite; record its actual verdict without calling it green.

## Following work

Reviewed backend module, frontend lifetime and remaining adoption maps are planning artifacts; they do not claim DI composition or the remaining adoption is implemented. Existing runtime IDs remain immutable; the pending naming preference is still unresolved. Research shows imported JSON causes declaration-only aggregate emitSkipped even when every TypeScript source emits successfully; removing vm-lab's include does not solve it. The next Burokrat prerequisite must preserve declaration completeness and fail on actual extraction failures.

WBS updates remain queued because the saved OAuth credential expired without a refresh token. Newest-version library migrations follow all library integration, and the Swift API Guidelines sweep remains the final refactoring.
