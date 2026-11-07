import { describe, expect, test } from 'bun:test';

import { fakeCredential } from '../compute/testing/credential';
import { fakeMcpFetch } from './fake-mcp-fetch.test.fixture';
import { ApiKey, type FetchLike, mcpEndpointOf } from './machine-token';
import { McpWbsTools, toolAnswerOf, WbsUnreachable } from './wbs-tools';

const TOOL = 'putApiCompute-providersByProviderIdResourcesByResourceIdCapacity-report';
const text = (value: string, isError?: true) => ({
  content: [{ type: 'text', text: value }],
  ...(isError === undefined ? {} : { isError }),
});

describe('toolAnswerOf', () => {
  test('reads a success as be-01’s JSON body', () => {
    expect(toolAnswerOf(TOOL, text('{"providerId":"p","observedAt":1}'))).toEqual({
      kind: 'answered',
      body: { providerId: 'p', observedAt: 1 },
    });
  });

  test('reads mcp-01’s no-content line as an empty success', () => {
    expect(toolAnswerOf(TOOL, text(`${TOOL}: HTTP 204, no content.`))).toEqual({
      kind: 'answered',
      body: null,
    });
  });

  test('throws on a success that is not JSON', () => {
    expect(() => toolAnswerOf(TOOL, text('<html>proxy</html>'))).toThrow(
      `${TOOL} answered a success that is not JSON`,
    );
  });

  test('reads a refusal’s status, code and body', () => {
    expect(
      toolAnswerOf(
        TOOL,
        text(
          `${TOOL} was refused: HTTP 409 report_superseded from PUT /api/compute-providers/{providerId}/resources/{resourceId}/capacity-report.\n{"error":"report_superseded","storedObservedAt":5}`,
          true,
        ),
      ),
    ).toEqual({
      kind: 'refused',
      status: 409,
      error: 'report_superseded',
      body: { error: 'report_superseded', storedObservedAt: 5 },
    });
    expect(toolAnswerOf(TOOL, text(`${TOOL} was refused: HTTP 400 from PUT /x.`, true))).toEqual({
      kind: 'refused',
      status: 400,
      error: null,
      body: '',
    });
  });

  test('reads mcp-01’s own uncompleted call by its reason', () => {
    expect(
      toolAnswerOf(
        TOOL,
        text(`${TOOL} could not be called: machine_credential_refused. be-01 refused…`, true),
      ),
    ).toEqual({ kind: 'not_called', reason: 'machine_credential_refused' });
  });

  test('refuses a tool error it cannot attribute', () => {
    expect(() => toolAnswerOf(TOOL, text('something else went wrong', true))).toThrow(
      `an unattributable tool error from ${TOOL}`,
    );
    // Another tool's line is not this tool's answer.
    expect(() =>
      toolAnswerOf(TOOL, text('getApiProjects could not be called: server_error.', true)),
    ).toThrow(`an unattributable tool error from ${TOOL}`);
  });
});

describe('McpWbsTools', () => {
  const endpoint = mcpEndpointOf('http://127.0.0.1:3100/mcp');
  const key = ApiKey.of(fakeCredential(), 'the test key');

  function tools(send: FetchLike): McpWbsTools {
    return new McpWbsTools({
      endpoint,
      key,
      send,
      monotonic: { now: () => 0 },
      timeoutMs: 5_000,
      clientName: 'dash-test',
    });
  }

  test('calls a tool and never lets a request follow a redirect', async () => {
    const redirects: (RequestRedirect | undefined)[] = [];
    const answer = fakeMcpFetch((name, input) => ({ text: JSON.stringify({ name, input }) }));
    const client = tools((input, init) => {
      redirects.push(init?.redirect);
      return answer(input, init);
    });
    expect(await client.call('getApiProjects', { limit: '1' })).toEqual({
      kind: 'answered',
      body: { name: 'getApiProjects', input: { limit: '1' } },
    });
    await client.close();
    expect(redirects.length).toBeGreaterThan(0);
    expect(new Set(redirects)).toEqual(new Set(['manual']));
  });

  test('answers a call that got no answer WbsUnreachable, and reconnects for the next', async () => {
    let up = false;
    const answer = fakeMcpFetch(() => ({ text: '{"ok":true}' }));
    const client = tools((input, init) =>
      up ? answer(input, init) : Promise.reject(new TypeError('fetch failed')),
    );
    const cause = await client.call('getApiProjects', {}).catch((error: unknown) => error);
    expect(cause).toBeInstanceOf(WbsUnreachable);
    up = true;
    expect(await client.call('getApiProjects', {})).toEqual({
      kind: 'answered',
      body: { ok: true },
    });
    await client.close();
  });
});
