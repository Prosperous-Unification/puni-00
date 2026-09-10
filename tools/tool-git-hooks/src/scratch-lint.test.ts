import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from 'bun:test';
import { ESLint } from 'eslint';

import project from '../project.json';

const root = resolve(import.meta.dir, '../../..');
const eslint = new ESLint({ cwd: root });

// Proof: removing tools/test/scratch from the configured lint command made this
// fail on the missing index.ts path even though the command itself exited 0.
test('the CI lint command includes both shared scratch helpers', () => {
  const invocation = Bun.spawnSync(
    ['sh', '-c', `${project.targets.lint.options.command} --format json`],
    { cwd: root, stdout: 'pipe', stderr: 'pipe' },
  );
  expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
  const reports = JSON.parse(invocation.stdout.toString()) as { filePath: string }[];
  const paths = reports.map(({ filePath }) => filePath);
  expect(paths).toContain(resolve(root, 'tools/test/scratch/index.ts'));
  expect(paths).toContain(resolve(root, 'tools/test/scratch/preload.ts'));
}, 30_000);

for (const name of ['index.ts', 'preload.ts']) {
  // Proof: without tools/test/tsconfig.json, both clean-source assertions failed
  // on "was not found by the project service". The injected literal predicate
  // must produce the typed rule's diagnostic, not a parser error or a skip.
  // The widened tool-git-hooks:lint target also failed on scratch/index.ts:27
  // with restrict-template-expressions before process.pid was wrapped in String.
  test(`shared scratch ${name} is type-linted, not skipped or unparseable`, async () => {
    const filePath = resolve(root, 'tools/test/scratch', name);
    const source = readFileSync(filePath, 'utf8');
    const clean = await eslint.lintText(source, { filePath });
    expect(clean).toHaveLength(1);
    expect(clean[0]?.messages).toEqual([]);

    const broken = await eslint.lintText(
      'export function probe(enabled: true): number { return enabled ? 1 : 0; }\n',
      { filePath },
    );
    // lintText updates the shared TS program; preload imports index, so restore
    // its real exports before checking another file through the same service.
    await eslint.lintText(source, { filePath });
    expect(broken).toHaveLength(1);
    expect(
      broken[0]?.messages.some(
        ({ ruleId }) => ruleId === '@typescript-eslint/no-unnecessary-condition',
      ),
    ).toBe(true);
  }, 30_000);
}
