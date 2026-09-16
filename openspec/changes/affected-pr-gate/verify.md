# Verification Report

**Change**: `affected-pr-gate`
**Verified at**: `2026-09-16`
**Verifier**: `W3 implementation agent — local evidence only; every live-run row below is the controller's`

This repository does have CI, so the template's "there is no CI" gate section is not the
only gate here. It is also the thing under change, which is why section 4 proves the two
new refusals by editing the production workflow and watching the pins go red, and section
7 leaves the rows that need a pushed branch, a pull request and Dany's ruleset open.

---

## 1. Structural Validation

- [x] `bunx @fission-ai/openspec@1.3.0 validate --all --json` — all items `"valid": true`

```
{ "totals": { "items": 84, "passed": 84, "failed": 0 },
  "byType": { "change": { "items": 73, "passed": 73, "failed": 0 },
              "spec":   { "items": 11, "passed": 11, "failed": 0 } } }
{"id": "affected-pr-gate", "type": "change", "valid": true, "issues": [], "durationMs": 1}
```

| Item               | Type   | Issues |
| ------------------ | ------ | ------ |
| `affected-pr-gate` | change | none   |

---

## 2. Task Completion

- [ ] Every `- [ ]` in tasks.md is now `- [x]`

| Task                        | Reason incomplete                                                                                           | Blocks archive? |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------- |
| 4.1 live-run rows           | Needs a pushed branch, a pull request and a `push` to `main`; the throwaway negative PR is the controller's | Yes             |
| 4.1 first `merge_group` row | Needs Dany's `main` ruleset; `merge_group` cannot fire until it exists                                      | Yes             |

Slices 1.1–1.4, 2.1–2.3 and 3.1–3.7 are complete. 4.1 is the only open slice, and every
reason it is open is in section 7.

---

## 3. Delta Spec Sync

| Capability         | Sync status | Note                                       |
| ------------------ | ----------- | ------------------------------------------ |
| `affected-pr-gate` | ✗ pending   | Syncs at archive, after the live-run rows. |

---

## 4. Failure Proofs

Each fault was injected into the real `.github/workflows/ci.yml` — not a fixture, not a
copy — and the pin suite was watched failing on it before the file was restored.

Every pass/fail count below — and in section 5 — and every expectation literal a row quotes,
is **as observed when that row was watched**, not as the suite reads today. Rows 81-82 quote
the pre-`-s` form of the jq guard for that reason: the fault was watched before `-s` landed,
and re-quoting it with today's text would be a claim nobody made. Totals differ between rows
for the same reason: cases were added to both suites across three rounds, and two rows were
re-observed after a later change stopped their original reading from reproducing. A count that
does not match today's suite size is the record of when it was seen, not a stale claim — the
row says so where it was re-observed.

