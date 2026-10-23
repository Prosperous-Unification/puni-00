## MODIFIED Requirements

### Requirement: Steps, leaves and subtrees are claimed as one conditional act

After every refusal of the order above, and after the occupancy refusals of
`resource-occupancy`, `claimWorkItem` SHALL refuse `claim_limit` carrying `cap` and
`current` when the batch would add a bound claim (`organization-limits`) and the project's
organization already holds `maxConcurrentClaims` of them; the count SHALL be read in the
batch's transaction. A claim answering `alreadyHeld: true` SHALL never be refused by it. A
redo of a claim and an undo of a release SHALL re-check it and answer `stale_undo` whose
detail begins `claim_limit:` when refused. `releaseWorkItem` SHALL never consult it.

#### Scenario: The cap is the last reason

- **WHEN** a batch claims a leaf inside another person's subtree claim while the
  organization holds its cap of bound claims
- **THEN** the batch is refused `inside_subtree_claim`, and after that holder releases the
  subtree the same batch is refused `claim_limit`

#### Scenario: A redo at the cap

- **WHEN** a claim's journal entry was undone, another agent then took the last bound claim
  of the cap, and the entry is redone
- **THEN** the redo is refused `stale_undo` with detail beginning `claim_limit:` and nothing
  is written
