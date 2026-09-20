# 110.6 Retire the upstream sync machinery now that WBS is detached

|                                               |                                                                                                                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item                                     | 110.6, parent 110 "Also needed"                                                                                                                                                                                           |
| Size class                                    | M                                                                                                                                                                                                                         |
| Planning tokens (top model, high effort)      | 3,000,000                                                                                                                                                                                                                 |
| Implementation tokens (mid model, mid effort) | 9,000,000                                                                                                                                                                                                                 |
| Review tokens (top model, high effort)        | 4,000,000                                                                                                                                                                                                                 |
| Design it serves                              | the [code organization design](../../specs/2026-09-19-code-organization-design.md) and its [rollout plan](../2026-09-19-code-organization-rollout.md), both of which record that Dany declared WBS detached on 2026-09-19 |
| Execution contract                            | the [batch 1 README](../2026-09-19-batch-1/README.md), sections "Execution contract", "Rules for every executor" and "Standard blocks every packet uses". Linked, not copied; exact commands are written out.             |
| **Batch order**                               | **This packet lands FIRST in batch 2.** Section 11 says why, and what it saves the four other packets that touch the same pins.                                                                                           |

## 1. Goal and non-goals

**Goal.** Remove what exists in this repository only because WBS used to be
synchronised from `Prosperous-Unification/wbs-tool-v1`, and make the one check
that every batch 1 frontend packet had to hand-edit derive its expectation
instead of pinning a number.

**Non-goals.** Not archiving the `repo-namespacing` OpenSpec change (a live test
reads a file inside it, section 3.6). Not changing what any check refuses. Not
touching the occurrence digest: the first review proved it still guards something
the counts do not, so section 3.5 records that finding instead of acting on it.
Not touching Git state: the remote, the branches and the worktree that holds one
of them are section 9, for the planner and the owner. Not touching
`tools/tool-devsync/project.json`, which packet 020.8 owns.

**No new Nx target.** This packet adds no Nx target of any name, and the executor
stops if a step seems to need one. A rule requiring every test-running target
name to carry `CLAUDECODE=0` and `AGENT=0` in its `nx.json` default has been
reported as landing on a fix branch before batch 2 runs; **it is not on this
worktree** — neither variable appears in `nx.json` and
`tools/tool-devsync/src/workspace-targets.test.ts` enforces nothing of the kind
here. Nothing in this packet depends on it either way; the prohibition above
stands on its own.

## 2. Read first

