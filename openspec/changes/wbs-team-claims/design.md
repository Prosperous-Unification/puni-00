## Context

The coordination problem this change answers was written down on 2026-10-19 as a note for
Claire's fleet: ownership is signalled by a `task-*` branch prefix, both fleets commit as one
GitHub account, the pre-start check is three shell commands, Claire reads the WBS store
read-only over SSH and cannot write a claim, and "a WBS item note with no recent entry does
not mean nobody is working on it". Two cases prove the plan and the tree disagree.

Everything that note needs already has a home in the WBS model, except three pieces:

| Need                            | Exists today                                                                        | Missing                                          |
| ------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| A fleet                         | `service_team`; its members are `person` rows of kind `agent` through `person_team` | nothing                                          |
| A fleet's part of the tree      | `work_item_team`, inherited most-specific-first (`effectiveTeamsOf`)                | a name for it: **Allotment**                     |
| How many agents a fleet runs    | `project_team_capacity`, which the schedule spends                                  | nothing                                          |
| Who occupies a step right now   | nothing; `assignment` is the human plan of who does what                            | an atomic, conditional record: **Claim**         |
| Is it free, unblocked, not done | `statusOf`, `blockedByProxyOf`, the hold and readiness columns, `step_progress`     | one read filtered by team: **Startable**         |
| Branch and PR of the work       | `work_item_external_ref` with system `github-pr`                                    | a `github-branch` system row (directory)         |
| Progress back into the plan     | `setProgress`, `setStatus`, Navigator's receipt-to-commands                         | nothing                                          |
| A fleet that writes as itself   | `external_identity` maps several credentials to one account; `person.kind = agent`  | a credential linked to a human's account, pinned |
| Superagent over subagents       | nothing                                                                             | a claim naming its parent: **Delegated claim**   |
| Expiry of a dead holder's claim | nothing, deliberately                                                               | stays with Twilight Dash (A25)                   |

Measured on the dev store on 2026-10-19 (read-only, `bun:sqlite`): the project holds 211
work items, 0 assignments, 0 team labels, 2 external refs, 6 leaves stated `ready`, 6 held
`blocked`, 198 with nothing stated, and 42 step-progress rows `in_progress` that no
assignment accounts for. The claims of two fleets exist only in notes.

One more finding from the same reading: Claire's note addresses items by **derived** numbers
(`60.250`, `2.40.20`) while the WBS notes and the export use **frozen** numbers (`080.25`,
`010.5.4`). The two disagree today. Every surface this change adds answers with the work
item id and the frozen number, and fleets address items by id.

How the three harnesses in use identify their agents, read on 2026-10-19: OpenClaw has a
configured `agentId` and gives each `sessions_spawn` child a session key
`agent:<agentId>:subagent:<uuid>`; Claire's engine already requires that key as a minion run
id. Codex names custom agents in config and gives each spawn a task name and thread. Claude
Code names agent types and has a session id the subagent cannot reliably read from its
shell. In all three the parent knows the child's id and the child often does not, so the
superagent is the party that can record who its subagents are.

## Goals / Non-Goals

**Goals:**

- A fleet claims a step, a leaf or a subtree with one command that cannot succeed twice for
  two holders.
- A superagent claims a subtree, and its subagents claim leaves under it as delegated claims the
  plan can show as a chain.
- A fleet finds what it may start with one read that uses the same status fold as the table.
- Each fleet writes under its own credential, linked to the human behind it, so the audit
  names account, credential, agent person and run, not a branch prefix.
- The branch prefix becomes a derived convention that a later Burokrat rule checks against
  the plan.

**Non-Goals:**

- Anything with a clock: lease expiry, heartbeats, reclamation, preemption. Twilight Dash
  owns runtime occupancy (`docs/twilight-structure/client-repositories.md`, storage
  ownership table; the 2026-10-17 resource-claim design §0 and §3).
- Resources other than people. Teams keep meaning what `docs/capacity.md` says.
- Changing `setAssignee` or what an assignment means. Dany's 2026-08-06 rule stands: a team
  labels the work, a person does it, the two need not match.
- The two kinds of blocked (by a human decision, by an unfinished dependency) Dany wants
  later. Both refuse a claim today.

## Decisions

Confirmed with Dany in the design interview on 2026-10-19 unless marked **assumed**.

**D1. A claim is its own record, beside the assignment, and both work for humans and
agents.** The assignment is the plan of who does the work; the claim is who occupies it now
so nobody else picks it up. Today assignments are expected to name mostly humans and claims
mostly agents; the model does not enforce that. One table `claim` (id, work item, step or
null, person, run id or null, parent claim or null, audit columns). At most one claim per
(work item, step) and one subtree claim per work item. The claim neither reads nor writes
assignments (**assumed**: a claim on a step assigned to someone else is accepted and shown
side by side; the startable read shows both).

**D2. Claims are per step; claiming the whole leaf is the default spelling.** Steps will
become a DAG, so two agents may legitimately hold two steps of one leaf. `claimWorkItem`
without `steps` claims every step of the leaf that is not done; with `steps` it claims
exactly those. All-or-none: if any step it would take is held by another claim the batch is
refused naming the holders. Release is per step with the same default; it leaves progress
as it is.

