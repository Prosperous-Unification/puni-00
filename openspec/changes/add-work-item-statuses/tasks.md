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

- [ ] 2.1 Red: stored-vocabularies step for missing CLI, old CLI, mismatched hold values, after
      stop-blue as well as before migrate.
- [ ] 2.2 Green: generalise the `relationship-types` step; `supported-vocabularies-cli.ts`.
- [ ] 2.3 Negative: remove the mismatch check → "held rows, FS-only image" passes the swap.

## 3. Storage and command

- [ ] 3.1 Red: migrate/down walk; `setStatus` for each status on leaf and parent, refusals,
      journal inverse, hand-down, last-child fold, duplicate; read shape.
- [ ] 3.2 Green: migration (stamp rechecked against main and the queue), guarded `down.sql`,
      `work-item-hold-rollback-cli.ts`, widened command and `SETTABLE_STATUSES`, CLI prints both
      kinds; the three `in_progress` cases (parent, reopen, `409 no_steps`, which `done` gains
      too).
- [ ] 3.3 Negatives: guard deleted → down succeeds over held rows; inverse omitting `hold` →
      undo leaves the row held; `invalid_status` guard removed → 500 instead of 400.

## 4. Engine reduction

- [ ] 4.1 Red: held assignee's queue, held predecessor, `schedule: null` and parent bracket;
      golden corpora byte-identical.
- [ ] 4.2 Green: `withoutHeldSubtrees` in `canonicalScheduleParts`; projection.
- [ ] 4.3 Negatives: reduction bypassed → a held assignee still delays a successor; edge filter
      removed → `leavesUnder` throws on a held id.

## 5. Saved plans and plan document v6

- [ ] 5.1 Red: v3 → v4 upgrade equality, diff reports, v6 round trip, v1–v5 import, refusals.
- [ ] 5.2 Green: schema 4 with `[3, withNoHolds]`, plan document v6, spreadsheet status word.
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
