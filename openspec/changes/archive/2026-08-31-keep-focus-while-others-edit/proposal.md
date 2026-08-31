## Why

Every edit in this table refetches the whole tree, and every cell input carries a
React `key` that includes its own value. So when somebody else edits a row you are
typing in, the value changes, the key changes, React unmounts your input and
mounts a new one — and your focus lands on `<body>`, mid-word, with what you had
typed gone.

That is not a rare collision. It is what happens whenever two people work on the
same row, which is the entire premise of a collaborative planning tool. It was
found in the arrow-key cross review on 2026-08-06 and recorded rather than fixed,
because it is a change to how the table reconciles rather than to how the keys
work.

There is a second edit nobody makes on purpose. Every blur sends a PATCH of
whatever the box holds, so clicking through a row writes every cell it passes —
each one a broadcast and a refetch for everyone else, and one of them capable of
reverting a peer.

## What Changes

**A cell follows the server without being replaced**

- From: `key={value}` on an uncontrolled input. A new value means a new node.
- To: the node is kept and its `value` is assigned. The cell still shows the
  server's truth; it stops losing the caret to do it.
- Impact: fe-01 only. No request, no contract, no server change.

**Typing wins until you leave the cell**

- From: n/a — the remount took the half-typed value with it.
- To: while someone is typing in a cell, an incoming value for that same cell is
  held back. It is applied when they leave, unless they leave having changed it,
  in which case their edit is sent and the refetch settles it.
- Impact: last-writer-wins, unchanged; the difference is that the writer is now
  someone who typed.

**A blur that changed nothing sends nothing**

- From: every blur was a PATCH.
- To: only a value that differs from the one the cell was last showing is sent.

## Non-Goals

- **Merging two people's text in one field.** The later blur wins, as it does now.
- **Showing who else is in a cell.** Presence is per-connection, not per-cell.
- **Controlled inputs.** Every keystroke through React state re-renders the whole
  table; this is the same uncontrolled input it always was, told the truth by hand.
- **The `Depends on` box.** It is a command line, not a cell — it holds no server
  value to fall behind.
