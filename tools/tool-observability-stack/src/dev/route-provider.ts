import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  readSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, hostname, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { type } from 'arktype';

import { createBackendAcceptance, createScopedBackendAcceptance } from './acceptance';
import { parseCheckpoint } from './checkpoint';
import { decode, publish, readPrivate } from './history-cli';
import {
  hashHistory,
  readHistoryReceipt,
  routeCommitment,
  verifyHistory,
} from './history-provider';
import { assessObservation } from './observation';
import { createOtlpSender, encodeOtlp } from './otlp';
import { collectProbe, type ProbeObservation } from './probe';
import {
  type AcceptanceExpectation,
  EvidenceReference,
  type EvidenceReference as Reference,
  readRouteAcceptance,
} from './route';
import { renderObserverUnits } from './runtime';
import { createSshHealthReader, executeBounded } from './source';
import { parseTransportBinding, type TransportEndpoint } from './transport';

export { parseGrafanaJournal } from './grafana';
export { decode, publish, readPrivate } from './history-cli';
export { hashHistory } from './history-provider';

const hash = /^[a-f0-9]{64}$/;
const revision = /^[a-f0-9]{40}$/;
const Capture = type({
  '+': 'reject',
  version: '1',
  kind: "'observed-runtime-commands'",
  target: hash,
  source: hash,
  startedAt: 'number',
  completedAt: 'number',
  commands: type({
    '+': 'reject',
    argv: 'string[]',
    exitCode: '0',
    stdout: EvidenceReference,
  }).array(),
});
const Projection = type({
  '+': 'reject',
  version: '1',
  kind: "'operator-reviewed-observation'",
  check: 'string',
  target: hash,
  captureSHA256: hash,
  finding: "'reviewed-satisfied'",
  observations: 'string[]',
});
const ObservationIdentity = type({
  '+': 'reject',
  environment: "'dev'",
  service: "'be-01'",
  revision,
  observationId: 'string>0',
});
const Proof = type({ '+': 'reject', kind: "'record'" }).or({
  '+': 'reject',
  kind: "'trace'",
  traceId: 'string>0',
  parentSpanId: 'string>0',
  childSpanId: 'string>0',
  childParentSpanId: 'string>0',
});
const Found = type({
  '+': 'reject',
  state: "'found'",
  identity: ObservationIdentity,
  observedAt: 'number',
  proof: Proof,
});
const WindowCapture = type({
  '+': 'reject',
  version: '1',
  kind: "'stored-observation'",
  target: hash,
  source: hash,
  identity: ObservationIdentity,
  observedAt: 'number',
  evidence: { '+': 'reject', log: Found, metric: Found, trace: Found },
  queries: EvidenceReference.array(),
});
/** Same descriptor-bound private IO as retained history; expected byte digests come from reviewed input. */
export function readPinnedRouteFile(reference: Reference): Buffer {
  const bytes = readPrivate(reference.path);
  // Proof: Task79 fault 08 bypassed artifact-digest; 'refuses output-drift' failed; bytes restored.
  if (createHash('sha256').update(bytes).digest('hex') !== reference.sha256)
    throw new Error('route-file-digest');
  return bytes;
}
/** Reads complete actual command/projection references, bounded in aggregate. Review is an operator
 * trust prerequisite, not cryptographic proof or automated certification of arbitrary command output.
 */
