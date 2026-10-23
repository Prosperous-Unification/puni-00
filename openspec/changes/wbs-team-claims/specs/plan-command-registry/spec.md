## ADDED Requirements

### Requirement: Steps, leaves and subtrees are claimed as one conditional act

The command registry SHALL offer `claimWorkItem`, addressing a work item by id or ref and a
directory person by id or ref, with optional `steps` (step ids or refs), `runId` (an opaque
string of at most 256 characters) and `parentClaim` (a claim id). On a leaf it SHALL write
one claim row per step: the named steps, or every step whose progress is not `done` when
none is named. On a non-leaf it SHALL write one subtree claim with no step. Every row SHALL
carry the person, the run id and the parent claim given. For each step it claims it SHALL
state the step `in_progress` when its progress is unstated. All of this SHALL happen in the
batch's transaction as one journal entry whose undo removes exactly the rows it wrote and the
progress it stated, with preconditions naming the work item's revision. The claim SHALL NOT
read or write assignments.

It SHALL refuse with a typed 4xx naming the command's position in the batch when any of
these holds, checked in this order:

- `person_not_bound`: the person is not bound to the caller's account and the caller holds
  neither `admin` nor `super_admin` in the project's organization;
- `credential_not_for_person`: the caller's credential is pinned to a person other than the
  claimant, and the claim is not a delegated claim under a claim of the pinned person;
- `parent_claim_unknown`, `parent_claim_foreign`, `parent_claim_not_ancestor`: the named
  parent claim is absent or released, was written by another account, or does not sit on a
  strict ancestor of the work item;
- `item_done`: the work item's derived status is `done`;
- `not_startable` (leaf only): the derived status is `blocked`, `on_hold` or
  `blocked_by_proxy`; the refusal carries the status read;
- `step_done`: a named step's progress is `done`;
- `already_claimed`: a step it would take holds a claim; the refusal carries each holder's
  person id, name and run id;
- `inside_subtree_claim`: an ancestor holds a subtree claim whose person is not the claimant
  and which is not on the given parent claim's chain; the refusal carries the holder;
- `overlaps_subtree_claim` (non-leaf only): a descendant holds a subtree claim of another
  person that is not a delegated claim of the claimant's chain. An ancestor's subtree claim
  is already refused as `inside_subtree_claim` by the previous check.

Before that order, the command parser SHALL refuse `steps_must_name_a_step` for an empty
`steps` list, and the decision SHALL refuse `steps_on_subtree` when `steps` are named on a
non-leaf (for claim and release alike) and `no_steps` when the project defines no steps.

A claim whose every step is already held by the same person and run SHALL succeed, write
nothing and answer `alreadyHeld: true`.

When a leaf that holds step claims gains its first child, the claims SHALL move to that child
with the other step facts (estimates, progress, assignments), so they stay releasable, keep
fencing, and appear in the startable read; undoing the first child SHALL move them back. Moving an existing work item under a leaf that holds step claims SHALL be refused `destination_claimed` carrying the holders, because the moved row is other work and the claims must not change hands.

When `deleteWorkItem` promotes the parent back to a leaf, the claims of the one deleted former
leaf holding any SHALL move to the parent in place (ids, holders, runs, parent claim ids and
occupancy kept) in the delete's journal entry, its undo SHALL move them back to the restored
child and its redo up again. The delete SHALL be refused `children_claimed` carrying every holder
when claims sit on more than one deleted row, or when the parent holds a claim itself.

#### Scenario: A whole leaf is claimed by default

