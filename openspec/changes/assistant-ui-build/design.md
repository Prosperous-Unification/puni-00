# Build implementation

Approved in conversation: assistant-ui, existing React/Vite and Bun API, AI SDK/OpenRouter, Google sign-in first. The private design at docs/website/build-experience.md supplies the Home and hostname contract.

## Entry and identity

GET /entry returns `{ available: boolean, reason: null | 'missing' | 'expired' }` with credentials and no-store. It alone permits site-origin reads; app routes retain their exact-origin boundary. Native intake saves before redirecting to a fixed Build URL. App root and /studio share the entry check. A cookie with no resumable draft returns expired; no cookie returns missing. Account-owned requests take precedence. No browser storage bit controls authorization.

The existing /manual redirect configuration stays available for manual routes. A separate fixed appBuildUrl config points at the app root. Google uses existing OIDC, with callback paths /session/oidc/callback or /api/session/oidc/callback only, bound to configured external API URL. Request availability gates sign-in as well as Build.

## Conversation

assistant-ui supplies React primitives styled with PUNI's Geist/Inter Tight fonts and palette. AI SDK UI message streaming supplies transport. Canonical messages, operation identity, authorization, provider policy and budget accounting remain in the API/database. Completed operations replay their saved result; an in-flight duplicate cannot start another provider call. Cancellation and missing usage retain conservative reservations. Keep the existing JSON /chat route compatible while the new stream endpoint is introduced.

Initial request identity derives from the owned request, not prompt text or browser storage. The signed-in workspace shows the saved request in the composer and waits for explicit Send; mounting, reloading and sign-in alone do not call the model. Keep the later-message composer unavailable until the initial operation is confirmed completed, including reloads with a pending retry. Persist the operation identity before calling the model. Failure and cancellation must be distinguishable from successful completed history.

## Panels and unavailable states

Conversation plus brief/preview on desktop; selectable panels on mobile. Preserve existing safe concept renderer and proposal flow. Before real credentials exist, render the submitted request, sign-in/provider setup state and manual continuation. Local demo mode is explicitly labeled and stays loopback-only.

Signed-in Build is a workspace: keep its heading compact, scroll conversation and preview independently on desktop, and keep the composer reachable without scrolling through the entire preview. Mobile uses compact panel controls. Customer copy describes the illustrative preview and its limitations without exposing SDK/provider terminology.

## Release

Public source first, then governed snapshot into the private companion. Preview API remains https://dev.puni.dev/api to preserve host-only cookies; app becomes https://dev.app.puni.dev. Site remains https://dev.puni.dev. Production uses app.puni.dev and api.puni.dev. Verify actual cross-host cookies and routing, then model/auth with fixtures; real-provider activation requires supplied credentials.
