# design — `wbs-questions`

## Context

Step blockage is the precedent for everything here: an additive table keyed by
`(work_item_id, step_id)`, a port (`libs/wbs/application/core/src/ports/step-blockage-store.ts`)
whose writes take a `WriteStamp` and answer a `StepWriteOutcome`, folded into the node reading
on every read (ADR 0053). Attempts are the other anchor: `libs/wbs/domain/domain/src/attempt.ts`
makes the running/ended pairing unrepresentable, and the store port
(`ports/step-node-attempt-store.ts`) starts and ends them under the same stamps. Organization
limits (`ports/organization-limits.ts`) are the precedent for a per-tenant row that falls back
to a deployment default and writes one audit row per change. Plan commands are declared once in
`libs/wbs/domain/contracts/src/http/plan-command-shapes.ts` and the route parser, and mcp-01
derives its tools from the generated shapes (`apps/wbs/mcp-01/src/openapi-tools.ts`), so new
commands reach agents without a hand-written tool table. Reviewer permission reuses the
machine-credential caller distinction in `apps/wbs/mcp-01/src/caller-auth.ts`.

Rationale for the shape is ADR 0059; this file is what gets built.

## Decisions

### D1 — Two satellite tables, one versioned policy table, one step column

`question` keyed by its own id, referencing `work_item` (cascade refused by D7), `step`,
`step_node_attempt` by `(work_item_id, step_id, attempt_number)`, and `person` for the
submitter. Columns: `kind`, `cause` (null unless blocker), `text`, `proposed_answer`, the six
facts as `CHECK (x IN (0,1))` integers, `topics` as a JSON array of names validated against the
policy at submit, `disposition`, `policy_version`, `submitted_at`; review columns
`verdict`, `answer`, `reviewer_person_id`, `reviewed_at`, `wrong_facts` (JSON array),
`follow_up_work_item_id`. `CHECK`s make the pairings the glossary forbids unstorable: a
verdict without a reviewer and instant, `resolved` on a non-blocked question, `overturned`
without an answer, a follow-up on anything but `overturned`.

`question_policy` keyed by `(scope, scope_id)` where scope is `organization` or `project`,
with `version`, `mode`, `profiles` JSON (two profiles, each `{ blocks: Fact[], notifies:
Fact[] }`), `topics` JSON (`{ name, push: { planning, implementation } }[]`),
`unanswered_minutes`, `unnoticed_minutes`, `digest_on`, `digest_hour`. The deployment default
is a constant in `@wbs/domain` (`DEFAULT_QUESTION_POLICY`), not a row, as default limits are.
Hard gates are a frozen constant beside it; the policy parser refuses any of them in `blocks`
or `notifies` with `hard_gate_not_writable`.

`step.phase TEXT NOT NULL DEFAULT 'implementation'` with a `CHECK` on the two words; edited
through the existing step patch command and settings surface.

`notice` keyed by id: `question_id`, `person_id`, `reason` (`opened` | `aged` | `digest`),
`channel`, `address`, `state` (`queued` | `delivered` | `failed` | `undeliverable`),
`attempts` JSON (`{ at, error }[]`), `created_at`. A unique index on
`(question_id, person_id, reason)` for `opened` and `aged` makes "aged fires once" a
constraint, not a check in code; digest rows use a daily key column instead.

Four additive migrations, each with `down.sql`.

### D2 — Disposition is a pure function, applied inside the submit write

`disposeQuestion(policy, phase, facts, topics): Disposition` in `@wbs/domain` with the order
the spec fixes: hard gates, then `offline`, then the phase profile's `blocks`, then its
`notifies` or a pushed topic, else `queued`. Pure, exhaustively tested, and the only place the
order lives. `QuestionService.submit` reads the effective policy and the step's phase inside
the unit of work the command batch opens (ADR 0015), calls `disposeQuestion`, and writes the
question, and when blocked the step blockage via `StepBlockageStore.set`, the attempt end via
`StepNodeAttemptStore.end` with the question id as `reference`, and the `opened` notices,
under one stamp. The blockage write keeps its activation gate: a project whose blockage
writers are inactive refuses a blocking submission with `step_blockage_inactive`, and the
question is not written (nothing half-done).

