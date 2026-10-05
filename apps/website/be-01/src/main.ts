import { readWebsiteApiConfig } from './runtime-config';
import { createWebsiteApi } from './server';

const portText = process.env['WEBSITE_API_PORT'] ?? '3101';
const port = Number(portText);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('WEBSITE_API_PORT must be a TCP port');
const config = readWebsiteApiConfig(process.env);
const api = createWebsiteApi(config);

Bun.serve({
  hostname: config.apiBindHost,
  port,
  maxRequestBodySize: 12_000,
  fetch: (request, server) => api.fetch(request, server.requestIP(request)?.address),
});
console.info(`Website API listening on port ${String(port)}`);
