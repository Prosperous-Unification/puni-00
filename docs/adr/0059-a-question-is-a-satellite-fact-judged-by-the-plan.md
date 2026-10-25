---
status: proposed
---

# A question is a satellite fact judged by the plan

**Status:** proposed, 2026-10-25, with the `wbs-questions` change.

Agents working a plan meet decisions the plan left open and blockers they cannot pass. Until
now those went into resume notes, memory files and chat, nothing counted how many were never
looked at, and the agent graded its own freedom to assume. We decided that every such thing is
a **question**: an additive, never-deleted record beside one step node and one attempt, the
same shape as step blockage (ADR 0053), and that the plan, not the agent, computes its
disposition from declared risk facts, the project's topics and the step's phase. A blocked
question writes the existing step blockage; an overturned one creates a work item. Priority
is derived on read from the work item's priority and the sub-tree the node unlocks.

## Considered options

- **Annotations on attempts and a reason on step blockage.** Smallest change, but no review
  lifecycle, no topics, and the unnoticed count would be scraped from evidence text.
- **The agent runtime (Dash) owns the queue.** Natural once every agent runs there, but Claude
  Code sessions do not today, and a reviewer's answer is plan knowledge that belongs with the
  plan.
- **Agent-side policy.** The agent reads the policy and decides. Rejected because the point of
  the record is to audit that judgement, which needs the judge outside the agent.

## Consequences

- The node's own vocabulary and readings do not change. A question reaches the schedule only
  through the step blockage it owns while blocked.
- Hard gates are fixed per deployment, so no project configuration, including `offline`, can
  make an agent assume a destructive, spending, production or access change.
- A disposition is stored with a basis snapshot that replays it without any policy row;
  changing a policy, the deployment default or the hard gates never rewrites history, so
  the counts stay comparable over time.
- A blocked question owns the blockage it wrote: ordinary blockage writes, attempt starts
  and plan imports refuse to go around it until a reviewer resolves it.
- Submit, review and resolve are audited facts outside the command journal; nothing undoes
  them. The follow-up work item an overturn creates is an ordinary work item and can be.
- Who may answer is the permission to edit the plan; the reviewer list only decides who is
  told. A project has no owner, so an empty list means nobody is told.
