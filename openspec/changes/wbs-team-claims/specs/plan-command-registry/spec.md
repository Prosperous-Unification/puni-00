## ADDED Requirements

### Requirement: A leaf is claimed for an agent as one conditional act

The command registry SHALL offer `claimWorkItem`, addressing a leaf work item by id or ref
and a directory person by id or ref. Applying it SHALL assign that person to every step of
the leaf that has no assignee, in the batch's transaction, recorded as one journal entry
whose undo removes exactly the assignments it wrote and whose preconditions name the leaf's
revision. It SHALL refuse, with a typed 4xx that names the command's position in the batch,
when any of these holds, checked in this order:

- `not_a_leaf`: the work item has children;
- `not_startable`: the leaf's derived status is not `ready`; the refusal carries the status
  read (`unknown`, `draft`, `in_progress`, `blocked_by_proxy`, `on_hold`, `blocked`, `done`);
- `already_claimed`: a step of the leaf is assigned to a person other than the claimant; the
  refusal carries that person's id and name;
- `outside_allotment`: the leaf's effective team set is non-empty and shares no team with
  the claimant's teams;
- `person_not_bound`: the claimant is bound to an account that is not the caller's, and the
  caller holds neither `admin` nor `super_admin` in the project's organization.

A claim whose every step is already assigned to the claimant SHALL succeed, write nothing,
record nothing, and answer `alreadyHeld: true`.

#### Scenario: A ready, unlabelled leaf is claimed

- **WHEN** a batch applies `claimWorkItem` for a leaf whose status reads `ready`, whose steps
  have no assignees and whose effective team set is empty
- **THEN** every step of the leaf is assigned to the claimant, the leaf's revision moves by
  one, one journal entry exists, and the work-item read shows the claimant on every step

#### Scenario: Two fleets claim the same leaf

- **WHEN** two batches from two accounts each apply `claimWorkItem` for the same ready leaf
  naming two different persons, concurrently
- **THEN** exactly one batch succeeds and the other is refused `already_claimed` naming the
  winner, whichever order the write coordinator admits them in

#### Scenario: A leaf nobody has called ready is refused

- **WHEN** `claimWorkItem` addresses a leaf whose status reads `unknown`
- **THEN** the batch is refused `not_startable` with `status: unknown` and nothing is applied

#### Scenario: A leaf of another team's allotment is refused

- **WHEN** the leaf's effective team set is `{Platform}` and the claimant belongs only to
  `Infra`
- **THEN** the batch is refused `outside_allotment`

#### Scenario: A claim on behalf of a bound person from a stranger's account

- **WHEN** the claimant person is bound to account A, the caller is account B with role
  `member`
- **THEN** the batch is refused `person_not_bound`

#### Scenario: An admin claims on behalf of a bound person

- **WHEN** the claimant person is bound to account A and the caller holds `admin`
- **THEN** the claim is applied

#### Scenario: A repeated claim by the holder

- **WHEN** the holder applies `claimWorkItem` again for a leaf whose every step it holds
- **THEN** the command succeeds with `alreadyHeld: true`, the revision does not move and no
  journal entry is added

#### Scenario: Undo of a claim

- **WHEN** the claim's journal entry is undone while the leaf's revision is unchanged
- **THEN** exactly the assignments the claim wrote are removed and no other assignment of
  the leaf changes

### Requirement: A claim is released step by step, keeping done work attributed

The command registry SHALL offer `releaseWorkItem`, addressing a leaf and a person. Applying
it SHALL remove that person's assignments on every step of the leaf whose progress is not
`done`, in the batch's transaction, as one undoable journal entry. It SHALL refuse
`not_claimed_by` when the person holds no step of the leaf, and `person_not_bound` under the
same rule as `claimWorkItem`.

#### Scenario: A holder releases a half-done leaf

- **WHEN** the holder is assigned to `Impl` (done) and `Review` (not done) and applies
  `releaseWorkItem`
- **THEN** the `Review` assignment is removed, the `Impl` assignment remains, and the leaf
  appears in the startable read again only if its status still reads `ready`

#### Scenario: Releasing a leaf one does not hold

- **WHEN** `releaseWorkItem` names a person assigned to no step of the leaf
- **THEN** the batch is refused `not_claimed_by`
