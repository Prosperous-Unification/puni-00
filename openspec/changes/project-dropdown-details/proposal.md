<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

The picker offers names alone. Two projects called `Rewire the shed` — mine
and somebody else's — are one entry twice, and the wrong pick shows
only once the table loads. `GET /api/projects` already carries `ownerId`
and `createdAt`; fe-01's type drops both and nothing turns that id into a
username. Plan: `docs/plans/2026-08-09-directory-table-header-gantt.md`, H1.

## What Changes

**The list names its owner**

- From: `ownerId`, which nothing resolves.
- To: it carries `ownerName`, joined from `users.username` in the same query.
  An absent owner account fails the read loudly rather than dropping the
  project.

**Three routes, three shapes**

- From: one fe-01 `ProjectSummary` types list and create alike; create never
  carried the `lastOpenedAt` it declares.
- To: `ProjectListEntry` (`id, name, restricted, lastOpenedAt, ownerName,
createdAt`) for the list route only; `CreatedProject` for create. Each names
  what fe-01 reads of a wire that carries more; each route is tested for
  containing at least those fields, never an exact key set.
- Impact: fe-01 types and factories; the wire gains only `ownerName`.

**Entries say who and when**

- From: an entry is a name.
- To: the name plus a muted `(kat · 1 Jun)`, via `shortInstant`. The meta
  joins the option's accessible name, so equal names differ by ear too.

**The listbox is bounded**

- From: `min-w-full` and `whitespace-nowrap` — a long entry pushes the list
  past the window; an inner ellipsis constrains nothing.
- To: capped to the viewport, entry truncated, full text in `title`; the page
  never scrolls sideways for an open picker.

## Non-Goals

- Filtering stays name-only: the meta is shown, never searched.
- No owner join on `GET /api/projects/:id`: the header reads its project from
  the list it holds, so the symmetry is dropped, not half-built.
- No owner or date on the outline cards; no "mine only" filter.

## Constraints

- **Depends on T2's `shortInstant(epochMs, now)`** — `createdAt` is an epoch
  instant, not the zone-free day the table's cells print. H1 lands after T2 and
  defines no formatter of its own.
- `USERNAME` is `/^[a-zA-Z0-9_-]{3,32}$/`, so the worst case is 32 wide
  ASCII glyphs, not a CJK name.
- jsdom measures nothing: the bound is proven in Chromium.

## Capabilities

- `wbs-domain`

## Domain Terms

- project entry
- entry meta
- project owner

## Decisions Recorded

none.

## Impact

be-01 `repository/project.ts` (`listFor`) and `index.ts`; fe-01
`lib/wbs-api.ts`, `project-page.tsx`, their tests, `e2e/header.spec.ts`. No
migration or dependency.
