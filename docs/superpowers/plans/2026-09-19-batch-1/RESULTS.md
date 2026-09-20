# Batch 1 results

Recorded 2026-09-20. Status: **batch concluded, locally verified, and the host gate passed on `49c5cfab`**, the batch merged with main (two earlier runs each failed on one test this batch had pushed to its time limit, fixed since). Nine packets are merged on the local branch `batch-1/integration`; one packet is held. Nothing was pushed, published, merged to main or deployed.

This page reports what was observed. The plan is the [batch README](README.md); the decisions taken without asking are in [ASSUMPTIONS.md](ASSUMPTIONS.md). Attempt reports, mutation patches and failing output are kept outside the repository, in the planner's working directory beside it, under `puni-plan/exec/logs/<attempt>/`, with one line per event in `puni-plan/exec/ledger.jsonl`.

## What landed

| Work item | Result                                                                                                                                                                                                                                                                                                                       | Attempts |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 010.5     | The Twilight Bureaucrat package installs `twib` beside `twilight-bureaucrat`; the install test spawns both launchers.                                                                                                                                                                                                        | 1        |
| 020.1     | `di-bag` 0.4.0, `application-exception` 0.5.0 and `caught-object-report-json` 11.0.1 pinned exactly at the root, with a test for the pins and one for a single resolved copy of the report library. The adoption plan is rewritten against the released versions.                                                            | 1        |
| 010.3     | ADR 0029, five glossary terms, and two proposed OpenSpec changes: `service-taxonomy` (19 requirements, 45 scenarios) and `test-axes` (14 requirements, 25 scenarios).                                                                                                                                                        | 2        |
| 040.3     | The plan gesture policy moved out of `use-plan-read.ts` into a framework-free plan writer module; the hook builds it once and delegates.                                                                                                                                                                                     | 5        |
| 010.4     | Twilight Bureaucrat gains a rule model, a registry of four rules, `explain`, a rule policy read through the trusted-input boundary, `check` with a verdict that never certifies, the four adapters proven end to end, and both commands routed through the built executable.                                                 | 5        |
| 110.5     | The current Twilight documents name the owning tool: Twilight Navigator plans, Twilight Dash runs, Twilight Bureaucrat verifies, Vesper Shipyards is the product. ADRs 0027 and 0028 gain a dated ownership line.                                                                                                            | 4        |
| 020.8     | `docs/code-organization/kinds.json` classifies all 95 backend service files (11 features, 3 repositories, 9 resources, 72 support, of which 36 are re-export shims), and four tests hold the inventory complete against the real repository.                                                                                 | 7        |
| 040.6     | The directory page reads one snapshot from a directory resource service and sends its gestures to a directory-management feature service. 344 lines left the page.                                                                                                                                                           | 2        |
| 040.6b    | Every browser storage key sits behind the preferences module; one repository adapter is the only non-test code that calls `localStorage`.                                                                                                                                                                                    | 3        |
| 060.1     | **Held.** It needs a container daemon, whose authority no working directory confines, so its experiment has to run in a disposable environment, not in an executor's sandbox. Its desk research stands. Its one open decision is settled: Dany decided on 2026-09-20 that running software written for Node on Node is fine. | 0        |

Executors were Codex `gpt-5.6-sol` at medium effort, one at a time, each in its own clone and sandbox. The planner reviewed every diff, replayed at least one injected fault per packet, ran the checks the sandbox cannot, committed with hooks on, and merged.

## Verification on the final commit

Run once on a clean checkout of `b4188ec3`, the integration head, outside the executor sandbox.

| Step                                                                                | Result                                                                                                                                       |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict OpenSpec validation                                                          | 99 of 99 passed. 95 on main, plus `twilight-bureaucrat-short-command`, `service-taxonomy`, `test-axes` and `twilight-bureaucrat-rule-model`. |
| `nx format:check --all`                                                             | Exit 0.                                                                                                                                      |
| `test`, `lint`, `typecheck`, `build` for every project but the Bureaucrat, uncached | 113 of 114 tasks passed. `wbs-solver-py:test` failed: see below.                                                                             |
| Twilight Bureaucrat: `typecheck`, `lint:source`, `build`, `test`, `test:package`    | All exit 0; `test` 679 pass, `test:package` 44 pass.                                                                                         |
| Frontend browser suite, `wbs-fe-01:e2e`                                             | 374 passed, 37 skipped, 17.3 minutes.                                                                                                        |

