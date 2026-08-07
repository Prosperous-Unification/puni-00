## Why

Three requests from Dany, 2026-08-06, all about the same surface — the project
picker and the Depends on column:

1. The Depends on cell is a bare text box that takes work item _numbers_. You
   have to know the number, and nothing shows you what the numbers mean. He
   wants a dropdown with search, each line carrying the number **and the name**,
   and several dependencies pickable in one visit.
2. A page refresh forgets which project was open. With one project that costs a
   click; with several it costs the click _and_ the remembering.
3. A project cannot be renamed from the UI at all, although be-01 has accepted
   `PATCH /api/projects/:id { name }` since the domain model landed. Every
   project created through the "New project" button is called "New project"
   forever.

## What Changes

**The Depends on cell becomes a searchable picker**

- From: type numbers blind, Enter, hope.
- To: focusing the cell opens a list of the project's other work items, each
  line `number — name`. Typing filters by number or name. Click a line — or
  Enter on the highlighted one — and the dependency is added _immediately_; the
  list stays open so the next pick is one more click. Typed lists of numbers
  (`010, 020`) still work exactly as before.
- Impact: fe-01 only. Same `addDependency` calls, one per edge, unchanged.

**The chosen project survives a refresh**

- From: `selected` starts null on every load.
- To: the choice is written to localStorage and restored when the list still
  contains it. A stored id the list no longer has is ignored, not an error.
- Impact: fe-01 only.

**A project can be renamed**

- From: no UI. The endpoint exists and nothing calls it.
- To: a Rename button beside the picker swaps it for a text input; Enter or
  blur commits, Escape cancels, and a draft that trims to nothing — or to the
  unchanged name — is a cancel, not a request. The rename is bound to the
  project it was opened for; moving the selection cancels it. be-01's
  `forbidden` on a restricted project is shown, not swallowed, with the draft
  kept.
- Impact: fe-01 plus one `ProjectApi` method over the existing endpoint.

## Non-Goals

- **No new backend behavior.** Every request already exists.
- **No live project-list updates.** A rename shows on other clients' pickers on
  their next load, as the list always has.
- **No cross-device persistence.** localStorage is this browser's memory, like
  the session token beside it.
- **No validity filtering in the picker** beyond the row itself and its existing
  dependencies. be-01 refuses cycles and ancestors with reasons; the UI already
  relays them.
