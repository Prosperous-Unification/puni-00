<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

A slice is a coherent unit of behavior with a test that proves it, not a
two-minute keystroke. "Add a failing test for X, then make it pass" is ONE
slice.

Any slice that adds a safety check must also name the negative test proving the
check fails when the guarded thing is broken. See AGENTS.md, "Non-vacuous
checks". A check with no negative test is not done.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The state machine and the lit rows, in jsdom

- [x] 1.1 `wbs-table.tsx`: table-level
      `depHover: { rowId, pillId | null } | null` beside `depPicker`, read
      through `live`; the deps wrapper's enter sets `{rowId, pillId: null}`
      (guarded on `waitingFor.length > 0` — codex round 3 finding 5's "no
      render spent for nothing"), its leave clears with the same-cell guard;
      each pill's enter sets its id, its leave restores `pillId: null`
      guarded on its own id; every writer bails out (returns `current`) when
      the value is already there. `<tr>` gains `data-row-id` and
      `data-dep-lit`; the lit set derives per render from the hovered row's
      `dependsOn` (all of it at `pillId: null`, the one pill otherwise),
      never from the hovered row's own id — tests (`wbs-table.test.tsx`,
      watched failing first):
      `lights every dependency's row from the cell, and no other row`,
      `narrows to the pill's row, and widens again when the pill is left`;
      negatives: the lit set derived from `depHover.rowId` → the cell test
      watched failing on `expected ['030'] to deeply equal ['010', '020']`;
      the pill leave's restore dropped (returning `current`) → the pill test
      watched failing on `expected ['010'] to deeply equal ['010', '020']`;
      each restored with a `Proof:` comment

- [x] 1.2 The remount landmine, pinned by its own negative: hover must
      re-render and never remount — `columns` keeps `[roles, unfoldedRoles]`
      and `depHover` is read through `live` alone — test:
      `lights rows without remounting the cells under a half-typed name`,
      which asserts the lit rows first (a hover that wrote nothing cannot
      pass it) and then the focus, node identity and half-typed value;
      negative: `depHover` added to the `columns` memo's dependency list →
      watched failing on `expected <textarea …(5)></textarea> to be
<textarea …(5)></textarea>` — the same-labelled box a different node,
      the cell remounted under the typist

- [x] 1.3 The card: `DependsCard` gains `emphasisedId: string | null`, fed
      from this cell's `depHover.pillId` through `live`; the emphasised
      entry renders `background: var(--grid-dep-lit)` — the row tint by
      token, not bold — and the collapsed case keeps the guarantee: a
      dependency with no shown row lights nothing and is still named by the
      card, which is built from the tree (`dependenciesOf` over `flat`) and
      never from the rows on screen — tests:
      `emphasises the pill's entry in the card as a background, not bold`,
      `a collapsed dependency has no row to light, and the card still names
it` (which first proves the probe live on the un-collapsed branch);
      negatives: `emphasisedId` hardcoded to null → watched failing on
      `expected '' to be 'var(--grid-dep-lit)'`; the card's list narrowed to
      entries with a rendered `<tr>` → watched failing on `Unable to find an
accessible element with the role "tooltip"` — the hidden dependency
      dropped and the cell left with nothing to say

## 2. The tint, in the stylesheet

- [x] 2.1 `styles.css`: `--grid-dep-lit` beside the other grid surfaces (the
      drop tint's ink at a lower dose), and
      `[data-grid] tbody tr[data-dep-lit] { --cell-bg: var(--grid-dep-lit) }`
      after `tr:hover` — the join that reaches the pinned cells' opaque
      inline backgrounds; jsdom cannot see this rule act, which is what
      slice 3 is for

## 3. The browser measurements — CI's `pixels` job

- [x] 3.1 `e2e/hover-cards.spec.ts`, three tests: (a) cell hover paints both
      dependency rows one shared tint — the pinned Name cell's computed
      background, polled through the 100ms cross-fade, banded and unbanded
      row landing on the same colour, dark again on leaving; (b) pill hover
      paints one row, leaves the other at rest, and the card's emphasised
      line carries the lit row's exact computed colour at weight 400, the
      real pointer move off the pill widening the light back; (c) the
      clipped-chip case — seven chips onto 020, the clipped chip proven to
      answer no hit test at its own centre (real area and real clipping
      asserted first, R5 #16), the cell-level hover point found by hit test,
      and the clipped dependency's row lit all the same. Written here;
      **proven by the PR's `pixels` CI job** — this host has no browser, so
      no local run is claimed (R5)

- [x] 3.2 The browser negative, watched red first in CI: the first PR head
      withholds the `tr[data-dep-lit]` rule from `styles.css` — the
      attribute set, the paint unchanged, jsdom green throughout — and the
      `pixels` job is watched failing all three tests above; the following
      commit restores the rule and the job is watched green. Red half
      observed on PR #38, head `ec1580e` (run 31434033908, 2026-08-10):
      `gate pass 2m35s`, `pixels fail 5m51s`, all three dependency-hover
      tests failing by name on the unmoved paint (`Expected: not
"oklab(0.978225 …)"`, `Timeout 10000ms exceeded while waiting on the
predicate`). One pre-existing test failed in the same run on a seed
      race (`verify.md`, "Not verified"). The green half is recorded in
      `verify.md` when the restore head's run lands

## 4. Gate

- [x] 4.1 `bunx nx format:check --all`, the run-many gate
      (`test lint typecheck build`) and
      `bunx @fission-ai/openspec@1.3.0 validate --all --json` green;
      `verify.md` records the commands, their output, and the failure-proof
      table naming every injected fault above and the test that observed it
- [ ] 4.2 Deploy to dev and Dany looks — hover a crowded cell and see the
      plan answer back: the rows it waits for lit in the grid, the card
      agreeing line for line
