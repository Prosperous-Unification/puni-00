import { createHash } from 'node:crypto';
import { chmod, mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import type { RunDocker } from './docker-deadline';
import { envLayout } from './env';
import { fenceGateways, inspectGatewayFence } from './gateway-exclusion';
import { assertNoGatewayFence } from './gateway-fence';
import { withLock } from './lock';

const id = 'a'.repeat(64);
const imageId = `sha256:${'b'.repeat(64)}`;
const image = `registry/wbs-gw-01@sha256:${'c'.repeat(64)}`;
const sha = 'd'.repeat(40);

async function refuses(promise: Promise<unknown>, message?: string): Promise<void> {
  let refused = false;
  try {
    await promise;
  } catch (cause) {
    refused = true;
    expect(cause).toBeInstanceOf(Error);
    if (message !== undefined) expect(String(cause)).toContain(message);
  }
  expect(refused).toBe(true);
}

function fixture() {
  const root = scratchSync('gateway-exclusion-');
  const layout = { ...envLayout('prod'), root, stateDir: root };
  const container = {
    Id: id,
    Name: '/gw-01-blue',
    Image: imageId,
    Config: {
      Image: image,
      Labels: { 'com.docker.compose.service': 'gw-01-blue', 'com.docker.compose.project': 'wbs' },
    },
    HostConfig: {
      Init: true,
      PidMode: '',
      Privileged: false,
      CapAdd: null,
      RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 },
      NetworkMode: 'wbs-net',
    },
    NetworkSettings: { Networks: { 'wbs-net': { NetworkID: 'e'.repeat(64) } } },
    RestartCount: 0,
    State: {
      Running: true,
      Paused: false,
      Restarting: false,
      Dead: false,
      OOMKilled: false,
      Pid: 123,
      Status: 'running',
      StartedAt: '2026-10-23T00:00:00.000000000Z',
      FinishedAt: '0001-01-01T00:00:00Z',
      ExitCode: 0,
      Error: '',
    },
  };
  const containers = [container];
  const calls: string[][] = [];
  let absent = false;
  let fault: (args: string[]) => void | Promise<void> = () => undefined;
  const runner: RunDocker = async (args) => {
    calls.push(args);
    await fault(args);
    if (args[0] === 'ps') return absent ? '' : containers.map((entry) => entry.Id).join('\n');
    if (args[0] === 'inspect') return JSON.stringify(absent ? [] : containers);
    if (args[0] === 'image') return imageId;
    if (args[0] === 'update') {
      const target = containers.find((entry) => entry.Id === args.at(-1));
      if (target === undefined) throw new Error('missing update identity');
      target.HostConfig.RestartPolicy.Name = 'no';
      return target.Id;
    }
    if (args[0] === 'stop') {
      const target = containers.find((entry) => entry.Id === args.at(-1));
      if (target === undefined) throw new Error('missing stop identity');
      Object.assign(target.State, {
        Running: false,
        Pid: 0,
        Status: 'exited',
        FinishedAt: '2026-10-23T01:00:00.000000000Z',
      });
      return id;
    }
    throw new Error(`unexpected Docker call ${args.join(' ')}`);
  };
  return {
    root,
    layout,
    container,
    containers,
    calls,
    runner,
    setAbsent: () => {
      absent = true;
    },
    setFault: (inject: typeof fault) => {
      fault = inject;
    },
  };
}

test('fences only exact managed identities and re-proves current exclusion on inspection', async () => {
  const f = fixture();
  const proof = await fenceGateways(f.layout, sha, f.runner);
  expect(proof.cohort.blue?.id).toBe(id);
  expect(proof.cohort.green).toBeNull();
  expect(f.calls.filter((call) => call[0] === 'update')).toEqual([['update', '--restart=no', id]]);
  expect(f.calls.filter((call) => call[0] === 'stop')).toEqual([['stop', '--time', '10', id]]);
  expect(await readFile(`${f.root}/dependency-gateway-fence.json`, 'utf8')).toBe(
    '{"format":"dependency-gateway-fence","version":1}\n',
  );
  expect(await inspectGatewayFence(f.layout, f.runner)).toEqual(proof);
  f.container.State.Running = true;
  await refuses(inspectGatewayFence(f.layout, f.runner), 'excluded');
});

