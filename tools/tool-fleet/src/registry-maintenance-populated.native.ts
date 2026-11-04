import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';

import { type } from 'arktype';

import {
  describeRegistryGuardObservationFailure,
  type RegistryGuardTimeline,
  startRegistryGuardTimeline,
  verifyRegistrySupervisorAcknowledgement,
} from './registry-guard-observation.fixture';
import { readRegistryHttpObservationOutput } from './registry-http-observation.fixture';
import { parseRegistryCommandResponse } from './registry-journal';
import { startRegistryFixtureGuard } from './registry-maintenance-guard.fixture';
import { prepareRegistryHostFixture } from './registry-maintenance-host.fixture';
import { RegistryPopulatedFixture } from './registry-maintenance-publication.fixture';
import { observeRegistryPopulationOutput } from './registry-population-diagnostics.fixture';
import { readRegistryPressureRecord } from './registry-pressure-ack.fixture';
import { parseReaderConfiguration } from './registry-reader';
import { readRegistryBytes } from './registry-stream';

const home = '/root/task8-fixture';
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
type RunOwner = (mode: string) => Promise<{ code: number; stdout: string; stderr: string }>;

/** Actual owned root retirement proof with synthetic historical setup and accelerated authority/discard clocks, cluster/consumer observations and provider admission/version ports. Publication timestamps and ordinary permits remain real. */
export async function provePopulatedRegistryHost(run: RunOwner): Promise<void> {
  if (process.pid !== 1 || process.getuid?.() !== 0)
    throw new Error('Populated fixture requires private root PID1');
  const { installed } = await prepareRegistryHostFixture();
  await writeFile(
    '/etc/puni/registry-fixture-clock',
    new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    { mode: 0o644, flag: 'wx' },
  );
  await writeFile(home + '/admission', 'fixture', { mode: 0o600 });
  await writeFile('/etc/puni/registry-fixture-references.json', '[]', { mode: 0o644, flag: 'wx' });
  const readerPath = '/usr/local/libexec/puni-registry-maintenance/consumer.js';
  const reader = `const request = JSON.parse(await Bun.stdin.text()); console.log(JSON.stringify({ protocol: request.protocol, registryId: request.registryId, id: request.id, source: request.source, revision: request.revision, role: request.role, sourceRevision: 'synthetic-populated-host', references: JSON.parse(await Bun.file('/etc/puni/registry-fixture-references.json').text()) }));\n`;
  await writeFile(readerPath, reader, { mode: 0o644 });
  const configurationPath = '/etc/puni/registry-fixture-reader.json';
  const configuration = parseReaderConfiguration(
    JSON.parse(await readFile(configurationPath, 'utf8')),
  );
  if (configuration.artifact.path !== readerPath)
    throw new Error('Unexpected exact synthetic reader artifact');
  configuration.artifact.sha256 = hash(reader);
  const serialized = JSON.stringify(configuration);
  await writeFile(configurationPath, serialized, { mode: 0o644 });
  const universePath = '/etc/puni/registry-consumers.json';
  const universe = type({
    schemaVersion: '1',
    registryId: 'string',
    sources: type({ id: "'fixture-host'", configurationSha256: 'string' })
      .array()
      .atLeastLength(1)
      .atMostLength(1),
  }).assert(JSON.parse(await readFile(universePath, 'utf8')));
  const source = universe.sources.at(0);
  if (source === undefined || universe.registryId !== installed.registryId)
    throw new Error('Unexpected synthetic consumer universe');
  source.configurationSha256 = hash(serialized);
  await writeFile(universePath, JSON.stringify(universe), { mode: 0o644 });
  const initialized = await run('initialize-past');
  if (initialized.code !== 0 || initialized.stdout.trim() !== 'initialized')
    throw new Error('Historical fixture initialization failed');
  const baseline = await run('backup-past');
  if (baseline.code !== 0 || baseline.stdout.trim() !== 'verified-native-backup')
    throw new Error('Actual fixture bootstrap backup failed');
  const config = '/etc/puni/ordinary-writer.json';
  await writeFile(
    config,
    JSON.stringify({
      version: 0.1,
      log: { level: 'error' },
      storage: {
        filesystem: { rootdirectory: installed.ordinary.path },
        delete: { enabled: false },
        maintenance: { uploadpurging: { enabled: false } },
      },
      http: { addr: '127.0.0.1:5052', secret: 'owned-native-seed' },
    }),
    { mode: 0o644, flag: 'wx' },
  );
  // Synthetic Kubernetes does not launch a Deployment; the exact existing startup guard owns its actual Distribution child here.
  const guard = await startRegistryFixtureGuard(installed);
  let populated: typeof RegistryPopulatedFixture.infer | undefined;
  try {
    const reopened = await run('reopen-populate');
    if (reopened.code !== 0 || reopened.stdout.trim() !== 'population-writable-permitted')
      throw new Error('Actual population reopen failed');
    await guard.waitMode('writable');
    const supervisorInstance = await readRegistryPressureRecord(
      '/var/lib/puni-registry/registry/contents/.authority-instance',
    );
    const previousReadonlyRequest = await readRegistryPressureRecord(
      '/var/lib/puni-registry/journal/contents/readonly.request',
    );
    const timeline = startRegistryGuardTimeline(installed.journalPath, guard.observeMode);
    const publication = await observeRegistryPopulationRun(
      () => run('populate'),
      () => timeline.stop(),
      (serialized) => {
        console.log(serialized);
      },
    );
    populated = RegistryPopulatedFixture.assert(JSON.parse(publication.stdout));
    await guard.waitMode('readonly');
    const acknowledgementMetadata = await lstat(
      '/var/lib/puni-registry/registry/contents/.authority-readonly',
    );
    // Proof (modeled producer): skipped verification or instance reread admits stale/foreign records; missing and unreadable records preserve their exact failures.
    const supervisorAcknowledgement = verifyRegistrySupervisorAcknowledgement({
      instance: supervisorInstance,
      afterInstance: await readRegistryPressureRecord(
        '/var/lib/puni-registry/registry/contents/.authority-instance',
      ),
      previousRequest: previousReadonlyRequest,
      request: await readRegistryPressureRecord(
        '/var/lib/puni-registry/journal/contents/readonly.request',
      ),
      acknowledgement: await readRegistryPressureRecord(
        '/var/lib/puni-registry/registry/contents/.authority-readonly',
        { dev: acknowledgementMetadata.dev, ino: acknowledgementMetadata.ino },
      ),
      boot: await readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
    });
    // Proof (modeled producer): omission loses the otherwise valid sampled ACK receipt. Native execution remains a separate rehearsal.
    console.log(JSON.stringify({ supervisorAcknowledgement }));
    const url = `http://127.0.0.1:5052/v2/${populated.reference.repository}/manifests/${populated.reference.digest}`;
    const deletion = await fetch(url, { method: 'DELETE' });
    const refusal = new TextDecoder().decode(
      await readRegistryBytes(deletion.body, 256, 'Owned readonly DELETE'),
    );
    if (
      deletion.status !== 405 ||
      deletion.headers.get('content-type') !== 'text/plain; charset=utf-8' ||
      refusal !== 'Method not allowed\n'
    )
      throw new Error('Readonly endpoint differs from pinned DELETE refusal');
    const retained = await fetch(url, {
      method: 'HEAD',
      headers: {
        accept: 'application/vnd.oci.image.manifest.v1+json',
        'cache-control': 'no-cache',
      },
    });
    await retained.arrayBuffer();
    if (
      retained.status !== 200 ||
      retained.headers.get('docker-content-digest') !== populated.reference.digest
    )
      throw new Error('Readonly DELETE refusal lost retained content');
    await writeFile(
      '/etc/puni/registry-fixture-references.json',
      JSON.stringify([populated.reference]),
      { mode: 0o644 },
    );
  } finally {
    await guard.close();
  }
  // Boundary: retain the required receipt check after externally observed publication and guard shutdown.
  if ((populated as typeof RegistryPopulatedFixture.infer | undefined) === undefined)
    throw new Error('Missing actual populated fixture receipt');
  await writeFile(
    '/etc/puni/registry-fixture-retirement-clock.json',
    JSON.stringify({ now: populated.eligibleAt }),
    { mode: 0o644, flag: 'wx' },
  );
  await writeFile(home + '/collect-proof', 'enabled', { mode: 0o600, flag: 'wx' });
  const retirement = await run('retire');
  if (retirement.code !== 0 || retirement.stdout.trim() !== 'verified-native-retirement')
    throw new Error('Actual root populated retirement failed');
  const grace = (await readFile(home + '/upload-grace-proof.log', 'utf8'))
    .trim()
    .split('\n')
    .map((line): unknown => JSON.parse(line));
  if (grace.length !== 2) throw new Error('Missing actual grace proof boundaries');
  const firstGrace = type({
    realClockRefused: 'true',
    stagedCensusUnchanged: 'true',
    offsetMilliseconds: '604800000 <= number.safe <= 777600000',
    '+': 'reject',
  }).assert(grace[0]);
  type({ realClockRestored: 'true', '+': 'reject' }).assert(grace[1]);
  const state = parseRegistryCommandResponse({
    state: JSON.parse(await readFile(installed.journalPath + '/journal.json', 'utf8')),
  } satisfies { state: unknown }).state;
  if (
    state.schemaVersion !== 4 ||
    state.maintenance !== null ||
    !state.fenced ||
    state.lastVerifiedBackup === null
  )
    throw new Error('Retirement lacks terminal fenced verified state');
  const receipt = state.retirements.find((receipt) => receipt.operationId === 'native-host-retire');
  if (
    receipt === undefined ||
    !receipt.operations.includes(populated.partialOperationId) ||
    !receipt.retireBlobs.includes(populated.partialOrphan) ||
    receipt.retireBlobs.includes(populated.sharedLayer) ||
    receipt.deletions.length !== 2
  )
    throw new Error('Root retirement lost exact partial/shared content evidence');
  const guards = (await readFile(home + '/collection-proof.log', 'utf8'))
    .trim()
    .split('\n')
    .map((line): unknown => JSON.parse(line));
  if (
    JSON.stringify(guards) !==
    JSON.stringify([
      { fault: 'absent', refused: true, gcStarted: false },
      { fault: 'snapshot', refused: true, gcStarted: false },
      { fault: 'none', refused: false, gcStarted: true },
    ])
  )
    throw new Error('Missing exact collection dispatcher proof');
  console.log(
    JSON.stringify({
      checks: populated.checks + 10,
      scope:
        'actual-managed-partial-publication/root-delete/offline-GC/uncached-retained-pulls; synthetic-clock-cluster-consumer-provider',
      syntheticDiscardOffsetMilliseconds: firstGrace.offsetMilliseconds,
      clockScope:
        'real publication/backup/permits; synthetic retirement authority and discard-only advancing Date.now; no elapsed-seven-days claim',
      ordinaryWritableDelete: populated.ordinaryDelete,
      ordinaryReadonlyDelete: 'refused',
      collectionAdmission: 'absent-and-mismatched-receipts-refused-before-native-GC',
      partial: 'retired',
      sharedLayer: 'retained',
      fence: 'retained',
    }),
  );
}

