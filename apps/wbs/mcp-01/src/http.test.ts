import { describe, expect, it } from 'bun:test';

import type { McpConfig } from './config';
import { healthResponse, mcpFetchHandler, mcpHttpResponse, oauthMetadataResponse } from './http';
import { readDocument, toolsFromDocument } from './openapi-tools';
import { createServer } from './server';

describe('healthResponse', () => {
  // Proof: deleting any probe branch made its expected response undefined.
  it('exposes liveness, readiness, and ALB readiness separately', async () => {
    for (const path of ['/health/liveness', '/health/readiness', '/health/alb-readiness']) {
      const response = healthResponse(new URL(`https://mcp.example${path}`));
      expect(response?.status).toBe(200);
      expect(await response?.json()).toEqual({ status: 'ok' });
    }
    expect(healthResponse(new URL('https://mcp.example/mcp'))).toBeUndefined();
  });
});

const CONFIG: McpConfig = {
  MCP_AUTH_MODE: 'standalone',
  WBS_API_URL: 'https://dev.wbs.bulletpoints.club',
  MCP_PUBLIC_URL: 'https://dev.wbs.bulletpoints.club/mcp',
};

describe('oauthMetadataResponse', () => {
  // Proof: removing either metadata route makes the corresponding response
  // undefined, so an MCP client cannot discover the authorization flow.
  it('publishes RFC 9728 protected-resource metadata at the MCP discovery path', async () => {
    const response = oauthMetadataResponse(
      new URL('https://dev.wbs.bulletpoints.club/.well-known/oauth-protected-resource'),
      CONFIG,
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      resource: 'https://dev.wbs.bulletpoints.club/mcp',
      authorization_servers: ['https://dev.wbs.bulletpoints.club/mcp/oauth'],
      bearer_methods_supported: ['header'],
      scopes_supported: ['wbs:read', 'wbs:write', 'wbs:editor'],
    });
  });

  it('publishes RFC 8414 metadata for a PKCE authorization-code server', async () => {
    const response = oauthMetadataResponse(
      new URL('https://dev.wbs.bulletpoints.club/.well-known/oauth-authorization-server/mcp/oauth'),
      CONFIG,
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      issuer: 'https://dev.wbs.bulletpoints.club/mcp/oauth',
      authorization_endpoint: 'https://dev.wbs.bulletpoints.club/mcp/oauth/authorize',
      token_endpoint: 'https://dev.wbs.bulletpoints.club/mcp/oauth/token',
      revocation_endpoint: 'https://dev.wbs.bulletpoints.club/mcp/oauth/revoke',
      registration_endpoint: 'https://dev.wbs.bulletpoints.club/mcp/oauth/register',
      jwks_uri: 'https://dev.wbs.bulletpoints.club/mcp/oauth/jwks',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['wbs:read', 'wbs:write', 'wbs:editor'],
    });
  });

  it('does not answer metadata on a lookalike path', () => {
    expect(
      oauthMetadataResponse(
        new URL('https://dev.wbs.bulletpoints.club/.well-known/oauth-protected-resource.evil'),
        CONFIG,
      ),
    ).toBeUndefined();
  });
});

