import { authModeOf } from '@wbs/auth';
import { defineConfig } from '@wbs/config';
import { canonicalMcpAuthorizationServer } from '@wbs/contracts';
import type { OrganizationLimitValues } from '@wbs/domain';
import { type } from '@wbs/validation';

import { parseResolvers } from './runtime/authoritative-dns/addresses';
import { type EmailDeliveryConfig, readEmailDelivery } from './runtime/email-delivery-config';

/**
 * One deployment default organization limit (`wbs-organization-limits` L7): a
 * whole number within `ORGANIZATION_LIMIT_BOUNDS`, required with no default.
 */
const organizationDefaultLimit = type('string.integer.parse').to('0 <= number <= 1000000');

/** The three deployment default limits on their own, for a process that needs no more. */
const OrganizationDefaultLimitsConfig = type({
  ORGANIZATION_DEFAULT_MAX_AGENT_PERSONS: organizationDefaultLimit,
  ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS: organizationDefaultLimit,
  ORGANIZATION_DEFAULT_MAX_CAPACITY_UNITS_PER_RESOURCE: organizationDefaultLimit,
});

/**
 * The deployment default limits (`wbs-organization-limits` L7) from the same
 * three variables be-01 boots with, for the operator CLI run beside it.
 *
 * @throws naming the variable when any is absent or not a whole number from
 * 0 to 1,000,000; there is no default in code.
 */
export function loadOrganizationDefaultLimits(
  envSource: Record<string, string | undefined> = process.env,
): OrganizationLimitValues {
  const config = defineConfig(OrganizationDefaultLimitsConfig, envSource);
  return {
    maxAgentPersons: config.ORGANIZATION_DEFAULT_MAX_AGENT_PERSONS,
    maxConcurrentClaims: config.ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS,
    maxCapacityUnitsPerResource: config.ORGANIZATION_DEFAULT_MAX_CAPACITY_UNITS_PER_RESOURCE,
  };
}

/**
 * mcp-01's service settings at be-01 (`wbs-mcp-agent-surface` M2, M3, M14):
 * its dedicated secret, the machine grant signing keys and mcp-01's
 * authorization server. Each is null when unset; an activated store refuses
 * to boot while any is ({@link missingMcpServiceSettings}).
 */
export interface McpServiceSettings {
  readonly internalSecret: string | null;
  readonly grantSigningKeys: { readonly current: string; readonly previous: string | null } | null;
  readonly authorizationServer: string | null;
}

const McpServiceConfig = type({
  'MCP_BE_INTERNAL_SECRET?': 'string>=32',
  'WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT?': 'string>=32',
  'WBS_MACHINE_GRANT_SIGNING_KEY_PREVIOUS?': 'string>=32',
  'WBS_MCP_AUTHORIZATION_SERVER?': 'string',
});

/**
 * {@link McpServiceSettings} from the environment, for be-01 and for the
 * activation preflight run beside it.
 *
 * @throws naming the variable when one is shorter than 32 characters, when a
 * previous grant key is set without a current one, and when the authorization
 * server is not the canonical `<MCP_PUBLIC_URL>/oauth`.
 */
export function loadMcpServiceSettings(
  envSource: Record<string, string | undefined> = process.env,
): McpServiceSettings {
  const config = defineConfig(McpServiceConfig, envSource);
  const current = config.WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT ?? null;
  const previous = config.WBS_MACHINE_GRANT_SIGNING_KEY_PREVIOUS ?? null;
  // Proof: with this guard disabled, `refuses a previous grant key without a
  // current one` (config.test.ts) loaded the settings; watched 2026-10-26.
  if (current === null && previous !== null)
    throw new Error(
      'WBS_MACHINE_GRANT_SIGNING_KEY_PREVIOUS needs WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT',
    );
  const server = config.WBS_MCP_AUTHORIZATION_SERVER ?? null;
  return {
    internalSecret: config.MCP_BE_INTERNAL_SECRET ?? null,
    grantSigningKeys: current === null ? null : { current, previous },
    authorizationServer:
      server === null
        ? null
        : canonicalMcpAuthorizationServer(server, 'WBS_MCP_AUTHORIZATION_SERVER'),
  };
}

