# design — `wbs-questions`

## Context

Step blockage is the precedent for everything here: an additive table keyed by
`(work_item_id, step_id)` holding only `blocked_at` and audit columns, cascading on work-item
deletion for old-writer compatibility, written through a step command that carries the
expected and replacement `blockedAt` (optimistic), behind the activation gate
(`StepBlockageInactive`), and folded into the node reading on every read (ADR 0053;
`libs/wbs/application/core/src/ports/step-blockage-store.ts`). Attempts
(`libs/wbs/domain/domain/src/attempt.ts`, `ports/step-node-attempt-store.ts`) are keyed
`(work_item_id, step_id, attempt_number)`, at most one running per node, handed down to a
first child by `moveAll` like estimates, progress and blockage
(`work-item.resource.ts`, the first-child hand-down), and `startAttempt` refuses `node_done`
and `attempt_running` but does not read blockage. A claim is separate from an attempt and is
not released when an attempt ends. Organization limits (`ports/organization-limits.ts`) are the
precedent for a per-tenant row that falls back to a deployment default, parses on read and
throws on malformed trusted state, and writes one audit row per change; the audit `action`
vocabulary is a `CHECK` in `schema.ts` that each new action extends by migration, as the limits
migrations did. Plan commands are declared once in
`libs/wbs/domain/contracts/src/http/plan-command-shapes.ts`; mcp-01 derives tools from the
generated shapes (`apps/wbs/mcp-01/src/openapi-tools.ts`). A machine credential's caller is
`principal.authentication.kind === 'machine'` in core's routes (`resource-runtime.routes.ts`),
not anything in mcp-01. Accounts (`users`, with `email`) and directory persons are different
things; a project has no owner; a work package owner is an account.

Rationale for the shape is ADR 0059; this file is what gets built. The 2026-10-25 Codex
review (gpt-6-astra, high) of the first draft drove D2, D4, D6, D7, D8 and D10 to D14.

## Decisions

### D1 — Tables

`question`, keyed by its own id:

- node and attempt: `work_item_id`, `step_id`, `attempt_number`, one composite foreign key to
  `step_node_attempt` with `ON UPDATE CASCADE` so the first-child hand-down that rewrites the
  attempt's `work_item_id` carries the question, and `ON DELETE RESTRICT` so `removeAttempt`
  on a referenced attempt is refused `attempt_holds_questions` by the command before the
  constraint can fire;
- `project_id`, `submitted_by_kind` (`user` | `machine`), `submitted_by_id` (the account id or
  the machine credential id of the authenticated caller; not a foreign key, so a revoked
  credential keeps its history), `executor_person_id` (copied from the attempt, nullable);
- what was asked: `kind` (`decision` | `blocker`), `cause` (`authorization` | `external` |
  `missing_input`, null unless blocker, `CHECK`), `text`, `proposed_answer`;
- the six facts as `CHECK (x IN (0, 1))` integers; `topics` JSON array of names;
- `disposition` (`queued` | `notified` | `blocked`), `basis` JSON (D10), `submitted_at`;
- for blocked: `blocked_at` (the blockage this question wrote; null otherwise);
- review: `verdict` (`accepted` | `overturned` | `resolved`, null until reviewed), `answer`,
  `reviewed_by_user_id`, `reviewed_at`, `wrong_facts` JSON array, `follow_up_work_item_id`
  (`ON DELETE SET NULL`, so deleting the follow-up later keeps the question's record of having
  created it, as `follow_up_deleted` on read).

`CHECK`s make the pairings the glossary forbids unstorable: a verdict without reviewer and
instant; `resolved` on a non-blocked question and `accepted`/`overturned` on a blocked one;
`overturned` or `resolved` without an answer; `follow_up_work_item_id` on anything but
`overturned`; `blocked_at` set iff `disposition = 'blocked'`. A partial unique index on
`(work_item_id, step_id) WHERE disposition = 'blocked' AND verdict IS NULL` makes "at most one
unresolved blocked question per node" a constraint.

`question_policy`, keyed by `(scope, scope_id)` with scope `organization` | `project`:
`version`, `mode`, `profiles` JSON, `topics` JSON, `unanswered_minutes`, `unnoticed_minutes`,
`digest_on`, `digest_hour`, audit columns. The deployment default is a constant
(`DEFAULT_QUESTION_POLICY`), not a row. Hard gates are a frozen constant `HARD_GATES` with a
`HARD_GATES_REVISION` integer that is bumped by hand whenever the set changes.