**D3. A claim needs an unblocked, unfinished, unclaimed step and starts it.** Refused when
the leaf's derived status is `blocked`, `on_hold` or `blocked_by_proxy` (a blocker is to be
resolved, not worked around), when the step's progress is `done`, or when a claim already
holds the step. Any other status, including `unknown` and `draft`, is claimable, so the 42
orphan in-progress steps can be adopted. Applying a claim states the step `in_progress` when
it is not already; releasing does not undo that. **Assumed**: `draft` passes because Dany
said "any status besides blocked/held"; flagged because `draft` was invented to mean "not
yet". A subtree claim is refused only on a `done` item.

**D4. The allotment is advisory.** No command refuses on team labels. The startable read
filters by team; the fence between fleets is the claim itself, and the only check with
teeth is the one on subtree claims (D7).

**D5. A person acts through an account, and a claim records person and run.** One nullable
column `person.account_id` (FK `users.id`) read as "this account may act as this person";
one account may have many agent persons. `claimWorkItem` and `releaseWorkItem` refuse
`person_not_bound` unless the person is bound to the caller's account or the caller holds
`admin` or `super_admin` in the project's organization (**assumed**: no unbound persons are
open, humans bind their own person once). The claim carries an optional `runId`, an opaque
string the harness formats (an OpenClaw session key, a Codex thread, a Claude session id),
so the audit reads account, credential, person, run.

**D6. Double identity: the account is the human's, the credential is the fleet's.** No new
auth concept and no `client_credentials` grant in mcp-01. A be-01 CLI links a verified
`(issuer, subject)`, such as an Auth0 machine-to-machine client, to an existing account as
an `external_identity` row, optionally **pinned** to one agent person
(`external_identity.person_id`). A claim made through a pinned credential must name that
person or a delegated claim under a claim of that person; otherwise `credential_not_for_person`.
Browser logins are unpinned credentials of the same account. Revoking a fleet is deleting its
row. Verified in slice 0 (verify.md): the dev tenant has no M2M application and its groups Action is post-login only, so an M2M token carries no `wbs_groups`; the open decision is an Auth0 credentials-exchange Action or be-01 scoping a linked credential from its account.

**D6b. A linked credential without a groups claim is scoped by its account (assumed, for
Dany's nod).** Slice 0 showed an Auth0 machine-to-machine token carries no `wbs_groups`
without tenant work. Rather than depend on a credentials-exchange Action, be-01 SHALL, when
a verified token carries no groups claim and its `(issuer, subject)` is a linked credential,
derive the request's scopes from the linked account's memberships: `viewer` reads, `member`
reads and writes, `admin` and `super_admin` edit. A token that carries the groups claim keeps
today's mapping; a credential that is not linked and carries no groups claim is refused as
today. An M2M application per fleet is still created in the tenant for the audience, which
is a dashboard act, not an Action. Alternative rejected: the Action, because it ties the
contract to one provider (the `enable-public-mcp-client-auth` non-goal).

**D7. A subtree claim reserves dispatch; steps under it are claimed as delegated claims.** A claim
on a non-leaf has no step and names the subtree. Inside it, a step claim is accepted only
when its person is the subtree holder, or when it names the subtree claim as `parentClaim`
and comes from the same account (the subagent's person may differ or be the same person with
another run id). Anything else is refused `inside_subtree_claim` naming the holder. A
subtree claim that overlaps another holder's subtree claim on an ancestor or descendant is
refused `overlaps_subtree_claim`; a nested subtree claim is allowed as a delegated claim. The
parent claim must exist, be unreleased and sit on a strict ancestor (`parent_claim_unknown`,
`parent_claim_not_ancestor`, `parent_claim_foreign`). Consequence: a claim an admin writes on
another account's behalf carries the admin's account, so a fleet of another account cannot
delegate under it (harmless while every fleet is a credential of Dany's account).

**D8. Releasing a subtree claim cascades.** It removes every delegated claim under it in the
same journal entry. A finished or dead superagent takes its subagents' claims with it.
Progress rows stay.

## Risks / Trade-offs

- **Stale claims have no expiry.** A dead agent's claim stays until its superagent, a human
  or a cascade release removes it. Accepted: expiry is a runtime fact and Dash's lease
  authority (WBS 080.24) is where the clock lives. The startable read lists claimed steps
  apart, with the last write instant, so an operator sees silent claims.
- **A leaf whose only worked step is done reads `done`.** The table's status fold counts only
  steps with an estimate, actual, statement or attempt, so a leaf with `Plan` done and the
  rest untouched is refused `item_done` (review of PR #579, S3-3). Dispatch of the 42 orphan
  steps (task 4.2) must estimate the remaining steps first. Changing the fold is out of
  scope.
- **A claim on a done-then-reopened step keeps its old holder.** The row survives `done`;
  if progress is reopened the old claim still holds. Release first. Recorded, not solved.
- **Two fleets, one GitHub account** remains true until a distinct GitHub identity per fleet
  exists. A Burokrat rule can check that a branch's frozen number is claimed by a person of
  the team its prefix names; it cannot yet check who pushed.
- **The assumed items** (D1 side-by-side, D3 `draft`, D5 unbound refused) are the three
  places Dany can still overturn without moving a table.