/**
 * The variables an activated store needs and `settings` lacks, by name: what
 * boot refuses on and what the activation preflight lists.
 */
export function missingMcpServiceSettings(settings: McpServiceSettings): string[] {
  return [
    ...(settings.internalSecret === null ? ['MCP_BE_INTERNAL_SECRET'] : []),
    ...(settings.grantSigningKeys === null ? ['WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT'] : []),
    ...(settings.authorizationServer === null ? ['WBS_MCP_AUTHORIZATION_SERVER'] : []),
  ];
}

export const BeConfig = type({
  PORT: 'string.integer.parse',
  INTERNAL_AUTH_SECRET: 'string>=32',
  LOG_LEVEL: "'trace'|'debug'|'info'|'warn'|'error'|'fatal'",
  GW_URL: 'string',
  // Required rather than defaulted: a fallback like './local.db' puts the
  // database inside the checkout, where a re-clone or `git clean` erases it.
  DB_PATH: 'string>0',
  // The same value gw-01 verifies WebSocket tokens with. Held to the same
  // >=32 bound as gw-01's copy so a short key fails at both ends or neither.
  JWT_SIGNING_KEY_CURRENT: 'string>=32',
  AUTH_MODE: "'local'|'oidc'",
  // Required with no default: whether logout, refresh and replacement commit
  // through the shared durable browser lifecycle, and whether the browser
  // organization cookie is read, is an operator decision; see `bootBe01`.
  BROWSER_SESSION_AUTHORITY: "'enabled'|'disabled'",
  // Required with no default: the caps every organization without its own row
  // holds are one deployment decision, and a default in code would set a
  // tenant's plan by omission (`wbs-organization-limits` L7).
  // Proof: making ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS optional made
  // `refuses an absent, fractional, negative or over-bound … CONCURRENT_CLAIMS`
  // in config.test.ts load the absent case (30 pass, 1 fail); watched 2026-10-22.
  ORGANIZATION_DEFAULT_MAX_AGENT_PERSONS: organizationDefaultLimit,
  ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS: organizationDefaultLimit,
  ORGANIZATION_DEFAULT_MAX_CAPACITY_UNITS_PER_RESOURCE: organizationDefaultLimit,
  'WBS_DELEGATION_SIGNING_KEY?': 'string',
  'WBS_DELEGATION_VERIFY_KEY?': 'string',
  'ORGANIZATION_DNS_RESOLVERS?': 'string',
  // Proof: widening this to string accepted invalid values in `proof scheduling overrides`.
  'ORGANIZATION_DOMAIN_PROOF_SCHEDULING?': "'enabled'|'disabled'",
  'SOLVER_BUDGET_MS?': 'string.integer.parse',
  'SOLVER_SEARCH_WORKERS?': 'string.integer.parse',
  'SOLVER_MEMORY_LIMIT_MB?': 'string.integer.parse',
});
export type BeConfig = Omit<
  typeof BeConfig.infer,
  'SOLVER_BUDGET_MS' | 'SOLVER_SEARCH_WORKERS' | 'SOLVER_MEMORY_LIMIT_MB'
> & {
  SOLVER_BUDGET_MS: number;
  SOLVER_SEARCH_WORKERS: number;
  SOLVER_MEMORY_LIMIT_MB: number;
};

/** Dedicated literal PEM pair; absence keeps delegation disabled. */
export interface DelegationKeys {
  readonly signingKey: string;
  readonly verifyKey: string;
}

