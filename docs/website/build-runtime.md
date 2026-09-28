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

The [provider candidate and activation checks](provider-activation.md) record the current proposed model, exact endpoint and listed rates. They are not live billing or eligibility evidence.

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

## Preview activation sequence

The preview Compose file explicitly sets `DEMO_AUTH=0` and `OPENROUTER_ENABLED=0`. Its `environment` entries override the protected `env_file`: adding `OPENROUTER_ENABLED=1` to `runtime/runtime.env` alone will not enable inference. Keep the base release disabled and retain a separate reviewed activation configuration with the release receipts.

1. Provision a PUNI Google **Web application** client and register the preview callback above. Add its four OIDC settings to the existing mode-0600 runtime file without replacing the operator credential. Recreate the API with the existing release's immutable images and runtime/data paths. An API restart alone does not reload a Compose env file.
2. With inference still disabled, verify a real browser's Home submission, Google return, verified identity, owned request and reload. Keep the manual brief available if Google rejects or the user cancels sign-in. Record this result before activating paid calls.
3. Create a dedicated OpenRouter key with a $100 monthly ceiling, model/provider restrictions and the required privacy settings. Verify current endpoint compatibility, prices and processor wording. Store the key and approved nonsecret model/provider/rate settings in the protected file. Catalog research is not proof of account eligibility or successful paid accounting.
4. After those checks, an operator may apply a separate Compose override containing only the following enable switch. Use the same release Compose file, image IDs, runtime file and database path; validate the merged configuration with `docker compose ... config --quiet`, then recreate the API. Retain the exact override and runtime change receipt outside Git; never print expanded configuration containing credentials.

   ```yaml
   services:
     api:
       environment:
         OPENROUTER_ENABLED: '1'
   ```

5. Run the bounded real-provider checks in **Activation evidence** above. Inspect provider-side debit and the durable operation/usage record without copying request content or credentials into logs. A successful reply alone does not prove accounting. Keep unknown usage held for investigation; do not clear its reservation to make another request succeed.
6. To disable inference, recreate the API using the base Compose configuration without the enable override. Retain the same database and runtime file so saved requests and manual conversion remain available. Confirm provider readiness is unavailable and all services remain healthy.

Configuration-only proof on 2026-09-29: with a synthetic env file containing `OPENROUTER_ENABLED=1`, `docker compose -f deploy/website/dev/compose.yml config --format json` still resolved the API flag to `0`. Adding the override above resolved it to `1`; both configurations retained `DEMO_AUTH=0`. No service was started and no live setting was changed by this proof. The deployed runtime still contains only its operator credential, so steps 1–5 remain pending.
