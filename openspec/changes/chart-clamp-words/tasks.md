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

## 1. The chart says the clamp

- [x] 1.1 `clampWords` in `gantt-panel.tsx`, a line of `barFacts` under
      `parallelWords`: `The team may have 2 at work at once — 3 in parallel not
applied`, wherever `width < maxParallel` and nobody is named. Test: `says the
team’s size is why a parallelism did not apply, at either width` — the
      width-2-of-3 case beside its compressed line, and the width-1-of-3 case
      where it is the only parallelism line the card has.
- [x] 1.2 The three silences, one test: the row that got its width, the row that
      never asked, and the row a named person collapsed. Test: `says nothing
about a clamp where nothing was clamped`, which also asserts the named person's
      own line still prints — so the silence is this line standing aside rather
      than both going quiet.

**No new guard.** Nothing here throws and nothing is defaulted away; the two
tests are ordinary assertions over a string, which is what the lighter contract
of 2026-08-14 asks for on copy. The `width >= maxParallel` arm is a printing
condition, and 1.2 is what proves it can fail.

## 2. The page

- [x] 2.1 `docs/capacity.md`'s "What the sentence does not say" paragraph
      replaced by the line itself, its two silences, and the width-1 case;
      `Where the code is` gains `clampWords`. The page stated this gap as open —
      leaving it would make the page a lie about shipped behaviour.

## 3. The record

- [x] 3.1 `proposal.md`, this file, the delta spec, `verify.md`. **No
      `design.md`** and no citation table: PoC-mode contract, 2026-08-14.
- [x] 3.2 C3's over-bar `{team} ×{n}` P3 answered in `verify.md` — verdict,
      evidence, and what a narrowing would need. No code.
