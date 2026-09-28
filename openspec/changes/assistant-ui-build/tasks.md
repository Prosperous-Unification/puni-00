## 1. Entry and identity

- [x] 1.1 Add failing API tests for site/app entry, absent/expired/owned requests, foreign origins and fixed Build redirect; implement and prove guards.
- [x] 1.2 Add callback-prefix and Google-compatible OIDC tests, preserving state/nonce/PKCE and request ownership; document exact runtime settings.

## 2. Conversation transport

- [x] 2.1 Add durable operation identity and paired additive migration/down script; test retries, concurrent turns, account/request isolation and reload.
- [x] 2.2 Add AI SDK/OpenRouter streaming with existing admission controls; test usage settlement, malformed/missing usage, provider errors and cancellation through production paths.

## 3. Build app

- [x] 3.1 Install pinned assistant-ui and AI SDK dependencies with Bun; implement entry/loading/error/sign-in states and initial request handoff.
- [x] 3.2 Implement streaming chat, history, retry/stop and remaining allowance, brief/preview panels, mobile navigation and proposal CTA; verify with browser fixtures.

## 4. Private site and deployment

- [x] 4.1 Implement Home/Build/Services/Blog navigation with availability check and Home focus/highlight, preserving Novaform composition/media.
- [x] 4.2 Transfer verified public projects/dependencies to private snapshot; configure app hostname and exact gateway/CORS URLs.
- [ ] 4.3 Run required gates/reviews, deploy preview and verify cross-host submission/resume, responsive layout, original media and failure paths.
- [ ] 4.4 Configure supplied Google/OpenRouter credentials outside repos and verify real sign-in and bounded paid inference; report clearly if runtime credentials are unavailable.
