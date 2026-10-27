import { mcpAuthModeOf } from '@wbs/auth';
import { canonicalMcpAuthorizationServer, mcpAuthorizationServerOf } from '@wbs/contracts';
import { type } from '@wbs/validation';

/**
 * mcp-01's whole non-provider configuration: trust mode, be-01 endpoint, and
 * an optional deployment-gate credential. Caller credentials never live here.
 *
 * Nothing here has a default. `WBS_API_URL=http://localhost:3100` would look
 * harmless and then silently edit whichever deployment happened to answer on
 * that port; an MCP server that writes to a plan must not guess which plan.
 * See design.md D3 and D6.
 */
export const McpConfig = type({
  MCP_AUTH_MODE: "'standalone'|'gateway'",
  WBS_API_URL: 'string.url',
  MCP_PUBLIC_URL: 'string.url',
  'MCP_TRUSTED_GATEWAY?': "'true'",
  // `user:pass`. The password may contain colons, the user may not — which is
  // also how an `Authorization: Basic` credential splits.
  'WBS_BASIC_AUTH?': /^[^:\s]+:.+$/,
  // be-01's own INTERNAL_AUTH_SECRET. Present, mcp-01 binds consents to an
  // organization after activation and calls be-01 with signed delegations;
  // absent, it keeps forwarding the upstream token, which be-01 refuses for
  // organization resources once activated.
  'INTERNAL_AUTH_SECRET?': 'string>=32',
  // be-01's MCP_BE_INTERNAL_SECRET, sent as `x-mcp-internal-auth` with every
  // machine grant request, every machine token's be-01 call and, in place of
  // INTERNAL_AUTH_SECRET, every `/internal/mcp/*` call (`wbs-mcp-agent-surface`
  // M14). Present in standalone mode, the token endpoint offers the machine
  // grants ({@link offersMachineGrants}).
  // Proof: with 'string' here, `refuses a short MCP_BE_INTERNAL_SECRET, naming it and not its
  // value` (machine-token.test.ts) loaded it; watched 2026-10-27.
  'MCP_BE_INTERNAL_SECRET?': 'string>=32',
});
export type McpConfig = typeof McpConfig.infer;

const NAMES = [
  'MCP_AUTH_MODE',
  'WBS_API_URL',
  'MCP_PUBLIC_URL',
  'MCP_TRUSTED_GATEWAY',
  'WBS_BASIC_AUTH',
  'INTERNAL_AUTH_SECRET',
  'MCP_BE_INTERNAL_SECRET',
] as const;

const EXPECTATIONS: Record<(typeof NAMES)[number], string> = {
  MCP_AUTH_MODE: 'standalone or gateway authentication',
  WBS_API_URL: 'the base URL of a be-01 deployment, e.g. https://dev.wbs.bulletpoints.club',
  MCP_PUBLIC_URL:
    'the canonical public MCP resource URL, e.g. https://dev.wbs.bulletpoints.club/mcp',
  MCP_TRUSTED_GATEWAY: 'the exact value true when gateway mode terminates token verification',
  WBS_BASIC_AUTH: 'user:pass for the deployment’s basic auth, or unset',
  INTERNAL_AUTH_SECRET: "be-01's INTERNAL_AUTH_SECRET, at least 32 characters, or unset",
  MCP_BE_INTERNAL_SECRET: "be-01's MCP_BE_INTERNAL_SECRET, at least 32 characters, or unset",
};

/**
 * Whether the token endpoint offers the machine grants, `client_credentials`
 * and the JWT-bearer grant (`wbs-mcp-agent-surface` M1, M2): only in
 * standalone mode, and only with `MCP_BE_INTERNAL_SECRET`, without which no
 * grant can be asked of be-01. Otherwise both grants answer
 * `unsupported_grant_type` and the metadata omits them; gateway mode never
 * admits a machine (M11).
 */
export function offersMachineGrants(
  config: Pick<McpConfig, 'MCP_AUTH_MODE' | 'MCP_BE_INTERNAL_SECRET'>,
): boolean {
  // Proof: without the mode test, `omits them without the secret and in gateway mode`
  // (machine-token.test.ts) listed the grants; watched 2026-10-27.
  return config.MCP_AUTH_MODE === 'standalone' && config.MCP_BE_INTERNAL_SECRET !== undefined;
}

/**
 * Reads the MCP variables and nothing else.
 *
 * The narrow read is the point, and the reason has changed. It was that
 * `defineConfig` handed its whole env source to `parseOrThrow`, which put
 * `JSON.stringify(input)` in the thrown message — so a boot failure printed the
 * env, and for a process whose env is one account's token and one basic-auth
 * password it printed the credentials. `defineConfig` goes through
 * `parseSecretsOrThrow` now and names variables only, so that hazard is closed
 * at the source.
 *
 * What remains is this file's own reason to stay narrow: it reads the MCP
 * variables and nothing else, so a variable belonging to another tier cannot
 * reach an MCP refusal at all. The message here names variables and never
 * values, which is the same rule one layer up.
 */
export const loadConfig = (env: Record<string, string | undefined> = process.env): McpConfig => {
  const mode = mcpAuthModeOf(env);
  if (mode === 'gateway' && env['MCP_TRUSTED_GATEWAY'] !== 'true') {
    throw new Error('mcp-01 cannot start: MCP_TRUSTED_GATEWAY=true is required in gateway mode');
  }
  const picked: Record<string, string> = {};
  for (const name of NAMES) {
    const value = env[name];
    // An empty string is an unset variable that went through a shell, not a
    // An empty shell variable is absent, not a usable configuration value.
    if (value !== undefined && value !== '') picked[name] = value;
  }

  const result = McpConfig(picked);
  if (!(result instanceof type.errors)) {
    // The issuer be-01's WBS_MCP_AUTHORIZATION_SERVER must equal is derived
    // from this URL by the shared function; one it cannot reproduce (such as
    // `…/mcp//`) would never match, so it refuses here, at boot.
    // Proof: with this check removed, `refuses a public URL whose derived
    // issuer is not canonical` (config.test.ts) loaded `…/mcp//`; watched
    // 2026-10-26.
    canonicalMcpAuthorizationServer(
      mcpAuthorizationServerOf(result.MCP_PUBLIC_URL),
      'the authorization server derived from MCP_PUBLIC_URL',
    );
    return result;
  }

  const faults = [...new Set(result.map((error) => String(error.path[0])))]
    .filter((name): name is (typeof NAMES)[number] => name in EXPECTATIONS)
    .map((name) =>
      name in picked
        ? `${name} is set but invalid (expected ${EXPECTATIONS[name]})`
        : `${name} is required (${EXPECTATIONS[name]})`,
    );

  // The fallback names no value either. `result.summary` would, and a summary
  // is exactly the kind of thing that gets logged.
  throw new Error(
    `mcp-01 cannot start: ${
      faults.length > 0 ? faults.join('; ') : 'the environment did not match the expected shape'
    }. These have no defaults on purpose — see apps/wbs/mcp-01/README.md.`,
  );
};
