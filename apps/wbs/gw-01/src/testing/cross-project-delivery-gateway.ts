import { buildGateway } from '../composition';

/** Subprocess boundary keeps the backend acceptance suite out of gateway app imports. */
const beUrl = process.argv.at(2);
const jwtKey = process.argv.at(3);
const secret = process.argv.at(4);
if (beUrl === undefined || jwtKey === undefined || secret === undefined)
  throw new Error('gateway fixture requires backend URL, signing key and internal secret');
const gateway = buildGateway({
  PORT: 0,
  LOG_LEVEL: 'error',
  BE_URL: beUrl,
  INTERNAL_AUTH_SECRET: secret,
  JWT_SIGNING_KEY_CURRENT: jwtKey,
  AUTH_MODE: 'oidc',
  wsAuth: { appOrigin: 'http://localhost' },
});
gateway.listen(0);
const port = gateway.server?.port;
if (port === undefined) throw new Error('gateway fixture failed to listen');
process.stdout.write(`${JSON.stringify({ port })}\n`);
