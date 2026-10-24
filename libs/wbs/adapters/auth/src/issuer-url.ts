/** Schemes a refusal may name without echoing any part of the configured value. */
const NAMEABLE_SCHEMES = new Set(['http:', 'ws:', 'wss:', 'file:', 'ftp:', 'data:']);

/**
 * `AUTH_ISSUER_DISCOVERY_URL` as the URL discovery will fetch, refused at
 * composition when discovery could never succeed.
 *
 * `openid-client` refuses every non-HTTPS request unless a caller passes
 * `allowInsecureRequests`, and no composition here does. Discovery is lazy, so
 * an `http:` issuer used to boot cleanly and then answer every request that
 * reached the configured verifier with a 500 (issue #669 F5). There is no
 * development allowance: a local OIDC provider is served over HTTPS
 * (`docs/auth-integration.md`), and an allowance would re-open a path that
 * still cannot reach discovery.
 *
 * @throws naming the key when it is missing, unparsable, or not `https:`. The
 *   message names a well-known scheme at most, never any part of the value.
 */
export function issuerUrlFromEnv(env: Readonly<Record<string, string | undefined>>): URL {
  const key = 'AUTH_ISSUER_DISCOVERY_URL';
  const written = env[key];
  if (written === undefined || written === '')
    throw new Error(`${key} is required in AUTH_MODE=oidc`);
  // Proof: with this check removed, `main.ts refuses an unparsable OIDC
  // issuer before process boot` (be-01 oidc-issuer-startup.test.ts) received
  // a bare ERR_INVALID_URL whose `input` logged the configured value; watched
  // 2026-10-24.
  if (!URL.canParse(written)) throw new Error(`${key} is not a URL`);
  const issuer = new URL(written);
  // Proof: with this check removed, `main.ts refuses a non-HTTPS OIDC issuer
  // before process boot` (be-01 oidc-issuer-startup.test.ts) booted past the
  // composition and failed on the unmigrated database instead, and gw-01's
  // `refuses an issuer discovery could never reach at boot` (config.test.ts)
  // saw loadConfig return; both watched 2026-10-24.
  if (issuer.protocol !== 'https:') {
    // A scheme-less `host:port` parses with the host as its scheme, so only a
    // known scheme is named.
    // Proof: naming `issuer.protocol` unconditionally made `main.ts refuses a
    // scheme-less OIDC issuer` (oidc-issuer-startup.test.ts) find the host in
    // the output; watched 2026-10-24.
    const named = NAMEABLE_SCHEMES.has(issuer.protocol) ? `, not ${issuer.protocol}` : '';
    throw new Error(
      `${key} must be an https: URL${named}; OIDC discovery refuses any other scheme`,
    );
  }
  return issuer;
}
