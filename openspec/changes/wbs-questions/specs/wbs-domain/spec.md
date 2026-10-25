## ADDED Requirements

### Requirement: A question is submitted against a step node and disposed of by the plan

A project SHALL accept one plan command, `submitQuestion`, carrying a leaf work item, a step,
the attempt number of that node's running attempt, a kind (`decision`, or `blocker` with a
cause of `authorization`, `external` or `missing_input`), the question text, a proposed
answer, all six risk facts (`reversible`, `outward`, `spends`, `touchesProduction`,
`destructive`, `changesAccess`, each `true` or `false`), and zero or more topics from the
project's effective policy. The command SHALL compute the disposition inside its own write
from the effective policy, the step's phase and the facts, SHALL store the question with the
basis that produced the disposition, SHALL record the authenticated principal as submitter
and the attempt's executor person, and SHALL answer the disposition. A submission missing any
fact, naming an unknown topic, a cause without `blocker`, a parent work item, an attempt that
is not the node's running one, or a node that already holds an unresolved blocked question
SHALL be refused as a typed 4xx and SHALL write nothing. The command SHALL NOT enter the
command journal.

#### Scenario: a complete submission is stored with its disposition

- **GIVEN** a leaf with a running attempt 1 on `Dev`, a project under the deployment default
  policy with `Dev` in phase `implementation`
- **WHEN** `submitQuestion` carries a `decision`, `reversible: true` and the other five facts
  `false`, and no topic
- **THEN** the response reads `disposition: 'queued'`, the question lists on the node with
  attempt number 1, submitter and basis, and the node's reading is unchanged

#### Scenario: a missing fact is refused, not defaulted

- **GIVEN** the same leaf
- **WHEN** `submitQuestion` omits `destructive`
- **THEN** the command is refused with `risk_fact_missing` naming `destructive`, and the node
  lists no question

#### Scenario: a parent cannot carry a question

- **GIVEN** a parent work item
- **WHEN** `submitQuestion` names it
- **THEN** the command is refused with `question_needs_leaf`

#### Scenario: the attempt must be the running one

- **GIVEN** a node whose attempt 1 ended and whose attempt 2 runs
- **WHEN** `submitQuestion` names attempt 1
- **THEN** the command is refused with `attempt_not_running`

### Requirement: Disposition follows hard gates, then offline, then the phase profile, then topics

A question with any hard-gate fact true (`spends`, `touchesProduction`, `destructive`,
`changesAccess`) SHALL be `blocked` under every mode and profile. Otherwise under mode
`offline` the question SHALL be `queued`. Otherwise the step's phase profile SHALL apply: a
fact condition the profile lists under `blocks` that the question matches makes it `blocked`;
else a condition under `notifies` that it matches, or a topic the policy pushes for that phase,
makes it `notified`; else `queued`. A fact condition names a fact and the value that matches.
The deployment default SHALL be: `planning` blocks on `outward: true` and on
`reversible: false`; `implementation` notifies on `outward: true` and on `reversible: false`;
no topics. A topic SHALL never make a question `blocked`.

#### Scenario: a hard gate blocks even offline and even on a pushed topic

- **GIVEN** a project in mode `offline` whose policy pushes the topic `product`
- **WHEN** a question declares `destructive: true` and names `product`
- **THEN** its disposition is `blocked`

#### Scenario: offline queues what the gates allow

- **GIVEN** a project in mode `offline` whose policy pushes `product`
- **WHEN** a question with `outward: true`, `reversible: false` and topic `product` is submitted
- **THEN** its disposition is `queued` and no notice is written

#### Scenario: planning blocks what implementation only notifies

- **GIVEN** a project in mode `by_step` under the default profiles, with `Design` in phase
  `planning` and `Dev` in phase `implementation`, each with a running attempt
- **WHEN** the same question with `outward: true` and `reversible: true` is submitted on each
- **THEN** the `Design` node's question is `blocked` and the `Dev` node's is `notified`

#### Scenario: a false fact can be the matching condition

- **GIVEN** `Dev` in phase `implementation` under the default profile
- **WHEN** a question with `reversible: false` and every other fact `false` is submitted
- **THEN** its disposition is `notified`

#### Scenario: a pushed topic notifies and nothing more

