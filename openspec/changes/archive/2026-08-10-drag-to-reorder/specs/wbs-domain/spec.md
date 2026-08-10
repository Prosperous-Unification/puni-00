## ADDED Requirements

### Requirement: A work item can be dragged to a new parent or position

fe-01 SHALL let a row be dragged and dropped onto another row, and MUST resolve
the drop into the parent and preceding sibling the move endpoint takes. Dropping
on the top quarter of a target places the row immediately before it among its
siblings; the bottom quarter places it immediately after; the middle places it as
the target's last child.

#### Scenario: a row is dropped into another row

- **WHEN** a root work item is dropped on the middle of another root work item
- **THEN** it is moved to be that work item's last child

#### Scenario: a row is dropped above a sibling

- **WHEN** a work item is dropped on the top quarter of a sibling that follows it
- **THEN** it is placed immediately before that sibling, under the same parent

#### Scenario: a row is dropped below a row in another branch

- **WHEN** a work item is dropped on the bottom quarter of a work item under a different parent
- **THEN** it is moved under that parent, immediately after the target

#### Scenario: dropping into a childless row makes it a parent

- **WHEN** a work item is dropped on the middle of a work item that has no children
- **THEN** it becomes that work item's only child

### Requirement: A drag that the server would refuse is refused before it is sent

fe-01 MUST refuse, without issuing a request, a drop that moves a frozen work
item or that places a work item inside its own subtree, and MUST show the reason.
A drag has no failure a person can see — the row simply returns — so a refusal
that is only discovered by the server is indistinguishable from a bug.

#### Scenario: a frozen row refuses to move

- **WHEN** a work item with a frozen number is dropped anywhere
- **THEN** no request is made and the reason names the freeze

#### Scenario: a row refuses to be dropped inside itself

- **WHEN** a work item is dropped on one of its own descendants
- **THEN** no request is made and the reason names the cycle

#### Scenario: a row refuses to be dropped onto itself

- **WHEN** a work item is dropped on itself
- **THEN** no request is made

### Requirement: A drop that changes nothing sends nothing

fe-01 MUST NOT issue a move when the drop resolves to the position the work item
already holds. Such a request renumbers nothing and yet records an event, pushes
it to every subscribed socket, and makes every other client refetch.

#### Scenario: a row dropped back where it started

- **WHEN** a work item is dropped on the bottom quarter of the sibling directly above it
- **THEN** no request is made and nothing is shown
