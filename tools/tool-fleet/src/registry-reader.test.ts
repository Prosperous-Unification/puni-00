import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { collectRegistryConsumers, runRegistryReader } from './registry-reader';

it('executes exact pinned reader bytes and binds its report to the configured source and revision', async () => {
  const directory = await scratchAsync('registry-reader-');
  const path = join(directory, 'reader.ts');
  const source = `const request = await Bun.stdin.json(); console.log(JSON.stringify({protocol:request.protocol,registryId:request.registryId, id:request.id, source:request.source,role:request.role, revision:request.revision, sourceRevision:'actual-source-revision', references:[]}));`;
  await writeFile(path, source);
  const configuration = {
    schemaVersion: 1 as const,
    protocol: 'registry-consumer/2' as const,
    registryId: 'proof',
    id: 'workloads',
    role: 'consumer',
    kind: 'kubernetes' as const,
    source: '/trusted/workloads.json',
    artifact: { path, sha256: createHash('sha256').update(source).digest('hex') },
    input: { namespace: 'prod' },
  };
  const report = await runRegistryReader(configuration, 7);
  expect(report.revision).toBe(7);
  expect(report.sourceRevision).toBe('actual-source-revision');
  await writeFile(path, source + '\n// changed artifact');
  const refusal = await runRegistryReader(configuration, 7).then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(String(refusal)).toContain('artifact');
});

it('rejects missing artifacts and protocol/source substitutions from a real reader process', async () => {
  const directory = await scratchAsync('registry-reader-refusal-');
  const path = join(directory, 'reader.ts');
  const configuration = {
    schemaVersion: 1,
    protocol: 'registry-consumer/2',
    registryId: 'proof',
    id: 'workloads',
    role: 'consumer',
    kind: 'kubernetes',
    source: '/trusted/workloads.json',
    artifact: { path, sha256: 'a'.repeat(64) },
    input: {},
  };
  const missing = await runRegistryReader(configuration, 7).then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(String(missing)).toContain('ENOENT');
  for (const substitution of [
    "protocol:'foreign/1'",
    "source:'/foreign/source'",
    "registryId:'foreign'",
    "id:'foreign'",
    'revision:6',
    "sourceRevision:''",
  ]) {
    const source = `const request=await Bun.stdin.json();console.log(JSON.stringify({protocol:request.protocol,registryId:request.registryId,id:request.id,source:request.source,role:request.role,revision:request.revision,sourceRevision:'actual',references:[],${substitution}}));`;
    await writeFile(path, source);
    configuration.artifact.sha256 = createHash('sha256').update(source).digest('hex');
    const refusal = await runRegistryReader(configuration, 7).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(String(refusal)).toContain('report identity or protocol');
  }
});

it('kills and reaps readers that exceed the bounded output contract', async () => {
  const directory = await scratchAsync('registry-reader-bound-');
  const path = join(directory, 'reader.ts');
  const pidPath = join(directory, 'pid');
  const survivedPath = join(directory, 'survived');
  const source = `const request=await Bun.stdin.json();await Bun.write(request.input.pidPath,String(process.pid));process.stdout.write('x'.repeat(5*1024*1024));await Bun.sleep(100);await Bun.write(request.input.survivedPath,'survived');`;
  await writeFile(path, source);
  const configuration = {
    schemaVersion: 1,
    protocol: 'registry-consumer/2',
    registryId: 'proof',
    id: 'workloads',
    role: 'consumer',
    kind: 'kubernetes',
    source: '/trusted/workloads.json',
    artifact: { path, sha256: createHash('sha256').update(source).digest('hex') },
    input: { pidPath, survivedPath },
  };
  const refusal = await runRegistryReader(configuration, 7).then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(String(refusal)).toContain('exceeds 4194304 bytes');
  const pid = Number(await Bun.file(pidPath).text());
  expect(() => process.kill(pid, 0)).toThrow();
  expect(await Bun.file(survivedPath).exists()).toBe(false);
});

