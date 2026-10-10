## 0. Spec and gate

- [x] 0.1 Intent, delta specs, design and ADR 0043. OpenSpec validation green (020.11,
      2026-10-11). Depends on `estimate-units` (unit and placement) and `step-node-attempts`
      (timezone, attempts for slice 6).
- [ ] 0.2 **Gate.** `puni-plan/wbs-feedback-2026-09-26/cpsat-proof/prove_mixed_calendars.py`:
      a windowed human slice, a continuous agent slice, a human successor; `OPTIMAL` or
      `FEASIBLE`; the successor at the next working instant; rendered with the sub-day Gantt
      fixture. Paste the output into `verify.md`. Slices 2–6 open only after this paste;
      slice 1 and every red test may be written before it.
- [ ] 0.3 Apply glossary entries (Agent rewritten; Executor kind, Working window, Agent
      calendar) to `CONTEXT.md` verbatim from `puni-plan/batch-10/interviews/glossary-delta.md`,
      in the first green commit of slice 1.

## 1. Columns, vocabulary and settings (no engine change)

- [ ] 1.1 Red: `stored-vocabularies.test.ts` "admits exactly the three executor kinds";
      `calendar-migration.db.test.ts` (apply; old-writer inserts read `either` and `540–1020`;
      the window CHECK refuses `1020–540`; rollback refused over a non-default window naming the
      CLI; when this migration adds `executor_kind`: its CHECK refuses `robot`, rollback is
      refused over `agent`, and `down.sql` drops it; when 010.4.13.3 added it first: `down.sql`
      leaves it); `swap.test.ts` and `docker.test.ts` executor-kind cases;
      `migration-cli.db.test.ts` the rollback CLI; `step.controller.db.test.ts` `executorKind`
      on create and patch (`422 invalid_executor_kind`); `project.controller.db.test.ts` the
      window (`422 invalid_working_window`); `steps-panel.test.tsx` and
      `project-settings-modal.test.tsx` the controls; the step-create form suggests `minutes`
      for `agent` (`estimate-units` left the hook).
- [ ] 1.2 Green. **Allocation-time decision first:** check `origin/main` for
      `step.executor_kind`; if 010.4.13.3 shipped it with the exact definition in `design.md` D1,
      omit the `ALTER` and the CHECK test and record "column pre-existing" in `design.md` and
      `verify.md`; otherwise add it and record "column added here". Then: stamp allocated now,
      written into `design.md`; the migration pair and CLIs; `EXECUTOR_KINDS`; shapes; settings
      controls.
- [ ] 1.3 Negatives: the `down.sql` guard removed → the rollback case; `EXECUTOR_KINDS_VOCABULARY`
      left out of `STORED_VOCABULARIES` → the swap case; `isExecutorKind` reduced → `422`
      answers `200`; the window CHECK dropped → `1020–540` stored; `down.sql` dropping a column
      it did not add → "leaves it".

## 2. Calendars and the instant axis in Fast (after the gate)

- [ ] 2a.1 Red: `calendar.test.ts` (`workingWindowCalendar` next working instant across an
      evening, a weekend and a DST change in `Europe/Kyiv`; `continuousCalendar` identity;
      `snapMinutes`). Files: `libs/wbs/domain/domain/src/{calendar,workday}.ts`.
- [ ] 2a.2 Green: the two calendars and `snapMinutes`; nothing in `schedule.ts` reads them yet.
- [ ] 2a.3 Negative: DST ignored (fixed offset) → the Kyiv case.
- [ ] 2b.1 Red: `schedule.test.ts` "an agent runs through the night and its human successor
      waits for morning", "a human stops for the weekend (Monday 17:00)", "either follows the
      window"; `live-plan-identity.test.ts` and `fast-golden-corpus.test.ts` unchanged under the
      default window with no `agent` step.
- [ ] 2b.2 Green: instants inside `schedule.ts`; calendars by executor kind; the identity
      oracles still green.
