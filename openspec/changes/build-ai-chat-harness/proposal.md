# Build AI chat harness

## Why

Build is a light, card-based workspace behind a Google sign-in wall with no live model. It neither matches the dark, video-backed site Dany approved nor converts: a visitor who typed a request sees a form. Dany asked for the site's background animation, a typical AI chat harness and a real OpenRouter integration so a short conversation turns a visitor into a proposal request.

## What Changes

- **Look.** The site's background video, streamed from the site origin with a scrim, reduced-motion poster and gradient fallback; the monotext `[n]` header with wordmark and moon; a full-height conversation with a liquid-glass composer pinned at the bottom. The manual brief and operator routes keep their light look.
- **Who may chat.** Anonymous chat bound to the existing browser draft claim under strict caps; Google sign-in stays optional. ORCHESTRATOR ASSUMPTION, Dany may override; superseded lines are named in `design.md`.
- **What the assistant does.** A short sales conversation with server-owned stages: clarify, reflect a brief, build confidence, ask for an email, hand off to the existing proposal submission. It never agrees to price, dates or contracts.
- **Explicit Send** stays: the Home request is pre-filled; nothing paid happens before the visitor presses Send.

## Non-Goals

No concept-preview change, model tools, attachments, model chooser, generated code, payments or outbound email. No WBS change. Activation is a separate operator step with its own evidence.

## Constraints

Public repository: the video is referenced, never committed. Additive migrations with paired `down.sql`. Server-only key, pinned provider, ZDR, data-collection denial, atomic reservations; unsettled usage blocks spend. The privacy notice names the processors before chat is enabled. Chat content anchors retention. Bun, Nx, the h2puni gate; prompt text never in logs.

## Capabilities

### New Capabilities

- `build-chat-harness`: dark, video-backed conversation UI with explicit Send, stop, retry, reload restore and inline conversion affordances.
- `anonymous-conversation`: claim-bound conversation API, stage machine, caps, reservations and proposal handoff.
- `conversation-retention`: conversation content anchored, erased and purged with its retention subject or expired draft.
- `chat-provider-activation`: visibly disabled state without a key, activation runbook, privacy gate and evaluation corpus.

### Modified Capabilities

None. Superseded still-open delta lines in `assistant-ui-build` and `puni-website-funnel` are named in `design.md`.

## Domain Terms

Conversation stage; Visitor turn; Conversation allowance; Source.

## Decisions Recorded

- [ADR 0034](../../../docs/adr/0034-anonymous-paid-chat-bound-to-the-browser-claim.md)

## Impact

`apps/website/{fe-01,be-01}`, `libs/website/*` (migration 007), `docs/website/*`; private privacy page, Compose activation override and release snapshot.
