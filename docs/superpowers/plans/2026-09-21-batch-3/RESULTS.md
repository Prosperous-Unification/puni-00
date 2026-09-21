# Batch 3 integration results

Batch 3 fixes the shared gate's dependency installation, removes two hand-maintained devsync
expectations, adopts diagnostic failure records in logging, clips the estimate trio within its
cell, extracts calendar-marker command services, and protects frontend fault disclosures.

| Packet | Outcome                                                                                                                                                                                                                                                  | Verification record                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| G1     | The host gate installs the target commit's frozen lockfile under the gate lock before validation. An install failure prevents later checks.                                                                                                              | `openspec/changes/host-gate-locked-install/verify.md` |
| G2     | Independent configuration discovery supplies expected inventory tuples; the legacy-root digest no longer depends on source line numbers. Collector omissions and classification changes remain detectable.                                               | `openspec/changes/derive-devsync-pins/verify.md`      |
| 040.5  | Pino emits sanitized diagnostic failure reports or a visible reporting loss, preserves explicitly logged undefined failures, and reuses only registered reporting outcomes.                                                                              | `openspec/changes/log-failure-records/verify.md`      |
| U2     | The quiet three-point estimate text clips with an ellipsis while the staffed estimate and assignee remain visible.                                                                                                                                       | `openspec/changes/estimate-trio-ellipsis/verify.md`   |
| 050.6  | Calendar-marker gestures use feature/resource services with the existing reader ownership, refusal announcement, and marker-only invalidation behavior.                                                                                                  | Packet 050.6 and the integrated checks below          |
| 050.4  | The app and chart boundaries disclose only approved public sentences and an occurrence reference. Root callbacks prevent React from separately exposing raw caught faults. Browser execution proves no raw DOM/console disclosure or unexpected request. | `openspec/changes/adopt-failure-reporting/verify.md`  |

## Review correction

Independent review found that the extracted calendar-marker feature and resource lacked the K9
declarations required by the shipped service templates. The packet's code omitted them despite
naming service taxonomy as its architectural authority. Canonical template verification failed
both files. The correction adds `@capability plan-refresh` and `@term calendar-marker` beside
their exported factories; both committed template checks then returned `conforms: true` with
no findings. This changes metadata only and preserves the existing glossary and capability.

The frontend review also corrected an overbroad JSDoc claim: the chart boundary intentionally
permits the validated own string message of a `GanttDataError`. Its runtime behavior was already
correct; the source comment and packet now describe that exception accurately.

## Resumed execution

The G2 D attempt had returned with three uncommitted files. Its diff was reviewed, mutation
evidence replayed, and D committed before E ran. The interrupted 050.6 slice-5 attempt left only
its intended proof comments; a fresh resource-invalidation mutation failed the named assertion,
then byte-identical restoration and the complete scoped module suite passed.

G2's final whole devsync target passed 359 tests across 25 files. Its final six inventory faults
failed and were restored byte-identically. Independent review approved both G2 and 050.6 after
the K9 correction. Per-lane totals describe those lane commits, not the eventual merged tree.

## Integration verification

Fresh uncached checks on integrated code commit `6962f0cd` passed:

| Check                                         | Observed result                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Whole `tool-devsync:test`                     | 359 passed, 0 failed, 25 files                                                                                                        |
| Frontend node tier                            | 634 passed, 44 files; unchanged from integration baseline                                                                             |
| Frontend DOM tier, UTC                        | 2,896 passed, 121 files; exactly 14 tests and 1 file above baseline                                                                   |
| Frontend zoned tier                           | 3 passed, 2 files; unchanged                                                                                                          |
| `nx format:check --all`                       | exit 0                                                                                                                                |
| Strict OpenSpec validation                    | 112 passed, 0 failed                                                                                                                  |
| Independent N17 replay on the integrated tree | Removing the root caught-error handler exposed the fixture email in Chromium; restoration was byte-identical and the case then passed |

The frontend lane's final paired Chromium cases passed 2/2. N16–N19 and the chunk-count fault
each failed at the intended assertion, restored byte-identically, and passed after restoration.
The command-service lane's whole Chromium run passed 377 cases with 40 intentional skips:
one existing Gantt fixme, 36 opt-in rendering baselines, and three opt-in scroll probes. That
lane's full PTY transcript was not retained; its final exit and structured report were retained.
These per-lane browser totals do not claim the complete composed browser gate.

The specification closure after `6962f0cd` changes only the reporting task/evidence documents.
The delivery PR records the subsequent whole composed Chromium run, exact-commit h2puni gate
(including its printed SHA), and CI gate/pixels verdicts. All must pass before merge. The
standalone Bureaucrat lint job has a separately recorded unpublished-package prerequisite;
its actual verdict must remain visible in the PR.

Independent review approved the complete production diff through the root handlers and then
the browser helper/fixture separately. The root reviewed the final two-file closure: only
frontend tasks 3.1 and 4.1 close; backend/MCP task 2.1 remains open.

## Outstanding delivery

The WBS progress batch has not been sent from this continuation: the saved session expired and
has no refresh token. Login renewal was requested; the prepared batch remains queued. Newest-version library migrations remain after all library integration work; the
Swift API Design Guidelines sweep remains the final refactoring.
