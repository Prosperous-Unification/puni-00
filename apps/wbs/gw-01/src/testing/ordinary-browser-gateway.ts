import { defineConfig } from '@wbs/config';

import { buildGateway } from '../composition';
import { GwConfig } from '../config';

/** Every authority-bearing setting comes from the explicit current-cohort descriptor. */
function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '')
    throw new Error(`${name} is required for the ordinary browser gateway`);
  return value;
}

/** Fixture credentials are exposed only to canonical HTTP loopback endpoints. */
function requireLoopbackOrigin(value: string, name: string): string {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.origin !== value ||
    url.port === ''
  ) {
    throw new Error(`${name} must be a canonical HTTP loopback origin with an explicit port`);
  }
  return value;
}

if (required('E2E_CURRENT_COHORT') !== 'current' || required('AUTH_MODE') !== 'oidc') {
  throw new Error('The ordinary gateway requires the current browser-cookie cohort');
}
const configuration = defineConfig(GwConfig, {
  AUTH_MODE: 'oidc',
  PORT: required('PORT'),
  LOG_LEVEL: required('LOG_LEVEL'),
  BE_URL: requireLoopbackOrigin(required('BE_URL'), 'BE_URL'),
  INTERNAL_AUTH_SECRET: required('INTERNAL_AUTH_SECRET'),
  JWT_SIGNING_KEY_CURRENT: required('JWT_SIGNING_KEY_CURRENT'),
});
if (configuration.PORT < 1 || configuration.PORT > 65535)
  throw new Error('The ordinary gateway requires a valid nonzero port');
const gateway = buildGateway({
  ...configuration,
  // Omit localIdentity and an external OIDC verifier: production's native JWT verifier checks the issued cookie.
  wsAuth: { appOrigin: requireLoopbackOrigin(required('APP_ORIGIN'), 'APP_ORIGIN') },
});
gateway.listen({ port: configuration.PORT, hostname: '127.0.0.1' });

let stopping: Promise<void> | undefined;
/** Repeated signals share one owned listener/socket disposal. */
function stop(): Promise<void> {
  if (stopping !== undefined) return stopping;
  const close = async () => {
    await gateway.stop(true);
  };
  stopping = close().then(
    () => {
      process.exit(0);
    },
    (cause: unknown) => {
      console.error('Ordinary gateway disposal failed', cause);
      process.exit(1);
    },
  );
  return stopping;
}
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    void stop();
  });
