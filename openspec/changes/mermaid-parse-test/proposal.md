<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

R7 M5 of `notes/wbs-brief-2026-08-14-r7-markdown-export.md`: every test M1/M2/M3
added for `plan-mermaid.ts` asserts a **string** — that the writer emitted the
bytes it meant to. None of them prove Mermaid _reads_ those bytes the way the
writer's own docstrings argue. The `excludes weekends` / `manualEndTime`
interaction in particular rests on one hardcoded literal inside Mermaid's own
source (`ganttDb.js:490`'s `'YYYY-MM-DD'`, quoted in the brief's §3.2) — an
upstream tidy-up there would move our dates with no string assertion able to
notice. §3.2 says exactly this: "it wants a test with a real Mermaid parse in
it, not an argument."

## What Changes

**`mermaid` added as a devDependency**, `^11.16.1` — the version the brief's
§3 quotes and the one `mermaid.live` itself reports. Runtime code is
untouched; nothing under `apps/fe-01/src` imports it. `apps/fe-01/src/components/wbs/plan-mermaid.test.ts`
gains a new describe block, `a real Mermaid parse (M5)`, that runs the actual
`gantt.jison` grammar and `ganttDb.js` date arithmetic via
`mermaid.mermaidAPI.getDiagramFromText` — Mermaid's own `@internal` path to a
parsed diagram's task data, the only way to reach dates and ids instead of
pixels without a live SVG container.

Pinned against the real parser:

- **§3.2** — a bar crossing a weekend keeps the exact dates the writer gave it
  (`manualEndTime: true`), not dates `excludes weekends` pushed further out.
- **§3.3** — `db.endDatesAreInclusive()` really reads `true` off the emitted
  `inclusiveEndDates` line.
- **§3.4** — a colon in a name survives escaped (`id` stays the generated
  `s1`), and a matching **unescaped** hand-built line is parsed alongside it to
  show the real lexer does silently move the split — the failure mode the
  escaping exists to prevent, not merely argued from reading `gantt.jison`.
- **All three section modes M3 (#71) added** — `outline`/`phase`/`assignee`
  each produce a real, error-free `gantt` diagram with the sections and task
  count `sectionOf`'s docstring claims.

## Non-goals

**No production code changes.** If the real parser had disagreed with any
existing claim, that would be a separate change, per this task's own
instruction — report, don't fix here. It did not: every existing string
assertion and every new real-parse assertion is green against unmodified
`plan-mermaid.ts`.

**No rendering, no SVG, no app-visible surface.** `mermaid.mermaidAPI` is used
for its parsed diagram data only; `render()` (which needs a live DOM container)
is never called. The app ships no renderer, unchanged from M1–M3's own
decision.
