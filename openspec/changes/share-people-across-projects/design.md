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

## D3. The memo is keyed on the project revision and the event sequence

`PersonLoad` memoizes each project's bookings per process, keyed by access (the organization, or
legacy) and project, and holding the project row's `revision` and the tree's `seq`. The two
cover different writes:

- `revision` commits with every project-row edit: start date, PERT weights, dependency reach,
  estimate method, estimate rounding and the optimizer settings. A settings PATCH publishes an
  event only for the three optimizer fields, so `seq` alone would miss the rest.
- `seq` advances when a plan edit (a command batch), a directory or capacity change, or a
  `schedule_optimized` result is announced after its commit.

A read takes `revision` from the project list it has just read, and asks `latestSeq`. When both
equal the memo's values, the bookings are reused; otherwise the tree is read again. Readings
whose engine is unavailable are never memoized. The memo is bounded (LRU), and correctness never
depends on it. Blue and green each hold their own memo. Under `shared` (slice 6), the key gains
`basisHash`, the hash of the bookings that fed the project.

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

## D7. Solver wire 3 (slice 5)

**Ruling:** Quantise bookings outward: multiply project workday offsets by the quantum,
round starts down and ends up, clip starts at zero, and omit bookings ending at or before
zero. Union intervals that overlap after rounding for each person; retain adjacency as two
half-open intervals. This is conservative for feasibility: the solver cannot claim a gap
inside time the original booking holds. It may reserve up to one extra quantum at either
end and report quantum infeasibility where fractional Fast placement could fit. The original
holder-bearing workday map stays intact for Fast and optimized publication diagnostics.

Wire 3 requires `elsewhere` even when empty. Solver 0.2.0 reads only wire 3; the retained
0.1.4 wire 2 schema refuses it. `model.py` adds fixed intervals to each person's no-overlap
constraint, spending no project team capacity. The serial horizon starts after the latest
manual floor or booking end and includes all slice durations and positive FF excesses.

Bun checks fixed interval shape and canonical booking equality even for non-publishing
responses, then refuses overlap before materialisation. Materialisation receives the original
workday bookings. Quantised Fast receives the same outward-rounded booking calendar in both
its ordinary placement and serial FF fallback. Request preparation checks arithmetic and
compatibility before baseline arithmetic; each refusal is a typed value. `incompatible-solver`
is recorded as the existing `internal-error` disposition, without a cache vocabulary migration.
Initial, queued and manual Retry admissions all persist refusal and release their slot.

ADR 0025's preparation and binding boundary stays intact. The non-disruptive preparation and
binding tests run in this slice. Live image publication, binding installation and the shared
supervisor restart are deferred by the coordinator until merged integration. Slices 6–8 and
shared-mode activation remain pending; `SCHEDULE_ALGORITHM_ID` stays `slice-leveling-v4`.

## D8. Coherent chain capture (bounded slice 6)

The application owns the influencer closure, displayed-engine selection and booking projection.
A narrow chain snapshot port resolves current organization access, obtains authorized rank order,
and supplies captures and a non-admitting scheduler. SQLite opens a dedicated read-only connection,
holds one `drizzleReadTransaction` through application scheduling and closes on every outcome.
The optimized reader is bound to that connection; recursive `treeWithin` and live optimizer reads
are excluded because they can tear the snapshot or admit solver work.

Only dated projects connect the closure: an undated target receives no bookings, and an undated
project neither supplies bookings nor leads traversal to higher projects. Cyclic or calendar-range
influencers supply no bookings and remain explicit unavailable load evidence; only a required
`engine_unavailable` refuses the target with the influencer identity. Unexpected faults throw.
Pending and failed influencers contribute their displayed Fast schedule; a selected ready variant
contributes its optimized schedule. Bookings move through the absolute workday axis and then into
each target's anchor, retaining fractions and half-open adjacency.

Shared saved capture and current comparison are the narrow exception to saved-plans' scheduling
outside the snapshot: the chain must select upstream schedules coherently before it detaches.
The detached target schedule is historical display; target input alone cannot replay upstream
bookings. Existing saved schedule bytes persist unchanged, with no booking ledger or upstream
history. Durable replay/provenance is outside this slice. Isolated capture retains its existing
outside-snapshot ordering. Solver admission, events, hashes for persistence, quota and serialization
remain outside the read transaction. `SCHEDULE_ALGORITHM_ID` stays `slice-leveling-v4`.

Mode storage, activation, rollback vocabulary, fan-out and UI are still pending in umbrella tasks
6.1/6.2 and slices 7/8; this slice adds the dormant chain capability.

## D9. Storage and downgrade safety before runtime activation

This intermediate release stores `organization.shared_people` as a non-null integer constrained
to 0/1, default 0. Strict adapter reads decode only those two encodings into `isolated`/`shared`;
missing organizations and malformed trusted encodings throw. Encoding support is not runtime
capability: the release advertises `SUPPORTED_CAPACITY_MODES = ['isolated']` exactly until the
runtime, cache and UI work is complete. There is no setter, mode route or activation wiring.

A versioned combined backup contains every organization's id and semantic `isolated`/`shared`
mode, including isolated, and every column of every project-rank row, each array sorted by stable
id. Save owns a dedicated physically read-only connection and captures both sets in one read
transaction, closing on success or throw. It exclusively creates a private backup file; an existing
file is never overwritten. Remove validates the complete file and requires exact equality
with the current complete state under one immediate transaction before resetting all modes to
zero and deleting all ranks. A stale mode, organization added/deleted, changed rank, duplicate
identity, missing state or unreadable/malformed file refuses without partial changes.

Restore validates all saved values against this release's supported modes before mutation, so
any `shared` organization refuses even though the schema encodes it. It then requires every saved
organization to exist, permits additional isolated organizations untouched, requires all current
modes isolated and an empty current rank table; verifies rank ownership and authors; and restores the combined state in one immediate transaction. Partial
organization updates use the operator instant for `updated_at`; rank rows retain every saved
audit field. Late failures roll back audit fields as well as modes and ranks. Existing
rank rollback history and CLI remain intact. `shared-people-rollback-cli.ts save|remove|restore`
is the combined procedure for the new column's guarded downgrade.

The new forward migration is additive. Its down script refuses independently while a shared
organization or any project rank exists, preserving the column and applied-migration ledger.
It names the combined CLI and recovery runbook. The swap registers `capacityModes` and queries
actual stored mode encodings, refusing a missing organization table, malformed state and an incoming release unable to read
stored shared mode both before migration and after the outgoing color stops. An absent old-schema
column explicitly means all organizations are isolated; a present unreadable/malformed column
never does. Only an absent capability CLI under readable source is an older isolated release;
a directory, dangling symlink or missing source refuses. Task 6.1/6.2 stay unchecked: runtime/cache integration, fan-out and activation remain.
