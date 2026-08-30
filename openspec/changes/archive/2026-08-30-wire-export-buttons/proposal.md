<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

`change/mermaid-gantt` (PR #65) and `change/mermaid-document` (PR #68) both
shipped their writer — `planToMermaid` and `planToMermaidDocument` — fully
tested, and both left the toolbar button unwired: `wbs-table.tsx` was another
agent's file the afternoon each merged, and both said so in their own
`verify.md`, patch included. The 2026-08-15 cloud regression
(`notes/wbs-cloud-regression-2026-08-15.md` §5) found it independently and
ranked it P1: **nobody can reach either writer from the app**, so neither the
fence-parses-in-mermaid.live check nor the whole-plan-vs-shown-rows document
check could ever be run against the real button. This change is only the
wiring — no writer behaviour changes.

## What Changes

**Two buttons added to the plan toolbar in `wbs-table.tsx`**, beside the
existing `Copy as Markdown` / `Download CSV` pair, matching their wording,
placement, keyboard reachability (plain `<Button>`s, native tab order, no
`disabled` — neither asks be-01 for anything) and toast-driven refusal
behaviour exactly:

- **`Copy as Mermaid`** — puts `planToMermaid`'s fence on the clipboard.
  Reuses `copyAsMarkdown`'s three clipboard outcomes (no clipboard, write
  refused, done) plus the fourth `planToMermaid` itself already models: no
  diagram to draw at all (no start date, a dependency circle, or nothing
  placed) — reported as a toast, nothing put on the clipboard.
- **`Download as Markdown`** — downloads `planToMermaidDocument`'s bundle (the
  fence plus the table under it) as a `.md` file via the same blob-and-anchor
  pattern `downloadCsv` already uses, named by `planFileName(plan, 'md')`.
  Refuses the same way, toast only, no file.

Both handlers are new `useCallback`s beside `copyAsMarkdown`/`downloadCsv`;
no change to either writer, to `plan-export.ts`, or to any other component.

## Non-goals

No writer behaviour changes (M1/M2 already merged and tested). No M3 (section
choice), M4 (SVG download), or M5 (real Mermaid parse in the unit suite) — the
parse check for this change is done by hand against mermaid.live, per
`notes/delivery-modes.md`'s PoC-mode verification step, and recorded in
`verify.md` rather than added as a devDependency.
