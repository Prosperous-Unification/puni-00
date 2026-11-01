import { rejects } from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { sourceFixture } from '../src/fixtures/source-dev';
import type { RunDocker } from '../src/lib/docker-deadline';
import { withDependencyOwner } from '../src/lib/edge-ownership';
import { envLayout, sourceDevContract } from '../src/lib/env';
import { readFields } from '../src/lib/managed-cohort';
import { decodeSourceDev } from '../src/lib/source-dev-cohort';
import { withSourceDevExcluded } from '../src/lib/source-dev-exclusion';
import { requireFixtureRefusal, summarizeFixtureFailure } from './fixture-failure';
import {
  bindStartedSource,
  createFixtureDocker,
  SOURCE_FIXTURE_OWNER,
} from './source-exclusion-transport';

async function fixture(substitute = false, startedBinding = false) {
  const token = 'c55155d0-ade9-4905-8c43-024b3f331acd';
  const root = scratchSync(`source-native-${token}-`);
  await writeFile(`${root}/edge.lock`, '');
  for (const directory of ['prod', 'dev', 'runtime']) await mkdir(`${root}/${directory}`);
  const layouts = {
    prod: { ...envLayout('prod'), root: `${root}/prod`, stateDir: `${root}/prod` },
    dev: {
      ...envLayout('dev'),
      root: `${root}/dev`,
      stateDir: `${root}/dev`,
      network: `dev-${token}`,
    },
  };
  const source = sourceFixture();
  const name = `source-${token}`,
    tag = `${name}:1`,
    runtime = `${root}/runtime`;
  source.Name = `/${name}`;
  source.Config.Image = tag;
  source.Path = '/usr/local/bin/docker-entrypoint.sh';
  source.Args = ['bun', 'run', 'dev'];
  Reflect.set(source.Config, 'Entrypoint', [source.Path]);
  Reflect.set(source.Config.Labels, SOURCE_FIXTURE_OWNER, token);
  Reflect.deleteProperty(source.HostConfig, 'Init');
  source.HostConfig.NetworkMode = layouts.dev.network;
  source.NetworkSettings.Networks = { [layouts.dev.network]: { NetworkID: 'c'.repeat(64) } };
  source.Mounts = sourceDevContract(layouts.dev).mounts.map((mount) => ({
    Type: 'bind',
    Source: mount.target === '/run/wbs-solver' ? runtime : mount.source,
    Destination: mount.target,
    RW: mount.writable,
  }));
  Reflect.set(source.HostConfig, 'OomKillDisable', null);
  const created = structuredClone(source);
  Reflect.set(created.HostConfig, 'OomKillDisable', false);
  created.State = {
    ...created.State,
    Running: false,
    Pid: 0,
    Status: 'created',
    StartedAt: '0001-01-01T00:00:00Z',
  };
  const expected = {
    name,
    id: source.Id,
    imageId: source.Image,
    imageRef: tag,
    token,
    network: layouts.dev.network,
    networkId: 'c'.repeat(64),
  };
  const binding = startedBinding ? bindStartedSource(created, source, expected) : undefined;
  const commands: string[][] = [];
  const run: RunDocker = (args) => {
    commands.push(args);
    if (args[0] === 'ps') return Promise.resolve(source.Id);
    if (args[0] === 'inspect') return Promise.resolve(JSON.stringify([source]));
    if (args[0] === 'image')
      return Promise.resolve(
        args.includes('--format')
          ? substitute
            ? 'sha256:' + 'f'.repeat(64)
            : source.Image
          : JSON.stringify([
              { Id: source.Image, Config: { Entrypoint: source.Config.Entrypoint } },
            ]),
      );
    if (args[0] === 'update') {
      source.HostConfig.RestartPolicy.Name = 'no';
      return Promise.resolve('');
    }
    if (args[0] === 'stop') {
      source.State = {
        ...source.State,
        Running: false,
        Pid: 0,
        Status: 'exited',
        FinishedAt: '2026-10-23T01:00:00Z',
      };
      return Promise.resolve('');
    }
    throw new Error('unexpected native source command');
  };
  const docker = createFixtureDocker({
    token,
    root,
    sourceName: name,
    sourceTag: tag,
    runtime,
    caddyName: `edge-${token}`,
    plans: [
      { name, id: source.Id, imageId: source.Image, imageRef: tag, validate: binding?.validate },
    ],
    run,
  });
  return { root, layouts, source, commands, docker, created, expected, binding };
}
test('native omitted Init and inherited entrypoint survive full transport and owner exclusion', async () => {
  const f = await fixture(false, true);
  let entered = false;
  await withDependencyOwner(
    { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
    async (owner) => {
      await withSourceDevExcluded(
        owner,
        f.layouts,
        'a'.repeat(40),
        f.docker,
        performance.now() + 5000,
        async () => {
          const inspected: unknown = JSON.parse(await f.docker(['inspect', f.source.Id]));
          if (!Array.isArray(inspected)) throw new Error('native inspection absent');
          const member = decodeSourceDev(inspected[0], f.layouts.dev);
          expect(Object.hasOwn(member.host, 'Init')).toBe(false);
          expect(member.path).toBe('/usr/local/bin/docker-entrypoint.sh');
          expect(readFields(readFields(inspected[0])['State'])['Pid']).toBe(0);
          entered = true;
        },
      );
    },
    f.root,
  );
  expect(entered).toBe(true);
});
test('native omitted Init reaches independent mutable-tag substitution refusal before effects', async () => {
  const f = await fixture(true, true);
  const diagnostic = await requireFixtureRefusal(
    'fixture-tag-negative',
    'source-tag-resolution',
    () =>
      withDependencyOwner(
        { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
        async (owner) => {
          await withSourceDevExcluded(
            owner,
            f.layouts,
            'a'.repeat(40),
            f.docker,
            performance.now() + 5000,
            () => {
              throw new Error('substitution entered protected interval');
            },
          );
        },
        f.root,
      ),
  );
  expect(diagnostic.chain[0]?.category).toBe('source-tag-resolution');
  expect(f.commands.some((args) => args[0] === 'update' || args[0] === 'stop')).toBe(false);
});
for (const init of [null, false, true])
  test(`native omitted Init refuses present-shape drift to ${String(init)}`, async () => {
    const f = await fixture();
    const entered = { value: false };
    await rejects(
      withDependencyOwner(
        { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
        async (owner) => {
          await withSourceDevExcluded(
            owner,
            f.layouts,
            'a'.repeat(40),
            f.docker,
            performance.now() + 5000,
            () => {
              entered.value = true;
              Reflect.set(f.source.HostConfig, 'Init', init);
              return Promise.resolve();
            },
          );
        },
        f.root,
      ),
      /source dev current exclusion/,
    );
    expect(entered.value).toBe(true);
  });

test('unexpected native host refusal keeps its tag-negative stage and safe category', async () => {
  const f = await fixture();
  f.source.HostConfig.PidMode = 'host';
  Reflect.set(f.source.Config, 'Env', ['PRIVATE_NATIVE_ENV']);
  await rejects(
    requireFixtureRefusal('fixture-tag-negative', 'source-tag-resolution', () =>
      withDependencyOwner(
        { sha: 'a'.repeat(40), layouts: [f.layouts.prod, f.layouts.dev] },
        async (owner) => {
          await withSourceDevExcluded(
            owner,
            f.layouts,
            'a'.repeat(40),
            f.docker,
            performance.now() + 5000,
            () => Promise.resolve(),
          );
        },
        f.root,
      ),
    ),
    (failure: unknown) => {
      const report = summarizeFixtureFailure(failure);
      expect(report.stage).toBe('fixture-tag-negative');
      expect(report.chain.some((entry) => entry.category === 'source-host-config')).toBe(true);
      expect(JSON.stringify(report)).not.toContain('PRIVATE_NATIVE_ENV');
      return true;
    },
  );
});

for (const change of ['false', 'true', 'absent', 'undefined'])
  test(`running binding refuses later OomKillDisable ${change} before effects`, async () => {
    const f = await fixture(true, true);
    if (change === 'absent') Reflect.deleteProperty(f.source.HostConfig, 'OomKillDisable');
    else
      Reflect.set(
        f.source.HostConfig,
        'OomKillDisable',
        change === 'undefined' ? undefined : change === 'true',
      );
    await rejects(
      f.docker(['ps', '-a', '--no-trunc', '--format', '{{.ID}}']),
      /source physical coordinates changed/,
    );
    expect(
      f.commands.some((args) => args[0] === 'image' || args[0] === 'update' || args[0] === 'stop'),
    ).toBe(false);
  });

test('created empty network ID binds only to the captured first-running ID', async () => {
  const f = await fixture();
  const networks = readFields(readFields(f.created)['NetworkSettings']);
  readFields(readFields(networks['Networks'])[f.expected.network])['NetworkID'] = '';
  const binding = bindStartedSource(f.created, f.source, f.expected);
  binding.validate(f.source);
  expect(binding.receipt.transition).toBe('false-to-null');
});

test('started binding accepts exact unchanged native OomKillDisable shapes without mutation', async () => {
  const f = await fixture();
  for (const value of [false, null, true, 'absent']) {
    const created = structuredClone(f.created),
      started = structuredClone(f.source);
    if (value === 'absent') {
      Reflect.deleteProperty(created.HostConfig, 'OomKillDisable');
      Reflect.deleteProperty(started.HostConfig, 'OomKillDisable');
    } else {
      Reflect.set(created.HostConfig, 'OomKillDisable', value);
      Reflect.set(started.HostConfig, 'OomKillDisable', value);
    }
    const before = structuredClone([created, started]);
    const binding = bindStartedSource(created, started, f.expected);
    binding.validate(started);
    expect(binding.receipt.transition).toBe('unchanged');
    expect([created, started]).toEqual(before);
    expect(JSON.stringify(binding.receipt)).not.toContain('PRIVATE_');
  }
});

test('started binding preserves native mount fields while accepting array permutations', async () => {
  const f = await fixture();
  Reflect.set(f.created.Config, 'Env', ['PRIVATE_STARTUP_ENV']);
  Reflect.set(f.source.Config, 'Env', ['PRIVATE_STARTUP_ENV']);
  Reflect.set(f.created.Mounts[0], 'Propagation', 'rprivate');
  Reflect.set(f.source.Mounts[0], 'Propagation', 'rprivate');
  f.created.Mounts.reverse();
  const snapshots = structuredClone([f.created.Mounts, f.source.Mounts]);
  const binding = bindStartedSource(f.created, f.source, f.expected);
  expect(JSON.stringify(binding.receipt)).not.toContain('PRIVATE_STARTUP_ENV');
  f.source.Mounts.reverse();
  binding.validate(f.source);
  f.source.Mounts.reverse();
  expect([f.created.Mounts, f.source.Mounts]).toEqual(snapshots);
  Reflect.set(f.source.Mounts[0], 'Propagation', 'rshared');
  expect(() => {
    binding.validate(f.source);
  }).toThrow('source physical coordinates changed');
});

const startupFaults: Record<
  string,
  (created: Record<string, unknown>, started: Record<string, unknown>) => void
> = {
  duplicateTargets: (created, started) => {
    for (const container of [created, started]) {
      const mounts = container['Mounts'];
      if (!Array.isArray(mounts)) throw new Error('fixture mounts absent');
      readFields(mounts[0])['Destination'] = readFields(mounts[1])['Destination'];
    }
  },
  nativeHostField: (_created, started) => {
    readFields(started['HostConfig'])['ReadonlyRootfs'] = true;
  },
  nativeMountField: (_created, started) => {
    const mounts = started['Mounts'];
    if (!Array.isArray(mounts)) throw new Error('fixture mounts absent');
    readFields(mounts[0])['Propagation'] = 'rshared';
  },
  paused: (_created, started) => {
    readFields(started['State'])['Paused'] = true;
  },
  restarting: (_created, started) => {
    readFields(started['State'])['Restarting'] = true;
  },
  dead: (_created, started) => {
    readFields(started['State'])['Dead'] = true;
  },
  oomKilled: (_created, started) => {
    readFields(started['State'])['OOMKilled'] = true;
  },
  stateError: (_created, started) => {
    readFields(started['State'])['Error'] = 'PRIVATE_ERROR';
  },
  createdPid: (created) => {
    readFields(created['State'])['Pid'] = 100;
  },
  createdFinished: (created) => {
    readFields(created['State'])['FinishedAt'] = '2026-10-23T00:00:00Z';
  },
  capAdd: (created, started) => {
    readFields(created['HostConfig'])['CapAdd'] = ['SYS_ADMIN'];
    readFields(started['HostConfig'])['CapAdd'] = ['SYS_ADMIN'];
  },
  privileged: (created, started) => {
    readFields(created['HostConfig'])['Privileged'] = true;
    readFields(started['HostConfig'])['Privileged'] = true;
  },
  reverse: (created, started) => {
    readFields(created['HostConfig'])['OomKillDisable'] = null;
    readFields(started['HostConfig'])['OomKillDisable'] = false;
  },
  true: (_created, started) => {
    readFields(started['HostConfig'])['OomKillDisable'] = true;
  },
  missing: (_created, started) => {
    Reflect.deleteProperty(readFields(started['HostConfig']), 'OomKillDisable');
  },
  undefined: (_created, started) => {
    readFields(started['HostConfig'])['OomKillDisable'] = undefined;
  },
  missingToNull: (created) => {
    Reflect.deleteProperty(readFields(created['HostConfig']), 'OomKillDisable');
  },
  noOp: (_created, started) => {
    readFields(started['State'])['Running'] = false;
  },
  zeroPid: (_created, started) => {
    readFields(started['State'])['Pid'] = 0;
  },
  unstarted: (_created, started) => {
    readFields(started['State'])['StartedAt'] = '0001-01-01T00:00:00Z';
  },
  createdRunning: (created) => {
    readFields(created['State'])['Running'] = true;
  },
  createdStarted: (created) => {
    readFields(created['State'])['StartedAt'] = '2026-10-23T00:00:00Z';
  },
  restarted: (_created, started) => {
    started['RestartCount'] = 1;
  },
  restartPolicy: (_created, started) => {
    readFields(started['HostConfig'])['RestartPolicy'] = { Name: 'no', MaximumRetryCount: 0 };
  },
  config: (_created, started) => {
    readFields(started['Config'])['Env'] = ['PRIVATE_ENV'];
  },
  mount: (_created, started) => {
    started['Mounts'] = [];
  },
  image: (_created, started) => {
    started['Image'] = 'sha256:' + 'f'.repeat(64);
  },
  identity: (_created, started) => {
    started['Id'] = 'f'.repeat(64);
  },
  name: (_created, started) => {
    started['Name'] = '/PRIVATE_NAME';
  },
  path: (_created, started) => {
    started['Path'] = '/PRIVATE_EXEC';
  },
  arguments: (_created, started) => {
    started['Args'] = ['PRIVATE_ARGS'];
  },
  security: (created, started) => {
    readFields(created['HostConfig'])['PidMode'] = 'host';
    readFields(started['HostConfig'])['PidMode'] = 'host';
  },
  uid: (created, started) => {
    readFields(created['Config'])['User'] = '0:0';
    readFields(started['Config'])['User'] = '0:0';
  },
  owner: (created, started) => {
    readFields(readFields(created['Config'])['Labels'])[SOURCE_FIXTURE_OWNER] = 'foreign';
    readFields(readFields(started['Config'])['Labels'])[SOURCE_FIXTURE_OWNER] = 'foreign';
  },
  extraNetwork: (_created, started) => {
    readFields(readFields(started['NetworkSettings'])['Networks'])['foreign'] = {
      NetworkID: 'f'.repeat(64),
    };
  },
  createdNetworkId: (created) => {
    const network = readFields(readFields(created['NetworkSettings'])['Networks']);
    for (const key of Object.keys(network)) readFields(network[key])['NetworkID'] = 'f'.repeat(64);
  },
  absentCreatedNetworkId: (created) => {
    const network = readFields(readFields(created['NetworkSettings'])['Networks']);
    for (const key of Object.keys(network))
      Reflect.deleteProperty(readFields(network[key]), 'NetworkID');
  },
  networkId: (_created, started) => {
    const network = readFields(readFields(started['NetworkSettings'])['Networks']);
    for (const key of Object.keys(network)) readFields(network[key])['NetworkID'] = 'f'.repeat(64);
  },
};
for (const [fault, mutate] of Object.entries(startupFaults))
  test(`started source refuses ${fault} before installing a baseline`, async () => {
    const f = await fixture();
    mutate(f.created, f.source);
    expect(() => bindStartedSource(f.created, f.source, f.expected)).toThrow();
    expect(f.commands).toEqual([]);
  });