| Check (file:line)                                                        | Fault injected                                                                                                           | Test that observed the failure                                                                                                         | Result                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml` `Gate mode`, the `*)` arm                                       | Deleted the whole `*)` arm                                                                                               | `toolchain-pins.test.ts` › `maps every subscribed event and refuses one it has no rule for`                                            | Red: `Expected: ["*"] · Received: []`. 16 pass / 1 fail. **Re-observed after the extractor was tightened**; the original `toContain("*")` reading is not reproducible on the shipped tree.                                                                                                                                                                      |
| `ci.yml` `Gate mode`, the `*)` arm's `exit 1`                            | Deleted only the `exit 1`, leaving the message — log-and-continue                                                        | Same case                                                                                                                              | Red: `Expected to contain: "printf 'no gate mode for event %s\n' \"$EVENT_NAME\" >&2 exit 1"`. 16 pass / 1 fail. Green before the tightening.                                                                                                                                                                                                                   |
| `ci.yml` gate step, the tool-wiki-affected switch                        | Replaced `if [ "$GATE_TOOL_WIKI" = run ]; then …` with `true` in the affected arm                                        | Same file, `keeps Tool Wiki in the pull-request gate…` and `runs affected on a pull request…`                                          | Red: missing `if [ "$GATE_TOOL_WIKI" = run ]; then`, and `Expected: 2 · Received: 1` for the tool-wiki run-many. 14/2                                                                                                                                                                                                                                           |
| `ci.yml` `Browser stack scope`, the `*)` arm                             | Deleted the whole `*)` arm                                                                                               | `pixels-workflow.test.ts` › `decides the browser scope from the event, and refuses one…`                                               | Red: `Expected: ["*"] · Received: []`. 5 pass / 1 fail. **Re-observed**, same reason as the first row.                                                                                                                                                                                                                                                          |
| `ci.yml` `Browser stack scope`, the `*)` arm's `exit 1`                  | Deleted only the `exit 1`                                                                                                | Same case                                                                                                                              | Red: `Expected to contain: "printf 'no browser-stack rule for event %s\n' \"$EVENT_NAME\" >&2 exit 1"`. 5 pass / 1 fail. Green before the tightening — all SIX cases passed.                                                                                                                                                                                    |
| `tool-wiki/project.json` `test` inputs, `trusted-wiki.yml`               | Ran the oracle with `ci.yml` declared and `trusted-wiki.yml` not                                                         | `workspace-targets.test.ts` › `every suite that reads a CI workflow declares it`                                                       | Red: `["tool-wiki:test does not declare .github/workflows/trusted-wiki.yml"]`. 17 pass / 1 fail                                                                                                                                                                                                                                                                 |
| `workspace-targets.test.ts`, the per-workflow non-vacuity assertion      | Misspelled the second entry `trusted-wikii.yml`                                                                          | Same case                                                                                                                              | Red: `.github/workflows/trusted-wikii.yml is read by no suite but the list that names it · Received: []`. 17 pass / 1 fail. A `toContain('tool-devsync')` alone stayed GREEN — the list lives in the file being scanned, so a typo self-matches.                                                                                                                |
| `ci.yml` refusal-arm pins vs. their own `Proof:` comments                | Reflowed the in-script Proof onto one line and deleted the arm's `exit 1`                                                | `pixels-workflow.test.ts` › `decides the browser scope from the event…`                                                                | GREEN, 6 pass / 0 fail — the pin was reading its own comment. Fixed by stripping comment lines before normalising in both suites and moving that note out of the `run:` block; the same fault is now red on the missing message-and-exit pair, 5 pass / 1 fail.                                                                                                 |
| `ci.yml` gate step, the `if [ "$GATE_MODE" = affected ]` predicate       | Flipped it to `if true; then`                                                                                            | `toolchain-pins.test.ts` › `runs affected on a pull request and the unchanged full gate everywhere else`                               | Red: `Expected to contain: "if [ \"$GATE_MODE\" = affected ]; then"`. 16 pass / 1 fail. Unpinned before this: `push` and `merge_group` would have run `nx affected --base=""` with all 208 tests green.                                                                                                                                                         |
| `ci.yml` `Gate mode`, the arm-to-mode pairing                            | Exchanged the `pull_request` and `push \| merge_group \| workflow_dispatch` bodies                                       | `toolchain-pins.test.ts` › `takes the pull-request boundary from the immutable payload`                                                | Red: `Expected to contain: "pull_request) : \"${PR_BASE_SHA:?…}\" printf 'mode=affected\n' >> \"$GITHUB_OUTPUT\""`. 16 pass / 1 fail. Three loose `toContain`s were equally happy with the bodies swapped.                                                                                                                                                      |
| `ci.yml` gate step, the branch-to-body pairing                           | Exchanged the `then` and `else` BODIES of `if [ "$GATE_MODE" = affected ]`                                               | `toolchain-pins.test.ts` › `runs affected on a pull request and the unchanged full gate everywhere else`                               | Red: `Expected to contain: "if [ \"$GATE_MODE\" = affected ]; then { bunx nx affected -t test lint typecheck build --base=\"$GATE_BASE\" --head=HEAD"`. 16 pass / 1 fail. **17 pass / 0 fail before this pin** — the predicate text, both command lines and all three occurrence counts survive a swap, since it moves commands without adding or removing any. |
| `ci.yml` both switches, `jq -s` and `length == 1`                        | Drove the EXTRACTED production step script with a `bunx` stub printing `"tool-wiki"` then `["wbs-be-01","tool-devsync"]` | Shell, then both pin suites                                                                                                            | Behaviour: the unslurped form wrote `tool_wiki=skip` and exited 0 — with `tool-wiki` in its own output — while the slurped form printed `nx show projects did not return one JSON array: …`, rc 1. Pin: reverting either guard fails on the missing `jq -s` literal, 5 pass / 1 fail.                                                                           |
| `ci.yml` `pixels` aggregate, `set -euo pipefail`                         | Deleted the line, leaving `test "$STACK_RESULT" = success` as a discarded status                                         | `pixels-workflow.test.ts` › `the required check refuses a skip it cannot explain`                                                      | Red: `Expected: true · Received: false`. 5 pass / 1 fail. Without it the script runs on to the `case` and the aggregate reports on the shards alone.                                                                                                                                                                                                            |
| `ci.yml` `Browser stack scope`, the boot-set membership                  | Narrowed `jq` to `index("wbs-fe-01") != null`                                                                            | `pixels-workflow.test.ts` › `asks Nx about every app the browser stack boots, as JSON`                                                 | Red: the three-project `any(.[]; …)` expression absent from the received script. 4 pass / 1 fail                                                                                                                                                                                                                                                                |
| `ci.yml` `pixels` › `Require every browser shard`                        | Reduced to the previous `test "${{ needs.pixels_shard.result }}" = success`                                              | `pixels-workflow.test.ts` › `the required check refuses a skip it cannot explain`                                                      | Red: expected the three `needs` env values, received `undefined`. 4 pass / 1 fail                                                                                                                                                                                                                                                                               |
| `tool-git-hooks/project.json` and `tool-wiki/project.json` `test` inputs | Ran the new oracle against the real manifests before either input was added                                              | `workspace-targets.test.ts` › `every suite that reads a CI workflow declares it > names each workflow in the test target that runs it` | Red: `["tool-git-hooks:test does not declare .github/workflows/ci.yml", "tool-wiki:test does not declare .github/workflows/ci.yml"]`. 17 pass / 1 fail                                                                                                                                                                                                          |
| `ci.yml` `Gate mode`, the jq three-way status                            | Returned the switch to its two-branch `if jq -e …; then; else; fi`                                                       | `toolchain-pins.test.ts` › `refuses a jq failure instead of reading it as Tool Wiki being unaffected`                                  | Red: `Expected to contain: "jq -e 'type == \"array\"'"`. 16 pass / 1 fail. Behaviour below.                                                                                                                                                                                                                                                                     |
| `ci.yml` `Browser stack scope`, the jq three-way status                  | Same, in the pixels switch                                                                                               | `pixels-workflow.test.ts` › `refuses a jq failure instead of reading it as the stack being unaffected`                                 | Red: same missing literal. 5 pass / 1 fail                                                                                                                                                                                                                                                                                                                      |

- [x] Every check in this change has a row
- [x] Each negative test reaches the production call path — every oracle reads
      `.github/workflows/ci.yml` through `Bun.YAML.parse`, and every fault was injected
      into that file
- [x] Where code distinguishes state, both branches were tested: the tool-wiki switch was
      watched failing when removed, and the `grep`-vs-JSON distinction is measured rather
      than reasoned (below)
- [x] No row relies on an exit code

### An oracle is only as reachable as its Nx inputs

This is the general risk the affected switch introduces, and it caught this change itself.
Every oracle in section 4 reads `.github/workflows/ci.yml`. Under `run-many` that was enough:
the suite ran on every event whatever its declared inputs said. Under `nx affected` it is not
— a project is scheduled only when the diff reaches it, and `ci.yml` belongs to no project, so
it reaches a project only through that project's declared `inputs`.

Measured on 2026-09-16, before the fix:

```
$ bunx nx show projects --affected --files=.github/workflows/ci.yml --json
["tool-devsync","tool-wiki"]
```

`tool-git-hooks` is absent, and `tools/tool-git-hooks/src/hooks/pixels-workflow.test.ts` is
where the ENTIRE pixels oracle lives — rows 3, 4 and 5 above. A pull request whose only edit
was `ci.yml`, deleting the browser-stack `*)` arm or reverting the `pixels` aggregate to its
vacuous form, would have run `nx affected`, never scheduled `tool-git-hooks:test`, and reported
green. Each of those faults was watched by hand; none of them was reachable through `affected`.
`tool-wiki` was affected only by accident, through its `lint` target's `{workspaceRoot}/**/*`
catch-all, while `tool-wiki:test` declared no inputs at all.

After adding `{workspaceRoot}/.github/workflows/ci.yml` to both `test` targets:

```
$ bunx nx show projects --affected --files=.github/workflows/ci.yml --json
["tool-git-hooks","tool-devsync","tool-wiki"]
```

`workspace-targets.test.ts` › `every suite that reads a CI workflow declares it` now keeps
it that way: it greps every project's test sources for the workflow path — in both spellings,
the single literal and the `join(…, '.github', 'workflows', 'ci.yml')` segments, neither of
which `outsideReads` can see — and requires the reading project's `test` target to declare it.
Its non-vacuity assertion is self-proving: that file itself names the path, so a detector that
stopped matching empties the reader list and fails rather than passing over an empty scan.

The oracle is parametrised over a list of workflows, not hard-coded to one, and the second
entry immediately earned its place: `gate-entrypoints.test.ts` also reads
`.github/workflows/trusted-wiki.yml`, which no `test` target declared either. With `ci.yml`
declared and that one not, the oracle failed on
`["tool-wiki:test does not declare .github/workflows/trusted-wiki.yml"]`; it is declared now.

The general lesson belongs beside the switch, not only in this row: **anything a check reads
that is not inside its own project must be in that target's `inputs`, or the affected gate
cannot schedule the check at all.**

### A pin is only as breakable as its weakest assertion

The first version of these refusal-arm pins asserted `toContain('exit 1')` and
`toContain('*')`, and both stopped being able to fail inside the same round that wrote them.
`exit 1` because the `type == "array"` guard put a SECOND `exit 1` in the same script, so
deleting the arm's own left every case green — the log-and-continue shape AGENTS.md forbids,
pinned by nothing. `toContain('*')` because the arm-extractor's character class contained a
space, so `^ {2}` plus the class swallowed the indentation of the NESTED `case
"$tool_wiki_status"` and harvested its `*)` as an outer event; the real production script
yielded `["pull_request", "*", "push", "merge_group", "workflow_dispatch", "*"]`, and the
star assertion passed with the outer arm gone.

Both are fixed by pinning the thing rather than a token of it: the extractor matches only
outer arms (`/^ {2}([a-z_]+(?: \| [a-z_]+)*|\*)\)$/`), the arms are asserted to hold exactly
one `*` beside exactly the subscribed events, and the refusal is pinned as its two lines
normalised into one string, so removing the `exit` is visible. Every `Proof:` text touching
these arms — two in `ci.yml`, one in each suite, and the rows above — was rewritten with what
was re-observed on the shipped tree rather than with what was true when first watched.

### The check that could not have failed, caught before it shipped

Task 3.1's brief specified `bunx nx show projects --affected … | grep '^tool-wiki$'`.
Measured on Nx 23.2.0, 2026-09-16, in this worktree:

```
$ bunx nx show projects --affected --base=HEAD~1 --head=HEAD --sep=$'\n'
["wbs-be-01","wbs-fe-01","wbs-gw-01",…,"tool-wiki",…]
```

One line of JSON, `--sep` ignored, on a non-TTY — which is what a runner is. A
`grep -qx tool-wiki` over that output can never match, so Tool Wiki would have been
dropped from every pull-request gate while the step exited 0. Membership is therefore read
with `jq -e`, and `pixels-workflow.test.ts` / `toolchain-pins.test.ts` each assert
`not.toContain('grep')` on the scope script so the trap cannot be reintroduced.

The same measurement is why the pixels switch asks about three projects rather than one:

```
$ bunx nx show projects --affected --files=apps/wbs/be-01/src/main.ts --json
["wbs-be-01","tool-devsync","tool-wiki","tool-dagger"]
```

`wbs-fe-01` is absent, and `playwright.config.ts`'s `webServer` boots be-01, gw-01 and
fe-01, so a frontend-only switch would have skipped the browser gate for a backend change
that breaks the rendered table.

---

## 5. Gate Output

Local commands, each with the result line as printed. The `--skip-nx-cache` runs are the
ones whose verdict matters; the cached ones are not quoted as evidence.

```
$ bunx nx test tool-devsync --skip-nx-cache          # RED, before the workflow moved
  202 pass / 4 fail — Ran 206 tests across 18 files