| File                                                      | Why                                                                                                               |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                               | Rules R1 to R5. R5 in reverse governs this packet: a check may be retired only when the thing it guarded is gone. |
| `LLM_README.md`                                           | The router. Its third line is the subject of Slice A.                                                             |
| `../2026-09-19-batch-1/README.md`                         | Execution contract, standard blocks, the relative-counts rule.                                                    |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` | The whole file. Slices B and C edit it. Its tests are the subject of this packet.                                 |
| `tools/tool-devsync/project.json`                         | Read only. Its `inputs` list names what the target re-runs on. Do not edit it.                                    |
| `docs/findings/checks-that-cannot-fail-puni-00.md`        | Its opening paragraph is edited in Slice A.                                                                       |

**Line numbers.** This packet names line numbers only as "today, approximately",
because `main` has moved since it was written and the file will shift again.
Every step identifies its edit by the text it matches, never by the line it sits
on. A quoted string that is not found is a stop condition, not licence to guess.

## 3. Verified facts, 2026-09-20

Read or run in the worktree at `batch-2/planning`, head `6484986e`, and
re-checked after the first review.

### 3.1 There is no sync script, target, hook, workflow step or runbook

The headline finding, and the opposite of what the work item's title suggests.
Searched the tracked tree for `wbs-tool-v1`, `upstream`, `sync/`,
`merge wbs-tool`, `git fetch upstream` and `remote add upstream` across `*.md`,
`*.ts`, `*.mjs`, `*.sh`, `*.yml` and `*.json`:

- `package.json` defines **22** scripts — deploy, build, test, test:unit,
  test:queued, lint, format, format:check, typecheck, dev and its variants, e2e
  and three shell test scripts. None of them syncs anything.
- `lefthook.yml` has **six** pre-commit commands: `lint`, `format`,
  `plaintext-secrets`, `migration-lint`, `doc-caps` and `tool-wiki`, plus
  `prepare-commit-msg` and `commit-msg` stages. None mentions upstream or sync.
- `.github/workflows/` holds `ci.yml`, `deploy-k3s.yml`, `infra-check.yml`,
  `trusted-wiki.yml` and `twilight-bureaucrat-release.yml`. No sync job and no
  `sync/**` branch filter; `ci.yml` and `infra-check.yml` filter `branches: [main]`.
- `.nxignore` names `CLAUDE.md`, `GEMINI.md` and `.worktrees`. Nothing sync.
- `bin/dev-poll-sync.sh`, `bin/dev-poll.sh`, `tools/tool-devsync/src/sync.ts` and
  `tools/tool-devsync/src/poller.test.ts` are the **dev deploy**, not the upstream
  sync. The JSDoc at the head of `sync.ts` states it: dev serves from a
  bind-mounted checkout on h2puni and the deploy is a fetch-and-reset into it.
  `tool-devsync` is "dev sync". **Delete nothing there.**
- `infra/platform/telemetry/{local,production}/upstream.yaml` are OpenTelemetry
  collector upstreams. Unrelated.

So the sync machinery is entirely Git-side plus a few sentences. Section 9 has
the Git side.

### 3.2 The live prose references and what happens to each

| Location                                           | What it says                                                                       | Decision                                                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `LLM_README.md`, third line                        | announces that an integrated upstream pull-request set was merged, and links to it | **Delete** (Slice A). A sync-era status line about a completed merge that routes a reader of the index into a foreign repository. |
| `docs/findings/checks-that-cannot-fail-puni-00.md` | opens "recorded in puni-00 rather than upstream wbs-tool-v1"                       | **Keep, reword** (Slice A). The reason for the split file is still live — section 3.3 — only the descriptor is stale.             |
| `README.md`                                        | "WBS (project name `wbs-tool-v1` until 2026-09-06)"                                | **Keep unchanged.** A true historical naming fact on the public front page, useful to anyone holding an old link. Assumption A2.  |
| `HUMAN_README.md`, four places                     | `~/wd/puni/wbs-tool-v1` as the operator checkout                                   | **Keep unchanged.** Assumption A1.                                                                                                |

`openspec/HANDOFF-2026-08-30.md` is a dated session handoff whose session was
named `wbs-tool-v1-8b`, cited by `docs/2026-08-30-agent-loop-audit.md` and by an
archived verification record. Evidence, not machinery. Keep.

Two `Proof:` comments in the namespacing test mention sync merges. They are
observed-failure evidence under R5. **Keep verbatim** in every slice.

### 3.3 Why the split findings file must stay split

`docs/findings/root-migration.v1.json` declares three sources: `AGENTS.md` into
`docs/findings/checks-that-cannot-fail.md` under the heading "Checks that cannot
fail" with **52** pinned blocks, and `LLM_README.md` into
`docs/findings/current.md` under "Landmines" (2 blocks) and "Open findings"
(4 blocks), each block carrying a `sha256`. The inherited catalogue genuinely
cannot take additions, exactly as its sibling's opening paragraph says. The split
is a live constraint, not a sync artefact; only the describing word changes.

None of those pins covers the text Slice A edits: the two `LLM_README.md` sources
are pinned at a fixed `sourceRevision` under headings the current router no longer
carries.

### 3.4 What `repo-namespacing-handoff.test.ts` actually guards

Thirteen tests on this worktree, all green on a clean tree. Only two concern the
completed namespacing move: the migration path-and-blob manifest, which reads
`openspec/changes/repo-namespacing/preflight-inventory.md` and compares **92**
path/blob tuples, and the legacy-occurrence pin.

The other eleven are a general current-document sweep guarding live invariants:
routed documents resolve their links and anchors, every `nx run` selector in a
current document names a real project, every alias in `tsconfig.base.json` has an
allowed prefix and a tracked target, every exemption still names a tracked current
document and still needs each excuse, and the exemptions have not expired.
**None of these may be removed.** The file's _name_ is what is stale.

### 3.5 The digest: a real guard, and not this packet's to retire

The first draft proposed dropping the `digest` field as pure churn. **That was
wrong and the slice is gone.** `legacySourceOccurrences` builds each context as
path, line, matched text **and the complete trimmed source line**, then hashes the
sorted list. The reviewer replayed a fault that moved a legacy Dockerfile
reference from a proof comment in `tools/tool-dagger/src/main.ts` into a
production entry a couple of lines below: **every retained field stayed
identical** — same occurrence total, same category counts, `unclassified: []` —
and only the digest changed. A same-count substitution is exactly the regression
the counts accept and the digest catches, so the thing it guards has not gone
away.

The churn is real all the same: the expectation carries **24** dated `Proof:`
entries recording re-pins on this worktree, and a further re-pin for the
environment defaults is reported on `main` — reported, not verified here, since
this worktree does not carry that merge. Several of those entries record changed counts or
changed paths, not only shifted lines, which is the second reason the blanket
"only line numbers" claim was wrong. **Recorded as a finding for its own change**,
whose shape would be a context keeping the matched text and dropping the line
number, with a same-count substitution negative — and, because that changes what
the guard refuses, an OpenSpec change. Nothing here touches it.

### 3.6 `openspec/changes/repo-namespacing` is load-bearing

The migration manifest reads
`openspec/changes/repo-namespacing/preflight-inventory.md`, and
`tools/tool-devsync/project.json` lists that exact path in the `test` target's
`inputs`. Archiving the change would move the path and break the test.
Assumption A3: leave it.

### 3.7 Editing Markdown cannot move the digest

`isRelevantSourceConfig` returns `false` for the namespacing test file itself, for
any `*/README.md` and for any `*.md`. So **every documentation edit in this
packet, and every edit to that test file, is digest-neutral.** Slices A, B and C
cannot move `digest` or `occurrences`. The executor still records the literals at
step 0 and compares them after each slice, because a fact is not a substitute for
output.

### 3.8 The README coverage pin, and why it can be derived

`legacySourceOccurrences` returns `coverage.applicationLibraryToolReadmes`: the
number of paths in `await currentDocuments()` ending in `/README.md` under
`apps/`, `libs/` or `tools/`. It is pinned as a literal above **five** hand-written
re-pin comments, four of them added by batch 1 frontend packets, and the batch 1
README names it as shared state. `main` has moved it again since.

`currentDocuments()` builds that set by filtering `candidates`, which come from
`git ls-files --cached --others --exclude-standard`. Measured on this worktree:

```sh
git ls-files --cached --others --exclude-standard \
  | grep -E '^(apps|libs|tools)/.*/README\.md$' | wc -l
```

printed **23**, equal to the pinned literal. So the pin equals an enumeration
already available independently of `currentDocuments()`. **Yes, it should become a
derived check** (Slice B), in the shape the file already uses for Dockerfiles:
enumerate from `candidatePaths()` and assert the sweep reaches every one. That is
strictly stronger than a count — a count also passes when the sweep drops one
README and gains another — and it never needs a hand edit again.

### 3.9 The whole file is planner-only, including when run directly

The batch 1 README and the executor preamble say the devsync target is
planner-only because the namespacing test runs the wiki index checker over the
working tree and that writes Git objects. The first review made the sharper point
that **running the file directly executes that test too**, so avoiding the Nx
target changes nothing. Verified:

- the test named
  `the production index checker resolves current Markdown links and anchors`
  spawns `apps/wiki/cli/src/cli.ts check-indexes working <workspace> HEAD`;
- that reaches `apps/wiki/cli/src/inventory/read-candidate.ts`, whose
  `snapshotWorkingTree` (line 349 today) runs `git read-tree` and
  `git add --update -- .` under a scratch `GIT_INDEX_FILE`, then `write-tree`. The
  index is outside the repository; the **objects** land in the clone.

So every executor run of this file uses the filter below, and the unfiltered file
is the planner's. `tools/tool-devsync/src/poller.test.ts` also runs `git init`,
`add` and `commit`, but only inside fixture repositories under a temporary
directory, which the contract permits.

**The filter, verified on this worktree** (Bun matches describe and title joined;
these tests sit in no describe):

```sh
-t '^(?!the production index checker).*'
```

reported `1 filtered out` and ran the remaining twelve. On a clean clone that is
`12 pass, 1 filtered out, 0 fail`. On this shared planning worktree it currently
reports three extra failures, caused by other batch 2 authors' **untracked**
packets sitting in the same tree — the sweep reads untracked candidates too. That
is why every count in this packet is recorded by the executor at step 0 and never
taken from here.

## 4. Unknowns

- Whether the six local `sync/wbs-tool-v1-*` branches and their `origin`
  counterparts may be deleted. Owner decision; section 9.
- Whether `~/wd/puni/wbs-tool-v1` is still the operator checkout path on h1claw
  and h2puni. Not checkable from inside the repository; assumption A1.

## 5. File plan

| File                                                      | Slice | Create/modify | Responsibility                                                             |
| --------------------------------------------------------- | ----- | ------------- | -------------------------------------------------------------------------- |
| `LLM_README.md`                                           | A     | modify        | Remove the sync-era upstream pointer.                                      |
| `docs/findings/checks-that-cannot-fail-puni-00.md`        | A     | modify        | Reword two stale descriptors; keep the live reason for the split.          |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` | B, C  | modify        | Derive the README coverage assertion; derive the file's own excluded path. |

