## ADDED Requirements

### Requirement: A work item carries a priority, and the leveller places by it

A work item's **priority** SHALL be an integer of 1 or more, where a smaller
number is more important and no number is too large. A work item MAY carry
none, which is a state of its own and not a large number.

Priority SHALL decide the order the resource leveller places slices in: where
two slices are both eligible, the one whose work item has the smaller priority
is placed first. A slice whose work item has no priority SHALL be placed after
every slice that has one, whatever its number. Slices that tie on priority —
including two that both have none — SHALL be ordered by the rule that ordered
every slice before priority existed: the critical path's start, then the least
float, then the work item's number, then the role order.

#### Scenario: two work items on one person start in priority order

- **WHEN** two work items are assigned to the same person, can both start on day
  zero, and the one the plan reads second is given priority 1 while the other is
  given priority 2
- **THEN** the priority-1 work item starts on day zero and the priority-2 work
  item waits for the person to finish it

#### Scenario: a set priority outranks an unset one

- **WHEN** two work items compete for one person and only the one the plan reads
  second carries a priority
- **THEN** the one carrying it goes first, and the one without waits

#### Scenario: priority decides a tie the float rule would have decided

- **WHEN** two slices competing for one person differ in float, and the slacker
  of the two is given the smaller priority
- **THEN** the slacker slice is placed first: priority is asked before float

#### Scenario: float still breaks a tie between equal priorities

- **WHEN** two slices competing for one person carry the same priority and
  differ in float
- **THEN** the one with less float is placed first

### Requirement: Priority never overrides a hard constraint

Priority SHALL order the placement and nothing else. A work item's dependencies,
its `startNoEarlierThan` floor and its work item's earlier roles SHALL bind
exactly as they do without it: a work item with the smallest priority in the
plan still starts no earlier than the latest of its floors. Priority SHALL NOT
change the critical-path pass, and so SHALL NOT change any work item's `float`
or `critical`.

A plan in which no work item carries a priority SHALL be scheduled identically
to one computed before priority existed — every field of every slice and every
projection.

#### Scenario: a priority-1 work item still waits for its predecessor

- **WHEN** the work item with the plan's smallest priority depends on another
  work item
- **THEN** it starts when that predecessor finishes, bound by `predecessor`

#### Scenario: a priority-1 work item still respects its floor

- **WHEN** the work item with the plan's smallest priority is told not to start
  before a day, and nothing else holds it
- **THEN** it starts on that day, bound by `notBefore`

#### Scenario: a plan with no priorities is unchanged

- **WHEN** a plan with contention for people, dependencies, floors and split
  slices is scheduled and no work item carries a priority
- **THEN** every slice and every projection matches the schedule computed with
  the priority comparison taken out

### Requirement: A priority on a parent reaches its leaves, most specific first

A priority written on a work item with children SHALL apply to every leaf
beneath it. Where more than one priority applies to a leaf, the **most specific**
SHALL win: the leaf's own beats every ancestor's, and a nearer ancestor's beats
a further one's. This is deliberately not the floor rule — a floor takes the
latest of those that apply, because a floor is a hard constraint and the
strictest must hold, where a priority is a statement of intent and the one
written closest to the work is the one that meant it.

#### Scenario: a parent's priority reaches a leaf that has none

- **WHEN** a parent carries a priority and its leaf child carries none
- **THEN** the leaf is placed with the parent's priority

#### Scenario: a leaf's own priority beats its parent's

- **WHEN** a parent carries a priority and its leaf child carries a different
  one
- **THEN** the leaf is placed with its own, whether its own is smaller or larger

#### Scenario: the nearer ancestor wins

- **WHEN** a grandparent and a parent each carry a priority and the leaf beneath
  them carries none
- **THEN** the leaf is placed with the parent's

### Requirement: A priority that is not a whole number of 1 or more is refused

The write path SHALL refuse a priority that is not an integer of at least 1:
zero, a negative number, a fraction and a value that is not a number are all
refused with a 400 and nothing is written. `null` SHALL clear the priority and
is not a refusal. Omitting the field SHALL leave whatever the work item holds.

#### Scenario: zero, a negative and a fraction are refused

- **WHEN** a work item is patched with a priority of `0`, of `-1` or of `1.5`
- **THEN** each request is refused, and the work item's stored priority is
  unchanged

#### Scenario: null clears the priority

- **WHEN** a work item carrying a priority is patched with `null`
- **THEN** it carries none, and is placed after every work item that does

### Requirement: The plan shows a priority where one is set, and nothing where none is

The table SHALL hold one narrow numeric column for priority, editable in place
with the same keyboard as every other cell. A work item with no priority SHALL
render an empty cell — no placeholder. The Gantt hover card SHALL state the
priority of the work item a bar belongs to only where one is set.

#### Scenario: an empty cell for a work item with no priority

- **WHEN** a plan in which nothing carries a priority is rendered
- **THEN** every priority cell is empty

#### Scenario: the hover card states a priority only when set

- **WHEN** a bar is hovered whose work item carries priority 2
- **THEN** the card says so, and a bar whose work item carries none says nothing
  about priority