- **WHEN** a batch applies `claimWorkItem` for a leaf whose `Impl` is `done` and whose `Plan`
  and `Review` are estimated, unclaimed and not done, naming no steps (a leaf whose only
  worked step is done reads `done` under the table's fold and is refused `item_done`)
- **THEN** claims exist on `Plan` and `Review` only, both read `in_progress`, the revision
  moves by one, one journal entry exists, and `Impl` is untouched

#### Scenario: Two fleets claim the same step

- **WHEN** two batches from two accounts each apply `claimWorkItem` for the same step,
  concurrently
- **THEN** exactly one succeeds and the other is refused `already_claimed` naming the winner,
  whichever order the write coordinator admits them in

#### Scenario: Two agents hold two steps of one leaf

- **WHEN** agent A holds `Impl` and agent B applies `claimWorkItem` naming `Review`
- **THEN** B's claim is applied and both claims show on the leaf

#### Scenario: A blocked leaf is refused

- **WHEN** `claimWorkItem` addresses a leaf whose status reads `blocked_by_proxy`
- **THEN** the batch is refused `not_startable` with that status and nothing is applied

#### Scenario: An orphan in-progress step is adopted

- **WHEN** a step reads `in_progress`, has no claim and no assignee, and its leaf is not
  blocked or held
- **THEN** `claimWorkItem` naming it is applied and the assignment table is unchanged

#### Scenario: A superagent claims a subtree and a subagent claims a leaf under it

- **WHEN** account F applies `claimWorkItem` on non-leaf `080` for person `claire`, then
  applies `claimWorkItem` on leaf `080.25` for person `claire-worker` with run
  `agent:main:subagent:7f…` and `parentClaim` set to the subtree claim
- **THEN** both claims exist, the leaf claim names its parent, and the startable read shows
  the chain (the subtree claim apart, the leaf claim with its parent claim id)

#### Scenario: A stranger claims inside a claimed subtree

- **WHEN** account G, whose persons hold no claim on `080`, applies `claimWorkItem` on
  `080.25` without a parent claim
- **THEN** the batch is refused `inside_subtree_claim` naming `claire`

#### Scenario: A pinned credential claims as another agent

- **WHEN** a credential pinned to person `claire` applies `claimWorkItem` naming person
  `codex-fleet` and no parent claim
- **THEN** the batch is refused `credential_not_for_person`

#### Scenario: A person nobody bound

- **WHEN** a caller with role `member` names a person bound to no account
- **THEN** the batch is refused `person_not_bound`; the same from an `admin` is applied

#### Scenario: A claimed leaf is split

- **WHEN** `claire` holds `Impl` of leaf `080.25` and a first child is created under it
- **THEN** the claim sits on the child with the same step, `releaseWorkItem` on the child
  succeeds, a stranger's claim on the child is refused `already_claimed`, and the startable
  read lists the child under claimed steps

#### Scenario: The only child of a claimed leaf is deleted

- **WHEN** `claire` holds `Impl` of leaf `080.25`, a first child took the claim and that child is
  deleted
- **THEN** the claim and its occupancy sit on `080.25` again, `releaseWorkItem` on it succeeds,
  and undo and redo of the delete move the claim to the restored child and back

#### Scenario: A deleted branch holds claims on two leaves

- **WHEN** the only child of `080` is a branch whose leaves `080.1.1` and `080.1.2` are claimed
  and `deleteWorkItem` cascades it
- **THEN** the batch is refused `children_claimed` naming both holders and nothing changes

#### Scenario: A row is moved under a claimed leaf

- **WHEN** `claire` holds `Dev` of leaf `090` and `moveWorkItem` places `091` under `090`
- **THEN** the batch is refused `destination_claimed` naming `claire`, nothing moves, and after
  `releaseWorkItem` the same move is applied

#### Scenario: A repeated claim by the holder

- **WHEN** the holder applies the same `claimWorkItem` again
- **THEN** it answers `alreadyHeld: true`, the revision does not move and no entry is added

#### Scenario: Undo of a claim

- **WHEN** the claim's journal entry is undone while the work item's revision is unchanged
- **THEN** exactly the claim rows it wrote are removed and exactly the progress it stated
  is unstated

### Requirement: A release gives steps back and cascades through delegated claims

The command registry SHALL offer `releaseWorkItem`, addressing a work item and a person, with
optional `steps`. On a leaf it SHALL remove that person's claims on the named steps, or on
every step when none is named. On a non-leaf it SHALL remove that person's subtree claim and
every claim that names it as parent, transitively. Progress SHALL NOT change. It SHALL be
one undoable journal entry. It SHALL refuse `not_claimed_by` when the person holds no claim
it would remove, and `person_not_bound` and `credential_not_for_person` under the rules of
`claimWorkItem`.

#### Scenario: A holder releases a half-done leaf

- **WHEN** the holder claims `Impl` (progress `done`) and `Review` (progress `in_progress`)
  and applies `releaseWorkItem` naming no steps
- **THEN** both claim rows are removed and both progress rows stay as they were

#### Scenario: Releasing a subtree takes the delegated claims with it

- **WHEN** `claire` holds a subtree claim on `080` with delegated claims on `080.25` and
  `080.26` by two workers, and `releaseWorkItem` on `080` for `claire` is applied
- **THEN** all three claims are gone in one journal entry and undo restores all three

#### Scenario: Releasing what one does not hold

- **WHEN** `releaseWorkItem` names a person holding no claim on the work item
- **THEN** the batch is refused `not_claimed_by`
