import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';

import { type } from 'arktype';

import { readTrustedEnrollment } from './registry-enrollment';
import {
  parseReaderConfiguration,
  type RegistryReaderConfiguration,
  type RegistryReaderReport,
  runRegistryReader,
} from './registry-reader';
import { readRegistrySource } from './registry-source';
import { readRegistryBytes } from './registry-stream';

const Request = type({
  protocol: "'registry-reader-host/1'",
  registryId: '0 < string <= 256',
  id: '0 < string <= 256',
  source: type('0 < string <= 256').narrow(isAbsolute),
  revision: 'number.safe >= 0',
  configurationSha256: /^[0-9a-f]{64}$/,
  dispatcherSha256: /^[0-9a-f]{64}$/,
  '+': 'reject',
});
const Catalog = type({ schemaVersion: '1', readers: 'unknown[]', '+': 'reject' });
interface HostPorts {
  read: () => Promise<unknown>;
  identity: () => Promise<string>;
  run?: (
    configuration: RegistryReaderConfiguration,
    revision: number,
    signal?: AbortSignal,
  ) => Promise<RegistryReaderReport>;
}
const native: HostPorts = {
  read: () => readTrustedEnrollment('/etc/puni/registry-readers.json'),
  identity: async () =>
    createHash('sha256')
      .update((await readRegistrySource(Bun.main, 8 * 1024 ** 2)).bytes)
      .digest('hex'),
};
/**
 * Fixed SSH dispatcher: the authority can select only an installed source, never supply executable
 * or source input. Both ends pin the complete configuration. Install with a forced-command SSH
 * account and explicit source-read access; the authority's UID need not read product-host files.
 */
export async function executeReaderHost(
  input: unknown,
  ports: HostPorts = native,
  signal?: AbortSignal,
): Promise<RegistryReaderReport> {
  const request = Request(input);
  if (request instanceof type.errors)
    throw new Error('Malformed registry source dispatcher request');
  if ((await ports.identity()) !== request.dispatcherSha256)
    throw new Error('Registry source dispatcher identity mismatch');
  const catalog = Catalog(await ports.read());
  if (catalog instanceof type.errors || catalog.readers.length > 128)
    throw new Error('Malformed registry source catalog');
  const configurations = catalog.readers.map(parseReaderConfiguration);
  const selected = configurations.filter(
    (configuration) =>
      configuration.registryId === request.registryId &&
      configuration.id === request.id &&
      configuration.source === request.source,
  );
  if (selected.length !== 1) throw new Error('Registry source is absent or ambiguous');
  const configuration = selected[0];
  if (
    configuration.transport === undefined ||
    createHash('sha256').update(JSON.stringify(configuration)).digest('hex') !==
      request.configurationSha256 ||
    configuration.transport.dispatcherSha256 !== request.dispatcherSha256
  )
    throw new Error('Registry source configuration differs from authority enrollment');
  const { transport: _transport, ...local } = configuration;
  return await (ports.run ?? runRegistryReader)(local, request.revision, signal);
}

if (import.meta.main) {
  const cancellation = new AbortController();
  const abort = () => {
    cancellation.abort(new Error('Registry reader transport closed'));
  };
  process.on('SIGTERM', abort);
  process.on('SIGHUP', abort);
  try {
    const bytes = await readRegistryBytes(
      Bun.stdin.stream(),
      65536,
      'Registry source dispatcher stdin',
    );
    process.stdout.write(
      `${JSON.stringify(await executeReaderHost(JSON.parse(new TextDecoder().decode(bytes)), native, cancellation.signal))}\n`,
    );
  } finally {
    process.off('SIGTERM', abort);
    process.off('SIGHUP', abort);
  }
}
