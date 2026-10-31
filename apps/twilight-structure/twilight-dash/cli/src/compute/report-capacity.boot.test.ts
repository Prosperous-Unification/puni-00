import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { startWbsMcpStack, type WbsMcpStack } from '../mcp/testing/wbs-mcp-stack';
import { createSshFixture, MEMINFO_15_7 } from './testing/ssh-fixture';

/**
 * `report-capacity` from Dash's entrypoint against WBS's real agent path
 * (`wbs-mcp-agent-surface` tasks 7.1 and 7.2): be-01's composed grant route and mcp-01's
 * production entrypoint, each in its own process ({@link startWbsMcpStack}). The reporter takes
 * a token with its key at mcp-01 and calls the capacity report tool; be-01 refuses the key itself
 * on `/api` (M9).
 */
setDefaultTimeout(90_000);

/** A cold entrypoint start under load; the in-test kill sits inside it, so the exit stays asserted. */
const ENTRYPOINT_BUDGET_MS = 60_000;
const ENTRYPOINT = join(import.meta.dir, '..', 'entrypoint.ts');

let stack: WbsMcpStack;
let scratch = '';
const ssh = createSshFixture({ 'h4claw.fixture': { meminfo: MEMINFO_15_7 } });

beforeAll(async () => {
  stack = await startWbsMcpStack();
  scratch = mkdtempSync(join(tmpdir(), 'dash-report-capacity-boot-'));
  await stack.fixture('activate');
});

afterAll(async () => {
  await stack.stop();
  ssh.close();
  rmSync(scratch, { recursive: true, force: true });
});

/** claire's fresh key, and a provider whose new resource she may report. */
async function reporter(): Promise<{
  key: { id: string; key: string };
  providerId: string;
  resourceId: string;
}> {
  const key = await stack.fixture<{ id: string; key: string }>('api-key', { personId: 'claire' });
  const { providerId, resourceId } = await stack.fixture<{
    providerId: string;
    resourceId: string;
  }>('compute-provider');
  return { key, providerId, resourceId };
}

/** Runs the reporter from the entrypoint with `bindings` until it exits. */
async function runEntrypoint(
  key: string,
  providerId: string,
  bindings: readonly unknown[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const configPath = join(scratch, `${crypto.randomUUID()}.json`);
  writeFileSync(
    configPath,
    JSON.stringify({
      schemaVersion: 2,
      mcpResource: stack.resource,
      credential: key,
      cadenceSeconds: 30,
      instances: [
        {
          instanceId: providerId,
          kind: 'ssh_host',
          host: 'h4claw.fixture',
          sshTransportFile: ssh.transportFile,
          bindings,
        },
      ],
    }),
  );
  chmodSync(configPath, 0o600);
  const child = Bun.spawn({
    cmd: [process.execPath, ENTRYPOINT, 'report-capacity', '--config', configPath],
    env: {
      PATH: `${ssh.binDirectory}:${process.env['PATH'] ?? ''}`,
      HOME: scratch,
      SSH_AUTH_SOCK: ssh.agentSocket,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  // A reporter that fails to exit is killed rather than left running past the test.
  const deadline = setTimeout(() => {
    child.kill();
  }, ENTRYPOINT_BUDGET_MS - 5_000);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearTimeout(deadline);
  return { exitCode, stdout, stderr };
}

/** The capacity reports be-01 stored, by provider and resource. */
async function storedReports(): Promise<{ providerId: string; resourceId: string }[]> {
  const response = await fetch(`${stack.backend}/__fixture/capacity-reports`);
  if (response.status !== 200) throw new Error(`capacity-reports: HTTP ${String(response.status)}`);
  return (await response.json()) as { providerId: string; resourceId: string }[];
}

function answersOf(stdout: string): unknown[] {
  return stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as unknown);
}

describe('report-capacity through mcp-01', () => {
  test(
    'stores a report through the tool, exits on a refused one, never prints the key',
    async () => {
      const { key, providerId, resourceId } = await reporter();
      // The second binding names no resource of the organization, which be-01 refuses: the
      // reporter exits on its first tick instead of waiting a cadence.
      const run = await runEntrypoint(key.key, providerId, [
        { resourceId, measure: 'memory_gib' },
        { resourceId: 'no-such-resource', measure: 'agent_slots', slots: 4 },
      ]);
      expect(run.stderr).toMatch(
        /^error: refused: instance [\w-]+ resource no-such-resource: HTTP 404 \w+\n$/,
      );
      expect(run.exitCode).toBe(1);
      expect(answersOf(run.stdout)).toMatchObject([
        { resourceId, measurement: 'measured', answer: 'stored' },
        { resourceId: 'no-such-resource', measurement: 'measured', answer: 'refused' },
      ]);
      expect(await storedReports()).toContainEqual({ providerId, resourceId });
      expect(`${run.stdout}${run.stderr}`).not.toContain(key.key.slice('wbs_mk_'.length));
    },
    ENTRYPOINT_BUDGET_MS,
  );

  test(
    'exits refused at once for a revoked key, as the token endpoint refuses it',
    async () => {
      const { key, providerId, resourceId } = await reporter();
      await stack.fixture('revoke', { id: key.id });
      const run = await runEntrypoint(key.key, providerId, [{ resourceId, measure: 'memory_gib' }]);
      expect(run.stderr).toMatch(
        /^error: refused: instance [\w-]+ resource [\w-]+: mcp-01 machine_credential_refused\n$/,
      );
      expect(run.exitCode).toBe(1);
      expect(`${run.stdout}${run.stderr}`).not.toContain(key.key.slice('wbs_mk_'.length));
    },
    ENTRYPOINT_BUDGET_MS,
  );

  // The reporter's former path: its key itself as a Bearer on be-01's `/api` route.
  test('the key itself on be-01’s /api is refused machine_bearer_not_accepted', async () => {
    const { key, providerId, resourceId } = await reporter();
    const response = await fetch(
      `${stack.backend}/api/compute-providers/${providerId}/resources/${resourceId}/capacity-report`,
      {
        method: 'PUT',
        headers: { authorization: `Bearer ${key.key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          observedAt: Date.now(),
          cadenceSeconds: 30,
          outcome: { kind: 'measured', capacityUnits: 15, usageUnits: 8 },
        }),
      },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'machine_bearer_not_accepted',
      endpoint: '/mcp',
    });
    expect(await storedReports()).not.toContainEqual({ providerId, resourceId });
  });
});
