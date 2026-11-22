## 1. Store

- [x] 1.1 Failing store tests: a follow-up is admitted and settled on a submitted versioned draft; a fenced submission and a submitted legacy draft refuse; caps still exhaust; a second submission is `submitted`; replay still returns the receipt; follow-ups list under the submission.
- [x] 1.2 Implement `followableDraftPredicate`, `findConversationDraft`, the `submitted` submit outcome, the frozen brief guard, and `followUps`. Submission stops handing off, and stored `handed_off` rows reopen on admission. Update the funnel from-chat rule.

## 2. API and prompt

- [x] 2.1 Failing mounted tests: stream and conversation reads after submit, `submission.turnsBefore`, `409 draft_submitted`, replay after follow-ups, the operator follow-ups, and the v12 submitted hint in the outbound request.
- [x] 2.2 Route conversation endpoints through `findConversationDraft`. Add `ConversationView.submission`, `ConversationContext.submitted`, the hint and `puni-scoping-v12` with its reviewed source and replay identity.

## 3. Build

- [x] 3.1 Failing mounted tests: no Chat more; in-thread confirmation; composer open after submit; reload placement; exhaustion after submit closes the composer without a resubmission prompt.
- [x] 3.2 Implement in the harness, request editor, Build page and operator inbox.

## 4. Browser checks and verification

- [x] 4.1 Allow-list the approved sentence in W11 and prove another response-time promise still fails.
- [x] 4.2 Run the website Nx targets, browser checks and `openspec validate --all --json`. Record the results in `verify.md`.
