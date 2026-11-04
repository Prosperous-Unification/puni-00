import { expect, it } from 'bun:test';

import { createRegistryIndexReaders } from './registry-index-authority.fixture';
import { assertConsumerUniverse } from './registry-journal';
import { parseReaderConfiguration, verifyDockerSourceCoverage } from './registry-reader';

const primary = () =>
  parseReaderConfiguration({
    schemaVersion: 1,
    protocol: 'registry-consumer/2',
    registryId: 'native-registry',
    id: 'fixture-host',
    kind: 'docker-host',
    source: '/etc/puni/registry-fixture-reader.json',
    role: 'consumer',
    artifact: {
      path: '/usr/local/libexec/puni-registry-maintenance/consumer.js',
      sha256: 'a'.repeat(64),
    },
    input: {
      registryId: 'native-registry',
      registryUrl: 'http://127.0.0.1:5051',
      docker: {
        path: '/usr/local/libexec/puni-registry-maintenance/synthetic-docker',
        sha256: 'b'.repeat(64),
      },
      host: {
        machineId: 'c'.repeat(32),
        catalog: { path: '/etc/puni/registry-fixture-catalog.json', sha256: 'd'.repeat(64) },
      },
    },
  });
const validate = (readers: ReturnType<typeof createRegistryIndexReaders>) => {
  assertConsumerUniverse(
    { schemaVersion: 1, registryId: 'native-registry', sources: readers.sources },
    readers.sources,
    'native-registry',
  );
  verifyDockerSourceCoverage(
    readers.sources,
    new Map(readers.configurations.map((configuration) => [configuration.id, configuration])),
    'native-registry',
  );
};
it('constructs distinct global host, environment consumer and history accepted by real validators', () => {
  const readers = createRegistryIndexReaders(primary());
  expect(() => {
    validate(readers);
  }).not.toThrow();
  expect(readers.sources).toHaveLength(3);
  const host = readers.sources.find((source) => source.kind === 'docker-host');
  const scoped = readers.sources.find(
    (source) => source.kind === 'compose' && source.role === 'consumer',
  );
  expect(host?.environment).toBeNull();
  expect(scoped?.environment).toBe('native-index');
  expect(scoped?.hostSourceId).toBe(host?.id);
  expect(readers.sources.filter((source) => source.role === 'history')).toHaveLength(1);
});
it('production universe refuses the former environment-bound global host', () => {
  const readers = createRegistryIndexReaders(primary());
  const host = readers.sources.find((source) => source.kind === 'docker-host');
  if (host === undefined) throw new Error('Missing fixture host');
  host.environment = 'native-index';
  expect(() => {
    validate(readers);
  }).toThrow('Registered consumer universe differs');
});
it('production coverage refuses an independent host/catalog substitution', () => {
  const readers = createRegistryIndexReaders(primary());
  const scoped = readers.configurations.find(
    (configuration) => configuration.kind === 'compose' && configuration.role === 'consumer',
  );
  if (scoped === undefined) throw new Error('Missing scoped fixture consumer');
  // The controlled test changes only this modeled external reader input.
  scoped.input = {
    ...(scoped.input as Record<string, unknown>),
    host: {
      machineId: 'e'.repeat(32),
      catalog: { path: '/etc/puni/registry-fixture-catalog.json', sha256: 'd'.repeat(64) },
    },
  };
  expect(() => {
    validate(readers);
  }).toThrow('matching complete Docker host coverage');
});