$ bunx nx test tool-devsync --skip-nx-cache          # GREEN, final
  Ran 208 tests across 18 files   (206 at the 3.1 round; the oracle added two since)
  NX   Successfully ran target test for project tool-devsync

$ bun test src/hooks/pixels-workflow.test.ts          # RED, before the pixels jobs moved
  0 pass / 5 fail — Ran 5 tests across 1 file
$ bunx nx test tool-git-hooks --skip-nx-cache         # GREEN, final
  Ran 124 tests across 9 files [2.27s]
  NX   Successfully ran target test for project tool-git-hooks

$ bunx nx run tool-git-hooks:lint --skip-nx-cache
  NX   Successfully ran target lint for project tool-git-hooks
$ bunx nx run-many -t lint typecheck -p tool-devsync tool-git-hooks --skip-nx-cache
  Output of 4 successful tasks

$ bunx nx run tool-wiki:test --skip-nx-cache          # gate-entrypoints.test.ts reads ci.yml
  Ran 579 tests across 30 files [803.03s] — the final 3.1-ROUND tree, NOT the branch tip.
  Rounds after c6aaca85 changed only this target's `inputs`, `ci.yml` comments and test
  files, nothing under tools/tool-wiki/src; `gate-entrypoints.test.ts` run directly gives
  the same 42/2 pre-existing baseline as the untouched base. The h2puni gate on the pushed
  head is the fresh run, and it is owed (section 7 row 6).
  NX   Successfully ran target test for project tool-wiki

