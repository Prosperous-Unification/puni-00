import { rejects } from 'node:assert/strict';
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
import { createFixtureDocker, SOURCE_FIXTURE_OWNER } from './source-exclusion-transport';

async function fixture(substitute = false) {
  const token = 'c55155d0-ade9-4905-8c43-024b3f331acd';
  const root = scratchSync(`source-native-${token}-`);
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
    plans: [{ name, id: source.Id, imageId: source.Image, imageRef: tag }],
    run,
  });
  return { root, layouts, source, commands, docker };
}
test('native omitted Init and inherited entrypoint survive full transport and owner exclusion', async () => {
  const f = await fixture();
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
  const f = await fixture(true);
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
