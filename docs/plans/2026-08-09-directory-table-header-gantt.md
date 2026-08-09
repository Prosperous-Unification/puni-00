# Directory, table density, header, Gantt calendar — plan v2 (2026-08-09)

v1 was cross-reviewed the same evening: codex 17 findings (3 critical), agy 13
(3 critical), heavily convergent. Every real finding is folded in; disposition
table at the bottom. The reviews reshaped the plan: **the table lane gained a
hard order (T2 before T1) around one shared width-resolution object**, D1's
in-transaction event write was proven unbuildable on the current machinery and
replaced with the `role-crud` post-commit pattern, G1 grew from "convert the
bars" to "route every x-bearing mark through one calendar scale", and the
budget went from 7.5 to **~13.5 agent-days**.

Dany's asks: **(1)** a page to manage people; **(2)** a page to manage
service/teams — one page for both, router OK; **(3)** table: draggable column
widths + reset, smaller not-before when unset everywhere, short dates
("1 Jun", year only when ≠ current, full date on hover), narrower Number
column; **(4)** project dropdown entries show "(author · created)"; **(5)**
Gantt: weekends as greyed columns — Dany chose the **calendar axis** over seam
markers — and a bar hover with all the relevant work-item info.

Base: `main` @ `4f2b583`. `name-title-body` is mid-flight (jsdom tasks done,
browser proofs remain); G2 builds on the file it renames and waits for it.

Execution model as the last two batches: one OpenSpec change per row, Opus
subagents, Dany merges between; h2puni/e2e proofs per change; codex+agy
re-review after D2 and after G2.

---

## The seven changes, four lanes

**Directory lane:** D1 `directory-crud` → D2 `directory-page`.
**Table lane:** T2 `compact-columns` → T1 `column-widths-drag` — **ordered**:
both redesign the width-resolution seam; T2 builds the resolved-layout object,
T1 layers overrides on it (codex 8/9, agy 1/9).
**Header:** H1 `project-dropdown-details` — after T2 (shares the formatter).
**Gantt lane:** G1 `gantt-calendar-axis` → G2 `gantt-bar-hover` (G2 also
after `name-title-body` merges).

Suggested PR order: **D1, T2, G1, H1, T1, D2, G2**.

---

## D1 `directory-crud` — be-01 only (~2.5d)

`teams-and-assignees` built the global directory (`service_team`, `person`,
`person_team`, `assignment`) with create+list only. Rename, delete, and
membership edit do not exist. `role-crud` is the pattern of record for
informed destructive writes — **followed exactly, including its transactional
split and its post-commit event timing**.

1. Routes: `PATCH /api/people/:id` (`name?`, `teamIds?`),
   `DELETE /api/people/:id`, `PATCH /api/teams/:id` (`name`),
   `DELETE /api/teams/:id`. The PATCH contract is fully specified, not
   guessed (codex 5): at least one field present else 422; name+memberships
   change atomically in one transaction; `teamIds` full-replace, deduplicated;
   a `teamIds` entry naming a missing/deleted team → typed 4xx
   `unknown_team`; name collision → **409 `taken`** with the surviving name —
   the codebase's existing vocabulary, not a new `duplicate` code (agy 12).
