# Build runtime setup

The approved Build experience uses assistant-ui, AI SDK, the existing Bun API and OpenRouter. Google is the first sign-in provider. The [change contract](../../openspec/changes/assistant-ui-build/design.md) owns behavior; this page owns deployment configuration. Implementation and verification are tracked in that change's tasks and verify files.

## Google

Create a Google OAuth client of type Web application in the PUNI Google Cloud project. Brand the consent screen PUNI and request only `openid email`. Register exact redirect URIs:

| Environment       | Redirect URI                                     |
| ----------------- | ------------------------------------------------ |
| Preview           | `https://dev.puni.dev/api/session/oidc/callback` |
| Production        | `https://api.puni.dev/session/oidc/callback`     |
| Local integration | `http://localhost:3101/session/oidc/callback`    |

Use separate preview/production clients when available. Store `OIDC_ISSUER=https://accounts.google.com`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and the environment's `OIDC_REDIRECT_URI` only in the host's protected runtime environment. Do not put the secret in a Vite/Astro public variable, shell command history, Git or a screenshot. The preview runtime file is `/home/puni1/puni-site-dev/runtime/runtime.env` with mode 0600.

Google requires the redirect URI to exactly match the registered value. Its server flow exchanges the authorization code for an ID token, which the API validates before creating a PUNI session. [Google OpenID Connect documentation](https://developers.google.com/identity/openid-connect/openid-connect).

The gateway strips preview's `/api` prefix before forwarding the callback. The browser's HttpOnly draft and session cookies remain host-only on `dev.puni.dev`; the app on `dev.app.puni.dev` accesses the API with credentials and an exact allowed Origin. App static requests must not forward those credentials. The API requires outbound HTTPS access to Google's discovery, token and key endpoints.

## OpenRouter

Runtime settings remain `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_PROVIDER`, `OPENROUTER_INPUT_USD_PER_MILLION`, `OPENROUTER_OUTPUT_USD_PER_MILLION`, `OPENROUTER_PRIVACY_VERIFIED` and `OPENROUTER_ENABLED`. Use a dedicated capped key and explicitly verified model/provider/prices. Never infer a free or zero price from missing configuration. The provider policy remains pinned routing, zero data retention and denied data collection. Missing final usage retains the reservation rather than treating the call as free.

The existing pilot limits are 12 user turns per request, $0.50 per request, $1 per account per UTC day and $10 across the site per UTC day. Admission counts outstanding reservations toward those limits and permits at most one unsettled call per account and four across the site. These limits are enforced by the API/store, independently of the visible remaining-turn counter.

Do not enable the paid provider until the selected model/provider policy, final usage and cancellation tests pass. A local fixture can prove transport behavior but cannot prove a real provider accepts the selected routing policy or price. A real smoke must check the actual account debit and persisted conversation.

## Activation evidence

Before claiming live Google/AI, record:

- Exact deployed public/private source and container image receipts.
- Home submission, Google return, owned request and first message surviving reload.
- Foreign origin/account refusal, expired request recovery and API failure feedback.
- Successful streamed reply, durable history, duplicate retry without a second call, and Stop cancelling generation.
- Provider usage/debit and retained reservation for unknown usage.
- Desktop/mobile chat, brief, preview and explicit proposal conversion.

Missing credentials are an activation dependency, not evidence of a working login. Keep unavailable states visible until real checks are recorded.
