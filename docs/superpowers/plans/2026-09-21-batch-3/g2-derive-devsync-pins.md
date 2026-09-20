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
file (110.6 section "The rename is deferred" owns that). Not touching
`tools/tool-devsync/project.json`, `docs/wiki-policy/*.json`, `nx.json`, any
Twilight Bureaucrat rule, or any file under `apps/wiki/cli`. No new Nx target of
any name; a step that seems to need one is a stop.

## 2. Read first

| File                                                                          | Why                                                                                                                                |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                                   | Rules R1 to R5. R5's "provably breakable" is the whole subject of slices C and E.                                                  |
| `LLM_README.md`                                                               | The router.                                                                                                                        |
| `../2026-09-19-batch-1/README.md`                                             | Execution contract, standard blocks, the relative-counts rule.                                                                     |
| `tools/tool-devsync/src/workspace-inventory.test.ts`                          | The whole file, including every `Proof:` comment. Slices B and C edit it.                                                          |
| `tools/tool-devsync/workspace-inventory.mjs`                                  | The module under test. Slices C's three faults are injected here and restored.                                                     |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                     | The whole file. Slices D and E edit it. Its 24 dated digest `Proof:` entries are the churn record.                                 |
| `tools/tool-devsync/project.json`                                             | Read only. Its `test` target `inputs` name what re-runs. **Do not edit it.**                                                       |
| `../2026-09-20-batch-2/110-6-retire-upstream-sync.md`, sections 3.5, 3.7, 3.9 | Why the digest guards something the counts do not, why Markdown edits are digest-neutral, and why this whole file is planner-only. |

**Line numbers.** Every line number below is "today, approximately". Every step
identifies its edit by the text it matches. A quoted string that is not found is
a stop condition, not licence to guess.

## 3. Verified facts, 2026-09-21

Read or run in a private worktree at `batch-3/planning`, head `da8be091`.

### 3.1 The two literals, and who else reads them

`tools/tool-devsync/src/workspace-inventory.test.ts:110-111`:

```ts
expect(paths).toHaveLength(167);
expect(new Set(paths.map(({ file }) => file))).toHaveLength(84);
```

`tools/tool-devsync/src/repo-namespacing-handoff.test.ts:720-722`:

```ts
digest: '4b3aac6c5f311ce9564fa310bf426c44918da39cefc4c7054cfeaaa3ecb065be',
occurrences: 257,
unclassified: [],
```

`git grep` for the digest string across the tracked tree returns **one** hit, its
own declaration. `git grep` for `toHaveLength(167)` and `toHaveLength(84)` returns
only those two lines. No `docs/wiki-policy/*.json`, no Twilight Bureaucrat rule, no
`project.json`, no docs check and no script reads either literal. The batch 1 and
batch 2 packets that mention `legacySourceOccurrences` or these files
(`040-3-plan-writer.md`, `110-6-retire-upstream-sync.md`, and the seven batch 2
packets listed in section 5) quote them as prose instructions only; none is
executed. **So both literals are local to their own test file.**

### 3.2 What the inventory pin protects

`readDepthSensitiveConfigPaths` (`tools/tool-devsync/workspace-inventory.mjs:51`)
asks `readProjects` for projects, keeps those rooted under `apps/` or `libs/`
(line 52), lists each root's `project.json` and `tsconfig*.json`
(`isProjectConfig`, line 15), parses each with `jsonc-parser`, and walks the
parsed object collecting every string containing `../`
(`collectParentRelativePaths`, line 25).

The `Proof:` history at `workspace-inventory.test.ts:91-109` records **one** real
fault and **four** re-pins. The real fault (2026-09-14) is a filter added to the
collector: `111` rows instead of `148`. The other four are lanes raising the
number because a project gained configuration files or path mappings. So the pin
protects **that every parent-relative path in an app or library config is found**,
and serialises lanes for no other reason.

### 3.3 The inventory can be derived exactly

Measured on this worktree: `readDepthSensitiveConfigPaths` returns **167** rows
across **84** files. An independent enumeration — a directory walk of `apps/` and
`libs/` skipping `node_modules`, `dist` and dot-entries, then `jsonc-parser`'s
streaming `visit` reporting every string literal containing `../` with the JSON
path it sits at — returns **84** files and **167** `(file, propertyPath, value)`
triples, and the two sorted lists are **byte-identical** (probed with `bun -e`,
`identical? true`, `only oracle []`, `only inventory []`).

The walk finds **zero** configuration files outside a project root, so the derived
side is not merely a re-expression of the production side's own discovery: it also
catches a project being dropped.

**Probed library behaviour.** `jsonc-parser@3.2.0` (the version that resolves in
this workspace; `bun.lock:1831`). Its `visit` visitor's `onLiteralValue` receives
`(value, offset, length, startLine, startCharacter, pathSupplier)`. The sixth
argument is a **function**, not an array: `bun -e` on `{"a":{"b":["../x"]}}`
printed `"../x" function ["a","b",0]`. Calling `.join('.')` on it directly throws
`TypeError: path.join is not a function`. Array indices come through as numbers,
so `pathOf().join('.')` yields exactly the `compilerOptions.paths.@wbs/domain/workday.0`
shape `collectParentRelativePaths` produces.

**Do not hand-write the extractor.** A hand-written comment stripper was tried
first and silently lost 60 rows: `apps/wbs/fe-01/tsconfig.app.json:8` contains
`"@/*": ["./src/*"]`, whose `/*` opened a block comment that ran to the next `*/`.
That is why the oracle uses the locked parser.

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
candidate path that `isRelevantSourceConfig` accepts, matches `LEGACY_ROOT` per
line, and builds each context at line 356 as:

```ts
const context = `${path}:${String(offset + 1)}:${match[0]}:${line.trim()}`;
```

It then classifies the match and hashes the sorted context list. The **line number
in that key** is the entire source of the churn: the 24 dated `Proof:` entries at
lines 584-719 are almost all of the form "the added lines shift classified
contexts only", "pushed from line 819 to 840", "count and unclassified list
unchanged". Two of them say outright that two lanes meeting at this literal is a
conflict by construction.

What the digest protects **beyond** the counts, per 110.6 section 3.5 and
re-verified here: a **same-count substitution** — a legacy root moving from a proof
comment into executable text in the same already-classified file. Occurrences,
every category count and `unclassified` all stay identical; only the digest moves.
That guard must survive.

