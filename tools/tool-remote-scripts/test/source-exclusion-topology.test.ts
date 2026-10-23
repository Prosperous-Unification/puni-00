import { lstat, mkdir, writeFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { sourceFixture } from '../src/fixtures/source-dev';
import { auditUnmanagedMounts, auditUnmanagedMountsUnderOwner } from '../src/lib/backend-cohort';
import type { RunDocker } from '../src/lib/docker-deadline';
import { withDependencyOwner } from '../src/lib/edge-ownership';
import { envLayout, sourceDevContract } from '../src/lib/env';
import { inspectManagedCohort } from '../src/lib/managed-cohort';
import { withSourceDevExcluded } from '../src/lib/source-dev-exclusion';
import { requireFixtureRefusal } from './fixture-failure';
import { renderManagedParticipant, renderSourceTopology } from './source-exclusion-topology';

async function fixture() {
  const root = scratchSync('source-topology-');
  for (const name of ['prod', 'dev', 'prod/db']) await mkdir(`${root}/${name}`);
  await writeFile(`${root}/prod/db/wbs.db`, 'fixture database identity');
  const layouts = renderSourceTopology(root, 'token', {
    prod: { ...envLayout('prod'), root: `${root}/prod`, stateDir: `${root}/prod` },
    dev: { ...envLayout('dev'), root: `${root}/dev`, stateDir: `${root}/dev` },
  });
  const source = sourceFixture();
  source.HostConfig.NetworkMode = layouts.dev.network;
  source.NetworkSettings.Networks = { [layouts.dev.network]: { NetworkID: 'c'.repeat(64) } };
  source.Mounts = sourceDevContract(layouts.dev).mounts.map((mount) => ({
    Type: 'bind',
    Source: mount.source,
    Destination: mount.target,
    RW: mount.writable,
  }));
  function materialize(tier: 'be' | 'gw', id: string) {
    const command = renderManagedParticipant(tier, layouts.prod, 'token');
    const native = structuredClone(source);
    native.Id = id;
    native.Name = `/${command.name}`;
    native.Config.Image = `registry.test/wbs-${tier}-01@sha256:${'d'.repeat(64)}`;
    native.Config.Labels = {
      'com.docker.compose.service': command.name,
      'com.docker.compose.project': 'fixture',
    };
    const network = command.args.at(command.args.indexOf('--network') + 1);
    if (network === undefined) throw new Error('rendered network absent');
    native.HostConfig.NetworkMode = network;
    native.HostConfig.Init = true;
    native.NetworkSettings.Networks = { [network]: { NetworkID: 'c'.repeat(64) } };
    native.Mounts = command.args.flatMap((argument, index) => {
      if (argument !== '--mount') return [];
      const declaration = command.args.at(index + 1);
      if (declaration === undefined) throw new Error('rendered mount absent');
      const fields = new Map(
        declaration.split(',').map((field) => {
          const [key, value] = field.split('=');
          return [key, value];
        }),
      );
      const source = fields.get('src'),
        target = fields.get('dst');
      if (source === undefined || target === undefined) throw new Error('rendered mount malformed');
      return [{ Type: 'bind', Source: source, Destination: target, RW: true }];
    });
    return native;
  }
  const be = materialize('be', 'e'.repeat(64));
  const gw = materialize('gw', 'f'.repeat(64));
  gw.State = {
    ...gw.State,
    Running: false,
    Pid: 0,
    Status: 'exited',
    FinishedAt: '2026-10-23T01:00:00Z',
  };
  const inventory = [source, be, gw];
  const docker: RunDocker = (args) => {
    if (args[0] === 'ps') return Promise.resolve(inventory.map((member) => member.Id).join('\n'));
    if (args[0] === 'inspect') return Promise.resolve(JSON.stringify(inventory));
    if (args[0] === 'image')
      return Promise.resolve(
        args.includes('--format')
          ? source.Image
          : JSON.stringify([{ Id: source.Image, Config: { Entrypoint: null } }]),
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
    throw new Error('unexpected topology proof command');
  };
  const main = await lstat(`${root}/prod/db/wbs.db`, { bigint: true }),
    directory = await lstat(`${root}/prod/db`, { bigint: true });
  const database = {
    path: '/data/wbs.db',
    host: `${root}/prod/db/wbs.db`,
    fileIdentity: `${String(main.dev)}:${String(main.ino)}`,
    directoryIdentity: `${String(directory.dev)}:${String(directory.ino)}`,
  };
  return { root, layouts, source, be, gw, inventory, docker, database };
}
test('rendered physical topology reaches whole-source owner recognition and complete backend audit', async () => {
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
        async (source) => {
          const cohort = await inspectManagedCohort(
            f.layouts.prod,
            f.docker,
            performance.now() + 5000,
            'be',
          );
          await auditUnmanagedMountsUnderOwner(
            owner,
            f.layouts.prod,
            source,
            f.inventory,
            cohort,
            f.database,
            f.be.Config.Image,
            f.docker,
            performance.now() + 5000,
            () => {
              throw new Error('mount-free gateway reached namespace scanner');
            },
          );
          entered = true;
        },
      );
    },
    f.root,
  );
  expect(entered).toBe(true);
});
test('rendered stopped gateway remains admissible in strict ordinary unmanaged mount audit', async () => {
  const f = await fixture();
  await auditUnmanagedMounts(
    [f.gw],
    { blue: null, green: null },
    f.database,
    f.be.Config.Image,
    f.docker,
    performance.now() + 5000,
    () => {
      throw new Error('mount-free gateway reached namespace scanner');
    },
  );
  expect(f.gw.State.Running).toBe(false);
});

test('strict ordinary stopped namespace refusal retains its closed fixture category', async () => {
  const f = await fixture();
  await mkdir(`${f.root}/opaque`);
  f.gw.Mounts = [{ Type: 'bind', Source: `${f.root}/opaque`, Destination: '/opaque', RW: true }];
  const diagnostic = await requireFixtureRefusal(
    'fixture-protected-callback',
    'unrelated-namespace',
    () =>
      auditUnmanagedMounts(
        [f.gw],
        { blue: null, green: null },
        f.database,
        f.be.Config.Image,
        f.docker,
        performance.now() + 5000,
      ),
  );
  expect(diagnostic.chain[0]?.category).toBe('unrelated-namespace');
});