Nothing is created and nothing is deleted by the executor. **No temporary
mutation-only path outside this table is authorised**: every negative proof in
this packet mutates a file the table already names.

**Out of lane.** `tools/tool-devsync/project.json` (020.8 owns it), `README.md`,
`HUMAN_README.md`, `lefthook.yml`, `nx.json`,
`openspec/changes/repo-namespacing/**`, `docs/findings/root-migration.v1.json`,
`docs/findings/current-document-check-exemptions.json`, every `bin/*.sh`, every
workflow, and the dispatch launcher (section 10).

## 6. Step 0 — baseline, at the start of every slice

Counts are recorded, never read out of this packet. Call them by name and compare
against them afterwards.

- [ ] Record the starting state before touching anything, from the repository root:

  ```sh
  set -euo pipefail
  mkdir -p "$TMPDIR/evidence"
  git status --short --untracked-files=all | tee "$TMPDIR/evidence/status-before.txt"
  wc -l LLM_README.md | tee "$TMPDIR/evidence/router-lines-before.txt"
  git ls-files --cached --others --exclude-standard \
    | grep -E '^(apps|libs|tools)/.*/README\.md$' \
    | tee "$TMPDIR/evidence/readmes-before.txt" | wc -l
  grep -nE "^[[:space:]]+(digest: '[0-9a-f]+'|occurrences: [0-9]+),$" \
    tools/tool-devsync/src/repo-namespacing-handoff.test.ts \
    | sed 's/^[0-9]*://' | tee "$TMPDIR/evidence/pins-before.txt"
  ```

  Expected: `git status` may list other lanes' files, which is fine — what matters
  is that none of the three files in section 5 appears. `wc -l` prints the
  router's line count, call it **L**. The README list prints a count, call it
  **R**. The pin grep prints exactly **two** lines, a `digest:` literal and an
  `occurrences:` literal, with **no line numbers**: that stripped form is what
  later steps compare, because line numbers shift as the file is edited.

- [ ] Record the sandbox-safe test baseline. **Never run this file unfiltered**
      (section 3.9):

  ```sh
  if (cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts \
       src/repo-namespacing-handoff.test.ts \
       -t '^(?!the production index checker).*') \
       >"$TMPDIR/evidence/sweep-before.txt" 2>&1
  then baseline=green; else baseline=red; fi
  grep -c 'filtered out' "$TMPDIR/evidence/sweep-before.txt"
  sed -nE '/^\(fail\)/ { s/ \[[0-9.]+(ms|s)\]$//; p; }' \
    "$TMPDIR/evidence/sweep-before.txt" \
    | LC_ALL=C sort \
    | tee "$TMPDIR/evidence/baseline-failures.txt"
  tail -6 "$TMPDIR/evidence/sweep-before.txt"
  ```

  An empty failure list is expected for a green run. For every later comparison, extract and sort
  failure names with this same expression, using that run's saved output and a separate evidence
  file. Compare against the original baseline; never overwrite it. Preserve the complete raw output
  separately. (`grep` would exit 1 on a green run and stop the step under `set -e`, and its lines
  carry timings, so an unchanged failure would compare unequal.)

  **No `|| true`.** `AGENTS.md`'s failure policy and executor-preamble rule 4
  both forbid it, and a masked baseline lets one failure be quietly replaced by
  another. The status is captured in an `if` instead, and the failing tests are
  recorded **by name**, not merely counted.

  Record: passes **T**, failures **F**, and the exact contents of
  `baseline-failures.txt`. Require `1 filtered out`; if it is absent the filter
  did not match the index-checker test — STOP and report, because the next run
  would write Git objects into the clone.

  - **`baseline=green`** is the expected and required state. Continue.
  - **`baseline=red`** is a dispatch defect, not something to work around. STOP
    and report, naming every line of `baseline-failures.txt`. The planner clears
    it (section 10) and re-dispatches. Only if the planner's dispatch note
    explicitly lists those exact test names as tolerated may the attempt go on,
    and then two things are required at the end of every later run: the set of
    failing test names is **identical** to `baseline-failures.txt`, compared with
    `diff`, not by count; and every test this packet adds or changes passes on its
    own, run by its exact title.

- [ ] Record the OpenSpec baseline once per slice with the batch 1 README's
      standard validation block, unchanged, keeping its report under
      `$TMPDIR/evidence`. Record `summary.totals.passed` and `failed`. This packet
      adds no OpenSpec item, so both are unchanged at the end of every slice.

## 7. Slices

Each slice is independently revertible and dispatchable alone, and each begins
with step 0. Every negative proof follows the same shape, stated once here and
referred to afterwards as **the proof shape**:

1. `cp` the passing file to `$TMPDIR/passing.<name>`.
2. Apply the named mutation.
3. Save the patch with the batch README's exact form:
   `if diff -u "$TMPDIR/passing.<name>" <file> >"$TMPDIR/evidence/<name>.patch"; then echo "nothing was injected" >&2; exit 1; else test $? -eq 1; fi`
