import { describe, expect, it } from 'bun:test';

import { buildInstallPlan, BUNDLE_FILES, parseInstallArgs, parseSha256sumOutput } from './install';

describe('parseInstallArgs', () => {
  it('defaults to h2puni and dry-run', () => {
    const a = parseInstallArgs([]);
    expect(a.host).toBe('h2puni');
    expect(a.execute).toBe(false);
  });

  it('accepts --host and --execute', () => {
    const a = parseInstallArgs(['--host=example', '--execute']);
    expect(a.host).toBe('example');
    expect(a.execute).toBe(true);
  });

  it('--dry-run overrides a preceding --execute', () => {
    const a = parseInstallArgs(['--execute', '--dry-run']);
    expect(a.execute).toBe(false);
  });
});

describe('buildInstallPlan', () => {
  it('emits an scp-to-temp + chmod-and-rename pair per file', () => {
    const steps = buildInstallPlan('h2puni', [{ local: 'dist/a.js', remote: '/srv/wbs/bin/a.js' }]);
    expect(steps).toHaveLength(2);
    expect(steps[0].argv).toEqual(['scp', 'dist/a.js', 'h2puni:/srv/wbs/bin/a.js.tmp']);
    expect(steps[1].argv).toEqual([
      'ssh',
      'h2puni',
      'chmod 0755 /srv/wbs/bin/a.js.tmp && mv /srv/wbs/bin/a.js.tmp /srv/wbs/bin/a.js',
    ]);
  });

  it('never leaves a step that writes directly to the final path', () => {
    for (const step of buildInstallPlan('h2puni')) {
      if (step.argv[0] === 'scp') {
        expect(step.argv[2]).toMatch(/\.tmp$/);
      }
    }
  });

  it('covers both the swap executor and the smoke bundle by default', () => {
    expect(BUNDLE_FILES.map((f) => f.remote)).toEqual([
      '/srv/wbs/bin/swap.js',
      '/srv/wbs/bin/smoke.js',
    ]);
  });
});

describe('parseSha256sumOutput', () => {
  it('parses coreutils sha256sum lines into a path -> hash map', () => {
    const out = 'aaaa111  /srv/wbs/bin/swap.js\nbbbb222  /srv/wbs/bin/smoke.js\n';
    expect(parseSha256sumOutput(out)).toEqual({
      '/srv/wbs/bin/swap.js': 'aaaa111',
      '/srv/wbs/bin/smoke.js': 'bbbb222',
    });
  });

  it('ignores blank lines', () => {
    expect(parseSha256sumOutput('\n\n')).toEqual({});
  });
});
