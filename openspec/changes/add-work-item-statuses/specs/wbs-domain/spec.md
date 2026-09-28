## ADDED Requirements

### Requirement: A leaf's status folds its progress, hold, readiness and predecessors

Every leaf SHALL report one `status` of `unknown`, `draft`, `ready`, `in_progress`,
`blocked_by_proxy`, `on_hold`, `blocked` or `done`, folded on every read, first match winning:
its progress fold `done` → `done`; its hold → `on_hold` or `blocked`; its progress fold
`in_progress` → `in_progress`; a predecessor reading `on_hold`, `blocked` or
`blocked_by_proxy` → `blocked_by_proxy`; its readiness → `draft` or `ready`; else `unknown`.
Progress SHALL stay per step node; readiness and hold SHALL be stored once per leaf and never
on a parent; `status` and `blocked_by_proxy` SHALL never be stored. A step node's own status
SHALL remain its progress.

#### Scenario: a hold outranks a running step

- **GIVEN** a leaf whose `Dev` says `in_progress`, holding `hold: 'on_hold'`
- **WHEN** the plan is read
- **THEN** the leaf reports `on_hold`, and `in_progress` again once the hold is cleared

#### Scenario: done outranks a hold

- **GIVEN** a leaf done on every step and holding `hold: 'blocked'`
- **WHEN** the plan is read
- **THEN** the leaf reports `done`

#### Scenario: readiness yields to anything the steps or the graph say

- **GIVEN** a leaf with `readiness: 'ready'`, no progress, and no held or blocked predecessor
- **WHEN** the plan is read
- **THEN** it reports `ready`; with a blocked predecessor it reports `blocked_by_proxy`; with
  `Dev` in progress it reports `in_progress`

#### Scenario: nothing said is unknown

- **GIVEN** a leaf with no progress, readiness, hold or held predecessor
- **WHEN** the plan is read
- **THEN** it reports `unknown`

### Requirement: Blocked by proxy is derived from the full dependency graph

A leaf SHALL read `blocked_by_proxy` when it reads neither `done`, a hold nor `in_progress` and
at least one of its predecessor leaves reads `on_hold`, `blocked` or `blocked_by_proxy`.
Predecessors SHALL come from every legacy and typed dependency, of every relationship type,
expanded to leaves, whether or not the predecessor takes part in the schedule. The reading
SHALL propagate through successive `blocked_by_proxy` leaves and SHALL stop at a leaf reading
`done` or `in_progress`. A leaf-level cycle permitted by an acyclic step-node graph SHALL NOT
prevent the derivation.

#### Scenario: a successor two edges behind a held leaf is blocked by proxy

- **GIVEN** leaves `A → B → C`, A `on_hold`, B and C with nothing said
- **WHEN** the plan is read
- **THEN** B and C both report `blocked_by_proxy`

#### Scenario: running work stops the proxy

- **GIVEN** leaves `A → B → C`, A `blocked`, B's `Dev` `in_progress`, C with nothing said
- **WHEN** the plan is read
- **THEN** B reports `in_progress` and C reports `unknown`

#### Scenario: a parent's dependency blocks every leaf beneath the successor

- **GIVEN** a dependency from leaf A to a parent P with two leaves, A `blocked`
- **WHEN** the plan is read
- **THEN** both leaves under P report `blocked_by_proxy`

### Requirement: A parent folds its children's statuses the same way at every depth

A parent's status SHALL be, in order: `done` when every child reads `done`; `on_hold` when
every child reads `on_hold`; `blocked` when every child reads `blocked`; `in_progress` when
any child reads `done` or `in_progress`; `blocked_by_proxy` when every child reads `on_hold`,
`blocked` or `blocked_by_proxy`; otherwise, over the children reading none of those three,
`unknown` when any reads `unknown`, `draft` when any reads `draft`, else `ready`. A parent with
no children SHALL read `unknown`. Folding a parent's children and folding every leaf beneath
it SHALL give the same status for every partition of the leaves.

#### Scenario: a branch with one held and one ready leaf is ready

- **GIVEN** a parent with one leaf `on_hold` and one `ready`
- **WHEN** the plan is read
- **THEN** the parent reports `ready`

#### Scenario: a branch whose leaves are all stopped is blocked by proxy

- **GIVEN** a parent with one leaf `on_hold` and one `blocked`
- **WHEN** the plan is read
- **THEN** the parent reports `blocked_by_proxy`

#### Scenario: a subset fold agrees with the tree fold

- **GIVEN** any tree and any leaf statuses
- **WHEN** a parent is folded from its children and, separately, from all its leaves
- **THEN** both folds report the same status

### Requirement: An on-hold leaf takes no part in the schedule

Before Fast, the solver request builder or a saved plan's schedule reads the plan, every held
leaf and every ancestor whose leaves are all held SHALL be removed from the schedule input
together with their slices, every legacy and typed dependency touching them, and their
not-before and deadline entries. A held row SHALL report `schedule: null` and `dates: null`; a
parent's bracket SHALL span its unheld leaves and be `null` when it has none. The scheduler
contract version and the solver wire version SHALL NOT change; the canonical schedule input
SHALL change only for plans holding something.

#### Scenario: a successor no longer waits for held work

- **GIVEN** leaves `A → B`, A estimated 5 days and `on_hold`
- **WHEN** the plan is scheduled
- **THEN** B starts on day zero, A reports `schedule: null`, and B reports `blocked_by_proxy`

#### Scenario: a held assignee frees its person

- **GIVEN** leaves A and B on the same person, A first in queue and `on_hold`
- **WHEN** the plan is scheduled
- **THEN** B starts on day zero