test('both absent proves only an empty managed cohort', async () => {
  const f = fixture();
  f.setAbsent();
  const proof = await fenceGateways(f.layout, sha, f.runner);
  expect(proof.cohort).toEqual({ blue: null, green: null });
  expect(f.calls.every((call) => call[0] === 'ps')).toBe(true);
});

for (const companion of ['dependency-gateway-intent.json', 'dependency-gateway-complete.json']) {
  test(`ordinary admission refuses orphan ${companion}`, async () => {
    const f = fixture();
    await writeFile(`${f.root}/${companion}`, '{}');
    await refuses(assertNoGatewayFence(f.root), 'gateway fence');
    await refuses(fenceGateways(f.layout, sha, f.runner), 'gateway fence');
    expect(f.calls).toEqual([]);
  });
}

for (const fault of [
  'init',
  'pid',
  'privileged',
  'caps',
  'image',
  'image-resolution',
  'label',
  'network',
  'restarting',
  'paused',
  'restart-count',
  'unexpected-name',
  'truncated-id',
] as const) {
  test(`refuses ${fault} before publishing intent or Docker effects`, async () => {
    const f = fixture();
    if (fault === 'init') f.container.HostConfig.Init = false;
    if (fault === 'pid') f.container.HostConfig.PidMode = 'host';
    if (fault === 'privileged') f.container.HostConfig.Privileged = true;
    if (fault === 'caps') Object.assign(f.container.HostConfig, { CapAdd: ['SYS_ADMIN'] });
    if (fault === 'image') f.container.Config.Image = 'registry/wbs-gw-01:latest';
    if (fault === 'image-resolution')
      f.setFault((args) => {
        if (args[0] === 'image') throw new Error('image resolution unavailable');
      });
    if (fault === 'label') f.container.Config.Labels['com.docker.compose.service'] = 'be-01-blue';
    if (fault === 'network') f.container.NetworkSettings.Networks['wbs-net'].NetworkID = '';
    if (fault === 'restarting') f.container.State.Restarting = true;
    if (fault === 'paused') f.container.State.Paused = true;
    if (fault === 'restart-count') f.container.RestartCount = -1;
    if (fault === 'unexpected-name') f.container.Name = '/unexpected';
    if (fault === 'truncated-id') f.container.Id = 'a'.repeat(12);
    await refuses(fenceGateways(f.layout, sha, f.runner));
    expect((await readdir(f.root)).filter((name) => name.endsWith('.json'))).toEqual([]);
    expect(f.calls.some((call) => ['update', 'stop'].includes(call[0] ?? ''))).toBe(false);
  });
}

for (const fault of [
  'update-failure',
  'lying-update',
  'stop-failure',
  'lying-stop',
  'restart-drift',
  'cohort-drift',
  'completion-drift',
] as const) {
  test(`retains evidence and current Docker state after ${fault}`, async () => {
    const f = fixture();
    let inspections = 0;
    f.setFault(async (args) => {
      if (args[0] === 'inspect') inspections++;
      if (fault === 'update-failure' && args[0] === 'update') throw new Error('update refused');
      if (fault === 'lying-update' && args[0] === 'inspect' && inspections === 3)
        f.container.HostConfig.RestartPolicy.Name = 'always';
      if (fault === 'stop-failure' && args[0] === 'stop') throw new Error('stop refused');
      if (fault === 'lying-stop' && args[0] === 'inspect' && inspections >= 4)
        f.container.State.Pid = 123;
      if (fault === 'restart-drift' && args[0] === 'inspect' && inspections >= 4)
        f.container.State.StartedAt = '2026-10-23T00:00:01Z';
      if (fault === 'cohort-drift' && args[0] === 'inspect' && inspections >= 4)
        f.container.Name = '/gw-01-green';
      if (
        fault === 'completion-drift' &&
        args[0] === 'ps' &&
        (await readdir(f.root)).includes('dependency-gateway-complete.json')
      )
        f.container.State.Pid = 123;
    });
    await refuses(fenceGateways(f.layout, sha, f.runner));
    expect(await readFile(`${f.root}/dependency-gateway-fence.json`, 'utf8')).toContain(
      'dependency-gateway-fence',
    );
    expect(await readFile(`${f.root}/dependency-gateway-intent.json`, 'utf8')).toContain(id);
    expect(f.calls.some((call) => ['start', 'restart', 'rm'].includes(call[0] ?? ''))).toBe(false);
    if (fault === 'lying-update' || fault === 'update-failure')
      expect(f.calls.some((call) => call[0] === 'stop')).toBe(false);
    await refuses(assertNoGatewayFence(f.root));
  });
}

