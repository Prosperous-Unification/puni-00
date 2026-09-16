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

Slices 1.1–1.4, 2.1–2.3 and 3.1–3.3 are complete. 4.1 is the only open slice, and every
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

| Check (file:line)                                                        | Fault injected                                                                    | Test that observed the failure                                                                                                          | Result                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml` `Gate mode`, the `*)` arm                                       | Deleted the whole `*)` arm                                                        | `toolchain-pins.test.ts` › `maps every subscribed event and refuses one it has no rule for`                                             | Red: `Expected: ["*"] · Received: []`. 16 pass / 1 fail. **Re-observed after the extractor was tightened**; the original `toContain("*")` reading is not reproducible on the shipped tree. |
| `ci.yml` `Gate mode`, the `*)` arm's `exit 1`                            | Deleted only the `exit 1`, leaving the message — log-and-continue                 | Same case                                                                                                                               | Red: `Expected to contain: "printf 'no gate mode for event %s\n' \"$EVENT_NAME\" >&2 exit 1"`. 16 pass / 1 fail. Green before the tightening.                                              |
| `ci.yml` gate step, the tool-wiki-affected switch                        | Replaced `if [ "$GATE_TOOL_WIKI" = run ]; then …` with `true` in the affected arm | Same file, `keeps Tool Wiki in the pull-request gate…` and `runs affected on a pull request…`                                           | Red: missing `if [ "$GATE_TOOL_WIKI" = run ]; then`, and `Expected: 2 · Received: 1` for the tool-wiki run-many. 14/2                                                                      |
| `ci.yml` `Browser stack scope`, the `*)` arm                             | Deleted the whole `*)` arm                                                        | `pixels-workflow.test.ts` › `decides the browser scope from the event, and refuses one…`                                                | Red: `Expected: ["*"] · Received: []`. 5 pass / 1 fail. **Re-observed**, same reason as the first row.                                                                                     |
| `ci.yml` `Browser stack scope`, the `*)` arm's `exit 1`                  | Deleted only the `exit 1`                                                         | Same case                                                                                                                               | Red: `Expected to contain: "printf 'no browser-stack rule for event %s\n' \"$EVENT_NAME\" >&2 exit 1"`. 5 pass / 1 fail. Green before the tightening — all SIX cases passed.               |
| `tool-wiki/project.json` `test` inputs, `trusted-wiki.yml`               | Ran the oracle with `ci.yml` declared and `trusted-wiki.yml` not                  | `workspace-targets.test.ts` › `every suite that reads a CI workflow declares it`                                                        | Red: `["tool-wiki:test does not declare .github/workflows/trusted-wiki.yml"]`. 17 pass / 1 fail                                                                                            |
| `ci.yml` `Browser stack scope`, the boot-set membership                  | Narrowed `jq` to `index("wbs-fe-01") != null`                                     | `pixels-workflow.test.ts` › `asks Nx about every app the browser stack boots, as JSON`                                                  | Red: the three-project `any(.[]; …)` expression absent from the received script. 4 pass / 1 fail                                                                                           |
| `ci.yml` `pixels` › `Require every browser shard`                        | Reduced to the previous `test "${{ needs.pixels_shard.result }}" = success`       | `pixels-workflow.test.ts` › `the required check refuses a skip it cannot explain`                                                       | Red: expected the three `needs` env values, received `undefined`. 4 pass / 1 fail                                                                                                          |
| `tool-git-hooks/project.json` and `tool-wiki/project.json` `test` inputs | Ran the new oracle against the real manifests before either input was added       | `workspace-targets.test.ts` › `every suite that reads the CI workflow declares it > names the workflow in the test target that runs it` | Red: `["tool-git-hooks:test does not declare .github/workflows/ci.yml", "tool-wiki:test does not declare .github/workflows/ci.yml"]`. 17 pass / 1 fail                                     |
| `ci.yml` `Gate mode`, the jq three-way status                            | Returned the switch to its two-branch `if jq -e …; then; else; fi`                | `toolchain-pins.test.ts` › `refuses a jq failure instead of reading it as Tool Wiki being unaffected`                                   | Red: `Expected to contain: "jq -e 'type == \"array\"'"`. 16 pass / 1 fail. Behaviour below.                                                                                                |
| `ci.yml` `Browser stack scope`, the jq three-way status                  | Same, in the pixels switch                                                        | `pixels-workflow.test.ts` › `refuses a jq failure instead of reading it as the stack being unaffected`                                  | Red: same missing literal. 5 pass / 1 fail                                                                                                                                                 |

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
  Ran 206 tests across 18 files
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
  Ran 579 tests across 30 files [803.03s] — final tree; 795.11s on the 3.1 tree, same 579
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

**Commit range**: `73730b66..` the tip of `change/affected-pr-gate`. The table below lists the
commits that carry the change; any later commit on this branch is documentation of it.

| Commit     | Subject                                                               |
| ---------- | --------------------------------------------------------------------- |
| `0b93f8d6` | docs(openspec): affected-pr-gate intent, specs and tasks              |
| `51b746de` | ci: affected gate on pull requests, full gate on merge queue and main |
| `4b956c2c` | ci: pixels shards run when the frontend is affected                   |

---

## 7. Live-Run Evidence — PENDING, owned by the controller

None of the rows below can be produced from a local worktree. Exact steps, in order:

1. **Push the branch and open a pull request.** Record the `gate` job's Nx task list from
   `nx-gate.log` (artifact `nx-gate-log-1`) and its elapsed time. It MUST be a strict
   subset of a full run's list, and the `Gate mode` step's log must show `mode=affected`
   with the pull request's base SHA.

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
