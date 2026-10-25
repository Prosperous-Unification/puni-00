## ADDED Requirements

### Requirement: A question is submitted against a step node and disposed of by the plan

A project SHALL accept one plan command, `submitQuestion`, carrying a leaf work item, a step,
the running attempt that raises it, a kind (`decision`, or `blocker` with a cause of
`authorization`, `external` or `missing_input`), the question text, a proposed answer, all
six risk facts (`reversible`, `outward`, `spends`, `touchesProduction`, `destructive`,
`changesAccess`, each `true` or `false`), and zero or more topics from the project's topic
list. The command SHALL compute the question's disposition inside its own write from the
project's effective question policy, the step's phase and the declared facts, SHALL store the
question with the policy version that produced the disposition, and SHALL answer the
disposition to the caller. A submission missing any risk fact, naming a topic the project
does not hold, naming a parent work item, or naming an attempt that is not running on that
node SHALL be refused as a typed 4xx and SHALL write nothing. A question SHALL never be
deleted, and a work item's deletion SHALL be refused while it holds a question.

#### Scenario: a complete submission is stored with its disposition

- **GIVEN** a leaf with a running attempt on `Dev`, and a project under the deployment
  default policy with `Dev` in the `implementation` phase
- **WHEN** `submitQuestion` carries a `decision`, the six facts all `false`, and no topic
- **THEN** the response reads `disposition: 'queued'`, the question is listed on the node with
  the attempt's number and the policy version, and the node's reading is unchanged

#### Scenario: a missing fact is refused, not defaulted

- **GIVEN** the same leaf
- **WHEN** `submitQuestion` omits `destructive`
- **THEN** the command is refused with `risk_fact_missing` naming `destructive`, and the node
  lists no question

#### Scenario: a parent cannot carry a question

- **GIVEN** a parent work item
- **WHEN** `submitQuestion` names it
- **THEN** the command is refused with `question_needs_leaf`

### Requirement: Disposition follows hard gates, then the phase profile, then topics

The plan SHALL dispose of a question in this order. A question with any hard-gate fact true
(`spends`, `touchesProduction`, `destructive`, `changesAccess`) SHALL be `blocked` under
every mode and profile. Otherwise under mode `offline` the question SHALL be `queued`.
Otherwise the step's phase profile SHALL apply: a fact the profile lists as blocking makes the
question `blocked`; else a fact the profile lists as notifying, or a topic flagged push for
that phase, makes it `notified`; else `queued`. The deployment default profiles SHALL be:
`planning` blocks on any true fact other than `reversible` and on `reversible: false`;
`implementation` blocks on hard gates only and notifies on `outward` and on
`reversible: false`. A topic SHALL never make a question `blocked`.

#### Scenario: a hard gate blocks even offline

- **GIVEN** a project in mode `offline`
- **WHEN** a question declares `destructive: true`
- **THEN** its disposition is `blocked`

#### Scenario: offline queues what the gates allow

- **GIVEN** a project in mode `offline` and a question on a pushed topic with `outward: true`
- **WHEN** it is submitted
- **THEN** its disposition is `queued` and no notice is written

#### Scenario: planning blocks what implementation only notifies

- **GIVEN** a project in mode `by_step` under the default profiles, with `Design` in phase
  `planning` and `Dev` in phase `implementation`
- **WHEN** the same question with `outward: true` is submitted on each step
- **THEN** the `Design` node's question is `blocked` and the `Dev` node's is `notified`

#### Scenario: a pushed topic notifies and nothing more

- **GIVEN** the topic `product` flagged push for `implementation`
- **WHEN** a question with every fact `false` except `reversible: true` names `product`
- **THEN** its disposition is `notified`

### Requirement: A blocked question owns a step blockage until a reviewer resolves it

When a question's disposition is `blocked`, the same write SHALL set a step blockage on the
node, SHALL end the raising attempt with outcome `failed` and the question as its reference,
and SHALL write one `opened` notice per reviewer. A node SHALL hold at most one unresolved
blocked question; a second blocked submission on the same node SHALL be refused with
`question_already_blocking`. The `resolveQuestion` command, carrying the reviewer's answer,
SHALL store the answer and the reviewer, remove the step blockage, and leave the node
startable, all in one write. Resolve SHALL be accepted only from a reviewer of the project
and only on a blocked, unresolved question.

#### Scenario: blocking stops the attempt and the node

- **GIVEN** a running attempt on a `Design` node under the planning profile
- **WHEN** a question with `outward: true` is submitted
- **THEN** the attempt reads `failed` with the question as its reference, the node reads
  `blocked`, and each reviewer holds one `opened` notice naming the question

#### Scenario: resolving frees the node in one act

- **GIVEN** that blocked question
- **WHEN** a reviewer resolves it with an answer
- **THEN** the question reads `resolved` with the answer, the node holds no step blockage, is
  startable, and the answer is readable on the question by the next attempt

#### Scenario: a non-reviewer cannot resolve

- **GIVEN** that blocked question and a project member who is not a reviewer
- **WHEN** they resolve it
- **THEN** the command is refused with `forbidden` and the blockage stays

### Requirement: A queued or notified question is reviewed, and an overturn becomes work

