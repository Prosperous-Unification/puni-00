import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

import { type } from 'arktype';

import { readTrustedEnrollment } from './registry-enrollment';
import { EnvironmentHistory, type RegistryConsumer } from './registry-managed-journal';
import { readRegistryBytes } from './registry-stream';

const Identity = type('0 < string <= 256');
const Path = Identity.narrow(isAbsolute);
const Digest = type(/^sha256:[0-9a-f]{64}$/);
const Configuration = type({
  schemaVersion: '1',
  protocol: "'registry-consumer/2'",
  registryId: Identity,
  id: Identity,
  kind: "'flux'|'kubernetes'|'compose'|'solver'|'recovery'|'private-product'|'docker-host'",
  source: Path,
  role: "'consumer'|'history'",
  artifact: { path: Path, sha256: /^[0-9a-f]{64}$/, '+': 'reject' },
  input: 'unknown',
  'transport?': {
    kind: "'ssh'",
    host: /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/,
    dispatcherSha256: /^[0-9a-f]{64}$/,
    '+': 'reject',
  },
  '+': 'reject',
});
const Report = type({
  protocol: "'registry-consumer/2'",
  registryId: Identity,
  id: Identity,
  source: Path,
  revision: 'number.safe >= 0',
  sourceRevision: Identity,
  role: "'consumer'|'history'",
  'history?': EnvironmentHistory,
  'historySha256?': /^[a-f0-9]{64}$/,
  references: type({ repository: Identity, digest: Digest, '+': 'reject' }).array(),
  'currentReferences?': type({ repository: Identity, digest: Digest, '+': 'reject' }).array(),
  '+': 'reject',
});
export type RegistryReaderConfiguration = typeof Configuration.infer;
export type RegistryReaderReport = typeof Report.infer;

/** Validate the complete installed source configuration before selecting code or source input. */
export function parseReaderConfiguration(input: unknown): RegistryReaderConfiguration {
  const configuration = Configuration(input);
  if (configuration instanceof type.errors)
    throw new Error('Malformed registry reader configuration');
  return configuration;
}

/**
 * Execute a verified immutable byte snapshot, not the mutable artifact path. JSON stdin carries
 * only the configured source input and current operation revision. Output overflow or deadline
 * kills and reaps the child before failure returns. No shell or ambient working directory.
 */
