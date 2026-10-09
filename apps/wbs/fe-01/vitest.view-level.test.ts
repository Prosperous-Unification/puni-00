import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NODE_SUITES } from './vitest.node-suites';
import view from './vitest.view.config';

describe('View level collection', () => {
  it('excludes every Node suite from the UTC View run', () => {
    const excluded = view.test?.exclude ?? [];
    for (const path of NODE_SUITES) expect(excluded).toContain(path);
    expect(excluded).toContain('src/**/*.zoned.test.{ts,tsx}');
    expect(excluded).toContain('*.test.ts');
  });

  it('writes separate JUnit reports for Unit, UTC View and Auckland View', () => {
    const project = JSON.parse(readFileSync('project.json', 'utf8')) as {
      targets: Record<string, { options?: { command?: string } }>;
    };
    expect(project.targets['test:unit:level'].options?.command).toContain(
      '--outputFile=../../../tmp/junit/wbs-fe-01.unit.xml',
    );
    expect(project.targets['test:unit:level'].options?.command).toContain(
      '--outputFile=../../../tmp/junit/wbs-fe-01.unit.root.xml',
    );
    const viewCommand = project.targets['test:view:level'].options?.command;
    expect(viewCommand).toContain('--outputFile=../../../tmp/junit/wbs-fe-01.view.utc.xml');
    expect(viewCommand).toContain('--outputFile=../../../tmp/junit/wbs-fe-01.view.auckland.xml');
    expect(viewCommand).toContain('--config vitest.view.config.ts');
    expect(viewCommand).toContain('--config vitest.zoned.config.ts');
  });

  // Proof: removing the pre-phase rm from either production target left stale first-phase XML
  // readable after the stubbed bunx exited 67; each named case failed, then passed restored.
  it.each([
    ['test:unit:level', 'wbs-fe-01.unit.xml', 'wbs-fe-01.unit.root.xml'],
    ['test:view:level', 'wbs-fe-01.view.utc.xml', 'wbs-fe-01.view.auckland.xml'],
  ])('clears both %s reports before the first phase fails', (target, first, second) => {
    const project = JSON.parse(readFileSync('project.json', 'utf8')) as {
      targets: Record<string, { options?: { command?: string } }>;
    };
    const command = project.targets[target].options?.command;
    if (command === undefined) throw new Error(`${target} has no command`);
    const scratchRoot = mkdtempSync(join(tmpdir(), 'fe-level-failure-'));
    try {
      const projectRoot = join(scratchRoot, 'apps/wbs/fe-01');
      const reportRoot = join(scratchRoot, 'tmp/junit');
      const binRoot = join(scratchRoot, 'bin');
      mkdirSync(projectRoot, { recursive: true });
      mkdirSync(reportRoot, { recursive: true });
      mkdirSync(binRoot);
      writeFileSync(join(reportRoot, first), '<testsuite name="stale-first"/>');
      writeFileSync(join(reportRoot, second), '<testsuite name="stale-second"/>');
      writeFileSync(join(binRoot, 'bunx'), '#!/bin/sh\nexit 67\n');
      chmodSync(join(binRoot, 'bunx'), 0o755);
      const invocation = spawnSync('sh', ['-c', command], {
        cwd: projectRoot,
        env: { ...process.env, PATH: `${binRoot}:${process.env.PATH ?? ''}` },
        encoding: 'utf8',
      });
      expect(invocation.status).toBe(67);
      expect(() => readFileSync(join(reportRoot, first))).toThrow();
      expect(() => readFileSync(join(reportRoot, second))).toThrow();
    } finally {
      rmSync(scratchRoot, { recursive: true, force: true });
    }
  });
});
