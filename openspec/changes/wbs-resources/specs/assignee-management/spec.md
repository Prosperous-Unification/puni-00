## ADDED Requirements

### Requirement: A subtree is assigned in one command

`assignSubtree { workItem, step, person | null }` SHALL set the assignee of the given step
on every leaf of the subtree (the item itself when a leaf) to the person, or clear it when
null, as one journal entry whose undo restores exactly the previous assignees. It SHALL
refuse `unknown_step` and `unknown_person` as `setAssignee` does and SHALL NOT read team
labels or claims.

#### Scenario: Review of a subtree goes to one reviewer

- **WHEN** `assignSubtree` names a parent with five leaves, step `Review` and person `kat`
- **THEN** five assignments exist, one journal entry, and undo restores the two assignees
  that existed before

### Requirement: Assignments and claims are read by person

be-01 SHALL offer a project-scoped read, by person, of that person's assignments (work
item, step) and claims (work item, step, run, parent claim), with frozen numbers and ids,
derived from the shared HTTP descriptor so the MCP server offers it. A viewer may read it.

#### Scenario: What does kat hold

- **WHEN** `kat` is assigned `Review` on three leaves and holds a claim on one step
- **THEN** the read lists three assignments and one claim with their ids and numbers

### Requirement: A claim may also assign

`claimWorkItem { assign: true }` SHALL, in the same journal entry, set the claimant as the
assignee of every step it claims; absent or false it SHALL leave assignments untouched.
Undo removes both.

#### Scenario: Claim and assign in one act

- **WHEN** a claim with `assign: true` claims `Plan` and `Impl`
- **THEN** both steps show the claimant as assignee and as holder, and undo clears both
