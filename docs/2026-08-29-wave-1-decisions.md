# Wave 1 decisions and assumptions — 2026-08-29

Dany asked for twelve changes to be planned and then worked in parallel, and
said "decide yourself and document assumptions". This file is that record: what
was decided without him, on what evidence, and what each decision assumes. Every
one of them is cheap to reverse and the reversal is named.

Six changes were implemented by parallel agents in isolated worktrees, on
branches `change/project-picker-flow`, `fix/gantt-height-column-clamp`,
`feat/plan-toolbar-controls`, `fix/reference-set-one-line`,
`feat/priority-default-medium`, `feat/markdown-work-item-names`.

## D1 — the queue lives on `main`, and the agent's `4b` wins over mine

**Decided.** The twelve new `openspec/changes/*` directories are committed. My
uncommitted edit to `unified-reference-cell-ux/tasks.md` (section 4b) is
**reverted**; the version on `fix/reference-set-one-line` is the one that stands.

**Why.** Every worktree is cut from `HEAD`, so an untracked change directory does
not exist inside it. Three of six agents hit this and copied their own in; a
fourth found `tasks.md` had no section 4b at all and wrote one from the bug
report. Two rival 4b sections would have conflicted on merge.

The agent's version wins because it is committed, has tests against it, and
covers a **fourth** cause mine missed: `restingValue={own.length === 1 ? …}`
printed a one-member set into the search box beside its own chip, so a row with
one tag read `Platform ✕  Platform`.

**Assumes** nobody is holding an edit to those files elsewhere. **Reverse by**
`git revert` of the queue commit.

## D2 — the gate's clock and region are pinned

**Decided.** `TZ=UTC` on fe-01's `test` target; `locale: 'en-US'` and
`timezoneId: 'UTC'` in `playwright.config.ts`.

**Why.** The gate meant something different on a developer's Mac than in CI, and
CI's green is the one people trust. Two failures each, reproduced six times:

- `plan-mermaid.test.ts` ×2 — Mermaid's lexer builds a `Date` from a bare
  `YYYY-MM-DD` at **local** midnight and the test asserts `.toISOString()`. At
  UTC+3 the same correct source parses to `2026-09-03T21:00:00Z` where the test
  says `2026-09-04T00:00:00Z`.
- `keyboard.spec.ts` ×2 — the tests type `05202026` into a native
  `<input type="date">`, which is 20 May 2026 only where the segment order is
  month-day-year. This host is `en_UA`, Chrome draws `dd.mm.yyyy`, and the same
  keystrokes saved `2026-02-05`.

**This masks no product defect.** The app emits a date _string_, which carries no
offset; nothing a reader sees changes with the host clock. What is pinned is the
oracle.

**It is a workaround, not a fix.** Those two mermaid assertions compare a UTC
serialisation of a local-midnight `Date` and should compare the local calendar
day; the two keyboard ones encode a region into a check about layout. Both are
worth their own change. Until then an unpinned run means something else in Kyiv.

**Watched.** `test.env = { TZ: 'UTC' }` in `vitest.config.ts` was tried first and
changes nothing — the timezone is read once before a test file loads, so the
option writes `process.env` too late (still `2 failed | 47 passed`). It is on the
target's command instead, where it is set before the process exists. With it,
`bunx nx run fe-01:test` passes whole.

## D3 — a priority on a parent no longer reaches its leaves, and that is accepted for now

**Decided.** Accepted, recorded, not worked around.

**Why it happens.** `priorityByLeaf` resolves by the _most specific_ statement.
Now that `createWorkItem` stamps every new leaf with the project's rank-2
default, the leaf always has a priority of its own, so an ancestor's is never
consulted. Three existing cases caught it, including two undo/redo ones.

**Why accepted.** Fixing it properly needs the model to tell a _defaulted_
priority from a _chosen_ one, and today both are just a number. That is a real
modelling change — a `priority_source`, or a nullable default resolved at read —
and it is bigger than the change that surfaced it.

**Assumes** Dany wants "every item is ordinary by default" more than he wants
"set it on the phase and let it flow down". **He has not been asked**, and the
two cannot both hold as currently modelled. If the propagation mattered, this
needs a design decision and its own change before `feat/priority-default-medium`
merges.

## D4 — the Gantt panel's top edge still will not track the pointer

**Decided.** Ship the containment fix; leave the edge behaviour alone.

**Why.** The reported bug had two symptoms. The serious one — the chart
overflowing its column, 245px drawn off-screen with no scrollbar and no way to
reach it — is fixed by clamping to the column instead of the viewport.

The other, the top edge not following the pointer, was **refused** by the agent
with a flexbox argument I accept: `flex-shrink` is consulted only for _negative_
free space, and the symptom is ~226px of _positive_ leftover below the panel.
Moving that leftover puts a gap back between the last row and the chart, which is
exactly what `unified-scroll-docking` removed.

**Assumes** Dany would rather keep the docking than have the edge track. It is
`test.fixme` at `gantt.spec.ts`, not deleted, so it reports pending on every run.
**Reverse by** reopening `unified-scroll-docking`'s decision.

## D5 — the ramp's two cool ranks differ in lightness, and the spec was wrong

**Decided.** Keep the values, loosen the prose.

`priority-default-medium`'s delta spec says ranks 3 and 4 "SHALL share a hue and
a lightness", but the values in the same document differ by `0.01`
(`oklch(0.59 0.06 240)` / `oklch(0.58 0.12 240)`). The agent used the values and
asserted **one lightness band** (`|ΔL| ≤ 0.02`) rather than silently re-picking
colours to make the sentence true. That is the right way round: the values were
the instruction, the sentence was my summary of them.

## What is NOT decided, and is blocking

**`fix/reference-set-one-line` does not work.** Its own headline assertion fails
in Chromium — a row with three tags measures 43.6px against a bare row's 27.2px,
still ~1.6× taller, which is the bug the change exists to fix. Nine jsdom
negatives passed through it because **jsdom computes no layout for `flex-wrap`**:
they saw the style property change and could never see the row's height. It also
regressed `round-trips every desktop reference set…`, where a removed chip is
still present. The agent has been sent back with the browser output and the
ports.

**No other branch has been through a browser.** Baseline on `main` at `b3acb7b`
is 203 passed / 3 failed, and those three are the two locale cases above plus
`deps-cell.spec.ts:430`, which times out waiting for 42 CSS animations to settle
and is a real red on `main` that nobody has explained yet.

## The lesson worth keeping

Five of six agents reported their jsdom suites green and their negatives watched.
The one branch put through a browser failed on the very claim it was written for.
**A layout change's oracle is a browser**; `AGENTS.md` R5 already says so, three
separate times, and the wave still produced a fix that could not see its own
fault. Any remaining slice whose subject is height, width, overflow, paint or
hit-testing is unverified until it has run in Chromium — that is most of what is
left.
