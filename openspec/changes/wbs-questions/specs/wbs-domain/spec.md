## ADDED Requirements

Every scenario below runs on the same fixture unless its GIVEN says otherwise: a project in
mode `by_step` under the deployment default policy and no topics, steps `Design` (phase
`planning`) and `Dev` (phase `implementation`), a leaf `L` under parent `P` with a running
attempt 1 on each step executed by person `A`, no done statement, no hold, no skip and no
blockage on either node, two reviewer accounts with addresses, and a submitting agent
credential pinned to `A`. "The six facts" means every fact stated; a scenario that names some
facts means the rest are `false`, except `reversible`, which is `true` unless named.

### Requirement: A question is submitted against a step node and disposed of by the plan

A project SHALL accept one plan command, `submitQuestion`, carrying a leaf work item, a step,
the attempt number of that node's running attempt, a kind (`decision`, or `blocker` with a
cause of `authorization`, `external` or `missing_input`), the question text, a proposed
answer, all six risk facts (`reversible`, `outward`, `spends`, `touchesProduction`,
`destructive`, `changesAccess`, each `true` or `false`), and zero or more topics from the
project's effective policy. The command SHALL be accepted only from the attempt's executor:
an agent credential (`machine` or `consent`) pinned to the executor person, or a user whose
bound persons include it. It SHALL compute the disposition inside its own write from the
effective policy, the step's phase and the facts, SHALL store the question with the basis
that produced the disposition, the principal as submitter and the executor person, and SHALL
answer the disposition. A submission missing any fact, naming an unknown topic, a cause
without `blocker`, a parent work item, an attempt that is not the node's running one, a node
that already holds an unresolved blocked question, or coming from anyone but the executor
SHALL be refused as a typed 4xx and SHALL write nothing. The command SHALL NOT enter the
command journal.

#### Scenario: a complete submission is stored with its disposition

- **WHEN** `submitQuestion` on `L`/`Dev` attempt 1 carries a `decision` with the six facts
  `reversible: true` and the rest `false`
- **THEN** the response reads `disposition: 'queued'`, the question lists on the node with
  attempt number 1, submitter kind `machine`, executor `A` and a basis, and the node's reading
  is unchanged

#### Scenario: a missing fact is refused, not defaulted

- **WHEN** `submitQuestion` omits `destructive`
- **THEN** the command is refused with `risk_fact_missing` naming `destructive`, and the node
  lists no question

#### Scenario: a parent cannot carry a question

- **WHEN** `submitQuestion` names `P`
- **THEN** the command is refused with `question_needs_leaf`

#### Scenario: the attempt must be the running one

- **GIVEN** `L`/`Dev` whose attempt 1 ended and whose attempt 2 runs
- **WHEN** `submitQuestion` names attempt 1
- **THEN** the command is refused with `attempt_not_running`

#### Scenario: only the executor submits

- **GIVEN** an agent credential pinned to person `B`
- **WHEN** it submits on `L`/`Dev` attempt 1
- **THEN** the command is refused with `forbidden`

#### Scenario: a consent credential is recorded as itself

- **GIVEN** a `consent` credential pinned to `A` and bound to account `U`
- **WHEN** it submits
- **THEN** the question's submitter is kind `consent` with the credential id, not `U`

### Requirement: Disposition follows hard gates, then offline, then the phase profile, then topics

A question with any hard-gate fact true (`spends`, `touchesProduction`, `destructive`,
`changesAccess`) SHALL be `blocked` under every mode and profile. Otherwise under mode
`offline` the question SHALL be `queued`. Otherwise the step's phase profile SHALL apply: a
fact condition under `blocks` that the question matches makes it `blocked`; else a condition
under `notifies` that it matches, or a topic the policy pushes for that phase, makes it
`notified`; else `queued`. A fact condition names a fact and the value that matches. The
deployment default SHALL be: `planning` blocks on `outward: true` and on `reversible: false`;
`implementation` notifies on `outward: true` and on `reversible: false`; no topics. A topic
SHALL never make a question `blocked`.

#### Scenario: a hard gate blocks before offline

- **GIVEN** mode `offline`
- **WHEN** a question declares `destructive: true`
- **THEN** its disposition is `blocked`

#### Scenario: offline queues before the profile

- **GIVEN** mode `offline`, the topic `product` pushed for both phases
- **WHEN** a question on `Design` declares `outward: true` and names `product`
- **THEN** its disposition is `queued` and no notice is written

#### Scenario: a blocking condition wins over a pushed topic

- **GIVEN** the topic `product` pushed for `planning`
- **WHEN** a question on `Design` declares `outward: true` and names `product`
- **THEN** its disposition is `blocked`

