import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

const PREFLIGHT = join(import.meta.dir, '../../../bin/dev-mcp-preflight.sh');
const VALID_ENV = [
  'PORT=3300',
  'MCP_AUTH_MODE=standalone',
  'WBS_API_URL=http://localhost:3100',
  'MCP_PUBLIC_URL=https://dev.wbs.bulletpoints.club/mcp',
  'MCP_SIGNING_KEY_CURRENT=base64-pkcs8',
  'MCP_STORE_KEY_CURRENT=base64-store-key',
  'MCP_STORE_PATH=/data/mcp-session.sqlite',
  'MCP_ACCESS_TOKEN_TTL=3600',
].join('\n');

async function runPreflight(
  envContents: string | undefined,
  exposureContents?: string,
): Promise<{ exitCode: number; output: string }> {
  const directory = await scratchAsync('wbs-mcp-preflight-');
  const envPath = join(directory, '.env');
  const exposurePath = join(directory, 'exposure');
  if (envContents !== undefined) {
    await writeFile(envPath, envContents, { mode: 0o600 });
  }
  if (exposureContents !== undefined) {
    await writeFile(exposurePath, exposureContents, { mode: 0o600 });
  }
  const child = Bun.spawn(['bash', PREFLIGHT, envPath, exposurePath], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, output: stdout + stderr };
}

describe('dev MCP preflight', () => {
  // Proof: omitting this pre-snapshot check lets the first deployment copy an
  // old sync.ts that knows nothing about mcp-01, then move the checkout.
  it('refuses a missing or incomplete MCP environment before deployment', async () => {
    const missing = await runPreflight(undefined);
    const incomplete = await runPreflight(
      'PORT=3300\nMCP_AUTH_MODE=standalone\nWBS_API_URL=http://localhost:3100\n',
    );

    expect(missing.exitCode).not.toBe(0);
    expect(missing.output).toContain('missing MCP environment');
    expect(incomplete.exitCode).not.toBe(0);
    expect(incomplete.output).toContain('exactly one non-empty MCP_PUBLIC_URL');
  });

  it('refuses an MCP environment whose permissions expose deployment settings', async () => {
    const directory = await scratchAsync('wbs-mcp-mode-');
    const envPath = join(directory, '.env');
    const exposurePath = join(directory, 'exposure');
    await writeFile(envPath, VALID_ENV);
    await chmod(envPath, 0o644);
    const child = Bun.spawn(['bash', PREFLIGHT, envPath, exposurePath], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('mode 600');
  });

  // Proof: before the exact-path guard, the host path exited 0 even though
  // wbs-dev-src cannot see it because dev state is mounted at /data.
  it('refuses host-only, relative, and duplicate MCP store paths', async () => {
    for (const replacement of [
      'MCP_STORE_PATH=/home/puni1/wbs-dev/state/mcp-session.sqlite',
      'MCP_STORE_PATH=./mcp-session.sqlite',
      'MCP_STORE_PATH=/data/mcp-session.sqlite\nMCP_STORE_PATH=/tmp/override.sqlite',
      'MCP_STORE_PATH=/data/mcp-session.sqlite\nexport MCP_STORE_PATH=/tmp/export.sqlite',
      'MCP_STORE_PATH=/data/mcp-session.sqlite\nMCP_STORE_PATH = /tmp/spaced.sqlite',
      'MCP_STORE_PATH=/data/mcp-session.sqlite\n  MCP_STORE_PATH=/tmp/indented.sqlite',
    ]) {
      const result = await runPreflight(
        VALID_ENV.replace('MCP_STORE_PATH=/data/mcp-session.sqlite', replacement),
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.output).toMatch(/exactly one|exactly once/);
    }
  });

  // Proof: treating a missing marker as the permanent default makes every
  // post-cutover deploy skip MCP while still reporting the environment healthy.
  it('prints persistent exposure state and refuses malformed state', async () => {
    const beforeCutover = await runPreflight(VALID_ENV);
    const afterCutover = await runPreflight(VALID_ENV, 'enabled\n');
    const malformed = await runPreflight(VALID_ENV, 'maybe\n');

    expect(beforeCutover).toEqual({ exitCode: 0, output: '0\n' });
    expect(afterCutover).toEqual({ exitCode: 0, output: '1\n' });
    expect(malformed.exitCode).not.toBe(0);
    expect(malformed.output).toContain('malformed MCP exposure state');
  });
});
