## Context

The coordination problem this change answers was written down on 2026-10-19 as a note for
Claire's fleet: ownership is signalled by a `task-*` branch prefix, both fleets commit as one
GitHub account, the pre-start check is three shell commands, Claire reads the WBS store
read-only over SSH and cannot write a claim, and "a WBS item note with no recent entry does
not mean nobody is working on it". Two cases prove the plan and the tree disagree.

Everything that note needs already has a home in the WBS model, except three pieces:

| Need                            | Exists today                                                                        | Missing                                     |
| ------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------- |
| A fleet                         | `service_team`; its members are `person` rows of kind `agent` through `person_team` | nothing                                     |
| A fleet's part of the tree      | `work_item_team`, inherited most-specific-first (`effectiveTeamsOf`)                | a name for it: **Allotment**                |
| How many agents a fleet runs    | `project_team_capacity`, which the schedule spends                                  | nothing                                     |
| Who holds a leaf                | `assignment` (one person per step), audit columns name the writing account          | an atomic, conditional write: **Claim**     |
| Is it free, ready, unblocked    | `statusOf`, `blockedByProxyOf`, the hold and readiness columns                      | one read filtered by team: **Startable**    |
| Branch and PR of the work       | `work_item_external_ref` with system `github-pr`                                    | a `github-branch` system row (directory)    |
| Progress back into the plan     | `setProgress`, `setStatus`, Navigator's receipt-to-commands                         | nothing                                     |
| A fleet that can write          | OIDC login creates an account for a new verified `(iss, sub)`; organization roles   | membership without an email; person binding |
| Expiry of a dead holder's claim | nothing, deliberately                                                               | stays with Twilight Dash (A25)              |

Measured on the dev store on 2026-10-19 (read-only, `bun:sqlite`): the project holds 211
work items, 0 assignments, 0 team labels, 2 external refs, 6 leaves stated `ready`, 6 held
`blocked`, 198 with nothing stated, and 42 step-progress rows `in_progress` that no
assignment accounts for. The claims of two fleets exist only in notes.

One more finding from the same reading: Claire's note addresses items by **derived** numbers
(`60.250`, `2.40.20`) while the WBS notes and the export use **frozen** numbers (`080.25`,
`010.5.4`). The two disagree today. Every surface this change adds answers with the work
item id and the frozen number, and fleets address items by id.

## Goals / Non-Goals

**Goals:**

- A fleet claims a leaf with one command that cannot succeed twice for two holders.
- A fleet finds what it may start with one read that uses the same status fold as the table.
- Each fleet writes as itself, so the audit columns, not a branch prefix, say who claimed.
- The branch prefix becomes a derived convention that a later Burokrat rule checks against
  the plan, not the thing that keeps fleets apart.

**Non-Goals:**

- Anything with a clock: lease expiry, heartbeats, reclamation, preemption. Twilight Dash
  owns runtime occupancy (`docs/twilight-structure/client-repositories.md`, storage
  ownership table; the 2026-10-17 resource-claim design §0 and §3).
- Resources other than people. Teams keep meaning what `docs/capacity.md` says.
- Making `setAssignee` team-fenced. Dany's 2026-08-06 rule stands for people: a team labels
  the work, a person does it, the two need not match. Only the claim path is fenced.

## Decisions

**D1. A claim is an assignment, not a new table.** The holder of a leaf is whoever its steps
are assigned to; `claimWorkItem` writes `assignment` rows and nothing else. Alternatives: a
`claim` table with holder and instant (a second spelling of "who does this", R2), or a note
convention (what exists, and what failed). Consequence: everything that already reads
assignments (table, export, capacity, assumed assignee) shows a claim for free, and undo is
the journal's.

**D2. Claim takes every unassigned step; release gives back the steps not yet done.** A
superagent claims the leaf whole, then hands single steps to subagents with `setAssignee`.
Release keeps the assignments on done steps, because "Claire did Impl" is a fact worth
keeping after she gives up Review. A claim by the holder itself is a no-op success
(`alreadyHeld: true`), so a retried batch is safe.

**D3. Claim requires status `ready`.** `unknown` is refused: letting a fleet start work
nobody has called ready is how the plan came to disagree with the tree. The dispatch act is
therefore explicit and cheap: label the subtree with the team, `setStatus ready` on the
parent (acts on every leaf; refused where a step has spoken, which is right), `setCapacity`.
Consequence for today's plan: the 42 in-progress steps nobody is assigned to cannot be
claimed by a second fleet, because they do not read `ready`; a human assigns them, or not.

**D4. The fence is on the allotment, and only there.** `outside_allotment` refuses when the
leaf's effective team set is non-empty and shares no team with the claimant's teams. An
unlabelled leaf is open to any agent. This keeps D-rule "labelling is not assigning" intact
for `setAssignee` and still makes "different teams on different parts" enforceable rather
than conventional. Alternative rejected: a project flag that fences `setAssignee` too, which
would change how people use the table.

**D5. A person may be bound to an account; the claim checks the binding.** One nullable
column `person.account_id` (FK `users.id`). `claimWorkItem` and `releaseWorkItem` refuse
`person_not_bound` unless the person's account is the caller or the caller holds `admin` or
`super_admin` in the project's organization. Until the binding exists the refusal cannot
exist, so slice 2 ships before any fleet is told the prefix rule no longer applies. The
column is the meeting point the `person` JSDoc reserved ("they meet through a column added
then").

**D6. A machine identity is an ordinary account with an operator-granted membership.** be-01
already creates an account for a new verified `(iss, sub)` whose token carries the groups
claim; what an Auth0 machine-to-machine client lacks is an email to be invited by. A be-01
CLI, run on the host like the other `*-cli.ts`, grants a `(issuer, subject)` a membership
with a named role, creating the account and its `external_identity` mapping when absent. No
`client_credentials` grant is added to mcp-01; a fleet calls be-01 over HTTP with its
upstream bearer, which is the same contract the MCP tools are derived from. Verification
owed in slice 0: that the Auth0 credentials-exchange action sets `wbs_groups` on M2M tokens
for the WBS audience.

## Risks / Trade-offs

- **Stale claims have no expiry.** A dead agent's claim stays until a human or its own
  superagent releases it. Accepted: expiry is a runtime fact and Dash's lease authority
  (WBS 080.24) is where the clock lives. The startable read lists claimed-but-silent leaves
  separately so the operator sees them.
- **Status `ready` as the claim gate changes Claire's pick rule** from "no unfinished
  predecessor and no hold" to "somebody said ready". That is the point, and it costs the
  operator one `setStatus ready` per dispatched subtree.
- **Two fleets, one GitHub account** remains true until a distinct GitHub identity per fleet
  exists. A Burokrat rule can still check that a branch's frozen number is claimed by a
  member of the team its prefix names; it cannot yet check who pushed.
- **The interview was not held.** Dany was away on 2026-10-19; terms and D1 to D6 are
  proposals under the standing "assume and document" rule and are reversible before slice 1.
