## Why

The agreed conversion journey lets visitors answer through choices, receive useful judgment, and send a visible brief for human review. The existing chat requires a second Send after landing, advances by turn count, and has no suggested-answer contract. These obstruct an attentive conversation.

## What Changes

- Six starting choices and free text enter one claim-bound scoping conversation without repeating the landing action.
- Suggested answers, optional references and corrections work alongside typing. The assistant connects supplied details, answers questions, avoids repeated caveats, and suggests a focused first review step before the default email invitation.
- Conversation progression follows validated reply content instead of fixed turn numbers. New v7 operations retain v6 question-acknowledgement omission by recorded identity; v1–v5 and opaque history keep their earlier presentation. An early human-review shortcut and an email-free exploration path remain available.
- Visitors review and edit their brief before explicitly sending it with email. Explain human review naturally; operators receive that brief and references.
- The services section presents the five offers with matching conversation CTAs. Privacy copy explains the actual anonymous chat, references, processors, storage and follow-up.
- Preserve and verify existing cost controls; evaluate conversation quality and actual session cost before activation.

## Non-Goals

Application building, automatic reference browsing, uploads, generated previews, automated sales email, CRM replacement, paid campaigns, or blog publishing. Browser analytics is a separate linked change. Premium hero styling follows the separate UI brief; this change supplies its functional handoff.

## Constraints

Use existing Bun/Nx, React, API, SQLite and OpenRouter boundaries. HTTP idle budgets cover the existing reply deadline. Keep anonymous claims, origin/CSRF checks, durable replay, retention and explicit proposal submission. Use additive reversible migrations. Preserve the 8-turn, $0.15 conversation, $0.30/source/day, three conversations/source/day and $10/site/day allowances. Treat $0.01/session as an estimate and at most $100/month as the provider-key ceiling; preserve the verified $50/month key cap and confirm the deployment uses it. Private landing source and human-review coverage are release dependencies, not assumed complete.

## Capabilities

### New Capabilities

- `conversion-scoping`: selectable, adaptive scoping from landing intent to explicit human-review request.

### Modified Capabilities

This supersedes conflicting active Build chat harness behavior, mapped in design.md.
