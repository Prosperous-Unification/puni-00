import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import type { BunPlugin } from 'bun';

import { type EnvLayout, envLayout } from '../lib/env';
import type { InitialHandoffPlan } from '../lib/initial-handoff-graph';
import type { SolverPins } from '../lib/solver-host';

/** Owned test layout only; production runtime admission retains its literal fixed namespace. */
export function initialHandoffLayout(state: string, layouts?: readonly EnvLayout[]): BunPlugin {
  return {
    name: 'owned-initial-handoff-layout',
    setup(build) {
      build.onLoad({ filter: /\/(solver-runtime-admission|env)\.ts$/ }, async (entry) => {
        const contents = await readFile(entry.path, 'utf8');
        if (entry.path.endsWith('/env.ts')) {
          if (layouts === undefined) return { contents, loader: 'ts' };
          const signature = 'export function envLayout(env: string | undefined): EnvLayout {';
          if (!contents.includes(signature))
            throw new Error('owned canonical layout contract changed');
          return {
            contents: contents.replace(
              signature,
              signature +
                layouts
                  .map(
                    (layout) =>
                      `\nif(env===${JSON.stringify(layout.env)})return ${JSON.stringify(layout)};`,
                  )
                  .join(''),
            ),
            loader: 'ts',
          };
        }
        const declaration = "directory = '/home/puni1/wbs/state'";
        if (contents.split(declaration).length !== 3)
          throw new Error('owned runtime layout requires both original fixed admission defaults');
        return {
          contents: contents.replaceAll(declaration, `directory = ${JSON.stringify(state)}`),
          loader: 'ts',
        };
      });
    },
  };
}

// Explicit owned preload use is confined to this test fixture, never a production admission API.
if (process.env['TEST_INITIAL_HANDOFF_LAYOUT'] === 'owned') {
  const state = process.env['WBS_EDGE_STATE'];
  if (state === undefined) throw new Error('owned runtime layout requires explicit state');
  await Bun.plugin(initialHandoffLayout(state));
}

const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const serialize = (value: unknown) => JSON.stringify(value) + '\n';