test('rejects concurrent operation under the actual deploy lock before Docker', async () => {
  const f = fixture();
  await withLock(`${f.root}/deploy.lock`, async () => {
    await refuses(fenceGateways(f.layout, sha, f.runner), 'deploy lock held');
    await refuses(inspectGatewayFence(f.layout, f.runner), 'deploy lock held');
  });
  expect(f.calls).toEqual([]);
});

for (const fault of [
  'missing-intent',
  'changed-intent',
  'extra-completion-field',
  'symlink-completion',
  'unreadable-intent',
] as const) {
  test(`inspection refuses ${fault} without trusting historical completion`, async () => {
    const f = fixture();
    await fenceGateways(f.layout, sha, f.runner);
    const path = `${f.root}/dependency-gateway-intent.json`;
    if (fault === 'missing-intent') await Bun.file(path).delete();
    if (fault === 'changed-intent') await writeFile(path, (await readFile(path, 'utf8')) + ' ');
    if (fault === 'extra-completion-field') {
      const completion = `${f.root}/dependency-gateway-complete.json`;
      const record = JSON.parse(await readFile(completion, 'utf8')) as Record<string, unknown>;
      record['extra'] = true;
      await writeFile(completion, JSON.stringify(record));
    }
    if (fault === 'symlink-completion') {
      const completion = `${f.root}/dependency-gateway-complete.json`;
      await Bun.file(completion).delete();
      await symlink(path, completion);
    }
    if (fault === 'unreadable-intent') await chmod(path, 0);
    try {
      await refuses(inspectGatewayFence(f.layout, f.runner));
    } finally {
      if (fault === 'unreadable-intent') await chmod(path, 0o600);
    }
  });
}

for (const operation of ['update', 'stop']) {
  test(`bounds stalled ${operation} and retains durable evidence`, async () => {
    const f = fixture();
    f.setFault((args) => (args[0] === operation ? new Promise(() => undefined) : undefined));
    await refuses(fenceGateways(f.layout, sha, f.runner, 100), 'deadline exceeded');
    expect(await readFile(`${f.root}/dependency-gateway-intent.json`, 'utf8')).toContain(id);
    expect(f.calls.some((call) => ['start', 'restart', 'rm'].includes(call[0] ?? ''))).toBe(false);
  });
}

test('retains marker and diagnostic if intent publication collides after marker publication', async () => {
  const f = fixture();
  let observations = 0;
  f.setFault(async (args) => {
    if (args[0] === 'image' && ++observations === 1)
      await writeFile(`${f.root}/dependency-gateway-intent.json`, 'foreign attempt');
  });
  await refuses(fenceGateways(f.layout, sha, f.runner), 'retain all');
  expect(await readFile(`${f.root}/dependency-gateway-intent.json`, 'utf8')).toBe(
    'foreign attempt',
  );
  expect(await readFile(`${f.root}/dependency-gateway-fence.json`, 'utf8')).toContain(
    'dependency-gateway-fence',
  );
  expect(f.calls.some((call) => ['update', 'stop'].includes(call[0] ?? ''))).toBe(false);
});

test('rejects malformed process timestamps before publication', async () => {
  const f = fixture();
  f.container.State.StartedAt = 'unknown';
  await refuses(fenceGateways(f.layout, sha, f.runner));
  expect((await readdir(f.root)).filter((name) => name.endsWith('.json'))).toEqual([]);
});

test('fences both colours with all restart readbacks before either stop', async () => {
  const f = fixture();
  const green = structuredClone(f.container);
  green.Id = 'f'.repeat(64);
  green.Name = '/gw-01-green';
  green.Config.Labels['com.docker.compose.service'] = 'gw-01-green';
  f.containers.push(green);
  const receipt = await fenceGateways(f.layout, sha, f.runner);
  expect(receipt.cohort.green?.id).toBe(green.Id);
  expect(f.calls.filter((call) => ['update', 'stop'].includes(call[0] ?? ''))).toEqual([
    ['update', '--restart=no', id],
    ['update', '--restart=no', green.Id],
    ['stop', '--time', '10', id],
    ['stop', '--time', '10', green.Id],
  ]);
});

