<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

R7 M1 (`change/mermaid-gantt`, PR #65, merged) puts the chart's diagram into a
Mermaid `gantt` fence, but the fence alone drops nine of the chart's eighteen
marks — every dependency arrow, every capacity and hand-off wait, slack,
priority, the three-point figures. M1's own `%%` comments say so, but a
comment is invisible once the fence renders. `notes/wbs-brief-2026-08-14-r7-markdown-export.md`
§4 argues the fix is not a better diagram — Mermaid's grammar has no vocabulary
for any of those nine — it is bundling the fence with the table that already
carries them: `planToMarkdown` has shipped since before R7 and is lossless for
everything the fence cannot draw.

## What Changes

**`planToMermaidDocument` (`plan-mermaid.ts`), a third writer beside
`planToMermaid` and `planToMarkdown`.** One Markdown document: a header block,
the Mermaid fence, then the same table `planToMarkdown` writes. Refuses with
the same sentence `planToMermaid` refuses with, and for the same reason — a
document is the fence plus the table beneath it, and there is nothing to
bundle around a refusal sentence.

**One new header field, `Scope`,** stating the document holds the whole plan —
answers Q6 of the brief: the chart on screen draws `shownRows`, this document
(like every export) draws every row, and the divergence has to be a sentence
or the first bug report is "the export added rows".

**The fence widens past any run of backticks in the diagram.** A work item's
name is free text and nothing escapes a backtick for Mermaid's own grammar
(there is nothing to escape — Mermaid does not read one), but wrapping the
diagram in an _outer_ Markdown fence is new to this change, and a name
carrying ` ``` ` would close that fence early and spill the rest of the
document out as prose. Widened to one more backtick than the longest run
present, the way a fenced block nested in another normally stays unambiguous.

**`plan-export.ts` refactored, not rewritten:** `planToMarkdown` splits into
`markdownHeaderLines` (takes optional extra fields) and `markdownTableLines`,
so the bundle reuses both rather than re-deriving the table. `planFileName`
gains an optional `extension` argument, defaulting to `csv`, for the `.md`
download.

## Non-goals

**The toolbar button is not wired here** — `wbs-table.tsx` is another agent's
file tonight, same constraint M1 shipped under. **M3** (section choice), **M4**
(SVG download), **M5** (Mermaid devDependency, real parse test) are untouched.