/** Independently authored owned graph bytes; this fixture claims no original lifecycle or SQLite provenance. */
export async function initialHandoffFixture(
  phase: 'plan' | 'H6' | 'H7' | 'H8' = 'H8',
  suppliedPins?: SolverPins,
  mutate?: (label: string, fields: Record<string, unknown>) => void,
  options?: Readonly<{
    root?: string;
    activate?: readonly ('prod' | 'dev')[];
    launchConfigurationSha256?: string;
    runtimeLaunchSha256?: string;
  }>,
) {
  const root = options?.root ?? scratchSync('initial-handoff-');
  await mkdir(join(root, 'dev'), { mode: 0o700 });
  const layouts = [
    { ...envLayout('prod'), root, stateDir: root },
    { ...envLayout('dev'), root: join(root, 'dev'), stateDir: join(root, 'dev') },
  ];
  const activate: readonly ('prod' | 'dev')[] = options?.activate ?? ['prod'];
  const sourceSha = 'a'.repeat(40);
  const pins = suppliedPins ?? {
    version: 1,
    sourceSha,
    bunSha256: 'e'.repeat(64),
    bundleSha256: 'e'.repeat(64),
    configSha256: 'e'.repeat(64),
    unitSha256: 'e'.repeat(64),
  };
  const owner = serialize({
    format: 'dependency-edge-owner',
    version: 1,
    attempt: '12345678-1234-4123-8123-123456789abc',
    plan: { sha: pins.sourceSha, layouts },
  });
  const ownerHash = digest(owner);
  const attempt = '12345678-1234-4123-8123-123456789abc';
  const backendImage = 'registry/wbs-be-01@sha256:' + 'b'.repeat(64);
  const gatewayImage = 'registry/wbs-gw-01@sha256:' + 'c'.repeat(64);
  const runtimeReference = 'registry/toolchain@sha256:' + 'd'.repeat(64);
  const backendId = 'b'.repeat(64);
  const gatewayId = 'c'.repeat(64);
  const sourceId = 'f'.repeat(64);
  const paths = new Map<string, string>();
  const records: { name: string; contents: string }[] = [];
  const manifests = new Map<string, { name: string; contents: string }>();
  const originalFences: InitialHandoffPlan['fences'][number][] = [];
  async function publish(
    sequence: number,
    label: string,
    fields: Record<string, unknown>,
    envelope = true,
  ) {
    mutate?.(label, fields);
    const name = 'edge-owner-' + String(sequence).padStart(6, '0') + '-' + label + '.json';
    const contents = serialize(envelope ? { owner, record: fields } : fields);
    const path = join(root, name);
    if (envelope) records.push({ name, contents });
    else manifests.set(label, { name, contents });
    if (phase !== 'plan' || sequence < 23) await writeFile(path, contents, { mode: 0o600 });
    if (!paths.has(label)) paths.set(label, path);
    paths.set(name, path);
    return { name, sha256: digest(contents) };
  }
  async function rawArchive(
    sequence: number,
    environment: 'prod' | 'dev',
    name: string,
    contents: string,
  ) {
    const directory = environment === 'prod' ? root : join(root, 'dev');
    const archiveName =
      'edge-owner-' + String(sequence).padStart(6, '0') + '-retired-' + name.slice(0, -5) + '.json';
    const path = join(directory, phase === 'plan' ? name : archiveName);
    await writeFile(path, contents, { mode: 0o600 });
    const status = await lstat(path, { bigint: true });
    const parent = await lstat(directory, { bigint: true });
    paths.set(name, path);
    originalFences.push({
      environment,
      name,
      snapshot: {
        path: join(directory, name),
        contents,
        device: String(status.dev),
        inode: String(status.ino),
        parentDevice: String(parent.dev),
        parentInode: String(parent.ino),
        mode: 384,
      },
    });
    return {
      environment,
      name,
      originalSha256: digest(contents),
      archive: {
        directory: environment,
        name: archiveName,
        sha256: digest(contents),
        device: String(status.dev),
        inode: String(status.ino),
        parentDevice: String(parent.dev),
        parentInode: String(parent.ino),
        mode: 384,
      },
    };
  }
  const database = (environment: 'prod' | 'dev') => ({
    environment,
    path: '/data/' + environment + '.sqlite',
    host: (environment === 'prod' ? root : join(root, 'dev')) + '/data/' + environment + '.sqlite',
    directoryIdentity: '1:2',
    fileIdentity: environment === 'prod' ? '1:3' : '1:4',
  });
  const prodDatabase = database('prod');
  const databases = [prodDatabase, database('dev')];
  function managed(role: 'backend' | 'gateway', terminal: boolean) {
    const backend = role === 'backend';
    return {
      id: backend ? backendId : gatewayId,
      name: backend ? '/be-01-blue' : '/gw-01-blue',
      image: 'sha256:' + (backend ? 'b' : 'c').repeat(64),
      imageRef: backend ? backendImage : gatewayImage,
      service: backend ? 'be-01-blue' : 'gw-01-blue',
      project: 'wbs',
      network: layouts[0]?.network,
      networkId: '1'.repeat(64),
      restartPolicy: { name: terminal ? 'no' : 'always', maximumRetryCount: 0 },
      restartCount: 0,
      state: {
        running: !terminal,
        paused: false,
        restarting: false,
        dead: false,
        oomKilled: false,
        pid: terminal ? 0 : 101,
        status: terminal ? 'exited' : 'running',
        startedAt: '2026-10-01T00:00:00Z',
        finishedAt: terminal ? '2026-10-02T00:00:00Z' : '0001-01-01T00:00:00Z',
        exitCode: 0,
        error: '',
      },
      ...(backend
        ? {
            database: {
              path: prodDatabase.path,
              host: prodDatabase.host,
              directoryIdentity: prodDatabase.directoryIdentity,
              fileIdentity: prodDatabase.fileIdentity,
            },
          }
        : {}),
    };
  }
  const localAttempt = '22345678-1234-4123-8123-123456789abc';
  const gatewayMarker = '{"format":"dependency-gateway-fence","version":1}\n';
  const gatewayIntent = serialize({
    format: 'dependency-gateway-intent',
    version: 1,
    attempt: localAttempt,
    environment: 'prod',
    root,
    network: layouts[0]?.network,
    sha: pins.sourceSha,
    cohort: { blue: managed('gateway', false), green: null },
  });
  const gatewayComplete = serialize({
    format: 'dependency-gateway-complete',
    version: 1,
    attempt: localAttempt,
    intentSha256: digest(gatewayIntent),
    cohort: { blue: managed('gateway', true), green: null },
  });
  const gatewayBinding = {
    markerSha256: digest(gatewayMarker),
    intentSha256: digest(gatewayIntent),
    completionSha256: digest(gatewayComplete),
  };
  const backendMarker = '{"format":"dependency-backend-fence","version":1}\n';
  const archiveWire = (label: string, fields: Record<string, unknown>) => {
    mutate?.(label, fields);
    return serialize(fields);
  };
  const backendIntent = archiveWire('archived-backend-intent', {
    format: 'dependency-backend-intent',
    version: 1,
    attempt: localAttempt,
    environment: 'prod',
    root,
    network: layouts[0]?.network,
    sha: pins.sourceSha,
    cohort: { blue: managed('backend', false), green: null },
    gateway: gatewayBinding,
  });
  const backendComplete = archiveWire('archived-backend-complete', {
    format: 'dependency-backend-complete',
    version: 1,
    attempt: localAttempt,
    intentSha256: digest(backendIntent),
    cohort: { blue: managed('backend', true), green: null },
    gateway: gatewayBinding,
  });
  const sourceIntentFields = {
    attempt: localAttempt,
    sha: pins.sourceSha,
    layouts: { prod: layouts[0], dev: layouts[1] },
    member: {
      id: sourceId,
      image: 'sha256:' + 'd'.repeat(64),
      snapshotSha256: digest('initial source snapshot'),
    },
  };
  const sourceIntent = serialize(sourceIntentFields);
  const sourceComplete = serialize({
    intentSha256: digest(JSON.stringify(sourceIntentFields)),
    member: {
      id: sourceId,
      image: 'sha256:' + 'd'.repeat(64),
      snapshotSha256: digest('terminal source snapshot'),
    },
  });
  const fences = await Promise.all([
    rawArchive(40, 'dev', 'dependency-source-dev-intent.json', sourceIntent),
    rawArchive(41, 'dev', 'dependency-source-dev-complete.json', sourceComplete),
    rawArchive(42, 'prod', 'dependency-backend-fence.json', backendMarker),
    rawArchive(43, 'prod', 'dependency-backend-intent.json', backendIntent),
    rawArchive(44, 'prod', 'dependency-backend-complete.json', backendComplete),
    rawArchive(45, 'prod', 'dependency-gateway-fence.json', gatewayMarker),
    rawArchive(46, 'prod', 'dependency-gateway-intent.json', gatewayIntent),
    rawArchive(47, 'prod', 'dependency-gateway-complete.json', gatewayComplete),
  ]);
  const ownerArchiveName = 'edge-owner-000048-retired-pending.json';
  const ownerPath = join(
    root,
    phase === 'H6' || phase === 'plan' ? 'edge-owner.pending' : ownerArchiveName,
  );
  await writeFile(ownerPath, owner, { mode: 0o600 });
  const ownerStatus = await lstat(ownerPath, { bigint: true });
  const parent = await lstat(root, { bigint: true });
  const ownerArchive = {
    directory: 'edge',
    name: ownerArchiveName,
    sha256: ownerHash,
    device: String(ownerStatus.dev),
    inode: String(ownerStatus.ino),
    parentDevice: String(parent.dev),
    parentInode: String(parent.ino),
    mode: 384,
  };
  paths.set('owner-archive', ownerPath);
  const sourceManifestFields = {
    format: 'wbs-source-startup',
    version: 1,
    profile: 'wbs-source-cold-v1',
    sourceSha: pins.sourceSha,
    entries: [
      {
        root: 'source',
        path: 'owned.txt',
        kind: 'file',
        mode: 420,
        size: 1,
        sha256: 'e'.repeat(64),
      },
    ],
    configuration: ['backend', 'gateway', 'mcp', 'frontend'].map((slot) => ({
      slot,
      size: 1,
      sha256: 'e'.repeat(64),
    })),
  };
  mutate?.('source-manifest-input', sourceManifestFields);
  const sourceManifestContents = serialize(sourceManifestFields);
  const sourcePins = {
    version: 1,
    sourceSha: pins.sourceSha,
    runtimeImageId: 'sha256:' + 'd'.repeat(64),
    manifestSha256: digest(sourceManifestContents),
    environmentSha256: 'e'.repeat(64),
  };
  const names = [
    'prod-swap',
    'prod-smoke',
    'dev-swap',
    'dev-smoke',
    'dev-poller',
    'dev-loader',
    'dev-interpreter',
    'declared-manual-launcher',
    'declared-bootstrap',
    'declared-configure',
    'shared-launch-authority',
    'shared-restart-authority',
  ];
  const fixed = [
    '/home/puni1/wbs/bin/swap.js',
    '/home/puni1/wbs/bin/smoke.js',
    '/home/puni1/wbs-dev/bin/swap.js',
    '/home/puni1/wbs-dev/bin/smoke.js',
    '/home/puni1/wbs-dev/bin/poll.sh',
    '/home/puni1/wbs-dev/bin/dev-poll-sync.sh',
    '/home/puni1/wbs-dev/bin/bun',
  ];
  const writersFields = {
    version: 1,
    sourceSha: pins.sourceSha,
    buildSha: pins.sourceSha,
    buildId: 'owned-fixture',
    members: names.map((member, index) => ({
      member,
      origin: index < 2 ? 'build' : 'source',
      hostPath: fixed[index] ?? '/fixture/' + member,
      reviewed: '/reviewed/' + member,
      installed: '/installed/' + member,
      sha256: 'e'.repeat(64),
    })),
  };
  mutate?.('writers-input', writersFields);
  const writersContents = serialize(writersFields);
  const authorities = {
    format: 'installed-dependency-authority-pins',
    version: 1,
    sourceSha: pins.sourceSha,
    writerManifestSha256: digest(writersContents),
    hostMachineIdSha256: '6ed6653dba3d6aee8110c6e23de37f15c609b8a6e29aa164d1acace604e5cb7e',
    launchConfigurationSha256:
      options?.launchConfigurationSha256 ??
      'a42fe33a98239c32db3346cf001f9ebdb43fbba1fe1cdd457472d3c295d8d487',
    solver: pins,
  };
  const migrationNames = [
    '20261022211000_add_external_dependencies',
    '20261022212000_add_cross_project_dependency_activation',
  ];
  const migrationsFields = {
    format: 'dependency-migration-artifact',
    version: 1,
    sourceSha: pins.sourceSha,
    candidateImage: backendImage,
    candidateImageId: 'sha256:' + 'b'.repeat(64),
    migrations: migrationNames.map((name) => ({
      name,
      migration: { size: 1, sha256: 'e'.repeat(64) },
      down: { size: 1, sha256: 'e'.repeat(64) },
      snapshot: null,
    })),
  };
  mutate?.('migration-manifest-input', migrationsFields);
  const manifestContents = serialize(migrationsFields);
  const migrations = {
    version: 1,
    sourceSha: pins.sourceSha,
    candidateImage: backendImage,
    candidateImageId: 'sha256:' + 'b'.repeat(64),
    manifestSha256: digest(manifestContents),
  };
  await mkdir(join(root, 'dependency-artifacts'), { mode: 0o700 });
  await mkdir(join(root, 'dependency-artifacts', migrations.manifestSha256), { mode: 0o700 });
  await writeFile(
    join(root, 'dependency-artifacts', migrations.manifestSha256, 'manifest.json'),
    manifestContents,
    { mode: 0o644 },
  );
  const artifacts = join(root, 'dependency-activation-' + attempt);
  await mkdir(artifacts, { mode: 0o700 });
  const rawSelections = [];
  for (const environment of activate) {
    const selectedDatabase = databases.find((database) => database.environment === environment);
    if (selectedDatabase === undefined) throw new Error('owned database selection absent');
    const identity = JSON.stringify({
      environment,
      host: selectedDatabase.host,
      directoryIdentity: selectedDatabase.directoryIdentity,
      fileIdentity: selectedDatabase.fileIdentity,
    });
    const image = environment === 'prod' ? backendImage : runtimeReference;
    const captureFields = {
      format: 'applied-migration-set',
      version: 1,
      target: identity,
      attempt: attempt + ':' + environment,
      candidate: image,
      applied: migrationNames.map((name) => ({ name, hash: 'e'.repeat(64) })),
      pending: [],
    };
    mutate?.('raw-capture-input', captureFields);
    const captureContents = serialize(captureFields);
    const captureRaw = { name: environment + '.capture.json', sha256: digest(captureContents) };
    const snapshot = Buffer.from('owned historical snapshot bytes ' + environment + '\0');
    const snapshotRaw = {
      name: environment + '.before.sqlite',
      sha256: digest(snapshot),
      bytes: snapshot.byteLength,
      migrations: migrationNames,
    };
    await writeFile(join(artifacts, captureRaw.name), captureContents, { mode: 0o600 });
    await writeFile(join(artifacts, snapshotRaw.name), snapshot, { mode: 0o600 });
    paths.set('raw-capture:' + environment, join(artifacts, captureRaw.name));
    paths.set('raw-backup:' + environment, join(artifacts, snapshotRaw.name));
    if (rawSelections.length === 0) {
      paths.set('raw-capture', join(artifacts, captureRaw.name));
      paths.set('raw-backup', join(artifacts, snapshotRaw.name));
    }
    rawSelections.push({
      environment,
      databaseIdentity: identity,
      image,
      captureRaw,
      snapshotRaw,
      captureContents,
    });
  }
  const solverIntent = await publish(1, 'solver-restore-intent', {
    format: 'dependency-solver-restoration',
    version: 1,
    operation: 'restore-solver-only',
    pins,
    images: [
      {
        image: backendImage,
        imageId: 'sha256:' + 'b'.repeat(64),
        semantics: ['cross-project-dependencies-v1'],
      },
    ],
  });
  const storage = [];
  for (const [index, selected] of rawSelections.entries()) {
    const capture = await publish(2 + index * 2, 'activation-capture', {
      format: 'dependency-activation-capture',
      version: 1,
      environment: selected.environment,
      databaseIdentity: selected.databaseIdentity,
      capture: selected.captureRaw,
    });
    const backup = await publish(3 + index * 2, 'activation-backup', {
      format: 'dependency-activation-backup',
      version: 1,
      environment: selected.environment,
      databaseIdentity: selected.databaseIdentity,
      snapshot: selected.snapshotRaw,
      captureSha256: selected.captureRaw.sha256,
    });
    storage.push({ ...selected, capture, backup });
  }
  const participants = await publish(6, 'activation-participants', {
    format: 'complete-dependency-participants',
    version: 1,
    operation: 'activate-installed-dormant',
    sourceSha: pins.sourceSha,
    ownerPublicationSha256: ownerHash,
    selected: {
      backend: { id: backendId, image: backendImage, imageId: 'sha256:' + 'b'.repeat(64) },
      gateway: { id: gatewayId, image: gatewayImage, imageId: 'sha256:' + 'c'.repeat(64) },
      source: {
        id: sourceId,
        runtimeReference,
        ...{
          runtimeImageId: sourcePins.runtimeImageId,
          manifestSha256: sourcePins.manifestSha256,
          environmentSha256: sourcePins.environmentSha256,
        },
      },
    },
    capabilities: {
      backendCandidate: { image: backendImage, semantics: ['cross-project-dependencies-v1'] },
      backendRetained: { image: backendImage, semantics: ['cross-project-dependencies-v1'] },
      gateway: { image: gatewayImage, semantics: ['cross-project-dependencies-v1'] },
      source: [
        ['backend', 'candidate'],
        ['backend', 'retained'],
        ['gateway', 'candidate'],
        ['mcp', 'candidate'],
      ].map(([role, purpose]) => ({ role, purpose, semantics: ['cross-project-dependencies-v1'] })),
    },
    authorities: {
      writerManifestSha256: authorities.writerManifestSha256,
      launchConfigurationSha256: authorities.launchConfigurationSha256,
      hostMachineIdSha256: authorities.hostMachineIdSha256,
      bootId: '12345678-1234-4123-8123-123456789abc',
      filesSha256: 'e'.repeat(64),
    },
    solver: { pins, restorationIntent: solverIntent },
    databases,
    fences: {
      ingressSha256: 'e'.repeat(64),
      sourceSha256: digest(JSON.stringify([sourceIntent, sourceComplete])),
      backendSha256: digest(backendComplete),
      gatewaySha256: digest(gatewayComplete),
      solverSha256: 'e'.repeat(64),
    },
    migrationManifestSha256: migrations.manifestSha256,
  });
  const activationEntries = [];
  const activated = [];
  for (const [index, selected] of storage.entries()) {
    const receipt = {
      protocol: 'wbs-dependency-activation',
      version: 1,
      activationId: attempt + ':' + selected.environment,
      databaseIdentity: selected.databaseIdentity,
      candidateImage: selected.image,
      rollbackImage: selected.image,
      participantProofSha256: participants.sha256,
      migrationCaptureSha256: selected.captureRaw.sha256,
      activatedAt: 1,
    };
    const activationIntent = await publish(7 + index * 2, 'activation-intent', {
      format: 'dependency-activation-intent',
      version: 1,
      environment: selected.environment,
      receipt,
      participantRecord: participants,
      capture: selected.captureRaw,
      backup: selected.backup,
      migrationManifestSha256: migrations.manifestSha256,
    });
    const committed = await publish(8 + index * 2, 'activation-committed', {
      format: 'dependency-activation-committed',
      version: 1,
      environment: selected.environment,
      receipt,
      captureSha256: selected.captureRaw.sha256,
      migrationManifestSha256: migrations.manifestSha256,
    });
    activationEntries.push({
      environment: selected.environment,
      intent: activationIntent,
      capture: selected.capture,
      committed,
    });
    activated.push({ environment: selected.environment, receipt });
  }
  const solverGroup =
    '/user.slice/user-1000.slice/user@1000.service/app.slice/wbs-solver-supervisor.service';
  const solverReady = await publish(12, 'solver-restore-complete', {
    phase: 'solver-ready-participants-fenced',
    observed: {
      unit: { pid: 41, invocation: 'a'.repeat(32), cgroup: solverGroup },
      process: { pid: 41, startTime: '123', cgroup: solverGroup },
      cgroup: { device: '1', inode: '2', populated: true },
    },
  });
  const selected = [
    { role: 'backend', id: backendId },
    { role: 'gateway', id: gatewayId },
    { role: 'source', id: sourceId },
  ].map((participant) => ({
    ...participant,
    originalPolicy: { name: 'always', maximumRetryCount: 0 },
    snapshotSha256: 'e'.repeat(64),
  }));
  const restoration = await publish(13, 'activation-participant-restore-intent', {
    format: 'dependency-participant-restore-intent',
    version: 1,
    participants,
    committed: activationEntries.map(({ environment, committed }) => ({
      environment,
      record: committed,
    })),
    solverIntent,
    solverReady,
    selected,
  });
  const ready = [];
  const policies = [];
  for (const [index, participant] of selected.entries())
    ready.push(
      await publish(14 + index, 'activation-participant-ready', {
        format: 'dependency-participant-ready',
        version: 1,
        restoration,
        role: participant.role,
        id: participant.id,
        readinessSha256: 'e'.repeat(64),
      }),
    );
  for (const [index, participant] of selected.entries())
    policies.push(
      await publish(17 + index, 'activation-participant-policy-intent', {
        format: 'dependency-participant-policy-intent',
        version: 1,
        ready: ready[index],
        role: participant.role,
        id: participant.id,
        policySha256: digest(JSON.stringify(participant.originalPolicy)),
      }),
    );
  const restored = await publish(20, 'activation-participants-restored', {
    format: 'dependency-participants-restored',
    version: 1,
    restoration,
    activated,
    ready,
    policies,
    exposure: 'closed',
    controllers: 'fenced',
  });
  const writers = await publish(21, 'handoff-writers', writersFields, false);
  const sourceManifest = await publish(22, 'handoff-source-manifest', sourceManifestFields, false);
  const admission = await publish(23, 'handoff-admission', {
    format: 'dependency-initial-handoff-admission',
    version: 2,
    runtimeLaunch: {
      format: 'dependency-runtime-launch-pins',
      version: 1,
      sourceSha: pins.sourceSha,
      writerManifestSha256: authorities.writerManifestSha256,
      hostMachineIdSha256: authorities.hostMachineIdSha256,
      projectionSha256: options?.runtimeLaunchSha256 ?? '9'.repeat(64),
      sessionProfiles: fixtureRuntimeProfiles(),
    },
    sourceSha: pins.sourceSha,
    solver: pins,
    authorities,
    writerManifest: writers,
    source: { pins: sourcePins, runtimeReference, manifest: sourceManifest },
    prod: {
      backend: { color: 'blue', image: backendImage },
      gateway: { color: 'blue', image: gatewayImage },
    },
    migrations,
  });
  const handoff = await publish(24, 'handoff-intent', {
    format: 'dependency-initial-handoff-intent',
    version: 1,
    admission,
    participants,
    restoration,
    restored,
    activations: activationEntries,
    ownerPublicationSha256: ownerHash,
    ownerArchive,
    fences,
    ingress: {
      edgeId: 'e'.repeat(64),
      sites: layouts.map((layout) => ({ environment: layout.env, path: layout.siteCaddyPath })),
      originalFilesSha256: 'e'.repeat(64),
      selectedRoutesSha256: 'e'.repeat(64),
      unrelatedRoutesSha256: 'e'.repeat(64),
    },
  });
  const exposureIntent = await publish(25, 'exposure-intent', {
    format: 'dependency-initial-exposure-intent',
    version: 1,
    handoff,
    maintenanceReceiptSha256: 'e'.repeat(64),
    originalSelectedRoutesSha256: 'e'.repeat(64),
    unrelatedRoutesSha256: 'e'.repeat(64),
  });
  const exposure = await publish(26, 'exposure-complete', {
    format: 'dependency-initial-exposure-complete',
    version: 1,
    intent: exposureIntent,
    diskConfigurationSha256: 'e'.repeat(64),
    liveConfigurationSha256: 'e'.repeat(64),
    selectedRoutesSha256: 'e'.repeat(64),
    unrelatedRoutesSha256: 'e'.repeat(64),
  });
  const complete = await publish(27, 'handoff-complete', {
    format: 'dependency-initial-handoff-complete',
    version: 1,
    intent: handoff,
    exposure,
    admission,
    ownerPublicationSha256: ownerHash,
    fences,
  });
  const policy = {
    format: 'dependency-edge-policy',
    version: 1,
    phase: 'active',
    edgeState: root,
    ownerPublicationSha256: ownerHash,
    handoff: complete,
  };
  const policyContents = serialize(policy);
  const pointer = {
    format: 'dependency-edge-handoff',
    version: 1,
    ownerPublicationSha256: ownerHash,
    policySha256: digest(policyContents),
    handoff: complete,
  };
  const preparedPointerContents = serialize({ ...pointer, phase: 'prepared' });
  const completePointerContents = serialize({ ...pointer, phase: 'complete' });
  if (phase !== 'plan') {
    await writeFile(join(root, 'edge-policy.json'), policyContents, { mode: 0o600 });
    await writeFile(
      join(root, 'edge-owner.json'),
      phase === 'H8' ? completePointerContents : preparedPointerContents,
      { mode: 0o600 },
    );
  }
  const writersManifest = manifests.get('handoff-writers');
  const sourceManifestEntry = manifests.get('handoff-source-manifest');
  if (writersManifest === undefined || sourceManifestEntry === undefined)
    throw new Error('authored manifest roster incomplete');
  const fenceOrder = fences.map(({ environment, name }) => {
    const original = originalFences.find(
      (entry) => entry.environment === environment && entry.name === name,
    );
    if (original === undefined) throw new Error('authored original fence absent');
    return original;
  });
  const plan: InitialHandoffPlan = {
    edgeState: root,
    handoff: complete,
    records,
    pending: {
      path: join(root, 'edge-owner.pending'),
      contents: owner,
      device: String(ownerStatus.dev),
      inode: String(ownerStatus.ino),
      parentDevice: String(parent.dev),
      parentInode: String(parent.ino),
      mode: 384,
    },
    manifests: { writers: writersManifest, source: sourceManifestEntry },
    fences: fenceOrder,
    artifacts: {
      migrationManifestContents: manifestContents,
      selected: rawSelections.map((selected) => ({
        environment: selected.environment,
        captureContents: selected.captureContents,
        backup: {
          name: selected.snapshotRaw.name,
          sha256: selected.snapshotRaw.sha256,
          bytes: selected.snapshotRaw.bytes,
        },
      })),
    },
    policyContents,
    preparedPointerContents,
    completePointerContents,
  };
  const artifactRequest = {
    edgeState: root,
    owner,
    activation: {
      format: 'complete-dependency-activation',
      version: 1,
      owner: { sha: pins.sourceSha, layouts },
      activate,
      solver: pins,
      prod: {
        backend: { color: 'blue', image: backendImage },
        gateway: { color: 'blue', image: gatewayImage },
      },
      source: {
        pins: sourcePins,
        manifestContents: sourceManifestEntry.contents,
        runtimeReference,
      },
      authorities: { pins: authorities, writerManifestContents: writersManifest.contents },
      migrations,
    },
    databases,
    selected: rawSelections.map(({ environment, captureRaw, snapshotRaw }) => ({
      environment,
      capture: captureRaw,
      backup: snapshotRaw,
    })),
  };
  await chmod(root, 0o700);
  return { root, layouts, paths, policy, owner, pins, plan, artifactRequest };
}

