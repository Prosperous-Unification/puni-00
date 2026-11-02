import { join } from 'node:path';

import { describe, expect, setDefaultTimeout, test } from 'bun:test';

/**
 * The agent-pool swarm rehearsal (`load/pool-swarm-rehearsal.ts`, `wbs-mcp-agent-surface`
 * task 8.1 before dev) as a booted test: be-01, mcp-01, Dash and the agent processes, each
 * its own process, end to end. A second run with the revocation skipped must fail, so the
 * rehearsal's lease checks stay breakable (R5).
 */
setDefaultTimeout(120_000);

const REHEARSAL = join(import.meta.dir, 'load/pool-swarm-rehearsal.ts');

interface Report {
  readonly fault: string | null;
  readonly expectations: number;
  readonly held: number;
  readonly failed: readonly { readonly name: string }[];
}

async function rehearse(args: readonly string[]): Promise<{ exitCode: number; report: Report }> {
  const child = Bun.spawn([process.execPath, REHEARSAL, ...args], {
    env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, , exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const json = stdout.slice(stdout.indexOf('\n{') + 1);
  return { exitCode, report: JSON.parse(json) as Report };
}

describe('agent-pool swarm rehearsal', () => {
  test('three pool agents claim, heartbeat and release through a re-key, and revoking ends their leases', async () => {
    const { exitCode, report } = await rehearse([]);
    expect(report.failed).toEqual([]);
    expect(report.held).toBe(report.expectations);
    expect(report.expectations).toBeGreaterThan(100);
    expect(exitCode).toBe(0);
  });

  test('a run that never revokes the pool fails on the leases it expected to end', async () => {
    const { exitCode, report } = await rehearse(['--fault=skip-revoke']);
    expect(exitCode).toBe(1);
    expect(report.failed.map((each) => each.name)).toContain(
      'after revoke no claim of the pool is left (leases ended, sweep released)',
    );
  });
});
