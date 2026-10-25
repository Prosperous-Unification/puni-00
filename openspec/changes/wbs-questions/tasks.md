<!-- Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase. -->

Every negative below is watched failing **before** the production line is believed, and its
observed output goes into the adjacent `Proof:` comment and into `verify.md`'s table. One
branch per numbered section, each its own PR, in this order; section 0 is this proposal's PR.
Section 3 is one PR on purpose (design D15): submission never ships without its guards,
resolve and deletion refusals. Test names in backticks are the spec's scenario titles.

## 0. Words first

- [x] 0.1 `CONTEXT.md`: the nineteen terms after the step blockage activation receipt entry.
- [x] 0.2 `docs/adr/0059-a-question-is-a-satellite-fact-judged-by-the-plan.md`, proposed.

## 1. The pure core (D3, D5, D10, D11, D14)

- [ ] 1.1 `@wbs/domain`: `RiskFact`, `FactCondition`, `HARD_GATES`, `Disposition`,
      `QuestionPolicy`, `DEFAULT_QUESTION_POLICY`, `parseQuestionPolicy`, `parseBasis`,
      `parseWrongFacts`, `parseNoticePayload`, `parseNoticeReports`, each throwing on
      corruption.
  - tests: `hard gates cannot be written`; one corruption case per parser
- [ ] 1.2 `basisOf(policy, source, phase)` and `disposeQuestion(basis, facts, topics)`.
  - tests: the five precedence witnesses under "Disposition follows hard gates, then
    offline, then the phase profile, then topics", plus
    `a hard-gate change leaves the basis replayable`
  - negatives: each adjacent pair of the order swapped in turn; watch its own witness fail
- [ ] 1.3 `downstreamReach(node, graph, readings)`, `questionPriority`, the comparator,
      `foldQuestionCounts`.
  - tests: `a diamond counts each node once`, `the bigger reach sorts first among equals`,
    `done successors do not count`, `unnoticed counts age, not verdict, and not blocked`,
    `rates are absent before any verdict`
  - negative: deduplication removed; watch `a diamond counts each node once` read 4 and fail

## 2. Storage (D1, D6)

- [ ] 2.1 Migrations `add_step_phase`, `add_question_policy`, `add_question`, `add_notice`,
      `add_project_reviewer`, `extend_organization_audit_vocabulary` (both checks), each with
      `down.sql`; the question `down.sql` refuses when populated; `schema.ts` with every
      check, the partial unique index, the two notice unique indexes, the composite attempt
      foreign key with delete cascade; the ledger tests move.
  - tests: migration lint; rollback round trip;
    `a mounted partial index refuses a second unresolved blocked question`
- [ ] 2.2 Ports `QuestionStore`, `QuestionPolicies`, `NoticeStore`, `ProjectReviewers`; sqlite
      and memory adapters; conformance suite.
  - tests: each forbidden pairing is unstorable; `a malformed row throws rather than inherits`

## 3. Submit, guards, review, resolve and retention: one PR (D2, D4, D7, D12, D13, D15, D16)

- [ ] 3.1 `submitQuestion`, `reviewQuestion`, `resolveQuestion` shapes, parser refusals,
      `EVERY_KIND`, the pins.
  - tests: `a missing fact is refused, not defaulted`, `a parent cannot carry a question`
- [ ] 3.2 Guards first: `setStepBlocked(false)`, matching replay and `startAttempt` refuse
      `question_blocking`; delete command, its replay, work package and space deletion refuse
      `work_item_holds_questions`; `removeAttempt` and replay refuse
      `attempt_holds_questions`; confirmed step removal refuses `step_holds_questions`
      inside its transaction; first-child creation, move-under and their replays refuse
      `leaf_holds_questions`.
  - tests: `the blockage cannot be cleared around the question`,
    `a matching replay cannot clear it either`,
    `the node cannot be restarted around the question`,
    `a parent above a question cannot be deleted`, `a step with questions cannot be removed`,
    `a question-holding leaf cannot gain a first child`,
    `nothing can be moved under a question-holding leaf`; import leaves the source untouched;
    the archived first-child and node-endpoint scenarios still pass for question-free leaves
  - negative: the guard removed from `setStepBlocked`; watch the first fail
