<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. Refuse an undiscoverable issuer at boot

- [x] 1.1 `issuerUrlFromEnv` in `@wbs/auth` parses `AUTH_ISSUER_DISCOVERY_URL` and refuses an
      unparsable value or a scheme other than `https:`, naming only a well-known scheme;
      `oidcTokenVerifierFromEnv` and `browserOidcClientFromEnv` read the issuer through it.
      Tests: `apps/wbs/be-01/src/oidc-issuer-startup.test.ts` spawns `main.ts` with an
      `http:`, an unparsable and a scheme-less issuer; gw-01 `config.test.ts` loads its
      configuration with each of the first two. Negatives: each check removed; the scheme
      named unconditionally.

## 2. Native sessions never wait on discovery

- [x] 2.1 `AuthService.authenticateOrRefuse` verifies a native session on the JWT key before
      the OIDC verifier when password sessions are admitted. Test: `verifies a native
session without reading the OIDC verifier` (`auth-service-null-password.test.ts`).
      Negatives: the OIDC-first order restored; the password-session condition made always
      true.
- [x] 2.2 `organizationCredentialEvidence` skips the upstream verifier for a `first_party`
      principal. Tests: "a native session under a verifier outage" (`boot.db.test.ts`):
      `/api/auth/me`, `/api/projects`, `/api/people` 200 by cookie and Bearer with password
      login on; 500 with it off; an RS256 token 500. Negative: the condition removed.
- [x] 2.3 `oidcTokenVerifierFromEnv` caches discovery with `cacheWhileItSucceeds`. Test:
      `discovers again once a failed discovery cools down` (`token-verifier.test.ts`).
      Negative: the `??=` memoization restored.

## 3. A local activated organization

- [x] 3.1 `dev/activated-organization-server.ts` on loopback, with the fixture SQL shared with
      `BootedBrowserProcess`, cleanup on a failed start, and the `docs/local-dev.md` section.
      Tests: `dev/activated-organization-server.test.ts` (logs in, selects the
      organization, reads people; unreachable on a LAN address; leaves nothing behind on
      SIGTERM or on an occupied port); `production-entrypoint.test.ts` (unreachable from
      `main.ts`). Negatives: the loopback listener, the cleanup, and `main.ts` importing it.

## 4. Archive

- [ ] 4.1 Archive once merged.