- **GIVEN** the topic `product` pushed for `implementation`
- **WHEN** a question with `reversible: true`, every other fact `false`, naming `product`
- **THEN** its disposition is `notified`

### Requirement: A blocked question owns a step blockage until a reviewer resolves it

When a question's disposition is `blocked`, the same write SHALL set a step blockage on the
node and record its instant on the question, SHALL end the raising attempt with outcome
`failed` and the question as its reference, SHALL release the submitter's claim on the node
when one exists, and SHALL write one `opened` notice per reviewer. If the node already holds a
step blockage, the submission SHALL be refused `node_already_blocked`; if the project's
blockage writers are inactive, it SHALL be refused `step_blockage_inactive`; either way nothing
is written. While a blocked question is unresolved, the step blockage command SHALL refuse to
clear or replace that node's blockage, `startAttempt` SHALL refuse on that node, and plan
import SHALL refuse a document that would overwrite it, each with `question_blocking`. The
`resolveQuestion` command, carrying the answer and optionally wrong facts, SHALL store them
and the reviewer, SHALL refuse `blockage_changed` when the node's blockage is no longer the
one the question wrote, and otherwise SHALL remove the blockage in the same write. Resolve
SHALL be accepted only from a principal permitted to edit the project's plan, never from a
machine caller, and only on a blocked question without a verdict.

#### Scenario: blocking stops the attempt and the node

- **GIVEN** a `Design` node under the planning profile with running attempt 2, a claim by the
  submitting agent, no done statement, no hold, and a project with two reviewers
- **WHEN** a question with `outward: true` is submitted
- **THEN** attempt 2 reads `failed` with reference `question:<id>`, the claim is released, the
  node reads `blocked`, and each reviewer holds one `opened` notice naming the question

#### Scenario: the blockage cannot be cleared around the question

- **GIVEN** that blocked question
- **WHEN** the step blockage command clears the node's blockage
- **THEN** it is refused with `question_blocking` and the blockage stays

#### Scenario: the node cannot be restarted around the question

- **GIVEN** that blocked question
- **WHEN** `startAttempt` names the node
- **THEN** it is refused with `question_blocking`

#### Scenario: resolving removes the impediment in one act

- **GIVEN** that blocked question, and a node with no hold, no claim and every predecessor done
- **WHEN** a permitted reviewer resolves it with an answer
- **THEN** the question reads `resolved` with the answer, the node holds no step blockage, is
  startable, and the answer is readable on the question by the next attempt

#### Scenario: a machine caller cannot resolve

- **GIVEN** that blocked question
- **WHEN** a machine credential's caller resolves it
- **THEN** the command is refused with `forbidden` and the blockage stays

#### Scenario: a pre-existing blockage refuses the submission

- **GIVEN** a node that holds a step blockage set by hand and a running attempt
- **WHEN** a hard-gated question is submitted on it
- **THEN** the command is refused with `node_already_blocked` and no question, attempt end or
  notice is written

### Requirement: Notified questions write their notices in the submit write

When a question's disposition is `notified`, the same write SHALL write one `opened` notice
per reviewer. A failure to write any notice SHALL roll back the question.

#### Scenario: one opened notice per reviewer

- **GIVEN** two reviewers with addresses
- **WHEN** a question opens `notified`
- **THEN** two `opened` notices exist, one per reviewer, each `queued`

#### Scenario: an outbox failure rolls back the question

- **GIVEN** a notice store that throws on write
- **WHEN** a question that would be `notified` is submitted
- **THEN** the command fails and the node lists no question

### Requirement: A queued or notified question is reviewed, and an overturn becomes work

The `reviewQuestion` command SHALL carry a verdict of `accepted` or `overturned`, for
`overturned` the real answer, and optionally the declared facts the reviewer marks wrong. It
SHALL be accepted only from a principal permitted to edit the project's plan, never from a
machine caller, and only on a `queued` or `notified` question without a verdict. `accepted`
SHALL close the question. `overturned` SHALL close it and, in the same write, create one
work item as a sibling of the question's leaf (the same parent, including none for a top-level
leaf), titled from the question, carrying the question, the proposed answer and the real
answer in its body, holding the leaf's priority as it is at review time, and SHALL record
that work item's id on the question. Neither command SHALL enter the command journal. The
follow-up is an ordinary work item afterwards; its deletion SHALL leave the question reading
`follow_up_deleted`. A second review SHALL be refused `question_already_reviewed`.