$ bunx nx run-many -t lint typecheck -p tool-devsync tool-git-hooks --skip-nx-cache
  NX   Successfully ran targets lint, typecheck for 2 projects
$ bunx nx format:check --all                          rc=0
$ git diff --check                                    rc=0
$ bunx @fission-ai/openspec@1.3.0 validate --all --json   84 items / 84 passed / 0 failed
```

YAML parse, both readers, on the final file:

```
$ bun -e "const y=await import('yaml')…"              yaml lib present
$ bun -e "…YAML.parse(ci.yml)…"                        jobs: gate,pixels_mode,pixels_shard,pixels
                                                       on keys: push,pull_request,merge_group,workflow_dispatch
$ bun -e "…Bun.YAML.parse(ci.yml)…"                    pixels_shard needs: pixels_mode
                                                       if: ${{ needs.pixels_mode.outputs.stack == 'affected' }}
                                                       pixels needs: ["pixels_mode","pixels_shard"]
```

`python3 -c 'import yaml…'` was NOT used: this host has no `yaml` module
(`ModuleNotFoundError: No module named 'yaml'`). The npm `yaml` package is present in the
workspace and was used instead, alongside `Bun.YAML`, which is what the pin suites parse
with.

### Stated skips and pre-existing state

- `bin/h2puni-gate.sh <sha>` was NOT run. It takes the canonical host-wide heavy lock and
  is the controller's to run on the pushed head.
- Running `bun test src/policy/gate-entrypoints.test.ts` directly, outside its Nx target,
  fails two cases — `the host gate fails specifically at wiki lint for a stale enforced
