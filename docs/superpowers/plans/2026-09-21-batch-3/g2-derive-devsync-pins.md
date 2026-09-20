# G2 Derive the two hand-moved devsync pins

|                                          |                                                                                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item                                | G2, under 080                                                                                                                                                                                                 |
| Size class                               | M                                                                                                                                                                                                             |
| Planning tokens (top model, high effort) | 1,200,000                                                                                                                                                                                                     |
| Execution contract                       | the [batch 1 README](../2026-09-19-batch-1/README.md), sections "Execution contract", "Rules for every executor" and "Standard blocks every packet uses". Linked, not copied; exact commands are written out. |
| Predecessor                              | [110.6](../2026-09-20-batch-2/110-6-retire-upstream-sync.md), whose section 3.5 recorded this work and said it needs its own OpenSpec change                                                                  |
| Governing principle                      | maximum agentic scalability WITH maximum conformity. Never buy throughput by loosening a check: keep what each pin protects, drop only what serialises lanes.                                                 |

## 1. Goal and non-goals

**Goal.** Two literals in `tools/tool-devsync` serialise every parallel lane.
Replace each with a form that fails on exactly the same faults but does not move
when an unrelated line is added above an occurrence, or when a project gains a
parent-relative target path.

**Non-goals.** Not relaxing what either check refuses. Not removing the
occurrence count, the category counts, the `unclassified` list, the `coverage`
manifest or any `toContainEqual` pin in either file. Not renaming either test
file (110.6's "The rename is deferred" owns that). Not touching
`tools/tool-devsync/project.json`, `docs/wiki-policy/*.json`, `nx.json`, any
Twilight Bureaucrat rule, or any file under `apps/wiki/cli`. **No new Nx target
of any name is created**; a step that seems to need one is a stop. Existing
targets are run, and one existing target's `command` string is edited and
restored during a single experiment (slice E, step E8).

## 2. Read first

| File                                                                          | Why                                                                                                                                |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                                   | Rules R1 to R5. R5's "provably breakable" is the whole subject of slices C and E.                                                  |
| `LLM_README.md`                                                               | The router.                                                                                                                        |
| `../2026-09-19-batch-1/README.md`                                             | Execution contract, standard blocks, the relative-counts rule.                                                                     |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                     | The whole file. Slices B and C edit it. Its dated digest `Proof:` entries are the churn record.                                    |
| `tools/tool-devsync/src/workspace-inventory.test.ts`                          | The whole file, including every `Proof:` comment. Slices D and E edit it.                                                          |
| `tools/tool-devsync/workspace-inventory.mjs`                                  | The module under test. Slice E's faults are injected here and restored.                                                            |
| `tools/tool-devsync/project.json`                                             | Read only. Its `test` target `inputs` name what re-runs. **Do not edit it.**                                                       |
| `../2026-09-20-batch-2/110-6-retire-upstream-sync.md`, sections 3.5, 3.7, 3.9 | Why the digest guards something the counts do not, why Markdown edits are digest-neutral, and why this whole file is planner-only. |

**Line numbers.** Every line number below is "today, approximately". Every step
identifies its edit by the text it matches. A quoted string that is not found is
a stop condition, not licence to guess.

**No number in this packet is a fact the executor may rely on.** `main` has moved
since this packet was written: the second batch 2 group is landing as PR #23,
where the inventory reads 170 rows across 84 files and the digest has been
re-pinned again, and batch 3 lane 050.4 will move the inventory by four more
rows. Every count, digest and total below is a **dated planner observation on the
worktree named in section 3**, kept so a reviewer can see what was rehearsed. The
executor records its own at that slice's step 0 and compares against those.

## 3. Verified facts

Read or run in a private worktree at `batch-3/planning`, head `da8be091`, on
2026-09-21. Section 2's warning applies to every number here.

### 3.1 The two literals, and who else reads them

`tools/tool-devsync/src/workspace-inventory.test.ts:110-111`:

```ts
expect(paths).toHaveLength(167);
expect(new Set(paths.map(({ file }) => file))).toHaveLength(84);
```

`tools/tool-devsync/src/repo-namespacing-handoff.test.ts:720-722`: a `digest:`
hex literal, `occurrences: 257`, and `unclassified: []`.

**No executable consumer outside those two files reads either literal.**
`git grep` for the digest string finds it in its own declaration and in planning
documents that quote it as prose; `git grep` for `toHaveLength(167)` and
`toHaveLength(84)` finds those two lines and prose quotations. No
`docs/wiki-policy/*.json`, no Twilight Bureaucrat rule, no `project.json`, no
docs check and no script reads them. Documentation quotations are not consumers:
nothing executes them.

### 3.2 What the inventory pin protects

`readDepthSensitiveConfigPaths` (`tools/tool-devsync/workspace-inventory.mjs:51`)
asks `readProjects` for projects, keeps those rooted under the application and
library trees (line 52), lists each root's `project.json` and `tsconfig*.json`
(`isProjectConfig`, line 15), parses each with `jsonc-parser`, and walks the
parsed object collecting every string containing `../`
(`collectParentRelativePaths`, line 25).

The `Proof:` history at `workspace-inventory.test.ts:91-109` records **one** real
fault and **four** re-pins. The real fault (2026-09-14) is a filter added to the
collector: 111 rows instead of 148. The other four are lanes raising the number
because a project gained configuration files or path mappings. So the pin
protects **that every parent-relative path in an app or library config is found**,
and serialises lanes for no other reason.

### 3.3 The inventory can be derived exactly

Observed: `readDepthSensitiveConfigPaths` returned **167** rows across **84**
files. An independent enumeration — a directory walk of the application and
library trees skipping `node_modules`, `dist` and dot-entries, then
`jsonc-parser`'s streaming `visit` reporting every string literal containing
`../` with the JSON path it sits at — returned **84** files and **167**
`(file, propertyPath, value)` triples, and the two sorted lists were
**byte-identical** (probed with `bun -e`: `identical? true`, `only oracle []`,
`only inventory []`).

The walk found **zero** configuration files outside a project root, so the
derived side is not a re-expression of the production side's own discovery: it
also catches a project being dropped.

**Probed library behaviour.** `jsonc-parser@3.2.0` (`bun.lock:1831`). Its `visit`
visitor's `onLiteralValue` receives
`(value, offset, length, startLine, startCharacter, pathSupplier)`. The **sixth**
argument is a **function**, not an array: `bun -e` on `{"a":{"b":["../x"]}}`
printed `"../x" function ["a","b",0]`, and calling `.join('.')` on it directly
throws `TypeError: path.join is not a function`. Array indices arrive as numbers,
so `pathOf().join('.')` yields exactly the shape `collectParentRelativePaths`
produces.

**`visit` is tolerant and must be given an `onError`.** Probed: `visit` on the
incomplete text `{"extends":"../../oops"` **emitted the value and did not
throw**; with an `onError` collector it reported one error whose
`printParseErrorCode` is `CloseBraceExpected`. Production
`workspace-inventory.mjs` collects parse errors and throws; the oracle must too,
or it silently reports whatever the tolerant visitor managed before the error.
Slice D prescribes that boundary and slice E proves it.

**Do not hand-write the extractor.** A hand-written comment stripper was tried
first and silently lost 60 rows: `apps/wbs/fe-01/tsconfig.app.json:8` contains
`"@/*": ["./src/*"]`, whose `/*` opened a block comment that ran to the next
`*/`. That is why the oracle uses the locked parser.

### 3.4 `jsonc-parser` is used but not declared

`tools/tool-devsync/workspace-inventory.mjs:5` imports `jsonc-parser`, and
`package.json` declares it **nowhere**: it resolves by hoisting from `@nx/js`'s
`^3.2.0`. Adding `"jsonc-parser": "3.2.0"` to the root `devDependencies` and
running `GSETTINGS_BACKEND=memory bun install` was rehearsed: it printed
`Checked 1602 installs across 1447 packages (no changes)`, added **one** line to
`bun.lock`, needed **no network**, and `bunx prettier --check package.json`
passed. This is section 10's planner pre-step, not an executor step.

### 3.5 What the digest pin protects

`legacySourceOccurrences` (`repo-namespacing-handoff.test.ts:336`) scans every
candidate path `isRelevantSourceConfig` accepts, matches `LEGACY_ROOT` per line,
and builds each context at line 356 as:

```ts
const context = `${path}:${String(offset + 1)}:${match[0]}:${line.trim()}`;
```

It then classifies the match and hashes the sorted context list. The **line
number in that key** is the whole source of the churn: the **29** dated `Proof:`
entries in that expectation are almost all of the form "the added lines shift
classified contexts only", "pushed from line 819 to 840", "count and unclassified
list unchanged". Two say outright that two lanes meeting at this literal is a
conflict by construction.

What the digest protects **beyond** the counts, per 110.6 section 3.5 and
re-verified here: a **same-count substitution** — a legacy root moving from a
proof comment into executable text in the same already-classified file.
Occurrences, every category count and `unclassified` all stay identical; only the
digest moves. That guard must survive.

### 3.6 The digest can be made line-insensitive without losing that guard

Rehearsed form, keying by file, matched text, **class** and trimmed line, keeping
duplicates and dropping the line number:

```ts
const context = `${path}:${match[0]}:${category}:${line.trim()}`;
```

Observed on this worktree: digest
`2f0d2926e8d85aed7089c3ad667f7a0f6ccb97c514152a9895893978fab3f22d`, with
`occurrences: 257` and every category count **unchanged**.

Two rehearsed experiments, both on `tools/tool-dagger/src/main.ts`, whose
`DOCKERFILE` map at line 17 carries a classified legacy root in the `Proof:`
comment at line 18:

- Inserting **one** unrelated comment line above `const DOCKERFILE` moved the
  pre-change digest from `4b3aac6c…` to `d66405a1…` — observed failing — and left
  the derived digest **green**.
- Reverting `workspace-inventory.test.ts` between its pre-change and post-change
  forms — a 65-line insertion and deletion in a scanned source file carrying
  **two** recursive tsconfig-selector contexts — left the derived digest **green
  in both directions**.

**The class component is load-bearing and separately proven.** Exchanging the
classification of exactly one occurrence in `lefthook.yml` with exactly one in
`tools/tool-devsync/src/sync.test.ts` leaves the occurrence total and **every**
category count unchanged and moves the digest from `2f0d2926…` to `7bae8ae1…`.
With `${category}` removed from the key, the same swap produced digest
`681ef06d…` — **identical** to the unswapped tree with `${category}` removed. So
the class component, and nothing else, is what catches a silent class change.
Slice C proves this on the real tree.

### 3.7 An unmerged index inflates every count built on `git ls-files`

`candidatePaths()` (`repo-namespacing-handoff.test.ts:136`) enumerates with
`git ls-files --cached --others --exclude-standard -z`. Probed in a throwaway
repository with one conflicted file: that listing printed the path **three
times**, once per stage, and `git ls-files --unmerged` printed its three stage
rows in `<mode> <sha> <stage>\t<path>` form. During a merge conflict every
occurrence in a conflicted file would therefore be counted two or three times,
and the derived digest — which deliberately keeps duplicates — would be wrong
rather than merely noisy.

`git ls-files --unmerged` printed nothing on the clean worktree. R5 says a
half-finished merge is unknown state: it must throw, not be counted. Slice B adds
that refusal.

The inventory oracle (section 3.3) walks the filesystem and does not consult
`git ls-files` at all, so it is unaffected by an unmerged index.

### 3.8 Dated baselines, and the whole-suite pins each slice moves

| Measurement, on the worktree of section 3                                                                            | Observed, 2026-09-21                                          |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx nx run tool-devsync:test --skip-nx-cache` | exit 0, `301 pass`, `0 fail`, `Ran 301 tests across 24 files` |
| the filtered namespacing sweep of section 6, **with this packet present in the tree**                                | `13 pass`, `0 fail`, `1 filtered out`                         |
| `bun test … src/workspace-inventory.test.ts`                                                                         | `4 pass`, `0 fail`                                            |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`                                        | `passed: 107`, `failed: 0`                                    |

| Slice | Whole-suite pin it moves                                                                                                                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | `openspec … validate --all` `passed` rises by exactly **1**. No test pin moves.                                                                                                                |
| B     | `digest` is re-pinned **once**, from the value B's own run reports. `tool-devsync:test` gains **one** test (`an unmerged index is refused instead of counted`), so its total rises by **one**. |
| C     | None.                                                                                                                                                                                          |
| D     | None. `workspace-inventory.test.ts`'s two literals are **deleted**, not re-pinned, and B has already made the digest blind to the line movement D causes.                                      |
| E     | None.                                                                                                                                                                                          |

`isRelevantSourceConfig` returns `false` for `SELF`, for any `*/README.md` and
for any `*.md` (lines 317-334), so slices B and C's own edits, and this packet
itself, are digest-neutral. Slices D and E edit a **scanned** file, which is
exactly why B must land first — section 11.

No file under `apps/wiki/cli` is created, so the Twilight Bureaucrat validator
identity does not change. No test pins it as a literal in any case.

### 3.9 The whole file is planner-only, and the executor's filter

Unchanged from 110.6 section 3.9: `repo-namespacing-handoff.test.ts`'s test
`the production index checker resolves current Markdown links and anchors` spawns
the wiki index checker, which writes Git objects into the clone. **The executor
never runs this file unfiltered.** It uses

```sh
-t '^(?!the production index checker).*'
```

which reports `1 filtered out`. `tool-devsync:test` as a whole target is
planner-only. `workspace-inventory.test.ts` writes no Git objects and the
executor runs it directly.

## 4. Unknowns, answered by assumption

- **A1.** `jsonc-parser` stays at `3.2.0`. The planner pins it exactly
  (section 10) rather than relying on hoisting from `@nx/js`.
- **A2.** The derived inventory oracle lives in the **test file**, not in
  `workspace-inventory.mjs`. Putting it in the module under test would let one
  edit narrow both sides at once.
- **A3.** The oracle's non-empty guard is `toBeGreaterThan(100)`, not an exact
  number: it rules out the vacuous both-empty pass without becoming a new literal
  lanes must move.
- **A4.** `occurrences` and the category counts in the digest expectation
  **stay**. They move only when an occurrence is genuinely added or removed,
  which is a real fact worth reviewing, not line churn.
- **A5.** The digest stays a single hashed literal rather than a per-file table.
  A per-file table would also de-serialise lanes but adds a regeneration artefact
  and 40-odd shared rows; the line-insensitive key removes the observed churn
  without either.
- **A6.** Directory-walk exclusions are `node_modules`, `dist` and any
  dot-entry. A future configuration file outside a project root makes the check
  fail loudly; that is the correct answer to "is every app or library config
  known".
- **A7.** The unmerged-index refusal **throws** rather than de-duplicating the
  stage rows. De-duplicating would let a half-finished merge report a coherent
  digest for a tree nobody can reproduce.

## 5. File plan

| File                                                                     | Slice           | Create/modify               | Responsibility                                              |
| ------------------------------------------------------------------------ | --------------- | --------------------------- | ----------------------------------------------------------- |
| `openspec/changes/derive-devsync-pins/proposal.md`                       | A               | create                      | Intent: problem, outcome, non-goals, constraints.           |
| `openspec/changes/derive-devsync-pins/specs/derive-devsync-pins/spec.md` | A               | create                      | The delta requirements both checks must satisfy.            |
| `openspec/changes/derive-devsync-pins/tasks.md`                          | A               | create                      | The five TDD slices.                                        |
| `openspec/changes/derive-devsync-pins/verify.md`                         | A, then all     | create, then append         | Commands, results and the R5 proof table.                   |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                | B, C            | modify                      | Derive the context key, refuse an unmerged index.           |
| `tools/tool-devsync/src/workspace-inventory.test.ts`                     | D, E            | modify                      | Derive the inventory; carry its new `Proof:` comments.      |
| `tools/tool-devsync/workspace-inventory.mjs`                             | E               | **mutate and restore only** | Four negative proofs. Left byte-identical.                  |
| `tools/tool-dagger/src/main.ts`                                          | C               | **mutate and restore only** | Two proofs and one experiment. Left byte-identical.         |
| `apps/wbs/be-01/scripts/solver-orphan-fixture.Dockerfile`                | C (C1 only)     | **mutate and restore only** | One negative proof. Left byte-identical.                    |
| `apps/wbs/be-01/tsconfig.json`                                           | E (E4, E5 only) | **mutate and restore only** | The malformed-configuration negatives. Left byte-identical. |
| `apps/wbs/be-01/project.json`                                            | E (E8 only)     | **mutate and restore only** | The parent-relative-target experiment. Left byte-identical. |

`.openspec.yaml` under the change directory is generated by the `new change`
command in slice A and is expected in `git status`.

**No mutation-only path outside this table is authorised.** Every row marked
mutate-and-restore is copied to `$TMPDIR` first, restored by `cp`, and confirmed
with `cmp` before its slice ends.

**Out of lane.** `tools/tool-devsync/project.json`, `nx.json`, `package.json`,
`bun.lock` (planner pre-step, section 10), `docs/wiki-policy/**`,
`docs/findings/**`, `apps/wiki/cli/**`, `LLM_README.md`, `AGENTS.md`.

**Neighbouring work, stated accurately.** The batch 2 packets that owned these
two files — 020.2 shared failures, which modified both; 110.6, which owned the
namespacing edits; and 040.4, a conditional one-line edit — have **landed**. This
packet starts from their result, and section 3's observations are taken on that
tree. No live batch 3 lane declares either file. Lane 050.4 will add
parent-relative configuration values, which this packet's derived form absorbs
without an edit; that is the point.

## 6. Step 0, at the start of every slice

Counts are recorded, never read out of this packet.

- [ ] Record the starting state, from the repository root:

  ```sh
  set -euo pipefail
  mkdir -p "$TMPDIR/evidence"
  git status --short --untracked-files=all | tee "$TMPDIR/evidence/status-before.txt"
  git ls-files --unmerged | tee "$TMPDIR/evidence/unmerged-before.txt"
  grep -nE "^[[:space:]]+(digest: '[0-9a-f]+'|occurrences: [0-9]+),$" \
    tools/tool-devsync/src/repo-namespacing-handoff.test.ts \
    | sed 's/^[0-9]*://' | tee "$TMPDIR/evidence/pins-before.txt"
  ```

  Expected: other lanes' files may appear in `git status`; none of the files in
  section 5 may. `unmerged-before.txt` must be **empty** — a conflicted index
  inflates every count in this packet (section 3.7); if it is not empty, STOP.
  The pin grep prints exactly **two** stripped lines. That stripped form is what
  later steps compare, because line numbers shift as the file is edited.

- [ ] Run this slice's **pre-edit check**, from section 12.1. That is the only
      place a prerequisite is evaluated, and it is scoped to this slice.

- [ ] Record the namespacing baseline. **Never run this file unfiltered**
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

  Record passes **T** and failures **F**. Require `1 filtered out`; if it is
  absent the filter did not match and the next run would write Git objects into
  the clone — STOP. An empty `baseline-failures.txt` is expected. `baseline=red`
  is a dispatch defect: STOP and report every line of `baseline-failures.txt`.
  **No `|| true`**: the status is captured in an `if`.

- [ ] Record the inventory baseline:

  ```sh
  if (cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts \
       src/workspace-inventory.test.ts) \
       >"$TMPDIR/evidence/inventory-before.txt" 2>&1
  then inventory=green; else inventory=red; fi
  tail -6 "$TMPDIR/evidence/inventory-before.txt"
  ```

  Record passes **I**. `inventory=red` is a dispatch defect: STOP and report.

- [ ] Record the OpenSpec baseline with the batch 1 README's **OpenSpec
      validation** block, unchanged, keeping its report under `$TMPDIR/evidence`.
      Record `summary.totals.passed` as **P** and `failed`, which is `0`.

## 7. The proof shape

Every negative proof in this packet follows it.

1. `cp` the passing file to `$TMPDIR/passing.<name>`.
2. Apply the named mutation, at the exact function and expression the row names.
3. Save the patch with the batch README's exact form:
   `if diff -u "$TMPDIR/passing.<name>" <file> >"$TMPDIR/evidence/<name>.patch"; then echo "nothing was injected" >&2; exit 1; else test $? -eq 1; fi`
4. Run the named test, capturing its status inside an `if`, never through `tee`:

   ```sh
   if (cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts \
        <file> -t '<title>') \
        >"$TMPDIR/evidence/<name>.out" 2>&1
   then status=passed; else status=failed; fi
   ```

5. **Restore first**: `cp "$TMPDIR/passing.<name>" <file>`, then `cmp` the two.
6. Only now read `$status` and the captured output.
7. Re-run this slice's baseline command and confirm it is back to its recorded
   counts.
8. Only after observing the failure, write the adjacent dated `Proof:` comment
   describing the injected fault and the diagnostic actually seen.

Preamble rule 20 governs: a proof succeeds when the named test fails **about the
row's fact**, whatever matcher wording appears. Extra failing tests are recorded,
not a stop. A named test left **passing** is first a location mistake: restore,
re-check the location once, redo once, then stop.

## 8. Slices

Five slices in a **mandatory order**: A, B, C, D, E. Section 11 says why.

### Slice A — open the OpenSpec change

Both checks change what they refuse, so OpenSpec is required.

- [ ] A1. Create the change with the batch 1 README's **Creating an OpenSpec
      change** block:

  ```sh
  OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 new change derive-devsync-pins --schema sdd-lean
  grep -n "schema: sdd-lean" openspec/changes/derive-devsync-pins/.openspec.yaml
  ```

  Expected: the second command prints one line. If it prints nothing, STOP.

- [ ] A2. Write `openspec/changes/derive-devsync-pins/proposal.md` with exactly
      this content (315 words, under the 400-word cap). If `new change` generated
      a template, replace its whole content.

  ```md
  ## Why

  Two literals in `tools/tool-devsync` serialise every parallel lane. The workspace inventory pins a row total and a file total, so any project that gains a parent-relative target path or configuration file must hand-edit them. The namespacing digest keys each legacy-root occurrence by its line number, so a comment line added above an unrelated occurrence moves it. The digest was re-pinned four times on one day and the inventory counts twice; two lanes meeting at one literal conflict by construction. Separately, the enumeration those counts rest on lists a conflicted path once per stage, so a merge in progress silently multiplies them.

  ## What Changes

  The inventory expectation becomes an equality against a second, independently derived enumeration of the same facts: a directory walk of the application and library trees for project and TypeScript configuration files, and a streaming JSONC visit reporting every string literal carrying a parent-relative segment, with its property path. That oracle refuses a configuration file it cannot parse. The legacy-occurrence context is keyed by file, matched text, class and trimmed source line instead of by line number, and an unmerged index is refused rather than counted.

  ## Non-Goals

  This change does not relax what either check refuses. It does not remove the occurrence count, the category counts, the unclassified list, the coverage manifest or any containment pin. It does not rename either test file, does not touch the devsync project manifest, the wiki policy files or any Twilight Bureaucrat rule, and creates no Nx target.

  ## Constraints

  Both checks must still fail on every fault their existing proof comments record. The derived inventory must still fail when the collector filters a property kind, when configuration discovery narrows, when project discovery narrows, or when a configuration file is malformed. The digest must still fail on a same-count substitution and on a silent class change. The JSONC parser is pinned exactly, because the executor has no network.
  ```

- [ ] A3. Write
      `openspec/changes/derive-devsync-pins/specs/derive-devsync-pins/spec.md`
      (create the directory) with exactly this content. Each `### Requirement:`
      carries a normative SHALL sentence directly beneath it, and every scenario
      uses exactly four hashtags; validation refuses anything else.

  ```md
  ## ADDED Requirements

  ### Requirement: The depth-sensitive inventory is checked against an independently derived enumeration

  The workspace inventory check SHALL compare `readDepthSensitiveConfigPaths`'s output with a second enumeration that discovers configuration files by walking the application and library trees and extracts parent-relative values with a streaming JSONC visit, and SHALL NOT pin a row total or a file total as a literal.

  #### Scenario: A project gains a parent-relative target path

  - **WHEN** an existing target's command in a project manifest gains a parent-relative path
  - **THEN** the check passes with no edit to the test file, because both enumerations report the new value

  #### Scenario: The collector filters a property kind

  - **WHEN** `collectParentRelativePaths` stops reporting output-directory values
  - **THEN** the check fails, naming every such row the derived enumeration still finds

  #### Scenario: Configuration discovery narrows

  - **WHEN** `isProjectConfig` stops matching the suffixed TypeScript configurations, or the project filter stops matching the library tree
  - **THEN** the check fails, naming the rows the derived enumeration still finds

  #### Scenario: The derived enumeration collapses

  - **WHEN** the derived enumeration returns fewer than one hundred rows
  - **THEN** the check fails on that assertion instead of passing vacuously against an equally empty inventory

  ### Requirement: The derived enumeration refuses a configuration file it cannot parse

  The derived enumeration SHALL collect the JSONC visitor's parse errors and SHALL throw, naming the workspace-relative file and its error codes, rather than reporting the values the tolerant visitor emitted before the error.

  #### Scenario: A configuration file is malformed

  - **WHEN** an application configuration file is truncated so that its closing brace is absent
  - **THEN** the check fails with a refusal naming that file, and no partial inventory is reported

  #### Scenario: The production parser no longer refuses it

  - **WHEN** the production inventory's own parse-error check is disabled and the same file is malformed
  - **THEN** the derived enumeration's own boundary refuses it, naming the same file

  ### Requirement: A legacy-root occurrence is identified by its text and class, never by its line number

  The legacy-occurrence check SHALL key each context by the file, the matched legacy root, the class the classifier gave it and the whole trimmed source line, SHALL keep duplicate contexts rather than de-duplicating them, and SHALL NOT include the line number.

  #### Scenario: An unrelated line is added above a classified occurrence

  - **WHEN** a comment line is inserted above a classified legacy-root occurrence in a scanned source file
  - **THEN** the digest, the occurrence count, the category counts and the unclassified list are all unchanged and the check passes with no edit

  #### Scenario: A legacy root moves from a comment into executable text

  - **WHEN** a legacy root is removed from a proof comment and added to an executable line in the same classified file, leaving the occurrence count and every category count unchanged
  - **THEN** the digest changes and the check fails

  #### Scenario: Two occurrences silently exchange their classes

  - **WHEN** one occurrence's class is exchanged with another occurrence's class, leaving the occurrence total and every category count unchanged
  - **THEN** the digest changes and the check fails

  #### Scenario: An occurrence is unclassified

  - **WHEN** a scanned file gains a legacy root that no classification rule covers
  - **THEN** the check fails with that context in the unclassified list, and the context carries no line number

  ### Requirement: An unmerged index is refused rather than counted

  The candidate enumeration SHALL refuse to proceed when the index holds any unmerged entry, naming each conflicted path, because the underlying listing reports a conflicted path once per stage and every count and digest built on it would otherwise be silently multiplied.

  #### Scenario: A merge is in progress

  - **WHEN** the index holds unmerged entries
  - **THEN** the enumeration throws, naming each conflicted path, instead of returning a listing with repeated paths

  #### Scenario: The index is clean

  - **WHEN** the index holds no unmerged entry
  - **THEN** the enumeration proceeds unchanged
  ```

- [ ] A4. Write `openspec/changes/derive-devsync-pins/tasks.md`:

  ```md
  ## 1. Open the change

  - [ ] 1.1 Record the intent, the delta requirements and the verification structure, and declare the JSONC parser exactly pinned.

  ## 2. Derive the legacy-occurrence context and refuse an unmerged index

  - [ ] 2.1 Key each context by file, matched text, class and trimmed line, refuse an unmerged index, and re-pin the digest from the observed value.

  ## 3. Prove the derived digest still refuses the recorded faults

  - [ ] 3.1 Inject the unclassified root, the same-count substitution, the class exchange and the discovery fault, observe each failing, restore, and record adjacent proof comments.

  ## 4. Derive the depth-sensitive inventory

  - [ ] 4.1 Add the independently derived enumeration with its parse-error boundary, prove it agrees with the existing totals, then replace them.

  ## 5. Prove the derived inventory still refuses a narrowed or malformed collector

  - [ ] 5.1 Inject the property-kind filter, the two discovery narrowings, the malformed configuration and the empty oracle, observe each failing, restore, and record adjacent proof comments.
  ```

  Tick `1.1` only; later slices tick their own.

- [ ] A5. Write `openspec/changes/derive-devsync-pins/verify.md`:

  ```md
  # Verification Report

  **Change**: `derive-devsync-pins`
  **Verified at**: `2026-09-21`
  **Verifier**: planner rehearsal, then the dispatched executors

  ## Results

  Each slice appends its own commands, exit statuses and decisive output lines here before handing
  over. Evidence is referenced by basename relative to that attempt's evidence directory.

  ## Failure proofs

  | Fault injected | Test that observed it | Result |
  | -------------- | --------------------- | ------ |
  ```

- [ ] A6. Verify:

  ```sh
  set -euo pipefail
  GSETTINGS_BACKEND=memory bunx prettier --write \
    openspec/changes/derive-devsync-pins/proposal.md \
    openspec/changes/derive-devsync-pins/tasks.md \
    openspec/changes/derive-devsync-pins/verify.md \
    openspec/changes/derive-devsync-pins/specs/derive-devsync-pins/spec.md
  GSETTINGS_BACKEND=memory bunx prettier --check \
    openspec/changes/derive-devsync-pins/proposal.md \
    openspec/changes/derive-devsync-pins/tasks.md \
    openspec/changes/derive-devsync-pins/verify.md \
    openspec/changes/derive-devsync-pins/specs/derive-devsync-pins/spec.md
  OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate derive-devsync-pins --json | tail -20
  ```

  Expected: `--write` exits 0, `--check` prints
  `All matched files use Prettier code style!` and exits 0, and the single-change
  validation reports `"passed": 1, "failed": 0`. Then the batch 1 README's
  **OpenSpec validation** block: `summary.totals.passed` is **P + 1**, `failed`
  is `0`. (Rehearsed on the section 3 worktree: 107 became 108.)

  A validation failure naming a requirement without a normative sentence, or a
  scenario heading with the wrong hashtag count, means the text above was not
  copied exactly. Re-copy once, rerun, and report both runs.

- [ ] A7. Append to `verify.md` under `## Results`: the two prettier runs, the
      two validation runs and their totals. **No negative proof is owed**: this
      slice adds no check.

**Ready to commit.** Working tree at hand-over,
`git status --short --untracked-files=all`:

```
?? openspec/changes/derive-devsync-pins/.openspec.yaml
?? openspec/changes/derive-devsync-pins/proposal.md
?? openspec/changes/derive-devsync-pins/specs/derive-devsync-pins/spec.md
?? openspec/changes/derive-devsync-pins/tasks.md
?? openspec/changes/derive-devsync-pins/verify.md
```

Subject:

```
docs(openspec): open the change that derives the two devsync pins
```

### Slice B — derive the legacy-occurrence context and refuse an unmerged index

All inside `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`.

- [ ] B1. Replace the whole of `candidatePaths` with a refusal plus a shared
      runner. Today it reads:

  ```ts
  function candidatePaths(): string[] {
    const invocation = Bun.spawnSync(
      ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      {
        cwd: WORKSPACE,
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    if (invocation.exitCode !== 0) {
      throw new Error(
        `cannot enumerate candidate source: ${new TextDecoder().decode(invocation.stderr)}`,
      );
    }
    return new TextDecoder().decode(invocation.stdout).split('\0').filter(Boolean);
  }
  ```

  Make it, in its post-Prettier form:

  ```ts
  /**
   * Refuse an unmerged index. `git ls-files --cached` lists a conflicted path once per stage, so
   * during a merge conflict the enumeration below reports that file two or three times and every
   * count and digest built on it is silently wrong. A half-finished merge is not a state these
   * oracles can describe, so they throw rather than count.
   *
   * @throws Error naming each unmerged path when the index holds any.
   */
  function refuseUnmergedIndex(unmergedListing: string): void {
    const paths = [
      ...new Set(
        unmergedListing
          .split('\0')
          .filter(Boolean)
          .map((entry) => entry.slice(entry.indexOf('\t') + 1)),
      ),
    ].sort();
    if (paths.length > 0) {
      throw new Error(`cannot enumerate candidate source: index is unmerged: ${paths.join(', ')}`);
    }
  }

  function gitOutput(argv: readonly string[]): string {
    const invocation = Bun.spawnSync(['git', ...argv], {
      cwd: WORKSPACE,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (invocation.exitCode !== 0) {
      throw new Error(
        `cannot enumerate candidate source: ${new TextDecoder().decode(invocation.stderr)}`,
      );
    }
    return invocation.stdout.toString();
  }

  function candidatePaths(): string[] {
    refuseUnmergedIndex(gitOutput(['ls-files', '--unmerged', '-z']));
    return gitOutput(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
      .split('\0')
      .filter(Boolean);
  }
  ```

  The non-zero-exit refusal message is unchanged, so no existing expectation of
  it moves.

- [ ] B2. Add this test **immediately before** the test named
      `the current-document sweep reaches every application, library and tool README`.
      Its comment is a statement of mechanism; B4 adds the `Proof:` comments after
      the failure is observed.

  ```ts
  test('an unmerged index is refused instead of counted', () => {
    const conflicted = [
      '100644 5626abf0f72e58d7a153368ba57db4c673c0e171 1\tdocs/current.md',
      '100644 ba2906d0666cf726c7eaadd2cd3db615dedfdf3a 2\tdocs/current.md',
      '100644 2299c37978265a95cbe835a4b0f0bbf15aad5549 3\tdocs/current.md',
      '',
    ].join('\0');

    // `git ls-files --cached` lists a conflicted path once per stage, so a merge in progress would
    // otherwise triple that file's occurrences and silently move every count and digest.
    expect(() => {
      refuseUnmergedIndex(conflicted);
    }).toThrow('cannot enumerate candidate source: index is unmerged: docs/current.md');
    expect(() => {
      refuseUnmergedIndex('');
    }).not.toThrow();
  });
  ```

- [ ] B3. Run the filtered sweep. Expected: **T + 1** passes, **F** failures
      matching `baseline-failures.txt`, `1 filtered out`. The digest is untouched
      so far, so this run proves the refusal is inert on a clean index.

- [ ] B4. Negative proof for the refusal, on the production path, by **the proof
      shape**, patch name `unmerged-probe`. In `candidatePaths`, change the
      argument list `['ls-files', '--unmerged', '-z']` — there is exactly **one**
      such list — to `['ls-files', '--cached', '-z']`, so the probe returns the
      real tracked listing and the refusal must fire. The new unit test does not
      reach `candidatePaths`, so the test to run here is
      `every legacy source occurrence and relevant text family is pinned`.
      Expected: `status=failed`, and the failure is the thrown
      `cannot enumerate candidate source: index is unmerged: …` naming tracked
      paths. Many other tests fail under this mutation; record them beside the
      proof. Restore, `cmp`, rerun green. Then write **two** dated `Proof:`
      comments: one inside the new test naming the synthetic stage listing it
      refuses, one above the `refuseUnmergedIndex(` call in `candidatePaths`
      naming this production-path fault and the message seen.

- [ ] B5. Now re-key the context. In `legacySourceOccurrences`, the scan loop
      today reads:

  ```ts
  for (const [offset, line] of lines.entries()) {
    for (const match of line.matchAll(LEGACY_ROOT)) {
      const context = `${path}:${String(offset + 1)}:${match[0]}:${line.trim()}`;
      contexts.push(context);
      const category = /^(?:apps|libs)\/\*+\//.test(match[0])
  ```

  Make those four lines:

  ```ts
  for (const line of lines) {
    for (const match of line.matchAll(LEGACY_ROOT)) {
      const category = /^(?:apps|libs)\/\*+\//.test(match[0])
  ```

  deleting the `const context = …` and `contexts.push(context);` lines from there
  and leaving the long classifier ternary that follows completely untouched.

  **There are two identical `for (const [offset, line] of lines.entries()) {`
  lines in this file** — today at lines 176 and 354. The one at 176 belongs to
  `staleSelectorFailures` and **must not be touched**; this packet never edits
  that function. Identify the right one structurally: it is the loop inside
  `legacySourceOccurrences` whose **next** line begins
  `for (const match of line.matchAll(LEGACY_ROOT))` and whose line after that is
  the `const context = …` template. `grep -cF 'String(offset + 1)}:${match[0]}'`
  prints `1` and names only that block; if it prints anything else, STOP.

- [ ] B6. Immediately after the classifier's final `: 'UNCLASSIFIED';` line and
      **above** the existing
      `categories[category] = (categories[category] ?? 0) + 1;`, insert:

  ```ts
  // A context is keyed by the file it sits in, the legacy root matched, the class the rules
  // above gave it and the whole trimmed source line — never by the line number. An unrelated
  // line added above an occurrence must not move this digest; a legacy root that moves from a
  // comment into executable text in the same file, or that changes class, still does, because
  // the line's text and the class are both part of the key. Duplicates are kept rather than
  // de-duplicated, so deleting one of two identical occurrences still moves the digest.
  const context = `${path}:${match[0]}:${category}:${line.trim()}`;
  contexts.push(context);
  ```

  There is exactly **one** `: 'UNCLASSIFIED';` line and exactly **one**
  `categories[category] = ` line in the file; if either grep returns more than
  one hit, STOP.

- [ ] B7. Read the new digest from the failing run:

  ```sh
  if (cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts \
       src/repo-namespacing-handoff.test.ts \
       -t 'every legacy source occurrence and relevant text family is pinned') \
       >"$TMPDIR/evidence/digest-repin.out" 2>&1
  then status=passed; else status=failed; fi
  grep -nE '^[-+] *"(digest|occurrences)"' "$TMPDIR/evidence/digest-repin.out"
  ```

  Expected: `status=failed`, and the grep prints exactly **two** lines — the old
  `digest` removed and a new one received. **`occurrences` must not appear**, and
  no category count may appear: this change re-keys contexts, it does not add or
  remove any. If `occurrences` or a category moves, STOP: the edit changed what
  is scanned, not how it is keyed.

  Replace the `digest:` literal with the value **this run reports**. Leave
  `occurrences:`, `unclassified:`, `categories:`, `coverage:` and every dated
  `Proof:` comment above the literal exactly as they are: those comments are the
  churn record this change ends, and stay verbatim as evidence.

- [ ] B8. Verify:

  ```sh
  set -euo pipefail
  GSETTINGS_BACKEND=memory bunx prettier --write tools/tool-devsync/src/repo-namespacing-handoff.test.ts
  GSETTINGS_BACKEND=memory bunx prettier --check tools/tool-devsync/src/repo-namespacing-handoff.test.ts
  NX_DAEMON=false bunx nx run tool-devsync:typecheck >"$TMPDIR/evidence/typecheck-b.log" 2>&1
  echo "status=$?" >>"$TMPDIR/evidence/typecheck-b.log"
  NX_DAEMON=false bunx nx run tool-devsync:lint >"$TMPDIR/evidence/lint-b.log" 2>&1
  echo "status=$?" >>"$TMPDIR/evidence/lint-b.log"
  tail -1 "$TMPDIR/evidence/typecheck-b.log"; tail -1 "$TMPDIR/evidence/lint-b.log"
  ```

  Expected: prettier `--check` prints
  `All matched files use Prettier code style!` and exits 0; both logs end
  `status=0`. This slice adds functions and changes a loop binding, so the type
  check runs **in this slice**. A lint failure whose only diagnostics are
  `simple-import-sort/imports` or `prettier/prettier` is fixed with
  `bunx eslint --fix tools/tool-devsync/src/repo-namespacing-handoff.test.ts` and
  both runs are reported (preamble rule 17); any other diagnostic is a stop.

  Then the filtered sweep at **T + 1** passes, **F** failures matching
  `baseline-failures.txt`, `1 filtered out`, and the batch 1 README's **OpenSpec
  validation** block with totals equal to step 0's.

- [ ] B9. Append every command and result to `verify.md`, with a
      `## Failure proofs` row for B4. Tick task 2.1.

**Ready to commit.** Working tree at hand-over — slice A is already committed, so
its files are tracked and unmodified:

```
 M openspec/changes/derive-devsync-pins/tasks.md
 M openspec/changes/derive-devsync-pins/verify.md
 M tools/tool-devsync/src/repo-namespacing-handoff.test.ts
```

Subject:

```
test(devsync): key legacy-root contexts by text and class, not by line number
```

### Slice C — prove the derived digest still refuses the recorded faults

Named test throughout, unanchored title, no `describe`:
`every legacy source occurrence and relevant text family is pinned`. A green run
reports `1 pass` and the rest filtered out; each failing run reports `0 pass`,
`1 fail`. A run reporting `0 tests` or `matched 0 tests` is a stop.

Five separate mutations because five separate facts are guarded; none may stand
in for another.

| #   | Fault, by file, function and exact expression                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Fact the test fails on                                                                                             | Diagnostic rehearsed on the section 3 worktree                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `apps/wbs/be-01/scripts/solver-orphan-fixture.Dockerfile`, the **only** `COPY` line (line 4 today): delete the `wbs/` segment from its source path, leaving the pre-move two-segment form.                                                                                                                                                                                                                                                                                                                        | An occurrence appears that no classification rule covers.                                                          | a `+ "UNCLASSIFIED": 1` category, `occurrences` 257 → 258, and the pre-move path in `unclassified` as `<file>:<matched root>:UNCLASSIFIED:<the whole COPY line>` — **carrying no line number** |
| 2   | `tools/tool-dagger/src/main.ts`: insert, immediately above `const DOCKERFILE: Record<Tier, string> = {`, a line declaring `const roundOneFault` whose string value is the backend's pre-move source root — that is, `apps/wbs/be-01/src` with the `wbs/` segment deleted.                                                                                                                                                                                                                                         | A new classified occurrence appears in an already-classified production file.                                      | `"production proof or revision transition"` 18 → 19, `occurrences` 257 → 258, digest changed                                                                                                   |
| 3   | `tools/tool-dagger/src/main.ts`, **same-count substitution**, two edits in one mutation. In the `Proof:` comment above the `DOCKERFILE` map, replace the backticked pre-move Dockerfile path with the words `the pre-move backend path`. In the map itself, delete the `wbs/` segment from the value of the **`be:`** entry only, leaving `gw:` and `fe:` untouched.                                                                                                                                              | The digest alone moves. This is the guard the counts do **not** give, and the reason the digest is kept at all.    | `occurrences` **unchanged at 257**, every category **unchanged**, `unclassified` still `[]`, digest `2f0d2926…` → `0dc79639…`, with a one-line `- Expected  - 1` / `+ Received  + 1` diff      |
| 4   | `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, **class exchange**. Directly after the classifier's first branch, `? 'current recursive selector'`, insert two ternary arms so that `lefthook.yml` is classed `'test fixture or proof'` and `tools/tool-devsync/src/sync.test.ts` is classed `'production proof or revision transition'`, with the original `: path.includes('/drizzle/') …` branch following. Each of those files carries exactly one non-recursive occurrence, so no total can move. | Two occurrences silently exchange classes. Only the `${category}` component of the key catches this.               | `occurrences` **unchanged at 257**, every category count **unchanged**, `unclassified` still `[]`, digest `2f0d2926…` → `7bae8ae1…`                                                            |
| 5   | `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, `const SELF = relative(WORKSPACE, fileURLToPath(import.meta.url));` becomes a string literal naming a file this is not — for example `'tools/tool-devsync/src/not-this-file.ts'`.                                                                                                                                                                                                                                                                      | The file stops excluding itself, so its own proof comments, which quote pre-move roots on purpose, enter the scan. | `"test fixture or proof"` 106 → 126, `"current recursive selector"` 31 → 33, `occurrences` 257 → 279, `unclassified` still `[]`                                                                |

Faults 2 and 3 are separate mutations of the same file because they prove
separate facts; fault 3 must **not** be folded into fault 2. Faults 4 and 5 are
separate mutations of the test file. Each restores its file from its own
`$TMPDIR` copy and confirms with `cmp` before the next begins.

- [ ] C1. Fault 1, by **the proof shape**, patch name `digest-unclassified-root`.
- [ ] C2. Fault 2, by **the proof shape**, patch name `digest-new-classified-root`.
- [ ] C3. Fault 3, by **the proof shape**, patch name `digest-same-count-substitution`.
- [ ] C4. Fault 4, by **the proof shape**, patch name `digest-class-exchange`.
      **Then, before restoring**, add the observation that isolates the class
      component: with the exchange still applied, also delete `${category}:` from
      the context template in `legacySourceOccurrences`, run the same named test,
      and record the received digest; then remove only the class exchange,
      leaving the template without `${category}:`, run again, and record that
      digest. The two must be **equal** — on the section 3 worktree both were
      `681ef06d…` — which demonstrates that removing the class component defeats
      the protection fault 4 proves. Then restore the file fully and `cmp`.
- [ ] C5. Fault 5, by **the proof shape**, patch name `digest-self-path`.
- [ ] C6. After every mutation is restored and `cmp` confirms each file is
      byte-identical, write the dated `Proof:` comments: faults 1, 2, 3 and 4
      above the `digest:` literal, below the existing dated history, each naming
      its injected expression and the diagnostic seen, with fault 4's also
      recording the equal-digest observation from C4; fault 5 appended to the
      existing `Proof:` block above `const SELF`.

- [ ] C7. The experiment the re-key exists for, recorded as an observation, not a
      test. By **the proof shape** but with the **opposite** expectation, patch
      name `digest-unrelated-comment-line`: in `tools/tool-dagger/src/main.ts`,
      insert one comment line,
      `// An unrelated explanatory line added by another lane.`, immediately above
      `const DOCKERFILE: Record<Tier, string> = {`. Run the named test.
      **Expected: it PASSES**, `1 pass`, `0 fail`. On the section 3 worktree the
      pre-change line-numbered key failed the same edit, moving the digest from
      `4b3aac6c…` to `d66405a1…`; that comparison is the planner's, recorded here,
      and the executor is not asked to reproduce it. Restore, `cmp`, rerun green.
      If it FAILS, stop and report: the derived key did not remove the
      serialisation.

- [ ] C8. Verify: prettier `--write` then `--check` on the test file;
      `tool-devsync:typecheck` and `tool-devsync:lint` under B8's
      status-recording wrapper, both `status=0`; the filtered sweep at **T**
      passes and **F** failures matching `baseline-failures.txt`; the batch 1
      README's **OpenSpec validation** block with totals equal to step 0's.

- [ ] C9. Append to `verify.md`: a `## Failure proofs` row for each of C1 to C5,
      and the C4 isolation observation and C7 under `## Results`. Tick task 3.1.

**Ready to commit.** Working tree at hand-over:

```
 M openspec/changes/derive-devsync-pins/tasks.md
 M openspec/changes/derive-devsync-pins/verify.md
 M tools/tool-devsync/src/repo-namespacing-handoff.test.ts
```

Subject:

```
test(devsync): prove the derived digest refuses every recorded fault
```

### Slice D — derive the depth-sensitive inventory

All inside `tools/tool-devsync/src/workspace-inventory.test.ts`. The derived
enumeration is added and proven to **agree** with the existing literals, by an
assertion that actually runs it, before those literals are removed.

- [ ] D1. Replace the file's import block. Today it reads:

  ```ts
  import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';

  import { expect, it } from 'bun:test';

  import { readDepthSensitiveConfigPaths } from '../workspace-inventory.mjs';
  ```

  Make it exactly:

  ```ts
  import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { fileURLToPath } from 'node:url';

  import { expect, it } from 'bun:test';
  import { type ParseError, printParseErrorCode, visit } from 'jsonc-parser';

  import { readDepthSensitiveConfigPaths } from '../workspace-inventory.mjs';
  ```

  That member order is the one `simple-import-sort` and Prettier settle on
  together; it was rehearsed through `eslint --fix` and `prettier --write`.

- [ ] D2. Immediately after
      `const WORKSPACE = new URL('../../../', import.meta.url);` and before
      `async function failureMessageOf`, insert exactly this, in its post-Prettier
      form. Write it **without** any `Proof:` comment; slice E adds those after
      the failures are observed.

  ```ts
  interface DepthSensitivePath {
    readonly file: string;
    readonly propertyPath: string;
    readonly value: string;
  }

  /**
   * Every project or TypeScript configuration file below `directory`, found by walking the directory
   * tree rather than by asking Nx which projects exist, so that a project the inventory's own
   * discovery drops is still enumerated here.
   */
  async function findConfigs(directory: string, found: string[] = []): Promise<string[]> {
    const entries = await readdir(join(fileURLToPath(WORKSPACE), directory), {
      withFileTypes: true,
    });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
        continue;
      }
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await findConfigs(path, found);
      else if (entry.name === 'project.json' || /^tsconfig(?:\.[^.]+)?\.json$/.test(entry.name)) {
        found.push(path);
      }
    }
    return found;
  }

  /**
   * Refuse a configuration file this oracle cannot parse. The oracle reads files the production
   * inventory's project-scoped discovery need not reach, so its own boundary must refuse malformed
   * trusted state rather than report whatever the tolerant visitor managed to emit before the error.
   *
   * @throws Error naming the workspace-relative file and every parse error code it carries.
   */
  function refuseUnparsableConfig(file: string, errors: readonly ParseError[]): void {
    if (errors.length > 0) {
      const failures = errors.map(({ error }) => printParseErrorCode(error)).join(', ');
      throw new Error(`cannot parse ${file}: ${failures}`);
    }
  }

  /**
   * The same inventory, derived a second way: a streaming JSONC visit reporting every string literal
   * carrying `../` with the property path it sits at. It shares no code with
   * `readDepthSensitiveConfigPaths`'s recursive object walk, so a filter added to that walk makes the
   * two disagree. It is not a pinned total, so a project that gains a parent-relative target path or
   * configuration file moves both sides together and needs no edit here.
   */
  async function readOraclePaths(): Promise<DepthSensitivePath[]> {
    const files = [...(await findConfigs('apps')), ...(await findConfigs('libs'))].sort();
    const paths: DepthSensitivePath[] = [];
    for (const file of files) {
      const text = await readFile(join(fileURLToPath(WORKSPACE), file), 'utf8');
      const errors: ParseError[] = [];
      visit(
        text,
        {
          onLiteralValue(value, _offset, _length, _startLine, _startCharacter, pathOf) {
            if (typeof value === 'string' && value.includes('../')) {
              paths.push({ file, propertyPath: pathOf().join('.'), value });
            }
          },
          onError(error, offset, length) {
            errors.push({ error, offset, length });
          },
        },
        { allowTrailingComma: true },
      );
      refuseUnparsableConfig(file, errors);
    }
    return paths;
  }

  function sortPathKeys(paths: readonly DepthSensitivePath[]): string[] {
    return paths
      .map(({ file, propertyPath, value }) => `${file}\0${propertyPath}\0${value}`)
      .sort();
  }
  ```

  `pathOf` is the visitor's **sixth** argument and is a function (section 3.3).
  The **four** leading underscores are required: the repository's lint rejects
  unused parameters without them.

- [ ] D3. **Prove agreement before removing anything.** In the test titled
      `pins the complete moved depth-sensitive configuration inventory`, insert
      these three lines **directly above** the existing
      `expect(paths).toHaveLength(167);`, leaving both pinned totals in place:

  ```ts
  const oracle = await readOraclePaths();

  expect(oracle.length).toBeGreaterThan(100);
  expect(sortPathKeys(paths)).toEqual(sortPathKeys(oracle));
  ```

  Run the inventory file. Expected: **I** passes, `0 fail`. This run executes the
  oracle and asserts full tuple equality **while the literals still hold**, so it
  establishes agreement rather than assuming it. If it fails here, the oracle
  disagrees with the production inventory on this tree — STOP and report the
  diff; never change a literal to make it pass.

- [ ] D4. Only now delete the two pinned totals — the two consecutive lines

  ```ts
  expect(paths).toHaveLength(167);
  expect(new Set(paths.map(({ file }) => file))).toHaveLength(84);
  ```

  The numbers on the dispatch tree may differ; identify them as the two
  `toHaveLength` calls sitting directly below the last `Proof:` comment line and
  directly above the first `expect(paths).toContainEqual({`. Delete **both**, and
  add **no** file-set replacement: `sortPathKeys` already carries each row's
  file, so the tuple equality in D3 subsumes file coverage, and a separate
  file-set assertion could never fail on its own.

  Leave every `Proof:` comment above them untouched — they are dated evidence,
  and the 2026-09-14 output-directory filter is replayed in slice E. Leave every
  `toContainEqual` below untouched.

- [ ] D5. Verify:

  ```sh
  set -euo pipefail
  GSETTINGS_BACKEND=memory bunx prettier --write tools/tool-devsync/src/workspace-inventory.test.ts
  GSETTINGS_BACKEND=memory bunx prettier --check tools/tool-devsync/src/workspace-inventory.test.ts
  if grep -nE 'toHaveLength\([0-9]+\)' tools/tool-devsync/src/workspace-inventory.test.ts \
       >"$TMPDIR/evidence/remaining-literals.txt" 2>"$TMPDIR/evidence/remaining-literals.err"
  then
    echo 'FAIL: a pinned total remains'; cat "$TMPDIR/evidence/remaining-literals.txt"; exit 1
  else
    grep_status=$?
    test "$grep_status" -eq 1 || {
      echo "FAIL: grep errored with status $grep_status"
      cat "$TMPDIR/evidence/remaining-literals.err"
      exit 1
    }
    echo 'both literals gone'
  fi
  grep -nE "^[[:space:]]+(digest: '[0-9a-f]+'|occurrences: [0-9]+),$" \
    tools/tool-devsync/src/repo-namespacing-handoff.test.ts | sed 's/^[0-9]*://'
  ```

  Expected: prettier `--check` exits 0; the middle block prints
  `both literals gone`; the two stripped pin lines are **byte-identical** to
  `$TMPDIR/evidence/pins-before.txt`. The three grep outcomes are distinguished
  explicitly — a match is a failure, status 1 is the success, any other status is
  an error — so nothing is masked and no required check is reported by an `echo`.

  Then `tool-devsync:typecheck` and `tool-devsync:lint` under B8's
  status-recording wrapper, both `status=0`. This slice introduces a new
  interface, so the type check runs **in this slice**.

- [ ] D6. Re-run the inventory file: **I** passes, `0 fail`. Re-run the filtered
      namespacing sweep: **T** passes, **F** failures matching
      `baseline-failures.txt`, `1 filtered out`, and the digest **unchanged** —
      slice B made it blind to the line movement this slice causes. If the digest
      test fails here, STOP: the derived key is not doing its job.

- [ ] D7. Append every command and result to `verify.md`. Tick task 4.1.

**Ready to commit.** Working tree at hand-over:

```
 M openspec/changes/derive-devsync-pins/tasks.md
 M openspec/changes/derive-devsync-pins/verify.md
 M tools/tool-devsync/src/workspace-inventory.test.ts
```

Subject:

```
test(devsync): derive the depth-sensitive inventory instead of pinning two totals
```

### Slice E — prove the derived inventory still refuses a narrowed or malformed collector

Named test throughout:
`pins the complete moved depth-sensitive configuration inventory`. It sits in no
`describe`, so the unanchored title is the correct `-t` filter (preamble
rule 18). A green run reports `1 pass`, `3 filtered out`; each failing run
reports `0 pass`, `3 filtered out`, `1 fail`. A run reporting `0 tests` or
`matched 0 tests` is a stop.

| #   | Fault, by file, function and exact expression                                                                                                                                                                                                | Fact the test fails on                                                                                           | Diagnostic rehearsed on the section 3 worktree                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `workspace-inventory.mjs`, in `collectParentRelativePaths`, the **only** occurrence of `if (candidate.includes('../')) {` becomes `if (candidate.includes('../') && segments.join('.') !== 'compilerOptions.outDir') {`. Replays 2026-09-14. | Every output-directory row the derived enumeration still finds is absent from the inventory.                     | `- Expected  - 44` / `+ Received  + 0`, at the `toEqual`                                                                        |
| 2   | `workspace-inventory.mjs`, in `isProjectConfig`, the **only** occurrence of `/^tsconfig(?:\.[^.]+)?\.json$/.test(name)` becomes `/^tsconfig\.json$/.test(name)`.                                                                             | Every suffixed TypeScript configuration's rows are absent — configuration discovery narrowed.                    | `- Expected  - 103` / `+ Received  + 0`                                                                                         |
| 3   | `workspace-inventory.mjs`, in `readDepthSensitiveConfigPaths`, the **only** occurrence of the two-branch project-root filter loses its library branch, keeping only the application one.                                                     | Every library row is absent — project discovery narrowed, which the oracle's own directory walk does not follow. | `- Expected  - 62` / `+ Received  + 0`                                                                                          |
| 4   | `apps/wbs/be-01/tsconfig.json`: delete its final `}` so the file is truncated.                                                                                                                                                               | Malformed trusted configuration is refused, not partially read.                                                  | thrown `cannot parse apps/wbs/be-01/tsconfig.json: CloseBraceExpected`, from the production module                              |
| 5   | Fault 4 **plus** a second edit: in `workspace-inventory.mjs`, the **only** `if (errors.length > 0) {` becomes `if (false && errors.length > 0) {`, disabling the production refusal so only the oracle's own boundary can fire.              | The oracle's own parse boundary is live, not merely shadowed by production's.                                    | the same `cannot parse apps/wbs/be-01/tsconfig.json: CloseBraceExpected`, thrown from `refuseUnparsableConfig` in the test file |
| 6   | `workspace-inventory.test.ts`: insert `return [];` as the **first statement** of `readOraclePaths`'s body, above `const files = …`.                                                                                                          | The non-empty guard, which faults 1 to 3 never reach.                                                            | the **first** assertion fails, a `toBeGreaterThan` diff with a received `0`                                                     |

`Expected` is the derived enumeration and `Received` the production inventory, so
a narrowing shows as rows removed from `Expected`. Record whatever diagnostic is
actually seen; the fact, not the wording, decides.

Faults 4 and 5 are deliberately layered and must run in that order, restoring
fully between them: fault 4 proves the refusal fires, fault 5 proves **which**
boundary fires it. They are distinguished by the file and line named in the stack
trace, so record that line for each.

- [ ] E1. Fault 1, by **the proof shape**, patch name `inventory-outdir`.
- [ ] E2. Fault 2, by **the proof shape**, patch name `inventory-config-name`.
- [ ] E3. Fault 3, by **the proof shape**, patch name `inventory-project-root`.
- [ ] E4. Fault 4, by **the proof shape**, patch name `inventory-malformed-config`.
      Copy **`apps/wbs/be-01/tsconfig.json`** aside and restore it from that copy.
- [ ] E5. Fault 5, by **the proof shape**, patch name `inventory-oracle-boundary`.
      Two files are mutated, so copy **both** aside and `cmp` **both** after
      restoring.
- [ ] E6. Fault 6, by **the proof shape**, patch name `inventory-empty-oracle`.
      Restore from a `$TMPDIR` copy of the **test** file.
- [ ] E7. After every mutation is restored and `cmp` confirms each file is
      byte-identical, write the dated `Proof:` comments inside the test, below the
      existing dated history: faults 1, 2, 3, 4 and 5 above
      `expect(sortPathKeys(paths)).toEqual(sortPathKeys(oracle));`, and fault 6
      above `expect(oracle.length).toBeGreaterThan(100);`.

- [ ] E8. The experiment the pin's removal exists for, recorded as an
      observation, not a test. By **the proof shape** but with the **opposite**
      expectation, patch name `inventory-parent-relative-target`: in
      `apps/wbs/be-01/project.json`, edit the **existing** `serve` target's
      command — the **only** occurrence of the string `bun --watch src/main.ts` —
      to `bun --watch ../be-01/src/main.ts`, which adds exactly one
      parent-relative value and creates no target. Run the whole inventory file.
      **Expected: it PASSES**, **I** passes, `0 fail`. On the section 3 worktree
      the pre-change form failed the same edit with `Expected length: 167` /
      `Received length: 168`; that comparison is the planner's and the executor is
      not asked to reproduce it. Restore `apps/wbs/be-01/project.json`, `cmp`,
      rerun green. If it FAILS, stop and report: the derived form did not remove
      the serialisation.

- [ ] E9. Verify: prettier `--write` then `--check` on
      `tools/tool-devsync/src/workspace-inventory.test.ts`;
      `tool-devsync:typecheck` and `tool-devsync:lint` under B8's
      status-recording wrapper, both `status=0`; the inventory file green at **I**
      passes; the filtered sweep at **T** passes and **F** failures matching
      `baseline-failures.txt`; the stripped namespacing pin lines equal to
      step 0's; the batch 1 README's **OpenSpec validation** block with totals
      equal to step 0's.

- [ ] E10. Append to `verify.md`: a `## Failure proofs` row for each of E1 to E6,
      and E8 under `## Results`. Tick task 5.1.

**Ready to commit.** Working tree at hand-over:

```
 M openspec/changes/derive-devsync-pins/tasks.md
 M openspec/changes/derive-devsync-pins/verify.md
 M tools/tool-devsync/src/workspace-inventory.test.ts
```

Subject:

```
test(devsync): prove the derived inventory refuses a narrowed collector
```

## 9. Verification table

Commands, expected exit status, and the line to look for. Counts marked
**relative** are compared with the slice's own step 0.

| Command                                                                                     | Slice      | Exit | Line to look for                                                         |
| ------------------------------------------------------------------------------------------- | ---------- | ---- | ------------------------------------------------------------------------ |
| `bun test … src/repo-namespacing-handoff.test.ts -t '^(?!the production index checker).*'`  | every      | 0    | **T** (B and C: **T + 1**) pass, **F** fail, `1 filtered out` (relative) |
| the same with `-t 'every legacy source occurrence and relevant text family is pinned'`      | B, C       | 1/0  | `0 pass` when a fault is injected, `1 pass` when green                   |
| `bun test … src/workspace-inventory.test.ts` (from `tools/tool-devsync`)                    | D, E       | 0    | **I** pass, `0 fail` (relative)                                          |
| the same with `-t 'pins the complete moved depth-sensitive configuration inventory'`        | E          | 1    | `0 pass`, `3 filtered out`, `1 fail` (each negative)                     |
| `NX_DAEMON=false bunx nx run tool-devsync:typecheck` (status-recording wrapper)             | B, C, D, E | 0    | `status=0`                                                               |
| `NX_DAEMON=false bunx nx run tool-devsync:lint` (status-recording wrapper)                  | B, C, D, E | 0    | `status=0`                                                               |
| `GSETTINGS_BACKEND=memory bunx prettier --check <owned files>`                              | every      | 0    | `All matched files use Prettier code style!`                             |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate derive-devsync-pins --json` | A          | 0    | `"passed": 1`, `"failed": 0`                                             |
| the batch 1 README's **OpenSpec validation** block                                          | every      | 0    | `passed` = **P** (A: **P + 1**), `failed` `0` (relative)                 |

## 10. Planner-only

Nothing here is the executor's; each is reported as "pending planner
verification".

**Pre-step, before slice D is dispatched.** Declare `jsonc-parser` exactly pinned
(section 3.4), commit it, and dispatch from that commit:

```sh
# add "jsonc-parser": "3.2.0" to the root package.json devDependencies, then:
GSETTINGS_BACKEND=memory bun install
GSETTINGS_BACKEND=memory bunx prettier --check package.json
```

Expected, rehearsed: `Checked 1602 installs across 1447 packages (no changes)`,
one added line in `bun.lock`, no network, prettier exit 0. Subject:
`build: declare the jsonc-parser version the devsync inventory already imports`.
Without this the executor still works — the package resolves by hoisting — but
the version is unpinned.

**Before each slice.** Record the whole-target baseline on the dispatch tree:

```sh
NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx nx run tool-devsync:test --skip-nx-cache
```

Call its pass count **W** and its file count **V**.
`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT` is required: `CLAUDECODE=1` changes
Bun's output and fails 13 unrelated tests.

**After each slice**, stage the executor's files — the index checker refuses
untracked files — and run the same command. Expected deltas, never absolutes:

| Slice | Expected whole-target result        |
| ----- | ----------------------------------- |
| A     | **W** pass, **V** files, exit 0     |
| B     | **W + 1** pass, **V** files, exit 0 |
| C     | **W + 1** pass, **V** files, exit 0 |
| D     | **W + 1** pass, **V** files, exit 0 |
| E     | **W + 1** pass, **V** files, exit 0 |

Dated historical observation only: on the section 3 worktree **W** was 301 and
**V** was 24 before slice B, and 302 after it. Another lane adding a test to this
target moves **W** without touching either of G2's files, which is why the deltas
above, not those numbers, are the contract.

**At the end.**
`NX_DAEMON=false GSETTINGS_BACKEND=memory bunx nx format:check --all`, then
`bin/h2puni-gate.sh <sha>` on the shared build host with the committed hash,
recording the printed `h2puni gate: running on <sha>` line and the exit status.
The executor never runs the host gate and says so.

**No `--network` is needed** at dispatch: nothing in this packet binds a port.

## 11. Slice order

**A, B, C, D, E, and no other order is permitted.**

- A must be first: the change must exist before its tasks are ticked.
- **B must precede D.** D and E edit `workspace-inventory.test.ts`, a **scanned**
  source file carrying two recursive tsconfig-selector contexts, so under the
  pre-change line-numbered key D's insertion moves the digest and turns the
  namespacing sweep red. Every slice's step 0 requires a green sweep, and
  section 10 requires a green whole target after every slice, so a red digest
  between slices is not a state this packet tolerates. With B landed, D moves
  nothing: rehearsed by reverting `workspace-inventory.test.ts` between its
  pre-change and post-change forms with the derived key in place — green in both
  directions.
- C depends on B; E depends on D.

The digest is re-pinned exactly **once**, in B.

## 12. Stop conditions

### 12.1 Pre-edit checks, each evaluated only at its own slice's step 0

A successful earlier slice must never trip a later slice's prerequisite, so each
row below is checked **only** in the slice named, and each states the tree that
slice is entitled to.

| Slice | Checked at its step 0                                                                                                                                                                                           | Stop when                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| A     | `test ! -e openspec/changes/derive-devsync-pins`                                                                                                                                                                | the directory already exists |
| B     | `grep -cF 'String(offset + 1)}:${match[0]}' tools/tool-devsync/src/repo-namespacing-handoff.test.ts` prints `1`, and `openspec/changes/derive-devsync-pins` **exists**                                          | either is false              |
| C     | `grep -cF ':${match[0]}:${category}:' tools/tool-devsync/src/repo-namespacing-handoff.test.ts` prints `1` — slice B has landed                                                                                  | it is false                  |
| D     | `grep -cE 'toHaveLength\([0-9]+\)' tools/tool-devsync/src/workspace-inventory.test.ts` prints `2`, and slice B's re-keyed context is present by C's grep                                                        | either is false              |
| E     | `grep -cF 'readOraclePaths' tools/tool-devsync/src/workspace-inventory.test.ts` prints at least `2`, and `grep -cE 'toHaveLength\([0-9]+\)'` on the same file prints nothing with status 1 — slice D has landed | either is false              |

Checked on the tree of section 3, before any slice ran: A's condition held (the
directory was absent), B's grep printed `1`, and D's grep printed `2`. C's, D's
second and E's conditions describe their predecessor's result and are false only
if that predecessor did not land.

B's grep deliberately anchors on `}:${match[0]}`. The shorter
`grep -cF 'String(offset + 1)'` prints **2** on this tree, because
`staleSelectorFailures` builds its own failure string the same way; B5 says which
of the two loops is the one to edit.

### 12.2 Conditions that apply to every slice

Each is **FALSE** on the real starting tree; each was checked.

1. `git ls-files --unmerged` prints anything at step 0 (checked: prints nothing).
2. Step 0's filtered sweep reports anything other than `1 filtered out`
   (checked: reports `1 filtered out`).
3. Step 0's filtered sweep or inventory run is red (checked: the sweep was
   `13 pass, 0 fail, 1 filtered out` **with this packet present in the tree**,
   and the inventory `4 pass, 0 fail`).
4. `grep -cF ": 'UNCLASSIFIED';" tools/tool-devsync/src/repo-namespacing-handoff.test.ts`
   does not print `1` (checked: prints `1`).
5. `jsonc-parser` cannot be imported from a test under `tools/` (checked:
   `tool-devsync:lint` and `tool-devsync:typecheck` both exit 0 with the import
   present).
6. A step needs a file outside section 5's table, or needs a **new** Nx target of
   any name. Running an existing target, and slice E's temporary edit to the
   `serve` target's `command`, are expressly permitted.

Post-proof conditions, evaluated only **after** restoration (section 7):

7. A named negative leaves its named test **passing**, after one location
   re-check.
8. A negative moves `occurrences` or a category count where its row says
   "unchanged", or leaves them unchanged where its row says they move.
9. C7 or E8 — the two experiments — **fails**. The derived form would not have
   removed the serialisation, which is the packet's whole purpose.

## 13. Hand-over

Each slice's own working-tree status is printed under its "Ready to commit"
heading, because the batch contract commits each reviewed slice before the next is
dispatched: after A the change files are tracked, and after D the inventory edit
is committed. Those blocks are the `git status --short --untracked-files=all` the
executor must see, path by path, including files changed only by required
`Proof:` comments.

Cumulatively, when all five have landed, the change touches:

```
openspec/changes/derive-devsync-pins/.openspec.yaml
openspec/changes/derive-devsync-pins/proposal.md
openspec/changes/derive-devsync-pins/specs/derive-devsync-pins/spec.md
openspec/changes/derive-devsync-pins/tasks.md
openspec/changes/derive-devsync-pins/verify.md
tools/tool-devsync/src/repo-namespacing-handoff.test.ts
tools/tool-devsync/src/workspace-inventory.test.ts
```

`tools/tool-devsync/workspace-inventory.mjs`, `tools/tool-dagger/src/main.ts`,
`apps/wbs/be-01/project.json`, `apps/wbs/be-01/tsconfig.json` and
`apps/wbs/be-01/scripts/solver-orphan-fixture.Dockerfile` are mutated during
proofs and **must never appear** in any hand-over status: each is restored and
`cmp`-verified. If one appears, a restore was missed — say so rather than
committing it.

## 14. Assumptions recorded

A1 to A7 are in section 4. In addition:

- **A8.** The executor's tree may carry other lanes' untracked files, which the
  legacy-root scan reads, and `main` has moved since this packet was written.
  Every digest, count and total here is therefore a dated planner observation;
  the executor pins the value **its own run reports** (B7). That is the only
  literal the executor writes.
- **A9.** The dates in new `Proof:` comments are the executor's actual run dates.
- **A10.** `docs/wiki-policy/*.json` and the Twilight Bureaucrat rules pin inputs
  of these files but read neither literal (section 3.1), so no policy file
  changes.
- **A11.** This packet is itself a `docs/` Markdown file and is therefore read by
  the current-document sweep. It is written without any contiguous pre-move root,
  which is why slice C's fault rows prescribe deleting the `wbs/` segment rather
  than quoting the resulting path. A future edit that quotes one turns the sweep
  red; section 15 records how that was found.

## 15. Disposition of review 1

The review's slice letters were A, B, C, D, E for OpenSpec, inventory,
inventory-negatives, digest, digest-negatives. The mandated order put the digest
work first, so the letters are now A, B, C, D, E for OpenSpec, digest,
digest-negatives, inventory, inventory-negatives.

| Finding                                                    | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Critical 1** — the packet fails its own sweep            | **FIXED.** Reproduced: `11 pass, 2 fail, 1 filtered out`, with six matches on three lines of the old digest-fault table. Rewritten so slice C's rows prescribe deleting the `wbs/` segment instead of quoting the pre-move path. Re-run with the packet in the tree: `13 pass, 0 fail, 1 filtered out`. Recorded as assumption A11 and in section 3.8.                                                                         |
| **Critical 2** — contradictory slice order                 | **FIXED.** Section 11 states one mandatory order, digest work first. The "either order is safe" claim and the red-sweep continuation are gone; section 3.8's table is rewritten around it.                                                                                                                                                                                                                                     |
| **Critical 3** — earlier slices trip later stop conditions | **FIXED.** Section 12.1 is a per-slice pre-edit table: each prerequisite is evaluated only at its own slice's step 0, and later slices require the **predecessor's** state instead of the original.                                                                                                                                                                                                                            |
| **Critical 4** — the experiment is forbidden twice         | **FIXED.** `apps/wbs/be-01/project.json` is in section 5 as an E8-only mutate-and-restore row. The experiment now edits the **existing** `serve` target's command (`bun --watch src/main.ts` → `bun --watch ../be-01/src/main.ts`) instead of adding a target; rehearsed — derived form passed, pre-change form failed 167/168. Stop condition 6 now prohibits a **new** target and expressly permits running existing ones.   |
| **Important 1** — B3 never ran the oracle                  | **FIXED.** D3 inserts the oracle call and the tuple equality **above** the surviving literals and runs green there; only D4 deletes them. Rehearsed.                                                                                                                                                                                                                                                                           |
| **Important 2** — the oracle accepts malformed input       | **FIXED.** Probed and confirmed: `visit` emitted the value of `{"extends":"../../oops"` without throwing. The oracle now collects `onError`, passes `{ allowTrailingComma: true }`, and refuses through `refuseUnparsableConfig`. Negatives E4 (production path) and E5 (production refusal disabled, so only the oracle's boundary can fire) both rehearsed red, with `apps/wbs/be-01/tsconfig.json` authorised in section 5. |
| **Important 3** — the file-set assertion cannot fail       | **FIXED.** Removed; D4 says why the tuple equality subsumes it.                                                                                                                                                                                                                                                                                                                                                                |
| **Important 4** — no isolating negative for the class      | **FIXED.** Slice C fault 4 exchanges the classes of one occurrence in `lefthook.yml` and one in `sync.test.ts` — each carries exactly one non-recursive occurrence, so every total holds. Rehearsed: digest `2f0d2926…` → `7bae8ae1…`, nothing else moved. C4's second observation removes `${category}` from the key and shows both trees then hash to `681ef06d…`, demonstrating the class component is what catches it.     |
| **Important 5** — `grep -c … \|\| echo` masks errors       | **FIXED.** D5 distinguishes the three grep outcomes explicitly; the claimed R5 exception is gone.                                                                                                                                                                                                                                                                                                                              |
| **Important 6** — the hand-over list is wrong              | **FIXED.** Each slice carries its own `git status` block; section 13 keeps the cumulative path list separate and lists A's five created files individually.                                                                                                                                                                                                                                                                    |
| **Important 7** — planner totals are absolute              | **FIXED.** Section 10 records **W** and **V** before each slice and states per-slice deltas; 301/24 survives only as a dated observation.                                                                                                                                                                                                                                                                                      |
| **Minor 1** — inaccurate repository facts                  | **FIXED.** 29 `Proof:` entries (counted), two recursive-selector occurrences in the inventory test (counted), and the grep claim in section 3.1 is now scoped to executable consumers, excluding documentation quotations.                                                                                                                                                                                                     |
| **Minor 2** — batch 2 ownership claim                      | **FIXED.** Section 5 now says those packets have landed and names what each owned.                                                                                                                                                                                                                                                                                                                                             |
| **Minor 3** — helper names and "five"                      | **FIXED.** `findConfigs`, `readOraclePaths`, `sortPathKeys`, plus `refuseUnparsableConfig` and `refuseUnmergedIndex`; "four" underscored parameters.                                                                                                                                                                                                                                                                           |
| **Verified** items                                         | Accepted unchanged, except the two the review could not run — on-disk mutation proofs and full targets — which this revision rehearsed.                                                                                                                                                                                                                                                                                        |

**Found while revising, beyond the review.**
`for (const [offset, line] of lines.entries()) {` occurs **twice** in
`repo-namespacing-handoff.test.ts` — in `staleSelectorFailures` and in
`legacySourceOccurrences` — which is exactly the identical-lines trap the batch 2
lessons name. B5 now identifies its loop structurally and warns off the other,
and section 12.1's pre-edit grep is anchored so it prints `1` rather than `2`.

**New since the review, from the coordinator.** `main` has moved (PR #23:
inventory 170 rows across 84 files, digest re-pinned again) and lane 050.4 will
move the inventory by four rows, so section 2 now forbids treating any number
here as a fact. And `git ls-files` lists a conflicted path once per stage:
probed, a conflicted file appeared **three** times, which would multiply every
occurrence in it. Slice B adds `refuseUnmergedIndex`, its own test, and a
production-path negative (B4); step 0 refuses to start on an unmerged index.