export function readRouteEvidence(
  reference: Reference,
  expected: AcceptanceExpectation,
  now: number,
) {
  const cohort = readRouteAcceptance(decode(readPinnedRouteFile(reference)), expected, now);
  let total = 0;
  const read = (link: Reference) => {
    const bytes = readPinnedRouteFile(link);
    total += bytes.length;
    if (total > 8 * 1024 * 1024) throw new Error('route-evidence-size');
    return bytes;
  };
  for (const role of ['rehearsal', 'staged'] as const) {
    const member = cohort[role];
    for (const window of member.windows) {
      const capture = WindowCapture(decode(read(window.capture)));
      // Proof: incomplete advancing-window trace was accepted before this production assessment (21-window-behavior-red).
      if (
        capture instanceof type.errors ||
        capture.target !== member.binding.target ||
        capture.source !== member.binding.source ||
        capture.identity.revision !== member.binding.observedRevision ||
        capture.identity.observationId !== window.observationId ||
        capture.observedAt !== window.observedAt ||
        capture.queries.length < 1 ||
        capture.queries.length > 16 ||
        assessObservation(capture.identity, capture.evidence, window.observedAt, 120000).state !==
          'complete'
      )
        throw new Error('route-window-evidence');
      for (const query of capture.queries) read(query);
    }
    for (const check of member.checks) {
      // Proof: Task79 fault 09 bypassed capture-parser; 'refuses failed-command' failed; bytes restored.
      // Proof: Task79 fault 10 bypassed review-parser; 'refuses failed-review' failed; bytes restored.
      const capture = Capture(decode(read(check.capture))),
        projection = Projection(decode(read(check.projection)));
      if (capture instanceof type.errors || projection instanceof type.errors)
        throw new Error('route-evidence-format');
      if (
        capture.target !== member.binding.target ||
        capture.source !== member.binding.source ||
        !Number.isFinite(capture.startedAt) ||
        !Number.isFinite(capture.completedAt) ||
        capture.startedAt < member.startedAt ||
        capture.completedAt > member.completedAt ||
        capture.startedAt > capture.completedAt ||
        capture.commands.length < 1 ||
        capture.commands.length > 16 ||
        capture.commands.some(
          (command) =>
            command.argv.length < 1 ||
            command.argv.length > 64 ||
            command.argv.some((argument) => argument.length > 1024),
        ) ||
        projection.target !== member.binding.target ||
        projection.check !== check.check ||
        projection.captureSHA256 !== check.capture.sha256 ||
        projection.observations.length < 1 ||
        projection.observations.length > 64 ||
        projection.observations.some(
          (observation) => observation.length === 0 || observation.length > 2048,
        )
      )
        // Proof: Task79 fault 11 bypassed evidence-binding; 'refuses wrong-projection' failed; bytes restored.
        throw new Error('route-evidence-binding');
      for (const command of capture.commands) read(command.stdout);
    }
  }
  return cohort;
}

