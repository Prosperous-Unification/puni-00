## 0. Spec

- [x] 0.1 Intent, delta specs, design, ADR 0044 and CONTEXT terms (Progress, Hours fact, Fact
      start, Fact end rewritten; Attempt, Attempt outcome, Project timezone). OpenSpec
      validation green (020.11, 2026-10-11). Depends on nothing in flight.

## 1. Vocabulary, spans and the zoned day in `@wbs/domain`

- [ ] 1.1 Red: `stored-vocabularies.test.ts` "admits exactly the three attempt outcomes";
      `attempt.test.ts` "spanOfAttempts is first start to last end, open while one runs, absent
      with none", "a running attempt has no outcome and no end"; `workday.test.ts`
      "isoDateOfInstantIn('UTC') equals isoDateOfInstant for every corpus stamp",
      "isoDateOfInstantIn('Europe/Kyiv', 2026-10-11T23:30Z) is 2026-10-12", "refuses a
      non-finite instant", "isTimezone admits UTC and Europe/Kyiv and refuses Kyiv". Files:
      `libs/wbs/domain/domain/src/{stored-vocabularies,attempt,workday}.ts`.
- [ ] 1.2 Green: `ATTEMPT_OUTCOMES`, `isAttemptOutcome`, `Attempt`, `spanOfAttempts`,
      `isoDateOfInstantIn`, `isTimezone` (over `Intl.supportedValuesOf('timeZone')` plus `UTC`).
- [ ] 1.3 Negatives: the open-span branch returning the last end → "open while one runs";
      `isTimezone` reduced to `typeof === 'string'` → "refuses Kyiv"; `timeZone` dropped from the
      formatter → the Kyiv day case reads `2026-10-11`.

## 2. Swap vocabulary and rollback CLI (before storage can hold attempts)

- [ ] 2.1 Red: `swap.test.ts` "refuses an image that reads no outcomes while attempts are
      stored, and stops green", "passes an image without the outcomes CLI over no attempts",
      "refuses an outcome written after the first check once blue stops"; `lib/docker.test.ts`
      outcome commands (present, absent, missing `src`, stored outcomes before and after the
      table exists); `migration-cli.db.test.ts` "saves, removes and restores attempts through
      the rollback CLI" and its usage guard.
- [ ] 2.2 Green: `ATTEMPT_OUTCOMES_VOCABULARY` in `swap.ts`; `attempt-outcomes-cli.ts`;
      `store-sqlite/step-node-attempt-rollback.ts`; `step-node-attempt-rollback-cli.ts`;
      runbook anchor `#step-node-attempt-rollback`.
- [ ] 2.3 Negatives: the vocabulary left out of `STORED_VOCABULARIES` → the three swap cases;
      the directory check replaced by an unconditional `[]` → the missing-`src` case; the
      usage guard bypassed → the usage case.

## 3. Storage and migration

- [ ] 3.1 Red: `step-node-attempt-migration.db.test.ts` (apply; the running check refuses an
      outcome without an end and an end without an outcome; the order check refuses an end
      before its start; the partial index; an old-writer project insert reads `UTC`; rollback
      refused over a row naming the CLI; rollback and re-apply over none);
      `step-node-attempt.db.test.ts` (insert at `max + 1` under concurrent starts: one wins,
      one reads `attempt_running`; read ascending; cascade on work item delete; hand-down moves
      rows); every migration-enumerating db test lists the new folder.
- [ ] 3.2 Green: stamp allocated now, written into `design.md`;
      `drizzle/<stamp>_add_step_node_attempts/{migration,down}.sql`; `schema.ts`;
      `StepNodeAttemptRepository`; `project.timezone` in `ProjectRepository`; migration lint.
- [ ] 3.3 Negatives: the `down.sql` guard removed → "rollback refused over a row"; the
      running-state CHECK dropped → "refuses an outcome without an end"; the `max + 1` read
      moved outside the transaction → the concurrent-start case inserts two running rows.

## 4. Commands and the timezone route

- [ ] 4.1 Red: `work-item.resource.test.ts` mounted: start (no `at` → the stamp; the
      refusals `node_done`, `attempt_running` and `attempt_in_future`), end (the refusals
      `no_running_attempt` and `attempt_ends_before_start`; reference and note stored), remove
      (`unknown_attempt`; numbers never reused), one undo per command restores verbatim,
      `setStatus done` leaves a running attempt running, batch roll-back at the index, history
      sentences; `plan-command-shapes.test.ts` kind count plus three;
      `document-from-shapes.test.ts` three derived tools; `project.controller.db.test.ts`
      `timezone` patch (`Europe/Kyiv` stored; `Kyiv` → `422 invalid_timezone`; read carries it).
- [ ] 4.2 Green: `definitions.ts` three kinds; `command-normalizers.ts`; `compensating.ts`
      inverses; `refusal.ts` codes; `project-shapes.ts` `timezone?`; history words.
- [ ] 4.3 Negatives: each refusal removed → its case answers `200`; the `endAttempt` inverse
      written as a delete → the one-undo case loses the row; the future check compared to the
      client's `at` instead of the stamp → "attempt_in_future".

## 5. Reads, fills, documents and saved plans

- [ ] 5.1 Red: `work-item.resource.test.ts` "reads attempts ascending and derived spans per
      node and leaf"; `work-item-status-command.test.ts` "done fills the fact end from the last
      attempt's end day in the project zone", "in_progress fills the fact start from the first
      attempt's start day", "no attempt fills the day of the act, byte-identical to today",
      "a typed day is never overwritten", "Kyiv at 23:30Z fills the next day";
      `live-plan-identity.test.ts` and the golden corpora unchanged;
      `plan-document.resource.test.ts` (round trip; version 6 imports `UTC` and no attempts;
      each refusal); `normalise-plan-input.test.ts` (previous schema upgrades with `UTC`);
      `diff-plans.test.ts` (`timezone` under `settings`); spreadsheet attempt counts.
- [ ] 5.2 Green: versions allocated now, written into `design.md`; `attempts`, `spans`, `span`
      on `work-item-response.ts`; the fill rules in `setStatus`; export and import converters;
      `PLAN_INPUT_UPGRADES` entry; `CanonicalSettings.timezone`.
- [ ] 5.3 Negatives: the attempt witness skipped → "done fills the fact end from the last
      attempt's end day" reads the act's day; the zone dropped from the fill → the Kyiv case;
      each import check disabled → its case answers `200`.

## 6. fe-01

- [ ] 6.1 Red: `folded-step-card.test.tsx` (attempts newest first with number, outcome, zoned
      instants, executor, reference; `Start attempt` sends the batch; `End attempt` offers three
      outcomes and a reference; a refusal is worded); `project-settings-modal.test.tsx` (timezone
      select over the runtime list, `UTC` default, saved through PATCH); `e2e/hover-cards.spec.ts`
      the attempts list in a browser.
- [ ] 6.2 Green: the card section and actions; the settings control; `wbs-api.ts` types.
- [ ] 6.3 Negatives: the card formatting instants in the browser zone → the zoned-instants
      test under `TZ=America/Los_Angeles`; `End attempt` offered with none running → the card
      test.

## 7. Verify

- [ ] 7.1 Affected tests, migration lint, apply and rollback, `prettier --check`, `lint:fast`,
      `typecheck`, `openspec validate --all --json`, the host gate on the final sha; outputs
      and every proof row in `verify.md`. `step-node-readings` follows.
