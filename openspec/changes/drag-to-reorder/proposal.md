## Why

The only way to restructure a breakdown is Tab and Shift+Tab, which move a row
one level in or out of the branch it is already in. Moving `030` under `010`, or
lifting a buried task to the top, means deleting and retyping it — and retyping
loses its estimates and its identity, which the numbering and any ticket that
quotes it depend on.

Every other outline tool in the world is dragged. A planner who has just typed a
hundred rows and realised the second phase belongs inside the first has no way to
say so.

## What Changes

**Rows can be dragged**

- From: keyboard indent and outdent only.
- To: pick up a row by its handle and drop it above another row, below it, or
  into it as its last child. The drop zone is read from where in the target row
  the pointer is: the top quarter is above, the bottom quarter is below, the half
  in between is into.
- Impact: fe-01 only. It calls `POST /api/work-items/:id/move`, which already
  exists and already carries every rule that matters.

**A refused drag says why, before it is sent**

- From: nothing to refuse.
- To: a drop that would move a frozen row, or move a row inside its own subtree,
  is refused in the client with the reason on screen. be-01 refuses both anyway —
  this is a second statement of its rules, and it exists because a drag that
  looks accepted and then silently snaps back is worse than one that never
  started.
- Impact: the client's copy of those rules is tested against the same cases the
  server's is.

**A drop that changes nothing sends nothing**

- From: n/a.
- To: dropping a row back where it already was is not a request. It would
  otherwise renumber nothing, broadcast to everyone, and make every other client
  refetch.

## Non-Goals

- **Touch and pen.** This uses the browser's own drag events, which fire for a
  mouse and not for a finger. The tool is used on a desktop behind a password;
  a touch story is its own change, and the keyboard path still works everywhere.
- **Multi-select drag.** One row and its subtree at a time.
- **Dragging between projects.** The table shows one project.
- **Reordering by dragging a column, or any other axis.** Rows only.
