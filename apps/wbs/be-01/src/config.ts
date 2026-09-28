import { authModeOf } from '@wbs/auth';
import { defineConfig } from '@wbs/config';
import { type } from '@wbs/validation';

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
  'WBS_DELEGATION_SIGNING_KEY?': 'string',
  'WBS_DELEGATION_VERIFY_KEY?': 'string',
  'SOLVER_BUDGET_MS?': 'string.integer.parse',
  'SOLVER_SEARCH_WORKERS?': 'string.integer.parse',
  'SOLVER_MEMORY_LIMIT_MB?': 'string.integer.parse',
  // Proof: 2026-09-28, adding `system` to the DNS literal union made `keeps
  // domain DNS refusing and the proof worker stopped unless explicitly
  // enabled` report that loading did not throw.
  'WBS_DOMAIN_DNS?': "'refuse'|'doh'",
  'WBS_DOMAIN_PROOF_WORKER?': "'off'|'on'",
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

/**
 * Domain-claim DNS and the periodic proof worker, both off unless the
 * environment names them. `doh` selects the two-resolver DNS-over-HTTPS
 * adapter; the worker needs it, because checks through the refusing resolver
 * all fail and would suspend every owned domain after 14 days. Before 7.x
 * activation the routes refuse and the worker finds no verified claims either way.
 */
export interface DomainProofConfig {
  readonly domainDns: 'refuse' | 'doh';
  readonly domainProofWorker: 'off' | 'on';
}

export const loadConfig = (
  envSource: Record<string, string | undefined> = process.env,
): BeConfig & DomainProofConfig & { appOrigin: string; delegationKeys?: DelegationKeys } => {
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
  const domainDns = config.WBS_DOMAIN_DNS ?? 'refuse';
  const domainProofWorker = config.WBS_DOMAIN_PROOF_WORKER ?? 'off';
  // Proof: 2026-09-28, deleting this guard made `refuses a running proof worker
  // without the agreeing DNS-over-HTTPS resolver` report that loading did not throw.
  if (domainProofWorker === 'on' && domainDns !== 'doh')
    throw new Error('WBS_DOMAIN_PROOF_WORKER=on requires WBS_DOMAIN_DNS=doh');
  const appOrigin =
    mode === 'oidc' ? oidcCallbackUrlFromEnv(envSource).origin : localAppOriginFromEnv(envSource);
  return {
    ...config,
    domainDns,
    domainProofWorker,
    delegationKeys,
    appOrigin,
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
