## Why

Dany, 2026-08-06: Tab should indent only with the caret at position zero, like
Backspace now outdents only there; pressed anywhere else in a name, it should
move focus to the next element in the table.

Today Tab indents from anywhere in the Name cell, which means the ordinary
"next field" reflex restructures the breakdown instead. With Backspace already
positional, the rule becomes one sentence: **structure keys fire at position
zero; everywhere else the keys do what they do in any table.**

## What Changes

**Tab at the start indents; Tab anywhere else moves focus**

- From: Tab indents and Shift+Tab outdents from any caret position.
- To: with the caret at position zero and nothing selected, Tab indents and
  Shift+Tab outdents, unchanged. Anywhere else in the text — or with a
  selection — Tab focuses the next editable cell in the table and Shift+Tab
  the previous one, with the target's text selected the way a browser's Tab
  leaves it. At the grid's edge the key is left to the browser.
- Shift+Tab's positional rule is inferred symmetry, not a quoted ask — one
  rule for the pair, matching Backspace.
- Impact: fe-01 only, the Name cell's keydown plus a shared read of the same
  committed-DOM grid the arrow keys already use.

## Non-Goals

- **No new cell order.** "Next" is the arrow-key grid's own order — editable,
  non-readonly cells as the DOM commits them. The Depends picker keeps its
  own keyboard and stays outside the grid.
- **No Tab handling in other cells.** Estimates and notes never had structure
  keys; their Tab remains the browser's.
