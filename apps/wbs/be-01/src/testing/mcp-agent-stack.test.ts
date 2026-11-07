import { describe, expect, it } from 'bun:test';

import { toolAnswerOf } from './mcp-agent-stack';

const TOOL = 'postApiProjectsByIdCommands';
const text = (value: string, isError?: true) => ({
  content: [{ type: 'text', text: value }],
  ...(isError === undefined ? {} : { isError }),
});

describe('reading a tool answer', () => {
  it("reads a success as be-01's body", () => {
    expect(toolAnswerOf(TOOL, text('{"results":[]}'))).toEqual({
      via: 'be-01',
      ok: true,
      body: { results: [] },
      text: '{"results":[]}',
    });
  });

  it("reads mcp-01's no-content line as an empty success", () => {
    expect(toolAnswerOf(TOOL, text(`${TOOL}: HTTP 204, no content.`))).toMatchObject({
      via: 'be-01',
      ok: true,
      body: null,
    });
  });

  it('refuses a success that is not JSON', () => {
    expect(() => toolAnswerOf(TOOL, text('<html>proxy</html>'))).toThrow();
  });

  it("reads a refusal as be-01's status and body", () => {
    const refusal = `${TOOL} was refused: HTTP 409 resources_exhausted from POST /api/projects/{id}/commands.\n{"error":"resources_exhausted","at":0}`;
    expect(toolAnswerOf(TOOL, text(refusal, true))).toEqual({
      via: 'be-01',
      ok: false,
      status: 409,
      body: { error: 'resources_exhausted', at: 0 },
      text: refusal,
    });
  });

  it("reads mcp-01's own tool error by its code", () => {
    expect(
      toolAnswerOf(
        TOOL,
        text(`${TOOL} could not be called: machine_credential_refused. be-01 refused…`, true),
      ),
    ).toMatchObject({ via: 'mcp-01', code: 'machine_credential_refused' });
  });

  it('refuses a tool error it cannot attribute', () => {
    expect(() => toolAnswerOf(TOOL, text('something else went wrong', true))).toThrow(
      'an unattributable tool error',
    );
    expect(() =>
      toolAnswerOf(TOOL, text('getApiProjects could not be called: server_error.', true)),
    ).toThrow('an unattributable tool error');
  });
});
