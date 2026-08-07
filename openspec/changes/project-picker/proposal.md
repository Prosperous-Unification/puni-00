# The project picker searches, and remembers what you opened last

## Why

Dany, 2026-08-06: "project list must be a dropdown with search, project names
sorted by most recently accessed by the user."

Today it is a native `<select>` in the order be-01 stores projects — newest
created first, the same for everybody. That order answers a question nobody
asks. The project you want is almost always one of the two or three you have
been in this week, and with twenty projects the one you want is somewhere in an
unsorted list you cannot type into.

The Depends on cell solved the same problem three weeks of work ago: a
combobox that filters as you type, with the keyboard driving it. This change
gives the project picker the same shape, and gives be-01 the one fact it is
missing — when each account last opened each project.

## What Changes

**be-01 records, per account, when a project was last opened**

- New `project_access` table: one row per account and project, holding the
  moment that account last opened it. Additive; no existing row changes.
- New route `POST /api/projects/:id/opened` — the client says "I am in this
  one now". Answers 404 for a project that is not there, 401 unauthenticated.
  Any account that may read a project may record having opened it: reading is
  already open to every account, so gating this on write access would leave a
  reader's own history permanently empty.
- `GET /api/projects` now answers **in each caller's own order** — most
  recently opened first, then everything never opened, newest created first —
  and each project carries the caller's `lastOpenedAt`, or null.

**fe-01's picker is a searchable combobox**

- Typing filters by name, case-insensitively. Enter takes the highlighted
  project, arrows move the highlight, Escape closes, and clicking picks —
  the Depends on picker's pattern and its ARIA roles.
- The order on screen is the order be-01 sent. The client does not re-sort:
  the ordering rule lives in one place, and a second copy would eventually
  disagree with the first.
- Opening a project records it — including the project restored from
  localStorage on load, because that is a project being opened.

## Non-Goals

- **No "recent" section separate from the list.** One list, one order.
- **No per-project pinning or favourites.** Recency is what was asked for, and
  a pin is a different feature with its own storage.
- **No fuzzy matching.** Substring, like the Depends on picker — same rule in
  both pickers beats two subtly different ones.
- **No access history beyond the last moment.** One timestamp per pair, not a
  log: nothing in the ask needs "how often" or "when before that".
