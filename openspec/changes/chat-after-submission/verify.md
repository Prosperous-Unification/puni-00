# Verification

Bun tests ran with `env -u CLAUDECODE` because 13 repository tests fail only under `CLAUDECODE=1`.

## Tests written first

- Store: `submitted-conversation.test.ts` failed 6 of 6 before the store change, with no `findConversationDraft` and `draft_unavailable` after submission. `funnel-store.test.ts` gained the open-after-submission from-chat case.
- API: `conversation.test.ts` gained `a scoped chat continues on the same draft after submission and the operator sees follow-ups`, which covers entry, the conversation view, follow-up streaming, the v12 hint and context, `409 draft_submitted`, replay of the original receipt, and operator follow-ups.
- Build: `conversation-harness.test.tsx` covers the recorded request, the reload and exhaustion after submit. `build-contract.test.ts` covers the submission boundary, `start-over.test.tsx` covers the reload without Start over, and `submission-follow-ups.test.tsx` covers the inbox list. `response-promise.test.ts` covers W11.

## R5 proofs

Each fault was injected with `fault.py`, which edits the file, runs the named test and restores the file. The named test failed each time. The `Proof:` comments beside each check name the same faults.

| Check                                                           | Injected fault                                                           | Observed failure                                                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `followableDraftPredicate` version clause                       | clause removed                                                           | submitted legacy turn admitted                                                                                                  |
| `followableDraftPredicate` fence clause                         | `erasure_state <> 'none'` → `0`                                          | fenced settlement threw `retention: subject content is fenced` instead of refusing                                              |
| admission draft lookup                                          | predicate → `consumed_at IS NULL`                                        | 5 of 6 submitted-conversation tests                                                                                             |
| settlement draft lookup                                         | predicate → `consumed_at IS NULL`                                        | follow-up settlement and allowance tests                                                                                        |
| `findConversationDraft` lookup                                  | predicate → `consumed_at IS NULL`                                        | submitted draft not found                                                                                                       |
| handed-off reopen                                               | throw kept for submitted drafts                                          | `Handed-off conversation has an unconsumed draft`                                                                               |
| frozen brief                                                    | `AND consumed_at IS NULL` removed from the reply brief write             | submitted draft brief replaced                                                                                                  |
| second submission                                               | `submitted` → `unavailable`                                              | second-submission test                                                                                                          |
| operator follow-ups                                             | `created_at >` condition removed                                         | opening listed as a follow-up                                                                                                   |
| funnel from-chat                                                | `handed_off` condition restored                                          | open submitted chat counted as manual                                                                                           |
| `GET /entry`, `GET /conversation`, stream lookup, `canContinue` | each back to `findDraft`                                                 | mounted follow-up test (entry `available: false`, 401, refused stream, reply cut short)                                         |
| `/proposals` submitted outcome                                  | answered `401 draft_unavailable`                                         | mounted follow-up test                                                                                                          |
| submitted prompt hint                                           | hint dropped from `composeScopingSystemText`                             | mounted outbound system-text assertion                                                                                          |
| v12 replay identity                                             | v12 removed from `presentScopingReply`                                   | `puni-scoping-v12 omits a question-shaped acknowledgement…`                                                                     |
| harness `isFinal`                                               | `!isSubmitted` removed                                                   | recorded-request test: composer hidden                                                                                          |
| review focus reset                                              | `setReview(null)` and `updateReviewFocus(false)` removed                 | recorded-request test: composer hidden                                                                                          |
| per-turn receipt placement                                      | removed                                                                  | reload and exhaustion-after-submit tests                                                                                        |
| trailing receipt placement                                      | `false`                                                                  | recorded-request test never showed the confirmation                                                                             |
| editor gating                                                   | `!isSubmitted` removed                                                   | recorded-request and reload tests kept the email form                                                                           |
| `describeExhaustion` submitted copy                             | branch disabled                                                          | exhaustion-after-submit test                                                                                                    |
| `parseConversation` submission                                  | absent field accepted, or the upper bound removed                        | submission boundary test                                                                                                        |
| Start over on reload                                            | `submission === null` condition removed                                  | `a reloaded submitted chat offers no Start over`                                                                                |
| W11 allow-list                                                  | replacement removed, or `hours` dropped from the pattern                 | `the W11 screens check allows only the approved chat receipt sentence` (approved line flagged, or `within 2 hours` let through) |
| Paused and disabled submitted chats                             | `submission !== null` → `false` in `PausedHarness` and `DisabledHarness` | `a paused submitted chat shows the confirmation…` and `a reloaded submitted chat offers no Start over`                          |

## Commands

- `env -u CLAUDECODE NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx --no-install nx run-many -t test,lint,typecheck,build -p website-fe-01 website-be-01 website-store-sqlite website-contracts --parallel=1 --output-style=static`: contracts 92, store 287 and be-01 577 tests passed with 0 failures. Lint, typecheck and build passed for those three projects. The fe-01 typecheck in that run raced a concurrent edit and failed on a missing import, so fe-01 was rerun.
- The same command with `-p website-fe-01` then passed test (196 pass, 0 fail), lint, typecheck and build, together with the 4 tasks it depends on.
- `bunx --no-install openspec validate --all --json` checked 357 items and all passed. `openspec validate chat-after-submission --strict` reported the change valid.
- Not run: the full monorepo gate and CI-only checks (secrets scan, migration lint). This change adds no migration.

## Browser

- A scratch Playwright walk-through ran against the local fixture stack: `conversation-api.mjs`, a Vite build and `vite preview` on 4292, and the built private site on 4392 with its origins rewritten. At 390 and 1440 px it submitted from the scoped chat and saw the in-thread confirmation, with no Chat more and no Start over. It sent a follow-up, got the fixture's acknowledgement and reloaded. The confirmation stayed between the pre-submission turns and the follow-up, with no horizontal overflow and no page errors. The screenshots were reviewed by eye.
- `browser/request-editor.mjs` passed all four cases on this branch and on the pre-change commit.
- `browser/scoping.mjs` fails at line 128 (`Keep exploring` at the final email step) both on this branch and on the pre-change commit `18049c792`. The cause is the inherited declutter final step, not this change, and it was left unchanged.
- `browser/screens.mjs` was not run because it needs both fixture stacks. Its W11 check now calls `findResponseTimePromise`, which is covered by the unit test above, and `bun build` resolved the new import.
