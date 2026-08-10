# UX batch + consolidated roadmap — plan v3 (2026-08-10)

v1 was cross-reviewed the same day: codex 15 findings (3 critical, 12
major), every one accepted. The criticals all hit S2′: it now carries a
backfill and a read bridge for the legacy column, explicit FK delete
behaviour proven against the outgoing release's raw SQL, and a **primary
team pointer** instead of "first of an unordered set". The majors reshaped
U3 (the `+N` marker is gone — CSS clamp plus the existing hover card, no
counting), U4 (pill-vs-cell state is `{rowId, pillId}`), U5 (`entered`
stores the estimate half only, as a separate optional field), U6 (initials
stay off mobile), and the running order (bookkeeping moved first).

v2 was then reviewed by opus (12 findings: 2 critical, 8 major, 2 minor),
every one accepted — both disposition tables at the bottom. The criticals:
Lane B's "sweep the complete changes" skipped exactly the two _incomplete_
deltas U1/U5 supersede, and U1's planned Name floor was the recorded
injected fault of a shipped negative test (`column-widths-drag/verify.md`
row 4) — `floorFor` now grows an explicit flexible arm and the retired
negative is struck by name. The majors: U1 gets a designed fallback for
`table-layout: fixed`'s excess-width distribution; U5 seeds `entered` on
**focus only** (at rest the folded cell keeps showing be-01's final figure
— `role-columns-fold`'s rationale stands unreversed), pins the upsert's
conflict clause to write `entered` (incl. null) with a watched negative,
and names the midpoint-invention reversal; S2′ closes the two swap-window
holes in dual-write/usage-counting and takes explicit ownership of the
join-aware usage vocabulary; U3's fade is **unconditional** (no
measurement, so no conditional claim to prove); U2's browser proof
measures the one quantity that actually increases every level (the sum).

**agy: attempted and blocked.** Three headless invocations from this
session (plain `-p`; `--mode plan`; `--sandbox --dangerously-skip-
permissions`) produced, respectively, an off-task answer, a permission
auto-denial, and a silent hang past its own timeout. This matches the
recorded 2026-08-09 finding that agy needs a permission rule only Dany can
grant. **Queued for Dany** (run from a terminal, not through an agent):

    agy -p "Review docs/plans/2026-08-10-ux-batch-and-roadmap.md against
    this repo: factual claims, internal consistency, conflicts with
    openspec/changes/ and AGENTS.md, missing work. Numbered findings with
    severity and file refs." --print-timeout 15m

Its findings get the third disposition table when they land.

Dany's asks (2026-08-10, with screenshot): **(1)** drag the Name column,
with the columns to its left resizing evenly; **(2)** more pronounced
indentation for the most-nested rows; **(3)** the deps cell must not wrap
and grow the row; **(4)** dep hover — input-area hover shows all deps in
the hint _and_ highlights their rows; single-pill hover highlights that
dep's row and emphasises it in the hint; **(5)** folded Dev/QA cells edit
as the `1/2/3 @assignee` representation, parsing widened (space delimiter,
two numbers = opt/pess with realistic = their average, one number = all
three, `@` at either end), and **both the original input string and the
parsed trio are persisted**, the original round-tripping into the editor;
**(6)** the assignee beside the folded estimate is unreadable — improve
it; **(7)** the directory manages teams, services, and people separately —
person↔many teams, person↔many services, service↔many teams, team↔many
services; **(7.1)** a work item carries **several teams and several
services**, edited as one combined input (`s.service1 t.team1` with
autocomplete + create) when folded, two separate columns when unfolded.

This plan folds those into the roadmap that already lives in the repo:

- `docs/plans/2026-08-09-resource-planning.md` (v3, reviewed by codex,
  opus and agy; dispositions recorded there) — lanes R1, C1–C4, S1, S2.
  Its precondition batch (D1, T2, G1, H1, T1, D2, G2) has landed on
  `main`.
- Two OpenSpec changes with wholly unchecked task lists that are largely
  **already implemented** on `main`: `wire-be-01-runtime-layer-a`
  (`replay-orchestrator.ts` et al. exist, `onResume` delegates to the real
  orchestrator; `onForward` is the pure ack its own proposal specifies —
  though several artifacts its proposal names are absent and must be
  verified item by item, not assumed) and `dev-environment-auto-deploy`
  (`bin/dev-deploy.sh` exists, `WBS_ENV` threaded through
  `tools/tool-remote-scripts`; its task list still holds obsolete
  poller/systemd items from the pre-revision design). Reconciliation is
  bookkeeping, but honest bookkeeping: check each task against shipped
  code, amend or check off, then archive.
- `openspec list` reports **43 complete changes** and an empty
  `openspec/changes/archive/` — a bulk-archive sweep is due, and it is due
  **first** (codex 15): U1, U3 and U5 supersede requirements that live in
  still-active deltas (`column-widths-drag`, `table-geometry-and-tab-order`,
  `combined-trio-entry`), and superseding a delta that has no archived
  baseline is how spec history gets lost. Note the trap (opus 1): the
  deltas U1/U5 supersede are among the **incomplete** ones — each is one
  "Deploy to dev and Dany looks" task short — so a sweep over "complete
  changes" would skip exactly them. Lane B drives those sign-offs to a
  decision first.