/** Independent typed manager/proc/fragment model for owned runtime projection cases; never native account or manager proof. */
const RUNTIME_SESSION_RELATIONSHIPS = String.raw`FIXTURE_RELATIONSHIPS=['requires','wants','requisite','bindsTo','partOf','upholds','requiredBy','requisiteOf','wantedBy','boundBy','upheldBy','consistsOf','conflicts','conflictedBy','before','after','onSuccess','onSuccessOf','onFailure','onFailureOf','triggers','triggeredBy','propagatesReloadTo','reloadPropagatedFrom','propagatesStopTo','stopPropagatedFrom','joinsNamespaceOf','requiresMountsFor']
`;

/** Fixed owned Host/account model; CLI consumers do not embed unused independent pin preimages. */
export const RUNTIME_SESSION_HOST =
  String.raw`from types import SimpleNamespace
` +
  RUNTIME_SESSION_RELATIONSHIPS +
  String.raw`class FixtureRawPort:
    def __init__(self,host,path):self.host=host;self.path=path;self.offset=0;self.closed=False
    def stat(self):assert not self.closed;return self.host.metadata(self.path,False)
    def read(self,length):
        assert not self.closed
        content=self.host.fragment(self.path);chunk=content[self.offset:self.offset+length];self.offset+=len(chunk);return chunk
    def close(self):assert not self.closed;self.closed=True
class RuntimeSessionFixture:
    def __init__(self,sessions,fault='none',system_id='a'*32,user_id='b'*32):
        self.sessions=[{'id':sid,'uid':uid,'name':'root' if uid==0 else 'puni1','seat':'','path':'/org/freedesktop/login1/session/'+sid,'user':'/org/freedesktop/login1/user/u'+str(uid),'scope':'session-'+sid+'.scope','leader':5000+index} for index,(sid,uid) in enumerate(sessions)]
        self.fault=fault;self.system_id=system_id;self.user_id=user_id;self.counts={};self.queries=[];self.deadline=time.monotonic()+10;self.internal_processes={};self.children=[]
    def check(self):require(time.monotonic()<self.deadline,'owned fixture deadline exceeded')
    def count(self,key):self.counts[key]=self.counts.get(key,0)+1;return self.counts[key]
    def fragment(self,path):
        if path=='/etc/crontab':return b'# owned fixture\n'
        session=next(entry for entry in self.sessions if path=='/run/systemd/transient/'+entry['scope'])
        content=('[Unit]\nDescription=Session '+session['id']+' of User '+session['name']+'\n[Scope]\nSlice=user-'+str(session['uid'])+'.slice\n').encode()
        if self.fault=='extra-fragment':content+=b'TasksMax=99\n'
        if self.fault=='duplicate-description':content+=b'[Unit]\nDescription=Session '+session['id'].encode()+b' of User '+session['name'].encode()+b'\n'
        return content
    def metadata(self,path,follow=True):
        file=path=='/etc/crontab' or path.startswith('/run/systemd/transient/')
        size=len(self.fragment(path)) if file else 0
        mode=(stat.S_IFREG|0o644) if file else (stat.S_IFDIR|0o755)
        if self.fault=='foreign-fragment' and path.startswith('/run/systemd/transient/'):uid=1000
        else:uid=0
        return SimpleNamespace(st_dev=1,st_ino=int(hashlib.sha256(path.encode()).hexdigest()[:8],16),st_mode=mode,st_size=size,st_mtime_ns=7,st_ctime_ns=9,st_uid=uid,st_gid=0)
    def regular(self,path,limit):
        if path=='/etc/anacrontab':raise FileNotFoundError(path)
        content=self.fragment(path);assert len(content)<=limit;return content,metadata_key(self.metadata(path,False))
    def open_runtime_fragment(self,path):
        return {'file':FixtureRawPort(self,path),'parents':[(parent,FixtureRawPort(self,parent)) for parent in ['/','/run','/run/systemd','/run/systemd/transient']]}
    def exists(self,path):assert path=='/etc/anacrontab';return False
    def resolve(self,path):return path
    def listing(self,path,limit):return []
    def read(self,path,limit):
        if path=='/etc/machine-id':return b'0123456789abcdef0123456789abcdef\n'
        if path=='/proc/41/stat':return b'41 (coordinator) S '+b'0 '*18+b'123\n'
        if path=='/proc/41/cgroup':return b'0::/fixture\n'
        session=next((entry for entry in self.sessions if path.startswith('/proc/'+str(entry['leader']+(100 if self.fault=='leader' else 0))+'/') or path.startswith('/proc/'+str(entry['leader'])+'/')),None)
        if session is None:raise AssertionError('unexpected owned read '+path)
        if path.endswith('/stat'):return (str(session['leader'])+' (leader) S '+'0 '*18+'456\n').encode()
        if path.endswith('/cgroup'):return ('0::/user.slice/user-'+str(session['uid'])+'.slice/'+session['scope']+'\n').encode()
        raise AssertionError('unexpected owned read '+path)
    def query(self,argv):
        self.check();self.queries.append(list(argv));manager='user' if '--user' in argv else 'system'
        if argv[0]=='/usr/bin/crontab':return 1,b'',('no crontab for '+argv[2]+'\n').encode()
        names=['user-0.slice','user-1000.slice']+[entry['scope'] for entry in self.sessions]
        if 'list-unit-files' in argv:return 0,b'',b''
        if 'list-units' in argv:return 0,(''.join(name+' loaded active active\n' for name in names) if manager=='system' else '').encode(),b''
        def reply(signature,value):
            if self.fault=='duplicate-json' and 'GetId' in argv:return 0,b'{"type":"s","type":"s","data":["'+b'a'*32+b'"]}',b''
            if self.fault=='oversize-reply' and 'GetId' in argv:return 0,b' '*1048577,b''
            if self.fault=='wrong-bus-wrapper' and 'GetId' in argv:value=value[0]
            if self.fault=='wrong-owner-uid' and 'GetConnectionUnixUser' in argv:value=[999]
            return 0,json.dumps({'type':signature,'data':value},separators=(',',':')).encode(),b''
        def fields(name):
            session=next((entry for entry in self.sessions if entry['scope']==name),None)
            return {'Id':name,'Names':name,'LoadState':'loaded','FragmentPath':'/run/systemd/transient/'+name if session else '','DropInPaths':'','Transient':'yes' if session else 'no','NeedDaemonReload':'no','Triggers':'','TriggeredBy':'','ActiveState':'active','SubState':'running','MainPID':'0','ControlPID':'0','InvocationID':'','ControlGroup':'/user.slice/user-'+str(session['uid'])+'.slice/'+name if session else '','Job':'0'}
        if 'show' in argv:
            return 0,('\n'.join(key+'='+value for key,value in fields(argv[argv.index('show')+1]).items())+'\n').encode(),b''
        if 'call' in argv:
            offset=argv.index('call');method=argv[offset+4]
            if method=='GetId':
                count=self.count('bus:'+manager);value=self.system_id if manager=='system' else self.user_id
                if self.fault==manager+'-bus' and count>=3:value='c'*32
                return reply('s',[value])
            if method=='GetNameOwner':return reply('s',[':1.4' if manager=='user' else ':1.3' if argv[-1]=='org.freedesktop.login1' else ':1.2'])
            if method=='GetConnectionUnixUser':return reply('u',[1000 if manager=='user' else 0])
            if method=='ListSessions':
                rows=[[entry['id'],entry['uid'],entry['name'],entry['seat'],entry['path']] for entry in self.sessions]
                if self.fault=='roster-churn' and self.count('roster')>1:rows=[]
                if self.fault=='duplicate-roster':rows=rows+rows
                if self.fault=='boolean-uid':rows[0][1]=False
                return reply('a(susso)',[rows])
            if method=='GetSession':
                entry=next(entry for entry in self.sessions if entry['id']==argv[-1]);path=entry['path']
                if self.fault=='get-session' and self.count('get-session:'+entry['id'])>1:path=path+'changed'
                return reply('o',[path])
            if method=='GetUnitByPID':
                entry=next(entry for entry in self.sessions if entry['leader']==int(argv[-1]) or self.fault=='leader' and entry['leader']+100==int(argv[-1]));return reply('o',[unit_path(entry['scope'])])
            if method=='LoadUnit':return reply('o',[unit_path(argv[-1])])
            raise AssertionError('unexpected owned method '+method)
        if 'get-property' in argv:
            path,interface,name=argv[-3:]
            if interface=='org.freedesktop.login1.Session':
                entry=next(entry for entry in self.sessions if entry['path']==path);values={'Id':('s',entry['id']),'User':('(uo)',[entry['uid'],entry['user']]),'Name':('s',entry['name']),'Scope':('s',entry['scope']),'Leader':('u',entry['leader'])};signature,value=values[name]
                count=self.count('session:'+entry['id']+':'+name)
                if self.fault=='user-tuple' and name=='User' and count>1:value=[entry['uid'],entry['user']+'changed']
                if self.fault=='leader' and name=='Leader' and count>1:value=entry['leader']+100
                return reply(signature,value)
            unit=next(name for name in names if unit_path(name)==path);ordinary=fields(unit);session=next((entry for entry in self.sessions if entry['scope']==unit),None)
            if interface=='org.freedesktop.systemd1.Scope':
                if name=='Slice':return reply('s','user-'+str(session['uid'])+'.slice')
                if name=='ControlGroup':
                    value=ordinary['ControlGroup']
                    if self.fault=='scope-cgroup' and self.count('scope-cgroup:'+unit)>1:value+='/changed'
                    return reply('s',value)
                raise AssertionError(name)
            if name=='SourcePath':return reply('s','')
            relation=next((key for key in FIXTURE_RELATIONSHIPS if key[0].upper()+key[1:]==name),None)
            if relation is not None:
                value=['user-'+str(session['uid'])+'.slice'] if relation=='requires' and session else []
                if self.fault=='relationship' and relation=='wants' and self.count('relation:'+unit+':'+name)>1:value=['user-'+str(session['uid'])+'.slice']
                return reply('as',value)
            signature='b' if name in ['Transient','NeedDaemonReload'] else 'as' if name in ['Names','DropInPaths','Triggers','TriggeredBy'] else 's'
            value=ordinary[name];value=value=='yes' if signature=='b' else value.split() if signature=='as' else value
            return reply(signature,value)
        raise AssertionError('unexpected owned query '+repr(argv))
def fixture_accounts():
    names={0:'root',1000:'puni1'}
    pwd.getpwuid=lambda uid:SimpleNamespace(pw_uid=uid,pw_name=names[uid])
    pwd.getpwnam=lambda name:SimpleNamespace(pw_uid=next(uid for uid,value in names.items() if value==name),pw_name=name)
    os.geteuid=lambda:0
`;

