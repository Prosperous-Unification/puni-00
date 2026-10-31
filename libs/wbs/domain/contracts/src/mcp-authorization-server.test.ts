import { describe, expect, it } from 'bun:test';

import {
  canonicalMcpAuthorizationServer,
  canonicalMcpResourceOf,
  isUnderMcpAuthorizationServer,
  mcpAuthorizationServerOf,
} from './mcp-authorization-server';

describe('the MCP authorization server, one derivation for mcp-01 and be-01', () => {
  it('drops a trailing slash, query and fragment from the resource', () => {
    expect(canonicalMcpResourceOf('https://wbs.example/mcp/')).toBe('https://wbs.example/mcp');
    expect(canonicalMcpResourceOf('https://WBS.example/mcp?x=1#y')).toBe('https://wbs.example/mcp');
    expect(mcpAuthorizationServerOf('https://wbs.example/mcp/')).toBe(
      'https://wbs.example/mcp/oauth',
    );
  });

  it('admits only a value the derivation reproduces exactly', () => {
    expect(canonicalMcpAuthorizationServer('https://wbs.example/mcp/oauth', 'S')).toBe(
      'https://wbs.example/mcp/oauth',
    );
    expect(canonicalMcpAuthorizationServer('http://127.0.0.1:3300/oauth', 'S')).toBe(
      'http://127.0.0.1:3300/oauth',
    );
    for (const value of [
      'https://wbs.example/mcp/oauth/',
      'https://wbs.example.evil/mcp/oauth?',
      'https://WBS.example/mcp/oauth',
      'https://wbs.example/mcp',
      'not a url',
    ])
      expect(() => canonicalMcpAuthorizationServer(value, 'S')).toThrow('S must be');
  });

  it('admits an audience equal to the server or under it after a slash', () => {
    const server = 'https://wbs.example/mcp/oauth';
    expect(isUnderMcpAuthorizationServer(server, server)).toBe(true);
    expect(isUnderMcpAuthorizationServer(`${server}/org/A`, server)).toBe(true);
  });

  it('refuses a look-alike audience', () => {
    const server = 'https://wbs.example/mcp/oauth';
    for (const audience of [
      'https://wbs.example/mcp/oauth.evil.example',
      'https://wbs.example/mcp/oauthx',
      'https://wbs.example/mcp',
      'wbs:org:A',
      'https://wbs.example/mcp/OAUTH/org/A',
    ])
      expect(isUnderMcpAuthorizationServer(audience, server)).toBe(false);
  });
});
