<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

`notes/wbs-plan-2026-08-14-mobile-parity.md` §1.3 names the gap: three fields
the table shows and `PlanCards` does not — Priority, Slack (`float`/`critical`)
and the `o·r·p` trio behind each phase's figure. Priority landed today, as a
side effect of `priority-bands` (#60), one day before this plan was written and
before it says the gap still stood. Slack and the trio did not land anywhere;
this change is the rest of that list — **M1** of the plan's split, the first
row, read-only.

## What Changes

**`plan-cards.tsx` only** — no other renderer, no write path, no new prop from
`wbs-table.tsx`. Every field this change reads is already on `TreeRow`
(`row.schedule.float`/`.critical`, `row.estimates`, `row.finalDays`), so nothing
needed threading through the file this branch was told not to touch.

- **Slack**, a fact-line span beside the span dates: the table's own two words
  — `critical` where the row has none, or `{n}d slack` — and the table's own
  two `title` sentences, both read straight off `row.schedule`.
- **The `o·r·p` trio**, a native `<details>`/`<summary>` under each phase's box
  — "a tappable detail" is the plan's own phrase for it. Content is
  `folded-role-card.tsx`'s own words (`optimistic 2 · realistic 3 · pessimistic
  8`, `No estimate yet`, `Final 4.2 days`), read off `row.estimates`/
  `row.finalDays` rather than the box's draft — the same choice that file's own
  comments explain (a card is what the fold left behind, not what somebody is
  mid-typing).

## Non-goals

Everything else the mobile plan named: row actions (M2), touch pickers for
dependencies/team/not-before/priority (M3), the structure menu (M4), the Gantt
and the four hover cards (M5+). This change touches no file any of those own.

Also out: the plan-level `scheduleError` (`'cycle' | null`) that
`wbs-table.tsx`'s Slack cell falls back to "—" on. That state lives in
`WbsTable`'s own component state, not on a row, and reaching it means a new
prop from the file this branch may not touch. The existing cycle banner
(`wbs-table.tsx:7390`) already shows above both renderers whenever
`scheduleError === 'cycle'`; a card's own Slack line during a cycle reads the
row's stored `float`/`critical` (0/false, be-01's own fallback) rather than
"—". Recorded as the one open question for Dany, not fixed here.
