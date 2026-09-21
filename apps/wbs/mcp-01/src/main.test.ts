import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { FailureReporting } from '@shared/failures';
import type { LogFields, Logger, LogMethod } from '@wbs/contracts';
import { createLogger, type CreateLoggerOptions, LogRecord } from '@wbs/observability';
import { parseOrThrow } from '@wbs/validation';
import { expect, spyOn, test } from 'bun:test';

import type { McpConfig } from './config';
import { type McpApplicationDeps, startMcpApplication } from './main';
import type { DerivedTool } from './openapi-tools';

const CONFIG: McpConfig = {
  MCP_AUTH_MODE: 'standalone',
  WBS_API_URL: 'https://dev.wbs.bulletpoints.club',
  MCP_PUBLIC_URL: 'https://dev.wbs.bulletpoints.club/mcp',
  WBS_BASIC_AUTH: 'mcp-user:boundary-secret',
};

const READ: DerivedTool = {
  name: 'getApiProjectsByIdWorkItems',
  description: 'Read a project’s work items',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
    additionalProperties: false,
  },
  method: 'get',
  path: '/api/projects/{id}/work-items',
  locations: { id: 'path' },
};

function forward(logger: Logger, level: 'info' | 'warn'): LogMethod {
  function forwarded(message: string): void;
  function forwarded(fields: LogFields, message: string): void;
  function forwarded(fieldsOrMessage: LogFields | string, message?: string): void {
    if (typeof fieldsOrMessage === 'string') {
      logger[level](fieldsOrMessage);
      return;
    }
    if (message === undefined) throw new Error('structured log message is required');
    logger[level](fieldsOrMessage, message);
  }
  return forwarded;
}

function captureErrors(sink: Logger): {
  readonly logger: Logger;
  readonly calls: { fields: LogFields; message: string }[];
} {
  const calls: { fields: LogFields; message: string }[] = [];
  function recordError(message: string): void;
  function recordError(fields: LogFields, message: string): void;
  function recordError(fieldsOrMessage: LogFields | string, message?: string): void {
    if (typeof fieldsOrMessage === 'string') {
      sink.error(fieldsOrMessage);
      return;
    }
    if (message === undefined) throw new Error('structured log message is required');
    calls.push({ fields: fieldsOrMessage, message });
    sink.error(fieldsOrMessage, message);
  }
  return {
    calls,
    logger: {
      info: forward(sink, 'info'),
      warn: forward(sink, 'warn'),
      error: recordError,
      child: (fields) => sink.child(fields),
    },
  };
}

function oauthFixture() {
  return {
    verify: () => Promise.resolve({ iss: 'issuer', sub: 'caller' }),
    response: () => Promise.resolve(undefined),
    endSession: () => undefined,
  };
}

