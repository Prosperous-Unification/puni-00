## 0. Spec

- [x] 0.1 Intent, delta specs, design, ADR 0032 and CONTEXT terms (Readiness, Hold, Held,
      Blocked by proxy; Status widened). `openspec validate --all --json` green.

## 1. Vocabulary and folds in `@wbs/domain` (nothing produces the values yet)

- [x] 1.1 Red: `progress.test.ts` for the readiness and hold guards and `leafStatusOf`'s order
      (done over hold, hold over in progress, in progress over readiness).
- [x] 1.2 Red: `progress.test.ts` and `progress.property.test.ts` for `foldStatuses`
      (examples from the spec; fast-check: folding any tree equals folding its leaves).
- [x] 1.3 Red: `blocked-by-proxy.test.ts` and property test against a brute-force least fixed
      point (soundness and completeness at once), transitivity through `A → B → C`, stop at
      running work, leaf-level cycle, typed endpoints of every scope, refusals.
- [x] 1.4 Red: `without-held-subtrees.test.ts`: held leaf, held assignee, fully held parent,
      partly held parent, legacy and typed edges, not-before and deadlines; `schedule()` runs
      on the result and a successor starts at day zero.
- [x] 1.5 Green: implement. Negatives: drop the transitive spread and the case
      `C behind a held A through B` reddens; drop the ancestor removal and a parent of held
      leaves stays in the rows; drop `blocked_by_proxy` from the stopped set and the partition
      property reddens; each refusal disabled reddens its case. Adjacent `Proof:` comments.
- [x] 1.6 `agree` and `statusOf` return `ProgressStatus`; core's roll-up and fe-01's wire type
      keep that three-word type until slices 3 and 6 widen the contract and every reader
      together. `SETTABLE_STATUSES` stays `unknown`, `done` until slice 3 can store the rest.

## 2. Swap guard (tools + be-01 CLI printing `holdKinds: []`)

- [x] 2.1 Red: `swap.test.ts` hold cases (no hold kinds, one kind missing, supported, failed and
      malformed reads, a hold written after the first check) and `docker.test.ts` hold kind
      commands (present, absent, missing `src`, nonregular CLI, stored holds before and after the
      column exists, missing database, unset `DB_PATH`).
- [x] 2.2 Green: the swap steps are renamed `stored-vocabularies` and
      `stored-vocabularies-after-stop` and check each stored vocabulary in turn; be-01 ships
      `hold-kinds-cli.ts` printing `[]`. Two CLIs instead of one `supported-vocabularies-cli.ts`
      keep #179's proven relationship type command untouched; an image without
      `hold-kinds-cli.ts` reads as no holds.
- [x] 2.3 Negatives: the hold vocabulary left out of the swap's list makes four swap cases fail;
      the hold CLI's directory check replaced by an unconditional `[]` makes the missing `src`
      case fail. The runbook section `#work-item-status-facts-rollback` the refusal names lands with the
      rollback CLI in slice 3.

## 3. Storage and command

- [x] 3.1 Red: migration walk (`work-item-status-facts-migration.db.test.ts`), store round
      trip, rollback save/remove/restore and CLI, `workItemStatusesOf`, `setStatus` for every
      status on leaf and parent with its refusals and one-undo inverse
      (`work-item-status-command.test.ts`), hand-down, move under a leaf, last-child fold,
      duplicate; route refusal for `blocked_by_proxy`.
- [x] 3.2 Green: migration `20260928200000_add_work_item_status_facts` (after
      `20260928040000` on the orgs stack, rechecked 2026-09-29), guarded `down.sql`,
      `work-item-status-facts-rollback-cli.ts`, `hold-kinds-cli.ts` printing `HOLDS`, widened
      `setStatus`, `SETTABLE_STATUSES` and contract, the three `in_progress` cases and
      `409 no_steps` for `done` too. fe-01 reads every status and still offers only Unknown and
      Done (`OFFERED_STATUSES`) until slice 6. Moving a row under a leaf clears that leaf's
      readiness and hold (it becomes a parent; the moved row is other work).
- [x] 3.3 Negatives, each watched: down guard removed, patch no-field guard lines removed,
      rollback version/comparison/leaf checks disabled, CLI usage guard bypassed, parent
      statement guard removed in the read, each `setStatus` refusal removed, the hold inverse
      dropped, `parseStatus` cast, `isSettableStatus` admitting `blocked_by_proxy`, each
      structural write skipped, the copy keeping its hold. See `verify.md`.

