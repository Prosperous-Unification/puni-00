# verify — `mermaid-lanes`

Branch `change/mermaid-lanes`, cut from `main` @ `cf57109` (#69 merged) on
2026-08-16. **R7 M3** of `notes/wbs-brief-2026-08-14-r7-markdown-export.md`.

**Run under the PoC-mode contract** (`notes/delivery-modes.md`): no
`design.md`, no citation table, watched reds for new guards only, `nx
affected` locally plus **`nx format:check --all`**, and **CI is the gate of
record**.

## Wall clock (UTC)

| moment                                                                      | time  |
| ---------------------------------------------------------------------------- | ----- |
| branch cut (`git worktree add … origin/main`)                                | ~18:40 |
| `plan-mermaid.ts`/`plan-mermaid.test.ts` written, proposal/tasks/spec delta drafted | 18:46 (commit `a36f083`) |
| gate run on h2puni: **format:check flagged two files, not the tests**        | 18:47–18:52 |
| `prettier --write`, committed                                                | 18:52 (commit `ee3bc40`) |
| real fences generated (`bun` against the module directly) and watched drawn in mermaid.live, all three modes | 18:52–18:55 |
| test review found the first two M3 tests could pass on a coincidence (see below); fixtures sharpened to a genuine 3-row interleave, watched red on the fault, watched green restored | 18:55–18:56 (commit `83e4cb7`) |
| final gate green, format clean                                               | 18:57 |
| this file written, PR opened                                                 | ~19:05 |

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

| run                                   | result                                                       |
| -------------------------------------- | -------------------------------------------------------------- |
| affected projects                      | **fe-01** alone                                                |
| `nx affected -t test lint typecheck`   | **1,397 passed, 53 files**, lint and typecheck clean, ~63s, green |
| `nx format:check --all`                | clean, exit 0 (after one `prettier --write` round on my own diff) |

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
`assignee` grouping would still *compute* the right label per task, but two
rows sharing a role or a person that are not adjacent in the row list would
draw as two separately-headed `section` bands of the same name — not a
section at all, just two.

**First attempt at a test for this was too weak, and the injection caught it,
not a code review.** The original two-row fixtures happened to keep same-role
and same-person slices adjacent by coincidence of only having two rows, so
striking the guard only changed *ordering*, not *contiguity*, and one of the
two tests (`groups by phase…`) passed against the faulted code. Rewritten to
three rows — the shared group's two rows with a different group's row
between them — so the fault, if reintroduced, cannot hide.

| #   | fault injected                                                                 | observed                                                                                                                                          |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
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

## What is NOT in this branch: a toolbar control

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
