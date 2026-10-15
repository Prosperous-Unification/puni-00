import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, test } from 'bun:test';

import project from '../project.json';

test('test target runs source tests while excluding generated dependency and package-only tests', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'burokrat-test-target-'));
  try {
    const cli = join(workspace, project.targets.test.options.cwd);
    const source = join(cli, 'src');
    const vendored = join(cli, 'dist/toolkit/trusted-node-modules/thread-stream/test');
    const preload = join(workspace, 'tools/test/scratch');
    await Promise.all([
      mkdir(join(source, 'packaging'), { recursive: true }),
      mkdir(join(vendored, 'src'), { recursive: true }),
      cp(resolve(import.meta.dir, '../../../../../tools/test/scratch'), preload, {
        recursive: true,
      }),
    ]);
    await writeFile(
      join(source, 'source.test.ts'),
      "import { test, expect } from 'bun:test'; test('SOURCE-SELECTED', () => expect(1).toBe(1));\n",
    );
    for (const path of [
      join(vendored, 'vendored.test.js'),
      join(vendored, 'src/nested.test.js'),
      join(source, 'packaging/install.test.ts'),
      join(source, 'packaging/consumer-bootstrap.test.ts'),
    ]) {
      await writeFile(path, "throw new Error('EXCLUDED-TEST-SELECTED');\n");
    }
    // Proof: removing ./src from the production target selected the injected vendored test;
    // this test failed on EXCLUDED-TEST-SELECTED (Bun 1.4.2). Bare src also selected
    // the injected dist/.../test/src/nested.test.js; ./src restricts discovery to the directory.
    const run = Bun.spawnSync(['bash', '-c', project.targets.test.options.command], {
      cwd: cli,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = new TextDecoder().decode(run.stdout) + new TextDecoder().decode(run.stderr);
    expect(output).toContain('SOURCE-SELECTED');
    expect(output).not.toContain('EXCLUDED-TEST-SELECTED');
    expect(run.exitCode).toBe(0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
