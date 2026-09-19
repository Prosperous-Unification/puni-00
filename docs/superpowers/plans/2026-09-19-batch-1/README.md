# Execution batch 1

Status: planned on 2026-09-19. Each packet in this directory is the output of the Plan step for one work item of the "PUNI platform plan" project in the dev WBS instance. A packet is ready for the Impl step when a medium-tier model with no other context can execute it. Nothing in this batch has been implemented.

Naming follows [names and boundaries](../../../twilight-structure/names.md). The designs these packets implement are the [code organization design](../../specs/2026-09-19-code-organization-design.md), its [rollout plan](../2026-09-19-code-organization-rollout.md), the [Twilight Bureaucrat rules design](../../specs/2026-09-19-twilight-bureaucrat-rules-design.md), the [rename plan](../2026-09-19-twilight-rename.md) and the amended [package adoption plan](../2026-09-17-personal-package-adoption.md).

## How the batch was chosen

The plan had 20 leaf items with no unfinished predecessor. Nine are in this batch. Seven run in parallel in the first wave, because no two of them edit the same file. Two run in a second wave.

| Number | Packet                                                                  | Size | Wave | Lane touches                                                           |
| ------ | ----------------------------------------------------------------------- | ---- | ---- | ---------------------------------------------------------------------- |
| 010.3  | [Record the decision](010-3-record-the-decision.md)                     | DOC  | 1    | The decisions directory, two new OpenSpec changes, the WBS glossary    |
| 010.4  | [Rule model, check and explain](010-4-rule-model.md)                    | L    | 1    | New rules directory in the Bureaucrat source, its CLI, its README      |
| 010.5  | [Short command](010-5-short-command.md)                                 | S    | 1    | The Bureaucrat package manifest and its install test                   |
| 020.1  | [Pin and install the three libraries](020-1-pin-and-install.md)         | S    | 1    | Root manifest, lockfile, the pin test, the adoption plan               |
| 040.3  | [Extract the plan writer](040-3-plan-writer.md)                         | L    | 1    | The plan read hook and one new frontend module                         |
| 040.6  | [Extract directory and preferences](040-6-directory-and-preferences.md) | M    | 2    | The directory page, the storage users, new frontend modules            |
| 060.1  | [Evaluate EmDash](060-1-evaluate-emdash.md)                             | RES  | 1    | One new research note                                                  |
| 110.5  | [Reword current documents](110-5-reword-current-documents.md)           | DOC  | 1    | Current Twilight documents, proposed OpenSpec changes, the rename plan |
| 020.8  | [Classify backend services](020-8-classify-backend-services.md)         | M    | 2    | A new policy file, new devsync tests, the devsync project file         |

040.6 waits for 040.3. Both register a test in the frontend's node suites file, and each adds module README files, which moves a pinned README count in the devsync namespacing test. Run one after the other, each packet updates the list and the pin for its own additions: 040.3 moves the count from 19 to 20, and 040.6 moves it from 20 to the number its own READMEs make.

020.8 waits for 010.3. It needs the `service-taxonomy` change to exist, because rule R4 requires the architectural change before the check, and it appends its evidence to that change's verification record after 010.3 has created it.

### File ownership where two packets came close

The first Codex review found three collisions. They are settled here, and every packet follows this table.