export async function runRegistryReader(
  input: unknown,
  revision: number,
  signal?: AbortSignal,
): Promise<RegistryReaderReport> {
  signal?.throwIfAborted();
  const configuration = parseReaderConfiguration(input);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid reader revision');
  const directory = await mkdtemp(join(tmpdir(), 'registry-reader-'));
  try {
    let argv: string[];
    let request: unknown;
    if (configuration.transport !== undefined) {
      argv = [
        '/usr/bin/ssh',
        '-F',
        '/dev/null',
        '-o',
        'BatchMode=yes',
        '-o',
        'StrictHostKeyChecking=yes',
        '-o',
        'UserKnownHostsFile=/etc/puni/registry-reader-known-hosts',
        '-o',
        'IdentitiesOnly=yes',
        '-o',
        'ConnectTimeout=5',
        '-i',
        '/etc/puni/registry-reader-key',
        '--',
        `puni-registry-reader@${configuration.transport.host}`,
        '/usr/local/bin/bun /usr/local/libexec/puni-registry-reader-host.js',
      ];
      request = {
        protocol: 'registry-reader-host/1',
        registryId: configuration.registryId,
        id: configuration.id,
        source: configuration.source,
        revision,
        configurationSha256: createHash('sha256')
          .update(JSON.stringify(configuration))
          .digest('hex'),
        dispatcherSha256: configuration.transport.dispatcherSha256,
      };
    } else {
      const artifact = await open(
        configuration.artifact.path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      let bytes: Buffer;
      try {
        const status = await artifact.stat();
        if (!status.isFile() || status.size > 8 * 1024 ** 2)
          throw new Error('Invalid reader artifact size or file');
        const chunks: Buffer[] = [];
        const buffer = Buffer.alloc(65536);
        let size = 0;
        for (;;) {
          const read = await artifact.read(buffer);
          if (read.bytesRead === 0) break;
          size += read.bytesRead;
          if (size > status.size) throw new Error('Reader artifact changed during read');
          chunks.push(Buffer.from(buffer.subarray(0, read.bytesRead)));
        }
        bytes = Buffer.concat(chunks);
        // Proof: removing the hash check executes altered reader bytes in registry-reader.test.
        if (createHash('sha256').update(bytes).digest('hex') !== configuration.artifact.sha256)
          throw new Error('Registry reader artifact digest mismatch');
      } finally {
        await artifact.close();
      }
      const snapshot = await open(
        join(directory, 'reader.js'),
        constants.O_RDWR | constants.O_CREAT | constants.O_EXCL,
        0o600,
      );
      try {
        await snapshot.writeFile(bytes);
      } finally {
        await snapshot.close();
      }
      argv = [process.execPath, join(directory, 'reader.js')];
      request = {
        protocol: configuration.protocol,
        registryId: configuration.registryId,
        id: configuration.id,
        source: configuration.source,
        role: configuration.role,
        revision,
        input: configuration.input,
      };
    }
    const child = Bun.spawn(argv, {
      cwd: directory,
      detached: true,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { PATH: '/usr/bin:/bin' },
    });
    const stdout = readRegistryBytes(child.stdout, 4 * 1024 ** 2, 'Registry reader stdout');
    const stderr = readRegistryBytes(child.stderr, 65536, 'Registry reader stderr');
    const terminate = () => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (cause) {
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')) throw cause;
      }
    };
    signal?.addEventListener('abort', terminate, { once: true });
    if (signal?.aborted) terminate();
    const timer = setTimeout(terminate, configuration.transport === undefined ? 30000 : 35000);
    try {
      const send = async () => {
        await child.stdin.write(JSON.stringify(request));
        await child.stdin.end();
      };
      const [code, output, diagnostic] = await Promise.all([child.exited, stdout, stderr, send()]);
      if (code !== 0)
        throw new Error(`Registry reader failed: ${new TextDecoder().decode(diagnostic).trim()}`);
      const report = Report(JSON.parse(new TextDecoder().decode(output)));
      if (
        report instanceof type.errors ||
        report.registryId !== configuration.registryId ||
        report.id !== configuration.id ||
        report.role !== configuration.role ||
        // Proof: omitting source binding accepts a substituted source report in registry-reader.test.
        report.source !== configuration.source ||
        report.revision !== revision
      )
        throw new Error('Registry reader report identity or protocol mismatch');
      return report;
    } catch (cause) {
      // Proof: omitting termination lets the overflowing child survive in kills-and-reaps.
      terminate();
      await child.exited;
      await Promise.allSettled([stdout, stderr]);
      throw cause;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', terminate);
    }
  } finally {
    await rm(directory, { recursive: true });
  }
}

/** Resolve every registered source from its installed trusted configuration, never caller input. */
export async function collectRegistryConsumers(
  sources: readonly RegistryConsumer[],
  revision: number,
  registryId: string,
  read: (path: string) => Promise<unknown> = readTrustedEnrollment,
) {
  const reports = [];
  const configurations = new Map<string, RegistryReaderConfiguration>();
  for (const source of sources) {
    const installed = await read(source.source);
    if (
      createHash('sha256').update(JSON.stringify(installed)).digest('hex') !==
      source.configurationSha256
    )
      throw new Error('Installed consumer configuration digest differs from enrollment');
    const configuration = parseReaderConfiguration(installed);
    if (
      configuration.id !== source.id ||
      configuration.kind !== source.kind ||
      configuration.role !== source.role ||
      configuration.source !== source.source ||
      configuration.registryId !== registryId
    )
      throw new Error('Installed consumer source differs from its registry enrollment');
    configurations.set(source.id, configuration);
  }
  verifyDockerSourceCoverage(sources, configurations, registryId);
  for (const source of sources) {
    const configuration = configurations.get(source.id);
    if (configuration === undefined) throw new Error('Missing configured consumer source');
    const report = await runRegistryReader(configuration, revision);
    reports.push({
      id: report.id,
      source: report.source,
      revision: report.revision,
      sourceRevision: report.sourceRevision,
      role: report.role,
      ...(report.history === undefined
        ? {}
        : { history: report.history, historySha256: report.historySha256 }),
      references: report.references,
      ...(report.currentReferences === undefined
        ? {}
        : { currentReferences: report.currentReferences }),
    });
  }
  return reports;
}