#### Scenario: a notifying condition wins over queued

- **WHEN** a question on `Dev` declares `reversible: false`
- **THEN** its disposition is `notified`

#### Scenario: a pushed topic notifies with no condition matched

- **GIVEN** the topic `product` pushed for `implementation`
- **WHEN** a question on `Dev` with `reversible: true` names `product`
- **THEN** its disposition is `notified`

#### Scenario: planning blocks what implementation only notifies

- **WHEN** a question with `outward: true` is submitted on `Design` and on `Dev`
- **THEN** the `Design` question is `blocked` and the `Dev` question is `notified`

### Requirement: A blocked question owns a step blockage until a reviewer resolves it

When a question's disposition is `blocked`, the same write SHALL set a step blockage on the
node and record its instant on the question, SHALL end the raising attempt with outcome
`failed` and the question as its reference, SHALL remove the executor person's claim on that
node when one exists without journalling it, and SHALL write one `opened` notice per
reviewer. If the node already holds a step blockage, the submission SHALL be refused
`node_already_blocked`; if the project's blockage writers are inactive, `step_blockage_inactive`;
either way nothing is written. While a blocked question is unresolved, `setStepBlocked` with
`isBlocked: false` and a replayed blockage replacement whose expected instant matches SHALL
refuse `question_blocking`, and `startAttempt` SHALL refuse `question_blocking` on that node.
The `resolveQuestion` command, carrying the answer and optionally wrong facts, SHALL store
them and the reviewer, SHALL refuse `blockage_changed` when the node's blockage is no longer
the one the question wrote, and otherwise SHALL remove the blockage in the same write. Resolve
SHALL be accepted only from a principal holding `package.write` at the leaf's work package,
never from an agent credential, and only on a blocked question without a verdict.

#### Scenario: blocking stops the attempt and the node

- **GIVEN** a claim by `A` on `L`/`Design`
- **WHEN** a question with `outward: true` is submitted on `Design`
- **THEN** attempt 1 reads `failed` with reference `question:<id>`, `A` holds no claim on
  that node, the node reads `blocked`, each reviewer holds one `opened` notice naming the
  question, and the command journal holds no new entry

#### Scenario: the blockage cannot be cleared around the question

- **GIVEN** that blocked question
- **WHEN** `setStepBlocked` with `isBlocked: false` names the node
- **THEN** it is refused with `question_blocking` and the blockage stays

#### Scenario: a matching replay cannot clear it either

- **GIVEN** that blocked question and a replayed replacement whose expected instant equals the
  blockage's
- **WHEN** the replay runs
- **THEN** it is refused with `question_blocking`

#### Scenario: the node cannot be restarted around the question

- **GIVEN** that blocked question
- **WHEN** `startAttempt` names the node
- **THEN** it is refused with `question_blocking`

#### Scenario: resolving removes the owned blockage

- **GIVEN** that blocked question and a user with `package.write`
- **WHEN** the user resolves it with an answer
- **THEN** the question reads `resolved` with the answer, the node holds no step blockage and
  no longer reads `blocked`, and the answer is readable on the question

#### Scenario: a replaced blockage refuses resolve

- **GIVEN** that blocked question, and the node's blockage replaced by replay with a later
  instant
- **WHEN** the question is resolved
- **THEN** it is refused with `blockage_changed` and nothing changes

#### Scenario: an agent credential cannot resolve

- **GIVEN** that blocked question and a `consent` credential whose account holds
  `package.write`
- **WHEN** it resolves
- **THEN** the command is refused with `forbidden` and the blockage stays

#### Scenario: a pre-existing blockage refuses the submission

- **GIVEN** `L`/`Dev` blocked by hand
- **WHEN** a hard-gated question is submitted on it
- **THEN** the command is refused with `node_already_blocked` and no question, attempt end,
  claim change or notice is written

### Requirement: Notified questions write their notices in the submit write

When a question's disposition is `notified`, the same write SHALL write one `opened` notice
per reviewer. A failure to write any notice SHALL roll back the question.

#### Scenario: one opened notice per reviewer

- **WHEN** a question opens `notified`
- **THEN** two `opened` notices exist, one per reviewer, each `queued`

#### Scenario: an outbox failure rolls back the question

- **GIVEN** a notice store that throws on write
- **WHEN** a question that would be `notified` is submitted
- **THEN** the command fails and the node lists no question

### Requirement: A queued or notified question is reviewed, and an overturn becomes work

