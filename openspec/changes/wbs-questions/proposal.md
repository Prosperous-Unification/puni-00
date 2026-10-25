<!-- INTENT. Hard cap: 400 words excluding these comments. -->

## Why

Agents meet decisions the plan left open and blockers they cannot pass. Those land in resume
notes, memory and chat; nothing counts how many were never looked at, and the agent grades
its own freedom to assume. Dany, 2026-10-25: "single place to track them … track how much
assumptions go unnoticed … author will need to receive notifications about blockers".

## What Changes

**One record, the question.** Beside a step node and the attempt that raised it: kind
(decision, or blocker with a cause), the question, the agent's proposed answer, six declared
risk facts, topics. Submitted through the plan command path.

**The plan disposes.** From the project's question policy, the step's phase and the facts,
WBS answers `queued`, `notified` or `blocked`. Blocked writes the existing step blockage and
ends the attempt; the other two let the agent proceed on its proposed answer.

**Reviewers answer.** Accept closes; overturn stores the real answer and creates a follow-up
work item under the same leaf; resolve answers a blocker and removes the blockage.

**Policy per project**, inherited from organization and deployment default: mode `by_step`
or `offline`, a profile per step phase, topics with push flags, notice settings. Hard gates
are fixed per deployment.

**Notices** per reviewer on open, on aging, and in a daily digest, via the OpenClaw gateway.
**Counts** per project and agent: unnoticed, overturn rate, wrong-fact rate, blocked time.
**Queue page** in fe-01 by derived priority.

## Non-Goals

No parking of a running attempt. No per-project hard gates. No email adapter yet. No question
on a parent. No scheduler input beyond the owned step blockage. No re-dispatch after resolve;
the node becomes startable.

## Constraints

Additive migrations with `down.sql`. New command kinds move the contracts and mcp-01 pins.
Disposition is computed inside the submit write and stored with the policy version. A missing
risk fact is a refusal, never a default. Every rule and count has a production-path negative.

## Capabilities

### Modified Capabilities

- `wbs-domain`: questions, question policy, step phase, reviews, follow-up work items,
  notices, question counts.

## Domain Terms

Question, Question kind, Risk fact, Topic, Disposition, Review, Follow-up work item, Question
policy, Policy mode, Step phase, Phase profile, Hard gate, Reviewer, Notice, Question priority,
Unnoticed question — new, in `CONTEXT.md`.

## Decisions Recorded

ADR 0059 "A question is a satellite fact judged by the plan".

## Impact

Every WBS lib, `be-01`, `mcp-01`, `fe-01`, one Dash notice activity.