/** Both projections must read the same independently installed machine/catalog/Docker identity. */
export function verifyDockerSourceCoverage(
  sources: readonly RegistryConsumer[],
  configurations: ReadonlyMap<string, RegistryReaderConfiguration>,
  registryId: string,
): void {
  const Pin = type({ path: Path, sha256: /^[a-f0-9]{64}$/, '+': 'reject' });
  const Host = type({ machineId: /^[a-f0-9]{32}$/, catalog: Pin, '+': 'reject' });
  const Global = type({
    registryId: Identity,
    registryUrl: Identity,
    docker: Pin,
    host: Host,
    '+': 'reject',
  });
  const Scoped = type({
    scope: {
      registryId: Identity,
      owner: Identity,
      product: Identity,
      environment: Identity,
      target: Identity,
    },
    root: Path,
    registryUrl: Identity,
    docker: Pin,
    host: Host,
  });
  for (const source of sources) {
    if (source.kind === 'docker-host') {
      const global = Global(configurations.get(source.id)?.input);
      if (
        source.environment !== null ||
        source.role !== 'consumer' ||
        global instanceof type.errors ||
        global.registryId !== registryId
      )
        throw new Error('Malformed registry-scope Docker source');
    }
    if (source.kind !== 'compose' || source.role !== 'consumer') continue;
    const configuration = configurations.get(source.id);
    const scoped = Scoped(configuration?.input);
    const host = sources.find((host) => host.id === source.hostSourceId);
    const hostConfiguration = host === undefined ? undefined : configurations.get(host.id);
    const global = Global(hostConfiguration?.input);
    // Proof: removing host equality admits the mismatched catalog in the global-host reader test.
    if (
      configuration === undefined ||
      scoped instanceof type.errors ||
      host?.kind !== 'docker-host' ||
      host.role !== 'consumer' ||
      host.environment !== null ||
      global instanceof type.errors ||
      scoped.scope.registryId !== registryId ||
      global.registryId !== registryId ||
      scoped.scope.owner !== source.owner ||
      scoped.scope.environment !== source.environment ||
      scoped.scope.target !== `compose:${scoped.root}` ||
      scoped.registryUrl !== global.registryUrl ||
      JSON.stringify(scoped.host) !== JSON.stringify(global.host) ||
      JSON.stringify(scoped.docker) !== JSON.stringify(global.docker) ||
      JSON.stringify(configuration.transport ?? null) !==
        JSON.stringify(hostConfiguration?.transport ?? null)
    )
      throw new Error('Compose source lacks matching complete Docker host coverage');
  }
}

const Request = type({
  protocol: "'registry-consumer/2'",
  registryId: Identity,
  id: Identity,
  source: Path,
  role: "'consumer'|'history'",
  revision: 'number.safe >= 0',
  input: 'unknown',
  '+': 'reject',
});
/** Reader entrypoint supplies only source-derived images/revision; protocol identity is bound here. */
export async function serveRegistryReader(
  read: (input: unknown) => Promise<{
    sourceRevision: string;
    references: { repository: string; digest: string }[];
    history?: typeof EnvironmentHistory.infer;
    historySha256?: string;
    currentReferences?: { repository: string; digest: string }[];
  }>,
  role: 'consumer' | 'history' = 'consumer',
): Promise<void> {
  const bytes = await readRegistryBytes(Bun.stdin.stream(), 65536, 'Registry reader request');
  const request = Request(JSON.parse(new TextDecoder().decode(bytes)));
  if (request instanceof type.errors || request.role !== role)
    throw new Error('Malformed registry reader request or unsupported source role');
  const inventory = await read(request.input);
  const { input: _input, ...identity } = request;
  const report = Report({ ...identity, ...inventory });
  if (report instanceof type.errors) throw new Error('Malformed source reader inventory');
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

/** Select only this authority's registry; a managed reference must be immutable and canonical. */
export function managedImageReferences(images: readonly string[], registryUrl: string) {
  const host = new URL(registryUrl).host;
  const references: { repository: string; digest: string }[] = [];
  for (const image of images) {
    if (!image.startsWith(`${host}/`)) continue;
    const match = /^([^@\s]+)@(sha256:[0-9a-f]{64})$/.exec(image.slice(host.length + 1));
    if (match === null) throw new Error('Mutable or malformed managed consumer image');
    const repository = match[1].replace(/:[^/:]+$/, '');
    if (!/^[a-z0-9]+(?:[._/-][a-z0-9]+)*$/.test(repository))
      throw new Error('Invalid managed consumer repository');
    references.push({ repository, digest: match[2] });
  }
  return [
    ...new Map(
      references.map((reference) => [`${reference.repository}@${reference.digest}`, reference]),
    ).values(),
  ];
}
