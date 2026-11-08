import { rejects } from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { withEdgeAdmission } from '@tools/deploy-contract';
import { expect, test } from 'bun:test';

import { runDevSyncLock, sync } from './sync';

test('direct devsync executor refuses retained edge ownership before environment or checkout work', async () => {
  const state = await mkdtemp(join(tmpdir(), 'direct-devsync-owner-'));
  const previous = process.env['WBS_EDGE_STATE'];
  try {
    await writeFile(join(state, 'edge.lock'), '');
    await writeFile(join(state, 'edge-owner.json'), 'closed');
    process.env['WBS_EDGE_STATE'] = state;
    await rejects(sync('a'.repeat(40)), /shared edge owner admission closed/);
  } finally {
    if (previous === undefined) delete process.env['WBS_EDGE_STATE'];
    else process.env['WBS_EDGE_STATE'] = previous;
    await rm(state, { recursive: true });
  }
});

for (const inherited of [false, true]) {
  test(`unlocked devsync launcher preserves edge lock into the real locked child (${inherited ? 'inherited FD8' : 'standalone'})`, async () => {
    const state = await mkdtemp(join(tmpdir(), 'devsync-child-edge-'));
    try {
      await writeFile(join(state, 'edge.lock'), '');
      const launcher = new URL('./sync.ts', import.meta.url).pathname;
      const argumentsList = [
        process.execPath,
        launcher,
        'a'.repeat(40),
        '--source',
        join(state, 'source'),
        '--container',
        'fixture-dev',
        '--state',
        state,
        '--rehearsal',
      ];
      const child = Bun.spawn(
        inherited
          ? [
              'bash',
              '-c',
              'exec 8<"$WBS_EDGE_STATE/edge.lock"; flock -n 8; export WBS_EDGE_LOCK_FD=8; exec "$@"',
              'launch',
              ...argumentsList,
            ]
          : argumentsList,
        {
          env: { ...process.env, WBS_EDGE_STATE: state },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const stderr = await new Response(child.stderr).text();
      expect(await child.exited).toBe(1);
      expect(stderr).toContain('seed the gitignored mcp-01 environment before deploying');
      expect(stderr).not.toMatch(/EBADF|does not name|shared edge lock held/);
      // Proof: process.exit inside CLI admission left the holder record populated,
      // failing the standalone case here (watched 2026-10-27).
      if (!inherited) expect(await Bun.file(join(state, 'edge.lock')).text()).toBe('');
    } finally {
      await rm(state, { recursive: true });
    }
  });
}

test('production devsync lock child completes with a verifiable inherited edge lock', async () => {
  const state = await mkdtemp(join(tmpdir(), 'devsync-complete-child-'));
  await writeFile(join(state, 'edge.lock'), '');
  const previous = process.env['WBS_EDGE_STATE'];
  try {
    const childScript = join(state, 'child.ts');
    const reached = join(state, 'reached');
    const admission = new URL(
      '../../tool-remote-scripts/src/lib/edge-admission.ts',
      import.meta.url,
    ).pathname;
    await writeFile(
      childScript,
      `import { withEdgeAdmission } from ${JSON.stringify(admission)};\nawait withEdgeAdmission(async () => {\n const competing = Bun.spawn(['flock', '-n', ${JSON.stringify(join(state, 'edge.lock'))}, 'true']);\n if (await competing.exited === 0) throw new Error('edge lock was not retained');\n await Bun.write(${JSON.stringify(reached)}, 'completed');\n});\n`,
    );
    process.env['WBS_EDGE_STATE'] = state;
    expect(
      await withEdgeAdmission(() =>
        runDevSyncLock('a'.repeat(40), {
          lockPath: join(state, 'devsync.lock'),
          scriptPath: childScript,
        }),
      ),
    ).toBe(0);
    expect(await Bun.file(reached).text()).toBe('completed');
  } finally {
    if (previous === undefined) delete process.env['WBS_EDGE_STATE'];
    else process.env['WBS_EDGE_STATE'] = previous;
    await rm(state, { recursive: true });
  }
});

test('direct devsync refuses active policy before reading its owned downstream environment', async () => {
  const state = await mkdtemp(join(tmpdir(), 'direct-devsync-active-'));
  const previous = process.env['WBS_EDGE_STATE'];
  await writeFile(join(state, 'edge.lock'), 'edge sentinel');
  await writeFile(
    join(state, 'edge-policy.json'),
    JSON.stringify({
      format: 'dependency-edge-policy',
      version: 1,
      phase: 'active',
      edgeState: state,
      ownerPublicationSha256: 'a'.repeat(64),
      handoff: { name: 'edge-owner-123456-handoff-complete.json', sha256: 'b'.repeat(64) },
    }),
  );
  await writeFile(join(state, 'mcp.env'), 'INVALID_DOWNSTREAM_ENVIRONMENT_SENTINEL', {
    mode: 0o600,
  });
  process.env['WBS_EDGE_STATE'] = state;
  try {
    await rejects(
      sync('a'.repeat(40), { mcpEnvPath: join(state, 'mcp.env') }),
      /ordinary controller/,
    );
    expect(await Bun.file(join(state, 'edge.lock')).text()).toBe('edge sentinel');
  } finally {
    if (previous === undefined) delete process.env['WBS_EDGE_STATE'];
    else process.env['WBS_EDGE_STATE'] = previous;
    await rm(state, { recursive: true });
  }
});
