<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

A folded step cell prints a trio and the figure the estimate method makes of
it — `2/3/8 · 3.7`. On a leaf the trio sits in a box that takes the cell's
slack (`flex: 1`), so the figure stands at the cell's right edge. On a parent
the rolled-up trio was a bare text node, so its figure hugged the trio's last
character instead. One column, two places for the same figure.

Dany, 2026-08-30: _"i like how new estimations look … can you please make it
so that parents items are aligned with child items on where the number of
result days stands after applying the combinator"_ — with a screenshot of
`3/5/7 · 5` on a parent standing 36px left of the `· 2` on its children.

## What Changes

The folded parent's at-rest trio takes the width rule the leaf's box already
has, so the figure — and the assignee after it — land in the leaves' slot.

## Non-goals

- The unfolded cell (`4.8 · VA`) keeps its compact reading; nothing moves there.
- No change to what any cell says — only to where the figure stands.

## Constraints

- jsdom computes no layout; the oracle is Chromium (R5 #14/#15).
