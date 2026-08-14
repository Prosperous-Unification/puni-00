# verify — `mermaid-document`

Branch `change/mermaid-document`, cut from `main` @ `fbc2263` (#66 merged) on
2026-08-14. **R7 M2** of `notes/wbs-brief-2026-08-14-r7-markdown-export.md`,
built on M1 (`change/mermaid-gantt`, PR #65, merged as `f4a8a27`).

**Run under the PoC-mode contract of 2026-08-14** (`notes/delivery-modes.md`):
no `design.md`, no citation table, watched reds for new guards only,
`nx affected` locally plus **`nx format:check --all`**, and **CI is the gate of
record**.

## Wall clock

Task dispatched **2026-08-14 20:34 UTC**. Timestamps below are exact where a
tool call recorded one; `~` marks a time inferred from surrounding evidence
rather than watched directly — this run did not keep a stopwatch on every
step the way `mermaid-gantt`'s did.

| moment                                                                | UTC          |
| --------------------------------------------------------------------- | ------------ |
| task dispatched                                                       | 20:34        |
| `main` pulled to `fbc2263`, `plan-mermaid.ts` / `plan-export.ts` read | ~20:37       |
| code and tests written                                                | ~20:40       |
| lint + format fixed, first commit (`5a6fd6f`, git-recorded)           | 20:41:26     |
| pushed, h2puni worktree created, `bun install`                        | ~20:42       |
| `nx affected` green (test run started 20:41:58, 62.6s)                | ~20:43:05    |
| `nx format:check --all` clean (15.6s)                                 | ~20:43:25    |
| guard fault injected and watched red (1 failed / 34 passed)           | 20:43:48     |
| guard restored, green (79/79 across both files)                       | 20:43:57     |
| openspec docs written                                                 | ~20:44–20:50 |
| PR #68 open                                                           | 20:45:50     |

**Branch cut to PR open: ~12 minutes.** Split, approximately: **~6 minutes
code and tests** (reading M1's `plan-mermaid.ts`/`plan-export.ts` to reuse
their shapes rather than re-deriving them, writing `planToMermaidDocument`,
the header-line split, `planFileName`'s extension argument, and the tests),
**~6 minutes gate and record** (h2puni worktree + `bun install`, the affected
run, format check, the one watched guard, and this file plus `proposal.md`,
`tasks.md`, the delta spec).

Against `mermaid-gantt`'s 23 minutes for a new module and a type change, this
is a smaller change landing in about half the time — consistent with the
"fewer, bigger PRs amortise the reading" argument `delivery-modes.md`
records: M1 had already paid for reading `calendarScale`, `SliceView` and the
escaping rules, so M2 mostly reused shapes M1 established rather than reading
new ones.

## The gate

`bunx nx affected -t test lint typecheck --base=origin/main` on **h2puni**, in
`~/wd/puni/wt-mermaid-document` (a worktree of `~/wbs-reds`), bun 1.2.20,
`/tmp` at 26%.

| run                                  | result                                                      |
| ------------------------------------ | ----------------------------------------------------------- |
| affected projects                    | **fe-01** alone                                             |
| `nx affected -t test lint typecheck` | **1,388 passed, 53 files**, lint and typecheck clean, 64.7s |
| `nx format:check --all`              | clean, exit 0, 15.6s                                        |

be-01, gw-01 and `libs/domain` are not affected and were not run: nothing
outside `apps/fe-01` and `openspec/` is touched. The full gate — `run-many`,
e2e, secrets, doc caps — was not run here by contract.

**fe-01 went 1,371 (`mermaid-gantt`'s count) → 1,388.** The 17 are this
change's own tests: 6 in `plan-mermaid.test.ts` (`planToMermaidDocument`'s
describe block) and 4 in `plan-export.test.ts` (`planFileName`'s two new
cases, `markdownHeaderLines`/`markdownTableLines`'s two), plus the ambient
count drift since `mermaid-gantt`'s head from the PRs merged between (#64
`mobile-card-facts`, #66 `capacity-c3-p3s`).

Nothing ran on h1claw; `bun install` and the affected/format runs were all on
h2puni.

## The one new guard, watched red

PoC mode keeps injected faults for **new guards**, and this change has one:
the fence widening past a backtick run.

| #   | fault injected                                                                 | observed                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `fenceFor(body)` in `planToMermaidDocument` replaced with a hard-coded ` ``` ` | **1 failed, 34 passed** in `plan-mermaid.test.ts`: `widens the fence past a backtick run in a task name, so the name cannot close it early` — the assertion expected a 4-backtick fence and got the plain 3-backtick one back |

Why the guard is there: a work item's name is free text, `mermaidPhrase`
never touches a backtick because nothing in the gantt grammar reads one, and
wrapping the diagram in an _outer_ Markdown fence is new to this change. A
name carrying ` ``` ` inside a plain triple-backtick fence would close the
code block early, and the table meant to sit inside it would render as
ordinary prose below a truncated diagram instead.

`plan-mermaid.ts` was restored from a copy after the injection (`git diff
--stat` empty afterward) and both `plan-mermaid.test.ts` and
`plan-export.test.ts` re-run green: 79/79.

## What is NOT in this branch: the download button

**M2's Download-as-Markdown-document action is not wired.** The toolbar and
its handlers live in `wbs-table.tsx`, which this change was told not to
touch — another agent owns it tonight, the same constraint `mermaid-gantt`
shipped under. `planToMermaidDocument` and `planFileName(plan, 'md')` are
both written and tested; nothing in the app can reach them yet.

The shape for whoever wires it next: a `Blob`-and-anchor download, the same
pattern `downloadCsv` already uses (`wbs-table.tsx:2696-2705`), reading
`planToMermaidDocument(planForExport())` and toasting the refusal exactly the
way `copyAsMermaid` does when `drawn` is `false` (verify.md of
`mermaid-gantt` carries that handler's shape).

## What else was deliberately left out

- **M3** the section choice and `displayMode: compact`; **M4** the SVG
  download; **M5** the real Mermaid parse test and its devDependency.
- **No `mermaid` dependency of any kind**, dev or runtime. `package.json` is
  untouched.
- **No re-derivation of the table.** `planToMermaidDocument` calls
  `markdownTableLines`, the same function `planToMarkdown` now calls — the
  two cannot disagree about what a row says, because there is only one
  writer of it.

## For Dany

No open question this change is holding — M2 is the small, mechanical half
of R7 the brief argued would be (§6: "1 day"). The one design call worth
naming rather than burying in a comment: **the bundled document does not
carry a table when there is no diagram.** A plan with no start date could
still emit `planToMarkdown`'s table alone, but this change refuses the whole
document instead, matching `copyAsMermaid`'s existing refusal shape rather
than inventing a second, partial-success behaviour the brief did not ask for.
If a table-only fallback is wanted for that case, it is a small follow-up,
not a design change — `markdownTableLines(plan)` already exists.

## CI

Three runs. **31839393261** at `5a6fd6f` (the code and tests alone) was
**cancelled, not green** — the doc-tail push landed while it was still
running and GitHub's own concurrency group superseded it; caught by re-reading
`gh run view` rather than trusting the "in progress" status quoted a minute
earlier, and corrected here rather than left as a false green. **31839492715
at `67a5613`** is the first run to actually finish: green first attempt, both
jobs (`gate` 4m3s, `pixels` 9m28s). `openspec validate --all` (run inside
`gate`, and independently on h2puni: **52 passed, 0 failed**,
`mermaid-document` included) is part of that green.

PR #68 read **MERGEABLE / CLEAN** at `67a5613`. This file's own tail commit
(`20f86c5`, correcting the paragraph above) triggered run **31840282197**;
its conclusion is not folded into this paragraph for the reason `mermaid-gantt`'s
verify.md already gives — a file cannot carry the id of the run that judges
its own tail — and is quoted on the PR instead.

Both jobs green at the head is the condition for merge, and **this branch is
not merged** — PoC mode still holds cross-review before merge
(`delivery-modes.md` open question 2).
