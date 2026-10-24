<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Issue #669 F5: `bun apps/wbs/be-01/src/main.ts` cannot serve an activated
organization locally. Under `AUTH_MODE=oidc` with a non-HTTPS issuer it boots,
then answers every authenticated request 500 (`only requests to HTTPS are
allowed` from lazy issuer discovery), native cookie sessions included, because
the authentication service asked the OIDC verifier before the JWT key. Under
`AUTH_MODE=local` every request is `local-dev`, so API keys never authenticate.
The local swarm rehearsal (`wbs-claim-display` verify.md) needed an uncommitted
entry to get past both.

## What Changes

- `AUTH_ISSUER_DISCOVERY_URL` that is unparsable or not `https:` is refused
  when be-01 or gw-01 composes OIDC, naming the key and the scheme, never the
  value. Both read it through one `@wbs/auth` function, so the browser client
  and the token verifier cannot disagree.
- A native password session verifies on the JWT key before the OIDC verifier is
  read, when password sessions are admitted. The OIDC verifier accepts RS256
  only, so no token changes outcome; only the order of reads does.
- `apps/wbs/be-01/src/testing/activated-organization-server.ts` boots the
  production composition over a fresh database with one activated organization
  and its `super_admin`, for local agents with API keys;
  `docs/local-dev.md` documents it with gw-01 and fe-01. The production
  entrypoint cannot reach it.

## Non-goals

- A development allowance for `http:` issuers. `openid-client` refuses
  non-HTTPS discovery unless `allowInsecureRequests` is passed, which no
  composition does; an allowance would admit a configuration that still cannot
  discover. A local provider is served over HTTPS (`docs/auth-integration.md`).
- Probing discovery at boot: a provider outage stays a per-request failure and
  must not stop a deploy.
- F6 of issue #669.

## Constraints

- Dev's issuer is HTTPS (scheme checked on h2puni without printing the value),
  so dev keeps booting.
- No migration; no wire contract changes.
