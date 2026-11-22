# Design

The product owner decided the behaviour in chat. The assumptions below were made without asking and are recorded here for review.

## Assumptions

- One submission per draft. After submission Build offers no second submission. A second `POST /proposals` under the same claim answers `409 draft_submitted`. A replay of the first submission's key still returns its receipt.
- “Submitted” is the existing `intake_draft.consumed_at` plus its `proposal_submission` row. No migration is needed. Submission no longer sets the conversation to `handed_off`. Stored `handed_off` rows from earlier binaries reopen on their next admitted turn.
- Only versioned (scoping) drafts continue after submission. Legacy drafts keep their closed behaviour.
- Follow-up turns are ordinary turns under every existing allowance, spend, concurrency and rate check, and under the draft's original expiry. They are retained and erased with the submission's retention subject. A fenced or erased submission refuses new turns.
- The brief and scoping edits stay frozen after submission. Later model replies advance only the question state.
- The smallest honest operator surface: the inbox lists the visitor's follow-up messages, in order, under the submitted brief.
- The funnel counts a proposal as from chat when its draft has a conversation, which is what `handed_off` meant at submission time. An exhausted conversation that was later submitted now stays counted as exhausted.

## Shape

- `followableDraftPredicate` (conversation store) is the SQL test for a draft that may hold new conversation work. It accepts an unsubmitted draft, or a submitted versioned draft whose `proposal_submission` subject is unfenced. Admission, settlement, scoping-reply application and `WebsiteStore.findConversationDraft` all use it. `findDraft` stays the submission-capable lookup for `/draft`, brief and scoping edits, discard and `/proposals`.
- `GET /entry`, `GET /conversation`, `POST /conversation/stream` (including `canContinue`) and `POST /conversation/cancel` read `findConversationDraft`. `ConversationView.submission` is `{ turnsBefore }` or null. `turnsBefore` is the number of saved turns at submission time, so the browser places the confirmation in the thread after a reload.
- `ConversationContext.submitted` reaches the model in the untrusted context. `composeScopingSystemText` appends one server-owned hint line when it is true.
- `SubmissionView.followUps` lists the visitor turns saved after the submission's `created_at`.