- Two prod-phase findings (rollback unimplemented; `configure.sh` root
  phase unrehearsed) stay recorded-not-pending per Dany 2026-08-06; work
  stops at dev. They appear on the map as unscheduled markers only.

Execution model as before: one OpenSpec change per row, each with its own
R4 design interview; Opus subagents implement; Dany merges between;
codex+agy re-review after U5 and after S2′. Line citations are against
`main` @ `9fce247` and will drift; symbols are the durable reference.

---

## Lane B — bookkeeping first (~0.5d)

1. Reconcile `wire-be-01-runtime-layer-a` and `dev-environment-auto-deploy`
   against `main`: verify each task against the shipped code (absent
   artifacts named, obsolete tasks struck with a note), amend, archive.
2. Surface every "Deploy to dev and Dany looks" leftover to Dany as one
   list and drive **at least `column-widths-drag`, `combined-trio-entry`
   and `table-geometry-and-tab-order`** to a decision (opus 1, 11 —
   they hold the requirements U1/U5/U3 supersede and are exactly the
   ones a complete-only sweep would skip).
3. `openspec-bulk-archive` sweep over the then-complete changes so the
   new deltas supersede archived baselines, not live ones. `openspec
validate --all --json` green before and after.

## Lane U — the UX batch (this message's asks)

Ordered so the pure-CSS/geometry rows land before the rows that touch the
wire, and the estimate row lands before S2′ reuses its combined-input
seam.

### U1 `name-column-drag` (~1.5d)

Name is the table's one **flexible** column: `FLEXIBLE_COLUMNS = {'name'}`
(`table-frame.ts`), `defaultWidthFor`/`floorFor`/`widthFor` all **throw**
for it, `frameLayout` counts it at `FLEXIBLE_FLOOR = 200` in `minWidth`,
and `resizeHandleFor` suppresses its handle because `resolved?.width` is
`undefined`. The columns to its left are exactly `drag` (24) and `number`
(93) — both pinned, and `PINNED_COLUMN_IDS` requires Name pinned **last**
(`pinnedGeometryFor` throws on a pinned column behind a flexible one).

1. **Decision, recorded here as superseding `column-widths-drag`'s "Name
   stays flexible" requirement (codex 7):** a dragged Name gets a stored
   override like any other column — entering `widthOverrides`, same
   storage key, same claim-reading rules — and the flexible role passes to
   the remaining viewport space. "Columns to the left resize evenly" is
   read as satisfied by Name owning its width: the left neighbours are a
   24px drag handle (cannot absorb travel) and Number (envelope-bound,
   e2e-measured), so shrinking them is not useful travel. The delta spec
   states the supersession; Dany can override at the interview (open
   question 1), before implementation, not after.
2. Give `name` a resolvable dragged width without corrupting the pinned
   sums: **`frameLayout` resolves flexible-with-override before consulting
   `FLEXIBLE_COLUMNS`; `widthFor` keeps throwing for a flexible column
   with no override** — its recorded reason ("a sentinel would let the
   pinned-offset arithmetic add a number the browser never uses") stands
   (opus 2). `pinnedGeometryFor` and `flexibleCellStyle` learn the
   override state; `minWidth` accumulation counts the override instead of
   `FLEXIBLE_FLOOR`; `foldedTableMinWidth` moves with it. Risk centre —
   every consumer of "Name has no width" is enumerated in `table-frame.ts`
   and each gets its case in `table-frame.test.ts`.
3. **Name's floor is an explicit flexible arm in `floorFor` returning
   `FLEXIBLE_FLOOR`** — not the `min(defaultWidthFor, NARROWEST_COLUMN)`
   path, which would yield 36 and put `flexibleCellStyle`'s
   `minWidth: FLEXIBLE_FLOOR` in disagreement with it, the two-width-
   systems fault this module exists to prevent (opus 2). This deliberately
   retires the shipped negative "refuses the flexible column a width and a
   floor alike" (`column-widths-drag/verify.md`, injected fault: exactly
   this arm): the delta spec strikes that requirement **by name**, and the
   test flips from proving refusal to proving the resolved floor.
