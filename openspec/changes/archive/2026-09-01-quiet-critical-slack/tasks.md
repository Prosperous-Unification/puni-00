<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The tag is measured before it is changed

- [x] 1.1 `e2e/measure-ink.ts` holds the OKLCh-through-a-canvas measurement
      `priority-ramp.spec.ts` invented, so a second spec can make a claim about a
      colour without a second copy of Ottosson's matrices. It grows a `surface`
      alongside the `contrast` it was already compositing, because a tag whose
      _ground_ carries the hue is still a red tag however grey its lettering is.
      `priority-ramp.spec.ts` imports it and keeps its own assertions unchanged —
      watched still passing, both palettes.
- [x] 1.2 `e2e/slack-cell.spec.ts` seeds one critical row and one row with slack
      — two independent roots, `5/5/5` against `1/1/1`, which is the smallest plan
      that puts a tag and a figure on screen together — and measures both in both
      palettes. Watched failing on `main`'s stylesheet, which is this change's
      whole negative: `the critical tag's ink carries a hue · Expected: < 0.09 ·
Received: 0.23866607416984745` light, `0.18922641250344935` dark.

## 2. The tag goes quiet

- [x] 2.1 `styles.css`'s `[data-grid] [data-float][data-critical]` takes
      `--muted-foreground` for its ink and a 16% tint of the same grey for its
      ground. Watched green in both palettes, and watched failing under each of
      the three faults the spec's `Proof:` comments name — the red ink back
      (0.2387/0.1892), the red ground back with the grey ink kept
      (0.026692/0.024839), and a _different_ grey for the ink (0.6525 against the
      column's 0.5542).

## 3. The check that could not fail

- [x] 3.1 `still a tag` compared the tag's ground against the **other** row's,
      and rows alternate a band — so the two differed by the stripe whether the
      tag painted a ground or not. Watched: `background` deleted from the rule
      entirely, both palettes **passed**. It is measured against the Start
      figure on the tag's **own** row now (`groundBesideIt`), and the same
      deletion was then watched failing on `Expected: > 0.01 · Received: 0`.
      The tint gap moved to the same-row ground for the same reason.

## 4. Gate

- [x] 4.1 The whole browser suite, not the two new cases: this edits a rule in
      the shared stylesheet, and `linked-row-hover` is the day a scoped run
      called that green. Results in `verify.md`.