### 3.6 The digest can be made line-insensitive without losing that guard

Rehearsed form, keying by file, matched text, **class** and trimmed line, keeping
duplicates and dropping the line number:

```ts
const context = `${path}:${match[0]}:${category}:${line.trim()}`;
```

On this worktree the derived digest is
`2f0d2926e8d85aed7089c3ad667f7a0f6ccb97c514152a9895893978fab3f22d`, with
`occurrences: 257` and every category count **unchanged**.

Two rehearsed experiments, both on `tools/tool-dagger/src/main.ts`, whose
`DOCKERFILE` map at line 17 carries a classified legacy root in the `Proof:`
comment at line 18:

- Inserting **one** unrelated comment line above `const DOCKERFILE` moved the old
  digest from `4b3aac6c…` to `d66405a1…` — observed failing — and left the derived
  digest **green**.
- Reverting `workspace-inventory.test.ts` between the pre-change and post-change
  forms — a 65-line insertion and deletion in a scanned source file that carries
  four `apps/**`/`libs/**` selector contexts — left the derived digest **green in
  both directions**. That is the cross-lane property: this packet's own two slices
  no longer collide at this literal.

### 3.7 Baselines observed on a clean `batch-3/planning` worktree

| Measurement                                                                                                          | Observed                                                      |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx nx run tool-devsync:test --skip-nx-cache` | exit 0, `301 pass`, `0 fail`, `Ran 301 tests across 24 files` |
| `bun test … src/workspace-inventory.test.ts`                                                                         | `4 pass`, `0 fail`                                            |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`                                        | `passed: 107`, `failed: 0`                                    |

These are the planner's numbers on a clean tree. **The executor records its own at
every slice's step 0 and compares against those**, never against these.

### 3.8 Whole-suite pins this packet moves

Named for the planner, per the batch 2 lesson.

| Slice | Pin moved                                                                                                                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A     | `openspec … validate --all` totals: `passed` rises by exactly **1**. No test pin moves.                                                                                                                                              |
| B, C  | None. `workspace-inventory.test.ts`'s own two literals are **deleted**, not re-pinned. The digest does **not** move (rehearsed, section 3.6) — but only because slice D has landed or has not; either order is safe, see section 11. |
| D     | `digest` in `repo-namespacing-handoff.test.ts` is re-pinned once, from the observed value.                                                                                                                                           |
| E     | None.                                                                                                                                                                                                                                |

`isRelevantSourceConfig` returns `false` for `SELF`, for any `*/README.md` and for
any `*.md` (lines 317-334), so slices D and E's own edits, and this packet
itself, are digest-neutral. Slices B and C edit a **scanned** file, which is why
slice D must be rehearsed for both orders; section 11 resolves it.

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
planner-only. `workspace-inventory.test.ts` writes no Git objects and the executor
runs it directly.

## 4. Unknowns, answered by assumption

- **A1.** `jsonc-parser` stays at `3.2.0`. The planner pins it exactly (section 10)
  rather than relying on hoisting from `@nx/js`.
- **A2.** The derived inventory oracle lives in the **test file**, not in
  `workspace-inventory.mjs`. Putting it in the module under test would let one edit
  narrow both sides at once. Lint accepts the `jsonc-parser` import in the test
  file (rehearsed, `tool-devsync:lint` exit 0).
- **A3.** The oracle's non-empty guard is `toBeGreaterThan(100)`, not an exact
  number: it rules out the vacuous both-empty pass without becoming a new literal
  that lanes must move. 167 today; 100 is a floor no realistic removal reaches.
- **A4.** The `occurrences` and category counts in the digest expectation **stay**.
  They move only when an occurrence is genuinely added or removed, which is a real
  fact worth reviewing, not line churn.
- **A5.** The digest stays a single hashed literal rather than a per-file table.
  A per-file table would also de-serialise lanes, but it adds a regeneration
  artefact and 40-odd shared rows; the line-insensitive key removes the observed
  churn without either.
- **A6.** Directory-walk exclusions are `node_modules`, `dist` and any dot-entry.
  A future configuration file outside a project root makes the check fail loudly;
  that is the correct answer to "is every app or library config known", not a
  defect.

## 5. File plan

| File                                                                     | Slice         | Create/modify               | Responsibility                                           |
| ------------------------------------------------------------------------ | ------------- | --------------------------- | -------------------------------------------------------- |
| `openspec/changes/derive-devsync-pins/proposal.md`                       | A             | create                      | Intent: problem, outcome, non-goals, constraints.        |
| `openspec/changes/derive-devsync-pins/specs/derive-devsync-pins/spec.md` | A             | create                      | The delta requirements both checks must satisfy.         |
| `openspec/changes/derive-devsync-pins/tasks.md`                          | A             | create                      | The five TDD slices.                                     |
| `openspec/changes/derive-devsync-pins/verify.md`                         | A, B, C, D, E | create, then append         | Commands, results and the R5 proof table.                |
| `tools/tool-devsync/src/workspace-inventory.test.ts`                     | B, C          | modify                      | Derive the inventory; carry its new `Proof:` comments.   |
| `tools/tool-devsync/workspace-inventory.mjs`                             | C             | **mutate and restore only** | Three negative proofs. Left byte-identical.              |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                | D, E          | modify                      | Derive the context key; carry its new `Proof:` comments. |
| `tools/tool-dagger/src/main.ts`                                          | E             | **mutate and restore only** | Two negative proofs. Left byte-identical.                |
| `apps/wbs/be-01/scripts/solver-orphan-fixture.Dockerfile`                | E             | **mutate and restore only** | One negative proof. Left byte-identical.                 |

`.openspec.yaml` under the change directory is generated by the `new change`
command in slice A and is expected in `git status`.

**No mutation-only path outside this table is authorised.**

**Out of lane.** `tools/tool-devsync/project.json`, `nx.json`, `package.json`,
`bun.lock` (planner pre-step, section 10), `docs/wiki-policy/**`,
`docs/findings/**`, `apps/wiki/cli/**`, `LLM_README.md`, `AGENTS.md`, and every
other batch 2 packet's territory: 010.6 templates, 010.7 rules, 020.2 shared
failures, 020.7 backend startup, 040.1 Chromium proof, 040.4 plan feed, 110.1 test
axes, 110.6 retire upstream sync. Several of those quote
`repo-namespacing-handoff.test.ts` in commands; **none of them edits it**, and this
packet does not rename it, so their instructions stay correct.

