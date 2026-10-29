import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { fakeCredential } from '../compute/testing/credential';
import { scriptedTools } from '../mcp/testing/scripted-tools';
import { type ToolAnswer, WbsUnreachable } from '../mcp/wbs-tools';
import { loadResourceConfiguration, ResourceRuntime, ResourceWbsUnavailable } from './runtime';

/**
 * How the runtime reads WBS's answers to its tool calls (`wbs-mcp-agent-surface` tasks 7.1, 7.2):
 * what `watch` retries ({@link ResourceWbsUnavailable}) and what stops it. An empty ledger's
 * `synchronize` makes exactly one call, the cleanup request read.
 */
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function emptyRuntime(): ResourceRuntime {
  const base = mkdtempSync(join(tmpdir(), 'dash-resources-wbs-'));
  roots.push(base);
  const root = join(base, 'managed');
  mkdirSync(root, { mode: 0o700 });
  const config = join(base, 'config.json');
  writeFileSync(
    config,
    JSON.stringify({
      schemaVersion: 2,
      root,
      authorityId: 'runtime-one',
      epoch: 'epoch-one',
      providerId: 'provider-one',
      mcpResource: 'http://127.0.0.1:3100/mcp',
      credential: fakeCredential(),
      diskUnitBytes: 1024,
      diskBudgetUnits: 1,
      workspaceSlots: 1,
      headroomBytes: 0,
    }),
    { mode: 0o600 },
  );
  return ResourceRuntime.initialize(loadResourceConfiguration(config), { read: () => 1 });
}

async function synchronizeAgainst(answer: ToolAnswer | Error): Promise<unknown> {
  const runtime = emptyRuntime();
  const tools = scriptedTools(() => (answer instanceof Error ? Promise.reject(answer) : answer));
  try {
    await runtime.synchronize(tools);
    return 'synchronized';
  } catch (cause) {
    return cause;
  } finally {
    runtime.close();
    expect(tools.calls).toEqual([
      {
        name: 'getApiResourceAuthoritiesByAuthorityIdCleanupRequests',
        input: { authorityId: 'runtime-one', after: '0', limit: '100' },
      },
    ]);
  }
}

describe('the resource runtime’s WBS calls', () => {
  test('reads an empty cleanup page through the tool', async () => {
    expect(
      await synchronizeAgainst({ kind: 'answered', body: { requests: [], nextCursor: null } }),
    ).toBe('synchronized');
  });

  test.each<[string, ToolAnswer | Error]>([
    ['no answer', new WbsUnreachable('tool', { cause: new TypeError('fetch failed') })],
    ['a 429', { kind: 'refused', status: 429, error: 'rate_limited', body: {} }],
    ['an uncompleted call', { kind: 'not_called', reason: 'server_error' }],
  ])('leaves %s to watch’s retry', async (_case, answer) => {
    expect(await synchronizeAgainst(answer)).toBeInstanceOf(ResourceWbsUnavailable);
  });

  test.each<[string, ToolAnswer, string]>([
    [
      'a refused credential',
      { kind: 'not_called', reason: 'machine_credential_refused' },
      'resource request read refused: machine_credential_refused',
    ],
    [
      'a 403',
      { kind: 'refused', status: 403, error: 'forbidden', body: {} },
      'resource request read HTTP 403 forbidden',
    ],
  ])('stops on %s', async (_case, answer, message) => {
    const cause = await synchronizeAgainst(answer);
    expect(cause).toBeInstanceOf(Error);
    expect(cause).not.toBeInstanceOf(ResourceWbsUnavailable);
    expect((cause as Error).message).toBe(message);
  });
});
