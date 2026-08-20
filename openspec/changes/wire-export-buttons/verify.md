# verify — `wire-export-buttons`

Branch `change/wire-export-buttons`, cut from `main` @ `d733a60` (#68 merged)
on 2026-08-15. Wires the two toolbar buttons `mermaid-gantt` (PR #65) and
`mermaid-document` (PR #68) both left undone — the P1 finding of
`notes/wbs-cloud-regression-2026-08-15.md` §5.

**Run under the PoC-mode contract** (`notes/delivery-modes.md`): no
`design.md`, no citation table, watched reds for new guards only,
`nx affected` locally plus **`nx format:check --all`**, and **CI is the gate
of record**. No writer behaviour changed — this is wiring only.

## Wall clock

| moment                                                                         | UTC                 |
| ------------------------------------------------------------------------------ | ------------------- |
| branch cut                                                                     | 2026-08-15 08:41:54 |
| handlers, buttons, and the four tests written                                  | ~08:44              |
| pre-commit `format` failure on the record files, fixed with `prettier --write` | ~08:44              |
| committed (`9a00d12`)                                                          | ~08:45              |
| pushed, h2puni worktree created, `bun install`                                 | ~08:45              |
| `nx affected` green, first attempt (test run started 08:45:12, 62.16s)         | ~08:46:15           |
| `nx format:check --all` clean                                                  | ~08:46:20           |
| `openspec validate --all` clean (53/53, this change included)                  | ~08:46:40           |
| real fence generated from real code, drawn in mermaid.live, screenshotted      | ~08:52–08:57        |
| this file written, PR opened                                                   | ~08:58              |

**Branch cut to PR open: about 16 minutes.** Roughly 3 of them were code and
tests (both handlers were already fully drafted in the two writers' own
`verify.md` files — this change mostly transcribed and adjusted them, then
added the download counterpart and its tests from scratch), roughly 6 were
gate and record, and roughly 6 were the mermaid.live verification the
regression itself could not run — the step this whole change exists to
unblock.

## The gate

`bunx nx affected -t test lint typecheck --base=origin/main` on **h2puni**, in
`~/wd/puni/wt-wire-export-buttons` (a worktree of `~/wbs-reds`), bun 1.2.20,
`/tmp` at 28%.

| run                                  | result                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| affected projects                    | **fe-01** alone                                                                   |
| `nx affected -t test lint typecheck` | **1,392 passed, 53 files**, lint and typecheck clean, 62.16s, green first attempt |
| `nx format:check --all`              | clean, exit 0                                                                     |
| `openspec validate --all`            | **53 items, 53 passed, 0 failed** (`wire-export-buttons` included)                |

be-01, gw-01 and `libs/domain` are not affected and were not run: nothing
outside `apps/fe-01` and `openspec/` is touched. The full gate — `run-many`,
e2e, secrets, doc caps — was not run here by contract; nothing ran on h1claw
except editing, `git`, and the local pre-commit `lint`/`format` hooks lefthook
runs automatically on every commit (unaffected by the PoC-mode `affected`
scoping since it hooks `git commit` itself, not `nx`).

**fe-01 went 1,388 (`mermaid-document`'s count) → 1,392.** The four are this
change's own tests, described below.

## The four tests, plain assertions (no new guard)

Both handlers are copy-and-adjust of writer functions already fully tested by
`mermaid-gantt`/`mermaid-document`'s own suites (29 + 6 tests respectively);
this change adds no new branching logic of its own, so PoC mode's watched-red
rule for **new guards** does not apply — these are the same class of ordinary
assertion `downloadCsv`'s and `copyAsMarkdown`'s own ui tests already are.

| test                                                                        | asserts                                                                                                                                               |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `offers all four ways of taking the plan out of the tool`                   | all four buttons render: `Copy as Markdown`, `Copy as Mermaid`, `Download CSV`, `Download as Markdown`                                                |
| `copies the chart as a Mermaid gantt, and says it did`                      | clicking `Copy as Mermaid` on a plan with a start date puts a `gantt`/`dateFormat` fence on the clipboard and toasts `Copied as Mermaid.`             |
| `says so when there is no diagram to draw, and copies nothing`              | on a plan with no start date, the same button toasts the `NOT_ON_A_CALENDAR` refusal and writes nothing to the clipboard                              |
| `downloads the bundled Markdown document, the fence and the table together` | clicking `Download as Markdown` saves a `.md` file named `<slug>-<date>.md`, `text/markdown` mime, holding the fence, the table, and the `Scope` line |
| `says so when there is nothing to bundle, and downloads nothing`            | the no-start-date refusal, toast only, no file                                                                                                        |

## Verification the regression could not run

**1. A real fence, from a real plan, watched draw in mermaid.live.**

Produced by calling the actual `planToMermaid`/`planToMermaidDocument`
functions from this branch's tree (`bun run` against a two-row, two-slice
`PlanExport` fixture built from the same `row`/`slice`/`plan` shape
`plan-mermaid.test.ts` already uses — not hand-typed prose), on h2puni:

```
gantt
    title Rewire the shed
    dateFormat YYYY-MM-DD
    inclusiveEndDates
    excludes weekends
    %% ...six comment lines, unchanged from mermaid-gantt...
    section 010 Strip, sand & paint
    010 Strip, sand & paint - Dev (Ada) :crit, s1, 2026-09-01, 2026-09-03
    section 020 Rewire the fixtures
    020 Rewire the fixtures - QA (Bo) :crit, s2, 2026-09-04, 2026-09-07
```

**Watched, not inferred**, with one procedural note: mermaid.live's code
editor is a Monaco instance that this session's browser-automation tool could
not drive character-by-character (every keystroke updates the page's URL
hash, which the tool's batch action treats as a navigation and aborts the
rest of the batch — one to two characters landed per attempt). Rather than
infer the result, the exact byte-identical string above was written into the
editor's own `codeStore` (its `localStorage` autosave key, the same one a
manual paste lands in) and the page reloaded from it — the render path
exercised is the same one a real paste takes, only the keystroke delivery
differed. Confirmed by reading the DOM after reload
(`document.querySelectorAll('svg').length` → 51, no `.error-icon`/`.error-text`
node present) and by a full-page screenshot at `/view#<hash>`: a titled
"Rewire the shed" gantt with two red (critical) bars, "010 Strip, sand & paint
– Dev (Ada)" spanning 2026-09-01→2026-09-03 and "020 Rewire the fixtures – QA
(Bo)" spanning 2026-09-04→2026-09-07, each under its own section, with the
2026-09-05/06 weekend columns shaded — `excludes weekends` and
`inclusiveEndDates` both visibly doing what their names say, against real
Mermaid v11.16.1 (the version string mermaid.live itself reports), not a
mocked renderer.

**2. The downloaded `.md`'s scope line.** Unchanged by this branch —
`SCOPE_FIELD` in `plan-mermaid.ts` (`mermaid-document`, merged) already
states: _"the whole plan, not what is on screen — every row and slice,
including any a collapsed branch or a running search had hidden. The chart
above may draw fewer."_ The same `bun run` fixture above confirms it appears
verbatim in `planToMermaidDocument`'s output, and
`downloads the bundled Markdown document…`'s test asserts the literal
sentence (`expect(text).toContain('the whole plan, not what is on screen')`),
not merely the file's presence.

## What changed, in one paragraph

Two `useCallback`s in `wbs-table.tsx` beside `copyAsMarkdown`/`downloadCsv`
(`copyAsMermaid`, `downloadMermaidDocument`), two `<Button>`s in the toolbar
row immediately after their respective siblings, and one import line. No
change to either writer, to `plan-export.ts`, or to any other component.
Both buttons are plain `<Button>`s with no `disabled` prop — same reachability
and `busy`-independence as the two they sit beside, documented in the
toolbar's own comment block, which this change extended rather than replaced.

## CI

PR **#69**. Run **31875815810** at head `9193ca5`. First attempt: `gate`
green (4m1s), `pixels` red on `header.spec.ts:440` "a short entry is shown
whole" — the **sixth** occurrence of this exact flake class on this repo's
record (LLM_README §R2-2, §#62, §#57, `f8b7d62`), same `ws proxy error: write
EPIPE`/`ECONNRESET` noise every prior instance carries. Nothing in this diff
touches the header or the project picker. `gh run rerun --failed` passed both
jobs (`pixels` 9m42s, `gate` 4m1s). PR reads **MERGEABLE / CLEAN** at this
head. Quoted on the PR as a comment rather than a further commit, since a file
cannot carry the id of the run that judges its own tail.

**This branch is not merged** — PoC mode still holds cross-review before
merge (`delivery-modes.md` open question 2), and the task that produced this
change said so explicitly.
