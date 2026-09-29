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

## 4. Engine reduction

- [ ] 4.1 Red: held assignee's queue, held predecessor, `schedule: null` and parent bracket;
      golden corpora byte-identical.
- [ ] 4.2 Green: `withoutHeldSubtrees` in `canonicalScheduleParts`; projection.
- [ ] 4.3 Negatives: reduction bypassed → a held assignee still delays a successor; edge filter
      removed → `leavesUnder` throws on a held id.

## 5. Saved plans and plan document v6

- [ ] 5.1 Red: v3 → v4 upgrade equality, diff reports, v6 round trip, v1–v5 import, refusals.
- [ ] 5.2 Green: schema 4 with `[3, withNoStatusFacts]`, plan document v6, spreadsheet status word.
- [ ] 5.3 Negatives: upgrade returns the body unchanged → cross-version equality fails; import
      vocabulary guard removed → `hold: 'paused'` accepted.

## 6. fe-01 table (ships in the same integration round as slice 3)

- [ ] 6.1 Red: labels, strip, cell, menu, prompt, depends card; `e2e/status.spec.ts`.
- [ ] 6.2 Green.
- [ ] 6.3 Negatives: menu filter removed → a held row offers its own hold; unknown status word →
      query-failure state, not a blank glyph.

## 7. fe-01 Gantt

- [ ] 7.1 Red: no bar for held, blocked outline, proxy hatch, arrows, bracket; pixel shards.
- [ ] 7.2 Green.
- [ ] 7.3 Negative: held filter removed → a held leaf draws a bar.