`step.phase TEXT NOT NULL DEFAULT 'implementation'`, `CHECK` on the two words, edited through
the existing step patch and settings surface.

`project_reviewer (project_id, user_id, channel, address)`, `ON DELETE CASCADE` on both.

`notice`, keyed by id: `project_id`, `user_id`, `reason` (`opened` | `aged` | `digest`),
`question_id` (null for `digest`, `CHECK`), `digest_day` (ISO date, set iff `digest`,
`CHECK`), `payload` JSON (the digest's count, oldest age and top three; null otherwise),
`channel`, `address` (null → state `undeliverable`), `state` (`queued` | `leased` |
`delivered` | `failed` | `undeliverable`), `attempt_count`, `due_at`, `lease_until`,
`lease_token`, `attempts` JSON (`{ at, error }[]`), `created_at`. Unique indexes:
`(question_id, user_id, reason)` for `opened` and `aged`; `(project_id, user_id, digest_day)`
for `digest`. Both are the thing that makes "once" true under concurrent sweeps.

One migration per table, plus `extend_organization_audit_actions` adding
`question_policy_changed` and `project_reviewers_changed` to the `CHECK` the way the limits
migration did. Every migration ships `down.sql`; the questions' `down.sql` drops the table and
is the one rollback-only destructive act the repo rules already allow. The blue/green window
is why `question.work_item_id` cascades through the attempt's own cascade rather than
restricting: an outgoing writer deleting a work item must not hit a constraint it cannot
report. The new writer refuses deletion (D7).

### D2 — Submit is one transaction with five writes

`submitQuestion` carries the node, the attempt number, kind and cause, text, proposed answer,
all six facts and the topics. The parser refuses `risk_fact_missing`, `question_needs_leaf`,
`unknown_topic`, `cause_without_blocker`. The service, inside the unit of work the command
batch opens (ADR 0015):

1. reads the node, refusing `attempt_not_running` unless the named attempt is the node's
   running one, and `question_blocking` if the node already holds an unresolved blocked
   question;
2. reads the effective policy (D3) and the step's phase, builds the basis (D10) and calls
   `disposeQuestion` (pure, `@wbs/domain`): hard gates → `blocked`; else `offline` →
   `queued`; else the phase profile's `blocks` → `blocked`; else its `notifies` or a topic
   pushed for the phase → `notified`; else `queued`;
3. writes the question;
4. for `notified` and `blocked`: writes one `opened` notice per reviewer (D6), `undeliverable`
   when the reviewer has no address; for `blocked`:
5. writes the step blockage with `blocked_at = stamp.at` through the blockage store (so the
   activation gate applies: `step_blockage_inactive` refuses the whole submission and nothing is
   written), refusing `node_already_blocked` when the node already holds a blockage the
   question would not own; ends the attempt `failed` with `reference = question:<id>`; and
   releases the submitter's claim on the node if one exists, so the node is not held by an
   agent that has walked away.

Any failing write rolls back all of them; the test injects a failure into each of the five.

Submission is not journalled: a question is an audited fact, not a reversible edit, so the
command journal and undo never see it (D4 says the same for review and resolve). The command
bumps the work item's revision and announces one tree change when it wrote a blockage.

### D3 — Effective policy, parsed on read, inherited, audited on write

`QuestionPolicies.readEffective(projectId)` → `{ policy, source: 'project' | 'organization'
| 'default', version }`. The reader distinguishes no row (inherit) from a row it cannot parse
(throw: malformed trusted state, as limits do). Profiles are
`{ blocks: FactCondition[], notifies: FactCondition[] }` with
`FactCondition = { fact, value: boolean }`, so "block when reversible is false" is
representable; the parser refuses a hard-gate fact in either list
(`hard_gate_not_writable`), an unknown fact or phase, a missing profile, a digest hour outside
0–23, and non-positive ages. Topics are `{ name, push: { planning: boolean,
implementation: boolean } }[]`, unique by name. Defaults: `planning` blocks on
`outward: true` and `reversible: false`; `implementation` notifies on `outward: true` and
`reversible: false`; no topics; unanswered 240 minutes; unnoticed 7 days; digest on at 08:00.

`write(scope, id, change, principal)` requires `project-admin` for a project row and
`org-admin` for an organization row (the roles' implied permissions, never their names),
parses, bumps `version`, writes one `question_policy_changed` audit row in the same
transaction, answers `unchanged` when nothing differs. The reviewer list writes
`project_reviewers_changed` the same way.

### D4 — Review and resolve: authority by permission, notice by list

Who may answer is a permission, not the reviewer list: `reviewQuestion` and `resolveQuestion`
require the permission to edit the project's plan (what `package-manager` and above imply),
and are refused `forbidden` for a machine caller (`authentication.kind === 'machine'`) in the
service, so HTTP and MCP share the guard. The reviewer list (D6) only decides who is told.

`resolveQuestion { questionId, answer, wrongFacts? }` requires `disposition = 'blocked'` and
no verdict; it reads the node's blockage and refuses `blockage_changed` unless its
`blocked_at` equals the question's `blocked_at` (someone replaced it in the meantime); then
stores `verdict = 'resolved'`, the answer, the reviewer, any wrong facts, and removes the
blockage under the same stamp. The node's reading is then recomputed from whatever else it
holds; the design promises only that this impediment is gone.

`reviewQuestion { questionId, verdict: 'accepted' | 'overturned', answer?, wrongFacts? }`
requires `queued` or `notified` and no verdict; `overturned` requires an answer and creates
one work item through the ordinary create path as a sibling of the question's leaf (same
`parent_id`, including `null` for a top-level leaf), title `Overturned: <first 80 characters
of the text>`, body holding the text, the proposed answer and the real answer, priority
copied from the leaf as it is at review time, and records the id on the question.

Neither command is journalled. The follow-up is an ordinary work item from then on: it can be
edited, moved, deleted or undone like any other; its deletion sets the question's reference
null and the question reads `follow_up_deleted`. A second review or resolve is refused
`question_already_reviewed`.

Ordinary blockage writes respect ownership: the step blockage command refuses
`question_blocking` when asked to clear or replace a blockage whose `blocked_at` an
unresolved blocked question holds. `startAttempt` refuses `question_blocking` on such a node.
Plan import of a document whose blockage facts collide with an owned blockage is refused the
same way.

### D5 — Priority and counts are read-side folds

**Downstream reach** of a node: the number of distinct step nodes reachable from it over the
project's step dependency edges (successors, transitively, deduplicated over diamonds)
whose reading is neither done nor skipped. It measures how much unfinished work sits behind
the node, not a counterfactual on startability; a resolved question need not make any of them
startable. `questionPriority` is the tuple (leaf priority ascending, absent last; downstream
reach descending; `submitted_at` ascending). `listQueue(projectId)` sorts in the service and
stores nothing.

`readCounts(projectId, now)`, overall and per `(submitted_by_kind, submitted_by_id)`:

- **unnoticed**: `queued` or `notified`, no verdict, `now − submitted_at >` the project's
  effective unnoticed age at read time. Blocked questions are excluded; they have blocked time.
- **overturn rate**: `overturned / (accepted + overturned)`; `null` when the denominator is 0.
- **wrong-fact rate**: reviews or resolves with at least one wrong fact `/ (accepted +
overturned + resolved)`; `null` when 0.
- **blocked time**: sum over blocked questions of `(reviewed_at ?? now) − submitted_at`,
  also reported as the sum weighted by leaf priority band position.

### D6 — Reviewers are accounts on a project list

`project_reviewer` rows name accounts (`user_id`) with a channel and address; edited in project
settings under the same permission as the policy. When the list is empty, no notice is
written at all and the queue page shows "no reviewers named" — there is no owner to fall back
to, because a project has no owner. Channels in this change: `openclaw` only; `email` and its
adapter come later. An account on the list without an address for the project's channel gets
notices in state `undeliverable`, visible on the page, and can still review or resolve: notice
and authority are separate (D4).

### D7 — Questions are never deleted by a command

No command deletes a question. The work-item delete command refuses
`work_item_holds_questions` when the item or anything beneath it holds a question; work
package and space deletion check the same closure. `removeAttempt` refuses
`attempt_holds_questions`. Step deletion is already restrictive for blockage and stays so for
questions. The cascade on `question.work_item_id` (through the attempt) exists only for the
outgoing writer during a blue/green swap and is unreachable through the new writer.

### D8 — Notices are leased and delivered at least once by Dash

be-01 exposes, for a host operator credential: `POST /api/notices/lease { limit, leaseMinutes
}` answering due `queued` notices (`due_at <= now`, no live lease) with a `lease_token` each,
marking them `leased`; `POST /api/notices/:id/attempts { leaseToken, attemptNumber, ok, error?
}`, idempotent on `(id, attemptNumber)`: on `ok` the notice is `delivered`; on failure the
attempt is appended, `attempt_count` incremented, `due_at` set from the schedule 1, 5, 30,
120 minutes, and `failed` after the fifth attempt in all; a stale or wrong lease token is
refused `lease_lost` and changes nothing; and `POST /api/projects/:id/notices/sweep` writing
`aged` and `digest` rows idempotently. A lease that expires unreported returns the notice to
`queued` for the same attempt number.

The Dash activity on h1claw leases, posts each notice to the OpenClaw gateway's message send
(`openclaw message send --channel whatsapp --target <address>`, the path the backup alert
already uses), and reports. A send that succeeds before its report lands is reported again
after the lease expires and may send twice: delivery is at least once, and the message text
carries the question id so a duplicate is recognizable. Two Dash workers cannot deliver the
same notice concurrently because the lease is exclusive. be-01 holds no outbound dependency.

The digest's day is the project's timezone (project settings), never a work package's
override; the sweep writes at most one digest per `(project, reviewer, day)` and a missed day
is not back-filled.

### D9 — Everything an agent needs is derivable

`submitQuestion`, `reviewQuestion` and `resolveQuestion` enter `plan-command-shapes.ts` and
`EVERY_KIND`; the command-kind pins move by three. `GET /api/projects/:id/questions` (queue
order, counts) and `GET /api/questions/:id` are new read routes with shapes. mcp-01's
derivation therefore covers submit, list and read; review and resolve are reachable but refused
for a machine caller by D4.

### D10 — The basis is a snapshot, not a version number

`question.basis` holds `{ source, scopeId, policyVersion, hardGatesRevision, phase, mode,
profile: { blocks, notifies }, pushedTopics }` as evaluated at submit. It is enough to replay
the disposition without any policy row, so a later change to a project policy, an organization
policy, the deployment default or the hard gates leaves history reproducible. Readers parse it
and throw on corruption.

### D11 — JSON columns have one reader each, and the reader throws

`profiles`, `topics`, `basis`, `wrong_facts`, `payload` and `attempts` each have a parser in
`@wbs/domain` used by every reader; a stored value the parser refuses is malformed trusted
state and throws with the row's identity, never a default. Each parser has a corruption test
against a mounted sqlite row.

### D12 — Submission attribution

`submitted_by_kind/id` are taken from the authenticated principal, never from the body; the
attempt's `executor_person_id` is copied at submit so per-agent counts can be read by either
identity. A user submitting on behalf of an attempt they do not execute is allowed (a human
can raise a question too) and recorded as that user.

### D13 — Node reading and startability are not widened

A blocked question changes the node only through the blockage it owns. The scenarios that
assert "the node reads blocked" assume no done statement, no hold and no skip on the node,
because those outrank direct blockage in the existing fold; the scenarios that assert
"startable after resolve" assume no claim, no hold and a satisfied predecessor set. The spec
states these preconditions in each scenario's GIVEN.

### D14 — Proofs that necessarily exercise the mutation

Each `Proof:` names a scenario the injected fault cannot pass: the dispose order is proven
with a question that is hard-gated and on a pushed topic under `offline` (reordering any step
changes the answer); uniqueness is proven by two concurrent sweeps against a mounted sqlite,
with the application-level check removed; the submit transaction is proven by injecting a
throw into each of its five writes and asserting the unchanged state after each.

## Open points settled by assumption

- The digest hour is in the project's timezone; the deployment default is 08:00.
- The default unanswered age is 4 hours; the default unnoticed age is 7 days.
- `offline` bypasses the phase profile and topic pushes and keeps only the hard gates. A
  hard-gated question blocks and writes its `opened` notices in every mode, because a stalled
  node is what Dany asked to be told about (2026-10-25: "author will need to receive
  notifications about blockers").
- Delivery is at least once (D8); exactly-once would need the gateway to accept an idempotency
  key, which `openclaw message send` does not expose.