export const loadConfig = (
  envSource: Record<string, string | undefined> = process.env,
): BeConfig & {
  appOrigin: string;
  delegationKeys?: DelegationKeys;
  organizationDnsResolvers?: readonly string[];
  emailDelivery: EmailDeliveryConfig;
  organizationDefaultLimits: OrganizationLimitValues;
  mcpService: McpServiceSettings;
} => {
  const mode = authModeOf(envSource);
  const config = defineConfig(BeConfig, envSource);
  const signingKey = envSource['WBS_DELEGATION_SIGNING_KEY'];
  const verifyKey = envSource['WBS_DELEGATION_VERIFY_KEY'];
  // Proof: deleting this pair guard made `refuses partial delegation key
  // configuration` accept a signing key alone (2026-09-28).
  if (
    (signingKey === undefined) !== (verifyKey === undefined) ||
    signingKey === '' ||
    verifyKey === ''
  ) {
    throw new Error('delegation keys must be a complete nonempty pair');
  }
  const delegationKeys =
    signingKey === undefined || verifyKey === undefined ? undefined : { signingKey, verifyKey };
  const solverBudgetMs = config.SOLVER_BUDGET_MS ?? 60_000;
  if (solverBudgetMs <= 0) throw new Error('SOLVER_BUDGET_MS must be greater than zero');
  const solverSearchWorkers = config.SOLVER_SEARCH_WORKERS ?? 2;
  if (solverSearchWorkers <= 0) {
    throw new Error('SOLVER_SEARCH_WORKERS must be greater than zero');
  }
  const solverMemoryLimitMb = config.SOLVER_MEMORY_LIMIT_MB ?? 512;
  if (solverMemoryLimitMb <= 0) {
    throw new Error('SOLVER_MEMORY_LIMIT_MB must be greater than zero');
  }
  const appOrigin =
    mode === 'oidc' ? oidcCallbackUrlFromEnv(envSource).origin : localAppOriginFromEnv(envSource);
  return {
    ...config,
    delegationKeys,
    appOrigin,
    organizationDnsResolvers: parseResolvers(config.ORGANIZATION_DNS_RESOLVERS),
    // Proof: removing this binding failed the production config disabled-mode assertion.
    emailDelivery: readEmailDelivery(envSource),
    organizationDefaultLimits: loadOrganizationDefaultLimits(envSource),
    mcpService: loadMcpServiceSettings(envSource),
    SOLVER_BUDGET_MS: solverBudgetMs,
    SOLVER_SEARCH_WORKERS: solverSearchWorkers,
    SOLVER_MEMORY_LIMIT_MB: solverMemoryLimitMb,
  };
};

/** The configured callback is also the trusted browser origin in OIDC mode. */
export function oidcCallbackUrlFromEnv(env: Readonly<Record<string, string | undefined>>): URL {
  const callback = configuredUrl(env['AUTH_REDIRECT_URI'], 'AUTH_REDIRECT_URI');
  // Proof: removing this check accepts /other in config.test.ts instead of throwing.
  if (
    callback.pathname !== '/api/auth/okta/callback' ||
    callback.search !== '' ||
    callback.hash !== ''
  ) {
    throw new Error('AUTH_REDIRECT_URI must use the mounted /api/auth/okta/callback route');
  }
  return callback;
}

/** Local authentication still requires an operator-configured browser origin. */
function localAppOriginFromEnv(env: Readonly<Record<string, string | undefined>>): string {
  const origin = configuredUrl(env['APP_ORIGIN'], 'APP_ORIGIN');
  // Proof: removing this check accepts path, query and fragment origins in config.test.ts.
  if (origin.pathname !== '/' || origin.search !== '' || origin.hash !== '') {
    throw new Error('APP_ORIGIN must contain only an HTTP origin');
  }
  return origin.origin;
}

/** Validates trusted configuration without consulting any arriving request headers. */
function configuredUrl(value: string | undefined, key: string): URL {
  // Proof (diagnostic): removing this guard changes the missing-origin test's
  // required-setting error to an absolute-URL error in config.test.ts.
  if (value === undefined || value === '') throw new Error(`${key} is required`);
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new Error(`${key} must be an absolute HTTP URL`, { cause });
  }
  // Proof: removing this check accepts a credential-bearing origin; removing only the
  // protocol condition admits file:/// in config.test.ts.
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== ''
  ) {
    throw new Error(`${key} must be an HTTP URL without credentials`);
  }
  return url;
}