describe('mcpHttpResponse', () => {
  // Proof: returning the old bare 401 from the production handler removes this
  // header and prevents an MCP client from locating resource metadata.
  it('challenges an unauthenticated MCP caller with the RFC 9728 metadata URL', async () => {
    const response = await mcpHttpResponse(
      new Request('https://dev.wbs.bulletpoints.club/mcp'),
      CONFIG,
      { verify: () => Promise.reject(new Error('must not verify a missing credential')) },
      { handleRequest: () => Promise.reject(new Error('must not reach the transport')) },
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe(
      'Bearer resource_metadata="https://dev.wbs.bulletpoints.club/.well-known/oauth-protected-resource"',
    );
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  // Proof: omitting the presented-token branch returns an unlabeled challenge,
  // so clients cannot distinguish an ended session from first authorization.
  it('labels a presented invalid MCP token in the challenge', async () => {
    const response = await mcpHttpResponse(
      new Request('https://dev.wbs.bulletpoints.club/mcp', {
        headers: { authorization: 'Bearer ended-session-token' },
      }),
      CONFIG,
      { verify: () => Promise.reject(new Error('ended session')) },
      { handleRequest: () => Promise.reject(new Error('must not reach the transport')) },
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('error="invalid_token"');
    expect(await response.json()).toEqual({ error: 'invalid_token' });
  });

  // Proof: omitting OAuth endpoint dispatch leaves DCR at the old 404 boundary.
  it('dispatches fronting authorization-server requests before MCP auth', async () => {
    const response = await mcpHttpResponse(
      new Request('https://dev.wbs.bulletpoints.club/mcp/oauth/register', { method: 'POST' }),
      CONFIG,
      { verify: () => Promise.reject(new Error('must not verify a DCR request')) },
      { handleRequest: () => Promise.reject(new Error('must not reach the transport')) },
      process.env,
      {
        response: () =>
          Promise.resolve(Response.json({ client_id: 'dynamic-client' }, { status: 201 })),
      },
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ client_id: 'dynamic-client' });
  });
});

describe('mcpFetchHandler', () => {
  const claims = {
    iss: 'https://idp.example',
    sub: 'caller',
    wbs_groups: ['dev:wbs:read', 'dev:wbs:write', 'dev:wbs:editor'],
  };
  const rpc = (body: Record<string, unknown>) =>
    new Request('https://dev.wbs.bulletpoints.club/mcp', {
      method: 'POST',
      headers: {
        authorization: 'Bearer any',
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', ...body }),
    });

  // Proof: with one transport connected once and shared by every request, the
  // second call here threw the SDK's "Stateless transport cannot be reused
  // across requests" — which is what mcp-01 did in production for every
  // request after `initialize`, while 99 tests passed.
  it('answers a second request after initialize on a stateless endpoint', async () => {
    const tools = toolsFromDocument(readDocument());
    const handle = mcpFetchHandler(
      () => createServer({ tools, config: CONFIG }),
      CONFIG,
      { verify: () => Promise.resolve(claims) },
      {},
    );

    const initialize = await handle(
      rpc({
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '0' },
        },
      }),
    );
    expect(initialize.status).toBe(200);

    const list = await handle(rpc({ id: 2, method: 'tools/list', params: {} }));
    expect(list.status).toBe(200);
    const listed = (await list.json()) as { result: { tools: unknown[] } };
    expect(listed.result.tools).toHaveLength(tools.length);
  });

  // Proof: skipping endSession leaves the verifier live and makes the second
  // request return another MCP 200 instead of an invalid_token challenge.
  it('ends a local session after be-01 rejects its upstream token', async () => {
    let sessionIsLive = true;
    const verifier = {
      verify: () =>
        sessionIsLive ? Promise.resolve(claims) : Promise.reject(new Error('session ended')),
      upstreamTokenFor: () => Promise.resolve('upstream-token'),
      callerSessionFor: () =>
        sessionIsLive
          ? Promise.resolve({ upstreamToken: 'upstream-token', mcpSessionId: 'session-1' })
          : Promise.reject(new Error('session ended')),
    };
    const handle = mcpFetchHandler(
      () =>
        createServer({
          tools: [
            {
              name: 'readProject',
              description: 'Read a project',
              inputSchema: { type: 'object', properties: {}, additionalProperties: false },
              method: 'get',
              path: '/api/projects/{id}',
              locations: { id: 'path' },
            },
          ],
          config: CONFIG,
          fetchImpl: () =>
            Promise.resolve(Response.json({ error: 'unauthorized' }, { status: 401 })),
          endSession: (sessionId) => {
            if (sessionId !== 'session-1') throw new Error('wrong session ended');
            sessionIsLive = false;
          },
        }),
      CONFIG,
      verifier,
      {},
    );

    const rejected = await handle(
      rpc({
        id: 1,
        method: 'tools/call',
        params: { name: 'readProject', arguments: { id: 'p1' } },
      }),
    );
    expect(rejected.status).toBe(200);
    expect(JSON.stringify(await rejected.json())).toMatch(/session ended/i);

    const next = await handle(rpc({ id: 2, method: 'tools/list', params: {} }));
    expect(next.status).toBe(401);
    expect(next.headers.get('www-authenticate')).toContain('error="invalid_token"');
  });
});
