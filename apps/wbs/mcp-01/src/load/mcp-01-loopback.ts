import { createLogger } from '@wbs/observability';

import { loadConfig } from '../config';
import { mcpFetchHandler } from '../http';
import { startMcpApplication } from '../main';
import { mcpOAuthFromEnv } from '../oauth';
import { readDocument, toolsFromDocument } from '../openapi-tools';

/**
 * mcp-01 as `main.ts` composes it (configuration, the OAuth server with M10's
 * `MachineTrafficLimits`, tools, the deployment fault reporter), started by the
 * M10 load run (`m10-load.ts`). It differs from production in one thing: the
 * server binds `127.0.0.1` rather than every interface, because the run uses
 * throwaway credentials on a shared host. Prints `{"port":N}` once serving.
 */
const started = startMcpApplication({
  loadConfig,
  readDocument,
  toolsFromDocument,
  mcpOAuthFromEnv,
  createLogger,
  startHttpServer: (createServer, config, verifier, env, oauth) =>
    Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: mcpFetchHandler(createServer, config, verifier, env, oauth),
    }),
});
console.log(JSON.stringify({ port: started.port }));