#### Scenario: an overturn creates the follow-up beside the leaf

- **GIVEN** a queued question on leaf `L` under parent `P`, `L` at priority 2
- **WHEN** a permitted reviewer overturns it with an answer
- **THEN** one new work item sits under `P` beside `L`, at priority 2, with a body holding the
  question and the answer, and the question names it

#### Scenario: a top-level leaf's follow-up is top-level

- **GIVEN** a queued question on a leaf with no parent
- **WHEN** it is overturned
- **THEN** the follow-up has no parent

#### Scenario: a wrong fact is counted apart from a wrong answer

- **GIVEN** a queued question declaring `outward: false`
- **WHEN** a reviewer accepts it and marks `outward` wrong
- **THEN** the question reads `accepted` with `outward` among its wrong facts, and the
  project's counts show a wrong-fact rate of 1 and an overturn rate of 0

#### Scenario: deleting the follow-up keeps the question's record

- **GIVEN** an overturned question whose follow-up exists
- **WHEN** the follow-up is deleted
- **THEN** the question still reads `overturned` and reports `follow_up_deleted`

### Requirement: A question policy is read per project, inherited, parsed, and snapshotted

Every project SHALL read an effective question policy: its own row, else its organization's,
else the deployment default, with the source named. A row that exists but cannot be parsed
SHALL throw, never inherit. A policy SHALL hold a mode (`by_step` or `offline`), one profile
per phase of fact conditions under `blocks` and `notifies`, a topic list with a push flag per
phase, an unanswered age, an unnoticed age, and digest settings. Hard gates SHALL NOT be part
of the policy; a write naming one SHALL be refused `hard_gate_not_writable`. Writing a policy
SHALL require the permission to administer its scope, SHALL bump its version and SHALL write
one audit row in the same transaction. A question SHALL store a basis snapshot (source,
version, hard-gate revision, phase, mode, the profile applied, pushed topics) from which its
disposition can be replayed without any policy row. Each step definition SHALL carry a phase,
`implementation` unless set.

#### Scenario: a project without its own row reads the organization's

- **GIVEN** an organization with its own policy in mode `offline` and a project with none
- **WHEN** the project's policy is read
- **THEN** it reads mode `offline` with source `organization`

#### Scenario: a malformed row throws rather than inherits

- **GIVEN** a project row whose `profiles` column holds text that is not a profile
- **WHEN** the project's policy is read
- **THEN** the read throws naming the row, and no default is applied

#### Scenario: a policy change leaves old dispositions and their basis alone

- **GIVEN** a question disposed `notified` whose basis names project version 3
- **WHEN** the project's policy is rewritten so the same facts would now block
- **THEN** the question still reads `notified` and its basis still replays `notified`

#### Scenario: hard gates cannot be written

- **WHEN** a policy write lists `destructive` under `blocks`
- **THEN** it is refused with `hard_gate_not_writable`

#### Scenario: a policy write and its audit row commit together

- **GIVEN** an audit store that throws on write
- **WHEN** a policy is written
- **THEN** the write fails and the policy row is unchanged

### Requirement: Reviewers are accounts on a project list, and notices are leased out

A project SHALL hold a list of reviewer accounts, each with a channel and address, edited
under the permission to administer the project. With an empty list no notice SHALL be
written. A notice SHALL be written per reviewer when a question opens `blocked` or `notified`
(`opened`), once when a `blocked` question passes the unanswered age unresolved (`aged`), and
once per project, reviewer and day at the digest hour in the project's timezone when the
digest is on and the project holds any unreviewed question (`digest`, carrying the count, the
oldest age and the top three by question priority). A reviewer without an address SHALL make
the notice `undeliverable` at write time and SHALL still be permitted to review. A delivery
worker SHALL lease due notices exclusively, report each attempt idempotently by attempt
number, and a failed attempt SHALL reschedule on the bounded schedule 1, 5, 30 and 120 minutes
and leave the notice `failed` after the fifth attempt, never dropped. A report with a stale
lease SHALL be refused `lease_lost` and change nothing. Delivery is at least once.

