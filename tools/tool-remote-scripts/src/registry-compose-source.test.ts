import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { readComposeSource } from './registry-compose-source';

it('reads actual Compose files and pinned CLI inventory including stopped and separately named consumers', async () => {
  const root = scratchSync('compose-source-');
  try {
    mkdirSync(join(root, 'compose'));
    mkdirSync(join(root, 'state'));
    writeFileSync(join(root, 'base.yml'), 'services: {}\n');
    const digest = `sha256:${'a'.repeat(64)}`;
    const desired = join(root, 'compose', 'be-01-green.yml');
    writeFileSync(
      desired,
      `services:\n  be-01-green:\n    image: registry.test/desired@${digest}\n`,
    );
    const routing = {
      apps: {
        http: {
          servers: {
            srv0: {
              routes: [
                {
                  match: [{ host: ['wbs.test'] }],
                  handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'be-01-blue:3100' }] }],
                },
              ],
            },
          },
        },
      },
    };
    const labels = {
      'com.docker.compose.project': 'fixture',
      'com.docker.compose.project.working_dir': root,
    };
    const containers = [
      {
        labels: { ...labels, 'com.docker.compose.service': 'be-01-blue' },
        name: '/be-01-blue',
        image: `registry.test/current@${digest}`,
        running: true,
        health: 'running',
      },
      {
        labels: { ...labels, 'com.docker.compose.service': 'be-01-green' },
        name: '/be-01-green',
        image: `registry.test/idle@${digest}`,
        running: false,
        health: 'absent',
      },
      {
        labels: { ...labels, 'com.docker.compose.service': 'retained-recovery' },
        name: '/retained-recovery',
        image: `registry.test/recovery@${digest}`,
        running: false,
        health: 'absent',
      },
    ];
    const script = `#!/usr/bin/python3\nimport sys,json\ncontainers=json.loads(${JSON.stringify(JSON.stringify(containers))})\nif sys.argv[1]=='ps':print('\\n'.join(c['name'][1:] for c in containers))\nelif sys.argv[1]=='exec':print(${JSON.stringify(JSON.stringify(routing))})\nelif sys.argv[1]=='inspect':print(json.dumps(next(c for c in containers if c['name']=='/'+sys.argv[-1])))\nelse:sys.exit(22)\n`;
    const executable = join(root, 'docker-proof');
    writeFileSync(executable, script, { mode: 0o700 });
    const machineId = readFileSync('/etc/machine-id', 'utf8').trim();
    const catalog = {
      schemaVersion: 1,
      registryId: 'proof',
      machineId,
      environments: [
        {
          owner: 'operator',
          product: 'wbs',
          environment: 'prod',
          target: `compose:${root}`,
          root,
          prefix: '',
          project: 'fixture',
          containers: [
            ...['be', 'gw', 'fe'].flatMap((tier) =>
              ['blue', 'green'].map((color) => ({
                name: `${tier}-01-${color}`,
                service: `${tier}-01-${color}`,
              })),
            ),
            { name: 'retained-recovery', service: 'retained-recovery' },
          ],
        },
      ],
    };
    const read = () => Promise.resolve(catalog);
    const configuration = {
      scope: {
        registryId: 'proof',
        owner: 'operator',
        product: 'wbs',
        environment: 'prod',
        target: `compose:${root}`,
      },
      host: {
        machineId,
        catalog: {
          path: join(root, 'ownership.json'),
          sha256: createHash('sha256').update(JSON.stringify(catalog)).digest('hex'),
        },
      },
      root,
      prefix: '',
      siteAddress: 'wbs.test',
      edgeContainer: 'edge',
      registryUrl: 'https://registry.test',
      docker: { path: executable, sha256: createHash('sha256').update(script).digest('hex') },
    };
    const observed = await readComposeSource(configuration, read);
    expect(observed.references.map((reference) => reference.repository).sort()).toEqual([
      'current',
      'desired',
      'idle',
      'recovery',
    ]);
    expect(observed.active.be).toBe(`registry.test/current@${digest}`);
    expect(observed.running.be).toBe(true);
    writeFileSync(
      desired,
      `services:\n  hidden:\n    build: ./hidden\n    image: registry.test/hidden@${digest}\n`,
    );
    await expectRejection(readComposeSource(configuration, read), 'Unknown');
    rmSync(join(root, 'base.yml'));
    await expectRejection(readComposeSource(configuration, read));
    await expectRejection(
      readComposeSource(
        { ...configuration, docker: { ...configuration.docker, sha256: '0'.repeat(64) } },
        read,
      ),
      'digest',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

import { dockerOwnershipFixture } from './registry-docker.fixture';
import { scanDockerConsumers } from './registry-docker-consumers';
it('separates same-host genesis and stopped/active consumers while retaining complete global coverage', async () => {
  const fixture = await dockerOwnershipFixture();
  const digest = `sha256:${'a'.repeat(64)}`;
  const shared = `registry.test/wbs-be-01@${digest}`;
  const stopped = `registry.test/wbs-gw-01@${digest}`;
  const a = fixture.container('a', 'be', 'blue', shared, true);
  await fixture.set([a]);
  const second = await readComposeSource(fixture.source('b'), fixture.read);
  expect(second.references).toEqual([]);
  expect(second.hasReleaseEvidence).toBe(false);
  const b = fixture.container('b', 'be', 'blue', shared, true);
  const idle = fixture.container('b', 'gw', 'green', stopped, false);
  await fixture.set([b, idle]);
  expect((await readComposeSource(fixture.source('a'), fixture.read)).references).toEqual([]);
  expect((await readComposeSource(fixture.source('b'), fixture.read)).active.be).toBe(shared);
  expect(
    (await readComposeSource(fixture.source('b'), fixture.read)).references
      .map((reference) => reference.repository)
      .sort(),
  ).toEqual(['wbs-be-01', 'wbs-gw-01']);
  expect(
    (await scanDockerConsumers(fixture.global, fixture.read)).references
      .map((reference) => reference.repository)
      .sort(),
  ).toEqual(['wbs-be-01', 'wbs-gw-01']);
  for (const fault of ['unknown', 'labels', 'root', 'machine', 'mapping']) {
    await fixture.set(
      fault === 'unknown'
        ? [{ ...b, name: '/unregistered' }]
        : fault === 'labels'
          ? [{ ...b, labels: { ...b.labels, 'com.docker.compose.project': 'foreign' } }]
          : fault === 'root'
            ? [
                {
                  ...b,
                  labels: {
                    ...b.labels,
                    'com.docker.compose.project.working_dir': fixture.source('a').root,
                  },
                },
              ]
            : [b],
    );
    const configuration =
      fault === 'machine'
        ? { ...fixture.global, host: { ...fixture.host, machineId: '0'.repeat(32) } }
        : fixture.global;
    await expectRejection(
      scanDockerConsumers(
        configuration,
        fault === 'mapping'
          ? () => Promise.reject(new Error('unreadable ownership'))
          : fixture.read,
      ),
    );
  }
});

async function expectRejection(
  promise: Promise<unknown>,
  expected?: string | RegExp,
): Promise<void> {
  const refusal = await promise.then(
    () => {
      throw new Error('Expected refusal');
    },
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
  if (expected !== undefined)
    expect(() => {
      throw refusal;
    }).toThrow(expected);
}

it('reads the checked-in prod and service-free dev bases while requiring tier services', async () => {
  const fixture = await dockerOwnershipFixture();
  for (const [name, template] of [
    ['b', 'base.dev.yml'],
    ['a', 'base.yml'],
  ]) {
    const configuration = fixture.source(name);
    const base = readFileSync(
      new URL(`../../../deploy/compose/${template}`, import.meta.url),
      'utf8',
    );
    writeFileSync(join(configuration.root, 'base.yml'), base);
    const desired = join(configuration.root, 'compose/be-01-green.yml');
    const image = `registry.test/wbs-be-01@sha256:${'a'.repeat(64)}`;
    writeFileSync(desired, `services:\n  be-01-green:\n    image: ${image}\n`);
    expect((await readComposeSource(configuration, fixture.read)).references).toEqual([
      { repository: 'wbs-be-01', digest: `sha256:${'a'.repeat(64)}` },
    ]);
    for (const invalid of [
      'name: empty-tier\n',
      'services: null\n',
      'services: []\n',
      'services:\n  hidden:\n    build: ./hidden\n',
    ]) {
      writeFileSync(desired, invalid);
      await expectRejection(readComposeSource(configuration, fixture.read));
    }
    writeFileSync(desired, 'services: {}\n');
    writeFileSync(join(configuration.root, 'base.yml'), base + '\ninclude: ./hidden.yml\n');
    await expectRejection(readComposeSource(configuration, fixture.read), 'Unsupported');
  }
});

it('refuses malformed ownership in actual tier files instead of stripping it through legacy state', async () => {
  const fixture = await dockerOwnershipFixture();
  const configuration = fixture.source('a');
  writeFileSync(
    join(configuration.root, 'state', 'be.json'),
    JSON.stringify({
      tier: 'be',
      activeColor: 'blue',
      lastDeployedSha: null,
      registry: { schemaVersion: 1, history: null, operation: null },
    }),
  );
  await expectRejection(readComposeSource(configuration, fixture.read), 'ownership');
});