for (const fault of [
  'duplicate-id',
  'duplicate-name',
  'unexpected-managed',
  'project-mismatch',
  'missing-inspect-entry',
  'foreign-inspect-id',
  'image-id-mismatch',
] as const) {
  test(`unfiltered complete cohort refuses ${fault} before publication`, async () => {
    const f = fixture();
    const green = structuredClone(f.container);
    green.Id = 'f'.repeat(64);
    green.Name = '/gw-01-green';
    green.Config.Labels['com.docker.compose.service'] = 'gw-01-green';
    f.containers.push(green);
    if (fault === 'duplicate-id') green.Id = id;
    if (fault === 'duplicate-name') green.Name = '/gw-01-blue';
    if (fault === 'unexpected-managed') green.Name = '/gw-01-extra';
    if (fault === 'project-mismatch') green.Config.Labels['com.docker.compose.project'] = 'foreign';
    if (fault === 'missing-inspect-entry')
      f.setFault((args) => {
        if (args[0] === 'inspect') f.containers.pop();
      });
    if (fault === 'foreign-inspect-id')
      f.setFault((args) => {
        if (args[0] === 'inspect') green.Id = 'e'.repeat(64);
      });
    if (fault === 'image-id-mismatch') green.Image = `sha256:${'e'.repeat(64)}`;
    await refuses(fenceGateways(f.layout, sha, f.runner));
    expect((await readdir(f.root)).filter((name) => name.endsWith('.json'))).toEqual([]);
    expect(f.calls.some((call) => ['update', 'stop'].includes(call[0] ?? ''))).toBe(false);
  });
}

test('unfiltered inventory observes unrelated containers without changing them', async () => {
  const f = fixture();
  const unrelated = structuredClone(f.container);
  unrelated.Id = 'f'.repeat(64);
  unrelated.Name = '/be-01-blue';
  unrelated.Config.Labels['com.docker.compose.service'] = 'be-01-blue';
  unrelated.Config.Image = 'registry/wbs-be-01:tag';
  f.containers.push(unrelated);
  await fenceGateways(f.layout, sha, f.runner);
  expect(
    f.calls.filter((call) => call[0] === 'inspect').every((call) => call.includes(unrelated.Id)),
  ).toBe(true);
  expect(unrelated.State.Running).toBe(true);
  expect(unrelated.HostConfig.RestartPolicy.Name).toBe('unless-stopped');
});

for (const fault of [
  'missing-root',
  'unreadable-root',
  'symlink-root',
  'marker-symlink',
  'marker-unreadable',
  'intent-only',
  'marker-only',
  'completion-only',
] as const) {
  test(`refuses ${fault} trusted state without Docker effects`, async () => {
    const f = fixture();
    const marker = `${f.root}/dependency-gateway-fence.json`;
    if (fault === 'unreadable-root') await chmod(f.root, 0o111);
    if (fault === 'symlink-root') {
      const link = `${f.root}-link`;
      await symlink(f.root, link);
      f.layout.stateDir = link;
    }
    if (fault === 'marker-symlink') await symlink(`${f.root}/absent`, marker);
    if (fault === 'marker-unreadable') {
      await writeFile(marker, 'unreadable');
      await chmod(marker, 0);
    }
    if (fault === 'intent-only') await writeFile(`${f.root}/dependency-gateway-intent.json`, '{}');
    if (fault === 'marker-only')
      await writeFile(marker, '{"format":"dependency-gateway-fence","version":1}\n');
    if (fault === 'completion-only')
      await writeFile(`${f.root}/dependency-gateway-complete.json`, '{}');
    const layout =
      fault === 'missing-root' ? { ...f.layout, stateDir: `${f.root}/missing` } : f.layout;
    try {
      await refuses(inspectGatewayFence(layout, f.runner));
      await refuses(fenceGateways(layout, sha, f.runner));
      expect(f.calls).toEqual([]);
    } finally {
      if (fault === 'unreadable-root') await chmod(f.root, 0o700);
      if (fault === 'marker-unreadable') await chmod(marker, 0o600);
    }
  });
}

