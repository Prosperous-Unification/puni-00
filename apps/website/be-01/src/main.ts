import { createWebsiteApi } from './server';

const portText = process.env['WEBSITE_API_PORT'] ?? '3101';
const port = Number(portText);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('WEBSITE_API_PORT must be a TCP port');
const publicOrigin = process.env['PUBLIC_ORIGIN'] ?? 'http://localhost:4321';
const appOrigin = process.env['APP_ORIGIN'] ?? 'http://localhost:4201';
const apiBindHost = process.env['WEBSITE_API_HOST'] ?? '127.0.0.1';
const api = createWebsiteApi({
  apiBindHost,
  databasePath: process.env['WEBSITE_DATABASE_PATH'] ?? '.local/website.sqlite',
  publicOrigin,
  appOrigin,
  appManualUrl: `${appOrigin}/manual`,
  operatorPassword: process.env['OPERATOR_PASSWORD'],
  secureCookies: new URL(appOrigin).protocol === 'https:',
  demoAuth: process.env['DEMO_AUTH'] === '1',
  openRouterKey: process.env['OPENROUTER_API_KEY'],
  openRouterModel: process.env['OPENROUTER_MODEL'],
  openRouterEnabled: process.env['OPENROUTER_ENABLED'] === '1',
  openRouterProvider: process.env['OPENROUTER_PROVIDER'],
  openRouterInputUsdPerMillion: process.env['OPENROUTER_INPUT_USD_PER_MILLION']
    ? Number(process.env['OPENROUTER_INPUT_USD_PER_MILLION'])
    : undefined,
  openRouterOutputUsdPerMillion: process.env['OPENROUTER_OUTPUT_USD_PER_MILLION']
    ? Number(process.env['OPENROUTER_OUTPUT_USD_PER_MILLION'])
    : undefined,
  openRouterPrivacyVerified: process.env['OPENROUTER_PRIVACY_VERIFIED'] === '1',
  oidcIssuer: process.env['OIDC_ISSUER'],
  oidcClientId: process.env['OIDC_CLIENT_ID'],
  oidcClientSecret: process.env['OIDC_CLIENT_SECRET'],
  oidcRedirectUri: process.env['OIDC_REDIRECT_URI'],
});

Bun.serve({
  hostname: apiBindHost,
  port,
  maxRequestBodySize: 12_000,
  fetch: (request) => api.fetch(request),
});
console.info(`Website API listening on port ${String(port)}`);