### The host gate

Run on h2puni from a Git bundle sent over SSH, not through GitHub; `bin/h2puni-gate.sh` did the checkout under the heavy lock.

| Run | Commit     | Result                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `fd0a777c` | **Exit 1.** `h2puni gate: running on fd0a777c5136add31c3405291200502d43f6e399`. OpenSpec and all 34 projects' `test`, `lint`, `typecheck` and `build` passed, the Python solver tests included. `twilight-bureaucrat:test` failed 678 to 1: a test this batch added ran the production CLI five times in sequence and hit Bun's 5 second default at 5025 ms on the loaded host. |
| 2   | `6484986e` | **Exit 0.** `h2puni gate: running on 6484986e5425da2df5140c81b2b38fbb12bdd9a1`. OpenSpec; all 34 projects' `test`, `lint`, `typecheck` and `build`; Twilight Bureaucrat's `test`, `typecheck` and `build`, then `lint:source`; the launcher check (3 pass); and `wbs-be-01:solver-image-smoke`.                                                                                 |
| 3   | `d748f1a7` | **Exit 1.** The branch merged with main's eight new commits. Everything passed except one Twilight Bureaucrat test, `builds the canonical executable for use outside the repository`, which timed out at 20.04 s under its 20-second limit; it had taken 19.46 s in run 1, after this batch added five runs of the built binary to it.                                          |
| 4   | `49c5cfab` | **Exit 0.** `h2puni gate: running on 49c5cfab5492d20759f7fe0adfe9ae41968b6049`. That test now has three times its observed duration as its limit. All steps passed, the solver image smoke included.                                                                                                                                                                            |

The failing test now carries an explicit timeout and a `Proof:` comment naming that run, as `src/cli.test.ts` already does for the same cause; a sibling that took 3.4 seconds on the host has one too. No assertion changed. Run 4 is the gate on what merges: the batch, main as of 2026-09-20, and both timing fixes. The commits after `49c5cfab` change documents only. The run also showed that 24 other Twilight Bureaucrat tests take between 3.5 and 4.94 seconds on that host under Bun's 5-second default; the follow-up branch raises the default for the suites that load the shared test preload.

Whole-target totals against main: `tool-devsync:test` 267 to 284; `twilight-bureaucrat:test` 662 to 679; `wbs-fe-01:test:unit` 34 files and 554 tests to 40 and 595; `wbs-fe-01:test` under UTC 107 files and 2781 tests to 114 and 2826, and under Auckland unchanged at 2 files and 3 tests.

**Not verified.**

- `bin/h2puni-gate.sh <sha>`: the first run failed on one timed-out test, fixed since; see "The host gate" above for the latest run.
- Nothing else in the all-projects step: `wbs-solver-py:test`, which this machine could not run at first for want of Python `ortools` and `jsonschema`, passed on h2puni in the gate and then here (213 tests) from a virtual environment built from the project's hash-verified lock.
- A Twilight Bureaucrat activation provisioned outside a clone. The new source files change the validator identity, so such an activation has to be prepared again; no test pins the identity as a literal.
- The classification in `kinds.json` is judgement. Every rationale was read and two entries were changed after checking importers, but no test can prove a kind is right.

## What it cost

The executor tool's printed "tokens used", summed over every attempt of a work item (Codex `gpt-5.6-sol`, medium effort). That figure is **uncached input plus output only**: the executor's own session records show about 194 million tokens processed for the batch in all, 97 percent of them cached input. Planning, the Codex reviews and the planner's own verification are in neither figure.

| Work item        | Attempts | "Tokens used" |
| ---------------- | -------- | ------------- |
| 010.5            | 1        | 168,731       |
| 020.1            | 1        | 178,720       |
| 010.3            | 2        | 348,973       |
| 040.3            | 5        | 539,452       |
| 110.5            | 4        | 657,790       |
| 010.4            | 5        | 914,392       |
| 040.6 and 040.6b | 5        | 964,458       |
| 020.8            | 7        | 1,186,639     |
| **Total**        | **30**   | **4,959,155** |

## Two results that look like regressions and are not

