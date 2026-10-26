import { createFailureRedaction, reportFailure } from '@shared/failures';
import type { TokenVerifier } from '@wbs/auth';
import type { Logger } from '@wbs/contracts';
import {
  createLogger,
  type CreateLoggerOptions,
  registerReportedFailure,
} from '@wbs/observability';

import { loadConfig, type McpConfig } from './config';
import { type McpOAuthHandler, startHttpServer } from './http';
import type { MachineGrantDefect } from './machine-grant-client';
import { mcpOAuthFromEnv, type OAuthRouteEvidence } from './oauth';
import { type OpenApiDocument, readDocument, toolsFromDocument } from './openapi-tools';
import { createServer } from './server';
import { createUnexpectedToolFailureReporter } from './unexpected-tool-failure';
import type { FetchLike } from './wbs-client';

interface ApplicationOAuth extends McpOAuthHandler, TokenVerifier {
  endSession(mcpSessionId: string): void | Promise<void>;
  refreshSession(mcpSessionId: string): Promise<string>;
  bearerFor(
    mcpSessionId: string | null,
    upstreamToken: string,
    scopes: readonly string[],
  ): Promise<string>;
  reportEndedConsents(): Promise<number>;
}

/** How often ended consent families are reported to be-01 (`McpOAuthServer.reportEndedConsents`). */
export const CONSENT_END_REPORT_INTERVAL_MS = 60_000;

interface HttpStartup {
  readonly port?: number;
}

export interface McpApplicationDeps {
  readonly loadConfig: (env?: Record<string, string | undefined>) => McpConfig;
  readonly readDocument: () => OpenApiDocument;
  readonly toolsFromDocument: typeof toolsFromDocument;
  readonly mcpOAuthFromEnv: (
    config: McpConfig,
    env: Readonly<Record<string, string | undefined>>,
    routeEvidence?: (evidence: OAuthRouteEvidence) => void,
    fetchImpl?: FetchLike,
    reportMachineGrantFault?: (fault: MachineGrantDefect) => void,
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
  /** Runs `sweep` every {@link CONSENT_END_REPORT_INTERVAL_MS}; a test drives it by hand. */
  readonly scheduleConsentEndReports?: (sweep: () => Promise<void>) => void;
}

function everyConsentEndInterval(sweep: () => Promise<void>): void {
  setInterval(() => void sweep(), CONSENT_END_REPORT_INTERVAL_MS).unref();
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
  const secrets = [
    config.WBS_BASIC_AUTH,
    config.INTERNAL_AUTH_SECRET,
    // Proof: leaving it out failed `redacts the machine grant secret with the other boundary
    // secrets` (main.test.ts); watched 2026-10-27.
    config.MCP_BE_INTERNAL_SECRET,
  ].filter((secret): secret is string => secret !== undefined && secret.length > 0);
  const logger = deps.createLogger({ service: 'mcp-01', secrets });
  // Proof: on 2026-09-21, passing `[]` here exposed the owned Basic credential in the production
  // diagnostic line while the public MCP envelope remained generic.
  const reportUnexpectedToolFailure = createUnexpectedToolFailureReporter(logger, secrets);
  // A fault be-01's machine grant answer revealed is reported here, redacted like every other
  // line, and the client is answered 502 (`wbs-mcp-agent-surface` M3).
  // Proof: 2026-10-27, building this policy with `[]` made `reports a machine grant fault
  // redacted` (main.test.ts) find the secret in the failure line.
  const redactMachineGrantFault = createFailureRedaction(secrets);
  const oauth = deps.mcpOAuthFromEnv(
    config,
    process.env,
    (evidence) => {
      logger.info({ event: 'mcp_oauth_route', ...evidence }, 'MCP OAuth route');
    },
    deps.fetchImpl,
    (fault) => {
      logger.error(
        {
          err: registerReportedFailure(reportFailure(fault, { redact: redactMachineGrantFault })),
        },
        'MCP machine grant fault',
      );
    },
  );
  // The mcp-01 → be-01 half of consent revocation (`wbs-machine-credentials` A20, _End_). An
  // unreachable be-01 is modeled inside the sweep (the ends stay durable for the next one); any
  // other failure is reported loudly here, once per sweep, and the store keeps every unreported
  // end, so the next sweep tries again rather than losing it. One sweep at a time.
  // Proof: 2026-10-22, building this policy with `[]` made `schedules the consent end report and
  // reports its failure` (main.test.ts) find `boundary-secret` in the failure line.
  const redactSweepFailure = createFailureRedaction(secrets);
  let sweeping = false;
  const sweepConsentEnds = async (): Promise<void> => {
    if (sweeping) return;
    sweeping = true;
    try {
      await oauth.reportEndedConsents();
    } catch (cause) {
      logger.error(
        { err: registerReportedFailure(reportFailure(cause, { redact: redactSweepFailure })) },
        'MCP consent end report failed',
      );
    } finally {
      sweeping = false;
    }
  };
  // Proof: 2026-10-22, not scheduling this sweep made `schedules the consent end report and
  // reports its failure` (main.test.ts) find no sweep to run.
  (deps.scheduleConsentEndReports ?? everyConsentEndInterval)(sweepConsentEnds);
  // Ends left by the previous process (an epoch advance, expiries while stopped) reach be-01 at
  // start, not a minute later. Its failures are handled inside, as the interval's are.
  // Proof: 2026-10-22, without this call `sweeps once at startup` (main.test.ts) saw no report.
  void sweepConsentEnds();
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
        // Proof: on 2026-09-21, substituting a fixed disclosure callback here made the captured
        // production server emit no sanitized operator line.
        reportUnexpectedToolFailure,
        endSession: (sessionId) => oauth.endSession(sessionId),
        refreshSession: (sessionId) => oauth.refreshSession(sessionId),
        bearerFor: (sessionId, upstreamToken, scopes) =>
          oauth.bearerFor(sessionId, upstreamToken, scopes),
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
      organization_delegation: config.INTERNAL_AUTH_SECRET === undefined ? 'off' : 'on',
      port: http.port,
      path: '/mcp',
    },
    'mcp-01 started',
  );
  return { port: http.port, toolCount: tools.length };
}

if (import.meta.main) startMcpApplication();
