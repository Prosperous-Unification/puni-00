import { describe, expect, it } from 'bun:test';

import { materialize, parseDeployArgs, type Tier } from './affected';
import { buildDeployPlan, type DeployPlanDeps, type ReleaseRecord } from './deploy';
import type { RemoteTierState } from './remote-state';
import { buildScpInvocation, buildSshInvocation } from './ssh';

describe('parseDeployArgs', () => {
  it('defaults to affected + dry-run', () => {
    const a = parseDeployArgs([]);
    expect(a.tiers).toBe('affected');
    expect(a.dryRun).toBe(true);
    expect(a.withMigrations).toBe(false);
    expect(a.stopTheWorld).toBe(false);
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

  it('parses --with-migrations', () => {
    expect(parseDeployArgs(['--with-migrations']).withMigrations).toBe(true);
  });

  it('parses --stop-the-world', () => {
    expect(parseDeployArgs(['--stop-the-world']).stopTheWorld).toBe(true);
  });
});

describe('materialize', () => {
  const base = { dryRun: true, skipBuild: false, withMigrations: false, stopTheWorld: false };

  it('expands all to three tiers', () => {
    expect(materialize({ tiers: 'all', ...base }, [])).toEqual(['be', 'gw', 'fe']);
  });

  it('uses affected when tiers is "affected"', () => {
    expect(materialize({ tiers: 'affected', ...base }, ['gw'])).toEqual(['gw']);
  });
});

describe('ssh helpers', () => {
  it('quotes remote cmd correctly', () => {
    const s = buildSshInvocation({ host: 'h', user: 'u' }, 'bun run thing');
    expect(s).toBe('ssh u@h "bun run thing"');
  });

  it('formats scp command', () => {
    expect(buildScpInvocation({ host: 'h', user: 'u' }, 'a.tar.gz', '/tmp/')).toBe(
      'scp a.tar.gz u@h:/tmp/',
    );
  });
});

const RELEASE: ReleaseRecord = {
  be: { sha: 'abc1234', digest: 'sha256:be'.padEnd(71, '0'), ref: 'registry/wbs-be-01:abc1234' },
  gw: { sha: 'abc1234', digest: 'sha256:gw'.padEnd(71, '0'), ref: 'registry/wbs-gw-01:abc1234' },
  fe: { sha: 'abc1234', digest: 'sha256:fe'.padEnd(71, '0'), ref: 'registry/wbs-fe-01:abc1234' },
};

function fakeDeps(overrides: Partial<DeployPlanDeps> = {}): DeployPlanDeps {
  return {
    readRemoteState: () => Promise.resolve({} as Partial<Record<Tier, RemoteTierState>>),
    listMigrations: () => ['0001_init'],
    readRelease: () => Promise.resolve(RELEASE),
    ...overrides,
  };
}

describe('buildDeployPlan', () => {
  it('emits a per-tier plan with --all, defaulting to the h2puni host', async () => {
    const p = await buildDeployPlan(['--all'], [], 'headsha', fakeDeps());
    expect(p.tiers).toEqual(['be', 'gw', 'fe']);
    expect(p.dryRun).toBe(true);
    expect(p.host).toBe('h2puni');
    expect(p.commands).toHaveLength(3);
    expect(p.commands[0]).toContain('bin/swap.js be');
    expect(p.commands[0]).toContain('--digest=');
    expect(p.commands[0]).not.toContain('--execute');
  });

  it('honors an explicit --host', async () => {
    const p = await buildDeployPlan(['be', '--host=other'], [], 'headsha', fakeDeps());
    expect(p.host).toBe('other');
    expect(p.steps.some((s) => s.includes('ssh other'))).toBe(true);
  });

  it('appends --execute to the remote command when not a dry run', async () => {
    const p = await buildDeployPlan(['be', '--execute'], [], 'headsha', fakeDeps());
    expect(p.commands[0]).toContain('--execute');
  });

  it('reports "(never deployed)" for a tier with no remote state', async () => {
    const p = await buildDeployPlan(['be'], [], 'headsha', fakeDeps());
    expect(p.steps.some((s) => s.includes('(never deployed)'))).toBe(true);
  });

  it('is silent about migrations when the deployed and head sets match', async () => {
    const deps = fakeDeps({
      readRemoteState: () =>
        Promise.resolve({
          be: { tier: 'be', activeColor: 'blue', lastDeployedSha: 'deployed-sha' },
        }),
      listMigrations: () => ['0001_init'],
    });
    const p = await buildDeployPlan(['be'], [], 'headsha', deps);
    expect(p.steps.some((s) => s.includes('new migrations'))).toBe(false);
  });

  it('throws and never reaches ssh when a new migration lacks an override flag', async () => {
    const deps = fakeDeps({
      readRemoteState: () =>
        Promise.resolve({
          be: { tier: 'be', activeColor: 'blue', lastDeployedSha: 'deployed-sha' },
        }),
      listMigrations: (sha) => (sha === 'deployed-sha' ? ['0001_init'] : ['0001_init', '0002_new']),
    });
    let message = '';
    try {
      await buildDeployPlan(['be'], [], 'headsha', deps);
    } catch (e: unknown) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toMatch(/--with-migrations/);
  });

  it('proceeds when --with-migrations acknowledges the new migration', async () => {
    const deps = fakeDeps({
      readRemoteState: () =>
        Promise.resolve({
          be: { tier: 'be', activeColor: 'blue', lastDeployedSha: 'deployed-sha' },
        }),
      listMigrations: (sha) => (sha === 'deployed-sha' ? ['0001_init'] : ['0001_init', '0002_new']),
    });
    const p = await buildDeployPlan(['be', '--with-migrations'], [], 'headsha', deps);
    expect(p.steps.some((s) => s.includes('new migrations present'))).toBe(true);
  });

  it('proceeds when --stop-the-world acknowledges the new migration', async () => {
    const deps = fakeDeps({
      readRemoteState: () =>
        Promise.resolve({
          be: { tier: 'be', activeColor: 'blue', lastDeployedSha: 'deployed-sha' },
        }),
      listMigrations: (sha) => (sha === 'deployed-sha' ? ['0001_init'] : ['0001_init', '0002_new']),
    });
    const p = await buildDeployPlan(['be', '--stop-the-world'], [], 'headsha', deps);
    expect(p.steps.some((s) => s.includes('stop-the-world'))).toBe(true);
  });

  it('never gates a first-ever deploy (no baseline) even with new migration files', async () => {
    const deps = fakeDeps({
      readRemoteState: () => Promise.resolve({} as Partial<Record<Tier, RemoteTierState>>),
      listMigrations: () => ['0001_init', '0002_new'],
    });
    const p = await buildDeployPlan(['be'], [], 'headsha', deps);
    expect(p.steps.some((s) => s.includes('new migrations'))).toBe(false);
  });

  it('throws a clear error when the release manifest has no entry for a tier', async () => {
    const deps = fakeDeps({ readRelease: () => Promise.resolve({}) });
    let message = '';
    try {
      await buildDeployPlan(['be'], [], 'headsha', deps);
    } catch (e: unknown) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toMatch(/no release entry for tier "be"/);
  });

  it('uses affected tiers when none are given positionally', async () => {
    const p = await buildDeployPlan([], ['gw'], 'headsha', fakeDeps());
    expect(p.tiers).toEqual(['gw']);
  });
});
