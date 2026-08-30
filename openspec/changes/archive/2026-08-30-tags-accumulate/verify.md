# verify — `tags-accumulate`

Slices 1–3 and 5.1/5.2 implemented and gated. Slice 4 (Chromium) and 5.3 (the
whole gate) are recorded below with exactly what was and was not executed.

## The decision this reverses

`effective-tag.ts` implemented **override**, and its JSDoc named the decision:
"the rule is `effectiveTeamsOf`'s, unchanged and deliberately so — R2's Q4,
confirmed there and not re-litigated here". That answer was given about teams
and is still the rule for teams and for services. Only the tag half is reversed;
`docs/adr/0008-tags-accumulate-down-the-tree.md` records which decision it
supersedes, why, and what was considered instead.

The JSDoc of all four domain modules is rewritten in the same commit, in both
directions: `effective-label.ts` says tags left it and why, `effective-team.ts`
and `effective-service.ts` say they did not.

**Read with ADR 0009**, landed on main while this was being written: a work item
**type** inherits neither way. The plan now holds three answers to one question —
override, accumulate, neither — and both ADRs say so in a table rather than leave
it to be found in three walks. The line between 0008 and 0009 is whether the
statement stays true as you descend: `Risk` said of a parent is said of the work
under it, `Epic` said of a parent is emphatically not.

**The assumption Dany has not confirmed**, stated here because it is the whole
change: he asked for the inherited tags to keep showing, and what is built is
that they keep **applying** — the filter finds a row by a tag it inherits while
stating its own, the export prints it, the chart says it. Showing inherited tags
as decoration while the domain said they no longer applied was rejected as a lie
in the UI (ADR 0008).

## What was built

`effectiveTagsOf` climbs to the nearest settled ancestor collecting the chain,
then folds back down — the opposite direction from an override walk, which can
stop at the first statement it meets. Its answer is `readonly TagInForce[]`:
own entries first in the row's stored order, then each ancestor's nearest-first,
each carrying the row that states it. A tag two rows both state is in force once,
from the nearer. Absence still spells "no tag anywhere above this row"; the memo
holds the empties in a second map inside the function.

`TagLabel` becomes `{ own, inherited }` — not a discriminated union, because
`named` and `inherited` stopped being exclusive. `ReferenceSetAdapter` grows
`inheritedEntries` beside the overriding dimensions' `inheritedLabel`; no adapter
passes both, and the `type` kind passes neither. `CardSetField` splits into
`CardServiceField` (unchanged behaviour) and `CardTagsField`.

