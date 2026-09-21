# Batch 2: what landed, what stopped, what only the planner's runs caught

Recorded 2026-09-20. Batch 2 ran the same pipeline as batch 1 (`../2026-09-19-batch-1/README.md`): each packet was written and reviewed, executed slice by slice by a sandboxed medium-effort executor, reviewed and committed by the planner, merged, and sent through the host gate and CI. This record is for the next batch's authors: read "What the executors stopped on" and "What only the planner's runs caught" before writing a packet.

## What landed

| Work item                                                                               | Packet                          | Landed as                             |
| --------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------- |
| Estimate cell at rest: the result is the main reading, the trio recedes                 | `u1-estimate-cell-at-rest.md`   | its own pull request, before the rest |
| 110.6 Retire the upstream sync; derive the README coverage check                        | `110-6-retire-upstream-sync.md` | first group                           |
| 020.2 Shared failure reporting, `@shared/failures`                                      | `020-2-shared-failures.md`      | first group                           |
| 040.1 The three owner libraries bundle for, and run in, Chromium                        | `040-1-chromium-proof.md`       | first group                           |
| 020.7 Backend startup ownership under one DI Bag                                        | `020-7-backend-startup.md`      | first group                           |
| 010.7 Twilight Burokrat kind rules: ratchet's adopted set, F7, MOD-LAYOUT, K2 to K6, F1 | `010-7-rules.md`                | first group                           |
| 040.4 The plan feed module                                                              | `040-4-plan-feed.md`            | first group                           |
| 110.1 Test axes: level targets, JUnit reports, scenario citations on one capability     | `110-1-test-axes.md`            | second group                          |
| 010.6 Twilight Burokrat templates and `template verify`                                 | `010-6-templates.md`            | second group                          |

Forty-odd executor attempts ran; the ledger and every attempt's report, diff and evidence are kept beside the planning files, not in this repository.

## What the executors stopped on

Each of these was a packet defect or an environment fact, not a code defect. Each now has a standing rule in the executor's preamble or a line in the author brief.

| Stop                                                             | Cause                                                                                                                                      | What changed                                                                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 010.7 part A stopped at lint                                     | An import added out of sort order: one autofixable `simple-import-sort` error                                                              | Preamble rule 17: an autofixable ordering or formatting lint error is fixed with `bunx eslint --fix`, not a stop         |
| 020.2 slice C stopped on "0 tests ran"                           | The executor's own `-t` filter contained the `>` that Bun prints between a describe and a title                                            | Rule 18: never put it in a filter; prefer the title alone; a zero match from a self-composed filter is corrected once    |
| 040.1 slice 1 stopped on `NX Recursive task invocation detected` | The lint target takes about 47 seconds, outlived the tool's wait, and was started a second time while the first was alive                  | Rule 19: a command that outlives the wait is still running; poll it; start slow targets under a status-recording wrapper |
| 020.7 slice A stopped at OpenSpec validation                     | The packet's prescribed delta specification had scenarios and no normative sentence under its requirement headings                         | Author brief: validate the exact specification text in the rehearsal                                                     |
| 010.7 part D stopped on a matcher's wording                      | The fault failed the named test for the right reason, but the executor's test used `toEqual` where the rehearsal's had used `toHaveLength` | Rule 20: a proof is a fact, not a matcher's wording                                                                      |
| 110.1 slice B stopped twice on fault B-9                         | The fault named a `cwd` line that occurs twice in one JSON file; both attempts patched the first                                           | Author brief: name the function and exact expression, or prescribe a structural edit such as a JSON path                 |
| Seeded evidence found one directory too deep                     | The launcher's seed copy nested a directory onto an existing one                                                                           | The launcher merges a seed into its target                                                                               |

The same rule 20 later did its other job: twice an executor's mutation left the named test passing, and instead of stopping it restored, checked the location, redid the fault once and kept both runs as evidence.

## What only the planner's runs caught

The sandbox cannot build the package, run a browser, bind a port without network access, or write Git objects. These were invisible to every executor and were found by the planner's whole-suite, packaged-build, Chromium and host runs.

- **A newly registered rule breaks the packaged-build test.** A rule policy owes every registered rule a mode, and `apps/wiki/cli/src/packaging/build.test.ts` writes its own policy. Registering F7 failed it on `rule policy states no mode for F7`. Every later part added its rules there.
- **Two hand-moved pins serialise parallel lanes.** The workspace inventory's row and file counts and the line-sensitive namespacing digest were re-pinned six times in one day, and conflicted at both integrations. While two files were unmerged in the index the digest test even reported four extra occurrences, because a conflicted path is listed once per stage. Deriving both is scheduled as its own work item; 110.6 already did it for the README count, and no lane had to touch that one again.
- **A committed specification contradicted an installed library.** The backend startup change said a second `stop()` resolves; the installed di-bag replays the first close's outcome, cleanup error included, without running a disposer again. The specification was corrected before the code was written.
- **A hand-written parser kept manufacturing passing results.** Three reviews of a hand-written JUnit reader each found malformed XML that became a passing citation (a namespaced failure element, a test case nested inside a failure, a suite hidden inside an outcome element). The reader was rebuilt on `saxes`, a strict parser already locked through jsdom, keeping only structural rules with one negative each.
- **The host gate did not install dependencies.** Its tree's `node_modules` predated batch 1, so every host gate since then ran on stale dependencies and passed only because nothing executed there imported the new libraries. The first group's gate failed on `Could not resolve: "di-bag"`; the planner installed by hand and re-ran it. Making the gate install is scheduled as its own work item.
- **A flaky wait in an unrelated test** failed CI once: two spawned workers had about five seconds to become ready. It is now a twenty second deadline, still bounded.
- **Records are published.** Executors wrote absolute temporary and clone paths into `verify.md`; the planner replaced them with evidence basenames before every commit, and the author brief now says so.

## How each slice was verified

For every slice the planner read the report and the diff, replayed at least one injected fault outside the sandbox and saw the named test fail with the recorded fact, restored the file byte for byte, ran what the sandbox cannot (whole targets, the packaged-build test, the level targets with their reports, Chromium on isolated ports), and only then committed. Later slices of a packet got their own dispatch review against the code the earlier slices had actually left; most came back "dispatch after fixes", and each fix was rehearsed before the slice ran.

## Not done here

- The browser fixture for `@shared/failures` (020.2 left it unassigned; 040.1 proves the three libraries and never imports the shared module).
- Adoption of failure reporting in the backend, the gateway, the MCP server and the frontend: later work items.
- The test-axes coverage command reports an uncovered scenario and exits zero by design in this increment.
- The staffed step cell with a fractional result still clips its trio at rest (16 pixels, down from 28): its own work item.