- [ ] 3.3 `QuestionService.submit`: identity rule, executor and attempt checks, effective
      policy and phase inside the unit of work, basis, store, attribution, the notified path's
      notices with `no_address` and `no_access`.
  - tests: `a complete submission is stored with its disposition`,
    `the attempt must be the running one`, `an executor-less attempt cannot raise a question`,
    `only the executor submits`, `an upstream pin is honoured over the account's other persons`,
    `a consent credential is recorded as itself`, `one opened notice per reviewer`,
    `a reviewer without access gets no content`, `an outbox failure rolls back the question`
- [ ] 3.4 Blocked path: blockage with its instant recorded, attempt ended failed with the
      question reference, unjournalled claim removal, opened notices; refusals
      `node_already_blocked`, `question_blocking`, `step_blockage_inactive`.
  - tests: `blocking stops the attempt and the node`,
    `a pre-existing blockage refuses the submission`
  - negative: a throw injected into each of the five writes in turn; assert unchanged state
- [ ] 3.5 `resolveQuestion`: `package.write`, agent refusal for both credential forms with the
      credential's own grants holding the permission, `blockage_changed`, blockage removal
      under one stamp, wrong facts.
  - tests: `resolving removes the owned blockage`, `a replaced blockage refuses resolve`,
    `an agent credential cannot resolve`
- [ ] 3.6 `reviewQuestion`: verdicts, wrong facts, follow-up as sibling (parent or none)
      through the ordinary create path with its own journal entry; follow-up existence
      derived on read.
  - tests: `an overturn creates the follow-up beside the leaf`,
    `undo and redo of the creation leave the verdict alone`,
    `a top-level leaf's follow-up is top-level`,
    `a wrong fact is counted apart from a wrong answer`
  - negative: the follow-up create skipped; watch the first fail
- [ ] 3.7 Reads with visibility: `GET /api/questions/:id` under `package.read`; the queue and
      counts over readable questions.
  - tests: `a restricted package hides its questions`

## 4. Policy and reviewers (D3, D6)

- [ ] 4.1 `QuestionPolicies.readEffective` and `write` with permission, version bump and audit
      tuple in one transaction; the reviewer list the same way; the permission matrix mapping
      for `organization.manage_access`.
  - tests: `a project without its own row reads the organization's`,
    `a policy change leaves old dispositions and their basis alone`,
    `a policy write and its audit row commit together`
- [ ] 4.2 Routes for policy read and write and the reviewer list; `step.phase` through the
      step patch.
  - tests: typed refusals per route, including the legacy role mapping until
    `wbs-permissions` lands

## 5. Notices (D8)

- [ ] 5.1 `NoticeStore` writes: opened, undeliverable with reason; `sweep` writing aged and
      digest under the unique indexes over the reviewer's readable questions; the lease pass
      closing expired leases as `lost` before leasing.
  - tests: `aged fires once under concurrent sweeps`, `one digest per reviewer per day`,
    `an expired lease counts as a failure`
  - negative: the unique index dropped with two concurrent sweeps; watch the first fail
- [ ] 5.2 Operator routes: lease, report (recorded reports first, then the live lease), sweep.
  - tests: `a failed attempt reschedules with its error`, `the fifth failure ends retries`,
    `a repeated report answers the recorded outcome`, `a conflicting repeat is refused`,
    `a late report against a lost lease is refused`
  - negative: the attempt cap removed; watch the second fail
- [ ] 5.3 Dash notice activity: lease, send through the OpenClaw gateway within the lease
      with the id-only text, report, stop on `lease_lost` and on `report_conflict`.
  - tests: a fake gateway refusal is reported as `error`; each refusal ends the worker's
    handling of that notice

## 6. MCP and UI (D9)

- [ ] 6.1 Shapes for the read routes; mcp-01 derivation covers submit, list and read.
  - tests: `an agent reads the answer after resolve`, `an agent credential cannot review`
- [ ] 6.2 fe-01 queue page: list by priority, accept, overturn with answer, resolve, wrong
      facts, "no reviewers named", undeliverable reasons; project settings: policy mode,
      profiles, topics, reviewers, step phase.
  - tests: rendered states for loading, empty and refusal; reviewed by eye on dev

## 7. Dev proof

- [ ] 7.1 On wbs-dev: one Claude Code session submits three questions over MCP (queued,
      notified, blocked); the notified one reaches Dany's WhatsApp; Dany resolves the blocked
      one from the queue page; the next attempt reads the answer; `verify.md` records it.
