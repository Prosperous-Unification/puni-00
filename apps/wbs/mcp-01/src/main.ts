import type { TokenVerifier } from '@wbs/auth';
import type { Logger } from '@wbs/contracts';
import { createLogger, type CreateLoggerOptions } from '@wbs/observability';

import { loadConfig, type McpConfig } from './config';
import { type McpOAuthHandler, startHttpServer } from './http';
import { mcpOAuthFromEnv, type OAuthRouteEvidence } from './oauth';
import { type OpenApiDocument, readDocument, toolsFromDocument } from './openapi-tools';
import { createServer } from './server';
import { createUnexpectedToolFailureReporter } from './unexpected-tool-failure';
import type { FetchLike } from './wbs-client';

interface ApplicationOAuth extends McpOAuthHandler, TokenVerifier {
  endSession(mcpSessionId: string): void;
}

interface HttpStartup {
  readonly port?: number;
}

export interface McpApplicationDeps {
  readonly loadConfig: (env?: Record<string, string | undefined>) => McpConfig;
  readonly readDocument: () => OpenApiDocument;
  readonly toolsFromDocument: typeof toolsFromDocument;
  readonly mcpOAuthFromEnv: (
    config: Pick<McpConfig, 'MCP_PUBLIC_URL'>,
    env: Readonly<Record<string, string | undefined>>,
    routeEvidence?: (evidence: OAuthRouteEvidence) => void,
  ) => ApplicationOAuth;
  readonly startHttpServer: (
    makeServer: () => ReturnType<typeof createServer>,
    config: McpConfig,
    verifier: TokenVerifier,
    env: Readonly<Record<string, string | undefined>>,
    oauth?: McpOAuthHandler,
  ) => HttpStartup;
  readonly createLogger: (options: CreateLoggerOptions) => Logger;
  readonly fetchImpl?: FetchLike;
}

const productionDeps: McpApplicationDeps = {
  loadConfig,
  readDocument,
  toolsFromDocument,
  mcpOAuthFromEnv,
  startHttpServer,
  createLogger,
};

/** Starts mcp-01 from one explicit application composition. */
export function startMcpApplication(deps: McpApplicationDeps = productionDeps): {
  readonly port: number | undefined;
  readonly toolCount: number;
} {
  const config = deps.loadConfig();
  const tools = deps.toolsFromDocument(deps.readDocument());
  const secrets = [config.WBS_BASIC_AUTH].filter(
    (secret): secret is string => secret !== undefined && secret.length > 0,
  );
  const logger = deps.createLogger({ service: 'mcp-01', secrets });
  const reportUnexpectedToolFailure = createUnexpectedToolFailureReporter(logger, secrets);
  const oauth = deps.mcpOAuthFromEnv(config, process.env, (evidence) => {
    logger.info({ event: 'mcp_oauth_route', ...evidence }, 'MCP OAuth route');
  });
  const verifier =
    config.MCP_AUTH_MODE === 'standalone'
      ? oauth
      : { verify: () => Promise.reject(new Error('gateway mode must not verify locally')) };
  const http = deps.startHttpServer(
    () =>
      createServer({
        tools,
        config,
        fetchImpl: deps.fetchImpl,
        reportUnexpectedToolFailure,
        endSession: (sessionId) => {
          oauth.endSession(sessionId);
        },
      }),
    config,
    verifier,
    process.env,
    oauth,
  );

  logger.info(
    {
      tool_count: tools.length,
      wbs_api_url: config.WBS_API_URL,
      port: http.port,
      path: '/mcp',
    },
    'mcp-01 started',
  );
  return { port: http.port, toolCount: tools.length };
}

if (import.meta.main) startMcpApplication();
