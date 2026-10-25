## Why

The agreed conversion journey lets visitors answer through choices, receive useful judgment, and send a visible brief for human review. The existing chat requires a second Send after landing, advances by turn count, and has no suggested-answer contract. Those behaviors obstruct the intended short, attentive conversation.

## What Changes

- Six starting choices and free text enter one claim-bound scoping conversation without repeating the landing action.
- Suggested answers, optional references and corrections work alongside typing. The assistant uses supplied details, answers questions, and proposes a useful starting point before the default email invitation.
- Conversation progression follows validated reply content instead of fixed turn numbers. An early human-review shortcut and an email-free exploration path remain available.
- Visitors review and edit their brief before explicitly sending it with an email. Operators receive the same brief and references.
- The services section presents the five offers with matching conversation CTAs. Privacy copy explains the actual anonymous chat, references, processors, storage and follow-up.
- Preserve and verify existing cost controls; evaluate conversation quality and actual session cost before activation.

## Non-Goals

Application building, automatic reference browsing, uploads, generated previews, automated sales email, CRM replacement, paid campaigns, or blog publishing. Browser analytics is a separate linked change. Premium hero styling follows the separate UI brief; this change supplies its functional handoff.

## Constraints

Use existing Bun/Nx, React, API, SQLite and OpenRouter boundaries. Keep anonymous claims, origin/CSRF checks, durable replay, retention and explicit proposal submission. Use additive reversible migrations. Preserve the 8-turn, $0.15 conversation, $0.30/source/day, three conversations/source/day and $10/site/day allowances. Treat $0.01/session as an estimate and $100/month as a provider-key launch setting to verify. Private landing source and human-review coverage are release dependencies, not assumed complete.

## Capabilities

### New Capabilities

- `conversion-scoping`: selectable, adaptive scoping from landing intent to explicit human-review request.

### Modified Capabilities

None in the archived spec registry. This change explicitly supersedes conflicting behavior in the active Build chat harness change, as mapped in design.md.

## Domain Terms

Starting choice, suggested answer, request reference; recorded in the website context.

## Decisions Recorded

None. The approach extends existing boundaries and remains reversible.

## Impact

Website contracts, API conversation/provider transport, SQLite store and retention, React harness, evaluation corpus, browser regressions and private landing integration. No paid inference, deployment or outbound communication is authorized by this planning artifact.
