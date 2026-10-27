import { describe, expect, it } from 'bun:test';

import { loadConfig } from './config';

const FULL = {
  MCP_AUTH_MODE: 'standalone',
  WBS_API_URL: 'https://dev.wbs.bulletpoints.club',
  MCP_PUBLIC_URL: 'https://dev.wbs.bulletpoints.club/mcp',
  MCP_TRUSTED_PROXY_HOPS: '1',
  MCP_TRUSTED_GATEWAY: undefined,
  WBS_BASIC_AUTH: 'dany:hunter2',
};

describe('loadConfig', () => {
  it('returns the public MCP resource URL when present', () => {
    const cfg = loadConfig(FULL);
    expect(cfg.MCP_PUBLIC_URL).toBe('https://dev.wbs.bulletpoints.club/mcp');
  });

  it('refuses a missing or invalid MCP_TRUSTED_PROXY_HOPS, naming it', () => {
    expect(() => loadConfig({ ...FULL, MCP_TRUSTED_PROXY_HOPS: undefined })).toThrow(
      /MCP_TRUSTED_PROXY_HOPS is required/,
    );
    for (const value of ['-1', '10', '1.5', 'one', ' 1'])
      expect(() => loadConfig({ ...FULL, MCP_TRUSTED_PROXY_HOPS: value })).toThrow(
        /MCP_TRUSTED_PROXY_HOPS is set but invalid/,
      );
    expect(loadConfig({ ...FULL, MCP_TRUSTED_PROXY_HOPS: '0' }).MCP_TRUSTED_PROXY_HOPS).toBe(0);
    expect(loadConfig(FULL).MCP_TRUSTED_PROXY_HOPS).toBe(1);
  });

  it('refuses a public URL whose derived issuer is not canonical', () => {
    expect(() =>
      loadConfig({ ...FULL, MCP_PUBLIC_URL: 'https://dev.wbs.bulletpoints.club/mcp//' }),
    ).toThrow('MCP_PUBLIC_URL');
    expect(
      loadConfig({ ...FULL, MCP_PUBLIC_URL: 'https://dev.wbs.bulletpoints.club/mcp/' })
        .MCP_PUBLIC_URL,
    ).toBe('https://dev.wbs.bulletpoints.club/mcp/');
  });

  it('leaves WBS_BASIC_AUTH undefined when unset', () => {
    expect(loadConfig({ ...FULL, WBS_BASIC_AUTH: undefined }).WBS_BASIC_AUTH).toBeUndefined();
  });

  // Watched red for design.md D3: delete the `WBS_API_URL: 'string.url'` line,
  // or give it a `http://localhost:3100` default, and this test must fail —
  // that is the fault it exists to catch. A boot that defaults its base URL
  // edits whichever deployment answers.
  it('refuses to boot without WBS_API_URL, and names it', () => {
    expect(() => loadConfig({ ...FULL, WBS_API_URL: undefined })).toThrow(
      /WBS_API_URL is required/,
    );
  });

  // Proof: setting gateway mode without this exact flag made this test throw.
  it('refuses gateway mode unless the trusted gateway is explicit', () => {
    expect(() => loadConfig({ ...FULL, MCP_AUTH_MODE: 'gateway' })).toThrow(
      /MCP_TRUSTED_GATEWAY.*true/,
    );
    expect(
      loadConfig({ ...FULL, MCP_AUTH_MODE: 'gateway', MCP_TRUSTED_GATEWAY: 'true' }),
    ).toMatchObject({ MCP_AUTH_MODE: 'gateway', MCP_TRUSTED_GATEWAY: 'true' });
  });

  // Proof: removing MCP_PUBLIC_URL from the configuration contract makes the
  // authorization-server metadata derive from an attacker-controlled Host.
  it('refuses to boot without the canonical public MCP resource URL', () => {
    expect(() => loadConfig({ ...FULL, MCP_PUBLIC_URL: undefined })).toThrow(
      /MCP_PUBLIC_URL is required/,
    );
  });

  it('rejects a WBS_API_URL that is not a URL', () => {
    expect(() => loadConfig({ ...FULL, WBS_API_URL: 'dev.wbs.bulletpoints.club' })).toThrow(
      /WBS_API_URL is set but invalid/,
    );
  });

  it('rejects a WBS_BASIC_AUTH with no colon', () => {
    expect(() => loadConfig({ ...FULL, WBS_BASIC_AUTH: 'danyhunter2' })).toThrow(
      /WBS_BASIC_AUTH is set but invalid/,
    );
  });

  it('refuses an unknown MCP authentication mode', () => {
    expect(() => loadConfig({ ...FULL, MCP_AUTH_MODE: 'anything' })).toThrow(/MCP_AUTH_MODE/);
  });

  // The boot failure is the most likely thing anyone ever pastes into a chat
  // window or a log. It must not carry the token or the password. Swap the
  // narrow read in `loadConfig` for `defineConfig(McpConfig)` and this goes
  // red: `parseOrThrow` stringifies its whole input into the message.
  it('never puts a secret in the message it throws', () => {
    let message = '';
    try {
      loadConfig({ ...FULL, WBS_API_URL: 'not-a-url' });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('WBS_API_URL');
    expect(message).not.toContain('hunter2');
  });
});
