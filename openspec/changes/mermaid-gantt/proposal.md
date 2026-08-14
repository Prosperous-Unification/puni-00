<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

Dany asked to "export the diagram as a markdown-compatible format; mermaid or
smth else that will work in markdown". A Markdown export already ships —
`planToMarkdown` writes the whole plan as a header block and one flat table, and
the toolbar has carried **Copy as Markdown** since it landed. What does not
exist is the **diagram**. R7 is therefore "the chart, in a fence".

The one blocker was a type, not plumbing. `ExportSlice` declared four fields —
`workItemId`, `width`, `effort`, `duration` — and a chart cannot be drawn from
that. But `planForExport` assigns `chartRead.slices` verbatim, which is
`SliceView`: the role, the person, the offsets, the critical flag, the float and
the floor were all in the object already. Only the type narrowed them.

## What Changes

**`plan-mermaid.ts`, a third pure writer beside `planToMarkdown` and
`planToCsv`.** `planToMermaid(plan)` returns a `gantt` fence or a refusal:

- one task per **slice**, since a slice is what the chart draws a bar for;
- `section` per outermost ancestor — Mermaid has one flat grouping channel, so
  it is spent on the plan's own outline, and the number carries the rest;
- absolute dates, never `after`: be-01 has solved this schedule and Mermaid
  knows nothing about capacity floors, person floors or role order;
- `inclusiveEndDates`, or every bar is a day short, and `excludes weekends`,
  which paints the bands and — because every end is a literal `YYYY-MM-DD` —
  moves nothing;
- escaping for the three characters the gantt lexer reads as syntax;
- **a refusal in words when the plan has no start date.** Mermaid cannot say
  "day 3", and an invented epoch puts wrong dates in a document that outlives
  the screen.

**`ExportSlice` is widened to `SliceView`.** Type-only: no new request, no new
plumbing, and the alias rather than a superset so the two cannot drift.

## Non-goals

**M2's bundled `.md`** (fence + the existing table under it), **M3's** section
choice, **M4's** SVG download, **M5's** real Mermaid parse in the suite — so
every grammar claim here is reasoned against Mermaid's source as quoted in the
brief and **not watched**.

**No team name is printed.** R2 is rewriting `ServiceTeamLabel` into `teams[]`
and `services[]`; printing one would make this change wait for that. That single
decision is what makes M1 independent of R2.

**The toolbar button is not wired here** — `wbs-table.tsx` is another agent's
file this afternoon. `verify.md` carries the patch.
