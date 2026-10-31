# design — `wbs-questions`

## Context

Step blockage is the precedent for everything here: an additive table keyed by
`(work_item_id, step_id)` holding only `blocked_at` and audit columns, cascading on work-item
deletion for old-writer compatibility, written by the public `setStepBlocked { stepId,
isBlocked }` command and by compensating replay carrying `expectedBlockedAt` and
`replacementBlockedAt`, behind the activation gate (`StepBlockageInactive`), and folded into
the node reading on every read (ADR 0053; `ports/step-blockage-store.ts`). Attempts
(`libs/wbs/domain/domain/src/attempt.ts`, `ports/step-node-attempt-store.ts`) are keyed
`(work_item_id, step_id, attempt_number)`, at most one running per node, handed down to a
first child by `moveAll` after the parent's blockage is cleared by `replace_blockage`
(`work-item.resource.ts` near line 2945); the undo of a first-child creation clears the
child's blockage, deletes the child and restores the parent's attempts, and the redo mirrors
it (lines 3273 to 3342). Moving a row under a leaf (near line 4446) keeps the incoming row's
facts and hands nothing down. Confirmed step removal deletes every attempt on the step
directly (`store-sqlite/src/step.ts` near line 550). `startAttempt` refuses `node_done`,
`attempt_running` and strict budgets but does not read blockage; an attempt's executor may
be null. Claims belong to persons; `ClaimStore.remove` exists; the service's `release` runs
`decideRelease`, whose identity rule (`libs/wbs/domain/domain/src/claim.ts` near line 196)
honours an upstream credential's pin through `external_identity.person_id`
(`principal.ts` near line 98) and the account's bound persons otherwise. Organization limits
(`ports/organization-limits.ts`) are the precedent for a per-tenant row that falls back to a
deployment default, parses on read and throws on malformed trusted state, and writes one audit
row per change; `organization_audit` has `CHECK`s on both `action` and `subject_kind`
(`schema.ts` near line 3515). Plan commands are declared once in
`libs/wbs/domain/contracts/src/http/plan-command-shapes.ts`; mcp-01 derives tools from the
generated shapes. Agent credentials come in two principal forms, `authentication.kind`
`machine` and `consent` (`principal.ts`), both carrying `credentialId` and `personId`;
`resource-use.routes.ts` already treats the pair as pinned agents. Accounts (`users`) and
directory persons are different things; a project has no owner. Permissions are the held
`wbs-permissions` change: `package.read` (viewer and up) and `package.write` (contributor and
up) at a work package, `project.manage_settings` (project-manager and up), the
`organization.manage_*` family (org-admin and up); under its P3 and P5 a package may be
restricted, so project membership does not imply reading every package.

Rationale for the shape is ADR 0062; this file is what gets built. Three Codex reviews
(gpt-6-astra, high, 2026-10-25) drove D2, D4, D6 to D8 and D10 to D16.

## Decisions

### D1 — Tables

`question`, keyed by its own id:

- node and attempt: `work_item_id`, `step_id`, `attempt_number`, one composite foreign key to
  `step_node_attempt` with `ON DELETE CASCADE`. The cascade is the outgoing writer's path
  during a blue/green swap, when it deletes a work item or restores attempts as it always did;
  the new writer never reaches it, because its command and replay paths refuse first (D7);
- `project_id`, `submitted_by_kind` (`user` | `machine` | `consent`), `submitted_by_id` (the
  account id, or the credential id for either agent form; not a foreign key, so a revoked
  credential keeps its history), `executor_person_id` (copied from the attempt, never null:
  D12 refuses an executor-less attempt);
- what was asked: `kind` (`decision` | `blocker`), `cause` (`authorization` | `external` |
  `missing_input`, `CHECK` set iff blocker), `text`, `proposed_answer`;
