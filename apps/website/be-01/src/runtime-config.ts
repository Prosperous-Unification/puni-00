import type { WebsiteApiConfig } from './server';

type Environment = Record<string, string | undefined>;

function readFlag(environment: Environment, name: string): boolean {
  const value = environment[name];
  if (value === undefined || value === '0') return false;
  if (value === '1') return true;
  throw new Error(`${name} must be 0 or 1`);
}

function readRate(environment: Environment, name: string): number | undefined {
  const value = environment[name];
  if (value === undefined || value === '') return undefined;
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`${name} must be a positive number`);
  return rate;
}

function readHops(environment: Environment): number | undefined {
  const value = environment['TRUSTED_PROXY_HOPS'];
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new Error('TRUSTED_PROXY_HOPS must be a nonnegative integer');
  return Number(value);
}

/**
 * Reads the API configuration from the process environment. Malformed flags, rates and proxy
 * hops throw instead of disabling a feature; absent provider settings leave the provider
 * disabled, which `GET /conversation` reports.
 */
export function readWebsiteApiConfig(environment: Environment): WebsiteApiConfig {
  const publicOrigin = environment['PUBLIC_ORIGIN'] ?? 'http://localhost:4321';
  const appOrigin = environment['APP_ORIGIN'] ?? 'http://localhost:4201';
  return {
    apiBindHost: environment['WEBSITE_API_HOST'] ?? '127.0.0.1',
    databasePath: environment['WEBSITE_DATABASE_PATH'] ?? '.local/website.sqlite',
    publicOrigin,
    appOrigin,
    appManualUrl: `${appOrigin}/manual`,
    appBuildUrl: appOrigin,
    operatorPassword: environment['OPERATOR_PASSWORD'],
    secureCookies: new URL(appOrigin).protocol === 'https:',
    trustedProxyHops: readHops(environment),
    demoAuth: readFlag(environment, 'DEMO_AUTH'),
    openRouterKey: environment['OPENROUTER_API_KEY'],
    openRouterModel: environment['OPENROUTER_MODEL'],
    openRouterEnabled: readFlag(environment, 'OPENROUTER_ENABLED'),
    openRouterProvider: environment['OPENROUTER_PROVIDER'],
    openRouterInputUsdPerMillion: readRate(environment, 'OPENROUTER_INPUT_USD_PER_MILLION'),
    openRouterOutputUsdPerMillion: readRate(environment, 'OPENROUTER_OUTPUT_USD_PER_MILLION'),
    openRouterPrivacyVerified: readFlag(environment, 'OPENROUTER_PRIVACY_VERIFIED'),
    oidcIssuer: environment['OIDC_ISSUER'],
    oidcClientId: environment['OIDC_CLIENT_ID'],
    oidcClientSecret: environment['OIDC_CLIENT_SECRET'],
    oidcRedirectUri: environment['OIDC_REDIRECT_URI'],
  };
}
