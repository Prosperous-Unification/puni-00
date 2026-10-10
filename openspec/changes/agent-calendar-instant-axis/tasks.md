## 0. Spec and gate

- [x] 0.1 Intent, delta specs, design, ADR 0042 and CONTEXT terms (Agent rewritten; Executor
      kind, Working window, Agent calendar). OpenSpec validation green (020.11, 2026-10-11).
      Depends on `estimate-units` (unit and placement) and `step-node-attempts` (timezone,
      attempts for slice 6).
- [ ] 0.2 **Gate.** `puni-plan/wbs-feedback-2026-09-26/cpsat-proof/prove_mixed_calendars.py`:
      a windowed human slice, a continuous agent slice, a human successor; `OPTIMAL` or
      `FEASIBLE`; the successor at the next working instant; rendered with the sub-day Gantt
      fixture. Paste the output into `verify.md`. Slices 2–6 open only after this paste;
      slice 1 and every red test may be written before it.

## 1. Columns, vocabulary and settings (no engine change)

- [ ] 1.1 Red: `stored-vocabularies.test.ts` "admits exactly the three executor kinds";
      `calendar-migration.db.test.ts` (apply, or skip creating `executor_kind` when stage 8's
      migration already did — the test covers both orders; old-writer inserts read `either` and
      `540–1020`; the window CHECK refuses `1020–540`; rollback refused over `agent` and over
      a non-default window naming the CLI); `swap.test.ts` and `docker.test.ts` executor-kind
      cases; `migration-cli.db.test.ts` the rollback CLI; `step.controller.db.test.ts`
      `executorKind` on create and patch (`422 invalid_executor_kind`);
      `project.controller.db.test.ts` the window (`422 invalid_working_window`);
      `steps-panel.test.tsx` and `project-settings-modal.test.tsx` the controls; the
      step-create form suggests `minutes` for `agent` (`estimate-units` left the hook).
- [ ] 1.2 Green: stamp allocated now, written into `design.md`; the migration pair and CLIs;
      `EXECUTOR_KINDS`; shapes; settings controls.
- [ ] 1.3 Negatives: the `down.sql` guard removed → the rollback case; `EXECUTOR_KINDS_VOCABULARY`
      left out of `STORED_VOCABULARIES` → the swap case; `isExecutorKind` reduced → `422`
      answers `200`; the window CHECK dropped → `1020–540` stored.

## 2. Calendars and the instant axis in Fast (after the gate)

- [ ] 2.1 Red: `calendar.test.ts` (`workingWindowCalendar` next working instant across an
      evening, a weekend and a DST change in `Europe/Kyiv`; `continuousCalendar` identity;
      `snapMinutes`); `schedule.test.ts` "an agent runs through the night and its human
      successor waits for morning", "a human stops for the weekend", "either follows the
      window"; `live-plan-identity.test.ts`, `fast-golden-corpus.test.ts` unchanged under the
      default window with no `agent` step.
- [ ] 2.2 Green: instants inside `schedule.ts`; calendars by executor kind; boundary
      conversion to workday offsets and project-zone days on the wire; `SCHEDULER_CONTRACT_VERSION`
      and `SCHEDULE_CACHE_DTO_VERSION` allocated now, written into `design.md`.
- [ ] 2.3 Negatives: the successor's calendar taken from the predecessor → "waits for morning"
      starts at 01:00; DST ignored (fixed offset) → the Kyiv case; the conversion rounding
      instants down to days → the identity oracle moves.

## 3. CP-SAT in minutes with calendars

- [ ] 3.1 Red: `build-solver-request.test.ts` (minute durations; forbidden intervals for
      windowed slices; none for agent slices; the golden requests rewritten by the writer);
      `solver-preflight.test.ts` `horizon-overflow` in minutes; `revalidate-solver-result.test.ts`
      "refuses a windowed slice in a forbidden interval"; the Python suite in
      `libs/wbs/adapters/solver-py` for the calendar constraints; "both engines agree" over the
      corpus with one `agent` step.
- [ ] 3.2 Green: the wire version allocated now; request builder, Python model, revalidation.
- [ ] 3.3 Negatives: forbidden intervals dropped from the request → the revalidation case
      refuses a solver result that Fast never produces (watched); the horizon check in days →
      overflow passes preflight.

## 4. Documents and saved plans

- [ ] 4.1 Red: `plan-document.resource.test.ts` (round trip; earlier versions read `either` and
      the default; unknown kind and inverted window `invalid_body`); `normalise-plan-input.test.ts`;
      `diff-plans.test.ts` (kind and window changes).
- [ ] 4.2 Green: versions allocated now; converters; `PLAN_INPUT_UPGRADES` entry.
- [ ] 4.3 Negatives: each import check disabled → its case answers `200`.

## 5. Gantt

- [ ] 5.1 Red: `gantt-geometry.test.ts` "a sub-day day is 24 h with non-working hours greyed",
      "an agent slice draws through the grey", "an overnight attempt is drawn where it ran with
      no data-clamped"; `e2e/gantt.spec.ts` pixel shard at the `4 h` rung.
- [ ] 5.2 Green: the 24 h day, the grey, the clamp removed.
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
      check, `lint:fast`, `typecheck`, OpenSpec validation, the host gate on the final sha; outputs, the proof script's paste and every proof row in `verify.md`.
