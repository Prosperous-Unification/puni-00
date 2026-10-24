<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. Refuse an undiscoverable issuer at boot

- [x] 1.1 `issuerUrlFromEnv` in `@wbs/auth` parses `AUTH_ISSUER_DISCOVERY_URL` and refuses an
      unparsable value or a scheme other than `https:`; `oidcTokenVerifierFromEnv` and
      `browserOidcClientFromEnv` read the issuer through it. Tests:
      `apps/wbs/be-01/src/oidc-issuer-startup.test.ts` spawns `main.ts` with each bad issuer;
      gw-01 `config.test.ts` loads its configuration with each. Negatives: each check removed.

## 2. Verify native sessions before OIDC

- [x] 2.1 `AuthService.authenticateOrRefuse` verifies a native session on the JWT key before
      the OIDC verifier when password sessions are admitted. Test:
      `verifies a native session without reading the OIDC verifier`
      (`auth-service-null-password.test.ts`). Negatives: the OIDC-first order restored; the
      password-session condition made always true.

## 3. A local activated organization

- [x] 3.1 `testing/activated-organization-server.ts` and the `docs/local-dev.md` section.
      Test: `production-entrypoint.test.ts` asserts the production graph cannot reach it.
      Negative: `main.ts` importing it.

## 4. Archive

- [ ] 4.1 Archive once merged.
