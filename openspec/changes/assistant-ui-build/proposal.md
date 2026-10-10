# PUNI Home to Build

## Why

Visitors can submit a Home request, but the app still opens a manual form and its basic chat lacks streaming. Build must become the customer workspace without losing the request or bypassing account and spending controls.

## What Changes

- Home/Build/Services/Blog navigation with server-authorized request continuation.
- Google OIDC sign-in before paid inference, preserving the Home request.
- assistant-ui conversation, AI SDK streaming through the Bun API/OpenRouter, saved history, idempotent initial/retried turns and cancellation.
- Responsive chat beside a request brief and the existing constrained concept preview, with an explicit proposal action.
- Preview app hostname, exact origin/CORS configuration and configuration instructions for live credentials.

## Constraints

Keep Novaform media, composition, navigation numbering and button motion. Keep secrets outside repositories. Preserve manual proposal and operator flows. Retain server-side model/provider policy, reservations, limits and conservative accounting when usage is unknown. Use Bun/Nx. No arbitrary generated-code execution, attachments or model chooser.

## Impact

Public website app, API and SQLite adapter; private site navigation and deployment snapshot/config. Real Google/OpenRouter activation depends on runtime credentials; mocked verification must be labeled.
