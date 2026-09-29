# Design — share-people-across-projects

Source: the Fable design memo for WBS 010.4.16 (2026-09-29). The alternatives it considered
and rejected are recorded in ADR 0034.

## D1. People are shared; team pools stay per project

A person is one human. How many of a team may work at once remains a (project, team) fact
(`docs/capacity.md`). Assignment keeps its shape: `assignment(work_item_id, step_id) →
person_id`, in any number of projects. Assigning someone who is booked elsewhere is allowed,
and the schedule moves.

## D2. Bookings are derived from the displayed engine

A project's bookings are its displayed schedule's slices that carry a person. The displayed
schedule is optimized when ready, and Fast otherwise (while pending or failed). A booking's
interval is placed on one absolute axis: `workdayOrdinalOf(startDate) + offset`, where the
ordinal counts workdays from a fixed Monday and is closed-form, so any date maps. Dates are read
back with the plan's own `firstWorkdayOf` and `lastWorkdayOf`, so a load bar and the plan's row
never disagree. Undated projects and plans with a schedule error book nothing.

## D3. The memo is keyed on the event sequence

`PersonLoad` memoizes each project's bookings per process, keyed by access (the organization, or
legacy) and project, and holding the tree's `seq`. A read first asks `latestSeq`. When it
equals the memo's `seq`, the bookings are reused; otherwise the tree is read again. Every write
that can move a date publishes a project event, which advances `seq`: commands, directory
changes, capacity, settings, and `schedule_optimized` when a solve lands. The memo is bounded
(LRU), and correctness never depends on it. Blue and green each hold their own memo. Under
`shared` (slice 6) the key gains `basisHash`, the hash of the bookings that fed the project.

## D4. The leak rule

Projects come only from `ProjectService.listWithin`, the predicate the project routes use. Trees
come through `WorkItemService.treeWithin`, which refuses a foreign project and fails closed on
crossing rows. The person comes from `DirectoryService.listWithin('people')`. A project outside
the list is never read, so it cannot appear in a booking, an overlap or a count. Restricted
projects are readable, because restriction gates writes (CONTEXT "Restricted project").

## D5. Overlaps

Overlaps are found by a sweep over one person's bookings sorted by start. Ends are processed
before starts at the same instant, so touching bookings do not overlap. The sweep emits the
maximal intervals where at least two bookings are active. The weekly figures are measures, over
each Monday-to-Friday week clipped to the window, of the union of bookings (`booked`) and of the
overlaps (`overlapping`).

## D6. Later slices

Rank storage and routes (slice 3), the `elsewhere` floor and hash (4), wire 3 (5), the chain,
mode, guard and fan-out (6), fe-01 (2, 7) and the mode route (8) follow the memo's §2–§6 and
§8 without change. `SCHEDULER_CONTRACT_VERSION` stays 14 until slice 4.