it('pins the complete installed reader configuration rather than trusting its source pathname', async () => {
  const directory = await scratchAsync('registry-reader-config-');
  const path = join(directory, 'reader.js');
  const bytes = `const request=await Bun.stdin.json();console.log(JSON.stringify({...request,input:undefined,sourceRevision:'actual',references:[]}));`;
  await writeFile(path, bytes);
  const configuration = {
    schemaVersion: 1,
    protocol: 'registry-consumer/2',
    registryId: 'proof',
    id: 'solver',
    kind: 'solver',
    role: 'consumer',
    source: '/trusted/solver.json',
    artifact: { path, sha256: createHash('sha256').update(bytes).digest('hex') },
    input: { path: '/source/supervisor.json' },
  };
  const sources = [
    {
      id: 'solver',
      owner: 'deploy',
      environment: 'prod',
      kind: 'solver' as const,
      role: 'consumer' as const,
      source: configuration.source,
      configurationSha256: createHash('sha256').update(JSON.stringify(configuration)).digest('hex'),
    },
  ];
  const collected = await collectRegistryConsumers(sources, 9, 'proof', () =>
    Promise.resolve().then(() => configuration),
  );
  expect(collected[0].sourceRevision).toBe('actual');
  const changed = { ...configuration, input: { path: '/foreign/supervisor.json' } };
  expect(
    await collectRegistryConsumers(sources, 9, 'proof', () =>
      Promise.resolve().then(() => changed),
    ).then(
      () => false,
      () => true,
    ),
  ).toBe(true);
});

it('cancels the whole overflowing reader process group before a descendant can mutate its source', async () => {
  const directory = await scratchAsync('registry-reader-descendant-');
  const path = join(directory, 'reader.js');
  const survived = join(directory, 'survived');
  const source = `const request=await Bun.stdin.json();const descendant=Bun.spawn([process.execPath,'-e',"process.stdout.write('ready');await Bun.sleep(250);await Bun.write("+JSON.stringify(request.input.survived)+",'escaped');"],{stdout:'pipe',stderr:'pipe'});const reader=descendant.stdout.getReader();await reader.read();reader.releaseLock();process.stdout.write('x'.repeat(5*1024*1024));await Bun.sleep(300);`;
  await writeFile(path, source);
  const configuration = {
    schemaVersion: 1,
    protocol: 'registry-consumer/2',
    registryId: 'proof',
    id: 'source',
    kind: 'solver',
    role: 'consumer',
    source: '/trusted/reader.json',
    artifact: { path, sha256: createHash('sha256').update(source).digest('hex') },
    input: { survived },
  };
  const refused = await runRegistryReader(configuration, 1).then(
    () => false,
    () => true,
  );
  expect(refused).toBe(true);
  await Bun.sleep(350);
  expect(await Bun.file(survived).exists()).toBe(false);
});

it('remote source dispatch requires the configured source and exact authority-pinned configuration', async () => {
  const { executeReaderHost } = await import('./registry-reader-host');
  const request = {
    protocol: 'registry-reader-host/1',
    registryId: 'proof',
    id: 'private',
    source: '/etc/puni/private-reader.json',
    revision: 9,
    configurationSha256: 'a'.repeat(64),
    dispatcherSha256: 'b'.repeat(64),
  };
  await expectRejection(
    executeReaderHost(request, {
      read: () => Promise.resolve({ schemaVersion: 1, readers: [] }),
      identity: () => Promise.resolve('b'.repeat(64)),
    }),
    'source',
  );
  await expectRejection(
    executeReaderHost(
      { ...request, dispatcherSha256: 'c'.repeat(64) },
      {
        read: () => Promise.resolve({ schemaVersion: 1, readers: [] }),
        identity: () => Promise.resolve('b'.repeat(64)),
      },
    ),
    'dispatcher',
  );
});

it('dispatches only exact installed remote source bytes through the real pinned reader', async () => {
  const { executeReaderHost } = await import('./registry-reader-host');
  const directory = await scratchAsync('registry-host-');
  const path = join(directory, 'reader.js');
  const source = `const request=await Bun.stdin.json();console.log(JSON.stringify({protocol:request.protocol,registryId:request.registryId,id:request.id,source:request.source,role:request.role,revision:request.revision,sourceRevision:'observed',references:[]}));`;
  await writeFile(path, source);
  const configuration = {
    schemaVersion: 1,
    protocol: 'registry-consumer/2',
    registryId: 'proof',
    id: 'private',
    kind: 'private-product',
    source: '/etc/puni/private-reader.json',
    role: 'consumer',
    artifact: { path, sha256: createHash('sha256').update(source).digest('hex') },
    input: {},
    transport: { kind: 'ssh', host: 'product.test', dispatcherSha256: 'b'.repeat(64) },
  };
  const request = {
    protocol: 'registry-reader-host/1',
    registryId: 'proof',
    id: 'private',
    source: configuration.source,
    revision: 9,
    configurationSha256: createHash('sha256').update(JSON.stringify(configuration)).digest('hex'),
    dispatcherSha256: 'b'.repeat(64),
  };
  const ports = {
    read: () => Promise.resolve({ schemaVersion: 1, readers: [configuration] }),
    identity: () => Promise.resolve('b'.repeat(64)),
  };
  expect((await executeReaderHost(request, ports)).sourceRevision).toBe('observed');
  await expectRejection(
    executeReaderHost({ ...request, configurationSha256: 'c'.repeat(64) }, ports),
    'configuration',
  );
  await expectRejection(executeReaderHost({ ...request, source: '/foreign' }, ports), 'source');
  await expectRejection(
    executeReaderHost(request, {
      ...ports,
      read: () => Promise.reject(new Error('unreadable catalog')),
    }),
    'unreadable',
  );
  await writeFile(path, source + '// altered');
  await expectRejection(executeReaderHost(request, ports), 'digest');
});