#### Scenario: a failed attempt reschedules with its error

- **GIVEN** a leased notice
- **WHEN** attempt 1 is reported failed with the gateway's error text
- **THEN** the notice is `queued`, holds one attempt with that text, and is due in 1 minute

#### Scenario: the fifth failure ends retries

- **GIVEN** a notice with four failed attempts
- **WHEN** attempt 5 is reported failed
- **THEN** the notice is `failed` and is never leased again

#### Scenario: a stale lease cannot report

- **GIVEN** a notice whose lease expired and was leased again
- **WHEN** the old lease token reports success
- **THEN** the report is refused with `lease_lost` and the notice stays `leased`

#### Scenario: aged fires once under concurrent sweeps

- **GIVEN** a blocked question older than the unanswered age and no `aged` notice
- **WHEN** two sweeps run at once
- **THEN** exactly one `aged` notice exists per reviewer

#### Scenario: one digest per reviewer per day

- **GIVEN** the digest on, two unreviewed questions, and a digest already written today
- **WHEN** the sweep runs again today
- **THEN** no second digest exists for that reviewer

### Requirement: Question priority and counts are derived on read

The review queue SHALL list a project's unreviewed questions by question priority: the leaf's
priority ascending with absent last, then downstream reach descending, then submitted instant
ascending, where downstream reach is the number of distinct step nodes reachable from the
question's node over successor dependency edges, deduplicated, whose reading is neither done
nor skipped. Nothing of this order SHALL be stored. The project SHALL report, overall and per
submitter: unnoticed (`queued` or `notified`, no verdict, older than the effective unnoticed
age), overturn rate (`overturned` over accepted plus overturned, absent when none),
wrong-fact rate (reviews or resolves with at least one wrong fact over all verdicts, absent
when none), and blocked time (sum over blocked questions of resolve instant or now minus
submit instant).

#### Scenario: the bigger reach sorts first among equals

- **GIVEN** two queued questions on leaves at priority 1; one node has three distinct not-done
  successors reached through a diamond, the other has none
- **WHEN** the queue is read
- **THEN** the question with reach 3 is first

#### Scenario: done successors do not count

- **GIVEN** a node with two successors, one done
- **WHEN** its question's reach is read
- **THEN** reach is 1

#### Scenario: unnoticed counts age, not verdict, and not blocked

- **GIVEN** an unnoticed age of 7 days, one queued question 8 days old, one 2 days old, one
  accepted question 30 days old, and one blocked question 10 days old
- **WHEN** the counts are read
- **THEN** unnoticed is 1

#### Scenario: rates are absent before any verdict

- **GIVEN** a project with two queued questions and no verdict
- **WHEN** the counts are read
- **THEN** overturn rate and wrong-fact rate are absent, not zero

### Requirement: Work items and attempts holding questions are not deleted

The work-item delete command SHALL refuse `work_item_holds_questions` when the item or any
descendant holds a question; `removeAttempt` SHALL refuse `attempt_holds_questions` on a
referenced attempt. A first-child hand-down SHALL carry the leaf's questions to the new child
with their attempts.

#### Scenario: a parent above a question cannot be deleted

- **GIVEN** a parent whose grandchild leaf holds a question
- **WHEN** the parent is deleted
- **THEN** the command is refused with `work_item_holds_questions`

#### Scenario: hand-down keeps the question on the attempt

- **GIVEN** a leaf with attempt 1 holding a question
- **WHEN** the leaf gains its first child
- **THEN** the question lists on the child's node with attempt 1

### Requirement: mcp-01 derives the question tools

The derived MCP tool set SHALL include submitting a question, listing a project's questions
with their dispositions, reviews and counts, and reading one question. Review and resolve SHALL
be derived too and SHALL be refused `forbidden` for a machine caller by the service.

#### Scenario: an agent reads the answer after resolve

- **GIVEN** a resolved question
- **WHEN** a machine credential's caller reads it over MCP
- **THEN** the response carries the reviewer's answer

#### Scenario: a machine credential cannot review

- **WHEN** a machine credential's caller calls the review tool
- **THEN** the call is refused with `forbidden`