Readers changed, all of them: `libs/domain/effective-tag.ts`;
`gantt-geometry.ts` (`TagLabel`, `hasTags`), `wbs-table.tsx`
(`effectiveTagLabelOf`, the Tags cell, the filter facet's `tagIds`),
`reference-set-field.tsx`, `plan-cards.tsx`, `gantt-panel.tsx` (`tagWords`),
`plan-export.ts` (`tagCell`). Doc comments only: `tree-search.ts`,
`lib/wbs-api.ts`, be-01's `repository/schema.ts` and `repository/index.ts`, and
both identity corpora.

be-01 has **no behaviour change at all** — it stores and sends the row's own set
and never computed the effective reading. No wire, schema, migration or command
change.

## Two things that look like work and are deliberately not

**The identity corpora keep asserting `tagIds: []`, and it stays true.**
`capacity-migration-identity.test.ts` and `priority-band-identity.test.ts` lift
`tagIds` off sixteen replayed plans from be-01's tree payload, which carries the
row's **stated** set. No replayed row states a tag, so union changes nothing
there. Both files now carry a comment saying that if either ever goes red on a
tag, the fix is **not** to lift effective tags in: the corpora are a
replay-fidelity oracle, an effective assertion would report every future
inheritance-rule change as a fidelity regression, and — because an effective set
is a function of tree shape — would test the walk sixteen times inside a file
about migration identity, leaving a red unable to say which of the two broke.
The trap is that the wrong fix is the easier one and leaves the suite green.

**`MOST_TAGS_ON_ONE_ITEM` (50) is untouched.** `work-item.controller.ts` applies
it to `tagIds` on create and `tagRefs` on patch — the **stated** set on a write —
so union cannot make a legal plan unwritable. What union does make unbounded is a
**reading**: a deep row's effective set grows with its depth. The cell needs to
know nothing (it clips one line whatever it carries), but the facet and the
export now see cells that grow with the tree and neither may assume a short one.

## Failure proof (R5)

Every negative below was injected into the production path and watched failing.
The exact text is repeated in each `Proof:` comment beside the check. Faults
1–16 were watched on 2026-08-29/30 **before** the merge with `origin/main` and
re-run green after it; the browser fault is recorded separately below.

| #   | Fault injected                                                                          | Test that saw it                                                                                            | Failure text                                                                                             |
| --- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | `accumulate`'s `for (const above of carried)` loop deleted (the override this replaces) | `effective-tag.test.ts` `keeps every ancestor's tags when a row states one of its own`                      | `Expected - 2 / Received + 0`, `"risk@parent"` and `"review@parent"` gone from `[ "ready@leaf" ]`        |
| 2   | the same                                                                                | `accumulates every ancestor in the chain, not only the nearest`                                             | `Expected - 2 / Received + 0`, `"q3@parent"` and `"tech-debt@grandparent"` gone from `[ "urgent@leaf" ]` |
| 3   | the `claimed` guard on the inherited half deleted                                       | `a row restating an ancestor's tag states it itself, once`                                                  | `Expected - 0 / Received + 1`, `"risk@parent"` beside `"risk@leaf"`                                      |
| 4   | `push(above)` replaced by `push({ tagId: above.tagId, fromId: statedBy })`              | `names the row each tag came from, so a reader can be told`                                                 | `- "far@far-up" / + "far@near-up"`                                                                       |
| 5   | `accumulate`'s `if (stated.length === 0) return carried;` deleted                       | `resolves a chain of untagged rows once, and hands each of them the same answer`                            | `expect(received).toBe(expected)` — `Received: serializes to the same string`                            |
| 6   | the cycle guard replaced by `seen.size;`                                                | `refuses a parent chain that runs in a circle`                                                              | never came back; killed by the shell's own `timeout` at 40s, exit 143, printing nothing further          |
| 7   | fault 1 again, through the filter's production path                                     | `wbs-table.test.tsx` `keeps a row that inherits a ticked tag while stating tags of its own`                 | `expected [ '010' ] to deeply equal [ '010', '010.1' ]`                                                  |
| 8   | the Tags cell's `inheritedEntries: tagging.inherited` deleted                           | `wbs-table.test.tsx` `keeps an ancestor's tags on a row that has tags of its own`                           | `expected [] to deeply equal [ '↳ Risk', '↳ Review' ]`                                                   |
| 9   | the strip's `inherited.map(…)` emptied                                                  | `reference-set-field.test.tsx` `draws what it carries beside what it states, and only the second removably` | `expected [] to deeply equal [ '↳ Core' ]`                                                               |
| 10  | a `Remove` button added inside the inherited chip                                       | the same                                                                                                    | `expected [ <button …(4)></button>, …(1) ] to have a length of 1 but got 2`                              |
| 11  | the `!ownIds.includes` filter on `inherited` deleted                                    | `drops an inherited member the row has since stated, so it is drawn once`                                   | `expected [ 'Platform', '↳ Platform' ] to deeply equal [ 'Platform' ]`                                   |
| 12  | `tagCell` routed back through `labelCell`                                               | `plan-export.test.ts` `names the source of each tag a row carries`                                          | `expected 'platform; regulatory' to be 'platform; regulatory (inherited from …'`                         |
| 13  | `tagWords` rewritten to the pre-0008 sentence                                           | `gantt-panel.test.tsx` `says what kind of thing the work is, and where an inherited tag came from`          | `expected [ '020 - Sand', …(7) ] to include 'Tags Compliance (inherited from 000 H…'`                    |
| 14  | `CardTagsField`'s inherited span deleted                                                | `plan-cards.test.tsx` `keeps a parent's tags on a card whose row states one of its own`                     | `expected undefined to be '↳ Risk'`                                                                      |
| 15  | the two card spans merged into one `data-card-tags`                                     | the same                                                                                                    | `expected 'Ready ↳ Risk' to be 'Ready'`                                                                  |
| 16  | `tags: row.tags` on the bar replaced by `{ own: [], inherited: [] }`                    | `gantt-geometry.test.ts` `carries a stated and an inherited tag together, each with its source`             | `expected { own: [], inherited: [] } to deeply equal { own: [ 'Ready' ], …(1) }`                         |

Faults 1 and 2 are the same injection: an override walk cannot tell "only the
nearest" from "none at all", so the two cases go red together and both are named
rather than one being claimed as its own injection.

### The layout negative, and why the obvious one is vacuous

The row-height assertions in `e2e/reference-cells.spec.ts` **cannot fail** on the
fault they read as being about. Since `reference-cell-popover` the `<td>` clips
with `overflow: clip`, so pinning `flexWrap: 'wrap'` on the resting strip changes
nothing the row's box can see: the cell absorbs the extra line and every height
assertion stays green. Left there alone, this would have been R5 #19.

The falsifiable claim is the clip itself, and it is asserted directly on the
accumulating cell: a wrapped line has no horizontal overflow, so
`scrollWidth > clientWidth` is exactly the property a wrap destroys. See
"Skipped or unverified" for whether that injection has been watched.

## Commands

All of these ran after the merge with `origin/main` (26 commits, including
`work-item-types` and ADR 0009), serialised behind `bin/with-heavy-lock.sh` on
the one canonical host lock. Some of the browser runs in this session were
invoked with a `WBS_HEAVY_LOCK=…` override on the mistaken belief that a second
lane existed; that variable is **not** read — `heavy-lock-lib.sh` deliberately
takes no path override, because a caller that can choose its own mutex can opt
out of the lock — so every run below took the same lock and none of them ran
beside another heavy command.

| Command                                                       | Result                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------- |
| `bunx nx run-many -t test -p fe-01 be-01 domain`              | **fe-01 1892 passed / be-01 1203 passed / domain 130 passed**        |
| `bunx nx run-many -t lint typecheck -p fe-01 be-01 domain`    | **0 errors**, 1 pre-existing warning (see below)                     |
| `bunx nx format:check --all`                                  | clean                                                                |
| `bunx openspec validate --all --json`                         | **92/92 passed**                                                     |
| `CI=1 E2E_PORT_SHIFT=1105 bunx nx run fe-01:e2e` (whole gate) | **226 passed, 5 failed** — none of the five this change's, see below |

## Skipped or unverified

State them rather than imply them.

- **`E2E_PORT_SHIFT=1100` could not be used, and this is worth recording.** The
  shift moves all three tiers together, so 1100 puts **be-01 on 4200** — which is
  fe-01's own default port, held on this host by a `bun run dev` Vite from the
  main checkout since 22:37 the night before. Playwright refused loudly rather
  than measuring the wrong thing: `http://localhost:4200/health is already used`.
  The browser gate was run on **1105** instead, with all three of its ports
  checked free first. Nothing was killed.
- **One pre-existing lint warning**, untouched by this change: `wbs-table.tsx`
  `React Hook useMemo has unnecessary dependencies: 'ownedServicesByTeam' and
'teamsByPerson'`. The memo lists them deliberately — its own comment says why —
  and the dependency array is not edited here.
- **The whole browser gate was run** — not a filtered one, because this change
  edits `reference-set-field.tsx`, which every reference cell draws
  (`linked-row-hover`'s lesson). **226 passed, 5 failed**, and every
  `reference-cells.spec.ts` case passed, including the two this change rewrote.
  The five are accounted for one by one below; none is claimed as passing.
- **`keyboard.spec.ts`'s two date-typing cases** (2 of the 5) are documented in
  `playwright.config.ts` as environmental on a non-US host: Chrome renders the
  native `<input type="date">` segment order from something neither `locale` nor
  `--lang=en-US` reaches, and the config says to treat the pair as environmental
  until one of them stops typing digits into a native control.
- **`priority-ramp.spec.ts`'s two palette cases** (2 of the 5) failed in the full
  run on `expect(lowest.chroma - low.chroma).toBeGreaterThanOrEqual(0.05)`,
  `Received: 0`, and **pass when the file is run on its own** — re-run in
  isolation on the same shift, both palettes green. An ordering or settling
  artefact of a 234-case run on a loaded machine — the two cells held the same
  legal colour at the moment they were read, which is what a palette that has
  not finished applying looks like. Recorded, not dismissed: a check that passes
  alone and fails in company is a check with a dependency nobody has named.
- **`deps-cell.spec.ts` `picks the add button up off the row it is hovered on, in
both palettes`** (1 of the 5) failed in every run of this session, including in
  isolation. It is **not** this change and **not** environmental: the cause was
  found while this was in flight and fixed elsewhere. `chooseTheme` waited for
  `document.getAnimations().length` to reach 0, which that page never reaches —
  a finished `CSSTransition` is not dropped from the list — so the poll timed out
  at 42 animations that had all already ended. A check that could not pass, in a
  spec this change does not touch: the deps cell has its own markup and shares
  only style _constants_ with `reference-set-field.tsx`, and `git diff
origin/main` shows none of `REFERENCE_SET_STRIP_STYLE`,
  `REFERENCE_SET_ADD_CLASS`, `REFERENCE_SET_CHIP_CLASS`,
  `REFERENCE_SET_EDGE_FADE`, `REFERENCE_SET_REMOVE_CLASS` or
  `REFERENCE_SET_LINE_HEIGHT` changed here — this change only **adds**
  `REFERENCE_SET_INHERITED_CHIP_CLASS`. The fix is on another branch; this one
  carries the failure as explained rather than as excused.