export const RouteDescriptor = type({ '+': 'reject', kind: "'retained-loopback'" }).or({
  '+': 'reject',
  kind: "'authenticated'",
  directory: 'string>0',
});
export type RouteDescriptor = typeof RouteDescriptor.infer;
/** Immutable observer artifact and physical source authority. Application revisions progress per observation. */
export const ObserverPin = type({
  '+': 'reject',
  hostname: 'string>0',
  user: 'string>0',
  home: 'string>0',
  sourceRevision: revision,
  binarySHA256: hash,
  manifestSHA256: hash,
  tunnelSHA256: hash,
  containerId: hash,
});
export type ObserverPin = typeof ObserverPin.infer;
export interface ObserverContext {
  home: string;
  hostname: string;
  user: string;
  systemctl: string;
  ssh: string;
  readProcess: (pid: number) => { executable: string; arguments: string[] };
}
/** Observer-local only. Existing credentials/tools must already be accessible; this creates none. */
export function localObserverContext(): ObserverContext {
  return {
    home: homedir(),
    hostname: hostname(),
    user: userInfo().username,
    systemctl: 'systemctl',
    ssh: 'ssh',
    readProcess: (pid) => {
      const descriptor = openSync(`/proc/${String(pid)}/cmdline`, constants.O_RDONLY);
      try {
        const bytes = Buffer.alloc(8193);
        let length = 0;
        while (length < bytes.length) {
          const count = readSync(descriptor, bytes, length, bytes.length - length, null);
          if (count === 0) break;
          length += count;
        }
        // Proof: Task79 fault 22 bypassed process-size; 'actual process reader refuses oversized' failed; bytes restored.
        if (length > 8192) throw new Error('route-process-size');
        return {
          executable: readlinkSync(`/proc/${String(pid)}/exe`),
          arguments: bytes.subarray(0, length).toString().split('\0').filter(Boolean),
        };
      } finally {
        closeSync(descriptor);
      }
    },
  };
}
function digestBytes(bytes: string | Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}
function unitPath(context: ObserverContext) {
  return join(context.home, '.config/systemd/user/puni-dev-observability.service');
}
function statePath(context: ObserverContext) {
  return join(context.home, '.local/state/puni-dev-observability');
}
function checkDirectory(path: string, privateMode = false): void {
  const metadata = lstatSync(path);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== process.getuid?.() ||
    // Proof: Task79 fault 18 bypassed directory; 'current observer refuses directory' failed; bytes restored.
    (metadata.mode & (privateMode ? 0o077 : 0o022)) !== 0
  )
    throw new Error('route-directory-ownership');
}
function checkParents(path: string, root: string): void {
  if (!resolve(path).startsWith(`${resolve(root)}/`)) throw new Error('route-path');
  let parent = dirname(path);
  for (;;) {
    checkDirectory(parent);
    if (parent === root) break;
    parent = dirname(parent);
  }
}
/** Resolve only existing private authenticated bindings under this observer's owned state root. */
export function resolveObserverRoutes(route: RouteDescriptor, context: ObserverContext) {
  if (route.kind === 'retained-loopback') {
    return {
      otlp: 'http://127.0.0.1:14318',
      elastic: 'http://127.0.0.1:19200',
      prometheus: 'http://127.0.0.1:19090',
    };
  }
  const root = join(statePath(context), 'bindings');
  if (!/^\/[A-Za-z0-9._/-]+$/.test(route.directory)) throw new Error('route-path');
  checkParents(join(route.directory, 'otlp.json'), root);
  const read = (name: string) =>
    parseTransportBinding(decode(readPrivate(join(route.directory, `${name}.json`))));
  const routes = { otlp: read('otlp'), elastic: read('elastic'), prometheus: read('prometheus') };
  if (
    routes.otlp.authentication.kind !== 'mtls' ||
    routes.elastic.authentication.kind !== 'basic' ||
    routes.prometheus.authentication.kind !== 'basic'
  )
    // Proof: Task79 fault 19 bypassed ingest-role; 'current observer refuses binding-role' failed; bytes restored.
    throw new Error('route-authentication');
  return routes;
}
export function observerRouteCommitment(routes: {
  otlp: TransportEndpoint;
  elastic: TransportEndpoint;
  prometheus: TransportEndpoint;
}) {
  return hashHistory({
    otlp: routeCommitment(routes.otlp),
    elastic: routeCommitment(routes.elastic),
    prometheus: routeCommitment(routes.prometheus),
  });
}
/** Exact existing unit policy, replacing only its three legacy endpoint flags with preexisting binding paths. */
export function renderRoutedObserverUnit(
  sourceRevision: string,
  route: RouteDescriptor,
  home = '/home/claw',
): string {
  if (!/^\/[A-Za-z0-9._/-]+$/.test(home)) throw new Error('route-path');
  const original = renderObserverUnits(sourceRevision)['puni-dev-observability.service'].replaceAll(
    '/home/claw',
    home,
  );
  if (route.kind === 'retained-loopback') return original;
  if (!/^\/[A-Za-z0-9._/-]+$/.test(route.directory)) throw new Error('route-path');
  return original.replace(
    '--otlp http://127.0.0.1:14318 --elastic http://127.0.0.1:19200 --prometheus http://127.0.0.1:19090',
    `--otlp-binding ${route.directory}/otlp.json --elastic-binding ${route.directory}/elastic.json --prometheus-binding ${route.directory}/prometheus.json`,
  );
}
async function systemctl(context: ObserverContext, arguments_: string[]): Promise<string> {
  const captured = await executeBounded(
    [context.systemctl, '--user', ...arguments_],
    '',
    AbortSignal.timeout(30000),
  );
  if (captured.exitCode !== 0) throw new Error('route-systemctl-failed');
  return captured.stdout;
}
/** Observe the real fragment, loaded command, overrides, process and immutable executable manifest. */
export async function inspectObserver(
  pin: ObserverPin,
  route: RouteDescriptor,
  expectedUnit: string,
  context: ObserverContext,
  recovery?: {
    units: readonly [string, string];
    routes: readonly [RouteDescriptor, RouteDescriptor];
  },
) {
  // Proof: Task79 fault 12 bypassed observer-identity; 'current observer refuses host' failed; bytes restored.
  if (pin.home !== context.home || pin.hostname !== context.hostname || pin.user !== context.user)
    throw new Error('route-observer-identity');
  const path = unitPath(context);
  checkParents(path, context.home);
  const bytes = readPrivate(path).toString('utf8');
  if (recovery === undefined ? bytes !== expectedUnit : !recovery.units.includes(bytes))
    throw new Error('route-unit-drift');
  const executable = join(
    context.home,
    '.local/lib/puni-dev-observability',
    pin.sourceRevision.slice(0, 9),
    'observer',
  );
  checkParents(executable, context.home);
  const binary = lstatSync(executable);
  if (
    !binary.isFile() ||
    binary.isSymbolicLink() ||
    binary.uid !== process.getuid?.() ||
    (binary.mode & 0o022) !== 0 ||
    // Proof: Task79 fault 13 bypassed binary; 'current observer refuses binary' failed; bytes restored.
    digestBytes(readFileSync(executable)) !== pin.binarySHA256
  )
    throw new Error('route-binary');
  const manifest = readPinnedRouteFile({
    path: join(dirname(executable), 'manifest.json'),
    sha256: pin.manifestSHA256,
  });
  const Manifest = type({
    '+': 'reject',
    sourceCommit: revision,
    binarySha256: hash,
    binaryBytes: 'number.integer>0',
    target: "'bun-linux-x64'",
    builtOn: "'local'",
    bunVersion: 'string>0',
  });
  const declaration = Manifest(decode(manifest));
  // Proof: Task79 fault 14 bypassed manifest; 'current observer refuses manifest' failed; bytes restored.
  if (
    declaration instanceof type.errors ||
    declaration.sourceCommit !== pin.sourceRevision ||
    declaration.binarySha256 !== pin.binarySHA256 ||
    declaration.binaryBytes !== binary.size
  )
    throw new Error('route-manifest');
  const tunnel = readPrivate(
    join(context.home, '.config/systemd/user/puni-dev-observability-tunnel.service'),
  );
  // Proof: Task79 fault 15 bypassed tunnel; 'current observer refuses tunnel' failed; bytes restored.
  if (digestBytes(tunnel) !== pin.tunnelSHA256) throw new Error('route-tunnel');
  const wire = await systemctl(context, [
    'show',
    'puni-dev-observability.service',
    '--property=FragmentPath,DropInPaths,NeedDaemonReload,ExecStart,ActiveState,SubState,MainPID,ControlGroup',
  ]);
  const properties = new Map(
    wire
      .trim()
      .split('\n')
      .map((line) => {
        const split = line.indexOf('=');
        return [line.slice(0, split), line.slice(split + 1)];
      }),
  );
  const command = expectedUnit
    .split('\n')
    .find((line) => line.startsWith('ExecStart='))
    ?.slice(10);
  const loaded = properties
    .get('ExecStart')
    ?.match(/argv\[\]=([^;]+) ;/)?.[1]
    .trim();
  const pid = Number(properties.get('MainPID'));
  const knownCommands = recovery?.units.map((unit) =>
    unit
      .split('\n')
      .find((line) => line.startsWith('ExecStart='))
      ?.slice(10),
  );
  const running =
    properties.get('ActiveState') === 'active' &&
    properties.get('SubState') === 'running' &&
    Number.isSafeInteger(pid) &&
    pid > 0;
  const stopped =
    recovery !== undefined &&
    pid === 0 &&
    properties.get('ControlGroup') === '' &&
    ((properties.get('ActiveState') === 'failed' && properties.get('SubState') === 'failed') ||
      (properties.get('ActiveState') === 'inactive' && properties.get('SubState') === 'dead'));
  if (
    command === undefined ||
    properties.get('FragmentPath') !== path ||
    properties.get('DropInPaths') !== '' ||
    (recovery === undefined
      ? properties.get('NeedDaemonReload') !== 'no' || loaded !== command
      : !['yes', 'no'].includes(properties.get('NeedDaemonReload') ?? '') ||
        loaded === undefined ||
        knownCommands?.includes(loaded) !== true) ||
    // Proof: Task79 fault 20 bypassed effective-unit; 'effective observer process and override' failed; bytes restored.
    (!running && !stopped)
  )
    throw new Error('route-effective-unit');
  if (running) {
    const processState = context.readProcess(pid);
    // Proof: Task79 fault 21 bypassed process; 'effective observer process and override' failed; bytes restored.
    if (
      processState.executable !== executable ||
      (recovery === undefined
        ? processState.arguments.join(' ') !== loaded
        : knownCommands?.includes(processState.arguments.join(' ')) !== true)
    )
      throw new Error('route-process');
  }
  const checkpointPath = join(statePath(context), 'probe.json');
  const observation = parseCheckpoint(readPrivate(checkpointPath).toString('utf8'));
  if (
    observation?.producerVersion !== pin.sourceRevision ||
    !observation.success ||
    observation.revision === null ||
    observation.source.kind !== 'ssh-dev-container' ||
    !observation.source.containerValidated ||
    observation.source.containerId !== pin.containerId
  )
    // Proof: Task79 fault 16 bypassed checkpoint; 'current observer refuses checkpoint' failed; bytes restored.
    throw new Error('route-checkpoint');
  const source = await createSshHealthReader(context.ssh)(AbortSignal.timeout(20000));
  if (
    !source.success ||
    source.revision === null ||
    source.source.kind !== 'ssh-dev-container' ||
    !source.source.containerValidated ||
    source.source.containerId !== pin.containerId
  )
    // Proof: removing this refusal accepted a foreign physical container (71-source-physical-fault); app progress is admitted.
    throw new Error('route-source');
  const selectedRoute =
    recovery === undefined ? route : recovery.routes[knownCommands?.[0] === loaded ? 0 : 1];
  const routes = resolveObserverRoutes(selectedRoute, context);
  return {
    unit: bytes,
    unitSHA256: digestBytes(bytes),
    loadedCommand: loaded,
    routes: observerRouteCommitment(routes),
    observation: { ...observation, revision: observation.revision },
    pid,
  };
}
/** Query the actual previously stored correlated observation; an ingest acknowledgment cannot pass. */
export async function inspectRouteHealth(
  route: RouteDescriptor,
  context: ObserverContext,
  checkpoint: string | ProbeObservation,
) {
  const previous =
    typeof checkpoint === 'string'
      ? parseCheckpoint(readPrivate(checkpoint).toString('utf8'))
      : checkpoint;
  // Proof: Task79 fault 16 bypassed checkpoint; 'current observer refuses checkpoint' failed; bytes restored.
  if (previous === undefined || !previous.success || previous.revision === null)
    throw new Error('route-checkpoint');
  const routes = resolveObserverRoutes(route, context);
  const backend = createBackendAcceptance({
    elastic: routes.elastic,
    prometheus: routes.prometheus,
    freshnessMs: 120000,
  });
  const signal = AbortSignal.timeout(30000);
  // Proof: the actual delayed-store component failed immediately before bounded fixed-observation convergence (23-post-query-red).
  for (let attempt = 0; attempt < 6; attempt++) {
    signal.throwIfAborted();
    const report = await backend.inspect(previous, signal);
    if (report.health.state === 'complete')
      return {
        observationId: previous.observationId,
        observedAt: previous.observedAt,
        source: previous.source,
        revision: previous.revision,
      };
    if (attempt < 5) await Bun.sleep(1000);
  }
  throw new Error('route-stored-health');
}
/** One actual-source canary with the operation producer identity and isolated, observation-correlated
 * metrics. It never changes observer gauges/checkpoints. OTLP acknowledgement precedes stored-query convergence.
 */
