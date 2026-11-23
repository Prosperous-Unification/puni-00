import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'bun:test';

import { readInstalledRequest } from './cli-parser';
import { prepareToolkit } from './policy/prepare-activation-cli';
import { writeExplainCommand } from './rules/check';

describe('typed Burokrat adapters', () => {
  it('refuses discovery where a legacy adapter requires an operation', () => {
    expect(() => {
      writeExplainCommand(['explain', '--help']);
    }).toThrow('expected an operation for explain');
  });

  it('refuses a valid request for another operation before invoking a handler', () => {
    expect(() => {
      writeExplainCommand(['template', 'list']);
    }).toThrow('expected explain, received template');
  });

  it('requires an explicit toolkit source before activation can read authority', () => {
    const request = readInstalledRequest('prepare-activation', [
      'prepare-activation',
      '--candidate-repository',
      '/absent/repository',
      '--candidate-sha',
      'a'.repeat(40),
      '--candidate-policy',
      'docs/policy.json',
      '--candidate-mapping',
      'docs/mapping.json',
      '--review-record',
      '/absent/review.json',
      '--audit-strata',
      '/absent/strata.json',
      '--destination',
      '/absent/destination',
      '--work',
      '/absent/work',
      '--resource-lane',
      'test',
      '--cwd-identity',
      'b'.repeat(64),
      '--check-runs',
      '/absent/checks',
    ]);
    expect(() => prepareToolkit(request)).toThrow('missing required flag: --toolkit');
  });

  it('executes a typed template request even when the argv adapter is broken', () => {
    const child = Bun.spawnSync(
      [
        process.execPath,
        fileURLToPath(new URL('./fixtures/typed-dispatch.fixture.ts', import.meta.url)),
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(child.exitCode).toBe(0);
    expect(child.stderr.toString()).toBe('');
    const printed: unknown = JSON.parse(child.stdout.toString());
    expect(printed).toMatchObject({ schemaVersion: 1 });
    expect(printed).toHaveProperty('templates');
  });
});