- [ ] 2b.3 Negatives: the successor's calendar taken from the predecessor → "waits for
      morning" starts at 01:00; the conversion rounding instants down to days → the identity
      oracle moves.
- [ ] 2c.1 Red: `canonical-schedule-input.test.ts` and `schedule-cache-dto.test.ts` for the new
      hash and DTO shapes; `work-item.resource.test.ts` "the wire still carries workday offsets
      and project-zone days".
- [ ] 2c.2 Green: boundary conversion to workday offsets and project-zone days on the wire;
      `SCHEDULER_CONTRACT_VERSION` and `CACHE_DTO_VERSION` allocated now, written into
      `design.md`; the corpus writer rerun where the lint demands it.
- [ ] 2c.3 Negative: the version left unmoved with a changed canonical input → the corpus lint
      reddens (watched).

## 3. CP-SAT in minutes with calendars

- [ ] 3a.1 Red: `build-solver-request.test.ts` (minute durations; forbidden intervals for
      windowed slices; none for agent slices; the golden requests rewritten by the writer);
      `solver-preflight.test.ts` `horizon-overflow` in minutes.
- [ ] 3a.2 Green: the wire version allocated now; request builder; preflight in minutes.
- [ ] 3a.3 Negative: the horizon check left in days → overflow passes preflight.
- [ ] 3b.1 Red: the Python suite in `libs/wbs/adapters/solver-py` for the calendar constraints
      (the proof script's model, now under test); `revalidate-solver-result.test.ts` "refuses a
      windowed slice in a forbidden interval"; "both engines agree" over the corpus with one
      `agent` step.
- [ ] 3b.2 Green: the Python model; revalidation.
- [ ] 3b.3 Negative: forbidden intervals dropped from the model → the revalidation case refuses
      a solver result Fast never produces (watched).

## 4. Documents and saved plans

- [ ] 4.1 Red: `plan-document.resource.test.ts` (round trip; earlier versions read `either` and
      the default; unknown kind and inverted window `invalid_body`); `normalise-plan-input.test.ts`;
      `diff-plans.test.ts` (kind and window changes).
- [ ] 4.2 Green: versions allocated now; converters; `PLAN_INPUT_UPGRADES` entry.
- [ ] 4.3 Negatives: each import check disabled → its case answers `200`.

## 5. Gantt

- [ ] 5.1 Red: `gantt-geometry.test.ts` "a sub-day day is 24 h with non-working hours greyed",
      "an agent slice draws through the grey", "an overnight attempt is drawn where it ran with
      no data-clamped", "`STAGE_ONE_DAY_START_MINUTE` is gone"; `e2e/gantt.spec.ts` pixel shard
      at the `4 h` rung.
- [ ] 5.2 Green: the 24 h day, the grey, the clamp and its constant removed.
- [ ] 5.3 Negative: the grey computed in the browser zone → the test under
      `TZ=America/Los_Angeles`.

## 6. `forecast-remaining-work` (last)

- [ ] 6.1 Red: `remaining-work.test.ts` (done node at its attempts' span; done with facts
      only; done with neither; running node pinned to its attempt's start); `schedule.test.ts`
      "a finished Dev frees the plan", "a running node holds its start"; the solver counterpart;
      the identity oracle and corpora **expected to move** — the writer is rerun in this slice's
      own commit and the before/after values go into `verify.md`.
- [ ] 6.2 Green: `remainingWorkOf` read by both engines; canonical input carries it; versions
      re-checked.
- [ ] 6.3 Negatives: the done node keeping its charged duration → "frees the plan"; the pin
      dropped → "holds its start".

## 7. Verify

- [ ] 7.1 Affected tests, migration lint, apply and rollback, the Python suite, the format
      check, `lint:fast`, `typecheck`, OpenSpec validation, the host gate on the final sha;
      outputs, the proof script's paste, the allocation-time decision and every proof row in
      `verify.md`.
