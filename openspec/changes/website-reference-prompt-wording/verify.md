# Verification: website-reference-prompt-wording

Verified locally on 2026-11-03 against base `1852fac78f9e2348e5336880b9b76c6011fdfc08`. Controller review, source-pinned paid QA and full source gates remain separate. Production remains held.

## Completeness, correctness and coherence

Both requirements and all four scenarios have implementation and mounted coverage. All four tasks are complete. The small wording/explicit-identity change needs no additional design.md, glossary term or ADR. The independent reference wording review supplied the approved bounded design. The delta capability remains pending synchronization; no archive or main-spec sync was requested.

| Requirement                             | Production mapping                                                  | Coverage                                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Distinct privileged reference guidance  | `system-prompt.ts`; canonical `conversion-scoping/system-prompt.md` | Canonical equality, captured safe prose, captured candidate, colliding prose variant, genuine current reference/stage-hint exact40 candidate disclosures |
| Explicit v10 identity preserves history | `scopingPromptVersion`; explicit `presentScopingReply` identity     | v10 fresh stream/store/replay, concern/candidate preservation, evaluation identity, v1–v9 and opaque mounted replay with no new provider call            |

Only the reference instruction and new current identity change prompt behavior. The complete evaluator source is unchanged from base, SHA256 `2cb145d570c80dbbe241953fdf3245f82ada6c80fdaafac9fdfba4f2659e343c`. The normalized 40-character gate has no allowlist, exemption, waiver or threshold change. Legacy sales-v3 source bytes are unchanged. Historical specifications and v9 presentation/replay coverage remain intact.

## RED / GREEN

The initial malformed fixture-name and sandbox socket-denial attempts were setup/unavailable checks, not semantic RED. Socket-capable mounted runs supplied the evidence below.

Before implementation, `/tmp/puni-reference-safe-red.log` records0 pass / 3 fail. The exact captured candidate and an independently authored safe prose variant failed noPromptLeak with immediateSafetyStop. The exact supplied captured prose already passed those guards; its only initial failure was the forthcoming v10 identity assertion. It is retained as a preservation baseline. `/tmp/puni-reference-identity-red.log` records0 pass / 1 fail: expected v10, received v9.

The first focused GREEN passed103 tests / 417 assertions across 3 files. The later mounted current/historical/safety checkpoint passed28 tests / 298 assertions across 4 files. After both production faults were restored, the final complete backend and shared suites below passed, including the same mounted regressions.

## Failure proofs

No evaluator safety check was added or changed. The following production faults establish the wording correction and explicit presentation identity; adjacent Proof comments name the observed failures. Genuine current reference and stage-hint disclosures also exercise the unchanged leak gate at exactly 40 characters through the actual candidate safetyTexts path. Existing structured/legacy instruction controls remain, and mounted price/date/contract/model/key candidates stop before another call.

| Production fault                                          | Test observing failure                               | Observed result and restoration                                                                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Restore only v9 reference wording, retaining v10 identity | `eval-scoping.test.ts -t 'captured safe'`            | Exit1: exact prose baseline passes; prose variant and full captured candidate fail noPromptLeak and emit immediateSafetyStop. Restored; final backend GREEN. |
| Remove only exact v10 omission alias                      | `conversation.test.ts -t 'v10 question duplication'` | Exit1: fresh stream repeats the question instead of the sole catalogue label. Restored; final backend/shared GREEN.                                          |

Faults were restored in finally. Manifest `/tmp/puni-reference-proofs.json`; logs `/tmp/puni-reference-proof-old-reference-wording.log` and `/tmp/puni-reference-proof-missing-v10-alias.log`. The ignored task report retains the runner and exact commands. No filesystem-state distinction was introduced.

## Scoped check receipts

| Command                                                                                                                                                                                | Fresh output                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `bun test ./apps/website/be-01/src --timeout=30000`                                                                                                                                    | Exit0;523 pass, 0 fail, 8897 expectations across 22 files;247.71s. `/tmp/puni-reference-backend.log`                      |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false BUN_INSTALL_CACHE_DIR=/tmp/puni-bun-cache-20261103 bunx nx run website-contracts:test`                                                       | Exit0;90 pass, 0 fail, 456 expectations across 7 files, plus noEmit typecheck; cache0/1. `/tmp/puni-reference-shared.log` |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false BUN_INSTALL_CACHE_DIR=/tmp/puni-bun-cache-20261103 bunx nx run-many -p website-be-01,website-contracts -t lint typecheck build --parallel=1` | Exit0; all 7 targets successful, cache0/7;15.8s. `/tmp/puni-reference-nx.log`                                             |

Structural validation: `bun node_modules/.bin/openspec validate --all --json` exited 0; 322/322 items passed (303 changes, 19 specs), zero failures. Exact JSON: `/tmp/puni-reference-openspec.json`. Changed-file formatting and staged whitespace receipts are recorded in the ignored task report. The normal local commit is pinned there after commit; this tracked record cannot contain its own hash.

Full `bunx nx format:check --all` and `bunx nx run-many -t test lint typecheck build` were not run by this task, per the controller's scoped instruction. The controller owns the full source gate/CI, independent review, private v10 fixture/snapshot refresh, bounded real pilot/full evaluation and release. No push, SSH, paid calls, deploy, private edits or About/blog changes occurred. The previously observed unrelated shallow-clone gate preparation warning is not corrected in app source.

## Evidence limits

The actual v9 full 21/34 remains failed. Deterministic fixtures do not prove model quality, live account controls or release readiness. Distinct wording removes the demonstrated collision; future public prose can still overlap a strict lexical gate. Local implementation checks pass; source gate and new-source paid acceptance remain pending with the controller.