The `reviewQuestion` command SHALL carry a verdict of `accepted` or `overturned`, and for
`overturned` the real answer, and MAY mark any declared risk fact as wrong. It SHALL be
accepted only from a reviewer and only on a `queued` or `notified` question without a review.
`accepted` SHALL close the question. `overturned` SHALL close it and, in the same write,
create one follow-up work item as a child of the question's leaf's parent, titled from the
question, carrying the question and the reviewer's answer in its body, holding the leaf's
priority, and SHALL record that work item's id on the question. A second review SHALL be
refused with `question_already_reviewed`.

#### Scenario: an overturn creates the follow-up work item

- **GIVEN** a queued question on leaf `L` whose priority is 2
- **WHEN** a reviewer overturns it with an answer
- **THEN** one new work item sits beside `L` under the same parent, with priority 2, a body
  that holds the question and the answer, and the question names it

#### Scenario: a wrong fact is counted apart from a wrong answer

- **GIVEN** a queued question declaring `outward: false`
- **WHEN** a reviewer accepts it and marks `outward` wrong
- **THEN** the question reads `accepted` with `outward` among its wrong facts, and the
  project's counts show one wrong fact and zero overturns

### Requirement: A question policy is read per project, inherited, and versioned

Every project SHALL read an effective question policy: its own row, else its organization's,
else the deployment default, with the source named. A policy SHALL hold a mode (`by_step` or
`offline`), one profile per phase, a topic list with a push flag per phase, an unanswered age,
an unnoticed age, and digest settings. Hard gates SHALL NOT be part of the policy and SHALL
NOT be writable. Writing a policy SHALL bump its version and SHALL write one audit row; a
question stores the version it was disposed under and SHALL NOT change disposition when the
policy changes. Each step definition SHALL carry a phase, `implementation` unless set, edited
with the step.

#### Scenario: a project without its own row reads the organization's

- **GIVEN** an organization with its own policy in mode `offline` and a project with none
- **WHEN** the project's policy is read
- **THEN** it reads mode `offline` with source `organization`

#### Scenario: a policy change leaves old dispositions alone

- **GIVEN** a question disposed `notified` under policy version 3
- **WHEN** the project's policy is rewritten so the same facts would now block
- **THEN** the question still reads `notified` under version 3

#### Scenario: hard gates cannot be written

- **WHEN** a policy write names a hard gate
- **THEN** it is refused with `hard_gate_not_writable`

### Requirement: Reviewers receive notices, and delivery failure is recorded

A project SHALL name its reviewers, the owner when none are named, each with a channel and
address. A notice SHALL be written per reviewer when a question opens `blocked` or
`notified` (`opened`), when a `blocked` question passes the unanswered age unresolved
(`aged`, once), and once per day at the digest hour when the digest is on and the project
holds any unreviewed question (`digest`, carrying the count, the oldest age and the top
three by question priority). A delivery adapter SHALL take undelivered notices in order,
record each attempt and its last error on the row, and SHALL retry a failed notice with a
bounded schedule then leave it `failed`, never dropping it. A reviewer without an address for
the project's channel SHALL make the notice `undeliverable` at write time.

#### Scenario: one opened notice per reviewer

- **GIVEN** two reviewers with addresses
- **WHEN** a question opens `notified`
- **THEN** two `opened` notices exist, one per reviewer, each undelivered

#### Scenario: a failed delivery keeps its error

- **GIVEN** an undelivered notice and an adapter whose gateway refuses
- **WHEN** delivery runs
- **THEN** the notice holds one attempt with the gateway's error text and is still queued for
  retry

#### Scenario: aged fires once

- **GIVEN** a blocked question older than the unanswered age with an `aged` notice already
  written
- **WHEN** the aging pass runs again
- **THEN** no second `aged` notice is written

### Requirement: Question priority and counts are derived on read

The review queue SHALL list a project's unreviewed questions ordered by question priority:
the work item's priority ascending with absent last, then the count of not-done step nodes
whose startability transitively waits on the question's node descending, then submitted
instant ascending. Nothing of this order SHALL be stored. The project SHALL report, overall
and per submitting agent: unnoticed questions (unreviewed past the unnoticed age), overturn
rate among reviewed, wrong-fact rate among reviewed, and blocked time (sum of open time of
resolved blocked questions, and of open time to now for unresolved ones).

#### Scenario: the bigger unlock sorts first among equals

- **GIVEN** two queued questions on leaves of priority 1, one on a node three not-done nodes
  wait on and one on a node nothing waits on
- **WHEN** the queue is read
- **THEN** the question with three waiting nodes is first

#### Scenario: unnoticed counts age, not verdict

- **GIVEN** an unnoticed age of 7 days, one queued question 8 days old, one 2 days old, and
  one accepted question 30 days old
- **WHEN** the counts are read
- **THEN** unnoticed is 1

### Requirement: mcp-01 derives the question tools

The derived MCP tool set SHALL include submitting a question, listing a project's questions
with their dispositions and reviews, and reading one question, so an agent session learns
the disposition and, after a resolve, the reviewer's answer. Review and resolve SHALL be
derived too but SHALL be refused for a machine credential's caller.

#### Scenario: an agent reads the answer after resolve

- **GIVEN** a resolved question
- **WHEN** a machine credential's caller reads it over MCP
- **THEN** the response carries the reviewer's answer

#### Scenario: a machine credential cannot review

- **WHEN** a machine credential's caller calls the review tool
- **THEN** the call is refused with `forbidden`