export async function probeRouteHealth(
  route: RouteDescriptor,
  context: ObserverContext,
  pin: ObserverPin,
  producerRevision: string,
) {
  if (!revision.test(producerRevision)) throw new Error('route-producer-revision');
  const routes = resolveObserverRoutes(route, context),
    signal = AbortSignal.timeout(75000);
  const send = createOtlpSender(routes.otlp);
  const metricNames = [
    'puni_route_canary_observed_timestamp_seconds',
    'puni_route_canary_revision_info',
    'puni_route_canary_success',
  ] as const;
  const previous = await collectProbe({
    readHealth: createSshHealthReader(context.ssh),
    publication: {
      publish: async (observation, signal) => {
        const encoded = encodeOtlp(observation);
        // Proof: real OTLP scope coexistence failed stored health before namespace/correlation isolation (66-canary-coexist-red).
        const renamed: Partial<Record<string, string>> = {
          puni_dev_probe_observed_timestamp_seconds: metricNames[0],
          puni_dev_revision_info: metricNames[1],
          puni_dev_probe_success: metricNames[2],
        };
        encoded.metrics.resourceMetrics[0].scopeMetrics[0].metrics =
          encoded.metrics.resourceMetrics[0].scopeMetrics[0].metrics.flatMap((metric) => {
            const name = renamed[metric.name];
            if (name === undefined) return [];
            return [
              {
                ...metric,
                name,
                gauge: {
                  dataPoints: metric.gauge.dataPoints.map((point) => ({
                    ...point,
                    attributes: [
                      ...point.attributes,
                      {
                        key: 'puni_observation_id',
                        value: { stringValue: observation.observationId },
                      },
                    ],
                  })),
                },
              },
            ];
          });
        for (const kind of ['logs', 'metrics', 'traces'] as const) {
          const publication = await send(kind, encoded[kind], signal);
          if (publication.state !== 'acknowledged') return publication;
        }
        return { state: 'acknowledged' };
      },
    },
    producerVersion: producerRevision,
    signal,
  });
  if (
    !previous.success ||
    previous.publication.state !== 'acknowledged' ||
    previous.revision === null ||
    previous.source.kind !== 'ssh-dev-container' ||
    !previous.source.containerValidated ||
    previous.source.containerId !== pin.containerId
  )
    throw new Error('route-canary-publication');
  const backend = createScopedBackendAcceptance(
    {
      elastic: routes.elastic,
      prometheus: routes.prometheus,
      freshnessMs: 120000,
    },
    {
      environment: 'dev',
      service: 'be-01',
      producer: 'puni-dev-probe',
      namespace: 'dev',
      sourceIdentity: 'legacy-ssh',
      provenance: 'measured',
      metricNames,
      metricObservationId: previous.observationId,
      logName: 'dev health observation',
      childName: 'GET be-01 /health',
    },
  );
  for (let attempt = 0; attempt < 15; attempt++) {
    const report = await backend.inspect(previous, signal);
    if (report.health.state === 'complete')
      return {
        observationId: previous.observationId,
        observedAt: previous.observedAt,
        producerVersion: previous.producerVersion,
        revision: previous.revision,
        source: previous.source,
      };
    if (attempt < 14) await Bun.sleep(1000);
  }
  throw new Error('route-canary-stored-health');
}
export interface RouteHistory {
  receipt: Reference;
  routes: RouteDescriptor;
}
/** Original evidence locations remain independent of active producer/query routes. */
export async function inspectRouteHistory(history: RouteHistory, context: ObserverContext) {
  const receipt = readHistoryReceipt(decode(readPinnedRouteFile(history.receipt)));
  const routes = resolveObserverRoutes(history.routes, context);
  await verifyHistory(routes, receipt);
  return { receiptSHA256: history.receipt.sha256, verifiedAt: Date.now() };
}
/** Exclusive observer lock retained on uncertainty. Its owner record is never overwritten or stolen. */
export function reserveRouteOperation(context: ObserverContext, operationId: string) {
  if (!/^[a-f0-9-]{36}$/.test(operationId)) throw new Error('route-operation-id');
  const root = statePath(context);
  checkDirectory(root, true);
  const lock = join(root, 'route.lock');
  mkdirSync(lock, { mode: 0o700 });
  const directory = join(root, `route-${operationId}`);
  try {
    mkdirSync(directory, { mode: 0o700 });
    publish(join(lock, 'owner.json'), { operationId, pid: process.pid });
  } catch (error) {
    rmdirSync(lock);
    throw error;
  }
  return {
    directory,
    release: () => {
      unlinkSync(join(lock, 'owner.json'));
      rmdirSync(lock);
    },
  };
}
/** A compensation reserves distinct evidence under the still-owned original lock; it never steals it. */
export function reserveRouteCompensation(
  context: ObserverContext,
  ownerId: string,
  operationId: string,
): string {
  const Owner = type({ '+': 'reject', operationId: /^[a-f0-9-]{36}$/, pid: 'number.integer>0' });
  const root = statePath(context);
  checkDirectory(root, true);
  const owner = Owner(decode(readPrivate(join(root, 'route.lock/owner.json'))));
  if (
    owner instanceof type.errors ||
    owner.operationId !== ownerId ||
    !/^[a-f0-9-]{36}$/.test(operationId)
  )
    throw new Error('route-compensation-owner');
  const directory = join(root, `route-${operationId}`);
  mkdirSync(directory, { mode: 0o700 });
  return directory;
}
/** Explicit reconciliation proves the old command process absent, recognizes only captured unit
 * states, archives its immutable lock evidence, then competes nonwaitingly for a new ordinary lock.
 * An active, denied, reused or otherwise unknown PID never authorizes acquisition.
 */
