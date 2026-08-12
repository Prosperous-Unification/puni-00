## REMOVED Requirements

### Requirement: One role's estimates are unfolded at a time

**Reason**: The accordion was a width decision and the width it bought is not
worth what it costs the reader it was for. Comparing two phases' three-point
estimates means holding one of them in your head, because opening the second
takes the first away. Dany's call, 2026-08-08 (U3): horizontal scrolling is
acceptable when a role is unfolded, and the pinned columns are what make it
readable.

**Migration**: None for callers. `unfoldedRoles` was already a list and its one
writer is the only thing that enforced the invariant; it adds and removes now.
Its recorded injected fault — `[...current, roleId]`, watched failing in
`unfolds one role at a time, so the table still fits the window` on 2026-08-08 —
is adopted as the behaviour, and that test is replaced by name rather than
deleted.

## ADDED Requirements

### Requirement: Roles unfold independently, and an unfolded table may scroll

Each role's three estimate points SHALL unfold and fold on their own. Any number
of roles MAY be unfolded at once, and unfolding one SHALL leave every other role
exactly as it was. Which roles are open SHALL remain local to the reader and
SHALL NOT be shared.

With any role unfolded the table MAY be wider than the frame it sits in, and the
**frame** SHALL scroll for it. The page SHALL NOT scroll sideways in any state,
and the pinned handle, number and name SHALL hold the offsets the resolved
layout declares for them once the frame has been scrolled.

With every role folded the table SHALL fit every laptop width the browser gate
measures, unchanged: that is the state a plan is read in, and the guarantee is
not weakened by this change. The folded minimum the Phases dialog quotes SHALL
be the same figure it was.

The keyboard SHALL reach every cell of every open role: Tab SHALL walk them in
document order and the motion chords SHALL cross from one open role's last cell
into the next one's first.

The fold button SHALL say what unfolding now costs — that the table may scroll
sideways — and SHALL NOT promise that any other role folds.

#### Scenario: opening a second role

- **GIVEN** Dev's three points are on screen
- **WHEN** QA is unfolded
- **THEN** both Dev's and QA's three points are on screen

#### Scenario: closing one of two open roles

- **GIVEN** Dev's and QA's three points are both on screen
- **WHEN** QA is folded
- **THEN** Dev's three points are still on screen and QA's are not

#### Scenario: two open roles at a laptop width

- **GIVEN** a plan with two roles, both unfolded, in a 1280px window
- **THEN** the frame scrolls sideways, the page does not, and the handle,
  number and name stand at their declared offsets once it has been scrolled

#### Scenario: every role folded

- **WHEN** a plan with two roles, both folded, is shown in a 1280px window
- **THEN** every column is on screen and nothing scrolls sideways

#### Scenario: walking a row with two roles open

- **GIVEN** Dev's and QA's points are both on screen and the focus is in Dev's
  assignee cell
- **WHEN** Tab is pressed
- **THEN** the focus is in QA's optimistic box