/** Fixture observation finalization retains every available safe diagnostic before refusing any required observer or owner failure. Terminal stop is awaited even when owner execution throws; no raw error or owner stdout is emitted. */
export async function observeRegistryPopulationRun(
  run: () => Promise<{ code: number; stdout: string; stderr: string }>,
  stop: () => Promise<typeof RegistryGuardTimeline.infer>,
  emit: (serialized: string) => void,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const ownerOutcome = await run().then(
    (publication) => ({ ok: true as const, publication }),
    (cause: unknown) => ({ ok: false as const, cause }),
  );
  // Proof (fixture finalization only): direct throwing stop loses the safe owner/HTTP receipts and fails the monitor-failure negative.
  let monitorFailure: { cause: unknown } | undefined;
  const observedTimeline = await stop().then(
    (observation) => ({ state: 'observed' as const, observation }),
    (cause: unknown) => {
      monitorFailure = { cause };
      return { state: 'failed' as const, observation: null };
    },
  );
  emit(JSON.stringify({ guardTimeline: observedTimeline }));
  if (!ownerOutcome.ok) throw ownerOutcome.cause;
  const publication = ownerOutcome.publication;
  const http = readRegistryHttpObservationOutput(publication.stderr);
  emit(JSON.stringify({ populationHttp: http }));
  // Proof (fixture finalization only): moving HTTP admission ahead of this block hides the failed owner diagnostic.
  if (publication.code !== 0) {
    const observed = observeRegistryPopulationOutput(
      publication.stderr
        .split('\n')
        .filter((line) => !line.startsWith('task8-population-http:'))
        .join('\n'),
    );
    emit(JSON.stringify({ populationOutput: observed }));
    if (observed.failure !== null) emit(JSON.stringify({ populationFailure: observed.failure }));
  }
  // Proof (fixture diagnostic only): moving formatting before prior receipts hides owner/HTTP evidence when the stack getter throws.
  if (monitorFailure !== undefined)
    emit(
      JSON.stringify({
        guardObservationFailure: describeRegistryGuardObservationFailure(monitorFailure.cause),
      }),
    );
  // Proof (fixture finalization only): removal accepts a successful owner despite required monitor failure.
  if (observedTimeline.state !== 'observed') throw new Error('Required guard observation failed');
  if (http.state !== 'valid' || http.observation?.pending !== 0)
    throw new Error('Missing complete HTTP fixture observation');
  if (publication.code !== 0) throw new Error('Actual managed partial publication fixture failed');
  return publication;
}
