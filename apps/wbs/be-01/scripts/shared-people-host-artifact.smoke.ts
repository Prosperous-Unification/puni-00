import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, it } from 'bun:test';

// Proof: omitting/externalizing the bundle fails outside the checkout before the usage refusal.
it('runs the host restore artifact outside its checkout and refuses missing arguments', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-host-artifact-'));
  try {
    const artifact = join(directory, 'shared-people-host-restore.js');
    copyFileSync(resolve('dist/apps/wbs/be-01-host/shared-people-host-restore.js'), artifact);
    const child = Bun.spawn([process.execPath, artifact], {
      cwd: directory,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stderr = await new Response(child.stderr).text();
    expect(await child.exited).not.toBe(0);
    expect(stderr).toContain('usage: shared-people-host-restore');
    expect(stderr).not.toContain('Cannot find');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Proof: removing ^build loses wbs-solver-supervisor-protocol:build; removing build-host-restore loses the artifact prerequisite. Both production target mutations failed this real Nx graph test.
it('keeps upstream protocol and packaged restore prerequisites in the backend build graph', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-host-build-graph-'));
  try {
    const path = join(directory, 'build-graph.json');
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      NX_DAEMON: 'false',
      NX_ISOLATE_PLUGINS: 'false',
    };
    // Nx sets FORCE_COLOR while the test runner sets NO_COLOR; use the runner's colour policy for the nested graph CLI.
    delete environment['FORCE_COLOR'];
    const child = Bun.spawn(
      ['bunx', '--no-install', 'nx', 'run', 'wbs-be-01:build', '--graph=' + path],
      {
        env: environment,
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const stderr = await new Response(child.stderr).text();
    expect(await child.exited).toBe(0);
    expect(stderr).toBe('');
    // The test-owned JSON file is emitted by Nx's task graph command with this fixed graph schema.
    const graph = (await Bun.file(path).json()) as {
      tasks: { dependencies: Record<string, string[]> };
    };
    expect(graph.tasks.dependencies['wbs-be-01:build']).toContain(
      'wbs-solver-supervisor-protocol:build',
    );
    expect(graph.tasks.dependencies['wbs-be-01:build']).toContain('wbs-be-01:build-host-restore');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