The `reviewQuestion` command SHALL carry a verdict of `accepted` or `overturned`, for
`overturned` the real answer, and optionally the declared facts the reviewer marks wrong. It
SHALL be accepted only from a principal holding `package.write` at the leaf's work package,
never from an agent credential, and only on a `queued` or `notified` question without a
verdict. `accepted` SHALL close the question. `overturned` SHALL close it and, in the same
write, create one work item as a sibling of the question's leaf (the same parent, including
none for a top-level leaf), titled from the question, carrying the question, the proposed
answer and the real answer in its body, holding the leaf's priority as it is at review time,
and SHALL record that work item's id on the question. The verdict SHALL NOT enter the command
journal; the follow-up's creation SHALL enter it as an ordinary creation, whose undo deletes
the follow-up and leaves the verdict. A deleted follow-up SHALL leave the question reading
`follow_up_deleted`. A second review SHALL be refused `question_already_reviewed`.

#### Scenario: an overturn creates the follow-up beside the leaf

- **GIVEN** a queued question on `L`, `L` at priority 2, a user with `package.write`
- **WHEN** the user overturns it with an answer
- **THEN** one new work item sits under `P` beside `L`, at priority 2, with a body holding the
  question and the answer, the question names it, and the journal holds one creation entry

#### Scenario: undoing the creation keeps the verdict

- **GIVEN** that overturn
- **WHEN** the user undoes the creation
- **THEN** the follow-up is gone, the question still reads `overturned` and reports
  `follow_up_deleted`

#### Scenario: a top-level leaf's follow-up is top-level

- **GIVEN** a queued question on a leaf with no parent
- **WHEN** it is overturned
- **THEN** the follow-up has no parent

#### Scenario: a wrong fact is counted apart from a wrong answer

- **GIVEN** a queued question declaring `outward: false`
- **WHEN** a user accepts it and marks `outward` wrong
- **THEN** the question reads `accepted` with `outward` among its wrong facts, and the
  project's counts show a wrong-fact rate of 1 and an overturn rate of 0

### Requirement: A question policy is read per project, inherited, parsed, and snapshotted

Every project SHALL read an effective question policy: its own row, else its organization's,
else the deployment default, with the source named. A row that exists but cannot be parsed
SHALL throw, never inherit. A policy SHALL hold a mode (`by_step` or `offline`), one profile
per phase of fact conditions under `blocks` and `notifies`, a topic list with a push flag per
phase, an unanswered age, an unnoticed age, and digest settings. Hard gates SHALL NOT be part
of the policy; a write naming one SHALL be refused `hard_gate_not_writable`. Writing a project
policy or its reviewer list SHALL require `project.manage_settings`; writing an organization
policy SHALL require `organization.manage_access`; each write SHALL bump the version and
write one audit row (`question_policy_changed` on subject kind `question_policy`, or
`project_reviewers_changed` on subject kind `project`) in the same transaction. A question
SHALL store a basis snapshot (source, version, the hard-gate set, phase, mode, the profile
applied, pushed topics) from which its disposition replays with no policy row and no current
constant. Each step definition SHALL carry a phase, `implementation` unless set.

#### Scenario: a project without its own row reads the organization's

- **GIVEN** an organization policy in mode `offline` and a project with no row
- **WHEN** the project's policy is read
- **THEN** it reads mode `offline` with source `organization`

#### Scenario: a malformed row throws rather than inherits

- **GIVEN** a project row whose `profiles` column holds text that is not a profile
- **WHEN** the project's policy is read
- **THEN** the read throws naming the row, and no default is applied

#### Scenario: a policy change leaves old dispositions and their basis alone

- **GIVEN** a question disposed `notified` whose basis names project version 3
- **WHEN** the project's policy is rewritten so the same facts would now block
- **THEN** the question still reads `notified` and replaying its basis gives `notified`

#### Scenario: a hard-gate change leaves the basis replayable

- **GIVEN** a question disposed `blocked` by `spends: true`
- **WHEN** the deployment's hard-gate set is changed to drop `spends`
- **THEN** replaying the stored basis still gives `blocked`

#### Scenario: hard gates cannot be written

- **WHEN** a policy write lists `destructive` under `blocks`
- **THEN** it is refused with `hard_gate_not_writable`

#### Scenario: a policy write and its audit row commit together

- **GIVEN** an audit store that throws on write
- **WHEN** a project policy is written by a user with `project.manage_settings`
- **THEN** the write fails and the policy row is unchanged

### Requirement: Reviewers are accounts on a project list, and notices are leased out