4. Run the named test, capturing its status inside an `if`, never through `tee`
   and never with a trailing `echo "status=$?"`:

   ```sh
   if (cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts \
        src/repo-namespacing-handoff.test.ts -t '<title>') \
        >"$TMPDIR/evidence/<name>.out" 2>&1
   then status=passed; else status=failed; fi
   ```

5. **Restore first**: `cp "$TMPDIR/passing.<name>" <file>` and `cmp` the two.
6. Only now read `$status` and the captured output, and decide. A post-proof stop
   condition (section 12.2) is evaluated after restoration, never before it.
7. Re-run step 0's filtered command and confirm it is back to **S** passes and
   **F** failures, where **S** is _this slice's own current expected pass count_
   defined in the table below, and the failing test names still match
   `baseline-failures.txt`.
8. Only after observing the failure, write the adjacent dated `Proof:` comment
   describing the injected fault and the line actually seen.

**The one pass count, defined per attempt.** Every attempt takes its own **T** at
its own step 0, so a delta is never carried between attempts:

| Attempt                 | Expected passes **S**                             |
| ----------------------- | ------------------------------------------------- |
| Slice A, throughout     | **T** (adds no test)                              |
| Slice B, before B1      | **T**                                             |
| Slice B, from B1 onward | **T + 1** (B1 adds one test; B5 removes none)     |
| Slice C, throughout     | **T** (adds no test, whether or not B has landed) |

Slice C's **T** already includes B1's test when B landed first, because C records
its own baseline against the tree it is given. Never expect **T + 1** in Slice C.

### Slice A — retire the upstream pointer from the two routers

- [ ] A1. In `LLM_README.md`, delete the whole line beginning
      `The integrated upstream PR set merged in`, **and** the blank line after it,
      so the title, one blank line and the paragraph beginning `**puni-00**`
      become consecutive. If that line is absent, STOP: another packet removed it.

- [ ] A2. In `docs/findings/checks-that-cannot-fail-puni-00.md`, make two
      word-level replacements in the opening paragraph:

  - Replace the sentence
    `The R5 entries recorded in puni-00 rather than upstream wbs-tool-v1.` with
    `The R5 entries recorded here after the wbs-tool-v1 history was merged in.`
    Leave the words that follow it on the same line.
  - In the Markdown link on the next line, replace the **visible text only** —
    `the upstream catalogue` — with `the inherited catalogue`. Do not touch the
    destination, the anchor, or anything after the closing parenthesis. This
    packet deliberately does not reproduce that line: a second copy of a relative
    Markdown link inside this document is read as a link of this document's own
    and fails the sweep from a directory where its target does not exist. Copy
    from the file, never from here.

  Leave the rest of the paragraph, the spelled-out count and every dated entry
  below untouched. In particular leave the entry recording a check found "while
  syncing upstream" exactly as it is: dated evidence of an observed failure.

- [ ] A3. Verify:

  ```sh
  set -euo pipefail
  wc -l LLM_README.md
  GSETTINGS_BACKEND=memory bunx prettier --check \
    LLM_README.md docs/findings/checks-that-cannot-fail-puni-00.md
  grep -nE "^[[:space:]]+(digest: '[0-9a-f]+'|occurrences: [0-9]+),$" \
    tools/tool-devsync/src/repo-namespacing-handoff.test.ts | sed 's/^[0-9]*://'
  ```

  Expected: the router is **L − 2** lines; prettier prints
  `All matched files use Prettier code style!` and exits 0; the two stripped pin
  lines are byte-identical to `$TMPDIR/evidence/pins-before.txt`, because both
  edited files are Markdown, which the scan excludes (section 3.7).

- [ ] A4. Re-run step 0's filtered sweep: **T** passes (Slice A adds no test),
      **F** failures whose names still match `baseline-failures.txt`, and
      `1 filtered out`. Then
      `NX_DAEMON=false GSETTINGS_BACKEND=memory bunx nx format:check --all`,
      exit 0, and the standard OpenSpec block with totals equal to step 0's.

**No negative proof is owed.** Slice A adds and changes no check; it deletes one
sentence of prose and rewords another. The checks that read these two files still
run over them, and A4 re-observes them at the recorded baseline.

**Ready to commit.** Paths: `LLM_README.md`,
`docs/findings/checks-that-cannot-fail-puni-00.md`. Subject:

```
docs: drop the upstream sync pointer now that WBS is detached
```

### Slice B — derive the README coverage expectation

All inside `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`. The order
matters: the new check is added and both of its assertions are proven **before**
the old pin is removed, so the invariant is never unguarded.

- [ ] B1. Add this test immediately after the test named
      `every Dockerfile naming variant participates in source inventory`. Write it
      **without** the `Proof:` comments; B3 and B4 add them after the failures are
      observed.

  ```ts
  test('the current-document sweep reaches every application, library and tool README', async () => {
    const tracked = candidatePaths()
      .filter((path) => /^(?:apps|libs|tools)\//.test(path) && path.endsWith('/README.md'))
      .sort();
    const swept = new Set(await currentDocuments());

    // An empty enumeration would make the coverage assertion below vacuously true, which is
    // the shape the pinned count used to rule out.
    expect(tracked.length).toBeGreaterThan(0);
    expect(tracked.filter((path) => !swept.has(path))).toEqual([]);
  });
  ```

- [ ] B2. Run the filtered sweep. Expected: **T + 1** passes — this slice's
      **S** from B1 onward — **F** failures whose names still match
      `baseline-failures.txt`, and `1 filtered out`. The old pin is still in
      place, so this run proves the new test agrees with it.

- [ ] B3. Negative proof one, for the coverage assertion. Using **the proof
      shape**, mutate `currentDocuments` to drop the README term: change

  ```ts
  return [...new Set([...documentCandidates(candidates), ...rootRouted, ...readmes])].sort();
  ```

  to

  ```ts
  return [...new Set([...documentCandidates(candidates), ...rootRouted])].sort();
  ```

  Run the named test by its exact unanchored title,
  `the current-document sweep reaches every application, library and tool README`.
  Expected after restoration: `status=failed`, `1 fail`, `0 pass`, and the diff is
  an array of the application READMEs the sweep no longer reaches — the backend
  README and the four frontend module READMEs among them. A run reporting
  `0 tests` or `matched 0 tests` is a failure to stop on. Other tests may fail
  under this mutation; per the contract that is recorded beside the proof, not a
  stop.

