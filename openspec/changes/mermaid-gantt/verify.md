# verify — `mermaid-gantt`

Branch `change/mermaid-gantt`, cut from `main` @ `30e8c4c` (#63 merged) on
2026-08-14. **R7 M1** of `notes/wbs-brief-2026-08-14-r7-markdown-export.md`.

**Run under the PoC-mode contract of 2026-08-14**, with the amendment the first
trial produced: no `design.md`, no citation table, watched reds for new guards
only, `nx affected` locally and **`nx format:check --all`** rather than
`--base`, and **CI is the gate of record**.

## Wall clock

| moment                                 | UTC              |
| -------------------------------------- | ---------------- |
| branch cut                             | 2026-08-14 18:35 |
| code and tests written                 | 2026-08-14 18:41 |
| first `fe-01:test` run (2 red, my own) | 2026-08-14 18:44 |
| both faults injected and watched       | 2026-08-14 18:46 |
| green `nx affected` (2nd attempt)      | 2026-08-14 18:54 |
| openspec, format, record               | 2026-08-14 19:01 |
| PR open                                | see the PR       |

**Branch cut to PR open: see the PR's own timestamp; the table above is the
work.** Roughly **20 minutes were code and tests** — `plan-mermaid.ts`, its 29
tests, the `ExportSlice` widening and the fixture it broke — and roughly **10
were record and gate**: `proposal.md`, `tasks.md`, the delta spec, this file,
and four runs on h2puni.

The largest single cost, again, was neither: it was **reading** `plan-export.ts`,
`wbs-api.ts`'s `SliceView`, `calendarScale`'s docstring and `work-item.service`'s
`datesOf` far enough to know that the chart's scale and be-01's dates are the
same arithmetic read two ways — and that `endOf` of a whole workday is the
_left_ limit of that day, which is the whole of fault 1 below. That is the third
run in a row where understanding, not writing, was the bill.

## The gate

`bunx nx affected -t test lint typecheck --base=origin/main` on **h2puni**, in
`/home/puni1/wd/puni/wt-mermaid-m1` (a worktree of `/home/puni1/wbs-reds`),
bun 1.2.20, `/tmp` at 21%. Nothing was compiled or tested on h1claw.

| run                                        | result                                                   |
| ------------------------------------------ | -------------------------------------------------------- |
| affected projects                          | **fe-01** alone                                          |
| `nx affected -t test lint typecheck` (1st) | **4 failed, 1367 passed** + 2 lint errors — both below   |
| `nx affected -t test lint typecheck` (2nd) | **1371 passed, 53 files**, lint and typecheck clean, 97s |
| `nx format:check --all`                    | clean, exit 0                                            |
| `openspec validate --all`                  | **49 items, 49 passed, 0 failed**                        |

be-01, gw-01 and `libs/domain` are not affected and were not run: nothing
outside `apps/fe-01` and `openspec/` is touched. The full gate — `run-many`,
e2e, secrets, doc caps — was not run here by contract.

**fe-01 went 1,340 → 1,371.** The 31 are this change's own file (29) plus the
two the `ExportSlice` widening pulled into `plan-export.test.ts`'s existing
describe.

### The two lint errors, both mine

`simple-import-sort` on the test file (`NO_SCHEDULE_TO_DRAW` sorts before
`NOT_ON_A_CALENDAR`), and `jsdoc/no-multi-asterisks` on `mermaidPhrase`'s
docstring, where `*metadata*` reads as a stray asterisk. **`eslint --fix`
corrupted the second one** — it deleted the leading asterisk and left
`metadata*`, which is a fix that changes prose. Reworded to `_metadata_` by
hand. Worth knowing before anyone runs `--fix` over a docstring in this repo.

### The four test failures, not mine

`wbs-table.test.tsx`, in the run that also carried the lint errors: four cases
around `unfoldRole` and `CreatablePicker` failing to find a button, amid the
usual `not wrapped in act(...)` noise. The **same file passed 433/433 in the
run ten minutes earlier** on the same tree, and 433/433 again on the retry.
Contention on h2puni while `lint` and `typecheck` shared the box, the same class
as the ws-proxy flakes on the record. This diff cannot reach that file: it adds
one module nothing imports yet and widens a type.

## The two guards, both watched red

PoC mode keeps injected faults for **new guards**, and this change has two.

| #   | fault injected                                                       | observed                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `Math.max(first, …)` struck from `tasksOf` — the end clamp gone      | **2 failed, 27 passed** in `plan-mermaid.test.ts`: `never ends a bar before it starts` and `keeps an unestimated slice apart from one estimated at zero`, each drawing an end **a day before its own start** |
| 2   | the `seen` set struck from `outermost` — the ancestor walk unbounded | the run **never finishes**. `timeout 90 bunx vitest run … --testTimeout=5000` exits **124** with nothing past `RUN`                                                                                          |

Fault 2 is the more interesting of the two, and it is why the guard is there
rather than being a `throw`: the loop is synchronous, so it blocks the event
loop and **vitest's own `--testTimeout` cannot fire**. A `parentId` cycle in the
document would not fail the copy button, it would hang the tab. The tree
`planForExport` builds cannot contain one — but this writer is handed a
document, not a tree.

`plan-mermaid.ts` was restored from a copy after each injection and the suite
re-run green.

## The two grammar traps

Both taken, and **neither is watched** — a real Mermaid parse in the suite is
**M5**, deliberately out of this change, so both are arguments from Mermaid's
source as quoted in the brief (`ganttDb.js` at v11.16.1) rather than results.

1. **`excludes weekends` shifts every bar except where an explicit `YYYY-MM-DD`
   end sets `manualEndTime`.** Every task this writer emits carries two literal
   dates, so `checkTaskDates` returns early on all of them and the keyword is
   left doing only what we want: painting the weekend bands. **Uniformity was
   bought deliberately here** — a point (an unestimated slice, or one estimated
   at zero) is emitted as `milestone` with its two equal dates rather than with
   the `0d` duration the docs use, because a duration does not parse as
   `YYYY-MM-DD` and a `0d` milestone would be the one shape on the diagram that
   `excludes` was still free to move.
2. **End dates are exclusive unless `inclusiveEndDates` is declared.** It is
   declared, and `to` is the last day the work is still on — be-01's own
   `endsOn` reading, through the chart's scale. Without that line every bar is a
   day short. `ends a bar on the last day the work is still on` is the test; a
   three-workday slice from Tuesday the 1st ends **Thursday the 3rd**.

The residual risk is upstream drift: §3.2 of the brief rests on a hardcoded
`'YYYY-MM-DD'` inside Mermaid's own `ganttDb.js`, and a tidy-up there moves our
dates with no test to catch it. **That is exactly what M5 is for, and it should
not be cut.**

## What is NOT in this branch: the toolbar button

**M1's Copy as Mermaid action is not wired.** The toolbar and its handlers live
in `wbs-table.tsx`, which this change was told not to touch — another agent owns
it this afternoon. Every other part of M1 is here and tested; the button is the
part that puts it on screen, and until it lands **nobody can reach
`planToMermaid` from the app.**

The patch, for whoever owns that file next. It is a paste beside `copyAsMarkdown`
(the import line already exists two lines above):

```tsx
import { planToMermaid } from './plan-mermaid';

/**
 * Puts the plan's chart on the clipboard as a Mermaid gantt, or says why there
 * is none. Same three clipboard outcomes as `copyAsMarkdown`, plus a fourth
 * this one has: a plan a gantt cannot be drawn of at all.
 */
const copyAsMermaid = useCallback(() => {
  const diagram = planToMermaid(planForExport());
  if (!diagram.drawn) {
    pushToast({ kind: 'error', text: diagram.refusal });
    return;
  }
  const clipboard = navigator.clipboard as Clipboard | undefined;
  if (clipboard === undefined) {
    pushToast({ kind: 'error', text: NO_CLIPBOARD });
    return;
  }
  void clipboard.writeText(diagram.text).then(
    () => {
      pushToast({ kind: 'info', text: 'Copied as Mermaid.' });
    },
    () => {
      pushToast({ kind: 'error', text: CLIPBOARD_REFUSED });
    },
  );
}, [planForExport, pushToast]);
```

and, between the two buttons at the `Copy as Markdown` / `Download CSV` pair:

```tsx
<Button
  variant="outline"
  size="sm"
  type="button"
  title="Copy the chart as a Mermaid gantt, for a Markdown document that draws it"
  onClick={copyAsMermaid}
>
  Copy as Mermaid
</Button>
```

The tests it needs are the four `copyAsMarkdown` already has in
`wbs-table.test.tsx` (`:9888` onward) with the fourth outcome added: a plan with
no start date toasts the refusal and **writes nothing to the clipboard**. That
last one is the only new assertion.

## What else was deliberately left out

- **M2**, the bundled `.md` (fence + the existing table under it) and
  `planFileName`'s extension argument. Until it ships, everything the diagram
  cannot draw is said only in `%%` comments — **invisible once rendered**. M1
  alone hands somebody a picture that has quietly dropped every dependency in
  the plan, and the comment block is the honest minimum, not the fix.
- **M3** the section choice (outline / phase / assignee) and `displayMode:
compact`; **M4** the SVG download; **M5** the parse test above.
- **No `mermaid` dependency of any kind**, dev or runtime. `package.json` is
  untouched.
- **No team name anywhere in the output**, which is the decision that makes this
  change independent of R2 — and is asserted, not merely intended: `prints no
team name anywhere, on a plan whose rows carry one`.

## The answers this change made, from the brief's six open questions

Q1 **per slice** — the diagram's unit is what the chart draws a bar for.
Q2 **section = the outermost ancestor**, the plan's own outline.
Q3 **refuse, with words** — as asked.
Q5 **copy first** (the button, above). Q6 **whole plan**, and the comment block
says so. Q4 is M5's and is untouched.

## For Dany

One open question, recorded rather than guessed: **the escaped colon is U+2236
RATIO (`∶`), not `-`.** The brief offered either. The homoglyph keeps a name
reading the way it was typed — `Phase 1∶ strip` — at the cost of putting a
character in the export that a reader copying the text back out will not be able
to type. The alternative loses the punctuation but stays ASCII. One line in
`mermaidPhrase` either way.

## CI

Quoted in a comment on the PR: a file cannot carry the id of the run that judges
it. Both jobs green at the head is the condition for merge, and **this branch is
not merged**.