export async function reserveRouteRecovery(
  context: ObserverContext,
  pin: ObserverPin,
  prior: {
    operationId: string;
    ownerPID: number;
    beforeUnit: string;
    afterUnit: string;
    before: RouteDescriptor;
    after: RouteDescriptor;
  },
  operationId: string,
) {
  const root = statePath(context),
    lock = join(root, 'route.lock');
  checkDirectory(root, true);
  checkDirectory(lock, true);
  const Owner = type({ '+': 'reject', operationId: /^[a-f0-9-]{36}$/, pid: 'number.integer>0' });
  const bytes = readPrivate(join(lock, 'owner.json')),
    owner = Owner(decode(bytes));
  if (
    owner instanceof type.errors ||
    owner.operationId !== prior.operationId ||
    owner.pid !== prior.ownerPID
  )
    throw new Error('route-recovery-owner');
  const requireInactive = () => {
    try {
      process.kill(owner.pid, 0);
    } catch (error) {
      // Proof: Task79 fault 30b bypassed unknown-owner; 'explicit recovery refuses active' failed; bytes restored.
      if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return;
      throw new Error('route-owner-unknown', { cause: error });
    }
    // Proof: Task79 fault 29b bypassed active-owner; 'explicit recovery refuses active' failed; bytes restored.
    throw new Error('route-owner-active');
  };
  requireInactive();
  const recoveryOwner = join(lock, 'recovery-owner.json');
  publish(recoveryOwner, { operationId, pid: process.pid });
  let archived = false;
  try {
    await inspectObserver(pin, prior.before, prior.beforeUnit, context, {
      units: [prior.beforeUnit, prior.afterUnit],
      routes: [prior.before, prior.after],
    });
    requireInactive();
    if (digestBytes(readPrivate(join(lock, 'owner.json'))) !== digestBytes(bytes))
      throw new Error('route-recovery-owner-drift');
    const oldDirectory = join(root, `route-${prior.operationId}`);
    checkDirectory(oldDirectory, true);
    renameSync(lock, join(oldDirectory, `reconciled-ownership-${operationId}`));
    archived = true;
    return reserveRouteOperation(context, operationId);
  } finally {
    if (!archived) unlinkSync(recoveryOwner);
  }
}
/** A prior durable mutation-started record is required by the caller. Fixed named-unit closure only. */
export async function replaceObserverUnit(context: ObserverContext, before: string, after: string) {
  const path = unitPath(context);
  if (readPrivate(path).toString('utf8') !== before) throw new Error('route-unit-drift');
  const pending = `${path}.${randomUUID()}.pending`,
    descriptor = openSync(
      pending,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
  try {
    writeFileSync(descriptor, after);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  if (readPrivate(path).toString('utf8') !== before) throw new Error('route-unit-drift');
  renameSync(pending, path);
  const directory = openSync(dirname(path), 'r');
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
  await systemctl(context, ['daemon-reload']);
  await systemctl(context, ['restart', 'puni-dev-observability.service']);
}