## 6. Step 0, at the start of every slice

Counts are recorded, never read out of this packet.

- [ ] Record the starting state, from the repository root:

  ```sh
  set -euo pipefail
  mkdir -p "$TMPDIR/evidence"
  git status --short --untracked-files=all | tee "$TMPDIR/evidence/status-before.txt"
  grep -nE "^[[:space:]]+(digest: '[0-9a-f]+'|occurrences: [0-9]+),$" \
    tools/tool-devsync/src/repo-namespacing-handoff.test.ts \
    | sed 's/^[0-9]*://' | tee "$TMPDIR/evidence/pins-before.txt"
  ```

  Expected: other lanes' files may appear in `git status`; none of the files in
  section 5 may. The pin grep prints exactly **two** stripped lines, a `digest:`
  and an `occurrences:`. That stripped form is what later steps compare, because
  line numbers shift as the file is edited.

- [ ] Record the inventory baseline:

  ```sh
  if (cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts \
       src/workspace-inventory.test.ts) \
       >"$TMPDIR/evidence/inventory-before.txt" 2>&1
  then inventory=green; else inventory=red; fi
  tail -6 "$TMPDIR/evidence/inventory-before.txt"
  ```

  Record passes **I**. `inventory=red` is a dispatch defect: STOP and report.

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
  the clone — STOP. An empty `baseline-failures.txt` is expected.
  `baseline=red` is a dispatch defect: STOP and report every line of
  `baseline-failures.txt`. **No `|| true`**: the status is captured in an `if`.

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

