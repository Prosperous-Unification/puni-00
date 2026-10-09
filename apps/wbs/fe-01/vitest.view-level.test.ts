import { readFileSync } from 'node:fs';

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
});