2. Deletes follow `role-crud`'s exact split (codex 4): the **authoritative
   count and the delete happen in one transaction** — an unconfirmed delete
   refuses with the current usage set, a `cascade=true` call removes it.
   The refusal payload carries the affected **projects and work items by
   name and number**, not bare counts — Dany's call 2026-08-09: the confirm
   must show a person what it is about to touch. Counts:
   - person: assignments dropped, and the items whose assumed-assignee
     derivation flips (a lone assignment makes its person "does every
     phase"; deleting them un-derives it).
   - team: memberships dropped, and work items labeled with the team —
     `work_item.service_team_id` has **no FK** (deliberate), so the delete
     transaction nulls those labels itself. Cross-project: the count names
     projects, not just rows.
3. **The post-delete guard is typed stale-reference rejection, not revision
   preconditions** (codex 1, 4 — v1's "refused by revision" was unsound:
   directory writes carry no revision). Every write path that can receive a
   deleted id — assign person, set team label, create-and-assign, **and the
   undo/redo paths that can resurrect either** — validates inside its own
   transaction and returns typed 4xx `unknown_person` / `unknown_team`,
   never a raw FK 500 and never a silently dangling label. Production-path
   negative tests: delete lands between a client's read and each of those
   writes, including a compensating undo that would restore a deleted
   person's assignment.
4. **Events, post-commit** (codex 2, agy 4 — v1's "record through the
   sequencer inside the transaction" cannot be built: `recordEvent` opens
   its own transaction, and broadcasting before commit lets subscribers read
   uncommitted state; `RoleService` already answers this). The delete/rename
   transaction collects affected project ids; after commit, one event is
   recorded and published per affected project. **Renames emit too**
   (codex 3 — person names ride refreshed tree rows and team names sit in
   open pickers; without an event an open project is stale forever). New
   typed `ProjectEvent` variant `directory_changed` (agy 10). The
   commit-then-crash-before-event window is the same one `role-crud`
   accepted; stated in the spec, not silent.
5. Not journaled (like the start date); the typed stale-reference guards in
   §3 are what keep undo honest — stated in the spec.
6. Permission: any authenticated account, same as create today. No admin
   concept exists; inventing one is its own change. Cost recorded, as
   `teams-and-assignees` recorded the everyone-sees-everything cost.

Proofs: the §3 negatives (fault = delete injected between read and write,
watched 4xx not 500, label watched nulled not dangling); two-client rename
test — an assigned person renamed in client A updates client B's open
project via the event (codex 3); refusal counts for a team labeled in a
_second_ project name that project.

## D2 `directory-page` — router + one page (~2d)

1. **TanStack Router** (code-based routes, no file-router codegen): `/` →
   ProjectPage, `/directory` → the new page. **ADR: first navigation
   primitive** — routing owns the signed-in region only; the auth gate stays
   in `app.tsx` above the router; deep-linking `/directory` signed out lands
   on the auth form and returns after. The image's Caddyfile **already
   carries `try_files {path} /index.html`** (agy 11, codex 7 — v1's premise
   was wrong); no config work, but the packaged deep-link behavior gets a
   **required** proof against the built artifact (refresh `/directory` on
   the Caddy-served build), with the fallback deliberately removed once to
   watch it fail — current e2e runs through Vite and proves nothing about
   the image.
2. The page: two panels (People, Teams), shadcn chrome components. People:
   rename inline, team memberships, delete with D1's refusal payload
   rendered in the confirm — the affected projects and work items listed by
   name, scrollable when long, before the second (cascade) call is offered.
   Teams: rename, member count, delete likewise. Creation stays (same POST
   routes). Empty states rendered.
3. **Memberships UI is not `CreatablePicker`** (codex 6 — it is
   single-select by contract: `value: string | null`, one `onChoose`).
   Memberships render as removable chips + a filtered add-picker (the
   picker adds one membership per choose; chips remove one each). Duplicate
   add prevented in the control; optimistic vs on-response behavior stated
   (on-response, matching the table's `run()` pattern); keyboard: chips
   reachable, Delete removes, picker keeps its ARIA contract. Tap targets
   ≥44px asserted on the card, not assumed of the raw control.
4. Header gains the `/directory` link. The one-row contract is asserted by
   `e2e/header.spec.ts`; H told us ~460px of slack at 900 and "one more
   control fits" — this spends it, and the fit matrix re-runs.
5. Live consistency: the page refetches on its own writes; `directory_changed`
   events reach open _projects_ (D1.4). The directory page holds no socket —
   refetch on navigation/focus; recorded as a non-goal.
6. Mobile: panels stack under 768px.

Proofs: built-artifact deep-link (with the injected-fault run); e2e
delete-with-cascade round-trip through the real confirm; header one-row
matrix green with the new control; jsdom — 409 `taken` renders its sentence;
membership add/remove sends exactly what the chips show.

## T2 `compact-columns` (3.3 + 3.4 + 3.5, ~1.5d) — before T1

Dates render raw `YYYY-MM-DD` (or workday numbers when no project start
date). `not-before` is 146px because a native date input is 138px and the
column holds one at rest. Number is 100px.

1. **The resolved frame-layout object** (codex 8, agy 1/9 — the foundation
   T1 builds on). Width resolution today is scattered across **five**
   consumers — `<colgroup>`, `tableMinWidth`, `foldedTableMinWidth` (shown
   in PhasesDialog), the pinned prefix sums (a **static module-load
   `PINNED_GEOMETRY` map**), and `layout.spec.ts`'s imported constants. T2
   introduces one per-render `frameLayout(leafIds, state)` product that all
   of them read; the static pinned map becomes derived. This is the change
   that makes not-before's two-state width _state_ instead of a constant —
   and the seam T1's overrides later slot into.
2. **Two typed formatters, not one `shortDate`** (codex 11 — one function
   cannot serve a zone-free `IsoDate` and an epoch instant):
   `shortIsoDate(iso, today)` parses calendar components directly, no
   `Date`-parsing timezone shift; `shortInstant(epochMs, now)` formats in
   the browser's local zone (the product has no display-timezone concept;
   stated). Both: `1 Jun` same-year, `1 Jun 2027` otherwise; tests on both
   sides of a year boundary and UTC midnight. Start/End cells render
   `shortIsoDate`, full ISO in `title`; workday-number fallback unchanged;
   `finish`'s `' ?'` marker survives.
3. **`not-before` at rest becomes text** (shortIsoDate, em-dash when null);
   `DateField` mounts only for the cell being edited. **`DateField` grows an
   explicit edit-lifecycle contract first** (codex 10 — today it commits on
   blur and has no cancellation): `onExit('commit' | 'cancel')`; Enter =
   commit+close, blur/outside-click = commit+close, **Escape =
   close-without-commit with the next blur's commit suppressed**; focus
   returns to the cell on close; a peer refetch while editing follows the
   grid's existing refused-draft rules; the no-start-date state stays a
   rendered disabled state, not an editor that won't open. Each transition
   tested on the production cell; the native-input paths (Tab, picker) in
   Chromium — jsdom cannot see them, the `DateField` history says so.
4. Widths: `not-before` 146 → **84** with values, → **56** when no row in
   the project sets it (the whole-table predicate); header abbreviates,
   full sentence in `title`. Number 100 → **the number a browser oracle
   picks** (codex 12 — 72 is a guess until measured): the layout test
   seeds a maximum-depth frozen branch (48px indent + expander + lock +
   longest number) and the width is chosen from that measurement, then
   pinned in `frameLayout`.
5. **`layout.spec.ts` is rewritten where it assumes the old shape** (agy 2 —
   its `measure()` throws if the first row has no `input[type="date"]`, and
   it asserts the 146/intrinsic relation): measurement targets the cell,
   enters edit mode to measure the input, and asserts the two at-rest
   states. The fit matrix re-runs.
6. Mobile cards render the same short dates (plan-cards parity rule).

## T1 `column-widths-drag` (3.1 + 3.2, ~1.5d) — after T2

1. Overrides on T2's seam: `columnWidthOverrides: Map<id, px>` resolved
   inside `frameLayout` — colgroup, both min-widths, and pinned offsets all
   move together by construction (agy 1/9 die here). The `columns` memo
   gains no deps; widths never enter column defs (landmine #1).
2. **`name` is not draggable** (codex 8 forced the decision): it stays the
   flexible remainder-absorber with its 200px floor. Drag handles go on the
   fixed columns' header edges; pointer events, hand-rolled (TanStack's
   resizing writes into column defs — the one place widths must not live).
   Clamp: per-column floor = min(default, 36px).
3. Persistence: `wbs.columnWidths.<projectId>` (the `expansionKey`
   pattern). **Stored widths are a claim**: unknown ids and non-finite/
   out-of-range values dropped on load. **Precedence and reset are defined
   against T2's _dynamic_ defaults** (codex 9): a stored override beats the
   resolved default (including not-before's two-state width — an override
   freezes it); **reset clears the key**, returning the column to whatever
   the current resolved default is, not to a snapshot written at reset
   time.
4. Reset lives in the desktop table header region, **not** in
   `toolbarControls` — that array feeds the mobile Plan-actions sheet,
   where columns don't exist (codex, first pass); a mobile assertion says
   no width control is offered there.
5. e2e is the oracle for the drag (jsdom pointer events perform no default
   action): drag a real edge, measure the `<col>` **and a pinned cell's
   `left`** (the agy-1 regression), reload → persisted, reset → current
   default. jsdom negatives: garbage in the key → defaults; the sanitizer
   deleted → watched failing (write the negative before believing the
   line).

## H1 `project-dropdown-details` (item 4, ~1d) — after T2

`GET /api/projects` already returns `ownerId` and `createdAt` — the FE type
drops them, and nothing resolves `ownerId → username`.

1. **Type split, not a widened `ProjectSummary`** (codex 12/14, agy 13 —
   widening breaks `createProject`, which parses the create response as the
   same type, and the create row has no `ownerName`/`lastOpenedAt`):
   `ProjectListEntry` (`id, name, restricted, lastOpenedAt, ownerName,
createdAt`) for the list; the create/read responses keep their own
   honest shapes. be-01: `listFor` joins `users.username` as `ownerName`
   (one query); the read route gains the same join via an owner-joined
   `findById` only if the header ends up needing it — otherwise the
   symmetry claim is dropped, not half-done. Response-shape tests on all
   three routes; FE test factories (`fakeProjects`) updated in the same
   change or typecheck breaks (agy 13).
2. Dropdown `<li>` renders the name plus muted `(ownerName · 1 Jun)` via
   T2's `shortInstant`.
3. **The listbox gets bounded, not just the entry truncated** (codex 15 —
   it is `min-w-full` + `whitespace-nowrap`, so an inner ellipsis alone
   constrains nothing): listbox capped to the viewport, inner span
   `min-w-0` + truncate, full text in `title`. Proof at the worst case the
   backend permits: a **32-character** wide-glyph username with a long
   project name, at every header-fit width. Filtering stays name-only;
   recorded non-goal.

## G1 `gantt-calendar-axis` (5.1, ~3d)

The SVG user-space unit is one workday; weekends have zero width by
construction. Dany chose real grey weekend columns, so the unit becomes one
calendar day — and **every** horizontal coordinate moves through one new
scale, or the chart splits.

1. **The calendar scale** (codex 13, agy 5): start-date-bound, fractional-
   preserving —
   `calendarOffset(w) = calendarDaysBetween(start, addWorkdays(start, ⌊w⌋)) + (w − ⌊w⌋)`
   — with weekend-origin semantics stated (`addWorkdays(start, 0)` already
   normalizes a Saturday start to Monday; the scale inherits that, tested).
   The existing fractional contract (3.5 stays 3.5 workdays into the
   schedule) survives: fractions ride within the workday they belong to.
   Cases: 3.5, a Friday fraction, Monday boundaries, Saturday project
   start, negative pad offsets.
2. **One resolved calendar-geometry object feeds every mark** (codex 15,
   agy 3): bars, summary brackets, dependency elbow routes and heads,
   person links, not-before carets, zero-width ticks, the HTML bar-label
   overlay, horizon/viewBox/padding, **and the axis header itself** —
   `workdayAxis` is replaced by a `calendarAxis` whose cell count matches
   the viewBox 1:1, weekend cells greyed, gridlines on Mondays. Any mark
   left on raw workday coordinates misaligns after the first weekend.
3. **Bar width is the drawn interval, not engine finish** (codex 14, agy —
   an unestimated bar has `finish === start` and `drawnSpan = 2`; v1's
   `calendarSpan(start, finish)` collapses it to zero). **Amended during
   drafting (2026-08-09):** the naive
   `calendarOffset(start + drawnSpan) − calendarOffset(start)` over-draws
   every Friday-ending bar across the weekend it never worked, so the scale
   reads two ways — a span's **start** takes `calendarOffset(w)`, a span's
   **end** takes its left limit (`calendarOffset(w − 1) + 1` for whole
   `w`), the `lastWorkdayOf` nudge the row's End cell already makes. Engine
   `finish` stays in `data-finish` as metadata. The
   zero-area-makes-assertions-vacuous lesson (the sixteenth check) applies:
   every new geometry test asserts non-zero area before asserting
   relations.
4. Weekend rects render under the row bands; `data-start`/`data-finish`
   keep engine workday numbers (the test hook stays engine-true); calendar
   positions are asserted through the scale in jsdom, pixels on h2puni.
5. **The existing tests are inventoried and rewritten, not appended to**
   (codex 15, agy 6/7): `gantt-panel.test.tsx`'s workday-position
   assertions and `e2e/gantt.spec.ts`'s `bar.start * DAY_PX` alignment
   check both go red legitimately; each is re-derived through the scale.
   Faults injected independently into bars, brackets, arrows, links,
   carets, overlays, and horizon clipping — one at a time, watched red.
6. No start date ⇒ no calendar: the axis stays the workday axis exactly as
   today. Rendered state, stated in the spec, tested — not a fallthrough.

## G2 `gantt-bar-hover` (5.2, ~2d) — after `name-title-body` merges

Bar hover today is a native SVG `<title>`: six terse lines. Team, estimates,
deps are not in it — nor in the narrow rows the panel receives.

1. **Slice-true data, not row data** (codex 16 — `TreeRow.dates` is the
   whole item's span; a bar is one role slice whose dates derive from
   `bar.start/finish`, which the current title already converts): hover
   dates come from the bar's own offsets through G1's scale;
   `personName` stays from the atomic chart payload (no directory-fetch
   skew). Bars are _enriched_ with team name, the estimate trio for the
   bar's role, and dependency labels — resolved from the **full tree**,
   not `shownRows` (collapse/search hides rows). The zero-role and
   unassigned and missing-estimate states render named states, not blanks.
2. The surface: `name-title-body`'s `HoverPreview` generalized into a
   positioned surface both the Name cell and the bar use — **its actual
   merged contract is re-read first** (codex, first pass; it is mid-flight
   and the file is being renamed). Content: `NNN — Name` heading; `Role ·
Person`; team; `1 Jun → 5 Jun · 3 days`; trio `o/r/p`; float/critical;
   binding-floor sentence; `after 3.1 Design, 3.2 API`. Notes stay with
   the Name-cell preview; recorded non-goal.
3. **Accessibility survives the `<title>` removal** (codex, first pass —
   deleting it silently deletes the bar's accessible name): bars get
   `tabIndex` and an `aria-label` carrying the same facts; focus shows the
   surface; Enter/Space keep meaning pick-row. Native `<title>` children
   are then removed (two tooltips is a bug).
4. Lifecycle specified, not guessed (codex, agy 8): portal/fixed layer
   anchored to the bar's rect, flip-above near the bottom, clamped to the
   horizontal viewport; **panel scroll dismisses** (the cheap honest
   answer; re-anchoring is the alternative the spec rejects); open delay
   cancellable; refetch/unmount of the anchor closes it; one open at a
   time. Touch: tap stays pick-row; no long-press hover; recorded
   non-goal.
5. **`gantt-panel.test.tsx`'s 8+ `querySelector('title')` assertions are
   rewritten** against the surface/aria-label (agy 7). jsdom tests cover
   content and named empty states; the hover itself is browser-only
   (fifteenth-check shape): hover mid-scroll, flip near the edge, dismiss
   on scroll — in `e2e/gantt.spec.ts`.

---

## Budget and honesty

D1 2.5 + D2 2 + T2 1.5 + T1 1.5 + H1 1 + G1 3 + G2 2 ≈ **13.5 agent-days**
(v1 said 7.5; codex 17 called the exclusions out — D1's stale-write
hardening, T2's frame-layout foundation, G1's full-mark migration — and the
restructure agrees). At the cadence the last batches ran, call it 4–5
working days of wall-clock. Review checkpoints: after D2, after G2.

## Open questions — resolved by Dany, 2026-08-09

1. **Yes, with a sharpening:** deletes allowed for everybody, and the
   confirm must highlight all affected projects and items (folded into
   D1.2/D2.2 — the refusal payload lists them by name).
2. **Yes** — team delete nulls the label in-transaction.
3. **Yes** — narrow state driven by the whole-table predicate.
4. **Yes** — TanStack Router, code-based routes, ADR recorded.
5. **Post-commit** `directory_changed`, the `role-crud` timing — outbox
   rejected.

## Disposition table (v1 review)

| finding                                                                                                                    | disposition                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| codex 1 (stale directory ids 500/dangle on write+undo paths)                                                               | **Accepted** — D1.3: typed `unknown_person`/`unknown_team` on every write path incl. undo, in-transaction validation, negatives per path.                                                                  |
| codex 2 / agy 4 (in-transaction event write unbuildable; nested tx; pre-commit broadcast)                                  | **Accepted with modification** — D1.4: post-commit record+publish per affected project, the `role-crud` pattern; outbox rejected for consistency with the existing timing; window stated. Open question 5. |
| codex 3 (renames leave open projects stale forever)                                                                        | **Accepted** — D1.4: renames emit to every referencing project; two-client rename test.                                                                                                                    |
| codex 4 (revision guard unsound; role-crud's transactional split is the contract)                                          | **Accepted** — D1.2/D1.3: count+delete in one transaction; typed stale-reference rejection replaces revision prose.                                                                                        |
| codex 5 (PATCH contract underspecified)                                                                                    | **Accepted** — D1.1: atomicity, dedupe, empty-patch 422, typed 4xx bodies.                                                                                                                                 |
| agy 12 (`taken`, not `duplicate`)                                                                                          | **Accepted** — D1.1.                                                                                                                                                                                       |
| agy 10 (no `ProjectEvent` variant)                                                                                         | **Accepted** — D1.4: typed `directory_changed`.                                                                                                                                                            |
| codex 6 (CreatablePicker is single-select; 44px unproven)                                                                  | **Accepted** — D2.3: chips + add-picker, contract spelled out, hit-area asserted.                                                                                                                          |
| codex 7 / agy 11 (Caddyfile already has `try_files`; packaged proof missing)                                               | **Accepted** — D2.1: config task removed; built-artifact deep-link proof required, fault-injected once.                                                                                                    |
| codex 8 / agy 1, 9 (five width consumers incl. static `PINNED_GEOMETRY` and `foldedTableMinWidth`; name has no `widthFor`) | **Accepted** — T2.1 builds the per-render `frameLayout` object; T1.1 layers overrides on it; T1.2 names `name` non-draggable.                                                                              |
| codex 9 (T1/T2 not independent; reset vs dynamic defaults undefined)                                                       | **Accepted** — lanes reordered T2→T1; T1.3 defines precedence and reset-clears-the-key.                                                                                                                    |
| codex 10 (DateField has no cancellation contract; edit lifecycle unspecified)                                              | **Accepted** — T2.3: `onExit('commit'\|'cancel')`, Escape suppresses the blur commit, focus restoration, peer-refetch behavior, per-transition tests.                                                      |
| codex 11 (one shortDate across IsoDate and epoch is unsound)                                                               | **Accepted** — T2.2: `shortIsoDate` + `shortInstant`, timezone stance stated, boundary tests.                                                                                                              |
| codex 12 / agy 13 (ProjectSummary widening breaks createProject and typecheck)                                             | **Accepted** — H1.1: type split; response-shape tests; test factories updated.                                                                                                                             |
| codex 15-first-pass (listbox `min-w-full` nowrap; 32-char usernames)                                                       | **Accepted** — H1.3.                                                                                                                                                                                       |
| codex 13 / agy 5 (calendarOffset: no origin binding, fraction floor, weekend start)                                        | **Accepted** — G1.1: the exact formula, weekend normalization inherited and tested, fraction cases enumerated.                                                                                             |
| codex 14 (unestimated bars collapse to zero width)                                                                         | **Accepted** — G1.3: width from `drawnSpan`; engine finish demoted to metadata; non-zero-area preconditions.                                                                                               |
| codex 15 / agy 3, 6 (marks and axis omitted from conversion; existing tests legitimately red)                              | **Accepted** — G1.2/G1.5: one geometry object for every mark incl. the axis header; test inventory rewritten; per-mark fault injection.                                                                    |
| agy 2 (layout.spec `measure()` throws without the date input)                                                              | **Accepted** — T2.5: measurement re-derived for both at-rest states.                                                                                                                                       |
| codex 12-first-pass (Number 72px unmeasured)                                                                               | **Accepted** — T2.4: browser oracle picks the width from a worst-case branch.                                                                                                                              |
| codex 10-first-pass (reset leaks into the mobile sheet)                                                                    | **Accepted** — T1.4: desktop-only placement plus a mobile negative.                                                                                                                                        |
| codex 16 (hover dates from row span are wrong per slice; shownRows hides dep labels)                                       | **Accepted** — G2.1: slice-true dates, full-tree resolution, named empty states.                                                                                                                           |
| codex 20-first-pass / agy 7, 8 (a11y of `<title>` removal; tooltip lifecycle; title-based tests)                           | **Accepted** — G2.3/G2.4/G2.5: aria-label + tabIndex, dismiss-on-scroll, portal clamping, tests rewritten.                                                                                                 |
| codex 17 (budget excludes forced scope)                                                                                    | **Accepted** — 7.5 → ~13.5 agent-days; orders T2→T1, G1→G2 preserved.                                                                                                                                      |
| agy 6 (gantt.spec alignment formula)                                                                                       | **Accepted** — folded into G1.5.                                                                                                                                                                           |
