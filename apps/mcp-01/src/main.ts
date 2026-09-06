import { loadConfig } from './config';
import { startHttpServer } from './http';
import { mcpOAuthFromEnv } from './oauth';
import { readDocument, toolsFromDocument } from './openapi-tools';
import { createServer, resolveDocumentFile } from './server';

const config = loadConfig();
const tools = toolsFromDocument(readDocument(resolveDocumentFile()));
const oauth = mcpOAuthFromEnv(config, process.env);
const verifier =
  config.MCP_AUTH_MODE === 'standalone'
    ? oauth
    : { verify: () => Promise.reject(new Error('gateway mode must not verify locally')) };
const http = startHttpServer(
  () => createServer({ tools, config }),
  config,
  verifier,
  process.env,
  oauth,
);

console.error(
  `mcp-01: ${String(tools.length)} tools derived from the OpenAPI document, serving ${config.WBS_API_URL} on http://127.0.0.1:${String(http.port)}/mcp.`,
);
