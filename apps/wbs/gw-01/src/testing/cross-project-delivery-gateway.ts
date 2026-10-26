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
  wsAuth: { appOrigin: process.argv.at(5) ?? 'http://localhost' },
});
// Proof: omitting this host reached the protected native boundary as missing with zero delegation; restored caller/kernel127 passed (2026-10-26).
gateway.listen({ port: Number(process.argv.at(6) ?? 0), hostname: '127.0.0.1' });
const port = gateway.server?.port;
if (port === undefined) throw new Error('gateway fixture failed to listen');
process.stderr.write(
  `${JSON.stringify({ fixture: 'cross-project-delivery-gateway', pid: process.pid, port })}\n`,
);
process.stdout.write(`${JSON.stringify({ port })}\n`);
