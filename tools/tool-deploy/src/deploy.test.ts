import { describe, expect, it } from 'bun:test';

import { materialize, parseDeployArgs } from './affected';
import { buildDeployPlan } from './deploy';
import { stateFilePath } from './remote-state';
import { buildScpInvocation, buildSshInvocation } from './ssh';

describe('parseDeployArgs', () => {
  it('defaults to affected + dry-run', () => {
    const a = parseDeployArgs([]);
    expect(a.tiers).toBe('affected');
    expect(a.dryRun).toBe(true);
  });

  it('parses --all', () => {
    expect(parseDeployArgs(['--all']).tiers).toBe('all');
  });

  it('parses positional tier list', () => {
    expect(parseDeployArgs(['be', 'gw']).tiers).toEqual(['be', 'gw']);
  });

  it('rejects unknown tier', () => {
    expect(() => parseDeployArgs(['xx'])).toThrow(/unknown tier/);
  });

  it('parses --host, --version, --execute', () => {
    const a = parseDeployArgs(['--host=example', '--version=abc1234', '--execute']);
    expect(a.host).toBe('example');
    expect(a.version).toBe('abc1234');
    expect(a.dryRun).toBe(false);
  });
});

describe('materialize', () => {
  it('expands all to three tiers', () => {
    expect(materialize({ tiers: 'all', dryRun: true, skipBuild: false }, [])).toEqual([
      'be',
      'gw',
      'fe',
    ]);
  });

  it('uses affected when tiers is "affected"', () => {
    expect(materialize({ tiers: 'affected', dryRun: true, skipBuild: false }, ['gw'])).toEqual([
      'gw',
    ]);
  });
});

describe('ssh + state helpers', () => {
  it('quotes remote cmd correctly', () => {
    const s = buildSshInvocation({ host: 'h', user: 'u' }, 'bun run thing');
    expect(s).toBe('ssh u@h "bun run thing"');
  });

  it('formats scp command', () => {
    expect(buildScpInvocation({ host: 'h', user: 'u' }, 'a.tar.gz', '/tmp/')).toBe(
      'scp a.tar.gz u@h:/tmp/',
    );
  });

  it('state file path uses tier', () => {
    expect(stateFilePath('be')).toBe('/srv/wbs/state/be.last-deployed.json');
  });
});

describe('buildDeployPlan', () => {
  it('emits a per-tier plan with --all', () => {
    const p = buildDeployPlan(['--all', '--host=h'], []);
    expect(p.tiers).toEqual(['be', 'gw', 'fe']);
    expect(p.dryRun).toBe(true);
    expect(p.steps.some((s) => s.includes('publish-be'))).toBe(true);
    expect(p.steps.some((s) => s.includes('ssh root@h'))).toBe(true);
  });

  it('honors --skip-build', () => {
    const p = buildDeployPlan(['be', '--skip-build'], []);
    expect(p.steps.some((s) => s.includes('publish-'))).toBe(false);
  });
});
