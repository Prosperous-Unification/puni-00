# verify — `mermaid-parse-test`

Branch `change/mermaid-parse-test`, cut from `main` @ `1a17190` (#72 merged) on
2026-08-17. **R7 M5** of `notes/wbs-brief-2026-08-14-r7-markdown-export.md`.

**Run under the PoC-mode contract** (`notes/delivery-modes.md`): no
`design.md`, no citation table, watched reds for new guards only, `nx
affected` locally plus **`nx format:check --all`**, and **CI is the gate of
record**.

**One gap in the PoC-mode contract, found by CI rather than avoided: it does
carry a spec delta, and the local gate cannot tell you that.** `openspec
validate --all` runs unconditionally inside CI's `gate` job — it is not part
of the PoC-mode local contract (`nx affected` + `format:check`), so the first
CI run of this branch failed on it (`OpenSpec` step, "Change must have at
least one delta"). Fixed by adding five scenarios to the two requirements
M1/M3 already own, naming the parser-observable guarantees M5 tests as formal
scenarios rather than as docstring argument. No existing `SHALL` changes
meaning — see §6.2 of `tasks.md`. Worth carrying into `delivery-modes.md`
itself: **every change needs at least one delta, always, and the local
contract has no step that would catch a change with none.**

## Wall clock (UTC)

| moment                                                                                                                    | time        |
| ------------------------------------------------------------------------------------------------------------------------- | ----------- |
| task start, briefs read                                                                                                   | 10:44       |
| worktree cut (`git worktree add … origin/main`), on h2puni                                                                | 10:44–10:46 |
| `bun add -d mermaid` — installs clean, no other version bump                                                              | 10:46       |
| API exploration: `mermaidAPI.getDiagramFromText` found and proven under jsdom (bun scripts, then a real vitest run)       | 10:46–10:51 |
| `plan-mermaid.test.ts`'s M5 describe block written (8 new tests)                                                          | 10:51–10:56 |
| both watched reds run and restored (below)                                                                                | 10:56–10:58 |
| `proposal.md`/`tasks.md` drafted; one real eslint finding (`no-deprecated` on `mermaidAPI`) fixed with a disable + reason | 10:58–11:00 |
| gate green, format clean, before/after timing captured                                                                    | 11:00–11:02 |
| this file, PR opened                                                                                                      | ~11:05      |

**Branch cut to PR open: about 20 minutes.** Split: roughly half was
**understanding** — Mermaid's public API (`parse`/`render`) does not expose
parsed task data at all, and finding the `@internal`/`@deprecated`
`mermaidAPI.getDiagramFromText` path, then discovering it throws under Bun's
bare module loader and needs vitest's own `jsdom` environment (not a manual
`JSDOM` shim) to run `DOMPurify` — took three failed scripts before the fourth
worked. The rest was writing the eight tests, the two watched reds, and the
record. No production code changed at any point.

## The gate

`bunx nx affected -t test lint typecheck --base=origin/main` on **h2puni**, in
`~/wd/puni/wt-mermaid-parse-test` (a worktree of `~/wbs-reds`), bun 1.2.20,
`/tmp` at 13%.

| run                                                               | result                                                                                                                                  |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| affected projects                                                 | **fe-01** alone                                                                                                                         |
| `nx affected -t test lint typecheck` (1st, before the eslint fix) | **fe-01:lint failed** (1 error, below); test target itself **1,413 passed, 53 files**, 86.4s test duration                              |
| eslint fix applied, `fe-01:lint` alone                            | clean                                                                                                                                   |
| `nx affected -t test lint typecheck` (2nd)                        | **1,413 passed, 53 files**, lint and typecheck clean, 57.5s wall (61/63 tasks read from cache — only fe-01's three targets re-ran live) |
| `nx format:check --all`                                           | flagged 2 files (this test file, `proposal.md`) → `format:write` → clean, exit 0                                                        |

be-01, gw-01 and `libs/domain` are not affected and were not run: nothing
outside `apps/fe-01` and `openspec/` is touched.

**fe-01 went 1,405 → 1,413.** The 8 are this change's own file; no other test
file or fixture was touched.

### The one real finding: not in Mermaid, in this repo's own lint

`@typescript-eslint/no-deprecated` flagged `mermaidAPI` — Mermaid's own docs
mark it `@deprecated` in favour of `parse`/`render`. Neither replacement fits:
`parse` only validates syntax and returns nothing about dates or ids;
`render` demands a live SVG container to draw into, which is pixels this
suite has no reason to build. `getDiagramFromText` is the one path Mermaid
ships to a parsed diagram's task data. Silenced with
`eslint-disable-next-line` and a comment naming why, at the one call site.

## Two watched reds — proving the real-parse tests watch something, not decoration

PoC mode keeps injected faults for **new guards** in production code; this
change adds none. What it adds is **test infrastructure whose entire value
proposition is catching upstream drift a string assertion cannot** — so the
bar here is proving these tests are not vacuous restatements of the
string-assertion tests sitting beside them. Both faults were injected into
`plan-mermaid.ts`, `plan-mermaid.ts` restored from `/tmp/plan-mermaid.ts.orig`
afterward, suite re-run green (48/48) before anything was committed.

| #   | fault injected                                                                                         | observed                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `mermaidPhrase`'s `.replaceAll(':', RATIO)` target string changed so the colon replacement never fires | **3 failed, 45 passed**: the two existing string-assertion tests fail on a missing substring, and the M5 real-parse test fails on a **different symptom** — `task.id` reads `'strip - Dev :s1'` (the real lexer's actual corruption) rather than `'s1'`. The real parser catches the same fault through its own consequence, not through a shared string. |
| 2   | the `inclusiveEndDates` line's keyword garbled one character (`inclusiveEndDatesXXX`)                  | **all 8 M5 tests fail**, every one with a thrown real Mermaid **parse error** (`Expecting 'taskData', got 'NL'`) rather than a wrong date. None of the string-assertion tests move — the emitted line still contains `inclusiveEndDatesXXX` as a literal substring they'd happily accept. Only the real parser notices the grammar broke.                 |

Fault 2 is the sharper of the two for the brief's own argument: it shows the
`inclusiveEndDates` declaration is load-bearing enough that a typo in it does
not quietly change one date — it makes the entire diagram fail to parse, and
**no test that only checks for the substring `inclusiveEndDates` in the
output would ever see that.**

## The three pins, watched clean against the unmodified writer

No production code changed. All eight new tests are green against
`plan-mermaid.ts` as merged in #65/#68/#71.

- **§3.2, the excludes-weekends trap.** A slice spanning Friday–Tuesday
  real-parses with `manualEndTime: true` and `startTime`/`endTime` exactly the
  literal dates the writer gave it — `excludes weekends` did not push them
  further out, which is the whole argument #65's docstring makes from reading
  `ganttDb.js` rather than from running it.
- **A point (unestimated/zero-duration) real-parses as a genuine Mermaid
  `milestone`** with `manualEndTime: true` and equal start/end — not the `0d`
  duration form the docs use, which would not have been `manualEndTime` at
  all and would have been exactly the shape `excludes weekends` was still
  free to move.
- **§3.3, inclusivity.** `db.endDatesAreInclusive()` reads `true` off the real
  diagram — Mermaid reports believing the declaration, not just that the
  writer emitted it.
- **§3.4, escaping.** A colon in a work item's name real-parses with the
  writer's own generated id (`s1`) intact. A **hand-built, unescaped**
  companion line — standing in for what `mermaidPhrase` refuses to ever emit —
  real-parses with the split moved exactly as the brief's reading of
  `gantt.jison` predicted: task text truncated to `'Phase 1'`, and the rest of
  the line, including the writer's own `s1`, swallowed into a corrupted id.
  This is the one test in the suite that proves the trap by triggering it
  rather than by avoiding it.
- **All three section modes #71 added.** A two-row, four-slice fixture (two
  roles, two people) real-parses clean under `outline`/`phase`/`assignee`,
  each with the exact section list and task count `sectionOf`'s docstring
  claims, via `it.each`.

## The cost, measured

Requested explicitly: this is a devDependency in a repo that gates every PR
and runs `pixels` in CI, so the cost has to be a number, not a guess.

**Single file, before → after** (`plan-mermaid.test.ts` alone, isolated via
`git stash`, same tree otherwise):

|                                                          | tests | test-execution time | vitest's own reported duration | wall clock (`time`) |
| -------------------------------------------------------- | ----- | ------------------- | ------------------------------ | ------------------- |
| before (40 tests, no `mermaid` import)                   | 40    | 15ms                | 720ms                          | 1.107s              |
| after (48 tests, `mermaid` imported once in `beforeAll`) | 48    | 234ms               | 820ms                          | 1.208s              |

**+219ms of test-execution time for 8 new tests** — almost all of it the one
dynamic `import('mermaid')` pulling in d3, cytoscape and friends once; each
individual real parse of a few-line gantt fence is on the order of a
millisecond once the module is loaded.

**Whole fe-01 suite, before → after** (`bunx vitest run` in `apps/fe-01`, no
`--filter`, everything else in the tree identical):

|        | tests | files | duration                        | wall clock |
| ------ | ----- | ----- | ------------------------------- | ---------- |
| before | 1,405 | 53    | 53.33s                          | 53.92s     |
| after  | 1,413 | 53    | 56.62s (56.06s on a repeat run) | 57.18s     |

**About +3.3s, roughly +6%, on the whole suite.** fe-01's own baseline in
`notes/delivery-modes.md` (57s, 2026-08-14) already sits in this range —
this change moves it from "under a minute" to "still under a minute," not
into a different bracket. CI's `gate` job (~3m30s) and `pixels` (~8m50s) are
unaffected: `mermaid` is a devDependency this test file alone imports, and
`pixels` never runs a unit test.

**Worth it.** Three watched-red-proof pins against upstream drift, for +3.3
seconds on every future run of the suite that already runs on every PR. The
alternative — the string-assertion argument M1 shipped with — has no way to
notice the day `ganttDb.js`'s hardcoded `'YYYY-MM-DD'` moves.

## What is NOT in this branch

- **No production code.** The real parser disagreed with nothing in
  `plan-mermaid.ts`; there is no generator bug to report.
- **No new requirement, no behaviour change.** The spec delta this change
  does carry (added after CI's first red, above) is additive scenarios under
  M1's and M3's existing requirements, not a new `SHALL`.
- **No `mermaid.render()`, no SVG, no app-visible surface.** Only
  `mermaidAPI.getDiagramFromText`'s parsed diagram data is read.

## CI

PR **(opened after this file)**. Run id and conclusion recorded on the PR as a
comment once the head is final — a file cannot carry the id of the run that
judges its own tail, same rule #65/#68/#69/#71 followed.

**This branch is not merged** — PoC mode still holds cross-review before
merge (`delivery-modes.md` open question 2).