4. The full gate list (codex 6): `resizeHandleFor`'s undefined-width
   suppression; `ColumnResizeHandle`'s `fromWidth` (captured once from the
   resolved layout — for Name with no override, captured from the
   **rendered** width via the header cell, the one measurement in the
   gesture); `sizableColumn` (currently rejects Name via the
   `UnknownColumnError` catch); `rememberedWidthOverrides`' per-entry
   claim rules (a stored `name` entry must survive the `sizableColumn`
   filter and the floor/ceiling check with Name's own bounds); and
   `clampColumnWidth` (currently throws for Name). Floor
   `FLEXIBLE_FLOOR`, ceiling `WIDEST_COLUMN`; drag clamp and storage check
   keep reading the same constants.
5. **Excess-width design, not assertion** (opus 3): with every `<col>`
   sized, `table-layout: fixed` distributes extra viewport across **all**
   columns — moving Number off its 93px envelope and the dates off 114,
   which breaks the existing header-matrix e2e, not just the new case. So
   the design is: **`<col name>` stays unsized even with an override; the
   dragged width is expressed as `width` + `minWidth` on the Name cells**
   (fixed layout honours the first row's cell width), keeping Name the
   sole absorber of excess exactly as today. If Chromium shows fixed
   layout not honouring the cell width against an unsized `<col>`, the
   fallback is the table's own width set to the resolved sum; the e2e
   measurement decides between the two, and the losing branch is deleted,
   not left as dead config.
6. Reset stays `forgetWidthOverrides` — one reset returns the whole
   layout, Name included.
7. Proofs: jsdom width-table cases incl. the four-consumer override case
   extended to Name; the storage sanitizer negatives re-run with a `name`
   entry; Chromium drag in `e2e/layout.spec.ts` (jsdom performs no
   default action for pointer events — R5 #14/#15/#16 fault class),
   watched red with the gate left in place; the excess-width measurement
   from task 5 at the widest header-matrix viewport, with the existing
   Number/date envelope assertions staying green.

### U2 `deep-indent` (~0.5d)

`indentFor(depth) = min(depth, 4) * 12` (`table-frame.ts`) — every level
past 4 renders identically, which is exactly the screenshot's complaint
(`030.1.1.1.1.1` at depth 5, invisible under its depth-4 parent).

1. The one function splits into two named concepts (codex 8):
   **`numberIndentFor`** — capped as today, guarding the Number column's
   envelope — and **`hierarchyIndentFor`** — uncapped. The Number cell
   keeps the capped one; the **Name cell additionally carries
   `hierarchyIndentFor(depth) − numberIndentFor(depth)`** (zero until the
   cap, growing past it — Name is flexible, no envelope to blow); the
   Gantt row rail and the mobile cards take `hierarchyIndentFor` outright
   (their labels are not width-capped by a 93px column). Each consumer's
   choice is stated in its JSDoc.
2. **The measured quantity is the sum** (opus 10): no single element's
   edge increases at every level — Number's padding is flat past the cap,
   Name's overflow share is zero below it. The Chromium assertion is the
   **Name text's left edge relative to the row's left edge** (capped
   Number indent + overflow share), strictly increasing to depth 6; the
   Gantt rail asserts its own uncapped edge. The mobile card gets a
   stated cap of its own (a 390px card cannot spend 72px on depth-6
   margin): `min(depth, 6)` at the card's step, recorded in its JSDoc
   rather than discovered at a viewport.
3. Proofs: `table-frame.test.ts` cases for both functions to depth 6 and
   their difference; the `NUMBER_ENVELOPE` e2e proof unchanged and still
   green; `e2e/layout.spec.ts`'s deep-plan fixture grows to depth 6 with
   the sum measurement above; a mobile-card jsdom case for the capped
   margin.

### U3 `deps-single-line` (~0.5d)

The wrap is one declaration — `whiteSpace: 'normal'` on the deps wrapper
(`wbs-table.tsx`), with a recorded rationale ("a dependency nobody can see
is not [a cost worth paying]"). This change reverses that decision by
name, and the hover card becomes the guarantee:

1. At rest the cell clamps to one line: `nowrap` + `overflow: hidden` on
   an **inner** box (the wrapper stays the positioned ancestor for the
   listbox and the hover card; the `<td>`'s popover clip exemption is
   untouched; precedent: `CellInput.restShowsFirstLineOnly`). **No `+N`
   marker** (codex 9 — counting hidden variable-width pills means real
   layout measurement for marginal information): the truncation cue is an
   **unconditional** CSS edge fade (opus 8 — "fade only when clipped"
   would need the `scrollWidth` measurement the marker was deleted for;
   a fade over an unclipped short row is invisible against the row
   background by construction, so unconditional costs nothing). The full
   list lives where it already lives — the `DependsCard` hover hint
   (which U4 improves) and the sr-only `Waiting for …` line. No
   measurement, no resize listener, nothing to count, no conditional
   claim to prove.
2. This reverses a second recorded requirement besides the wrapper
   comment: `table-geometry-and-tab-order`'s "wraps its chips onto a
   second line rather than clipping them" (opus 11). Both supersessions
   are named in the delta spec, and Lane B drives that change's sign-off
   first.
3. Proofs: Chromium measures the row height with the deep-plan fixture's
   7 chips equal to a chipless row's, and a clipped chip actually
   invisible at rest (the assertion R5's fifteenth/sixteenth checks
   demand be made in a browser, against a row with real area); jsdom only
   for "the inner box exists and the wrapper still positions the
   listbox".

### U4 `dep-hover-highlights` (~1d) — after U3, by dependency

Hover state is table-level already: `hoveredCell` / `openCard`, read by
cells through the `live` ref so the `columns` memo keeps its
`[roles, unfoldedRoles]` deps (the remount landmine). Rows have **no DOM
handle** today; pills carry no hover handler. **U3→U4 is an ordered
dependency, not a preference** (opus 11): both restructure the same deps
wrapper, and after U3 a chip can be clipped out of sight — U4's pill
hover then has no target for it, which is fine (the cell-level hover
still lights every dependency's row), but the case is named and tested
rather than discovered.

1. `<tr>` gains `data-row-id={row.original.id}` (precedent: `data-armed`,
   `data-drop`); the highlight tint lands on the `<td>`s via the
   `--cell-bg` join, not the `<tr>` — pinned cells paint opaque
   backgrounds.
2. New table-level state `depHover: { rowId: string; pillId: string |
null } | null` (codex 10 — a single id list cannot distinguish "the
   cell" from "the cell's only pill"): entering the deps cell's input
   area sets `{rowId, pillId: null}`; entering one pill sets its id;
   **leaving a pill while still in the cell restores `pillId: null`**;
   leaving the cell clears. The lit set derives per render: all of
   `waitingFor` when `pillId` is null, the one pill otherwise. Exposed
   through `live`; setters are plain state — a hover **re-renders** the
   body (that is how React works and is cheap here) but must not
   **remount** cells, which is what the 2-dep `columns` memo guarantees
   and what the existing focus tests already pin (codex 10's wording
   fix).
3. Rows read it as `data-dep-lit` on the `<tr>`, CSS re-points
   `--cell-bg` (the `tr:hover` precedent). A dependency whose row is
   collapsed or filtered out has no row to light (`shownRows`); the hint
   still names it.
4. `DependsCard` gains an `emphasisedId: string | null` prop fed from
   `depHover.pillId`; the emphasised entry renders with the **same tint
   the table rows use** (background swatch, not bold — matches the
   in-table highlight, the treatment Dany asked to consider).
5. Proofs: jsdom for the state machine (pill → cell → out) and the card
   emphasis; Chromium for the actual tint on a real row and the
   pill-hover emphasis (`e2e/hover-cards.spec.ts`, hover being a browser
   behaviour).

### U5 `estimate-original-input` (~2.5d)

Today `parseTrioShorthand` accepts `o/r/p` or one number, splitting on
`/` only — `2 3 8` is a _recorded refusal_ (`combined-trio-entry`
non-goals, `estimate-draft.test.ts` asserts it). `splitMention` splits on
the first `@`, so a leading `@` yields an empty estimate half and the
commit refuses. Nothing anywhere stores what was typed:
`commitCombinedEstimate` sends `entry.days` and forgets, and
`combinedValue` falls back to `showFinal(finalDays)` at rest. This change
reverses the non-goal by name and adds the persistence.

1. **Grammar** (`estimate-draft.ts`): **split on `/` first; whitespace
   splits within the resulting parts** (opus 9 — a single whitespace
   tokenizer would silently turn `1//3` into the pair `1 3`; the
   two-stage rule keeps an empty `/` slot the refusal it is today).
   3 numbers → o/r/p; **2 numbers → opt/pess, realistic = (opt+pess)/2**;
   1 number → all three; order rule unchanged (`opt ≤ pess` for the pair
   form). The midpoint is a figure nobody typed — this reverses
   `parseTrioShorthand`'s recorded invariant ("the one figure it produces
   that was not typed digit-for-digit is the single-number form") as well
   as the `2 3 8` non-goal, and **both** reversals are named in the delta
   spec and the parser's JSDoc (opus 9). `@name` recognised at either end
   (`splitMention` learns the prefix form; the guard that refuses
   mention-with-empty-estimate stays for the genuinely empty case).
2. **What `entered` holds** (codex 4): the **estimate half only**,
   post-`splitMention` — the mention is not part of it. Assignment
   already travels as its own command (`assign`, resolved to a
   `personId`, stripped from the box by `takeMentionOut` before commit);
   persisting the mention text would let `entered` lie the moment the
   assignee is changed from the `by` column or the directory. The
   round-trip contract is: the box shows `entered` at rest; the current
   assignee is already rendered beside it (U6's chip) and re-typing `@`
   re-opens the mention flow. No atomic combined command; the two
   commands stay two.
3. **Persistence, additive**: `ALTER TABLE estimate ADD entered text` (+
   `down.sql`; pattern `20260806170000_add_estimate_method`), nullable —
   null means "entered before this change, or last written through the
   three-box editors", and the editor falls back to today's `showFinal`
   seeding (codex 5). `StoredEstimate`, the repository select/upsert, the
   `PUT` body (a **separate optional field** beside the trio — the
   `ThreePointEstimate` domain type stays three numbers; the controller
   composes `{...trio, entered?}`), `set_estimate`'s payload and its
   inverse capture (`storedTrio` grows `entered`), and the wire
   (`NumberedWorkItem`/`WorkItemView.estimates`) each grow the field.
   **The upsert's `onConflictDoUpdate.set` writes `entered` explicitly,
   null included** (opus 5 — the clause today writes only the three
   points, and a trio rewrite that skips the column leaves a stale string
   describing an estimate that no longer exists); the negative watches a
   trio rewrite clear it. Blue/green window stated: a trio written by the
   outgoing release mid-swap leaves `entered` null-or-stale for that row;
   the display fallback (`entered` → final figure on mismatch-free null)
   makes that a cosmetic regression for the swap's duration, accepted.
   Legacy journal rows without `entered` replay as null-entered — stated
   and tested. The parsed trio remains the schedule's only input;
   `entered` is display-and-edit state.
4. **Canonicalization** (codex 5): committing through the **unfolded
   three boxes** writes `entered: null` (three numbers have no single
   original string); the folded editor then seeds from the canonical
   `showFinal`. Undo restores the pair (trio + entered) it displaced,
   both directions.
5. **Round-trip, on focus only** (opus 4): **at rest the folded cell
   keeps showing be-01's final figure** — `role-columns-fold`'s "a plan
   is read by the final figure" rationale stands unreversed, the column
   stays homogeneous next to its rolled-up parents, and the 96px cell
   never has to fit `2 3 8` beside U6's chip at rest. On **focus**, the
   box seeds from `entered` (falling back to the canonical figure when
   null) and `select()`s it; `LiveField`'s baseline is the seeded value,
   so a focus+blur still sends nothing. Escape/blur semantics unchanged.
6. **Rolled-up parents**: unchanged read-only `showFinal` (a parent's
   number is a sum, not an entry; `setEstimate` refuses `rolled_up`).
   Dany's "when editing … when they are rolled up" is read as the folded
   **representation** everywhere editing exists today — leaf cells. If
   the intent was typing into parents, that is distribution-down
   semantics: its own change, open question 2.
7. Proofs: parser table incl. the negatives that used to pass (`2 3 8`
   now a trio; `1//3` **still refused** — reachable only under the
   two-stage tokenizer, which is the point; `2/3` = pair form; `@ka`
   alone still refused); round-trip jsdom (type `2 3 8 @ka`, blur,
   re-focus — the box seeds `2 3 8`, the chip holds ka, the resting cell
   shows the final figure); three-box-commit nulls `entered`; the
   upsert-clears-entered negative; repository/controller/undo tests for
   `entered` incl. legacy-row replay; migration lint + down rollback; one
   Chromium pass for the folded-cell flow.

### U6 `assignee-legibility` (~1d)

The folded cell is 96px (`ROLE_FINAL_WIDTH`); the assignee span is
`flex:none; maxWidth:60%` with ellipsis, rendering `· dany…` / `· (Kat)`
— the screenshot's unreadable tail. The full name lives only in the
`FoldedRoleCard` hover.

1. In the **folded table cell only** (codex 11): replace the truncated
   tail with an **initials chip** — the first grapheme cluster of the
   first two words (grapheme-aware, so non-Latin names take their first
   two characters), `--muted` background pill; the assumed state renders
   as an outlined chip instead of parentheses. Collisions are tolerated
   in the cell — the `FoldedRoleCard` (the cell's one hint, deliberately
   no native `title`) and the unfolded `by` column resolve them; both
   keep full names.
2. **Mobile cards are untouched**: they render full names with a `title`
   today and their documented interaction avoids hover-only affordances —
   initials there would lose information on exactly the surface that
   cannot hover. The unfolded assumed-span keeps its full name + `title`
   too.
3. `data-folded-assignee`/`data-assumed` anchors kept — but three
   existing `wbs-table.test.tsx` cases assert the **text content** behind
   them (the `· name` / `(name)` forms) and are rewritten to the chip's
   initials as named U6 tasks, not discovered failures (opus 12).
4. This is a taste call: U6's verify step is a dev deploy Dany looks at,
   with the chip and two alternatives (first-name-only; dot + hover)
   shown on one screen before the survivor ships (open question 4).

### S1′ `teams-services-people` (~3d) — supersedes S1 `teams-and-services`

The 2026-08-09 plan's S1 modelled `service(id, name, team_id)` — **one
team per service**. Dany's (7) asks for service↔**many** teams and adds
person↔**many** services. S1′ keeps everything else S1 resolved (the
fused `service_team` stays as the **Team** table under its historical
name; the real-FK discrepancy note; `directory_changed` extending to
services) and replaces the shape:

1. Schema, additive: `service(id, name unique)`,
   `service_team_membership(service_id CASCADE, service_team_id CASCADE,
PK both)`, `person_service(person_id CASCADE, service_id CASCADE, PK
both)` + down.sqls. Nothing references the engine — services never
   reach scheduling (S1's stated non-goal survives).
2. **Directory-usage vocabulary, redesigned rather than bolted on**
   (codex 12): `DirectoryUsage` grows a `services` half (mirroring
   `members`), and `DirectoryEffect` grows membership arms —
   `service_membership_dropped` (team delete detaches a service; a
   service on several teams is _detached_, not stranded, and the payload
   says which), `person_service_dropped`, and after S2′
   `service_label_dropped`/`team_label_dropped` for the work-item joins.
   The confirm dialog names every effect (D2's contract); counting reads
   the join tables in the same transaction as the delete decision, so a
   concurrent membership write either lands before the count or after
   the delete — never between (the tx is the semantics; stated).
3. Directory page: a **Services** panel beside People and Teams;
   membership chips both ways (a service lists its teams and people; a
   person lists teams and services; a team lists its services) on the
   shipped membership-chip pattern; create/rename/delete with
   refuse-by-default usage payloads; refusals grow `unknown_service`.
4. Routes `/api/services` CRUD + membership PATCHes, `DirectoryApi`/
   `httpDirectoryApi` mirrors, glossary rewritten (**Team**, **Service**,
   **Directory**, **Directory usage**, membership chips).
5. Proofs: repository/tx tests for the joins; delete-with-usage negatives
   per effect arm, each with an injected fault and a `Proof:` comment on
   its production call path (R5); directory page jsdom + one e2e pass.

### S2′ `work-item-teams-and-services` (~3d) — supersedes S2

S2 planned one Services cell; Dany's (7.1) makes the work item carry
**many teams and many services**, folded into one combined input. The
three codex criticals live here and are folded in.

1. Schema, additive: `work_item_team(work_item_id CASCADE,
service_team_id **ON DELETE CASCADE**, PK both)` and
   `work_item_service(work_item_id CASCADE, service_id **ON DELETE
CASCADE**, PK both)` + down.sqls (codex 2 — the outgoing release's
   `removeTeam` deletes teams knowing nothing of these tables; a
   restrictive FK would 500 it mid-swap, no FK permits dangling rows;
   the negative drives the delete through raw SQL in the old release's
   shape, watched clean — C4's own proof, copied).
2. **Backfill + read bridge** (codex 1): the migration carries
   `INSERT INTO work_item_team SELECT id, service_team_id FROM work_item
WHERE service_team_id IS NOT NULL` (statement-breakpoint pattern), so
   existing labels exist in the join from the first read. Readers read
   the join; writers write **both** the join and the legacy column while
   blue can still be serving (dual-write is the new code's duty — the
   outgoing release keeps writing only the column, which is why the
   bridge reads `join ∪ legacy` until the swap completes and a
   post-swap follow-up removes the union read. The window has its own
   negative: a row labelled by old-release SQL after the backfill is
   still labelled in new code's read.) **Two union-read consequences are
   stated rather than discovered** (opus 6): a label removal in new code
   also **nulls the legacy column when it names the removed team** —
   otherwise `join ∪ legacy` resurrects the chip on the next read; and
   blue's `removeTeam` counts usage from the legacy column alone, so
   mid-swap it can delete a team whose only labels live in the join,
   cascading them without a confirm. That loss window is bounded by the
   swap's duration and **accepted in writing here** (same posture as
   C2's stale-JS window); the alternative — holding the swap until the
   union read is retired — was considered and declined for a label,
   which is advisory data, not schedule input.
3. **Primary team** (codex 3): `work_item.service_team_id` is **kept
   permanently and renamed in meaning**: it is the _primary team
   pointer_, with the invariant `primary ∈ work_item_team ∪ {null}`
   enforced at the write boundary (setting labels with the primary
   absent from the set is a 422; clearing the set nulls the primary).
   An unordered join never decides anything; C4's pool table reads the
   primary. Nothing is ever dropped — the forward-additive rule forbids
   the drop this plan's v1 casually promised, and the pointer turns the
   legacy column from debt into the model (codex 3's own suggestion).
   The combined input's first `t.` token sets the primary; the unfolded
   Teams column marks it.
4. The satellite behaves like one (S2's codex-11 resolution, kept):
   revision bump in-tx, journalled reversible `set_labels` command
   carrying the before-sets **and before-primary**, ordinary work-item
   broadcast, duplicate-subtree copies the sets, delete's compensating
   command restores them, CSV export grows the columns, outline card
   renders one line.
5. **Input model** (codex 14 — names contain spaces; raw text cannot be
   the durable form): the combined input is **picker-produced, not
   parsed**. Typing filters; `s.` / `t.` prefixes narrow the kind;
   picking commits an **id reference** rendered as a chip inside the
   cell (the dep-pill pattern, not a text grammar); inline create offers
   `Add team "…"`/`Add service "…"` with the typed fragment verbatim,
   spaces included. Nothing about labels is round-tripped as text —
   unlike U5's `entered`, no original string is stored. Unfolded: two
   columns (**Teams**, **Services**), each a multi-chip picker
   (`CreatablePicker` is single-select **by contract** — the chips
   variant is a new component beside it, `PickerList` reused).
6. **Geometry and the memo** (codex 13): the fold state for the combined
   vs split columns joins `unfoldedRoles`' pattern — one more entry in
   the `columns` memo's dependency array, which **is** a remount of
   every cell on fold/unfold (exactly as role fold/unfold is today,
   an accepted cost on an explicit user action, not on hover); the
   focus/draft tests that pin the landmine run against the new array.
   Label entries and edit callbacks flow through `live`.
   `foldedTableMinWidth`/`frameLayout` learn the conditional column set
   (folded: one `labels` column; unfolded: `teams` + `services`), the
   width budget is measured in Chromium at the header-matrix widths
   before the columns are believed (the compact-columns discipline), and
   the new ids enter `POPOVER_COLUMNS`, export, cards, and the Gantt
   label plumbing (which now renders the **primary** team).
7. **The join-aware usage vocabulary lands here, owned, not orphaned**
   (opus 7): S1′ ships the membership arms for its own entities; S2′'s
   task list explicitly carries `team_label_dropped` /
   `service_label_dropped`, the switch of `usageOfTeam`/`removeTeam`'s
   in-use test from the legacy column to the join (post-bridge), and the
   confirm dialog naming label losses — `label_nulled`'s singular
   phrasing dies in the same commit that makes it false.
8. Proofs: picker jsdom; journal/undo round-trip incl. primary;
   backfill + bridge negatives above (incl. legacy-null-on-removal and
   the accepted mid-swap window's boundary); old-release delete negative;
   join-read usage negative; fold/unfold e2e; width budget e2e.

## Lane R+C — resource planning (incorporated as planned)

R1 `roles-not-phases` (1d) → C1 `capacity-in-the-engine` (3d) → C2
`resourcing-mode-people` (3d) → C3 `role-headcount` (1d) → C4
`team-headcount` (3d), exactly as `2026-08-09-resource-planning.md` v3
resolved them — reviewed three ways, dispositions recorded there, not
re-litigated here. Two touch-points move:

- S1/S2 are replaced by S1′/S2′ above; C4's "after S1 in naming only"
  becomes "after S2′": its pool table reads the **primary team pointer**,
  which S2′ defines, so the dependency is now real, not naming.
- The suggested global order interleaves the UX lane first (Dany's
  immediate asks) — see the map.

---

## Suggested order and budget

**B (0.5)** → U2 (0.5) → U3 (0.5) → U4 (1) → U1 (1.5) → U6 (1) → U5
(2.5) → **review checkpoint** → R1 (1) → S1′ (3) → S2′ (3) → **review
checkpoint** → C1 (3) → C2 (3) → C3 (1) → C4 (3).

≈ **25 agent-days**. Bookkeeping first so new changes supersede archived
baselines (codex 15); the UX lane front-loads what Dany sees daily;
S1′/S2′ land before C4 needs the primary pointer; the capacity lane runs
last and intact. U2 is independent of everything; **U3→U4 is ordered**
(the shared deps wrapper and the clipped-pill case); U1 touches the same
`table-frame.ts` seam as nothing else in flight. U5's position is Dany's
priority alone — S2′'s input is picker-produced and reuses no U5 parse
seam (opus 12), so U5 could equally run after the checkpoint if the
directory work is wanted sooner.

## Open questions for Dany

1. **U1's direction of travel**: is "columns to the left resize evenly"
   satisfied by Name owning its width (planned, recorded as superseding
   `column-widths-drag`'s requirement), or do you want Number to shrink
   as Name grows? The 24px drag column cannot absorb travel either way.
2. **U5 on parents**: does "editing when rolled up" mean leaf cells only
   (planned), or typing into a parent distributing down? The latter is
   real product semantics, not an input tweak.
3. **S2′ primary team**: first `t.` token picked = primary, changeable
   from the unfolded Teams column — acceptable, or do you want an
   explicit "primary" affordance in the folded input too?
4. **U6**: initials chip vs first-name-only vs dot+hover — the dev
   deploy shows all three; pick on sight.

## Assumptions — best guess recorded, Dany can override any

1. The `s.`/`t.` prefixes narrow the autocomplete kind; bare fragments
   search both kinds. Selections are id references (chips); label text is
   never persisted as typed (codex 14).
2. Two-number estimates accept `2 8` and `2/8` alike; `2 8 @ka`,
   `@ka 2 8` both parse; `@ka` alone still refuses.
3. `entered` is per `(work_item, role)` like the trio it captures;
   clearing an estimate clears it; three-box commits null it.
4. U3 needs no keyboard affordance beyond the existing sr-only list and
   the focus-opened card (the cell is already a combobox).
5. Multi-team on a work item does not change directory-usage counting
   semantics (a team "in use" = labelling ≥1 item through the join or
   primary pointer); the _vocabulary_ changes per S1′.2.

## Disposition table (v1 review — codex)

| finding                                                                                                          | disposition                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| codex 1 (S2′ join tables empty; outgoing release writes legacy column only)                                      | **Accepted** — migration backfills `INSERT … SELECT`; readers bridge `join ∪ legacy` until post-swap follow-up; old-release-write negative. S2′.2.                                       |
| codex 2 (join FK behaviour unspecified; outgoing `removeTeam` 500s or dangles)                                   | **Accepted** — `ON DELETE CASCADE` on both joins; C4's raw-old-release-SQL negative copied. S2′.1.                                                                                       |
| codex 3 ("first of an unordered set" nondeterministic; dropping the column violates additive rule)               | **Accepted** — `service_team_id` kept permanently as the primary-team pointer, `primary ∈ set` enforced at the boundary; no drop, ever. C4 reads the primary. S2′.3.                     |
| codex 4 (mention is a separate command; persisting it in `entered` lies after reassignment)                      | **Accepted** — `entered` stores the estimate half only, post-`splitMention`; the two commands stay two. U5.2.                                                                            |
| codex 5 (`entered` undefined for legacy rows, three-box edits, replay; domain type entangled)                    | **Accepted** — separate optional field beside the trio; null = legacy/three-box; three-box commit nulls it; legacy journal replay stated and tested. U5.3–4.                             |
| codex 6 (U1 task list missing `sizableColumn`, handle `fromWidth`, storage filter; remainder behaviour unproven) | **Accepted** — full gate list enumerated; rendered-width capture for the handle; wide-viewport Chromium assertion. U1.3–4.                                                               |
| codex 7 (recorded decision reversed silently; interpretation left open while scheduled)                          | **Accepted** — supersession recorded in U1's delta spec; open question stays but the planned reading is the recorded decision unless Dany overrides at the interview. U1.1.              |
| codex 8 (one `indentFor` cannot serve capped Number and uncapped depth)                                          | **Accepted** — split into `numberIndentFor` (capped) + `hierarchyIndentFor` (uncapped); per-consumer choice stated; three-consumer proofs. U2.                                           |
| codex 9 (`+N` needs real layout measurement)                                                                     | **Accepted by simplification** — marker deleted; CSS fade cue; the card and sr-only line carry the list. U3.1.                                                                           |
| codex 10 (one-pill cell ambiguous; leave-pill must restore cell-wide; renders≠remounts)                          | **Accepted** — `{rowId, pillId\|null}` state, pill-leave restores null; wording fixed (re-render fine, remount forbidden). U4.2.                                                         |
| codex 11 (initials on mobile lose the name on the surface that cannot hover)                                     | **Accepted** — folded table cell only; mobile and unfolded spans keep full names; grapheme-aware initials. U6.1–2.                                                                       |
| codex 12 (`DirectoryUsage`/`DirectoryEffect` cannot express service relations; "stranded" wrong for multi-team)  | **Accepted** — vocabulary redesigned: `services` half, membership-drop arms, _detached_ not stranded, in-tx counting semantics stated. S1′.2.                                            |
| codex 13 (conditional column set breaks `foldedTableMinWidth`; memo deps must be proven safe)                    | **Accepted** — fold state joins the memo array as `unfoldedRoles` does (remount on explicit toggle, accepted); frame layout learns the conditional set; focus/draft tests re-run. S2′.6. |
| codex 14 (space-bearing names break the token grammar)                                                           | **Accepted** — labels are picker-produced id references, never parsed text; `s.`/`t.` only narrow the search. S2′.5, assumption 1.                                                       |
| codex 15 (archive first; counts stale; obsolete tasks in the two open changes)                                   | **Accepted** — Lane B moved to the front; 44 corrected; reconciliation made item-by-item. Lane B, order.                                                                                 |

## Disposition table (v2 review — opus)

| finding                                                                                                                                | disposition                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| opus 1 (the sweep skips the incomplete deltas U1/U5 supersede; count is 43)                                                            | **Accepted** — Lane B drives the named sign-offs to a decision before sweeping; count corrected.                                                                         |
| opus 2 (Name's planned floor is a shipped negative's injected fault; `floorFor`'s min-path yields 36 vs `flexibleCellStyle`'s 200)     | **Accepted** — explicit flexible arm in `floorFor` returning `FLEXIBLE_FLOOR`; `widthFor` keeps throwing; the retired negative struck by name in the delta spec. U1.2–3. |
| opus 3 (fixed layout distributes excess across all sized `<col>`s, breaking the envelope e2e)                                          | **Accepted** — designed: `<col name>` stays unsized, dragged width lives on the Name cells; table-width-sum fallback named; Chromium decides, loser deleted. U1.5.       |
| opus 4 (`entered` at rest reverses `role-columns-fold`'s figure-first rationale and makes a mixed column)                              | **Accepted** — seed on focus only; rest keeps the final figure; no supersession needed, no width blowup. U5.5.                                                           |
| opus 5 (upsert conflict clause omits `entered` → stale string survives a trio rewrite)                                                 | **Accepted** — clause writes `entered` incl. null, watched negative; swap-window sentence added. U5.3.                                                                   |
| opus 6 (dual-write can't mirror a set into one column; blue's usage check reads only the column; union read resurrects removed labels) | **Accepted** — removal nulls the legacy column when it names the removed team; mid-swap confirm-less loss window bounded and accepted in writing. S2′.2.                 |
| opus 7 (join-aware usage vocabulary orphaned between S1′ and S2′)                                                                      | **Accepted** — S2′.7 owns the label arms, the join-read switch, and `label_nulled`'s retirement.                                                                         |
| opus 8 (fade-only-when-clipped needs the measurement U3 forbids)                                                                       | **Accepted** — unconditional fade, invisible on unclipped rows by construction; proof moves to row height + clipped-chip invisibility. U3.1, U3.3.                       |
| opus 9 (`1//3` unreachable under one-pass tokenizing; midpoint invents an untyped figure against a recorded invariant)                 | **Accepted** — split on `/` first, whitespace within parts; both reversals named in delta spec + JSDoc. U5.1.                                                            |
| opus 10 (no single element's edge strictly increases; mobile card uncapped is a real 390px cost)                                       | **Accepted** — measured quantity is the Name-text-to-row-edge sum; card gets a stated cap. U2.2.                                                                         |
| opus 11 (U3/U4 share the wrapper; U3 also reverses `table-geometry-and-tab-order`'s wrap requirement)                                  | **Accepted** — U3→U4 ordered with the clipped-pill case named; third supersession added to Lane B and U3.2.                                                              |
| opus 12 (stale U5-before-S2′ rationale; U6 text assertions understated)                                                                | **Accepted** — ordering re-justified on priority alone; the three text assertions are named U6 tasks.                                                                    |

## Disposition table (v3 review — agy)

_Blocked from this session (three invocations: off-task answer, permission
auto-denial, silent hang — see header). The queued command is in the
header; findings land here when Dany runs it._