| File                                                   | Owner             | The other packet                                                                                                                                                                                                                                 |
| ------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/wiki/cli/README.md`                              | 010.4             | 010.5 does not edit it. 010.4 adds the sentence that names the short command.                                                                                                                                                                    |
| `tools/tool-devsync/project.json`                      | 020.8             | 020.1 does not edit it. The warm-cache proof is the planner's, because Nx caches only successful runs and the whole devsync target cannot succeed in an executor's clone. If that proof fails, it is a finding, not permission to edit the file. |
| `openspec/changes/service-taxonomy/verify.md`          | 010.3 creates it  | 020.8 appends to it in wave 2, after 010.3 is merged.                                                                                                                                                                                            |
| `apps/wbs/fe-01/vitest.node-suites.ts`                 | 040.3, then 040.6 | Sequential. Each adds only its own suite lines.                                                                                                                                                                                                  |
| The README count pin in the devsync namespacing test   | 040.3, then 040.6 | Sequential. Each updates the pin for the READMEs it adds, after watching the test fail.                                                                                                                                                          |
| `CONTEXT.md`                                           | 010.3             | No other packet edits the WBS glossary.                                                                                                                                                                                                          |
| `docs/superpowers/plans/2026-09-19-twilight-rename.md` | 110.5             | The rename plan is committed in the baseline every clone is cut from, so there are no foreign hunks. The executor ticks its tasks and hands the file over.                                                                                       |

## Execution order

| Order | Packet                                   | Why here                                                              |
| ----- | ---------------------------------------- | --------------------------------------------------------------------- |
| 1     | 010.5 short command                      | Smallest. Proves the whole pipeline end to end.                       |
| 2     | 020.1 pin and install                    | Small. Needs the registry, so it is the one network-enabled attempt.  |
| 3     | 010.3 record the decision                | Documents only. Unblocks 020.8.                                       |
| 4     | 040.3 plan writer                        | Large, with three enforced checkpoints.                               |
| 5     | 010.4 rule model, part 1 of 4            | Later parts follow one at a time, each from the reviewed predecessor. |
| 6     | 110.5 reword current documents           | Documents only.                                                       |
| 7     | 020.8 classify backend services          | After 010.3.                                                          |
| 8     | 040.6 directory, then 040.6b preferences | After 040.3, one after the other.                                     |

## Startable items left out, and why

| Number         | Item                                 | Reason                                                                                              |
| -------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 010.1          | Unblock the package                  | Needs Dany: license, npm ownership, release environment, token, tag.                                |
| 060.4          | Website decisions                    | Needs Dany: domain, whether the product code name appears, privacy notice.                          |
| 110.7          | Private artifacts in the public repo | Needs Dany.                                                                                         |
| 040.1          | Chromium proof of the packages       | Needs the packages installed first, which is 020.1. The plan in WBS lacks that dependency.          |
| 110.1          | Test axes                            | Implements the test-axes OpenSpec change that 010.3 creates. The plan in WBS lacks that dependency. |
| 110.6          | Retire the sync machinery            | Rewrites the same devsync tests that 020.8 extends. Runs after 020.8.                               |
| 070.1 to 070.3 | Register the three nodes             | Needs facts only Dany has: addresses, access, and the hardware of the two new hosts.                |
| 110.8          | Twilight Dash facade                 | Extra large and has no design yet. Its Plan step is a design document of its own.                   |
| 110.9          | Twilight Navigator                   | Only a name so far.                                                                                 |

## Two facts every Twilight Bureaucrat packet must respect

Both were found while planning 010.4 and verified in the source.

- **Any new source file changes the validator identity.** The trust code walks the import closure of the command-line entry point and refuses a trusted policy whose bound validator artifacts differ from the running ones. Locally this is harmless, because the lint launcher reports an inactive status when no activation root is configured. A provisioned activation must be prepared again after every slice that adds a file. Nobody has budgeted that cost; it applies to every slice of the rules design.
- **There are two dispatchers.** The installed binary's entry point keeps its own allow-list of commands and its own help text beside the command-line module. A command added to only one of them is invisible to the installed package.

## Decisions taken during planning

These came out of the planners' findings and the Codex review. Each is an assumption Dany can reopen.

- **Rule K2 stays strict on the frontend.** Delivery imports feature-services only. The directory page therefore gets two services: a Directory resource-service for reads, the write runner, the refetch policy and the store, and a Directory management feature-service for the gestures a person performs. They are separate modules, because the plan pickers will share the resource later.
- **The design's frontend table has a gap this batch does not close.** It lists the plan's command services as feature-services that call the HTTP client directly, which rule K3 forbids. A Plan resource-service that owns the writes and the knowledge of which resources each write dirties is the likely answer. It is recorded as a finding for the command services' own Plan step.
- **One store contract, created once.** The shared store type lives in the frontend's modules directory and is created by 040.6, its first user. 040.3 does not need it, because the busy flag stays an injected port until the lifetimes task.
- **The refusal text module is misfiled.** It is plain TypeScript under the components directory, so every extracted service imports upward to reach it. It moves when the Notices module is planned; no packet in this batch moves it.
- **Commands of the removed verifier tool get new homes.** In the proposed control-plane change, compile and scaling commands belong to a planned Twilight Dash command-line project, and scenario and knowledge verification commands belong to Twilight Bureaucrat. 110.5 carries the exact mapping.

## Hidden constraints every frontend packet must respect

- **The fast test tier is chosen by scanning a test file's text.** A test file that contains any of these words, even in a comment, is treated as needing a DOM and falls out of the two-second tier: `document`, `window`, `location`, `localStorage`, `navigator`, `WebSocket`, `matchMedia`, `getComputedStyle`, `HTMLElement`, `jsdom`, `@testing-library`. A fast-tier test must also be a `.ts` file, not `.tsx`, and must be listed in the node suites file.

## What every packet contains

1. **Header:** work item number and name, size class, the three token estimates, the design it implements.
2. **Goal and non-goals**, each in one or two sentences.
3. **Read first:** the exact files the executor must read before editing, with the reason for each.
4. **Verified facts:** what the planner checked in the repository on the planning date, with paths and symbol names. Anything not verified is listed under **Unknowns**, never stated as fact.
5. **File plan:** every file created or modified, one responsibility each.
6. **Interfaces:** exact names, signatures and types that other tasks rely on.
7. **Steps:** checkbox steps of one action each. Code steps carry the actual code. Test steps come before implementation steps. Every command has its expected result.
8. **Negative proofs:** for every new or changed check, the fault to inject, the test expected to fail, and the instruction to add the adjacent proof comment only after watching it fail.
9. **OpenSpec:** whether the task needs a change, which one, and what its delta spec must state.
10. **Verification:** the commands that prove the task done, and what they do not prove.
11. **Stop conditions:** the situations where the executor must stop and report instead of improvising.
12. **Out of lane:** files the executor must not touch because another packet owns them.

## Rules for every executor

- Read the repository's agent rules and its index first. Bun and Nx only. Never npm, never `--no-verify`.
- Read callers and tests before changing behaviour, and preserve unrelated changes.
- Never claim a command, behaviour or dependency works without fresh output. State every check that was skipped or unavailable.
- Stay in the lane. If the task needs a file that another packet owns, stop and report.
- An extraction changes no behaviour. If it seems to need one, stop and report.
- WBS work lands in this repository directly. Dany declared WBS detached from its former upstream on 2026-09-19.
- The repository is public. Commit nothing that was private elsewhere.
- Commit only what the packet names, with hooks enabled. Record commands, results and observed faults in the owning OpenSpec change's verification record where one exists.

## Execution contract

A high-effort Codex review of the execution plan on 2026-09-19 refused it. This contract adopts its minimum changes. It overrides any packet wording that disagrees.

### Who does what

| Actor    | Does                                                                                                                                                                                                                                                         | Never does                                                                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Executor | Edits files in its own clone. Runs the focused tests its packet names, type checks, lint, builds, the format check and OpenSpec validation. Injects faults, observes them, restores. Writes evidence. Stops at a checkpoint or a stop condition and reports. | Changes Git state in the clone: no staging, commits, branches, stashes or restores from Git. Runs a check that writes Git objects into the clone. Runs the host gate. Pushes, publishes or uses a real credential. Uses npm, pnpm or yarn. |
| Planner  | Reviews the diff against a frozen baseline. Stages exact paths, inspects the staged diff, runs the planner-only checks, replays a sample of the negative proofs, commits with hooks enabled, merges into the integration branch, records every hash.         | Trusts a report. Accepts a proof nobody replayed. Loosens a check to get a green result.                                                                                                                                                   |

Planner-only checks are the whole devsync test target, because its namespacing test runs the wiki index checker over the working tree and that writes Git objects; anything that needs tracked files; and the final integration matrix below. Git inside a fixture repository under the attempt's temporary directory is fine for anyone.

### One executor at a time, in bounded slices

Executors run one after another, not in parallel. The planner's verification is the scarce resource, and heavy suites from several clones would also contend for memory and ports. Every packet larger than size S names its checkpoints, and the executor is stopped at each one for review and commit before the next slice starts. A packet is dispatched only as the slice the planner has reviewed.

### Attempt isolation and evidence

- Each attempt gets an identifier, a clone cut from a recorded integration commit, and its own temporary root, passed to the executor as `TMPDIR`. Every scratch file, backup and fixture lives under it. No packet uses a fixed path under the system temporary directory.
- Network access is off by default. It is on only for a packet that names the hosts it needs. Executors start from an allowlisted environment with no agent sockets and no tokens.
- Before injecting a fault the executor saves the passing bytes and writes the mutation as a patch under `$TMPDIR/evidence`, then saves the failing output beside it. After the attempt the planner copies that directory out of the temporary root, so a proof is a file, not a sentence in a report.
- A clone with an unrestored mutation is never staged. Restoration is a byte comparison with the saved copy, never a restore from Git, because Git would discard the passing uncommitted work.
- A ledger outside the repository records, per attempt: packet file hash, base commit, clone path, slice, state, reviewed commit, merge commit and outstanding checks. Work resumes only after the ledger is reconciled with disk.

### Counts are relative, never absolute

A packet never expects an absolute count that another packet can move. It records the number at its own start and expects that number plus its own additions. This applies to OpenSpec validation items, to test totals and to the README count pin. A packet that adds a test to a shared project runs its own test file for its red and green observations and leaves the whole target to the planner.

### Convergence

A packet executes when its latest review says READY, or READY AFTER FIXES and the planner has applied and checked those fixes. After three review rounds a packet that is still refused is cut smaller or held, with the reason recorded here. The executor's stop conditions and the planner's verification are the last line, so a packet need not be perfect, but it must never instruct something the contract forbids.

### Held

| Packet | Reason                                                                                                                                                                                                                                                                                       |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 060.1  | Held on 2026-09-19. It needs a container daemon, whose authority no working directory confines, and its experiment does not yet prove persistence on one immutable image. It returns as a deterministic experiment for a disposable environment. Its desk research stands and is useful now. |

### Integration verification

After each merge into the integration branch the planner runs the cheap cross-cutting checks: the whole devsync target, the format check and strict OpenSpec validation. When the batch concludes, the planner runs this matrix once on a clean checkout of the exact integration commit, derived from the gate script's steps:

1. Strict OpenSpec validation, with the item count reconciled against the named additions.
2. The repository-wide format check.
3. Tests, lint, type checks and builds for every project except the Bureaucrat, uncached.
4. The Bureaucrat's tests, type check, build, source lint and package install test.
5. The frontend browser suite, if a frontend extraction landed.

The solver image smoke step and the host gate need the shared build host. The result is reported as "locally verified, host gate pending", with every check that did not run named. Reports keep slice completion, review, commit, integration and verification as separate facts. "Batch concluded" may include held or stopped work. "Batch implemented" may not.

### Rollback

Every merge commit and dependency edge is in the ledger. A packet is backed out by reverting its dependants first, then itself, then rerunning the integration checks. The integration branch is never reset. No packet authorizes a migration or a deployment; meeting either is a scope stop.

## Standard blocks every packet uses

**OpenSpec validation.** Never use a loose success check. The gate script documents three malformed reports that a loose check accepts. Use the gate's exact contract:

```sh
set -euo pipefail
report=$(mktemp)
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
rm -f -- "$report"
```

Expected: the validator prints one JSON report, and the block exits zero.

**Creating an OpenSpec change.** The command's default schema is `spec-driven`, not this repository's. Always pass the schema and check the generated metadata file:

```sh
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 new change <name> --schema sdd-lean
grep -n "schema: sdd-lean" openspec/changes/<name>/.openspec.yaml
```

Expected: the second command prints one line. If it prints nothing, stop.

**Refusal tests and lint.** This repository's lint rejects `await expect(promise).rejects.toThrow(...)`. Write the assertion without `await` and return or await the matcher the way existing tests in the same project do; the 020.8 packet shows the form that passes both lint and the runner.

**OpenSpec never phones home.** Version 1.12.0 posts telemetry to one host and checks for updates at the package registry. Both stop when `OPENSPEC_TELEMETRY=0` is set, so every OpenSpec invocation carries it. The launcher warms the command into each attempt's temporary root before dispatch, because `bunx` keys its install directory by `TMPDIR` and executors have no network.

**Running one named test.** Bun's `-t` filter matches the describe names and the test title joined together. An anchored pattern of the bare title matches nothing when the test sits inside a `describe`, and the run then reports success on zero tests. Anchor the full joined name, or use the unanchored exact title. Whichever form is used, the expected result states how many tests ran, and a run that matched zero tests is a failure to stop on.

**Formatting.** Format only the files the packet owns, then run the repository-wide check. Never run a repository-wide format write: it rewrites other lanes' files.

**Completion gate.** Focused checks do not complete a task. After the final commit:

- On the shared build host, run `bin/h2puni-gate.sh <sha>` with the committed hash. Do not check that commit out first and never clean a dirty gate tree. Record the printed line that names the running hash, and the exit status.
- On any other machine, say in the task report that the host gate was not run and why. An unavailable required check is reported, never treated as passed.

**Negative proofs with a restore.** Before injecting a fault into a tracked file, copy the passing version aside. After observing the failure, restore the exact bytes and compare them with the copy, then rerun the passing check. Clean up before reporting an unexpected result.

**Expected results.** Every command in a packet states what success looks like: the exit status and the line or count to look for.
