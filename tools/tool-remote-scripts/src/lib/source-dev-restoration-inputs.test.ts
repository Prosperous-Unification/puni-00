import { rejects } from 'node:assert/strict';
import { cp, mkdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { sourceDatabaseFixture } from '../fixtures/source-database-binding';
import { prepareSourceFrontendProfile } from '../fixtures/source-frontend-profile';
import { sourceRestorationConfiguration } from '../fixtures/source-restoration';
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
test.each(['supported', 'changed-index', 'changed-link-target', 'running-drift'])(
  'source original frontend capture retains original monitors: %s',
  async (variant) => {
    const document =
      '{"openapi":"3.1.0","info":{"title":"pinned native emitter fixture"},"paths":{}}\n';
    const fixture = await sourceDatabaseFixture(
      undefined,
      [],
      'data',
      false,
      undefined,
      async (root) => {
        await prepareSourceFrontendProfile(root);
        if (variant === 'changed-index') {
          const path = join(root, 'apps/wbs/fe-01/index.html');
          const bytes = await readFile(path);
          bytes[0] = bytes[0] === 88 ? 89 : 88;
          await writeFile(path, bytes);
        }
        if (variant === 'changed-link-target') {
          const dependency = join(root, 'node_modules/.frontend-profile');
          await cp(join(dependency, 'vite'), join(dependency, 'foreign-vite'), { recursive: true });
          const path = join(dependency, 'foreign-vite/dist/node/chunks/node.js');
          const bytes = await readFile(path);
          bytes[0] = bytes[0] === 88 ? 89 : 88;
          await writeFile(path, bytes);
          await unlink(join(root, 'node_modules/vite'));
          await symlink('.frontend-profile/foreign-vite', join(root, 'node_modules/vite'));
        }
        await mkdir(join(root, 'apps/wbs/be-01/src/openapi'), { recursive: true });
        await writeFile(
          join(root, 'apps/wbs/be-01/src/openapi/emit-openapi-cli.ts'),
          `process.stdout.write(${JSON.stringify(document)});\n`,
        );
      },
      sourceRestorationConfiguration,
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
          images.map((image: unknown) => ({
            ...readFields(image),
            RepoDigests: [runtimeReference],
          })),
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
                if (variant === 'changed-index' || variant === 'changed-link-target') {
                  await rejects(
                    captureSourceDevRestartInputs(owner, observation, runtimeReference),
                  );
                  return undefined;
                }
                return captureSourceDevRestartInputs(owner, observation, runtimeReference);
              },
            ),
        );
        if (observation === undefined) throw new Error('original observation absent');
        await rejects(inspectSourceDevInputs(owner, observation));
        if (variant === 'changed-index' || variant === 'changed-link-target') {
          expect(monitor).toBeUndefined();
          expect(emissions).toBe(0);
          return undefined;
        }
        if (monitor === undefined) throw new Error('original restart monitor absent');
        expect(monitor.configuration.ports).toEqual({
          backend: 3100,
          gateway: 3200,
          mcp: 3300,
          frontend: 4200,
        });
        expect(monitor.frontend).toBe('wbs-source-frontend-wire-v1');
        expect(Object.isFrozen(monitor)).toBe(true);
        await monitor.inspectCold();
        expect(emissions).toBe(1);
        if (variant === 'running-drift') {
          Object.assign(fixture.source.State, {
            Running: true,
            Status: 'running',
            Pid: 60001,
            StartedAt: '2026-10-29T08:00:00Z',
          });
          await writeFile(join(fixture.sourceRoot, 'apps/wbs/mcp-01/src/openapi.json'), document, {
            mode: 0o644,
          });
          await monitor.inspectRunning();
          expect(monitor.frontend).toBe('wbs-source-frontend-wire-v1');
          const path = join(fixture.sourceRoot, 'apps/wbs/fe-01/index.html');
          await writeFile(
            path,
            (await readFile(path, 'utf8')) + '<!-- changed after original capture -->',
          );
          await rejects(monitor.inspectRunning());
          return undefined;
        }
        return monitor;
      },
      fixture.root,
    );
    if (retained !== undefined) await rejects(retained.inspectCold());
  },
  30000,
);