import { assertConsumerUniverse, type RegistryConsumer } from './registry-managed-journal';
import { verifyDockerSourceCoverage } from './registry-reader';
it('requires exact registered global host coverage for each environment Compose source', () => {
  const host = {
    machineId: 'a'.repeat(32),
    catalog: { path: '/installed/ownership.json', sha256: 'b'.repeat(64) },
  };
  const docker = { path: '/usr/bin/docker', sha256: 'c'.repeat(64) };
  const sources: RegistryConsumer[] = [
    {
      id: 'host',
      owner: 'host-owner',
      environment: null,
      kind: 'docker-host',
      source: '/installed/host.json',
      configurationSha256: 'd'.repeat(64),
      role: 'consumer',
    },
    {
      id: 'compose',
      owner: 'operator',
      environment: 'prod',
      kind: 'compose',
      hostSourceId: 'host',
      source: '/installed/compose.json',
      configurationSha256: 'e'.repeat(64),
      role: 'consumer',
    },
  ];
  const configurations = new Map(
    sources.map((source) => [
      source.id,
      {
        schemaVersion: 1 as const,
        protocol: 'registry-consumer/2' as const,
        registryId: 'proof',
        id: source.id,
        kind: source.kind,
        role: 'consumer' as const,
        source: source.source,
        artifact: { path: '/installed/reader.js', sha256: 'f'.repeat(64) },
        input:
          source.kind === 'docker-host'
            ? { registryId: 'proof', registryUrl: 'https://registry.test', docker, host }
            : {
                root: '/environment',
                scope: {
                  registryId: 'proof',
                  owner: 'operator',
                  product: 'wbs',
                  environment: 'prod',
                  target: 'compose:/environment',
                },
                registryUrl: 'https://registry.test',
                docker,
                host,
              },
      },
    ]),
  );
  expect(() => {
    assertConsumerUniverse({ schemaVersion: 1, registryId: 'proof', sources }, sources, 'proof');
  }).not.toThrow();
  expect(() => {
    verifyDockerSourceCoverage(sources, configurations, 'proof');
  }).not.toThrow();
  for (const fault of [
    'missing',
    'kind',
    'role',
    'environment',
    'catalog',
    'machine',
    'docker',
    'transport',
  ]) {
    const changed = structuredClone(sources);
    const configured = structuredClone(configurations);
    if (fault === 'missing') changed.shift();
    if (fault === 'kind') changed[0].kind = 'kubernetes';
    if (fault === 'role') changed[0].role = 'history';
    if (fault === 'environment') changed[0].environment = 'other';
    const candidate = configured.get('host')!;
    if (fault === 'catalog')
      candidate.input = {
        ...candidate.input,
        host: { ...host, catalog: { ...host.catalog, sha256: '0'.repeat(64) } },
      };
    if (fault === 'machine')
      candidate.input = { ...candidate.input, host: { ...host, machineId: '0'.repeat(32) } };
    if (fault === 'docker')
      candidate.input = { ...candidate.input, docker: { ...docker, sha256: '0'.repeat(64) } };
    if (fault === 'transport')
      Object.assign(candidate, {
        transport: { kind: 'ssh', host: 'foreign', dispatcherSha256: '0'.repeat(64) },
      });
    expect(() => {
      verifyDockerSourceCoverage(changed, configured, 'proof');
    }).toThrow();
  }
  expect(() => {
    assertConsumerUniverse(
      { schemaVersion: 1, registryId: 'proof', sources: sources.slice(1) },
      sources.slice(1),
      'proof',
    );
  }).toThrow('Docker host');
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