/** Independent pin preimages supplement the same fixed typed Host used by compiled consumers. */
export const RUNTIME_SESSION_FIXTURE =
  RUNTIME_SESSION_HOST +
  String.raw`def fixture_unit(name,scope=False,uid=0):
    return {'manager':'system','name':name,'canonicalId':name,'names':[name],'unitFileState':'loaded-only','loadState':'loaded','fragment':{'path':'/run/systemd/transient/'+name,'sha256':''} if scope else None,'dropIns':[],'transient':scope,'commands':[],'triggers':[],'triggeredBy':[]}
def fixture_profile(uid):
    member=fixture_unit('@logind-session-scope',True,uid)
    member['fragment']={'path':'@logind-session-fragment','sha256':hashlib.sha256(('[Unit]\nDescription=@logind-session-description\n[Scope]\nSlice=user-'+str(uid)+'.slice\n').encode()).hexdigest()}
    relationships={key:[] for key in FIXTURE_RELATIONSHIPS};relationships['slice']='user-'+str(uid)+'.slice';relationships['requires']=[relationships['slice']]
    return {'version':1,'uid':uid,'unit':member,'relationships':relationships}
def fixture_profiles():
    return [{'sha256':hashlib.sha256(b'wbs-dependency-logind-scope\x00v1\x00'+json.dumps(fixture_profile(uid),sort_keys=True,separators=(',',':')).encode()).hexdigest(),'uid':uid} for uid in [0,1000]]
def fixture_runtime_hash():
    cron=[{'source':'crontab:root','state':'absent'},{'source':'crontab:puni1','state':'absent'},{'source':'/etc/crontab','state':'present','sha256':hashlib.sha256(b'# owned fixture\n').hexdigest()},{'source':'/etc/anacrontab','state':'absent'}]
    projection={'version':1,'cron':sorted(cron,key=lambda entry:entry['source']),'units':[fixture_unit('user-0.slice'),fixture_unit('user-1000.slice')],'sessionProfiles':fixture_profiles()}
    return hashlib.sha256(b'wbs-dependency-runtime-launch\x00v1\x00'+json.dumps(projection,sort_keys=True,separators=(',',':')).encode()).hexdigest()

`;