- [ ] B4. Negative proof two, for the non-empty guard, which B3 does not exercise.
      Using **the proof shape**, mutate `candidatePaths` to return an empty list:
      insert `return [];` as the first statement of its body. Run the same named
      test. Expected after restoration: `status=failed`, and the failure is the
      first assertion — a `toBeGreaterThan` diff with a received `0`. Many other
      tests fail under this mutation; record them beside the proof. Then write
      both dated `Proof:` comments, one above each assertion.

- [ ] B5. Only now remove the old pin, in three places:

  - the `applicationLibraryToolReadmes` member of the `coverage` object in the
    return type of `legacySourceOccurrences`;
  - the `applicationLibraryToolReadmes` property of the object it returns — the
    whole expression from
    `applicationLibraryToolReadmes: (await currentDocuments()).filter(` through
    its closing `).length,`;
  - in the legacy-occurrence expectation, the **entire five-entry re-pin comment
    block** that sits immediately above the `applicationLibraryToolReadmes:`
    literal, together with that literal. Each entry begins `// Re-pinned` and
    **continues onto one or two further comment lines**; delete the continuation
    lines too. Today the block is eleven consecutive comment lines for five
    entries, running from the first `// Re-pinned 17 -> 18` line down to the line
    immediately before the literal. Delete from the first line of that block
    through the literal inclusive, and nothing above or below it. Leaving a
    continuation line orphaned is a defect, not a partial success.

  Leave `dockerfiles`, `extensionlessScripts`, `policyJson`, `python`, every
  comment outside that block, and the `digest` and `occurrences` literals exactly
  as they are.

- [ ] B6. Verify:

  ```sh
  set -euo pipefail
  NX_DAEMON=false bunx nx run tool-devsync:typecheck
  NX_DAEMON=false bunx nx run tool-devsync:lint
  GSETTINGS_BACKEND=memory bunx prettier --check \
    tools/tool-devsync/src/repo-namespacing-handoff.test.ts
  grep -nE "^[[:space:]]+(digest: '[0-9a-f]+'|occurrences: [0-9]+),$" \
    tools/tool-devsync/src/repo-namespacing-handoff.test.ts | sed 's/^[0-9]*://'
  ```

  Expected: three exit-0 commands; the two stripped pin lines byte-identical to
  step 0. Then the filtered sweep at **T + 1** passes, **F** failures whose names
  still match `baseline-failures.txt`, and the
  OpenSpec totals unchanged. This slice removes a member from an interface's
  `coverage` shape, so the type check runs **in this slice**, per the batch 1
  finding about a moved type.

**Ready to commit.** Path:
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts`. Subject:

```
test(devsync): derive the README coverage check instead of pinning a count
```

### Slice C — derive the file's own excluded path

`isRelevantSourceConfig` excludes this test file from the legacy-root scan by a
hardcoded string. That literal is why renaming the file is a two-place change, and
why a rename done wrong silently changes what the scan reads.

- [ ] C1. Add, beside the existing `WORKSPACE` constant near the top:

  ```ts
  /**
   * This file's own workspace-relative path. Derived rather than written out, because the scan
   * below must skip it: its `Proof:` comments quote pre-move roots on purpose, and a stale literal
   * would silently fold them into the classified inventory.
   */
  const SELF = relative(WORKSPACE, fileURLToPath(import.meta.url));
  ```

  `relative` and `fileURLToPath` are already imported. Add no import.

- [ ] C2. In `isRelevantSourceConfig`, replace the comparison against the literal
      `'tools/tool-devsync/src/repo-namespacing-handoff.test.ts'` with a
      comparison against `SELF`, leaving the two conditions beside it alone.

- [ ] C3. Negative proof. Using **the proof shape**, point the constant at a path
      this file is not at:

  ```ts
  const SELF = 'tools/tool-devsync/src/not-this-file.ts';
  ```

  Run the test named
  `every legacy source occurrence and relevant text family is pinned`.

  **Expected, replayed on this worktree on 2026-09-20 while revising this
  packet:** `1 fail`, `0 pass`, and the diff shows the `test fixture or proof`
  category raised by this file's own occurrences — observed `106` becoming `126` —
  with `occurrences` and `digest` changed to match. **`unclassified` stays `[]`**,
  because the classifier tests `.test.ts` paths before it consults the
  classified-path list, so the file's own occurrences are classified rather than
  unclassified. The first draft expected a non-empty `unclassified` and would have
  stopped on a correct result. Stop only if the test **passes**, or if the
  category counts are unchanged.

- [ ] C4. Restore, `cmp`, re-run the filtered sweep to **T** passes and **F**
      failures whose names still match `baseline-failures.txt`. **T**, not
      **T + 1**: this slice adds no test, and its own step 0 already counted B1's
      test if Slice B landed first. Then write the dated `Proof:` comment beside
      `SELF`.

- [ ] C5. Verify: `NX_DAEMON=false bunx nx run tool-devsync:typecheck`,
      `NX_DAEMON=false bunx nx run tool-devsync:lint`, prettier `--check` on the
      file, the stripped pin lines equal to step 0, and OpenSpec totals unchanged.
      All exit 0.

**The rename is deferred, and is not the executor's.** With `SELF` derived, the
file can later be renamed to something describing the eleven live sweep tests
rather than a finished handoff — `current-document-sweep.test.ts` — by a planner
`git mv`, with no edit inside the file. It must wait until every batch 2 packet
that names the old filename has landed: `020-2-shared-failures.md`,
`040-4-plan-feed.md`, `110-1-test-axes.md` and `010-6-templates.md` all quote it
in commands. Section 11 has the order. Renaming earlier breaks their
instructions; a working-tree `mv` would additionally leave the old path in the
index, where the scan would try to read a file no longer on disk.

**Ready to commit.** Path:
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts`. Subject:

```
test(devsync): derive the document sweep's own excluded path
```

## 8. Verification table

