# Batch 1 results

Recorded 2026-09-20. Status: **batch concluded, locally verified, host gate pending.** Nine packets are merged on the local branch `batch-1/integration`; one packet is held. Nothing was pushed, published, merged to main or deployed.

This page reports what was observed. The plan is the [batch README](README.md); the decisions taken without asking are in [ASSUMPTIONS.md](ASSUMPTIONS.md). Attempt reports, mutation patches and failing output are kept outside the repository, under `/home/df/wd/puni/puni-plan/exec/logs/<attempt>/`, with one line per event in `/home/df/wd/puni/puni-plan/exec/ledger.jsonl`.

## What landed

| Work item | Result                                                                                                                                                                                                                                                                       | Attempts |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 010.5     | The Twilight Bureaucrat package installs `twib` beside `twilight-bureaucrat`; the install test spawns both launchers.                                                                                                                                                        | 1        |
| 020.1     | `di-bag` 0.4.0, `application-exception` 0.5.0 and `caught-object-report-json` 11.0.1 pinned exactly at the root, with a test for the pins and one for a single resolved copy of the report library. The adoption plan is rewritten against the released versions.            | 1        |
| 010.3     | ADR 0029, five glossary terms, and two proposed OpenSpec changes: `service-taxonomy` (19 requirements, 45 scenarios) and `test-axes` (14 requirements, 25 scenarios).                                                                                                        | 2        |
| 040.3     | The plan gesture policy moved out of `use-plan-read.ts` into a framework-free plan writer module; the hook builds it once and delegates.                                                                                                                                     | 5        |
| 010.4     | Twilight Bureaucrat gains a rule model, a registry of four rules, `explain`, a rule policy read through the trusted-input boundary, `check` with a verdict that never certifies, the four adapters proven end to end, and both commands routed through the built executable. | 5        |
| 110.5     | The current Twilight documents name the owning tool: Twilight Navigator plans, Twilight Dash runs, Twilight Bureaucrat verifies, Vesper Shipyards is the product. ADRs 0027 and 0028 gain a dated ownership line.                                                            | 4        |
| 020.8     | `docs/code-organization/kinds.json` classifies all 95 backend service files (11 features, 3 repositories, 9 resources, 72 support, of which 36 are re-export shims), and four tests hold the inventory complete against the real repository.                                 | 7        |
| 040.6     | The directory page reads one snapshot from a directory resource service and sends its gestures to a directory-management feature service. 344 lines left the page.                                                                                                           | 2        |
| 040.6b    | Every browser storage key sits behind the preferences module; one repository adapter is the only non-test code that calls `localStorage`.                                                                                                                                    | 3        |
| 060.1     | **Held.** Its desk research stands; the hands-on experiment needs a disposable environment, and whether running the evaluated system on Node conflicts with the Bun-only rule is Dany's decision.                                                                            | 0        |

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

Whole-target totals against main: `tool-devsync:test` 267 to 284; `twilight-bureaucrat:test` 662 to 679; `wbs-fe-01:test:unit` 34 files and 554 tests to 40 and 595; `wbs-fe-01:test` under UTC 107 files and 2781 tests to 114 and 2826, and under Auckland unchanged at 2 files and 3 tests.

**Not verified.**

- `bin/h2puni-gate.sh <sha>`: not run. This machine is not the shared build host. The solver image smoke step needs that host too.
- `wbs-solver-py:test`: not runnable here. Python `ortools` and `jsonschema` are not installed on this machine, so every test module fails to import. The batch touches nothing under that project.
- A Twilight Bureaucrat activation provisioned outside a clone. The new source files change the validator identity, so such an activation has to be prepared again; no test pins the identity as a literal.
- The classification in `kinds.json` is judgement. Every rationale was read and two entries were changed after checking importers, but no test can prove a kind is right.

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

1. On the shared build host, run `bin/h2puni-gate.sh b4188ec3276bc302be00fbfc512ecc4c3eb5844b` and record the printed `h2puni gate: running on <sha>` line and the exit status.
2. Decide whether `batch-1/integration` goes to main as one pull request or as nine. The repository is public, so merging publishes it.
3. Decide 060.1's open question, then run its experiment in a disposable environment.
4. In the dev WBS project "PUNI platform plan", add the three missing dependencies found during planning (040.1 on 020.1, 110.1 on 010.3, 110.6 on 020.8) and mark these nine items' progress. The connection's tokens last five minutes, so this needs a fresh `/mcp` login.

Rollback is local: every packet is one `--no-ff` merge on `batch-1/integration`, so `git revert -m 1 <merge>` removes one packet, and deleting the branch removes the batch. Main is untouched at `1eeacb0b`.
