## MODIFIED Requirements

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
read or write assignments unless `assign: true` is given (`wbs-resources`), in which case it
SHALL set the claimant as the assignee of every step it claims in the same journal entry, and
go through the same calendar preflight as `setAssignee`. It MAY carry `resources` (each at
least the declared units) to hold in place of the leaf's declared demand.

It SHALL refuse with a typed 4xx naming the command's position in the batch at the first of
these that holds, in this order (the order of `definitions.ts`):

- `person_not_bound`: the person is not bound to the caller's account and the caller holds
  neither `admin` nor `super_admin` in the project's organization;
- `credential_not_for_person`: the caller's credential is pinned to a person other than the
  claimant, and the claim is not a delegated claim under a claim of the pinned person;
- `run_mismatch`: the caller is a machine grant with a run (`wbs-mcp-agent-surface` M15), the
  claimant **is** its pinned person, and `runId` names another run;
- `parent_claim_unknown`, `parent_claim_foreign`, `parent_claim_not_ancestor`: the named
  parent claim is absent or released; or it was written by another account; or the caller is
  pinned, its pinned person is on no claim of the parent's chain, and the parent's holder is
  not a `person`-kind person bound to the caller's account; or it does not sit on a strict
  ancestor of the work item;
- `steps_on_subtree`, `resources_on_subtree`: `steps` or `resources` are named on a non-leaf;
- `item_done`: the work item's derived status is `done`;
- `no_steps`: the project defines no steps;
- `not_startable` (leaf only): the derived status is `blocked`, `on_hold` or
  `blocked_by_proxy`; the refusal carries the status read;
- `step_done`: a named step's progress is `done`;
- `already_claimed`: a step it would take holds a claim; the refusal carries each holder's
  person id, name and run id;
- `below_declared_demand`, `below_held_occupancy`, `resources_exhausted`: the occupancy
  refusals of `resource-occupancy` (`wbs-resources`);
- `inside_subtree_claim`: an ancestor holds a subtree claim whose person is not the claimant
  and which is not on the given parent claim's chain; the refusal carries the holder;
- `overlaps_subtree_claim` (non-leaf only): a descendant holds a subtree claim of another
  person that is not a delegated claim of the claimant's chain;
- `claim_limit`, last, carrying `cap` and `current`: the batch would add a bound claim
  (`organization-limits`) and the organization already holds `maxConcurrentClaims` of them,
  counted in the batch's transaction. A claim answering `alreadyHeld: true` is never refused
  by it, and a redo of a claim or an undo of a release re-checks it, answering `stale_undo`
  whose detail begins `claim_limit:`.

Before that order, the command parser SHALL refuse `steps_must_name_a_step` for an empty
`steps` list. When the caller is a machine grant with a run and the claimant is its pinned
person, the claim's `runId` SHALL be that run; for any other claimant, `runId` is taken as
given.

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

#### Scenario: A claim without assign leaves assignments alone

- **WHEN** `claimWorkItem` is applied without `assign`
- **THEN** no assignment row changes

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

#### Scenario: A worker claims under its own delegated claim

- **WHEN** lead agent A, holding a subtree claim, writes a delegated subtree claim for agent B,
  and B, pinned, claims a step under that delegated claim
- **THEN** B's claim is admitted

#### Scenario: Nested delegation

- **WHEN** B, pinned, holds a delegated subtree claim under A's, and pinned agent C claims
  under a delegated claim B wrote for C
- **THEN** C's claim is admitted, because C is on the parent's chain

#### Scenario: A worker claims directly under the lead's claim

- **WHEN** pinned agent B of the same account names lead agent A's subtree claim as its
  `parentClaim`, without a delegated claim of its own
- **THEN** the claim is refused `parent_claim_foreign`

#### Scenario: An opted-in lead writes a worker's delegated claim

- **WHEN** lead A, a grant with run `a`, claims for worker B with B's `runId: 'b'` under A's
  subtree claim
- **THEN** the claim is admitted with run `b`, not refused `run_mismatch`, and B can later
  release it

### Requirement: A release gives steps back and cascades through delegated claims

The command registry SHALL offer `releaseWorkItem`, addressing a work item and a person, with
optional `steps`. On a leaf it SHALL remove that person's claims on the named steps, or on
every step when none is named. On a non-leaf it SHALL remove that person's subtree claim and
every claim that names it as parent, transitively. Progress SHALL NOT change. It SHALL be
one undoable journal entry. It SHALL refuse `not_claimed_by` when the person holds no claim
it would remove, and `person_not_bound` and `credential_not_for_person` under the rules of
`claimWorkItem`. When the caller is a machine grant with a run and the person **is** its pinned
person, it SHALL remove only that person's claims of that run, and SHALL refuse `run_mismatch`
when the person holds claims on the item only under other runs; a release of another person's
claim (a lead releasing a worker's delegated claim) is judged as without a run.

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

#### Scenario: A leaf held under two runs

- **WHEN** person P holds `Impl` under run `a` and `Review` under run `b`, and a grant with run
  `a` releases the leaf for P naming no steps
- **THEN** only the run `a` claim is removed

#### Scenario: Releasing only another run's claims

- **WHEN** P holds claims on the item only under run `b` and a grant with run `a` releases it
  for P
- **THEN** the batch is refused `run_mismatch`