Five slices, each independently dispatchable, each beginning with step 0.

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
      this content (285 words, under the 400-word cap):

  ```md
  ## Why

  Two literals in `tools/tool-devsync` serialise every parallel lane. The workspace inventory pins a row total and a file total, so any project that gains a parent-relative target path or configuration file must hand-edit them. The namespacing digest keys each legacy-root occurrence by its line number, so a comment line added above an unrelated occurrence moves it. The digest was re-pinned four times on 2026-09-20 and the inventory counts twice; two lanes meeting at one literal conflict by construction.

  ## What Changes

  The inventory expectation becomes an equality against a second, independently derived enumeration of the same facts: a directory walk of `apps/` and `libs/` for project and TypeScript configuration files, and a streaming JSONC visit reporting every string literal carrying `../` with its property path. The legacy-occurrence context becomes `path:matchedText:class:trimmedLine` instead of `path:line:matchedText:trimmedLine`, so the digest no longer moves when a line is inserted above an occurrence, and the occurrence's class joins the key.

  ## Non-Goals

  This change does not relax what either check refuses. It does not remove the occurrence count, the category counts, the `unclassified` list, the coverage manifest or any `toContainEqual` pin. It does not rename either test file, does not touch `tools/tool-devsync/project.json`, `docs/wiki-policy/*.json` or any Twilight Bureaucrat rule, and adds no Nx target.

  ## Constraints

  Both checks must still fail on every fault their existing `Proof:` comments record. The derived inventory must still fail when the collector filters a property kind, when configuration-file discovery narrows, or when project discovery narrows. The digest must still fail on a same-count substitution that moves a legacy root from a comment into executable text in the same file, and on a class change. `jsonc-parser` is pinned exactly, because the executor has no network.
  ```

  If `new change` generated a template `proposal.md`, replace its whole content.

- [ ] A3. Write
      `openspec/changes/derive-devsync-pins/specs/derive-devsync-pins/spec.md`
      (create the directory) with exactly this content. Each `### Requirement:`
      carries a normative SHALL sentence directly beneath it, and every scenario
      uses exactly four hashtags; validation refuses anything else.

  ```md
  ## ADDED Requirements

  ### Requirement: The depth-sensitive inventory is checked against an independently derived enumeration

  The workspace inventory check SHALL compare `readDepthSensitiveConfigPaths`'s output with a second enumeration that discovers configuration files by walking `apps/` and `libs/` and extracts parent-relative values with a streaming JSONC visit, and SHALL NOT pin a row total or a file total as a literal.

  #### Scenario: A project gains a parent-relative target path

  - **WHEN** a project's `project.json` gains a target whose command carries a parent-relative path
  - **THEN** the check passes with no edit to the test file, because both enumerations report the new value

  #### Scenario: The collector filters a property kind

  - **WHEN** `collectParentRelativePaths` stops reporting `compilerOptions.outDir` values
  - **THEN** the check fails, naming every `compilerOptions.outDir` row the derived enumeration still finds

  #### Scenario: Configuration discovery narrows

  - **WHEN** `isProjectConfig` stops matching `tsconfig.lib.json` and `tsconfig.spec.json`, or the project filter stops matching `libs/`
  - **THEN** the check fails, naming the rows the derived enumeration still finds

  #### Scenario: The derived enumeration collapses

  - **WHEN** the derived enumeration returns fewer than one hundred rows
  - **THEN** the check fails on that assertion instead of passing vacuously against an equally empty inventory

  ### Requirement: A legacy-root occurrence is identified by its text and class, never by its line number

  The legacy-occurrence check SHALL key each context by the file, the matched legacy root, the class the classifier gave it and the whole trimmed source line, SHALL keep duplicate contexts rather than de-duplicating them, and SHALL NOT include the line number.

  #### Scenario: An unrelated line is added above a classified occurrence

  - **WHEN** a comment line is inserted above a classified legacy-root occurrence in a scanned source file
  - **THEN** the digest, the occurrence count, the category counts and the `unclassified` list are all unchanged and the check passes with no edit

  #### Scenario: A legacy root moves from a comment into executable text

  - **WHEN** a legacy root is removed from a proof comment and added to an executable line in the same classified file, leaving the occurrence count and every category count unchanged
  - **THEN** the digest changes and the check fails

  #### Scenario: An occurrence is unclassified

  - **WHEN** a scanned file gains a legacy root that no classification rule covers
  - **THEN** the check fails with that context in `unclassified`, and the context carries no line number

  #### Scenario: One of two identical occurrences is deleted

  - **WHEN** a file carries two byte-identical lines matching the same legacy root and one is deleted
  - **THEN** the occurrence count and the digest both change
  ```

- [ ] A4. Write `openspec/changes/derive-devsync-pins/tasks.md`:

  ```md
  ## 1. Open the change

  - [ ] 1.1 Record the intent, the delta requirements and the verification structure, and declare `jsonc-parser` exactly pinned.

  ## 2. Derive the depth-sensitive inventory

  - [ ] 2.1 Add the independently derived enumeration and replace the two pinned totals with an equality against it, proven by `pins the complete moved depth-sensitive configuration inventory`.

  ## 3. Prove the derived inventory still refuses a narrowed collector

  - [ ] 3.1 Inject the property-kind filter, the configuration-name narrowing and the project-root narrowing, observe each failing, restore, and record adjacent proof comments.

  ## 4. Derive the legacy-occurrence context

  - [ ] 4.1 Key each context by file, matched text, class and trimmed line, re-pin the digest from the observed value, and prove it with `every legacy source occurrence and relevant text family is pinned`.

  ## 5. Prove the derived digest still refuses the recorded faults

  - [ ] 5.1 Inject the unclassified Dockerfile root, the same-count substitution and the self-path fault, observe each failing, restore, record adjacent proof comments, and record the line-insertion experiment.
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
  validation reports `"passed": 1, "failed": 0`. Then run the batch 1 README's
  **OpenSpec validation** block: `summary.totals.passed` is **P + 1** and `failed`
  is `0`. Rehearsed on this worktree: `107` became `108`.

  A validation failure naming a requirement without a normative sentence, or a
  scenario heading with the wrong hashtag count, means the text above was not
  copied exactly. Re-copy once, rerun, and report both runs.

- [ ] A7. Append to `verify.md` under `## Results`: the two prettier runs, the two
      validation runs and their totals. **No negative proof is owed**: this slice
      adds no check.

**Ready to commit.** Paths: `openspec/changes/derive-devsync-pins/.openspec.yaml`,
`openspec/changes/derive-devsync-pins/proposal.md`,
`openspec/changes/derive-devsync-pins/specs/derive-devsync-pins/spec.md`,
`openspec/changes/derive-devsync-pins/tasks.md`,
`openspec/changes/derive-devsync-pins/verify.md`. Subject:

```
docs(openspec): open the change that derives the two devsync pins
```

### Slice B — derive the depth-sensitive inventory

All inside `tools/tool-devsync/src/workspace-inventory.test.ts`. The derived
enumeration is added and proven to **agree** with the existing literals before
those literals are removed, so the invariant is never unguarded.

- [ ] B1. Replace the file's import block. Today it reads:

  ```ts
  import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';

  import { expect, it } from 'bun:test';

  import { readDepthSensitiveConfigPaths } from '../workspace-inventory.mjs';
  ```

  Make it:

  ```ts
  import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { fileURLToPath } from 'node:url';

  import { expect, it } from 'bun:test';
  import { visit } from 'jsonc-parser';

  import { readDepthSensitiveConfigPaths } from '../workspace-inventory.mjs';
  ```

- [ ] B2. Immediately after the line `const WORKSPACE = new URL('../../../', import.meta.url);`
      and before `async function failureMessageOf`, insert exactly this, in its
      post-Prettier form. Write it **without** any `Proof:` comment; slice C adds
      those after the failures are observed.

  ```ts
  interface DepthSensitivePath {
    readonly file: string;
    readonly propertyPath: string;
    readonly value: string;
  }

  /**
   * Every project or TypeScript configuration file below `directory`, found by walking the
   * directory tree rather than by asking Nx which projects exist, so that a project the
   * inventory's own discovery drops is still enumerated here.
   */
  async function configsBelow(directory: string, found: string[] = []): Promise<string[]> {
    const entries = await readdir(join(fileURLToPath(WORKSPACE), directory), {
      withFileTypes: true,
    });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
        continue;
      }
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await configsBelow(path, found);
      else if (entry.name === 'project.json' || /^tsconfig(?:\.[^.]+)?\.json$/.test(entry.name)) {
        found.push(path);
      }
    }
    return found;
  }

  /**
   * The same inventory, derived a second way: a streaming JSONC visit that reports every string
   * literal carrying `../` with the property path it sits at. It shares no code with
   * `readDepthSensitiveConfigPaths`'s recursive object walk, so a filter added to that walk makes
   * the two disagree. It is not a pinned total, so a project that gains a parent-relative target
   * path or configuration file moves both sides together and needs no edit here.
   */
  async function depthSensitivePathOracle(): Promise<DepthSensitivePath[]> {
    const files = [...(await configsBelow('apps')), ...(await configsBelow('libs'))].sort();
    const paths: DepthSensitivePath[] = [];
    for (const file of files) {
      const text = await readFile(join(fileURLToPath(WORKSPACE), file), 'utf8');
      visit(text, {
        onLiteralValue(value, _offset, _length, _startLine, _startCharacter, pathOf) {
          if (typeof value === 'string' && value.includes('../')) {
            paths.push({ file, propertyPath: pathOf().join('.'), value });
          }
        },
      });
    }
    return paths;
  }

  function sortedKeys(paths: readonly DepthSensitivePath[]): string[] {
    return paths
      .map(({ file, propertyPath, value }) => `${file}\0${propertyPath}\0${value}`)
      .sort();
  }
  ```

  `pathOf` is the visitor's **sixth** argument and is a function (section 3.3).
  The five leading underscores are required: the repository's lint rejects unused
  parameters without them.

- [ ] B3. Run the inventory file. Expected: **I** passes, `0 fail`. The two
      literals are still in place, so this run proves the derived enumeration
      **agrees** with them before either is removed. If the file fails here, the
      oracle disagrees with the production inventory on this tree — STOP and
      report the diff; do not change either literal to make it pass.

- [ ] B4. Only now replace the two pinned totals. Inside the test titled
      `pins the complete moved depth-sensitive configuration inventory`, replace
      these two consecutive lines, which sit directly below the last `Proof:`
      comment line and directly above the first `expect(paths).toContainEqual({`:

  ```ts
  expect(paths).toHaveLength(167);
  expect(new Set(paths.map(({ file }) => file))).toHaveLength(84);
  ```

  with:

  ```ts
  const oracle = await depthSensitivePathOracle();

  expect(oracle.length).toBeGreaterThan(100);
  expect(sortedKeys(paths)).toEqual(sortedKeys(oracle));
  expect(new Set(paths.map(({ file }) => file))).toEqual(new Set(oracle.map(({ file }) => file)));
  ```

  Leave every `Proof:` comment above them untouched: they are dated evidence of
  observed failures, and one of them (the 2026-09-14 `outDir` filter) is replayed
  in slice C. Leave every `toContainEqual` below untouched.

- [ ] B5. Verify:

  ```sh
  set -euo pipefail
  GSETTINGS_BACKEND=memory bunx prettier --write tools/tool-devsync/src/workspace-inventory.test.ts
  GSETTINGS_BACKEND=memory bunx prettier --check tools/tool-devsync/src/workspace-inventory.test.ts
  grep -c 'toHaveLength(167)\|toHaveLength(84)' tools/tool-devsync/src/workspace-inventory.test.ts \
    || echo 'both literals gone'
  grep -nE "^[[:space:]]+(digest: '[0-9a-f]+'|occurrences: [0-9]+),$" \
    tools/tool-devsync/src/repo-namespacing-handoff.test.ts | sed 's/^[0-9]*://'
  ```

  Expected: prettier `--check` prints `All matched files use Prettier code style!`
  and exits 0; the `grep -c` path prints `both literals gone` (a `grep -c` finding
  nothing exits 1, which is why the `||` branch is here and why this is the one
  place a `||` appears — it is reporting, not masking a required check); the two
  stripped pin lines are **byte-identical** to `$TMPDIR/evidence/pins-before.txt`.

  Then, started under a status-recording wrapper per preamble rule 19:

  ```sh
  NX_DAEMON=false bunx nx run tool-devsync:typecheck >"$TMPDIR/evidence/typecheck-b.log" 2>&1
  echo "status=$?" >>"$TMPDIR/evidence/typecheck-b.log"
  NX_DAEMON=false bunx nx run tool-devsync:lint >"$TMPDIR/evidence/lint-b.log" 2>&1
  echo "status=$?" >>"$TMPDIR/evidence/lint-b.log"
  ```

  Expected `status=0` from both. This slice introduces a new interface, so the
  type check runs **in this slice**. A lint failure whose only diagnostics are
  `simple-import-sort/imports` or `prettier/prettier` is fixed with
  `bunx eslint --fix tools/tool-devsync/src/workspace-inventory.test.ts` and both
  runs are reported (preamble rule 17); any other diagnostic is a stop.

- [ ] B6. Re-run the inventory file: **I** passes, `0 fail`. Re-run the filtered
      namespacing sweep: **T** passes, **F** failures matching
      `baseline-failures.txt`, `1 filtered out`. The digest must be **unchanged**
      — this slice edits a scanned source file, and that is exactly the churn the
      packet exists to remove. If the digest test fails here **and slice D has not
      landed**, that is the expected old behaviour: record it and continue, it is
      the planner's to resolve at integration (section 11). If slice D **has**
      landed and the digest test fails, STOP: the derived key is not doing its job.

- [ ] B7. Append to `verify.md` under `## Results`: every command above, its exit
      status and its decisive line. Tick task 2.1.

**Ready to commit.** Paths: `tools/tool-devsync/src/workspace-inventory.test.ts`,
`openspec/changes/derive-devsync-pins/tasks.md`,
`openspec/changes/derive-devsync-pins/verify.md`. Subject:

```
test(devsync): derive the depth-sensitive inventory instead of pinning two totals
```

### Slice C — prove the derived inventory still refuses a narrowed collector

Three negative proofs, all injected into
`tools/tool-devsync/workspace-inventory.mjs` and all restored. The named test is
the same for all three:
`pins the complete moved depth-sensitive configuration inventory`. It sits in no
`describe`, so the unanchored title is the correct `-t` filter (preamble rule 18).
Run it as:

```sh
if (cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts \
     src/workspace-inventory.test.ts \
     -t 'pins the complete moved depth-sensitive configuration inventory') \
     >"$TMPDIR/evidence/<name>.out" 2>&1
then status=passed; else status=failed; fi
```

A run reporting `0 tests` or `matched 0 tests` is a stop. A green run reports
`3 filtered out`; each failing run below reports `0 pass`, `3 filtered out`,
`1 fail`.

Three separate mutations because three separate facts are guarded; one mutation
must not stand in for another.

| #   | Fault, by function and exact expression                                                                                                                                                                    | Fact the test fails on                                                                                                                           | Rehearsed diagnostic                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| 1   | In `collectParentRelativePaths`, the **only** occurrence of the condition `if (candidate.includes('../')) {` becomes `if (candidate.includes('../') && segments.join('.') !== 'compilerOptions.outDir') {` | Every `compilerOptions.outDir` row the derived enumeration still finds is absent from the inventory. This replays the 2026-09-14 recorded fault. | `- Expected  - 44` / `+ Received  + 0`, at the `toEqual` |
| 2   | In `isProjectConfig`, the **only** occurrence of `/^tsconfig(?:\.[^.]+)?\.json$/.test(name)` becomes `/^tsconfig\.json$/.test(name)`                                                                       | Every `tsconfig.lib.json`, `tsconfig.spec.json`, `tsconfig.app.json` and `tsconfig.e2e.json` row is absent.                                      | `- Expected  - 103` / `+ Received  + 0`                  |
| 3   | In `readDepthSensitiveConfigPaths`, the **only** occurrence of `projectRoot.startsWith('apps/') \|\| projectRoot.startsWith('libs/')` becomes `projectRoot.startsWith('apps/')`                            | Every library row is absent — project discovery narrowed, which the oracle's own directory walk does not follow.                                 | `- Expected  - 62` / `+ Received  + 0`                   |

`Expected` is the derived enumeration and `Received` the production inventory, so
a narrowing shows as rows removed from `Expected`. Record whatever diagnostic is
actually seen; the fact, not the wording, decides (preamble rule 20).

- [ ] C1. Fault 1, by **the proof shape**, patch name `inventory-outdir`.
- [ ] C2. Fault 2, by **the proof shape**, patch name `inventory-config-name`.
- [ ] C3. Fault 3, by **the proof shape**, patch name `inventory-project-root`.
- [ ] C4. After all three are restored and `cmp` has confirmed
      `workspace-inventory.mjs` is byte-identical, write the three dated `Proof:`
      comments. Put them **directly above the assertions they belong to**, inside
      the test, below the existing dated `Proof:` history:

  - above `expect(oracle.length).toBeGreaterThan(100);` — nothing yet; C5 owns it;
  - above `expect(sortedKeys(paths)).toEqual(sortedKeys(oracle));` — one comment
    per fault, each naming the injected expression and the diagnostic seen, dated
    with the actual run date.

- [ ] C5. The non-empty guard, which none of the three faults exercises. By **the
      proof shape**, patch name `inventory-empty-oracle`, insert `return [];` as
      the **first statement** of `depthSensitivePathOracle`'s body, above
      `const files = ...`. Run the same named test. Expected: `status=failed`, and
      the failure is the **first** assertion, a `toBeGreaterThan` diff with a
      received `0`. Restore, `cmp`, then write its dated `Proof:` comment directly
      above `expect(oracle.length).toBeGreaterThan(100);`. This mutation is in the
      test file, so restore from a `$TMPDIR` copy of the **test** file.

- [ ] C6. The experiment the pin's removal is for, recorded as an observation, not
      a test. By **the proof shape** but with the **opposite** expectation, patch
      name `inventory-new-target-path`: in `apps/wbs/be-01/project.json`, add a
      target whose command carries a parent-relative path, for example a
      `"probe-lane-target"` entry beside the existing targets with
      `"command": "bun ../../../tools/tool-devsync/src/probe.ts"`. Run the whole
      inventory file. **Expected: it PASSES**, `I` passes, `0 fail`. That is the
      lane-serialisation the old literal caused: rehearsed on this worktree, the
      pre-change form failed the same edit with `Expected length: 167` /
      `Received length: 168`. Restore `apps/wbs/be-01/project.json`, `cmp`, rerun
      green. If it FAILS, stop and report: the derived form did not remove the
      serialisation.

  `apps/wbs/be-01/project.json` is a mutate-and-restore-only path for this step
  alone; it is in the section 5 table for that reason.

- [ ] C7. Verify: prettier `--write` then `--check` on
      `tools/tool-devsync/src/workspace-inventory.test.ts`;
      `tool-devsync:typecheck` and `tool-devsync:lint` under the status-recording
      wrapper, both `status=0`; the inventory file green at **I** passes; the
      stripped namespacing pin lines equal to step 0; the batch 1 README's
      **OpenSpec validation** block with totals equal to step 0's.

- [ ] C8. Append to `verify.md`: every command, and a row in the
      `## Failure proofs` table for each of C1 to C5 — the fault injected, the
      named test, and the diagnostic observed. Record C6 under `## Results` as an
      observation. Tick task 3.1.

**Ready to commit.** Paths: `tools/tool-devsync/src/workspace-inventory.test.ts`,
`openspec/changes/derive-devsync-pins/tasks.md`,
`openspec/changes/derive-devsync-pins/verify.md`. Subject:

```
test(devsync): prove the derived inventory refuses a narrowed collector
```

### Slice D — derive the legacy-occurrence context

All inside `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, in
`legacySourceOccurrences`.

- [ ] D1. Change the scan loop so the context is built **after** the class is
      known and carries no line number. Today the loop reads:

  ```ts
  for (const [offset, line] of lines.entries()) {
    for (const match of line.matchAll(LEGACY_ROOT)) {
      const context = `${path}:${String(offset + 1)}:${match[0]}:${line.trim()}`;
      contexts.push(context);
      const category = /^(?:apps|libs)\/\*+\//.test(match[0])
  ```

  Make the first three lines of that block:

  ```ts
  for (const line of lines) {
    for (const match of line.matchAll(LEGACY_ROOT)) {
      const category = /^(?:apps|libs)\/\*+\//.test(match[0])
  ```

  deleting the `const context = ...` and `contexts.push(context);` lines from
  there. `offset` becomes unused and `lines.entries()` becomes `lines`; leave the
  long classifier ternary that follows completely untouched.

- [ ] D2. Immediately after the classifier's final `: 'UNCLASSIFIED';` line and
      **above** the existing `categories[category] = (categories[category] ?? 0) + 1;`,
      insert:

  ```ts
  // A context is keyed by the file it sits in, the legacy root matched, the class the
  // rules above gave it and the whole trimmed source line — never by the line number.
  // An unrelated line added above an occurrence must not move this digest; a legacy root
  // that moves from a comment into executable text in the same file, or that changes
  // class, still does, because the line's text and the class are part of the key.
  // Duplicates are kept rather than de-duplicated, so deleting one of two identical
  // occurrences still moves the digest.
  const context = `${path}:${match[0]}:${category}:${line.trim()}`;
  contexts.push(context);
  ```

  There is exactly **one** `: 'UNCLASSIFIED';` line and exactly **one**
  `categories[category] = ` line in the file; if either grep returns more than one
  hit, STOP.

- [ ] D3. Run the named test and read the **received** digest:

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
  remove any. If `occurrences` or a category moves, STOP: the edit changed what is
  scanned, not how it is keyed.

  On this worktree, rehearsed, the received value was
  `2f0d2926e8d85aed7089c3ad667f7a0f6ccb97c514152a9895893978fab3f22d`, with
  `occurrences: 257` and every category unchanged. **Pin the value this run
  reports, not the one written here**: the executor's tree may carry untracked
  files from other lanes, which the scan reads.

- [ ] D4. Replace the `digest:` literal with the value observed in D3, leaving
      `occurrences:`, `unclassified:`, `categories:`, `coverage:` and every dated
      `Proof:` comment above the literal exactly as they are. Those comments are
      the churn record this change ends; they stay verbatim as evidence.

- [ ] D5. Re-run the filtered sweep. Expected: **T** passes, **F** failures
      matching `baseline-failures.txt`, `1 filtered out`.

- [ ] D6. Verify: prettier `--write` then `--check` on the file;
      `tool-devsync:typecheck` and `tool-devsync:lint` under the status-recording
      wrapper, both `status=0`; the batch 1 README's **OpenSpec validation** block
      with totals equal to step 0's.

- [ ] D7. Append to `verify.md`: every command and result, and the old and new
      digest values. Tick task 4.1. **No `Proof:` comment yet** — slice E owns
      them, and rule 9 forbids writing one before observing the failure.

**Ready to commit.** Paths:
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts`,
`openspec/changes/derive-devsync-pins/tasks.md`,
`openspec/changes/derive-devsync-pins/verify.md`. Subject:

```
test(devsync): key legacy-root contexts by text and class, not by line number
```

### Slice E — prove the derived digest still refuses the recorded faults

Named test throughout, unanchored title, no `describe`:
`every legacy source occurrence and relevant text family is pinned`. Run it with
the proof-shape command against
`src/repo-namespacing-handoff.test.ts`. A green run reports `13 filtered out`,
`1 pass`; each failing run reports `0 pass`, `1 fail`.

| #   | Fault, by file, function and exact expression                                                                                                                                                                                                                                                                                                   | Fact the test fails on                                                                                                     | Rehearsed diagnostic                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `apps/wbs/be-01/scripts/solver-orphan-fixture.Dockerfile`, the **only** `COPY` line (line 4): `COPY apps/wbs/be-01/scripts/…` becomes `COPY apps/be-01/scripts/…`. Replays the 2026-09-14 recorded fault.                                                                                                                                       | An occurrence appears that no classification rule covers.                                                                  | `+ "UNCLASSIFIED": 1`, `occurrences` 257 → 258, and `unclassified` gains `apps/wbs/be-01/scripts/solver-orphan-fixture.Dockerfile:apps/be-01/:UNCLASSIFIED:COPY apps/be-01/scripts/…` — **with no line number** |
| 2   | `tools/tool-dagger/src/main.ts`, `const roundOneFault = 'apps/be-01/src';` inserted immediately above `const DOCKERFILE: Record<Tier, string> = {`. Replays the 2026-09-14 recorded fault.                                                                                                                                                      | A new classified occurrence appears in an already-classified production file.                                              | `"production proof or revision transition"` 18 → 19, `occurrences` 257 → 258, digest changed                                                                                                                    |
| 3   | `tools/tool-dagger/src/main.ts`, **same-count substitution**, two edits in one mutation: in the `Proof:` comment above the `DOCKERFILE` map, `` `apps/be-01/Dockerfile` `` becomes `the pre-move backend path`; and the map entry `be: 'apps/wbs/be-01/Dockerfile',` becomes `be: 'apps/be-01/Dockerfile',`. There is exactly one of each line. | The digest alone moves. This is the guard the counts do **not** give, and the reason the digest is kept at all.            | `occurrences` **unchanged at 257**, every category **unchanged**, `unclassified` still `[]`, digest `2f0d2926…` → `0dc79639…`, `- Expected  - 1` / `+ Received  + 1`                                            |
| 4   | `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, `const SELF = relative(WORKSPACE, fileURLToPath(import.meta.url));` becomes `const SELF = 'tools/tool-devsync/src/not-this-file.ts';`. Replays the 2026-09-20 recorded fault.                                                                                                        | The file stops excluding itself, so its own `Proof:` comments, which quote pre-move roots on purpose, enter the inventory. | `"test fixture or proof"` 106 → 126, `"current recursive selector"` 31 → 33, `occurrences` 257 → 279, `unclassified` still `[]`                                                                                 |

Faults 2 and 3 are separate mutations of the same file because they prove separate
facts; fault 3 must **not** be folded into fault 2. Each restores
`tools/tool-dagger/src/main.ts` from its own `$TMPDIR` copy and confirms with
`cmp` before the next begins.

- [ ] E1. Fault 1, by **the proof shape**, patch name `digest-unclassified-root`.
- [ ] E2. Fault 2, by **the proof shape**, patch name `digest-new-classified-root`.
- [ ] E3. Fault 3, by **the proof shape**, patch name `digest-same-count-substitution`.
- [ ] E4. Fault 4, by **the proof shape**, patch name `digest-self-path`. Restore
      from a `$TMPDIR` copy of the **test** file.
- [ ] E5. After all four are restored and `cmp` confirms every mutated file is
      byte-identical, write the dated `Proof:` comments:

  - faults 1, 2 and 3 above the `digest:` literal, below the existing dated
    history, each naming its injected expression and the diagnostic seen;
  - fault 4 in the existing `Proof:` block above `const SELF`, appended to it,
    since that block already records the same fault under the old key and the new
    observation replaces the old numbers rather than contradicting them.

- [ ] E6. The experiment the re-key is for, recorded as an observation, not a
      test. By **the proof shape** but with the **opposite** expectation, patch
      name `digest-unrelated-comment-line`: in `tools/tool-dagger/src/main.ts`,
      insert one comment line, `// An unrelated explanatory line added by another lane.`,
      immediately above `const DOCKERFILE: Record<Tier, string> = {`. Run the
      named test. **Expected: it PASSES**, `1 pass`, `13 filtered out`, `0 fail`.
      Rehearsed on this worktree, the pre-change line-numbered key failed the same
      edit, moving the digest from `4b3aac6c…` to `d66405a1…`. Restore, `cmp`,
      rerun green. If it FAILS, stop and report: the derived key did not remove
      the serialisation.

- [ ] E7. Verify: prettier `--write` then `--check` on the test file;
      `tool-devsync:typecheck` and `tool-devsync:lint` under the status-recording
      wrapper, both `status=0`; the filtered sweep at **T** passes and **F**
      failures matching `baseline-failures.txt`; the batch 1 README's **OpenSpec
      validation** block with totals equal to step 0's.

- [ ] E8. Append to `verify.md`: a `## Failure proofs` row for each of E1 to E4,
      and E6 under `## Results` as an observation, with the pre-change comparison
      quoted from this packet's section 3.6 marked as the planner's. Tick task 5.1.

**Ready to commit.** Paths:
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts`,
`openspec/changes/derive-devsync-pins/tasks.md`,
`openspec/changes/derive-devsync-pins/verify.md`. Subject:

```
test(devsync): prove the derived digest refuses every recorded fault
```

## 9. Verification table

Every command the executor runs, with its expected exit status and the line to
look for. Counts marked **relative** are compared with the slice's own step 0.

| Command                                                                                                     | Slice      | Exit | Line to look for                                         |
| ----------------------------------------------------------------------------------------------------------- | ---------- | ---- | -------------------------------------------------------- |
| `bun test --preload ../test/scratch/preload.ts src/workspace-inventory.test.ts` (from `tools/tool-devsync`) | B, C       | 0    | **I** pass, `0 fail` (relative)                          |
| the same with `-t 'pins the complete moved depth-sensitive configuration inventory'`                        | C          | 1    | `0 pass`, `3 filtered out`, `1 fail` (each negative)     |
| `bun test … src/repo-namespacing-handoff.test.ts -t '^(?!the production index checker).*'`                  | B, D, E    | 0    | **T** pass, **F** fail, `1 filtered out` (relative)      |
| the same with `-t 'every legacy source occurrence and relevant text family is pinned'`                      | D, E       | 1/0  | `0 pass`/`1 pass`, `13 filtered out`                     |
| `NX_DAEMON=false bunx nx run tool-devsync:typecheck` (status-recording wrapper)                             | B, C, D, E | 0    | `status=0`                                               |
| `NX_DAEMON=false bunx nx run tool-devsync:lint` (status-recording wrapper)                                  | B, C, D, E | 0    | `status=0`                                               |
| `GSETTINGS_BACKEND=memory bunx prettier --check <owned files>`                                              | every      | 0    | `All matched files use Prettier code style!`             |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate derive-devsync-pins --json`                 | A          | 0    | `"passed": 1`, `"failed": 0`                             |
| the batch 1 README's **OpenSpec validation** block                                                          | every      | 0    | `passed` = **P** (A: **P + 1**), `failed` `0` (relative) |

## 10. Planner-only

Nothing here is the executor's, and each is reported as "pending planner
verification".

**Pre-step, before slice B is dispatched.** Declare `jsonc-parser` exactly pinned
(section 3.4), commit it, and dispatch from that commit:

```sh
# add "jsonc-parser": "3.2.0" to the root package.json devDependencies, then:
GSETTINGS_BACKEND=memory bun install
GSETTINGS_BACKEND=memory bunx prettier --check package.json
```

Expected, rehearsed: `Checked 1602 installs across 1447 packages (no changes)`,
one added line in `bun.lock`, no network, prettier exit 0. Subject:
`build: declare the jsonc-parser version the devsync inventory already imports`.
Without this the executor still works — the package resolves by hoisting — but the
version is unpinned.

**After each slice.** Stage the executor's files (the index checker refuses
untracked files) and run the whole target:

```sh
NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx nx run tool-devsync:test --skip-nx-cache
```

Expected on a clean tree: exit 0, `301 pass`, `0 fail`,
`Ran 301 tests across 24 files`. Slices B to E add and remove no test, so the
total is unchanged throughout. `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT` is
required: `CLAUDECODE=1` changes Bun's output and fails 13 unrelated tests.

**At the end.** `NX_DAEMON=false GSETTINGS_BACKEND=memory bunx nx format:check --all`,
then `bin/h2puni-gate.sh <sha>` on the shared build host with the committed hash,
recording the printed `h2puni gate: running on <sha>` line and the exit status.
The executor never runs the host gate and says so.

**No `--network` is needed** at dispatch: nothing in this packet binds a port.

## 11. Slice order and the one ordering hazard

A, then B, C, D, E in order. A must be first (the change must exist before its
tasks are ticked). C depends on B; E depends on D.

**B and D are order-independent, which was verified rather than assumed.** B and C
edit `workspace-inventory.test.ts`, a **scanned** source file carrying four
`apps/**`/`libs/**` selector contexts, so under the old line-numbered key their
65-line insertion moved the digest. The derived digest was rehearsed against
**both** forms of that file — pre-change and post-change — and stayed
`2f0d2926…` in both directions. So:

- **D before B** (recommended): the digest is re-keyed first, and B's edit then
  moves nothing.
- **B before D**: B6 will see the digest test fail on the old key. That is
  expected, recorded, and resolved when D lands. B6 says so explicitly.

Either way the digest is re-pinned exactly **once**, in D.

## 12. Stop conditions

Each is **FALSE** on the real starting tree at `batch-3/planning`, head
`da8be091`; each was checked.

1. `grep -c 'toHaveLength(167)' tools/tool-devsync/src/workspace-inventory.test.ts`
   does not print `1` (checked: prints `1`).
2. `grep -c "const context = \`\${path}:\${String(offset + 1)}" tools/tool-devsync/src/repo-namespacing-handoff.test.ts`does not print`1`(checked: prints`1`).
3. `grep -c ": 'UNCLASSIFIED';" tools/tool-devsync/src/repo-namespacing-handoff.test.ts`
   does not print `1` (checked: prints `1`).
4. `openspec/changes/derive-devsync-pins` already exists (checked: absent).
5. Step 0's filtered sweep reports anything other than `1 filtered out`
   (checked: reports `1 filtered out`).
6. Step 0's inventory run is red (checked: `4 pass`, `0 fail`).
7. `jsonc-parser` cannot be imported from a test under `tools/`
   (checked: `tool-devsync:lint` and `tool-devsync:typecheck` both exit 0 with the
   import present).

Post-proof stop conditions, evaluated only **after** restoration (section 7):

8. A named negative leaves its named test **passing**, after one location re-check.
9. A negative moves `occurrences` or a category count where its row says
   "unchanged", or leaves them unchanged where its row says they move.
10. C6 or E6 — the two experiments — **fails**. The derived form would not have
    removed the serialisation, which is the packet's whole purpose.
11. A step needs a file outside section 5's table, or an Nx target of any name.

## 13. Hand-over

The full `git status --short --untracked-files=all` path list at the end of the
last slice, including the files changed only by required `Proof:` comments:

```
 M tools/tool-devsync/src/repo-namespacing-handoff.test.ts
 M tools/tool-devsync/src/workspace-inventory.test.ts
?? openspec/changes/derive-devsync-pins/
```

`tools/tool-devsync/workspace-inventory.mjs`, `tools/tool-dagger/src/main.ts`,
`apps/wbs/be-01/project.json` and
`apps/wbs/be-01/scripts/solver-orphan-fixture.Dockerfile` are mutated during
proofs and **must not appear**: each is restored and `cmp`-verified. If any of
them appears, a restore was missed — say so rather than committing it.

## 14. Assumptions recorded

A1 to A6 are in section 4. In addition:

- **A7.** The executor's tree may carry other lanes' untracked files, which the
  legacy-root scan reads. Every digest and count in this packet is therefore a
  planner observation on a clean tree, and the executor pins the value **its own
  run reports** (D3). This is the only literal the executor writes.
- **A8.** The dates in new `Proof:` comments are the executor's actual run dates,
  not `2026-09-21`.
- **A9.** `docs/wiki-policy/*.json` and the Twilight Bureaucrat rules pin inputs of
  these files but read neither literal (section 3.1), so no policy file changes.