**Thirteen tests fail under `CLAUDECODE=1`, on main as well.** The first run of the all-projects step failed `wbs-store-memory:test` (6), `wbs-store-sqlite:test` (6) and `wbs-mcp-01:test` (1). The same three targets fail identically on main's `1eeacb0b`. The planner's shell sets `CLAUDECODE=1`, under which Bun 1.4.2 prints terser test output, and those tests spawn an inner `bun test` and assert on its full output. With the variable removed all three pass (113, 764 and 125 tests), and the rerun of the whole step is the 113 of 114 above. Anyone verifying from an agent's shell should run `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx ...`.

**One Twilight Bureaucrat test is sensitive to load.** `rejects absent, unreadable and malformed graph inputs without a default` in `src/evidence/artifacts.test.ts` hit its 5 second timeout once, while two other suites were running on the machine. Alone the file passes 9 of 9 in 19 seconds, and the whole target passed on the rerun and again in the final matrix. The batch does not touch that file.

## What the executors stopped on

Thirty attempts. Two died when the model was at capacity and were rerun from the same base. Six stopped correctly on a defect in the packet, not in the repository; each was fixed in the packet, and the recurring ones in the batch README or the executor preamble:

- Node may not spawn `bun` inside the sandbox (`spawnSync bun EPERM`), so `wbs-fe-01:test:unit` and `wbs-fe-01:test` cannot pass there. Executors run the unit tier without the two spawning files; the planner runs the whole targets outside.
- A stop condition treated a fault that failed one test more than it named as a stop. Twice, in 040.3 and 040.6b. The named test failing with the named message is the proof; extra failures are recorded.
- A preparation block pointed Bun's cache at an empty directory, hiding the OpenSpec command the launcher had installed, so an offline attempt tried to download it.
- The sandbox's command guard rejects any command containing `rm -f`, which every copy of the standard OpenSpec block ended with. The block now keeps its report as evidence.
- A hand-over expected three changed paths where the required proof comments make five; a storage sweep expected one prose mention of `localStorage` where the tree already had three.

One defect reached code and was caught by the planner's type check, not by an executor: packet 040.6b prescribed the moved `Remembered<T>` interface with property-style members, which made `write` contravariant and broke two assignments in `remembered-layout.ts`. The method signatures were restored. A slice that moves a type now runs the type check in that slice.

## Findings carried forward, none acted on

- `libs/wbs/application/core/src/service/work-item.service.ts` is 4,594 lines: a size-ratchet finding.
- `saved-plan-retry.ts` has no production importer; only its tests, the core barrel and a boundary test name it. It is recorded as a candidate for deletion and was not deleted.
- `import.service.ts` is a feature whose capability is `unspecified`: no accepted capability specifies import.
- The packed Twilight Bureaucrat tarball lists `dist/bin.mjs` twice, once per command name. It installs and runs correctly.
- `nx.json` enables Nx analytics and no environment variable overrides that, so every Nx command may contact Nx's analytics host. Whether that stays on is Dany's decision.
- `.scratch/twilight-structure/issues/01-personal-delivery-acceptance.md` links an anchor, `tasks.md#milestones-and-ordering`, that did not exist on main either; the heading is "Technical milestones and ordering".
- `docs/twilight-structure/names.md` still says the rename plan will bring older documents into line. That work is now done for the current documents; the sentence is outside this batch's lanes.

## What to do next

1. Merge `batch-1/integration` to main as one pull request; the owner approved that on 2026-09-20. The nine packets stay separate `--no-ff` merges inside it.
2. Run 060.1's experiment: its preparation slice is dispatched, and the planner runs the container steps from the reviewed scripts.
3. Fix the findings above that need no decision, on their own branch with their own gate run.
4. Batch 2 is being planned under `docs/superpowers/plans/2026-09-20-batch-2/`.

The dev WBS project "PUNI platform plan" was updated on 2026-09-20: eight items done, 060.1's planning step done, and the three dependencies found missing during planning added (040.1 on 020.1, 110.1 on 010.3, 110.6 on 020.8).

Rollback is local: every packet is one `--no-ff` merge on `batch-1/integration`, so `git revert -m 1 <merge>` removes one packet, and deleting the branch removes the batch. Main is untouched at `1eeacb0b`.