for (const fault of [
  'boolean-type',
  'empty-project',
  'bad-policy',
  'policy-retry-count',
  'invalid-image-identity',
  'unknown-intent-field',
  'wrong-intent-version',
  'wrong-intent-attempt',
  'foreign-intent-root',
  'wrong-completion-attempt',
  'wrong-completion-version',
] as const) {
  test(`strict external record boundary refuses ${fault}`, async () => {
    const f = fixture();
    if (fault === 'boolean-type') Object.assign(f.container.State, { Running: 'true' });
    if (fault === 'empty-project') f.container.Config.Labels['com.docker.compose.project'] = '';
    if (fault === 'bad-policy') f.container.HostConfig.RestartPolicy.Name = 'sometimes';
    if (fault === 'policy-retry-count') f.container.HostConfig.RestartPolicy.MaximumRetryCount = 2;
    if (fault === 'invalid-image-identity') f.container.Image = 'malformed';
    const runner: RunDocker =
      fault === 'invalid-image-identity'
        ? async (args, signal) => (args[0] === 'image' ? 'malformed' : await f.runner(args, signal))
        : f.runner;
    if (
      [
        'boolean-type',
        'empty-project',
        'bad-policy',
        'policy-retry-count',
        'invalid-image-identity',
      ].includes(fault)
    ) {
      await refuses(fenceGateways(f.layout, sha, runner));
      expect((await readdir(f.root)).filter((name) => name.endsWith('.json'))).toEqual([]);
      return;
    }
    await fenceGateways(f.layout, sha, runner);
    const path = `${f.root}/${fault.includes('completion') ? 'dependency-gateway-complete.json' : 'dependency-gateway-intent.json'}`;
    const record = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    if (fault === 'unknown-intent-field') record['extra'] = true;
    if (fault === 'wrong-intent-version' || fault === 'wrong-completion-version')
      record['version'] = 2;
    if (fault === 'wrong-intent-attempt') record['attempt'] = '-'.repeat(36);
    if (fault === 'foreign-intent-root') record['root'] = '/foreign';
    if (fault === 'wrong-completion-attempt') record['attempt'] = '0'.repeat(36);
    const serialized = JSON.stringify(record);
    await writeFile(path, serialized);
    if (!fault.includes('completion')) {
      const completionPath = `${f.root}/dependency-gateway-complete.json`;
      const completion = JSON.parse(await readFile(completionPath, 'utf8')) as Record<
        string,
        unknown
      >;
      if (fault === 'wrong-intent-attempt') completion['attempt'] = record['attempt'];
      completion['intentSha256'] = createHash('sha256').update(serialized).digest('hex');
      await writeFile(completionPath, JSON.stringify(completion));
    }
    await refuses(inspectGatewayFence(f.layout, runner));
  });
}

test('refuses symlink-parent-root with a directory leaf', async () => {
  const f = fixture();
  const link = `${f.root}-parent-link`;
  await mkdir(`${f.root}/state`);
  await symlink(f.root, link);
  f.layout.stateDir = `${link}/state`;
  await refuses(fenceGateways(f.layout, sha, f.runner), 'canonical');
  expect(f.calls).toEqual([]);
});

test('refuses an unexpected managed gateway even when detached from the expected network', async () => {
  const f = fixture();
  const unexpected = structuredClone(f.container);
  unexpected.Id = 'f'.repeat(64);
  unexpected.Name = '/gw-01-extra';
  Object.assign(unexpected.NetworkSettings, { Networks: {} });
  f.containers.push(unexpected);
  await refuses(fenceGateways(f.layout, sha, f.runner));
  expect((await readdir(f.root)).filter((name) => name.endsWith('.json'))).toEqual([]);
});

test('inspection distinguishes interrupted marker, uncertain stop and corrupt orphan', async () => {
  const f = fixture();
  await writeFile(
    `${f.root}/dependency-gateway-fence.json`,
    '{"format":"dependency-gateway-fence","version":1}\n',
  );
  await refuses(inspectGatewayFence(f.layout, f.runner), 'interrupted');
  await Bun.file(`${f.root}/dependency-gateway-fence.json`).delete();
  f.setFault((args) => {
    if (args[0] === 'stop') throw new Error('stop interrupted');
  });
  await refuses(fenceGateways(f.layout, sha, f.runner));
  await refuses(inspectGatewayFence(f.layout, f.runner), 'uncertain');
  await Bun.file(`${f.root}/dependency-gateway-intent.json`).delete();
  await writeFile(`${f.root}/dependency-gateway-complete.json`, '{}');
  await refuses(inspectGatewayFence(f.layout, f.runner), 'corrupt');
});
