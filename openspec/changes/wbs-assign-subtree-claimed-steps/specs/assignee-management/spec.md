## MODIFIED Requirements

### Requirement: A subtree is assigned in one command

`assignSubtree { workItem, step, person | null }` SHALL set the assignee of the given step
on every leaf of the subtree (the item itself when a leaf) to the person, or clear it when
null, as one journal entry whose undo restores exactly the previous assignees. It SHALL
refuse `unknown_step` and `unknown_person` as `setAssignee` does, SHALL NOT read team
labels, and SHALL NOT refuse because of a claim. Its result SHALL list
`reassignedClaimedSteps`: every leaf step whose assignee it changed while a step claim on
that step is held by a person other than the new assignee, each with `workItemId`,
`stepId`, `previousPersonId` (null when unassigned) and `holderPersonIds` (the distinct
holders), in leaf order; the list SHALL be empty when no such step exists.

#### Scenario: Review of a subtree goes to one reviewer

- **WHEN** `assignSubtree` names a parent with five leaves, step `Review` and person `kat`
- **THEN** five assignments exist, one journal entry, and undo restores the two assignees
  that existed before

#### Scenario: A claimed step is reassigned away from its holder

- **WHEN** `claire` holds a claim on leaf `B`'s `Review`, which has no assignee, and
  `assignSubtree` names `B`'s parent, step `Review` and person `kat`
- **THEN** the command is applied, `B`'s `Review` is assigned to `kat`, and the result lists
  `reassignedClaimedSteps` with one entry: `B`, `Review`, `previousPersonId: null`,
  `holderPersonIds: ['claire']`

#### Scenario: A claimed step assigned to its own holder is not listed

- **WHEN** `claire` holds a claim on leaf `B`'s `Review` and `assignSubtree` names `B`'s
  parent, step `Review` and person `claire`
- **THEN** the command is applied and `reassignedClaimedSteps` is empty

#### Scenario: Undo of a reported reassignment

- **WHEN** the reassignment that listed `B`'s `Review` is undone
- **THEN** `B`'s `Review` has no assignee again and `claire` still holds her claim
