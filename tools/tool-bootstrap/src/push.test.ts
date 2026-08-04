import { describe, expect, it } from 'bun:test';

import { requireRegistryPassword } from './lib/secrets';
import { buildPlan, buildStdinPayload, parsePushArgs } from './push';

describe('parsePushArgs', () => {
  it('defaults to dry-run, root, wbsUser puni1, registryUser wbs, no wbs-host', () => {
    const args = parsePushArgs(['--host=example.com']);
    expect(args.host).toBe('example.com');
    expect(args.user).toBe('root');
    expect(args.wbsUser).toBe('puni1');
    expect(args.registryUser).toBe('wbs');
    expect(args.wbsHost).toBeUndefined();
    expect(args.dryRun).toBe(true);
  });

  it('accepts --execute and overrides for user/wbs-user/registry-user/wbs-host', () => {
    const args = parsePushArgs([
      '--host=h',
      '--user=deploy',
      '--wbs-user=svc',
      '--registry-user=reguser',
      '--wbs-host=h-alias',
      '--execute',
    ]);
    expect(args.user).toBe('deploy');
    expect(args.wbsUser).toBe('svc');
    expect(args.registryUser).toBe('reguser');
    expect(args.wbsHost).toBe('h-alias');
    expect(args.dryRun).toBe(false);
  });

  it('requires host', () => {
    expect(() => parsePushArgs([])).toThrow(/--host/);
  });
});

describe('buildPlan', () => {
  const base = {
    host: 'h',
    user: 'root',
    wbsUser: 'puni1',
    registryUser: 'wbs',
    bootstrapPath: 'tools/tool-bootstrap/src/bootstrap.sh',
    configurePath: 'tools/tool-bootstrap/src/configure.sh',
    baseComposePath: 'deploy/compose/base.yml',
    dryRun: true,
  };

  it('orders steps: bootstrap, base.yml, configure, then (if wbs-host given) install', () => {
    const steps = buildPlan({ ...base, wbsHost: 'h2puni' });
    expect(steps).toHaveLength(5);
    expect(steps[0].description).toContain('scp');
    expect(steps[0].description).toContain('bootstrap.sh');
    expect(steps[1].description).toContain('sh /tmp/bootstrap.sh');
    expect(steps[2].description).toContain('base.yml');
    expect(steps[3].kind).toBe('script-over-stdin');
    expect(steps[3].description).toContain('configure.sh');
    expect(steps[4].description).toContain('tool-remote-scripts:install');
    expect(steps[4].description).toContain('--host=h2puni');
  });

  it('omits the install step entirely when --wbs-host is not given', () => {
    const steps = buildPlan(base);
    expect(steps).toHaveLength(4);
    expect(steps.some((s) => s.description.includes('tool-remote-scripts:install'))).toBe(false);
  });

  it('runs bootstrap.sh directly (no sudo) when already root', () => {
    const steps = buildPlan({ ...base, user: 'root' });
    const bootstrapStep = steps[1];
    expect(bootstrapStep.kind).toBe('run');
    if (bootstrapStep.kind === 'run') {
      expect(bootstrapStep.argv).toEqual(['ssh', 'root@h', 'sh /tmp/bootstrap.sh']);
    }
  });

  it('prefixes sudo for a non-root ssh user', () => {
    const steps = buildPlan({ ...base, user: 'deploy' });
    const bootstrapStep = steps[1];
    expect(bootstrapStep.kind).toBe('run');
    if (bootstrapStep.kind === 'run') {
      expect(bootstrapStep.argv).toEqual(['ssh', 'deploy@h', 'sudo sh /tmp/bootstrap.sh']);
    }
  });

  it('scps base.yml to /home/puni1/wbs/base.yml before configure.sh runs', () => {
    const steps = buildPlan(base);
    const scpStep = steps[2];
    expect(scpStep.kind).toBe('run');
    if (scpStep.kind === 'run') {
      expect(scpStep.argv).toEqual([
        'scp',
        'deploy/compose/base.yml',
        'root@h:/home/puni1/wbs/base.yml',
      ]);
    }
  });

  // The whole point of item 3: REGISTRY_PASS's VALUE must never appear in a
  // plan built from args that never carried it. buildPlan only ever sees
  // its own args (host, user, wbsUser, registryUser), never the secret —
  // this asserts that structurally, not just "the test didn't pass one in".
  it('names REGISTRY_PASS by key for the configure.sh step, never touches a value', () => {
    const steps = buildPlan(base);
    const configureStep = steps[3];
    expect(configureStep.kind).toBe('script-over-stdin');
    if (configureStep.kind === 'script-over-stdin') {
      expect(configureStep.envKeys).toEqual(['WBS_USER', 'REGISTRY_USER', 'REGISTRY_PASS']);
    }
    expect(JSON.stringify(steps)).not.toContain('hunter2');
  });
});

describe('buildStdinPayload', () => {
  it('exports each key before the script text, shell-quoted', () => {
    const payload = buildStdinPayload(
      { WBS_USER: 'puni1', REGISTRY_PASS: 'has a space' },
      '#!/bin/sh\necho hi\n',
    );
    expect(payload).toBe(
      "export WBS_USER='puni1'\nexport REGISTRY_PASS='has a space'\n#!/bin/sh\necho hi\n",
    );
  });

  it("escapes an embedded single quote so it can't break out of the quoting", () => {
    const payload = buildStdinPayload({ REGISTRY_PASS: "o'brien" }, 'true\n');
    // The value must round-trip through `sh` unchanged; assert the specific
    // close-escape-reopen shape rather than trusting `.includes`.
    expect(payload).toContain(`export REGISTRY_PASS='o'\\''brien'`);
  });
});

describe('requireRegistryPassword', () => {
  it('returns the password when REGISTRY_PASS is set', () => {
    expect(requireRegistryPassword({ REGISTRY_PASS: 'hunter2' })).toBe('hunter2');
  });

  it('throws when REGISTRY_PASS is unset', () => {
    expect(() => requireRegistryPassword({})).toThrow(/REGISTRY_PASS/);
  });

  it('throws when REGISTRY_PASS is empty', () => {
    expect(() => requireRegistryPassword({ REGISTRY_PASS: '' })).toThrow(/REGISTRY_PASS/);
  });
});