/** Canonical bytes independently prepared by owned fixtures; production encoder is not consulted. */
export function fixtureCanonical(value: unknown): string {
  if (Array.isArray(value))
    return '[' + value.map((entry: unknown) => fixtureCanonical(entry)).join(',') + ']';
  if (typeof value === 'object' && value !== null)
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + fixtureCanonical(Reflect.get(value, key)))
        .join(',') +
      '}'
    );
  const encoded: unknown = JSON.stringify(value);
  if (typeof encoded !== 'string') throw new Error('owned pin preimage is not JSON');
  return encoded;
}
/** Independent complete profile inputs for root and puni1 in the typed owned model. */
export function fixtureRuntimeProfiles() {
  const keys = [
    'requires',
    'wants',
    'requisite',
    'bindsTo',
    'partOf',
    'upholds',
    'requiredBy',
    'requisiteOf',
    'wantedBy',
    'boundBy',
    'upheldBy',
    'consistsOf',
    'conflicts',
    'conflictedBy',
    'before',
    'after',
    'onSuccess',
    'onSuccessOf',
    'onFailure',
    'onFailureOf',
    'triggers',
    'triggeredBy',
    'propagatesReloadTo',
    'reloadPropagatedFrom',
    'propagatesStopTo',
    'stopPropagatedFrom',
    'joinsNamespaceOf',
    'requiresMountsFor',
  ];
  return ([0, 1000] as const).map((uid) => {
    const slice = 'user-' + String(uid) + '.slice';
    const relationships: Record<string, unknown> = { slice };
    for (const key of keys) relationships[key] = key === 'requires' ? [slice] : [];
    const unit = {
      manager: 'system',
      name: '@logind-session-scope',
      canonicalId: '@logind-session-scope',
      names: ['@logind-session-scope'],
      unitFileState: 'loaded-only',
      loadState: 'loaded',
      fragment: {
        path: '@logind-session-fragment',
        sha256: digest(
          '[Unit]\nDescription=@logind-session-description\n[Scope]\nSlice=' + slice + '\n',
        ),
      },
      dropIns: [],
      transient: true,
      commands: [],
      triggers: [],
      triggeredBy: [],
    };
    return {
      sha256: digest(
        'wbs-dependency-logind-scope\0v1\0' +
          fixtureCanonical({ version: 1, uid, unit, relationships }),
      ),
      uid,
    };
  });
}
