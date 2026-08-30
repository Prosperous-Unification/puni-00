<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dany, 2026-08-29, with a screenshot: work item `010.1` showed `↳ Risk, Review`
inherited from `010`, and "when i added new tag to 010.1 it stopped showing the
ones it inherited (??) fix it".

The cell was right about the model. `effective-tag.ts` implements **override**:
a row's effective tags are its own, or — only when its own is empty — the nearest
ancestor's whole set. That rule was confirmed by Dany for **teams** on
2026-08-13 (Q4) and reused unchanged for tags.

It was the wrong rule for tags. A team answers _who does the work_ and the
scheduler spends its capacity, so one owner is a decision and a row naming its
own team means that team instead. A tag answers _what kind of thing this is_, and
a child of a `Risk` parent is still risky: stating `Ready` adds a word, it does
not replace the sentence.

## What Changes

**Tags accumulate.** A row's effective tags are its own **plus every
ancestor's**, unioned, each carrying the row that states it. A tag two rows both
state belongs to the nearer one and appears once.

**Teams and services are untouched.** They keep override and keep the shared walk
in `effective-label.ts`; the accumulating walk lives in `effective-tag.ts` so a
hand aimed at one cannot move the other.

**And types inherit neither way** (ADR 0009, decided a day later). The plan holds
three answers to one question — override, accumulate, neither — one per
dimension, deliberately: a team is one answer at a time, a tag stays true as you
descend, and a type does not, because a hierarchy exists so a row and its children
are different things.

**Every reader reads the union.** The domain walk, the Tags cell, the phone card,
the chart's hover text, the filter facet and the CSV export. A rule unioned in one
reader and overridden in another is worse than either.

**Provenance is per tag, not per row.** An overriding answer has one stating row;
an accumulating one has as many as it has members. `EffectiveTags` becomes a list
of `{ tagId, fromId }` and `TagLabel` stops being a discriminated union.

**The Tags cell distinguishes the two.** An inherited tag is a muted, outlined,
`↳`-prefixed chip with **no ✕** — it comes off where it was written. The cell
stays one line at rest and the row's height does not change.

## Non-Goals

- Any change to teams, services, types, the scheduler, dates, or the write path.
- A per-tag "unset" that takes an ancestor's tag off a descendant.
- Removing an inherited tag from the row that inherits it.
- Any change to `MOST_TAGS_ON_ONE_ITEM`. It bounds the **stated** set on a write,
  so no legal plan becomes unwritable; a deep row's effective set is unbounded by
  depth, which is a reading problem the cell, the facet and the export carry.
- Any change to the identity corpora, which assert **stated** tags on sixteen
  replayed plans and must go on doing so (ADR 0008).

## Capabilities

### Modified Capabilities

- `wbs-domain`: how a work item's tags are inherited and shown.

## Domain Terms

Tag; Tag set; Effective tag set; Stating row. ADR 0008, read with ADR 0009.

## Impact

`libs/domain` `effective-tag.ts` (and the JSDoc of its two siblings and the
shared walk); fe-01's `gantt-geometry.ts` (`TagLabel`), `wbs-table.tsx`,
`reference-set-field.tsx`, `plan-cards.tsx`, `gantt-panel.tsx`,
`plan-export.ts`, `tree-search.ts`; doc comments in be-01's `schema.ts` and
`repository/index.ts`. Their tests, plus `e2e/reference-cells.spec.ts`. No wire,
schema, migration or command change.