test('reports one unexpected production tool failure under its shared occurrence', async () => {
  const lines: string[] = [];
  const loggerOptions: CreateLoggerOptions[] = [];
  let errorCalls: { fields: LogFields; message: string }[] = [];
  let serverFactory: Parameters<McpApplicationDeps['startHttpServer']>[0] | undefined;
  let fetchCalls = 0;
  let authorization: string | undefined;
  const failure = new Error('production-sentinel mcp-user:boundary-secret');

  const started = startMcpApplication({
    loadConfig: () => CONFIG,
    readDocument: () => ({ paths: {} }),
    toolsFromDocument: () => [READ],
    mcpOAuthFromEnv: () => oauthFixture(),
    startHttpServer: (createServer) => {
      serverFactory = createServer;
      return { port: 3311 };
    },
    createLogger: (options) => {
      loggerOptions.push(options);
      const captured = captureErrors(
        createLogger({ ...options, destination: { write: (chunk) => void lines.push(chunk) } }),
      );
      errorCalls = captured.calls;
      return captured.logger;
    },
    fetchImpl: (_url, init) => {
      fetchCalls += 1;
      authorization = init.headers['authorization'];
      return Promise.reject(failure);
    },
  });

  expect(loggerOptions).toHaveLength(1);
  expect(loggerOptions[0]).toMatchObject({
    service: 'mcp-01',
    secrets: ['mcp-user:boundary-secret'],
  });
  expect(started).toEqual({ port: 3311, toolCount: 1 });
  if (serverFactory === undefined)
    throw new Error('HTTP startup did not retain its server factory');

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const authInfo: AuthInfo = {
    token: 'production-upstream-token',
    clientId: 'production-wiring-test',
    scopes: [],
  };
  const send = clientTransport.send.bind(clientTransport);
  clientTransport.send = (message, options) => send(message, { ...options, authInfo });
  const server = serverFactory();
  const client = new Client({ name: 'production-test', version: '0.0.0' }, { capabilities: {} });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  const toolResponse = await client.callTool({ name: READ.name, arguments: { id: 'p-1' } });

  // Proof: on 2026-09-21, removing the transport `authInfo` injection kept this at zero before
  // any Authorization header could reach the production-composed fetch seam.
  expect(fetchCalls).toBe(1);
  expect(authorization).toBe('Bearer production-upstream-token');
  const reportCalls = errorCalls.filter((call) => call.message === 'unexpected MCP tool failure');
  // Proof: on 2026-09-21, invoking the production-composed reporter twice made this count two.
  expect(reportCalls).toHaveLength(1);
  const reporting = reportCalls[0]?.fields['err'] as FailureReporting;
  expect(reporting.reported).toBe(true);
  if (!reporting.reported) return;
  expect(toolResponse).toEqual({
    content: [
      {
        type: 'text',
        text: `${READ.name} could not be called: Something went wrong. Reference ${reporting.reports.public.occurrence_id}.`,
      },
    ],
    isError: true,
  });
  expect(reporting.reports.diagnostic.occurrence_id).toBe(reporting.reports.public.occurrence_id);
  const failureLines = lines.filter((line) => line.includes('unexpected MCP tool failure'));
  expect(failureLines).toHaveLength(1);
  const failureLine = failureLines[0];
  // Proof: on 2026-09-21, substituting an unrelated Error at the SDK catch boundary removed the
  // retained non-secret marker from the registered diagnostic line.
  expect(failureLine).toContain('production-sentinel');
  expect(failureLine).not.toContain('boundary-secret');
  const parsed = parseOrThrow(LogRecord, JSON.parse(failureLine) as Record<string, unknown>);
  expect(parsed.err).toMatchObject({
    occurrence_id: reporting.reports.public.occurrence_id,
    fingerprint: reporting.reports.diagnostic.fingerprint,
  });
});

test('starts without a Basic secret and writes OAuth and startup facts through the logger', () => {
  const lines: string[] = [];
  const loggerOptions: CreateLoggerOptions[] = [];
  const consoleError = spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    startMcpApplication({
      loadConfig: () => ({ ...CONFIG, WBS_BASIC_AUTH: undefined }),
      readDocument: () => ({ paths: {} }),
      toolsFromDocument: () => [READ],
      mcpOAuthFromEnv: (_config, _env, routeEvidence) => {
        routeEvidence?.({ method: 'POST', path: '/mcp/oauth/token', status: 400 });
        return oauthFixture();
      },
      startHttpServer: () => ({ port: 3312 }),
      createLogger: (options) => {
        loggerOptions.push(options);
        return createLogger({
          ...options,
          destination: { write: (chunk) => void lines.push(chunk) },
        });
      },
    });

    expect(loggerOptions[0]?.secrets).toEqual([]);
    const records = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(
      records.some((record) => record['event'] === 'mcp_oauth_route' && record['status'] === 400),
    ).toBe(true);
    expect(
      records.some(
        (record) =>
          record['msg'] === 'mcp-01 started' &&
          record['tool_count'] === 1 &&
          record['port'] === 3312,
      ),
    ).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
  } finally {
    consoleError.mockRestore();
  }
});
