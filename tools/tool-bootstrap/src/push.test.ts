import { describe, expect, it } from 'bun:test';

import { buildPlan, parsePushArgs } from './push';

describe('parsePushArgs', () => {
  it('defaults to dry-run and root', () => {
    const args = parsePushArgs(['--host=example.com']);
    expect(args.host).toBe('example.com');
    expect(args.user).toBe('root');
    expect(args.dryRun).toBe(true);
  });

  it('accepts --execute', () => {
    const args = parsePushArgs(['--host=h', '--user=deploy', '--execute']);
    expect(args.user).toBe('deploy');
    expect(args.dryRun).toBe(false);
  });

  it('requires host', () => {
    expect(() => parsePushArgs([])).toThrow(/--host/);
  });
});

describe('buildPlan', () => {
  it('builds scp + ssh command strings', () => {
    const plan = buildPlan({
      host: 'h',
      user: 'u',
      scriptPath: 'tools/tool-bootstrap/src/bootstrap.sh',
      dryRun: true,
    });
    expect(plan.scp).toContain('bootstrap.sh u@h:/tmp/bootstrap.sh');
    expect(plan.ssh).toContain("ssh u@h 'sudo sh /tmp/bootstrap.sh'");
  });
});
