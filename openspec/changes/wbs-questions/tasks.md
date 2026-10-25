<!-- Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase. -->

Every negative below is watched failing **before** the production line is believed, and its
observed output goes into the adjacent `Proof:` comment and into `verify.md`'s table. One
branch per numbered section, each its own PR, in this order; section 0 is this proposal's PR.
Test names in backticks are the spec's scenario titles.

## 0. Words first

- [x] 0.1 `CONTEXT.md`: the nineteen terms after the step blockage activation receipt entry.
- [x] 0.2 `docs/adr/0059-a-question-is-a-satellite-fact-judged-by-the-plan.md`, proposed.

## 1. The pure core (D2, D3, D5, D10, D11)

- [ ] 1.1 `@wbs/domain`: `RiskFact`, `FactCondition`, `HARD_GATES`, `HARD_GATES_REVISION`,
      `Disposition`, `QuestionPolicy`, `DEFAULT_QUESTION_POLICY`, `parseQuestionPolicy`,
      `parseBasis`, `parseWrongFacts`, `parseNoticePayload`, `parseNoticeAttempts`, each
      throwing on corruption.
  - tests: `hard gates cannot be written`; one corruption case per parser
- [ ] 1.2 `disposeQuestion(policy, phase, facts, topics)` and `basisOf(...)`.
  - tests: one per scenario under "Disposition follows hard gates, then offline, then the
    phase profile, then topics"
  - negative: any two steps of the order swapped; watch
    `a hard gate blocks even offline and even on a pushed topic` fail
- [ ] 1.3 `downstreamReach(node, graph, readings)`, `questionPriority`, the comparator,
      `foldQuestionCounts`.
  - tests: `the bigger reach sorts first among equals`, `done successors do not count`,
    `unnoticed counts age, not verdict, and not blocked`, `rates are absent before any verdict`
  - negative: deduplication removed on a diamond; watch the first fail

## 2. Storage (D1, D6, D7)

- [ ] 2.1 Migrations `add_step_phase`, `add_question_policy`, `add_question`, `add_notice`,
      `add_project_reviewer`, `extend_organization_audit_actions`, each with `down.sql`;
      `schema.ts` with every check, the partial unique index on unresolved blocked questions,
      the two notice unique indexes, the attempt foreign key with update cascade and delete
      restrict; the ledger tests move.
  - tests: migration lint; rollback round trip; the attempt key update cascades to the
    question on a mounted sqlite
- [ ] 2.2 Ports `QuestionStore`, `QuestionPolicies`, `NoticeStore`, `ProjectReviewers`; sqlite
      and memory adapters; conformance suite.
  - tests: each forbidden pairing is unstorable; `a malformed row throws rather than inherits`

## 3. Submit (D2, D12, D13)

- [ ] 3.1 `submitQuestion` shape, parser refusals (`risk_fact_missing`, `question_needs_leaf`,
      `unknown_topic`, `cause_without_blocker`), `EVERY_KIND`, the pins.
  - tests: `a missing fact is refused, not defaulted`, `a parent cannot carry a question`
- [ ] 3.2 `QuestionService.submit`: node and attempt checks, effective policy and phase inside
      the unit of work, basis, store, principal attribution, answer the disposition.
  - tests: `a complete submission is stored with its disposition`,
    `the attempt must be the running one`
- [ ] 3.3 Notified path: opened notices per reviewer in the same write.
  - tests: `one opened notice per reviewer`, `an outbox failure rolls back the question`
- [ ] 3.4 Blocked path: blockage set with its instant recorded, attempt ended failed with the
      question reference, claim released, opened notices; refusals `node_already_blocked`,
      `question_blocking`, `step_blockage_inactive` leave nothing written.
  - tests: `blocking stops the attempt and the node`,
    `a pre-existing blockage refuses the submission`
  - negative: a throw injected into each of the five writes in turn; assert unchanged state

## 4. Ownership guards (D4)

- [ ] 4.1 Step blockage command, `startAttempt` and plan import refuse `question_blocking`
      on a node with an unresolved blocked question.
  - tests: `the blockage cannot be cleared around the question`,
    `the node cannot be restarted around the question`, import collision
  - negative: the guard removed from the blockage command; watch the first fail

## 5. Review and resolve (D4)

- [ ] 5.1 `resolveQuestion`: plan-edit permission, machine refusal, `blockage_changed`,
      blockage removal under one stamp, wrong facts.
  - tests: `resolving removes the impediment in one act`, `a machine caller cannot resolve`,
    a replaced blockage is refused
- [ ] 5.2 `reviewQuestion`: verdicts, wrong facts, follow-up as sibling (parent or none),
      reference set null on follow-up deletion.
  - tests: `an overturn creates the follow-up beside the leaf`,
    `a top-level leaf's follow-up is top-level`,
    `a wrong fact is counted apart from a wrong answer`,
    `deleting the follow-up keeps the question's record`
  - negative: the follow-up create skipped; watch the first fail
- [ ] 5.3 Work-item delete refuses `work_item_holds_questions` over the subtree; work package
      and space deletion check the closure; `removeAttempt` refuses
      `attempt_holds_questions`; first-child hand-down carries questions.
  - tests: `a parent above a question cannot be deleted`,
    `hand-down keeps the question on the attempt`

## 6. Policy and reviewers (D3, D6)

- [ ] 6.1 `QuestionPolicies.readEffective` and `write` with permission, version bump and audit
      row in one transaction; the reviewer list the same way.
  - tests: `a project without its own row reads the organization's`,
    `a policy change leaves old dispositions and their basis alone`,
    `a policy write and its audit row commit together`
- [ ] 6.2 Routes for policy read and write and the reviewer list; `step.phase` through the
      step patch.
  - tests: typed refusals per route

## 7. Notices (D8)

- [ ] 7.1 `NoticeStore` writes: opened, undeliverable without address; `sweep` writing aged and
      digest under the unique indexes.
  - tests: `aged fires once under concurrent sweeps`, `one digest per reviewer per day`
  - negative: the unique index dropped with two concurrent sweeps; watch the first fail
- [ ] 7.2 Operator routes: lease, report attempt (idempotent by attempt number, `lease_lost`),
      sweep; the retry schedule and the fifth-attempt end.
  - tests: `a failed attempt reschedules with its error`, `the fifth failure ends retries`,
    `a stale lease cannot report`
  - negative: the attempt cap removed; watch the second fail
- [ ] 7.3 Dash notice activity: lease, send through the OpenClaw gateway, report.
  - tests: a fake gateway refusal is reported as a failed attempt; a report refused
    `lease_lost` is not retried by the worker

## 8. Reads, MCP and UI (D5, D9)

- [ ] 8.1 Project questions read (queue order, counts) and single question read; shapes;
      mcp-01 derivation covers submit, list and read.
  - tests: `an agent reads the answer after resolve`, `a machine credential cannot review`
- [ ] 8.2 fe-01 queue page: list by priority, accept, overturn with answer, resolve, wrong
      facts, "no reviewers named"; project settings: policy mode, profiles, topics, reviewers,
      step phase.
  - tests: rendered states for loading, empty and refusal; reviewed by eye on dev

## 9. Dev proof

- [ ] 9.1 On wbs-dev: one Claude Code session submits three questions over MCP (queued,
      notified, blocked); the notified one reaches Dany's WhatsApp; Dany resolves the blocked
      one from the queue page; the next attempt reads the answer; `verify.md` records it.
