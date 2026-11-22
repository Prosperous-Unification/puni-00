## Why

After a visitor sends their request from the scoped Build chat, the chat ends in a closing card with a Chat more link that starts an unrelated new draft. Visitors who think of something else have to start over, and PUNI never sees those later thoughts with the request they belong to.

## What Changes

- After submission, the confirmation (checkmark, “Your request is recorded.”, “PUNI will contact you by email within 4 hours.”) appears as a reply inside the conversation thread. Chat more is removed.
- The composer stays open. The visitor keeps writing in the same chat until the existing turn, spend or rate limits close it.
- The submitted draft keeps its conversation. Follow-up turns stay on the same draft and thread, and the operator inbox lists the visitor's messages sent after submission with the request.
- The scoping model is told the request is already submitted, so it does not invite a second request (`puni-scoping-v12`).
- Fe-01's browser screens check (W11) allows exactly the approved four-hour sentence and still rejects every other response-time promise.

Assumptions taken without asking are recorded in `design.md`.

## Non-goals

- Changing allowances, the manual, paused or disabled routes, or the legacy chat.
- Emailing follow-ups to PUNI or notifying the operator.
- Resetting a submitted chat with the operator test reset, which still refuses it.

## Capabilities

### New Capabilities

- `build-chat-after-submission`: the scoped chat continues on the submitted draft.

## Impact

`libs/website/adapters/store-sqlite` (store, conversation and scoping stores, funnel), `libs/website/domain/contracts`, `apps/website/be-01` (conversation routes, `/proposals`, the system prompt), `apps/website/fe-01` (harness, request editor, Build page, operator inbox, browser screens check).