blob` and `the real Nx target reruns an omitted-input mutation…`. This is PRE-EXISTING
  and not caused by this change: `git stash`ed to the untouched base `73730b66`, the same
  two cases fail with the same 42 pass / 2 fail. Through its own target
  (`bunx nx run tool-wiki:test`), which supplies the environment they need, all 579 pass.
- `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` pins a digest over every
  legacy-path occurrence with its line number. Adding the interface fields to
  `pixels-workflow.test.ts` shifted that file's own `apps/fe-01/test-results/` proof
  comment, so the digest moved with the occurrence count and selector count unchanged at
  269 / 30. The new value is pinned with a `Proof:` note beside the previous five.

---

## 6. Implementation Signal

- [x] No unstaged files in the worktree
- [ ] Relevant commits pushed — the branch is local; pushing is the controller's step

**Commit range**: `73730b66..` the tip of `change/affected-pr-gate` — twelve commits in the
eleven rows below (`815372c2` and `db8972e0` share a row). Eight of the twelve change code;
the four marked **docs** do not. The review rounds moved `ci.yml`, both `project.json` files
and three test files, so no round after the first is "documentation of the change".

| Commit                 | Subject                                                               | Code                                                                                 |
| ---------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `0b93f8d6`             | docs(openspec): affected-pr-gate intent, specs and tasks              | docs                                                                                 |
| `51b746de`             | ci: affected gate on pull requests, full gate on merge queue and main | `ci.yml`, `toolchain-pins.test.ts`                                                   |
| `4b956c2c`             | ci: pixels shards run when the frontend is affected                   | `ci.yml`, `pixels-workflow.test.ts`, `repo-namespacing-handoff.test.ts`              |
| `61b8173e`             | docs(openspec): affected-pr-gate local verification evidence          | docs                                                                                 |
| `243ad1b1`             | docs: the index describes the gate that now runs                      | docs (`LLM_README.md`)                                                               |
| `815372c2`, `db8972e0` | docs(openspec): tool-wiki run, verified commit range                  | docs                                                                                 |
| `b86d834e`             | test(devsync): every suite that reads the CI workflow declares it     | `workspace-targets.test.ts`, `tool-git-hooks/project.json`, `tool-wiki/project.json` |
| `c6aaca85`             | fix(ci): refuse a jq failure instead of reading it as unaffected      | `ci.yml`, both pin suites                                                            |
| `2782ee67`             | test(ci): make the refusal-arm pins breakable again                   | `ci.yml`, both pin suites, `workspace-targets.test.ts`, `tool-wiki/project.json`     |
| `5fc1a304`             | test(ci): pin commands, not comments                                  | `ci.yml`, both pin suites, `workspace-targets.test.ts`                               |
| the tip                | test(ci): pin the gate-mode predicate and the arm-to-mode pairing     | `ci.yml`, both pin suites, `proposal.md`, `docs/refactoring/tasks.md`                |

---

## 7. Live-Run Evidence — PENDING, owned by the controller

None of the rows below can be produced from a local worktree. Exact steps, in order:

1. **Push the branch and open a pull request.** Record the `gate` job's Nx task list from
   `nx-gate.log` (artifact `nx-gate-log-1`) and its elapsed time. It MUST be a strict
   subset of a full run's list, and the `Gate mode` step's log must show `mode=affected`
   with the pull request's base SHA.

   **Read the subset against this, or it will be misread.** `tool-wiki:lint` declares
   `{workspaceRoot}/**/*` and so does `tool-devsync:test`, so `nx affected` names both
   projects for EVERY file: measured 2026-09-16, `--files=LLM_README.md` answers
   `["tool-devsync","tool-wiki"]`. Two consequences. The `tool_wiki=skip` branch of
   `Gate mode` is unreachable today — Tool Wiki is always affected — so a run showing
   `tool_wiki=run` is not evidence the switch is broken. And the per-PR saving is bounded
   well under the 38 minutes the proposal cites, because Tool Wiki's own targets are the
   long pole and they always run. Narrowing those two inputs is a wiki-policy decision, not
   this change's, and is queued in `docs/refactoring/tasks.md`.

   | PR  | Run | Task list | Elapsed | Subset of full? |
   | --- | --- | --------- | ------- | --------------- |
   | —   | —   | —         | —       | —               |

2. **The throwaway negative pull request** — Task 3.1 Step 3, NOT run locally. Open a
   branch touching only `libs/shared/domain/validation/src/core.ts` with a deliberate type
   error (for example a `const answer: number = 'no'`). The PR gate MUST fail in
   `shared-validation:typecheck`, and `wbs-fe-01:build` MUST NOT appear in the Nx task
   graph in `nx-gate.log`. Both halves matter: a red run that also built the frontend
   proves nothing about narrowing. Close the PR without merging and record its link.

   | PR link | Failed target | `wbs-fe-01:build` absent? |
   | ------- | ------------- | ------------------------- |
   | —       | —             | —                         |

3. **A `push` to `main`.** Record the full task list and elapsed time from the same
   artifact, as the control the subset in row 1 is a subset OF.

   | Run | Task list | Elapsed |
   | --- | --------- | ------- |
   | —   | —         | —       |

4. **`pixels` on a pull request that reaches nothing in the browser stack** (docs- or
   tools-only). `pixels_mode` must report `stack=unaffected`, the four shards must show
   `skipped`, and the required `pixels` check must still be green.

   | PR  | `pixels_mode` output | Shard results | `pixels` verdict |
   | --- | -------------------- | ------------- | ---------------- |
   | —   | —                    | —             | —                |

5. **Ask Dany to create the `main` ruleset** with a merge queue and the required checks
   `gate` and `pixels` — the prerequisite named in `proposal.md`'s Constraints. Until it
   exists, `merge_group` fires never and both `merge_group` arms are unexercised in
   production. After the first queue entry, record its run link and confirm the `Gate
mode` step logged `mode=full`.

   | Merge-queue run | `Gate mode` output | Verdict |
   | --------------- | ------------------ | ------- |
   | —               | —                  | —       |

6. **`bin/h2puni-gate.sh <sha>`** on the pushed head, under the canonical host lock.

---

## Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS — every local obligation is met and every safety check in this
      change was watched failing. The change is NOT verified end to end: its whole point is
      behaviour that only a real event produces, and section 7 is empty. Do not archive on
      this report.
- [ ] ❌ FAIL

**Next step**:

Controller pushes the branch, runs section 7 rows 1–4 and 6, and asks Dany for the ruleset
before row 5. Land the workflow first and enable the queue second, as `w3-workstream-context.md`
requires: until the ruleset exists nothing requires these checks, so landing them changes
no merge's admission.
