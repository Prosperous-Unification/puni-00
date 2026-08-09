<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

The directory is deployment-wide and has nowhere to be seen. People and
service teams are created from pickers inside a project and read nowhere
else: a typo is found in a dropdown and fixed nowhere. `directory-crud` just
gave be-01 rename, membership editing and informed removal, and nothing calls
any of it — fe-01 is one page with no way to reach a second. Reviewed
plan: `docs/plans/2026-08-09-directory-table-header-gantt.md`, section D2.

## What Changes

**The signed-in region is routed**

- From: one page, one URL; `app.tsx` renders the project.
- To: code-based routes under the auth gate — `/` the project, `/directory`
  the new page. A signed-out deep link lands on the sign-in form and
  continues to the page it asked for.
- Impact: non-breaking; `/` behaves as today.

**A page that manages the directory**

- From: create-only, from inside a project.
- To: People and Teams panels. Rename in place; a person's memberships are
  removable chips beside a picker offering only the teams they are not in;
  removal opens a confirm rendering the **directory usage** — affected
  projects, work items and members by name — before the cascade is offered.
  Refusals read as sentences. Empty panels say they are empty.
- Impact: non-breaking.

**The header carries the link**

- From: the header's controls are all project controls.
- To: one more control, and the one-row fit matrix re-run with it.
- Impact: non-breaking.

## Non-Goals

- No socket on this page: it re-reads on arrival, on focus, and on its writes.
  `directory_changed` reaches open projects, which is `directory-crud`'s job.
- No new be-01 route or field.
- No admin concept, no accounts: a person is not an account.
- No `CreatablePicker` change — it is single-select by contract and stays so.
- Nothing about the project page beyond the route it sits on.

## Constraints

- The image's Caddyfile already carries `try_files {path} /index.html`. No
  config work, but the deep link is proven against the **built artifact** —
  the browser suite runs through Vite, which serves the fallback for free and
  proves nothing about the image.
- The header holds one row at every width `e2e/header.spec.ts` measures.
- Panels stack below 768px; tap targets are asserted at 44px on the rendered
  control, not assumed of it.

## Capabilities

- `wbs-domain`

## Decisions Recorded

- [ADR 0004](../../../docs/adr/0004-the-signed-in-region-gets-a-router.md) —
  the router, and why the auth gate stays above it.
