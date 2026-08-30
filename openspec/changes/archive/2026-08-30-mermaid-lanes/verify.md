# verify — `mermaid-lanes`

Branch `change/mermaid-lanes`, cut from `main` @ `cf57109` (#69 merged) on
2026-08-16. **R7 M3** of `notes/wbs-brief-2026-08-14-r7-markdown-export.md`.

**Run under the PoC-mode contract** (`notes/delivery-modes.md`): no
`design.md`, no citation table, watched reds for new guards only, `nx
affected` locally plus **`nx format:check --all`**, and **CI is the gate of
record**.

## Wall clock (UTC)

| moment                                                                                                                                                                               | time                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| branch cut (`git worktree add … origin/main`)                                                                                                                                        | ~18:40                         |
| `plan-mermaid.ts`/`plan-mermaid.test.ts` written, proposal/tasks/spec delta drafted                                                                                                  | 18:46 (commit `a36f083`)       |
| gate run on h2puni: **format:check flagged two files, not the tests**                                                                                                                | 18:47–18:52                    |
| `prettier --write`, committed                                                                                                                                                        | 18:52 (commit `ee3bc40`)       |
| real fences generated (`bun` against the module directly) and watched drawn in mermaid.live, all three modes                                                                         | 18:52–18:55                    |
| test review found the first two M3 tests could pass on a coincidence (see below); fixtures sharpened to a genuine 3-row interleave, watched red on the fault, watched green restored | 18:55–18:56 (commit `83e4cb7`) |
| final gate green, format clean                                                                                                                                                       | 18:57                          |
| this file written, PR opened                                                                                                                                                         | ~19:05                         |

**Branch cut to PR open: about 25 minutes.** Split: roughly 6 minutes code and
tests (the sort/grouping logic and its docstrings), roughly 6 minutes record
(`proposal.md`, `tasks.md`, the spec delta), and roughly 13 minutes verification
— generating real fences, three mermaid.live round trips, and the one real
finding of this run: my own first-draft tests for the new guard were too weak
to prove it, caught only by actually injecting the fault and reading the
diff rather than by trusting the test names.

## The gate

`bunx nx affected -t test lint typecheck --base=origin/main` on **h2puni**, in
`~/wd/puni/wt-mermaid-lanes` (a worktree of `~/wbs-reds`), bun 1.2.20, `/tmp`
at 15%.

| run                                  | result                                                            |
| ------------------------------------ | ----------------------------------------------------------------- |
| affected projects                    | **fe-01** alone                                                   |
| `nx affected -t test lint typecheck` | **1,397 passed, 53 files**, lint and typecheck clean, ~63s, green |
| `nx format:check --all`              | clean, exit 0 (after one `prettier --write` round on my own diff) |

be-01, gw-01 and `libs/domain` are not affected and were not run: nothing
outside `apps/fe-01` and `openspec/` is touched. `openspec` CLI is not
available in this environment (neither `bunx openspec` nor a global install
resolved) — not part of the PoC-mode gate contract, so this is a note rather
than a gap.

**`plan-mermaid.test.ts` stayed at 40 tests** (same file M1 shipped with 29,
M2 added none, this change edits the M1/M2 fixtures not at all and adds 5 new
`it`s under "the section choice (M3)"). fe-01's total is unchanged from #69's
own count, 1,397 — this diff adds no test file and no new describe outside the
one file.

## The one new guard, watched red

PoC mode keeps injected faults for **new guards**. This change adds exactly
one piece of real branching logic: `tasksOf`'s sort gaining the section's own
position as its **primary** key, ahead of row order. Without it, `phase` and
`assignee` grouping would still _compute_ the right label per task, but two
rows sharing a role or a person that are not adjacent in the row list would
draw as two separately-headed `section` bands of the same name — not a
section at all, just two.

**First attempt at a test for this was too weak, and the injection caught it,
not a code review.** The original two-row fixtures happened to keep same-role
and same-person slices adjacent by coincidence of only having two rows, so
striking the guard only changed _ordering_, not _contiguity_, and one of the
two tests (`groups by phase…`) passed against the faulted code. Rewritten to
three rows — the shared group's two rows with a different group's row
between them — so the fault, if reintroduced, cannot hide.

| #   | fault injected                                                                                                                      | observed                                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | the three lines computing `sectionOf(...).order` struck from `tasksOf`'s `.sort`, leaving only the M1-era row/role/date/id tiebreak | **2 failed, 38 passed** in `plan-mermaid.test.ts`: both `groups by phase…` and `groups by assignee…` now draw `Dev`/`Ada` as **two separate, non-contiguous sections** — observed section order `[Dev, no phase, QA, Dev]` and `[Ada, unassigned, Bo, Ada]` |

`plan-mermaid.ts` was restored from a copy (`/tmp/plan-mermaid.ts.orig` on
h2puni) after the injection and the suite re-run green (40/40) before
committing the sharpened tests.

## Real fences, watched drawn in mermaid.live — all three modes

Generated by calling the actual `planToMermaid` from this branch's tree
against a two-row, four-slice fixture (two roles, two people, one critical
slice per role) via `bun <script>.ts` on h2puni — not hand-typed prose, and
not the same fixture the unit tests use. All three outputs pasted into
<https://mermaid.live> the same way `wire-export-buttons` did (#69): the
Monaco editor's own autosave key, `codeStore` in `localStorage`, was set to
each fence's exact bytes and the page reloaded from it — the render path a
paste takes, keystroke delivery aside. Confirmed against real Mermaid
**v11.16.1** (the version string mermaid.live itself reports) each time by
reading the DOM after reload: `svg` count, no `.error-icon`/`.error-text`,
and the drawn `.sectionTitle`/task text lists compared against the fence.

**`outline` (the default — unchanged from M1):**

```
gantt
    title Rewire the shed
    ...
    section 010 Strip cables
    010 Strip cables - Dev (Ada) :crit, s1, 2026-09-01, 2026-09-03
    010 Strip cables - QA (Bo) :s2, 2026-09-04, 2026-09-04
    section 020 Rewire fixtures
    020 Rewire fixtures - Dev (Ada) :crit, s3, 2026-09-07, 2026-09-08
    020 Rewire fixtures - QA (Bo) :s4, 2026-09-09, 2026-09-09
```

Watched: 51 `svg` nodes, no error, `sectionTitle` = `["010 Strip cables",
"020 Rewire fixtures"]`, all four task texts present (two rendered
`taskTextOutside*` since their bars are single-day).

**`phase`:**

```
gantt
    ...
    section Dev
    010 Strip cables - Dev (Ada) :crit, s1, 2026-09-01, 2026-09-03
    020 Rewire fixtures - Dev (Ada) :crit, s2, 2026-09-07, 2026-09-08
    section QA
    010 Strip cables - QA (Bo) :s3, 2026-09-04, 2026-09-04
    020 Rewire fixtures - QA (Bo) :s4, 2026-09-09, 2026-09-09
```

Watched: `sectionTitle` = `["Dev", "QA"]`, no error — the two rows' Dev
slices drawn under one lane, exactly the recovery the brief's Q2 argued for.

**`assignee`:**

```
gantt
    ...
    section Ada
    010 Strip cables - Dev (Ada) :crit, s1, 2026-09-01, 2026-09-03
    020 Rewire fixtures - Dev (Ada) :crit, s2, 2026-09-07, 2026-09-08
    section Bo
    010 Strip cables - QA (Bo) :s3, 2026-09-04, 2026-09-04
    020 Rewire fixtures - QA (Bo) :s4, 2026-09-09, 2026-09-09
```

Watched: `sectionTitle` = `["Ada", "Bo"]`, no error, same task set as `phase`
(this fixture happens to have one person per role) but grouped the other way.

## The toolbar control — landed 2026-08-30, task 4.2

**The gap below is closed.** Everything from "What is NOT in this branch"
onwards is left as written, because it is the record of what the first pass
shipped and why; this section is what changed after it.

### Shape, and why this one

A `<select>` labelled **`Mermaid lanes`**, offering `SECTION_MODES` itself
(`outline` / `step` / `assignee`), at the foot of the plan toolbar's **Export
`<details>` panel** — under the five export buttons, two of which it governs.

- **Inside the Export panel, not on the bar.** `plan-toolbar-controls` pinned
  the folded toolbar at **1600px** at 1280 (`e2e/layout.spec.ts`,
  `FOLDED_TOOLBAR_BUDGET_PX`), and the pin is the sum of `[data-toolbar]`'s
  **children** plus the gaps. The panel is `absolute`, so the `<details>` the
  toolbar lays out is its `summary` and nothing else — a control in the panel
  costs the pin exactly nothing. Measured rather than assumed, below.
- **A `<select>`, not three buttons and not a menu.** Mermaid has one grouping
  channel, so the three modes are mutually exclusive and a picker is the
  honest control; three buttons would also have been three toolbar children
  had they gone on the bar. `closingControlIn` dismisses the phone's toolbar
  sheet on a `<button>` inside it and not on a `<select>`, so a picker is also
  the only shape that survives being used on a phone before the export it
  configures is clicked.
- **Remembered per browser** under `wbs.mermaidSectionMode`, one key for the
  browser rather than one per project — `wbs.ganttDetail`'s side of that line,
  not `wbs.ganttHeight.<projectId>`'s: a grouping is an answer about what an
  exported document is for, and a reader who wants assignee lanes wants them
  in the next plan too. Read as a claim at the boundary
  (`rememberedMermaidSectionMode`), and anything that is not one of the three
  takes the key with it.
- **Both call sites wired**: `copyAsMermaid` →
  `planToMermaid(planForExport(), mermaidSectionMode)` and
  `downloadMermaidDocument` → `planToMermaidDocument(plan, mermaidSectionMode)`.
  Nothing in `plan-mermaid.ts` needed to change for it beyond exporting
  `SECTION_MODES` and `isSectionMode`, exactly as this file predicted.

### Files

| file                                                 | what                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `apps/fe-01/src/components/wbs/plan-mermaid.ts`      | `SECTION_MODES` array (the union derived from it) and `isSectionMode`, the boundary check |
| `apps/fe-01/src/components/wbs/wbs-table.tsx`        | the key, its read/write pair, the state, the two call sites, the picker                   |
| `apps/fe-01/src/components/wbs/wbs-table.test.tsx`   | eight cases under `sharing the plan > the lane the Mermaid exports are grouped into`      |
| `apps/fe-01/src/components/wbs/plan-mermaid.test.ts` | one case: the list and the guard have not drifted apart                                   |

### The gate, run on this Mac (2026-08-30)

| command                                | result                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `bunx nx run fe-01:test`               | **1,951 passed, 61 files**, green, 165s                                                                                        |
| `bunx nx run fe-01:lint`               | green — 0 errors, 1 pre-existing warning at `wbs-table.tsx:4310`                                                               |
| `bunx nx run fe-01:typecheck`          | green (`tsc --build --force`, app and e2e projects)                                                                            |
| `bunx openspec validate mermaid-lanes` | `Change 'mermaid-lanes' is valid`                                                                                              |
| `bunx nx format:check --all`           | flags two files, **both another agent's** in-flight be-01/domain work; the four files above are clean under `prettier --write` |

The browser gate, on the shifted ports this checkout was given
(`CI=1 E2E_PORT_SHIFT=800`, be/gw/fe on 3900/4000/5000 — never the dev
server's 3100/3200/4200):

| command                                                         | result                                                                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `playwright test … layout.spec.ts -g "folded toolbar"`          | **1 passed**, 4.0s                                                                                              |
| the same with `FOLDED_TOOLBAR_BUDGET_PX` temporarily set to `1` | `Expected: <= 1 · Received: **1372.671875**` — the bar's own width with the picker in, 227px under the 1600 pin |

**No new browser test.** The one claim here that needs a layout is "the picker
costs the toolbar nothing", and `the folded toolbar fits its budget` already
makes it against a pinned number; a second spec asserting the same width would
be a second name for one check. The jsdom side asserts the other half — that
the picker is inside `[data-export-panel]`, which is what makes the width claim
true — and that assertion was watched failing with the control moved onto the
bar.

### The four watched reds

Every fault was injected into the shipped tree, the filtered run read, and the
tree restored from a copy before the next one. The `Proof:` comments beside the
checks quote these, and were written **from** them (`name-links-and-height`'s
lesson: a guessed `Proof:` is indistinguishable from an observed one).

| #   | fault injected                                                                       | observed                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `rememberedMermaidSectionMode`'s refusal replaced by `return claimed as SectionMode` | **2 failed, 6 passed** — `refuses a remembered lane this app does not offer…` on `expected '"assignees"' to be null`, `refuses remembered lanes that are not JSON at all…` on `expected '{not json' to be null`                       |
| 2   | the picker's `<label>` moved out of the `<details>` and onto the toolbar beside it   | **1 failed, 7 passed** — `offers the three lanes inside the Export menu…` on `AssertionError: expected null to be <select …(2)>…(3)</select>`                                                                                         |
| 3   | `copyAsMermaid`'s call site reverted to `planToMermaid(planForExport())`             | **3 failed, 5 passed** — all three clipboard readers, e.g. `expected 'gantt\n    title Rewire the shed\n   …' to contain 'section Dev'`                                                                                               |
| 4   | `downloadMermaidDocument`'s call site reverted to `planToMermaidDocument(plan)`      | **1 failed, 7 passed** — `bundles the downloaded document in the same lane` on `expected '**Project:** Rewire the shed\n**Final…' to contain 'section Dev'` — and only that one, since the other seven go through the other call site |

**One assertion that does not discriminate, and is labelled as such in the
test.** In the two refusal cases, `expect(lanes().value).toBe('outline')`
passed **with the fault in**: a `<select>` whose `value` matches no `<option>`
falls back to its first, so the picker reads `outline` either way. The dropped
key is the assertion that moves, and the comment beside it now says so rather
than leaving a future reader to believe both halves are gates
(`AGENTS.md`: delete — or at least name — the guard whose removal you cannot
see).

**One line deliberately not given a negative**, and named in its own comment:
the `if (!isSectionMode(asked)) return;` in the picker's `onChange` is
TypeScript narrowing over a `string`-typed `value` whose options are
`SECTION_MODES` itself, so nothing a browser can produce fails it. It is the
same line the `Plan with` picker beside it carries. The real boundary is the
storage read, which is fault #1 above.

### What this still does not do

- **No `displayMode: compact`** — the brief's other M3 line item is still out,
  for the reason below.
- **`tasks.md`, `proposal.md` and this file's earlier sections still say
  `phase`** where the code says `step`, a drift from the steps rename that
  landed after this change was written. Left alone deliberately: rewriting the
  record of what was shipped is worse than a stale word, and the delta spec's
  scenario names are the only place it is load-bearing.

## What was NOT in this branch: a toolbar control

**Nothing in the app can ask for `phase` or `assignee`.** `wbs-table.tsx` is
two other agents' file tonight and this change was told not to touch it.
`outline` ships as the default and is what every existing caller
(`planForExport` → `planToMermaid(plan)`, `planToMermaidDocument(plan)`,
`wbs-table.tsx:2722,2776`) still draws with no changes to those call sites.

This is the same gap M1 and M2 each left the same way — and it went unwired
for a day and cost a P1 in the 2026-08-15 cloud regression
(`notes/wbs-cloud-regression-2026-08-15.md` §5, `Copy as Mermaid`/`Download
as Markdown` both invisible on dev until #69). **Naming it loudly here so it
does not repeat a third time**, both in `proposal.md`'s non-goals and in the
report to Dany.

The shape of the control this owes, for whoever picks it up: a small picker
(three options, `outline`/`phase`/`assignee`) beside the two Copy buttons at
`wbs-table.tsx:7076-7095`, remembered per browser the way `wbs.ganttDetail`
already is (`gantt-panel.tsx:333`) — a new `localStorage` key, e.g.
`wbs.mermaidSectionMode`, read once and passed as the second argument to
`planToMermaid`/`planToMermaidDocument` at the two call sites above. Nothing
in `plan-mermaid.ts` needs to change for that patch to land; `DEFAULT_SECTION_MODE`
and `SectionMode` are already exported for it.

## What else was deliberately left out

- **`displayMode: compact`**, the brief's other M3 line item (folding
  same-role bars back onto one row where they do not overlap). Needs YAML
  front-matter, which the brief's §3 restricted to "unless Q2 says so" — Q2
  did not. Untouched.
- **No `mermaid` dependency of any kind.** `package.json` is untouched.
- **No team name anywhere in the output, in any mode** — unaffected by this
  change, M1's own decision, still asserted by M1's own test.

## CI

PR **(opened after this file)**. Run id and conclusion recorded on the PR as a
comment once the head is final — a file cannot carry the id of the run that
judges its own tail, same rule #65/#68/#69 followed.

**This branch is not merged** — PoC mode still holds cross-review before
merge (`delivery-modes.md` open question 2).