#### Scenario: a parent of held leaves leaves the plan with them

- **GIVEN** a parent whose every leaf is `on_hold`, with a deadline and an incoming dependency
- **WHEN** the plan is scheduled
- **THEN** the parent has no slice, no bracket and no dependency in the schedule input, and the
  schedule is computed without error

### Requirement: Blocked work, readiness and blocked by proxy change no schedule

A leaf reading `blocked`, `draft`, `ready` or `blocked_by_proxy` SHALL take part in the
schedule exactly as it would with nothing said: its nodes, dependencies, duration, person
queue, pool slots, floors and deadlines are unchanged, and its bar is where the forecast puts
it.

#### Scenario: the golden corpora stay byte-identical

- **GIVEN** every Fast and solver golden corpus case with any leaves marked `blocked`, `draft`
  or `ready`
- **WHEN** the schedules and canonical inputs are computed
- **THEN** both are byte-identical to the unmarked case

### Requirement: A work item's status is set by one act for every settable status

`setStatus` SHALL act on a leaf, or on every leaf beneath a parent, as one journal entry whose
inverse restores every prior progress statement, readiness, hold and fact date verbatim.
`done` SHALL write today's done statements and clear the hold. `in_progress` SHALL write
`in_progress` on the leaf's first step in step order holding no statement — for a parent, on
its first such leaf in tree order only — fill an empty fact start with `on` or the day of the
act, and clear the hold. `ready` and `draft` SHALL set readiness and clear the hold, and SHALL
be refused `409 readiness_after_progress` when a leaf holds any progress statement. `on_hold`
and `blocked` SHALL set the hold and leave progress, readiness and facts untouched, and SHALL
be refused `409 cannot_hold_done` on a leaf reading `done`. `unknown` SHALL clear progress,
readiness and hold. Any status other than a hold SHALL clear the hold. When nothing would
change, nothing SHALL be written, journalled or announced.

#### Scenario: resuming returns the row to what it was

- **GIVEN** a `ready` leaf put `on_hold`
- **WHEN** `setStatus` sets it `ready`
- **THEN** the hold is cleared and the leaf reports `ready`

#### Scenario: in progress on a parent starts one leaf

- **GIVEN** a parent with three unstarted leaves
- **WHEN** `setStatus` sets it `in_progress` on `2026-10-01`
- **THEN** only the first leaf in tree order gains `in_progress` on its first step and fact start
  `2026-10-01`, and the parent reports `in_progress`

#### Scenario: one undo restores a held branch

- **GIVEN** a parent whose leaves held `ready`, `blocked` and nothing before it was put `on_hold`
- **WHEN** the actor undoes once
- **THEN** each leaf holds exactly the readiness and hold it held before

### Requirement: Structural edits carry readiness and hold with the leaf

Duplicating a leaf SHALL copy its readiness and never its hold. When a leaf gains its first
child, its readiness and hold SHALL move to that child with its progress. When a parent loses
its last child, the parent SHALL take a readiness or hold only when every former leaf agreed
on it, else none.

#### Scenario: a duplicate is not on hold

- **GIVEN** a `ready` leaf that is `on_hold`
- **WHEN** it is duplicated
- **THEN** the copy has readiness `ready` and no hold

### Requirement: The row menu and Status cell offer every status the row does not read

The row menu, on the table and on a card, SHALL open with a status section listing `Set status
to <word>` for each settable status the row does not read and whose write would change
something, in the order Draft, Ready, In progress, On hold, Blocked, Done, Unknown. Done SHALL
keep the completion prompt; In progress SHALL open it asking for `Started on` only. The Status
cell picker SHALL offer the same list. Each status SHALL have its own glyph, word and strip
colour; `blocked_by_proxy` SHALL be drawn muted and never offered. An unrecognised status word
from the API SHALL render the plan's query-failure state, not a blank glyph.

#### Scenario: a held row does not offer its own hold

- **GIVEN** a leaf reading `on_hold`
- **WHEN** its row menu opens
- **THEN** it offers every settable status but `On hold`, and `Draft` or `Ready` only if no step
  has spoken

### Requirement: The Gantt says each status on its bar

An on-hold row SHALL draw no bar and a muted `On hold` word in its row, and no dependency arrow
from it. A blocked row SHALL draw its bar with a blocked outline and `data-blocked`, and its
outgoing arrows in the blocked colour. A blocked-by-proxy row SHALL draw a hatched bar with
`data-blocked-by-proxy`, whose card names the held or blocked predecessor. A done bar SHALL be
unchanged.

#### Scenario: a held leaf draws no bar

- **GIVEN** a leaf `on_hold` with an estimate
- **WHEN** the Gantt renders
- **THEN** the row shows `On hold` and no bar, and its successor's bar is hatched

## REMOVED Requirements

### Requirement: A work item's status is unknown, in progress or done, and is never stored

**Reason**: The vocabulary widens to eight statuses and the fold gains hold, readiness and
predecessors.
**Migration**: Replaced by "A leaf's status folds its progress, hold, readiness and
predecessors" and "A parent folds its children's statuses the same way at every depth".

### Requirement: A work item's status is set to done or unknown as one act

**Reason**: `setStatus` accepts seven statuses.
**Migration**: Replaced by "A work item's status is set by one act for every settable status";
the done and unknown effects are kept and extend to readiness and hold.

### Requirement: The row menu offers the one status change that applies

**Reason**: The menu offers every status the row does not read.
**Migration**: Replaced by "The row menu and Status cell offer every status the row does not
read".