| Command                                                                                                                                                  | Slice      | Expected                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `(cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts src/repo-namespacing-handoff.test.ts -t '^(?!the production index checker).*')` | 0, A, B, C | `1 filtered out`; **S** passes (section 7's table: **T** in A and C, **T + 1** from B1) and **F** failures whose names `diff` equal to `baseline-failures.txt` |
| `GSETTINGS_BACKEND=memory bunx prettier --check <the slice's own files>`                                                                                 | A, B, C    | exit 0; `All matched files use Prettier code style!`                                                                                                           |
| `NX_DAEMON=false GSETTINGS_BACKEND=memory bunx nx format:check --all`                                                                                    | A, B, C    | exit 0                                                                                                                                                         |
| `NX_DAEMON=false bunx nx run tool-devsync:typecheck`                                                                                                     | B, C       | exit 0                                                                                                                                                         |
| `NX_DAEMON=false bunx nx run tool-devsync:lint`                                                                                                          | B, C       | exit 0                                                                                                                                                         |
| `grep -nE "^[[:space:]]+(digest: '[0-9a-f]+'\|occurrences: [0-9]+),$" tools/tool-devsync/src/repo-namespacing-handoff.test.ts \| sed 's/^[0-9]*://'`     | A, B, C    | the two lines from `$TMPDIR/evidence/pins-before.txt`                                                                                                          |
| `wc -l LLM_README.md`                                                                                                                                    | A          | **L − 2**                                                                                                                                                      |
| The batch 1 README's standard OpenSpec block                                                                                                             | A, B, C    | one JSON report, `failed` 0, `passed` equal to step 0's                                                                                                        |

**Planner-only, with the expected relative delta.** The executor lists each as
pending planner verification and runs none of them:

| Check                                                                                                                     | Why planner-only                                                                         | Expected delta                                                                              |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run tool-devsync:test`                                                                           | Section 3.9: the index-checker test writes Git objects into the clone.                   | Slice A: unchanged count, green. Slice B: **+1** test. Slice C: unchanged.                  |
| The same file run unfiltered                                                                                              | Same reason. The executor never runs it.                                                 | One more test than the filtered run.                                                        |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:test` and `NX_DAEMON=false bunx nx run twilight-bureaucrat:test:package` | Whole targets; the first includes the root-migration suite, which reads the real router. | No change: section 3.3 shows the pins sit under headings the current router does not carry. |
| `bin/h2puni-gate.sh <sha>`                                                                                                | Shared build host.                                                                       | Not run in an attempt; report it as not run.                                                |
| The whole-tree `tool-wiki` pre-commit hook                                                                                | Runs at commit time under lefthook.                                                      | Planner sees it on commit.                                                                  |

**What none of it proves.** That the `upstream` remote and the sync branches are
gone: no check in the repository can see Git remotes, and section 9 is a human
step. Say so in the report.

**OpenSpec.** No OpenSpec change. R4 requires one for observable behaviour,
contracts, migrations, deploy safety or architecture; with Slice D dropped this
packet changes no refusal — Slice A is prose, Slice B replaces one expectation
with a strictly stronger one over the same production path, and Slice C derives a
constant. Assumption A4, now narrowed: the digest work that _would_ need an
OpenSpec change is in section 3.5 and is not in this packet.

## 9. Not the executor's: the Git side

None of this is a file, so none can be done inside an attempt. The planner does
the first two after the batch concludes; the third needs the owner.

1. **Preflight before touching any branch.** Run `git worktree list` and
   `git worktree list --porcelain`. On 2026-09-20 the branch
   `sync/wbs-tool-v1-2026-09-17` is **checked out** at
   `/tmp/puni-sync-wbs-tool-v1-20260917`, so ordinary deletion refuses it. Stop
   and ask the owner what that worktree is for, and confirm it is clean, before
   anything else. **Never force-delete a branch or a worktree**, and never
   `git clean` a gate tree.
2. `git remote remove upstream` — currently
   `git@github.com:Prosperous-Unification/wbs-tool-v1.git`, beside `origin` on
   `puni-00`. Removing the remote removes its tracking refs; there is no separate
   prune step. Then delete the five local `sync/wbs-tool-v1-*` branches that no
   worktree holds, one at a time, with the non-forcing delete.
3. Owner decides on the `origin/sync/wbs-tool-v1-*` branches on GitHub. They are
   merged history — the sync merge commits are on `main` — so deleting them loses
   nothing, but the repository is public and the owner may want the record.

## 10. Dispatch prerequisites for the planner

- **Dispatch with `--batch batch-2`.** No launcher change is needed: the first
  review's finding is superseded. `run-executor.sh` accepts `--batch <name>` and
  `--batch-dir <dir>`, and `batch-2` already resolves to the clone root
  `/home/df/wd/puni/batch-2`, the branch prefix `batch-2/`, the temporary root
  under `/tmp/puni-batch2` and the packet directory
  `docs/superpowers/plans/2026-09-20-batch-2`. Batch 1 is only the default.
  Passing `--batch-dir` as well is unnecessary and is not required here.
- The reviewed packet must be committed into the dispatch baseline, and its
  presence in the selected baseline verified once, before the first attempt.
- **Clear the sweep baseline before dispatching.** Step 0 now requires a green
  filtered run. On the shared planning worktree on 2026-09-20 that run was red:
  `9 pass, 3 fail, 1 filtered out`, from nonexistent `shared-failures` Nx
  selectors in `020-2-shared-failures.md` and a parsed nonexistent link in
  `010-6-templates.md`. **Committing those packets does not repair it**:
  `candidatePaths()` enumerates tracked _and_ untracked files, so the sweep reads
  their content either way. The planner either has those two packets' content
  defects fixed, or cuts the dispatch baseline from a commit that does not carry
  them, before the first attempt. If neither is possible, the dispatch note must
  list the exact tolerated test names, which step 0 then compares by name.
- Until this packet is committed, the unfiltered file reports
  `index checks cannot resolve untracked diagnostic paths` naming it. That is the
  untracked-file condition and nothing else; it clears on commit.

## 11. Batch order: this packet lands first

Five batch 2 packets read or edit the same shared state. Verified by reading them
in this worktree on 2026-09-20:

| Packet                     | What it does with the shared state                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `020-2-shared-failures.md` | Its slice C modifies the namespacing test's README count and digest "only if they are still literals", and edits `LLM_README.md`. It already branches on whether 110.6 has landed. |
| `040-4-plan-feed.md`       | Moves the README count pin by one on one branch of its step, and says so explicitly.                                                                                               |
| `110-1-test-axes.md`       | Names the namespacing test, `LLM_README.md` and the findings file as files 110.6 touches.                                                                                          |
| `010-6-templates.md`       | Reads the README pin as a fact about the tree.                                                                                                                                     |
| `040-1-chromium-proof.md`  | Touches neither the pins nor the router.                                                                                                                                           |

**Land 110.6 first.** Then, as a planner prerequisite before each of the others
is dispatched:

- **`020-2` — the one real incompatibility, and exactly what to change.** Its C4
  already inspects the two pins separately and re-pins only those that exist, so
  its _logic_ survives; what is wrong is its stated reasons. Slice D no longer
  exists, so `digests` can never be 0, and its `digests is 0 — 110.6's slice D
landed` branch and its lane note describing "its optional slice D drops the
  digest" are both false and must be rewritten to say that **110.6 leaves the
  digest a literal, and 020.2 always re-pins it** after observing the failure,
  with a dated comment naming what moved it. Its `readmes is 1` branch is then
  dead and its `readmes is 0` branch is the only live one. If 020.2 also counts
  tests in that file, it must allow for B1's added test.
- `040-4` no longer needs its branch A at all: adding a module README moves
  nothing, so its "23 to 24" step and its re-pin comment disappear, and with them
  the ownership conflict over the file.
- `110-1` can state the shared files as already handled rather than pending.
- `010-6` should read the derived check rather than the literal.
- The rename noted in Slice C waits until all four have landed, because each
  quotes the current filename in a command.

**If 110.6 cannot land first**, the same prerequisites invert and must be applied
to this packet instead: Slice B is re-baselined against whatever README literal
the others left behind (the derivation still lands, but its B2 agreement run is
against a moved number), `020-2` keeps both of its branches and needs only its
Slice D references removed, and `040-4` keeps its branch A and moves the literal
one last time. That ordering costs one more hand-edit of the pin and is the
outcome this packet exists to avoid, but it is not unsafe.

## 12. Stop conditions

These are two different lists, and conflating them is how a **successful**
implementation came to satisfy a stop condition in the previous revision. A
prerequisite asks "is the tree the one this packet was written against?" and is
checked **once, at step 0, before any edit**. A post-proof condition asks "did the
attempt stay honest?" and is checked **after restoring** an injected fault.

### 12.1 Step 0 prerequisites — checked once, before editing, never again

Each is FALSE on a clean clone of the dispatch baseline. Each is about the
**original** text, so none of them is re-evaluated after an intended edit has
replaced that text.

- Step 0's filtered run does not print `1 filtered out`.
- Step 0's filtered run is red and the dispatch note does not list its exact
  failing test names as tolerated (section 6).
- Any of the three files in section 5 already appears in step 0's `git status`.
- The line beginning `The integrated upstream PR set merged in` is absent from
  `LLM_README.md`, or either quoted sentence in the findings file is absent
  (Slice A).
- `applicationLibraryToolReadmes` is absent from the namespacing test (Slice B).
- The literal `'tools/tool-devsync/src/repo-namespacing-handoff.test.ts'` is
  absent from `isRelevantSourceConfig` (Slice C).

### 12.2 Post-proof and end-of-slice conditions — checked after restoring

- The restored file does not `cmp` equal to `$TMPDIR/passing.<name>`.
- The intended final expression is not present after the slice: Slice B's new
  test and no `applicationLibraryToolReadmes` anywhere in the file; Slice C's
  `SELF` constant and `path === SELF` in `isRelevantSourceConfig`, with the old
  literal gone — **its absence is the goal, never a stop.**
- A `-t` run reports `0 tests` or `matched 0 tests`.
- The filtered sweep does not return to this slice's own **S** and **F**, or the
  failing test names no longer `diff` equal to `baseline-failures.txt`.
- The stripped `digest:` or `occurrences:` line changes in any slice. Section 3.7
  says it cannot; if it does, something outside this packet's model moved, and the
  answer is a report, not a re-pin.
- A negative proof's named test passes after the mutation, or fails with a shape
  other than the one the step names. Extra tests failing under the same fault is
  **not** a stop: record them.
- Any step seems to need a file outside section 5's table, a new Nx target, or the
  unfiltered run of the namespacing test file.

## 13. Hand-over

The executor changes Git state nowhere. At the end of each slice, the section-5
files appearing in `git status --short --untracked-files=all` are exactly:

- Slice A: `LLM_README.md` and
  `docs/findings/checks-that-cannot-fail-puni-00.md`, both modified.
- Slice B, and Slice C, each on its own:
  `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, modified — including
  the lines added only by the required `Proof:` comments.

Other lanes' files may also be listed in a shared tree; they are not this
packet's. No mutation is left unrestored, and every scratch file stays under
`$TMPDIR`. Each slice's commit subject is in its own section. `$TMPDIR/evidence`
holds, per slice, the before and after test output, the mutation patches and the
failing output for each negative proof.

## 14. Assumptions recorded during planning

- **A1.** `HUMAN_README.md`'s four `~/wd/puni/wbs-tool-v1` paths stay: they name a
  checkout directory on hosts no attempt can reach, and sending an operator to a
  directory that may not exist, inside the incident runbook, is worse than a stale
  name. Flagged for the owner.
- **A2.** `README.md`'s `wbs-tool-v1` parenthetical stays: a true historical fact
  on the public front page.
- **A3.** `openspec/changes/repo-namespacing` is not archived (section 3.6).
- **A4.** No OpenSpec change for what remains; the digest work that would need one
  is recorded in section 3.5 and excluded.
- **A5.** The rename of the test file is deferred to a planner `git mv` after the
  four dependent packets land (section 11).
- **A6.** Nothing under `tools/tool-devsync/src/` named `sync` or `poller` is
  touched (section 3.1).
- **A7.** No temporary mutation-only path outside section 5 is authorised; the
  first draft's `lefthook.yml` proof is gone with the slice that needed it.

## 15. Review disposition

### First review, 2026-09-20 (Codex gpt-6-astra, high effort): NOT READY

| Finding                                                            | Disposition | What changed                                                                                                                                                                                   |
| ------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 Executor verification runs a Git-writing test                   | Fixed       | Confirmed: running the file directly still executes the index-checker test. Section 3.9 and every command now use the negative-lookahead filter, verified to report `1 filtered out`.          |
| C2 Absolute counts force correct executions to stop                | Fixed       | All counts are now **T**, **T + 1**, **F**, **L**, **R**, recorded at step 0. The thirteen-test stop condition is gone.                                                                        |
| C3 The specified fault cannot produce the required diagnostic      | Fixed       | Replayed the mutation and restored with `cmp`: the classifier types `.test.ts` first, so `unclassified` stayed `[]` and `test fixture or proof` went 106 to 126. C3 now expects exactly that.  |
| C4 Dropping the digest changes what the guard refuses              | Fixed       | Accepted. Slice D is deleted. Section 3.5 records the same-count substitution replay, corrects the "only line numbers" claim, and routes the work to its own change with an OpenSpec contract. |
| C5 D4's mutation is out of lane                                    | Fixed       | Gone with Slice D. Section 5 now states that no mutation-only path outside its table is authorised.                                                                                            |
| C6 The pin-reading command does not return its promised output     | Fixed       | Confirmed it printed four lines. Replaced with the anchored literal-only form, piped through `sed` to strip line numbers, saved and compared as stripped lines.                                |
| C7 The launcher cannot locate this packet                          | Fixed       | Confirmed the hardcoded batch 1 path and exit 69. Section 10 adds the planner prerequisite, outside the executor's lane.                                                                       |
| I1 Ownership is not disjoint; the rename breaks later instructions | Fixed       | Confirmed in the four packets. New section 11 orders 110.6 first and says what each of the others then drops; the rename is deferred until all four land.                                      |
| I2 The non-empty guard has no negative proof                       | Fixed       | New B4 injects an empty `candidatePaths()` and expects the `toBeGreaterThan` failure. B1 to B4 now run entirely before B5 removes the old pin.                                                 |
| I3 Required comparison baselines are never recorded                | Fixed       | Step 0 now records the router's line count and the standard OpenSpec report; every slice compares against them.                                                                                |
| I4 Fault commands do not preserve status or guarantee restoration  | Fixed       | "The proof shape" captures status in an `if`, restores and `cmp`s **before** any status is read, and section 12 repeats that stop conditions are evaluated after restoration.                  |
| I5 Branch cleanup meets an existing worktree attachment            | Fixed       | Confirmed the sync branch is checked out under a temporary path. Section 9 adds the preflight, forbids forced deletion, and drops the redundant prune step.                                    |
| M1 Inventory facts contain incorrect counts and anchors            | Fixed       | Re-measured: 22 scripts, six pre-commit commands, 92 migration tuples, 24 `Proof:` entries, `snapshotWorkingTree` at line 349. The inaccurate blanket explanation went with Slice D.           |
| M2 Several verification entries are not runnable commands          | Fixed       | Full `NX_DAEMON=false bunx nx run twilight-bureaucrat:test` and `:test:package` forms; `NX_DAEMON=false` added to the format check; every path written out in full.                            |

### Second review, 2026-09-20 (Codex gpt-6-astra, high effort): NOT READY

The four round-one items carried as PARTLY are closed here: C2 by section 7's
per-attempt table, C7 by the launcher's existing `--batch batch-2`, I1 by the
exact 020.2 prerequisite in section 11, and the masked baseline by section 6.

| Finding                                                               | Disposition | What changed                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1 Baseline failures are masked and accepted without identifying them | Fixed       | `\|\| true` and its claimed exception are gone; the status is captured in an `if`. Step 0 records the failing tests **by name** into `baseline-failures.txt`, requires a green baseline, and every later run compares that list with `diff`, never by count. Section 10 makes clearing it a dispatch prerequisite and records that committing the two offending packets does not repair it, because `candidatePaths()` enumerates untracked files too. |
| C2 Correct restored runs have impossible expected totals              | Fixed       | Section 7 now carries one per-attempt table: A = **T**, B = **T** until B1 then **T + 1**, C = **T** regardless of whether B landed, because C takes its own baseline. Proof-shape step 7, A4, B2, B6, C4 and the verification table all read from it.                                                                                                                                                                                                 |
| I1 Ordering first does not resolve 020.2's retained-digest conflict   | Fixed       | Read 020.2 as it now stands: its C4 already branches on each pin separately, so its logic survives, but its `digests is 0 — slice D landed` branch and its lane note are false. Section 11 makes rewriting both a planner prerequisite, says 020.2 **always** re-pins the digest, and states the inverted prerequisites for the other landing order.                                                                                                   |
| I2 A successful implementation satisfies a stop condition             | Fixed       | Section 12 is split: 12.1 prerequisites are checked once at step 0 against the **original** text and never re-evaluated; 12.2 post-proof conditions require `cmp` success and the **intended final** expression, and say explicitly that the old literal's absence is the goal.                                                                                                                                                                        |
| I3 Dispatch instructions describe an already-fixed launcher           | Fixed       | Verified `--batch`/`--batch-dir` and the `batch-2` case in `run-executor.sh`. Section 10 now says to dispatch with `--batch batch-2` and names the clone root, branch prefix, temporary root and packet directory it selects. The launcher-change prerequisite is withdrawn.                                                                                                                                                                           |
| M1 The asserted environment enforcement does not exist on this tree   | Fixed       | Confirmed: neither variable is in `nx.json` and `workspace-targets.test.ts` enforces nothing of the kind here. Section 1 keeps the prohibition on adding targets and marks the rule as reported-on-a-fix-branch, not current. Section 3.5's re-pin claim is likewise marked reported, not verified.                                                                                                                                                    |
| M2 "Five comment lines" ambiguously specifies eleven lines            | Fixed       | B5 now says to delete the **entire five-entry block including its continuation lines** — eleven consecutive comment lines today — from the first `// Re-pinned 17 -> 18` line through the literal inclusive, and calls an orphaned continuation line a defect.                                                                                                                                                                                         |

### Third review, 2026-09-20 (Codex gpt-6-astra, high effort): DISPATCH AFTER FIXES

One blocking finding, correct, applied by the planner by hand. Step 0 extracted failing test names with `grep`, which exits 1 when a green baseline has no failures and so stopped a successful run under `set -euo pipefail`; and its lines carried per-run timings, so an unchanged failure compared unequal. The extraction is now the reviewer's `sed` expression, which strips the timing, sorts, and yields an empty list for a green run. Slice A is cleared for dispatch; notes about slices B and C are carried to their own attempts.