- [x] 3.4 Fable review (2026-09-29): a statement is never written on a parent (`apply` and the
      store's conditional `UPDATE`), a move's inverse moves back first, the delete undo test
      asserts the restored leaf.
- [x] 3.5 Readiness joins the swap guard (`readiness-kinds-cli.ts`, `READINESS_VOCABULARY`); the
      rollback CLI becomes `work-item-status-facts-rollback-cli.ts` and saves both columns.
      Negatives: the vocabulary left out of the swap's list; the CLI's usage guard, the save's
      version check, the remove's comparison and the restore's leaf check each disabled.

## 4. Engine reduction (ships with its fe-01 reader)

- [x] 4.1 Red: `work-item-status-command.test.ts` "an on-hold leaf takes no part in the
      schedule" (a successor starts at day zero, a held row reports `schedule: null` and
      `dates: null`, blocked keeps its place, a parent's bracket spans its unheld leaves and is
      null when all are held); fe-01 `gantt-geometry.test.ts` (no bracket, bar or arrow for a
      row with no schedule).
- [x] 4.2 Green: `withoutHeldSubtrees` in `canonicalScheduleParts` (the seam the tree read, the
      solver request and the restart pump share); the read projects `schedule: null` and
      `dates: null` for a removed row; the contract's `schedule` is `Scheduled | null`. fe-01
      reads it: the Start, End and Slack cells, the card's slack, exports and the Gantt say
      nothing for a held row (slice 7 draws the "On hold" word). Held means a stored `on_hold`
      on a leaf, per CONTEXT.
- [x] 4.3 Negatives: the reduction bypassed and the null projection replaced by the
      placeholder each fail the day-zero case; the Gantt's null-schedule return removed throws
      `Cannot read properties of null`. The domain proofs (edge filter, ancestor removal) are
      slice 1's; no golden corpus holds a hold, so the reduction is the identity there
      (`returns the input unchanged when nothing is held`).

## 5. Saved plans and plan document v6

- [x] 5.1 Red (saved plans): v3 to v4 upgrade compares clean against the current body; a
      malformed v3 body is refused; the saved plan's schedule leaves out on-hold work and the
      capture carries readiness and hold; `diffPlans` reports both under `progress`.
- [x] 5.2 Green (saved plans): `CANONICAL_PLAN_INPUT_SCHEMA_VERSION` 4, `[3, withNoStatusFacts]`,
      `SUPPORTED_INPUT_BODY_VERSIONS` gains 4, `CapturedWorkItem` and `CanonicalWorkItem` carry
      both fields, `scheduleInputOfCaptured` applies `withoutHeldSubtrees`.
- [x] 5.3 Negatives (saved plans): the upgrade returning the body unchanged; the saved plan's
      reduction handed an empty held set.
- [x] 5.4 Plan document v6, on stage B's v5 (main `802432df`): `PLAN_DOCUMENT_VERSION` 6; the
      export carries each row's `readiness` and `hold`; import reads versions 1–5 with both
      null and refuses, from version 6, a value outside each vocabulary, a missing field and a
      statement on a parent (`invalid_body` at the field). A hold on done work is accepted
      (Fable review of #225: `setProgress` keeps a hold, so refusing it refused the plan's own
      export). Negatives: each of the vocabulary and parent checks disabled; the import writing
      both as null; the done refusal restored against the held-then-done round trip. The
      spreadsheet export already carries the status word.

## 6. fe-01 table (ships in the same integration round as slice 3)

- [x] 6.1 Red: labels, strip, cell, menu, prompt, depends card; `e2e/status.spec.ts`.
- [x] 6.2 Green: `statusOffersOf` (table menu, card menu and Status cell alike), `chooseStatus`
      (Done and In progress through the completion prompt, the rest at once), palette tokens
      per status (`STATUS_TOKEN`), the three `setStatus` refusals worded.
- [x] 6.3 Negatives: menu filter removed → a held row offers its own hold; unknown status word →
      query-failure state, not a blank glyph.

- [x] 6.4 Design follow-up (Fable review of #234): blocked and blocked by proxy share the `⊘`
      glyph and the status word is exposed only in the hover card. Give blocked by proxy its own
      glyph and expose the word to assistive tech (`aria-description` or an sr-only span). Revisit
      in-progress contrast, 2.55:1 against white (pre-existing).

## 7. fe-01 Gantt

- [x] 7.1 Red: no bar for held, blocked outline, proxy hatch, arrows, bracket; pixel shards
      (`e2e/status.spec.ts`, `each status on the chart, in a browser`).
- [x] 7.2 Green: `On hold` in a held row; `data-blocked` and the blocked red outline;
      `data-blocked-by-proxy`, the hatch and the card naming the predecessors in the way (stored
      and authored); arrows leaving a blocked bar in the blocked red; a held leaf is no end of an
      arrow, stored or authored, instead of reading as a broken payload.
- [x] 7.3 Negative: held filter removed → the held row loses its `On hold` word (a held leaf
      has no slice, so slice 4's `schedule === null` skip is what keeps it barless).
