# Design

## The shape

One component, `CellInput` (`apps/fe-01/src/components/wbs/cell-input.tsx`), and
three refs. The table's name, notes and estimate cells render it instead of a bare
`<input>`.

- `shown` — the value this node is displaying, as far as the component knows.
- `typed` — whether anyone has typed here since `shown` and the node last agreed.
- `latest` — the newest server value, so a blur handler can read it too.

A new `value` prop runs one function, `sync()`:

```
if the node is gone, or latest === shown            -> nothing to do
if typed and this node has the focus                -> hold it back
otherwise: node.value = latest; shown = latest; typed = false
```

`onBlur` clears `typed`, then either sends what differs from `shown` or calls
`sync()` to apply whatever was held back.

## Why not a controlled input

`value` + `onChange` is the textbook answer and it is wrong here for one specific
reason: every keystroke would be React state, and this table renders up to
thirteen inputs per row across a whole breakdown. The existing design is
deliberately uncontrolled — the DOM owns the text, the server owns the truth, and
a blur reconciles them. This change keeps that and fixes the reconciliation, which
is one file rather than a re-architecture of the grid.

## Why `document.activeElement`

The alternative is an `onFocus`/`onBlur` pair setting a ref. That is a second copy
of a fact the DOM already holds, and the two drift the moment a node is moved or a
blur is missed. The question is only ever asked about right now.

## Why `shown` is not advanced on commit

An optimistic `shown = typed value` records a write that has not happened. The
refetch that follows a successful commit carries the value back and moves `shown`
then; a failed request leaves `shown` holding the last thing the server actually
said, which is what the cell has to be corrected from.

## What it costs

A blur that changed nothing no longer writes. That is the intended saving, and it
is also the only behaviour change beyond focus: a client that relied on a PATCH
per blur to prove liveness would stop seeing them. Nothing does.
