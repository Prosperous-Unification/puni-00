<!-- Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase. -->

Every negative below is watched failing **before** the production line is believed, and its
observed output goes into the adjacent `Proof:` comment and into `verify.md`'s table. One
branch per numbered section, each its own PR, in this order; section 0 is this proposal's PR.
Test names in backticks are the spec's scenario titles.

## 0. Words first

- [x] 0.1 `CONTEXT.md`: the sixteen terms after the step blockage activation receipt entry.
- [x] 0.2 `docs/adr/0059-a-question-is-a-satellite-fact-judged-by-the-plan.md`, proposed.

## 1. The pure core (D2, D5)

- [ ] 1.1 `@wbs/domain`: `RiskFact`, `HARD_GATES`, `Disposition`, `QuestionPolicy`,
      `DEFAULT_QUESTION_POLICY`, `parseQuestionPolicy` refusing hard gates and unknown words.
  - test: `hard gates cannot be written`
- [ ] 1.2 `disposeQuestion(policy, phase, facts, topics)` with the fixed order.
  - tests: one per scenario under "Disposition follows hard gates, then the phase profile,
    then topics"
  - negative: order swapped so topics run before gates; watch
    `a hard gate blocks even offline` fail
- [ ] 1.3 `questionPriority`, the three-key comparator, `foldQuestionCounts`.
  - tests: `the bigger unlock sorts first among equals`,
    `unnoticed counts age, not verdict`
  - negative: unlock count replaced by zero; watch the first fail

## 2. Storage (D1, D6, D7)

- [ ] 2.1 Migrations `add_step_phase`, `add_question_policy`, `add_question`, `add_notice`,
      `add_project_reviewer`, each with `down.sql`; `schema.ts` with the checks and the unique
      index on question, person and reason; the ledger tests move.
  - tests: migration lint; rollback round trip
- [ ] 2.2 Ports `QuestionStore`, `QuestionPolicies`, `NoticeStore`, `ProjectReviewers`; sqlite
      and memory adapters; conformance suite.
  - tests: a resolved verdict on a queued question is unstorable; a follow-up id on an
    accepted question is unstorable

## 3. Submit (D2, D9)

- [ ] 3.1 `submitQuestion` shape, parser refusals (`risk_fact_missing`, `question_needs_leaf`,
      `unknown_topic`, `attempt_not_running`), `EVERY_KIND`, the pins.
  - tests: `a missing fact is refused, not defaulted`, `a parent cannot carry a question`
- [ ] 3.2 `QuestionService.submit`: effective policy and phase read inside the unit of work,
      store, answer the disposition.
  - test: `a complete submission is stored with its disposition`
- [ ] 3.3 Blocked path: blockage set, attempt ended failed with the question reference, opened
      notices, `question_already_blocking`, `step_blockage_inactive` leaves nothing written.
  - test: `blocking stops the attempt and the node`
  - negative: the blockage write removed; watch it fail

## 4. Review and resolve (D4)

- [ ] 4.1 `resolveQuestion`: reviewer guard, blockage removal under one stamp.
  - tests: `resolving frees the node in one act`, `a non-reviewer cannot resolve`
- [ ] 4.2 `reviewQuestion`: verdicts, wrong facts, follow-up work item, journal inverse.
  - tests: `an overturn creates the follow-up work item`,
    `a wrong fact is counted apart from a wrong answer`, undo removes the follow-up
  - negative: the follow-up create skipped; watch the first fail
- [ ] 4.3 Work-item delete refuses `work_item_holds_questions`; move carries questions.
  - tests: both

## 5. Policy and reviewers (D3, D6)

- [ ] 5.1 `QuestionPolicies.readEffective` and `write` with version bump and audit row.
  - tests: `a project without its own row reads the organization's`,
    `a policy change leaves old dispositions alone`
- [ ] 5.2 Routes for policy read and write and the reviewer list; `step.phase` through the
      step patch.
  - tests: typed refusals per route

## 6. Notices (D8)

- [ ] 6.1 `NoticeStore` writes: opened per reviewer, undeliverable without address; `sweep`
      writing aged once and digest once per day.
  - tests: `one opened notice per reviewer`, `aged fires once`
  - negative: unique index dropped; watch the second fail
- [ ] 6.2 Operator routes: list queued notices, record an attempt, sweep a project.
  - test: `a failed delivery keeps its error`
- [ ] 6.3 Dash notice activity: poll, send through the OpenClaw gateway, report attempts,
      bounded retry.
  - tests: a fake gateway refusal is recorded; after the fourth failure the notice is failed
  - negative: retry cap removed; watch the second fail

## 7. Reads, MCP and UI (D5, D9)

- [ ] 7.1 Project questions read (queue order, counts) and single question read; shapes;
      mcp-01 derivation covers submit, list and read.
  - tests: `an agent reads the answer after resolve`, `a machine credential cannot review`
- [ ] 7.2 fe-01 queue page: list by priority, accept, overturn with answer, resolve; project
      settings: policy mode, profiles, topics, reviewers, step phase.
  - tests: rendered states for loading, empty and refusal; reviewed by eye on dev

## 8. Dev proof

- [ ] 8.1 On wbs-dev: one Claude Code session submits three questions over MCP (queued,
      notified, blocked); the notified one reaches Dany's WhatsApp; Dany resolves the blocked
      one from the queue page; the next attempt reads the answer; `verify.md` records it.
