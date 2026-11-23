import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { afterAll, expect, it } from 'bun:test';

import { disposeRelocationFixtures } from './policy/relocation-fixtures';
import { createToolkitFixture } from './testing/preparation-fixtures';

const roots: string[] = [];
afterAll(() => {
  disposeRelocationFixtures();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

for (const boundary of ['wrong-pin', 'absent-pin', 'missing-mode', 'supported'] as const) {
  it(
    boundary === 'supported'
      ? 'completes actual valid preparation with disjoint executable authority and proper admission'
      : 'refuses actual valid preparation at the ' +
          boundary +
          ' admission boundary before output ownership',
    async () => {
      const fixture = await createToolkitFixture(roots);
      const built = await Bun.build({
        entrypoints: [join(import.meta.dir, 'policy/prepare-activation-entry.ts')],
        target: 'bun',
        format: 'esm',
        ...(boundary === 'absent-pin'
          ? {}
          : {
              define: {
                __PUNI_PREPARATION_BUN_VERSION__: JSON.stringify(
                  boundary === 'wrong-pin' ? '0.0.0' : Bun.version,
                ),
              },
            }),
      });
      if (!built.success || built.outputs.length !== 1)
        throw new Error('cannot build admission-negative preparation role');
      const artifact = built.outputs.at(0);
      if (artifact === undefined) throw new Error('preparation admission fixture output missing');
      const executableDirectory = join(fixture.root, 'entries');
      mkdirSync(executableDirectory);
      const entry = join(executableDirectory, 'preparation.mjs');
      writeFileSync(entry, await artifact.text());
      const bytes = Buffer.from(
        JSON.stringify({
          version: 1,
          callerDirectory: fixture.context.callerDirectory,
          toolkitDirectory: fixture.context.toolkitDirectory,
          expectedToolkitIdentity: fixture.context.expectedToolkitIdentity,
          request: fixture.request,
        }),
      );
      const child = Bun.spawnSync(
        [
          ...createLaunch(process.execPath, entry),
          ...(boundary === 'missing-mode' ? [] : ['--puni-preparation-v1']),
        ],
        {
          cwd: fixture.context.runtime.directory,
          env: { PATH: '/usr/bin:/bin' },
          stdin: bytes,
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: 15000,
        },
      );
      if (boundary === 'supported') {
        expect(child.exitCode, child.stderr.toString()).toBe(0);
        expect(child.stdout.toString()).toContain(fixture.revision);
        expect(child.stderr.length).toBe(0);
        expect(
          existsSync(
            join(fixture.request.work, 'puni-activation-' + fixture.revision.slice(0, 8) + '.tar'),
          ),
        ).toBe(true);
        return;
      }
      expect(child.exitCode, child.stderr.toString()).toBe(boundary === 'missing-mode' ? 64 : 1);
      expect(child.stdout.length).toBe(0);
      expect(child.stderr.toString()).toContain(
        boundary === 'missing-mode'
          ? 'expected --puni-preparation-v1'
          : boundary === 'wrong-pin'
            ? 'preparation executable was built with another Bun'
            : 'preparation executable has no build runtime pin',
      );
      expect(existsSync(fixture.request.work)).toBe(false);
    },
  );
}