- the six facts as `CHECK (x IN (0, 1))` integers; `topics` JSON array of names;
- `disposition` (`queued` | `notified` | `blocked`), `basis` JSON (D10), `submitted_at`;
- for blocked: `blocked_at` (the blockage this question wrote; `CHECK` set iff blocked);
- review: `verdict` (`accepted` | `overturned` | `resolved`, null until reviewed), `answer`,
  `reviewed_by_user_id`, `reviewed_at`, `wrong_facts` JSON array, `follow_up_work_item_id`
  as a plain id with no foreign key: whether the follow-up exists is derived on read
  (`follow_up_deleted` when no work item has that id), so an undo that deletes it and a redo
  that restores it under the same id need no write on the question.

`CHECK`s make the forbidden pairings unstorable: a verdict without reviewer and instant;
`resolved` on a non-blocked question and `accepted`/`overturned` on a blocked one;
`overturned` or `resolved` without an answer; `follow_up_work_item_id` on anything but
`overturned`. A partial unique index on `(work_item_id, step_id) WHERE disposition =
'blocked' AND verdict IS NULL` makes "at most one unresolved blocked question per node" a
constraint, tested directly against a mounted sqlite.

`question_policy`, keyed by `(scope, scope_id)` with scope `organization` | `project`:
`version`, `mode`, `profiles` JSON, `topics` JSON, `unanswered_minutes`, `unnoticed_minutes`,
`digest_on`, `digest_hour`, audit columns. The deployment default is a constant
(`DEFAULT_QUESTION_POLICY`), not a row. Hard gates are a frozen constant `HARD_GATES`.

`step.phase TEXT NOT NULL DEFAULT 'implementation'`, `CHECK` on the two words, edited through
the existing step patch and settings surface.

`project_reviewer (project_id, user_id, channel, address)`, `ON DELETE CASCADE` on both.