A project SHALL hold a list of reviewer accounts, each with a channel and address. With an
empty list no notice SHALL be written. A notice SHALL be written per reviewer when a question
opens `blocked` or `notified` (`opened`), once when a `blocked` question passes the unanswered
age unresolved (`aged`), and once per project, reviewer and day at the digest hour in the
project's timezone when the digest is on and the project holds any unreviewed question
(`digest`, carrying the count, the oldest age and the top three by question priority). A
reviewer without an address SHALL make the notice `undeliverable` at write time; address
absence SHALL NOT change review authority. A delivery worker SHALL lease due notices, each
lease naming the expected attempt number; a report SHALL be accepted only with the live token
and the expected number; a report identical to one recorded SHALL answer the recorded
outcome; the same number and token with a different outcome SHALL be refused
`report_conflict`; any other token or number SHALL be refused `lease_lost`; none of the
refusals SHALL change the notice. A failed attempt SHALL reschedule on 1, 5, 30 and 120
minutes and the notice SHALL be `failed` after the fifth attempt. A lease that expires
unreported SHALL count as a failed attempt. Delivery is at least once.

#### Scenario: a failed attempt reschedules with its error

- **GIVEN** a leased notice expecting attempt 1
- **WHEN** attempt 1 is reported `error` with the gateway's text
- **THEN** the notice is `queued`, holds one report with that text, and is due in 1 minute

#### Scenario: the fifth failure ends retries

- **GIVEN** a notice with four failed attempts, leased for attempt 5
- **WHEN** attempt 5 is reported `error`
- **THEN** the notice is `failed` and is never leased again

#### Scenario: a repeated report answers the recorded outcome

- **GIVEN** attempt 1 reported `error` and then re-leased for attempt 2
- **WHEN** the same attempt 1 report arrives again with its old token
- **THEN** the answer is the recorded outcome and the notice is unchanged

#### Scenario: a conflicting repeat is refused

- **GIVEN** attempt 1 reported `error`
- **WHEN** attempt 1 is reported `ok` with the same token
- **THEN** it is refused with `report_conflict` and the notice is unchanged

#### Scenario: a stale token cannot report

- **GIVEN** a notice whose lease expired and was leased again
- **WHEN** the old token reports attempt 2
- **THEN** it is refused with `lease_lost` and the notice is unchanged

#### Scenario: an expired lease counts as a failure

- **GIVEN** a notice leased for attempt 1 whose lease expired unreported
- **WHEN** the next lease pass runs
- **THEN** the notice holds a report `lost` for attempt 1 and is due for attempt 2

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
wrong-fact rate (verdicts with at least one wrong fact over all verdicts, absent when none),
and blocked time (sum over blocked questions of resolve instant or now minus submit instant).

#### Scenario: the bigger reach sorts first among equals

- **GIVEN** two queued questions on leaves at priority 1; one node reaches three distinct
  not-done successors through a diamond, the other none
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

- **GIVEN** two queued questions and no verdict
- **WHEN** the counts are read
- **THEN** overturn rate and wrong-fact rate are absent, not zero

### Requirement: Questions survive every structural operation of the new writer

No command SHALL delete a question. The work-item delete command and its replay SHALL refuse
`work_item_holds_questions` when the item or any descendant holds a question; work package
and space deletion SHALL check the same closure. `removeAttempt` and its replay SHALL refuse
`attempt_holds_questions`. A first-child hand-down, its undo and its redo SHALL carry attempts
holding questions by key update, never by delete and restore, refusing `stale_history` when
the attempt set no longer matches the entry.

#### Scenario: a parent above a question cannot be deleted

- **GIVEN** `P` whose grandchild leaf holds a question
- **WHEN** `P` is deleted
- **THEN** the command is refused with `work_item_holds_questions`

#### Scenario: hand-down and its undo keep the question on its attempt

- **GIVEN** `L` with attempt 1 holding a question
- **WHEN** `L` gains its first child, then the creation is undone
- **THEN** after the hand-down the question lists on the child's node with attempt 1, and
  after the undo it lists on `L`'s node with attempt 1

#### Scenario: a mounted partial index refuses a second unresolved blocked question

- **GIVEN** a mounted sqlite row for an unresolved blocked question on a node
- **WHEN** a second unresolved blocked row for the same node is inserted directly
- **THEN** the insert fails on the partial unique index

### Requirement: mcp-01 derives the question tools

The derived MCP tool set SHALL include submitting a question, listing a project's questions
with their dispositions, reviews and counts, and reading one question. Review and resolve SHALL
be derived too and SHALL be refused `forbidden` for an agent credential by the service.

#### Scenario: an agent reads the answer after resolve

- **GIVEN** a resolved question
- **WHEN** a `machine` credential's caller reads it over MCP
- **THEN** the response carries the reviewer's answer

#### Scenario: an agent credential cannot review

- **WHEN** a `machine` credential's caller calls the review tool
- **THEN** the call is refused with `forbidden`
