## MODIFIED Requirements

### Requirement: A subtree is assigned in one command

`assignSubtree { workItem, step, person | null }` SHALL set the assignee of the given step
on every leaf of the subtree (the item itself when a leaf) to the person, or clear it when
null, as one journal entry whose undo restores exactly the previous assignees. It SHALL
refuse `unknown_step` and `unknown_person` as `setAssignee` does, SHALL NOT read team
labels, and SHALL NOT refuse because of a claim. Its result SHALL list
`reassignedClaimedSteps`, in tree order: every leaf step whose assignee it changed while
the claim on that very step is held by a person other than the new assignee, as the claims
stand at the command's position in its batch, each with `workItemId`, `stepId`,
`previousPersonId` (null when unassigned) and `holder` (`claimId`, `personId`, `runId`).
A subtree claim or a claim on another step SHALL NOT count, and the list SHALL be empty
when no step qualifies. A redo SHALL NOT list again.

#### Scenario: Review of a subtree goes to one reviewer

- **WHEN** `assignSubtree` names a parent with five leaves, step `Review` and person `kat`
- **THEN** five assignments exist, one journal entry, and undo restores the two assignees
  that existed before

#### Scenario: A claimed step is reassigned away from its holder

- **WHEN** `claire` holds claim `c1` under run `run-b` on leaf `B`'s `Review`, which has no
  assignee, and `assignSubtree` names `B`'s parent, step `Review` and person `kat`
- **THEN** the command is applied, `B`'s `Review` is assigned to `kat`, and the result lists
  `reassignedClaimedSteps` with one entry: `B`, `Review`, `previousPersonId: null`,
  `holder: { claimId: 'c1', personId: 'claire', runId: 'run-b' }`

#### Scenario: A claimed step assigned to its own holder is not listed

- **WHEN** `claire` holds a claim on leaf `B`'s `Review` and `assignSubtree` names `B`'s
  parent, step `Review` and person `claire`
- **THEN** the command is applied and `reassignedClaimedSteps` is empty

#### Scenario: Clearing a claimed step held by its assignee

- **WHEN** `claire` is the assignee and holder of `B`'s `Review` and `assignSubtree` names
  `B`, step `Review` and null
- **THEN** the result lists `B`'s `Review` with `previousPersonId: 'claire'` and `claire`'s
  claim as holder

#### Scenario: An unchanged assignee is not listed

- **WHEN** `B`'s `Review` has no assignee and is claimed by `claire`, and `assignSubtree`
  names `B`, step `Review` and null
- **THEN** `reassignedClaimedSteps` is empty

#### Scenario: Only a claim on the assigned step counts

- **WHEN** `claire` holds a subtree claim on non-leaf `D` and a claim on leaf `A`'s `Dev`
  besides her claim on `B`'s `Review`, and `assignSubtree` names the parent of `A`, `B`
  and `D`, step `Review` and person `kat`
- **THEN** `reassignedClaimedSteps` lists `B`'s `Review` alone

#### Scenario: Undo of a reported reassignment

- **WHEN** the reassignment that listed `B`'s `Review` is undone
- **THEN** `B`'s `Review` has no assignee again and `claire` still holds her claim