`notice`, keyed by id: `project_id`, `user_id`, `reason` (`opened` | `aged` | `digest`),
`question_id` (null iff `digest`, `CHECK`), `digest_day` (ISO date, set iff `digest`,
`CHECK`), `payload` JSON (the digest's count, oldest age and top three; null otherwise),
`channel`, `address` (null → state `undeliverable`), `state` (`queued` | `leased` |
`delivered` | `failed` | `undeliverable`), `undeliverable_reason` (`no_address` |
`no_access`, set iff undeliverable), `attempt_count`, `due_at`, `lease_until`,
`lease_token`, `reports` JSON (`{ number, token, at, outcome: 'ok' | 'error' | 'lost', error?
}[]`, D8), `created_at`. Unique indexes: `(question_id, user_id, reason)` for `opened` and
`aged`; `(project_id, user_id, digest_day)` for `digest`.

Migrations: one per table, `extend_organization_audit_vocabulary` adding the action
`question_policy_changed` with subject kind `question_policy` (subject id = the scope id) and
the action `project_reviewers_changed` with the existing subject kind `project`, to both
`CHECK`s the way the limits migration widened them, keeping the append-only triggers. Every
migration ships `down.sql`; the questions' `down.sql` refuses when the table is non-empty
(rollback lint's existing "populated vocabulary" rule), so a rollback never silently drops
retained records. The permission matrix of `wbs-permissions` gains the mapping
`organization.manage_access` → organization question policy writes.

### D2 — Submit is one transaction with five writes

`submitQuestion` carries the node, the attempt number, kind and cause, text, proposed answer,
all six facts and the topics. The parser refuses `risk_fact_missing`, `question_needs_leaf`,
`unknown_topic`, `cause_without_blocker`. The service, inside the unit of work the command
batch opens (ADR 0015):

1. reads the node, refusing `attempt_not_running` unless the named attempt is the node's
   running one, `attempt_has_no_executor` when it has none, `forbidden` unless the principal
   is that executor by the claim identity rule (D12), and `question_blocking` if the node
   already holds an unresolved blocked question;
2. reads the effective policy (D3) and the step's phase, builds the basis (D10) and calls
   `disposeQuestion` (pure, `@wbs/domain`): a hard gate → `blocked`; else `offline` →
   `queued`; else the phase profile's `blocks` → `blocked`; else its `notifies` or a topic
   pushed for the phase → `notified`; else `queued`;
3. writes the question;
4. for `notified` and `blocked`: writes one `opened` notice per reviewer (D6, D16),
   `undeliverable` with its reason when the reviewer has no address or no read access; for
   `blocked`:
5. writes the step blockage with `blocked_at = stamp.at` through the blockage store (so the
   activation gate applies: `step_blockage_inactive` refuses the whole submission), refusing
   `node_already_blocked` when the node already holds a blockage; ends the attempt `failed`
   with `reference = question:<id>`; and removes the executor person's claim on this node
   through `ClaimStore.remove` in the same transaction, unjournalled, without
   `decideRelease`'s journal, because step 1 already applied its identity rule. Occupancy
   follows the claim. No other claim and no progress statement is touched.

Any failing write rolls back all of them; the test injects a failure into each of the five.

Submission is not journalled: a question is an audited fact, not a reversible edit. The
command bumps the work item's revision and announces one tree change when it wrote a blockage
or removed a claim.

### D3 — Effective policy, parsed on read, inherited, audited on write

`QuestionPolicies.readEffective(projectId)` → `{ policy, source: 'project' | 'organization'
| 'default', version }`. The reader distinguishes no row (inherit) from a row it cannot parse
(throw: malformed trusted state, as limits do). Profiles are
`{ blocks: FactCondition[], notifies: FactCondition[] }` with
`FactCondition = { fact, value: boolean }`; the parser refuses a hard-gate fact in either list
(`hard_gate_not_writable`), an unknown fact or phase, a missing profile, a digest hour outside
0 to 23, and non-positive ages. Topics are `{ name, push: { planning: boolean,
implementation: boolean } }[]`, unique by name. Defaults: `planning` blocks on
`outward: true` and `reversible: false`; `implementation` notifies on the same two; no topics;
unanswered 240 minutes; unnoticed 7 days; digest on at 08:00. Planning is stricter by default
only; a project may configure it however it likes.

`write(scope, id, change, principal)` requires `project.manage_settings` at the project for a
project row and `organization.manage_access` for an organization row (the permission, never
the role name; until `wbs-permissions` lands, the legacy mapping is organization `admin` for
both), parses, bumps `version`, writes the audit row (D1's tuple) in the same transaction,
answers `unchanged` when nothing differs. The reviewer list writes `project_reviewers_changed`
the same way under `project.manage_settings`.

### D4 — Review and resolve: authority by permission, notice by list

Who may answer is a permission, not the reviewer list: `reviewQuestion` and `resolveQuestion`
require `package.write` at the leaf's work package, and are refused `forbidden` for any agent
credential (`authentication.kind` `machine` or `consent`) regardless of what the credential's
own grants hold, in the service, so HTTP and MCP share the guard. The reviewer list (D6) only
decides who is told; a listed account without an address still answers under its own
permission.

`resolveQuestion { questionId, answer, wrongFacts? }` requires `disposition = 'blocked'` and
no verdict; it reads the node's blockage and refuses `blockage_changed` unless its
`blocked_at` equals the question's `blocked_at`; then stores `verdict = 'resolved'`, the
answer, the reviewer, any wrong facts, and removes the blockage under the same stamp. The
design promises only that this impediment is gone; the node's reading and startability are
recomputed from whatever else it holds (D13).

`reviewQuestion { questionId, verdict: 'accepted' | 'overturned', answer?, wrongFacts? }`
requires `queued` or `notified` and no verdict; `overturned` requires an answer and creates
one work item through the ordinary create path as a sibling of the question's leaf (same
`parent_id`, including `null`), title `Overturned: <first 80 characters of the text>`, body
holding the text, the proposed answer and the real answer, priority copied from the leaf at
review time, and records the id on the question. The creation is journalled as an ordinary
`create` entry of its own, so undoing it deletes the follow-up (the question reads
`follow_up_deleted` while no row has that id) and redoing it restores the row under the same
id (the question reads it again); the verdict is never touched. Review and resolve themselves
are not journalled. A second review or resolve is refused `question_already_reviewed`.

Ownership guards, on both the public command and the replay path: `setStepBlocked` with
`isBlocked: false` refuses `question_blocking` when the node's blockage is one an unresolved
blocked question holds, and `startAttempt` refuses `question_blocking` on such a node. A
replayed `replace_blockage` whose `expectedBlockedAt` matches checks the same ownership, but
replay keeps its existing envelope: the application refusal becomes the journal's `409
stale_undo` with the detail naming `question_blocking`, and `walkStack` discards the entry as
it does today (`work-item.resource.ts` near lines 1318 and 7950). A replay whose expected
timestamp does not match keeps its existing stale-history refusal, which proves nothing about
ownership and is tested apart. Plan import creates fresh ids and cannot touch an owned
blockage; the test asserts the source stays untouched.

### D5 — Priority and counts are read-side folds

**Downstream reach** of a node: the number of distinct step nodes reachable from it over the
project's step dependency edges (successors, transitively, deduplicated over diamonds) whose
reading is neither done nor skipped. `questionPriority` is the tuple (leaf priority ascending,
absent last; downstream reach descending; `submitted_at` ascending). `listQueue(projectId,
principal)` sorts in the service over the questions the principal may read (D16) and stores
nothing.

`readCounts(projectId, principal, now)`, over the readable questions, overall and per
`(submitted_by_kind, submitted_by_id)`:

- **unnoticed**: `queued` or `notified`, no verdict, `now − submitted_at >` the project's
  effective unnoticed age at read time. Blocked questions are excluded.
- **overturn rate**: `overturned / (accepted + overturned)`; `null` when the denominator is 0.
- **wrong-fact rate**: verdicts with at least one wrong fact `/ (accepted + overturned +
resolved)`; `null` when 0.
- **blocked time**: sum over blocked questions of `(reviewed_at ?? now) − submitted_at`,
  unweighted.

### D6 — Reviewers are accounts on a project list

`project_reviewer` rows name accounts (`user_id`) with a channel and address; edited in project
settings under `project.manage_settings`. When the list is empty, no notice is written and the
queue page shows "no reviewers named". Channels in this change: `openclaw` only. An account on
the list without an address gets notices in state `undeliverable` (`no_address`), one without
read access to the question's package `undeliverable` (`no_access`), both visible on the page;
neither changes review authority (D4).

### D7 — A question-holding leaf stays a leaf, and nothing of the new writer deletes a question

No command deletes a question. The refusals are typed on the public command; on a
compensating replay the same check runs inside `applyRestore`, `applyMove` and `applyDelete`
before their mutations, and surfaces through the existing replay envelope (`409 stale_undo`
with the detail naming the code, entry discarded), because an operation can precede the
question: create a first child, undo it, submit a question on the restored leaf, then redo
the creation. The refusals:

- work-item deletion when the item or any descendant holds a question:
  `work_item_holds_questions`; work package and space deletion check the same closure;
- `removeAttempt` on a referenced attempt: `attempt_holds_questions`;
- confirmed step removal, with or without `cascade`, when any attempt on the step holds a
  question: `step_holds_questions`, checked inside the removal transaction before any
  deletion; a step without questions keeps today's confirmed deletion;
- turning a leaf that holds any question into a parent, by creating its first child or by
  moving another row under it: `leaf_holds_questions`.

The last rule is what keeps the structural replays simple: a question never needs to be
handed down, the parent's blockage never needs clearing around an owned one, and the existing
first-child, undo and redo paths (clear blockage, move attempts, delete, restore) run
unchanged for question-free leaves, so every archived scenario about them still holds. Siblings
and ancestors stay editable. The cascade on the attempt key is reachable only by an outgoing
writer during a swap.

### D8 — Notices are leased and delivered at least once by Dash

be-01 exposes, for a host operator credential:

- `POST /api/notices/lease { limit, leaseMinutes }`: due `queued` notices (`due_at <= now`, no
  live lease) become `leased` with a fresh `lease_token` and `lease_until`; the expected
  attempt number is `attempt_count + 1`. The same pass first closes every expired lease by
  recording `{ outcome: 'lost' }` for its attempt number, counting it as a failed attempt
  (schedule and the five-attempt cap apply), and clearing the token, so no lease is ever both
  expired and live.
- `POST /api/notices/:id/reports { leaseToken, attemptNumber, outcome: 'ok' | 'error', error?
}`, decided by looking up the recorded report for `(attemptNumber, leaseToken)` first and
  consulting the live lease only when none exists:
  1. recorded as `lost`: refuse `lease_lost`, change nothing;
  2. recorded with the same outcome: answer the recorded outcome, change nothing;
  3. recorded with a different outcome: refuse `report_conflict`, change nothing;
  4. no recorded report, and the token is not the live one, or the number is not the expected
     one, or `lease_until` has passed: refuse `lease_lost`, change nothing (an expired lease
     that nobody has closed yet is refused the same way; the next lease pass records `lost`
     for it);
  5. otherwise record it and clear the lease (token and `lease_until` null): `ok` →
     `delivered`; `error` → `attempt_count + 1`, `due_at` from the schedule 1, 5, 30, 120
     minutes, `queued`, or `failed` when `attempt_count` reaches 5.
     Every report keeps its token in the record, so a conflicting repeat of attempt 1 is found
     by lookup even after the notice has moved on to attempt 2. Each attempt number is consumed
     exactly once: by a report or by the lease pass's `lost`, never both, because the pass
     closes only leases whose token is still set.
- `POST /api/projects/:id/notices/sweep` writes `aged` and `digest` rows idempotently.

The worker stops handling a notice on `lease_lost` and on `report_conflict` alike; both mean
the row has moved on without it. The lease is exclusive ownership of the database row, not
of the gateway: a worker whose send outlives its lease may still complete while another
worker sends again. Delivery is therefore at least once, the message text carries the
question id so a duplicate is recognizable, and the worker's own send deadline equals its
lease length. The Dash activity on h1claw leases, posts each notice through `openclaw message
send --channel whatsapp --target <address>`, and reports. be-01 holds no outbound dependency.
The digest's day is the project's timezone, never a work package's; the sweep writes at most
one digest per `(project, reviewer, day)`, over the questions that reviewer may read (D16),
and a missed day is not back-filled.

### D9 — Everything an agent needs is derivable

`submitQuestion`, `reviewQuestion` and `resolveQuestion` enter `plan-command-shapes.ts` and
`EVERY_KIND`; the command-kind pins move by three. `GET /api/projects/:id/questions` (queue
order, counts) and `GET /api/questions/:id` are new read routes with shapes. mcp-01's
derivation therefore covers submit, list and read; review and resolve are reachable but refused
for an agent credential by D4.

### D10 — The basis is a snapshot that replays by itself

`question.basis` holds `{ source, scopeId, policyVersion, hardGates: RiskFact[], phase, mode,
profile: { blocks, notifies }, pushedTopics }` as evaluated at submit. `disposeQuestion(basis,
facts, topics)` takes the basis, not the live policy, so replay after a change to any policy
row, the deployment default or the hard-gate constant gives the stored disposition; the test
changes the constant and replays.

### D11 — JSON columns have one reader each, and the reader throws

`profiles`, `topics`, `basis`, `wrong_facts`, `payload` and `reports` each have a parser in
`@wbs/domain` used by every reader; a stored value the parser refuses is malformed trusted
state and throws with the row's identity. Each parser has a corruption test against a mounted
sqlite row.

### D12 — The submitter is the attempt's executor, by the claim identity rule

A submission is accepted only from the attempt's executor, decided by the same identity rule
`decideRelease` uses for a claim's person: an agent credential whose `personId` is the
executor; an upstream credential pinned through `external_identity.person_id` only when the
pin is the executor, never through the account's other bound persons; an unpinned user whose
bound persons include the executor. An attempt with no executor is refused
`attempt_has_no_executor`; anyone else is refused `forbidden`. Executor-only is a rule of this
new command and does not narrow who may act on attempts or claims elsewhere.
`submitted_by_kind/id` come from the principal, never the body; a `consent` credential is
recorded as `consent` with its own credential id, never as its bound account.

### D13 — Node reading and startability are not widened

A blocked question changes the node only through the blockage it owns. Scenarios that assert
"the node reads blocked" state no done statement, no hold and no skip on the node, because
those outrank direct blockage in the existing fold. No scenario asserts startability after
resolve: resource fit, budgets, claims and holds are their own facts. Resolve's scenario
asserts only that the blockage is gone and the reading no longer says blocked.

### D14 — Proofs that necessarily exercise the mutation

Each `Proof:` names a witness the fault cannot pass, one per precedence boundary of
`disposeQuestion`:

- gate before offline: hard-gated under `offline` → `blocked`;
- offline before profile: `offline` with a profile that would block → `queued`;
- profile `blocks` before topics: a matching `blocks` condition on a pushed topic → `blocked`;
- profile `notifies` before `queued`: a matching `notifies` condition, no topic → `notified`;
- topic push: no condition matched, pushed topic → `notified`.

Reach is asserted numerically (a diamond reads 3, not 4). Uniqueness of `aged` and `digest`
is proven by two concurrent sweeps against a mounted sqlite with the application-level check
removed; the question partial index by two inserts. The submit transaction is proven by
injecting a throw into each of its five writes and asserting the unchanged state after each.
The agent-refusal witness grants `package.write` to the credential's own grants (P17), so
ordinary authorization passes and only the agent guard refuses. The replaced-blockage witness
writes the replacement through the store directly, standing for an outgoing writer. The
scenarios' shared fixture is a requirement of its own so it survives archive.

### D15 — Slices ship guards before submission

Submission, the ownership and structural guards, resolve and the deletion refusals are one PR
(tasks section 3), because a release with submission and without them permits going around
an owned blockage, stranding a question, or creating blocked questions nobody can resolve.

### D16 — Visibility follows the package

A question is readable by a principal holding `package.read` at its leaf's work package.
`GET /api/questions/:id` answers the invisible-object refusal of `wbs-permissions` P10, a
`404 not_found` indistinguishable from a missing id, otherwise; the project queue and counts
cover only the readable questions; the digest for a reviewer is computed over what that
reviewer may read. Access is checked twice: at write time, when an `opened` or `aged` notice
for a reviewer without `package.read` is written `undeliverable` (`no_access`), and again by
the lease pass, which before leasing re-evaluates the recipient's access and marks a notice
`undeliverable` (`no_access`) when it was revoked meanwhile; a queued digest is recomputed at
lease time over the recipient's current visibility and is marked `undeliverable` when
nothing remains. A reviewer whose access is revoked before a lease is granted therefore never
receives even the ids, counts or ages of a package they can no longer open; a delivery whose
lease was granted while access held may complete after revocation, because a send may outlive
its lease (D8). The notice text still names only the question id, the
project and the leaf's number, never the question text.

## Open points settled by assumption

- The digest hour is in the project's timezone; the deployment default is 08:00.
- The default unanswered age is 4 hours; the default unnoticed age is 7 days.
- `offline` bypasses the phase profile and topic pushes and keeps only the hard gates. A
  hard-gated question blocks and writes its `opened` notices in every mode, because a stalled
  node is what Dany asked to be told about (2026-10-25: "author will need to receive
  notifications about blockers").
- Review and resolve follow `package.write`, the permission that already lets a person edit
  the plan the question sits in. Dany may want a higher bar for answering questions on topics
  he owns; that would be a topic-level permission and is left out of this change.
- A question-holding leaf cannot become a parent (D7). Splitting such a leaf is done by adding
  siblings; this is the price of never handing a question down.
- Delivery is at least once (D8); exactly-once would need the gateway to accept an idempotency
  key, which `openclaw message send` does not expose.
- Notice text carries the question id, the project name and the leaf's number, never the
  question text (D16).