### D3 — Effective policy reads project, organization, default, and names its source

`QuestionPolicies.readEffective(projectId)` → `{ policy, source: 'project' | 'organization'
| 'default', version }`. Version is the row's for the first two and `0` for the default.
`write(scope, id, change, actorId)` parses, refuses hard gates and unknown words, bumps the
version, writes one `question_policy_changed` row through the organization audit port in the
same transaction, and answers `unchanged` when nothing differs, as limits do.

### D4 — Review and resolve are two commands with distinct guards

`reviewQuestion { questionId, verdict: 'accepted' | 'overturned', answer?, wrongFacts? }` and
`resolveQuestion { questionId, answer }`. Both resolve the actor through the project's reviewer
list (D6) and refuse `forbidden` otherwise. `resolveQuestion` requires `disposition: 'blocked'`
and no verdict; it stores `verdict: 'resolved'` and calls `StepBlockageStore.remove` under
the same stamp. `reviewQuestion` requires `queued` or `notified` and no verdict; `overturned`
requires an answer and calls `WorkItemService.create` for the follow-up as a sibling of the
leaf (same parent), title `Overturned: <first 80 chars of the question>`, body holding the
question text, the proposed answer and the real answer, priority copied from the leaf, and
records the new id on the question. Both are journalled as one entry; the overturn's inverse
removes the follow-up and clears the verdict, so undo is one act.

### D5 — Priority and counts are read-side folds

`questionPriority(question, workItem, graph)` in `@wbs/domain` reads the leaf's priority and
walks the step graph the folds already hold to count not-done nodes transitively waiting on
the node. `listQueue(projectId)` sorts in the service with the three-key comparator from the
spec and never stores the order. `readCounts(projectId, now)` folds unnoticed, overturn rate,
wrong-fact rate and blocked time from the question rows alone, grouped overall and by
submitter.

### D6 — Reviewers are a project list with a fallback to the owner

`project_reviewer (project_id, person_id, channel, address)` as a fifth additive migration,
edited in project settings. `readReviewers(projectId)` answers the rows, else the owner with
the owner's address for the project's channel, else the owner marked without address so the
notice is written `undeliverable`. The channel vocabulary is `openclaw` only in this change;
`email` is added with its adapter later.

### D7 — Questions are never deleted

`question.work_item_id` references `work_item` with `ON DELETE RESTRICT`, and the work-item
delete command checks first and refuses with `work_item_holds_questions`, so the refusal is
typed rather than a constraint error surfacing as 500. `moveAll` for a work item move carries
questions as blockage does.

### D8 — Notices are delivered by Dash, not by be-01

be-01 exposes `GET /api/notices?state=queued` and `POST /api/notices/:id/attempts` for a host
operator credential. A Dash activity on h1claw polls, posts each notice to the OpenClaw
gateway's send endpoint with the reviewer's address, and reports the attempt and error text
back. Retry schedule: 1, 5, 30, 120 minutes, then `failed`. The same activity runs the aging
pass and the digest pass against `POST /api/projects/:id/notices/sweep`, which writes `aged`
and `digest` rows idempotently (D1's unique index and daily key). be-01 holds no outbound
network dependency.

### D9 — Everything an agent needs is derivable

`submitQuestion`, `reviewQuestion` and `resolveQuestion` enter `plan-command-shapes.ts` and
`EVERY_KIND`; the command-kind pins in contracts and mcp-01 move by three. `GET
/api/projects/:id/questions` and `GET /api/questions/:id` are new read routes with shapes, so
mcp-01's derivation covers submit, list and read. The review and resolve commands are reached
through the same `commands` route and refused `forbidden` for a machine credential's caller
in the service, not in mcp-01, so the HTTP path carries the same guard.

## Open points settled by assumption

- The digest hour is in the project's work package timezone; the deployment default is 08:00.
- The default unanswered age is 4 hours; the default unnoticed age is 7 days.
- `offline` suppresses only the `notified` disposition. A hard-gated question blocks and
  writes its `opened` notices in every mode, because a stalled node is what Dany asked to be
  told about (2026-10-25: "author will need to receive notifications about blockers").
