import { rejects } from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { sourceDatabaseFixture } from '../fixtures/source-database-binding';
import { roots } from '../fixtures/source-startup';
import { withDependencyOwner } from './edge-ownership';
import { readFields } from './managed-cohort';
import { withSolverDrainUnderOwner } from './solver-exclusion';
import { withSourceDevExcluded } from './source-dev-exclusion';
import {
  captureSourceDevRestartInputs,
  inspectSourceDevInputs,
  observeSourceDevInputs,
} from './source-dev-inputs';

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
test('source cold restart monitor outlives only its source token under the same retained outer owner', async () => {
  const document =
    '{"openapi":"3.1.0","info":{"title":"pinned native emitter fixture"},"paths":{}}\n';
  const fixture = await sourceDatabaseFixture(
    undefined,
    [],
    'data',
    false,
    undefined,
    async (root) => {
      await mkdir(join(root, 'apps/wbs/be-01/src/openapi'), { recursive: true });
      await writeFile(
        join(root, 'apps/wbs/be-01/src/openapi/emit-openapi-cli.ts'),
        `process.stdout.write(${JSON.stringify(document)});\n`,
      );
    },
  );
  const runtimeReference = `registry/toolchain@sha256:${'a'.repeat(64)}`;
  let emissions = 0;
  const docker: typeof fixture.docker = async (args, signal) => {
    if (args.includes('apps/wbs/be-01/src/openapi/emit-openapi-cli.ts')) {
      emissions++;
      const child = Bun.spawn(
        [
          process.execPath,
          '--no-env-file',
          'run',
          'apps/wbs/be-01/src/openapi/emit-openapi-cli.ts',
        ],
        {
          cwd: fixture.sourceRoot,
          env: { PATH: process.env['PATH'], BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(stderr).toBe('');
      expect(code).toBe(0);
      return stdout;
    }
    const response = await fixture.docker(args, signal);
    if (args[0] === 'image' && !args.includes('--format')) {
      const images: unknown = JSON.parse(response);
      if (!Array.isArray(images)) throw new Error('native image inspection malformed');
      return JSON.stringify(
        images.map((image: unknown) => ({ ...readFields(image), RepoDigests: [runtimeReference] })),
      );
    }
    return response;
  };
  const plan = {
    sha: fixture.pins.sourceSha,
    layouts: [fixture.layouts.prod, fixture.layouts.dev],
  };
  const retained = await withDependencyOwner(
    plan,
    async (owner) => {
      const deadline = performance.now() + 30000;
      let observation: Awaited<ReturnType<typeof observeSourceDevInputs>> | undefined;
      const monitor = await withSolverDrainUnderOwner(
        owner,
        fixture.layouts,
        fixture.solverPins,
        fixture.ports,
        deadline,
        () =>
          withSourceDevExcluded(
            owner,
            fixture.layouts,
            plan.sha,
            docker,
            deadline,
            async (source) => {
              observation = await observeSourceDevInputs(
                owner,
                fixture.layouts,
                source,
                fixture.pins,
                fixture.contents,
                docker,
                deadline,
              );
              await rejects(
                captureSourceDevRestartInputs(owner, { ...observation }, runtimeReference),
              );
              return captureSourceDevRestartInputs(owner, observation, runtimeReference);
            },
          ),
      );
      if (observation === undefined) throw new Error('original observation absent');
      await rejects(inspectSourceDevInputs(owner, observation));
      await monitor.inspectCold();
      expect(emissions).toBe(1);
      return monitor;
    },
    fixture.root,
  );
  await rejects(retained.inspectCold());
}, 30000);
