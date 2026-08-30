<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The slot

- [x] 1.1 The folded parent's at-rest trio wrapped in the leaf box's own width
      rule (`flex: 1, minWidth: 0`), clipped the way the box scrolls, so the
      figure and assignee after it land in the leaves' slot; the unfolded
      branch left bare — test: `e2e/layout.spec.ts` `stands a parent's figure
in the same slot as its leaves'`, measuring the figure's x on a parent
      and a leaf; negative: the span unwrapped back to a bare text node,
      watched failing on `Expected: 864.53125 / Received: 827.921875` (36.6px
      apart), Chromium, 2026-08-30.

## 2. The trio

- [x] 2.1 The rolled-up trio given the leaf `<input>`'s own box metrics —
      `box-sizing: border-box`, `padding: 2px`, a transparent `2px` border —
      so a parent's first digit starts where its leaves' does. Dany,
      2026-08-30: _"make sure that the o/r/p 's always align vertically, no
      matter is it parent item or child item"_ — test: the same browser case,
      comparing the two boxes' computed metrics and their x; negative: the
      metrics taken back off, watched failing on `borderLeftWidth: "2px" /
"0px"` and `paddingLeft: "2px" / "0px"` together. The `2px` is the
      `<input>`'s user-agent default and **not** the `<textarea>`'s `1px`:
      written at 1px first, watched failing on `"2px" / "1px"`, which is how
      the figure was learned rather than guessed.
