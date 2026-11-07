import type { FetchLike } from './machine-token';

/** One `tools/call` result as mcp-01 writes it: text content, and `isError` on a refusal. */
export interface FakeToolResult {
  readonly text: string;
  readonly isError?: true;
}

/**
 * A `fetch` that answers the MCP Streamable HTTP exchange of one client in process, with no token
 * endpoint (it never answers 401): `initialize`, `notifications/initialized`, the client's
 * optional SSE `GET` (405) and `tools/call`, which `answer` answers. For a subprocess that cannot
 * reach a real mcp-01, such as a CLI test's preload.
 */
export function fakeMcpFetch(
  answer: (
    name: string,
    input: Record<string, unknown>,
  ) => FakeToolResult | Promise<FakeToolResult>,
): FetchLike {
  return async (input, init) => {
    const request = new Request(input, init);
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const message = (await request.json()) as {
      id?: number | string;
      method: string;
      params?: { protocolVersion?: string; name?: string; arguments?: Record<string, unknown> };
    };
    if (message.id === undefined) return new Response(null, { status: 202 });
    const reply = (result: unknown): Response =>
      Response.json({ jsonrpc: '2.0', id: message.id, result });
    if (message.method === 'initialize')
      return reply({
        protocolVersion: message.params?.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: 'fake-mcp', version: '0.0.0' },
      });
    if (message.method === 'tools/call') {
      const result = await answer(message.params?.name ?? '', message.params?.arguments ?? {});
      return reply({ content: [{ type: 'text', text: result.text }], ...result });
    }
    throw new Error(`the fake MCP server has no answer to ${message.method}`);
  };
}
