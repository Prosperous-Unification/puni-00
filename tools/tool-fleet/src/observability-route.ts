import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  decode,
  hashHistory,
  inspectObserver,
  inspectRouteHealth,
  inspectRouteHistory,
  localObserverContext,
  type ObserverContext,
  ObserverPin,
  observerRouteCommitment,
  parseGrafanaJournal,
  probeRouteHealth,
  publish,
  readPinnedRouteFile,
  readPrivate,
  readRouteEvidence,
  renderRoutedObserverUnit,
  replaceObserverUnit,
  reserveRouteCompensation,
  reserveRouteOperation,
  reserveRouteRecovery,
  resolveObserverRoutes,
  RouteDescriptor,
} from '@tools/observability-route';
import {
  assertRouteTransition,
  EvidenceReference,
  RouteBinding,
} from '@tools/observability-route-contract';
import { type } from 'arktype';

import { type DiscoveryCommand, type RunDiscoveryCommand, runDiscoveryCommand } from './discover';
import {
  assertRetainedObservabilityDocker,
  buildObservabilityDockerCommand,
  decodeObservabilityPreflightRequest,
  preflightObservability,
  readObservabilityDocker,
} from './observability-preflight';
import { readSshTransport, renderRemoteCommandArguments, type SshTransport } from './ssh-transport';

const digest = /^[a-f0-9]{64}$/;
declare const PUNI_ROUTE_SOURCE_REVISION: string;
/** Shared with ordinary usage and durable recovery argv; compiled paths are never executable operands. */
export function routeCommandPrefix(): string[] {
  const entry = new URL('./observability-route-cli.ts', import.meta.url).pathname;
  return entry.startsWith('/$bunfs/') ? [process.execPath] : [process.execPath, entry];
}
function readRouteProducer() {
  if (
    typeof PUNI_ROUTE_SOURCE_REVISION !== 'string' ||
    !/^[a-f0-9]{40}$/.test(PUNI_ROUTE_SOURCE_REVISION)
  )
    throw new Error('route-producer-unbound');
  return {
    revision: PUNI_ROUTE_SOURCE_REVISION,
    bundleSHA256: new Bun.CryptoHasher('sha256')
      .update(readFileSync(process.execPath))
      .digest('hex'),
  };
}
const Acceptance = type({
  '+': 'reject',
  receipt: EvidenceReference,
  rehearsal: RouteBinding,
  staged: RouteBinding,
  maxAgeMs: 'number.integer>0',
  freshnessWindowMs: 'number.integer>0',
});
const Request = type({
  '+': 'reject',
  version: '1',
  observer: ObserverPin,
  before: RouteDescriptor,
  after: RouteDescriptor,
  adapterRevision: /^[a-f0-9]{40}$/,
  adapterBundleSHA256: digest,
  beforeSHA256: digest,
  afterSHA256: digest,
  preflight: EvidenceReference,
  sshTransportPath: 'string>0',
  clusterHost: /^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/,
  history: { '+': 'reject', receipt: EvidenceReference, routes: RouteDescriptor },
  grafana: EvidenceReference,
  'acceptance?': Acceptance,
  'parent?': EvidenceReference,
});
export type ObservabilityRouteRequest = typeof Request.infer;
const Completed = type({
  '+': 'reject',
  version: '1',
  provider: "'dev-observer-local'",
  operationId: /^[a-f0-9-]{36}$/,
  kind: "'switch'|'rollback'|'restore'",
  phase: "'completed'",
  before: digest,
  after: digest,
  request: Request,
  prepared: EvidenceReference,
  startedAt: 'number',
  completedAt: 'number',
  beforePID: 'number.integer>=0',
  afterPID: 'number.integer>0',
  observations: type({
    '+': 'reject',
    observationId: 'string>0',
    observedAt: 'number',
    revision: /^[a-f0-9]{40}$/,
  }).array(),
  historySHA256: digest,
});
const Prepared = type({
  '+': 'reject',
  version: '1',
  provider: "'dev-observer-local'",
  operationId: /^[a-f0-9-]{36}$/,
  ownerPID: 'number.integer>0',
  kind: "'switch'|'rollback'|'restore'",
  phase: "'prepared'",
  request: Request,
  mode: "'normal'|'recovery'|'compensation'",
  beforeUnit: 'string',
  afterUnit: 'string',
  startedAt: 'number',
  snapshot: { '+': 'reject', unitSHA256: digest, routes: digest, pid: 'number.integer>=0' },
  'prerequisites?': 'unknown',
  'healthBefore?': 'unknown',
  'historyBefore?': 'unknown',
  'grafanaSHA256?': digest,
  'parentOperationId?': /^[a-f0-9-]{36}$/,
  'recoveryHealth?': 'unknown',
});
type PersistenceFailure =
  | 'uncertainty-write-failed'
  | 'compensation-uncertainty-write-failed'
  | 'compensation-completion-write-failed'
  | 'ownership-release-failed';
/** Actionable uncertainty survives recording failure. Closed persistence diagnostics and argv are
 * public; private causes never reach CLI output. Recorded means this attempt's publication synced.
 */
export class UncertainRouteOperation extends Error {
  constructor(
    public readonly operationId: string,
    public readonly directory: string,
    public readonly inspection: readonly string[],
    public readonly recoveryCommands: readonly (readonly string[])[],
    cause: unknown,
    public readonly persistenceFailures: readonly PersistenceFailure[] = [],
    public readonly uncertaintyRecorded = false,
  ) {
    super('route-mutation-uncertain', { cause });
  }
}
function readJSON(reference: typeof EvidenceReference.infer): unknown {
  return decode(readPinnedRouteFile(reference));
}
function byteReference(path: string) {
  const bytes = readPrivate(path);
  return { path, sha256: new Bun.CryptoHasher('sha256').update(bytes).digest('hex') };
}
function equal(left: unknown, right: unknown) {
  return hashHistory(left) === hashHistory(right);
}
function shellArgument(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Existing SSH credentials and known-host pins transport only fixed read-only preflight commands.
 * No kubeconfig/key installation or local Kubernetes tool is implied by observer-local execution.
 */
export function createRouteDiscovery(
  transport: SshTransport,
  clusterHost: string,
  run: RunDiscoveryCommand = runDiscoveryCommand,
): RunDiscoveryCommand {
  return async (command: DiscoveryCommand) => {
    if (command.executable !== 'kubectl') return run(command);
    const remote = ['sudo', '-n', 'k3s', 'kubectl', ...command.arguments]
      .map(shellArgument)
      .join(' ');
    return run({
      ...command,
      executable: 'ssh',
      arguments: renderRemoteCommandArguments(transport, clusterHost, remote, 5),
    });
  };
}

/** One observer-local operation; forward prerequisite evidence is reviewed input, never fabricated
 * runtime certification. Retained-path rollback deliberately does not call Kubernetes preflight.
 * Unresolved mutations retain ownership and actionable argv even if uncertainty persistence fails.
 */
export async function runObservabilityRoute(
  arguments_: readonly string[],
  options: {
    context?: ObserverContext;
    producer?: { revision: string; bundleSHA256: string };
    run?: RunDiscoveryCommand;
    wait?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<{ operationId: string; receipt: string }> {
  const context = options.context ?? localObserverContext();
  let recovery: typeof Prepared.infer | undefined;
  let recoveryReference: typeof EvidenceReference.infer | undefined;
  let requestWire: unknown;
  if (arguments_[0] === 'recover') {
    if (
      arguments_.length !== 7 ||
      arguments_[6] !== '--reconciled' ||
      !digest.test(arguments_[2]) ||
      !digest.test(arguments_[3]) ||
      !digest.test(arguments_[4]) ||
      !/^[1-9][0-9]{0,9}$/.test(arguments_[5])
    )
      throw new Error('route-arguments');
    const prepared = Prepared(readJSON({ path: arguments_[1], sha256: arguments_[2] }));
    if (prepared instanceof type.errors) throw new Error('route-recovery-format');
    const retainedUnit = prepared.kind === 'rollback' ? prepared.afterUnit : prepared.beforeUnit;
    const sha = (bytes: string | Buffer) =>
      new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
    if (
      sha(retainedUnit) !== arguments_[4] ||
      ![sha(prepared.beforeUnit), sha(prepared.afterUnit)].includes(arguments_[3]) ||
      sha(
        readPrivate(join(context.home, '.config/systemd/user/puni-dev-observability.service')),
      ) !== arguments_[3] ||
      prepared.ownerPID !== Number(arguments_[5]) ||
      // Proof: Task79 fault 31b bypassed recovery-pins; 'explicit recovery completes after inactive owner with lost-reload' failed; bytes restored.
      arguments_[1] !==
        join(
          context.home,
          '.local/state/puni-dev-observability',
          `route-${prepared.operationId}`,
          'prepared.json',
        )
    )
      throw new Error('route-recovery-pins');
    recovery = prepared;
    recoveryReference = { path: arguments_[1], sha256: arguments_[2] };
    requestWire =
      prepared.kind === 'rollback'
        ? { ...prepared.request, parent: { path: arguments_[1], sha256: arguments_[2] } }
        : {
            ...prepared.request,
            before: prepared.request.after,
            after: prepared.request.before,
            beforeSHA256: prepared.request.afterSHA256,
            afterSHA256: prepared.request.beforeSHA256,
            parent: { path: arguments_[1], sha256: arguments_[2] },
          };
  } else {
    if (arguments_.length !== 2 || !['switch', 'rollback', 'restore'].includes(arguments_[0]))
      throw new Error('route-arguments');
    requestWire = decode(readPrivate(arguments_[1]));
  }
  const kind = recovery === undefined ? arguments_[0] : 'rollback';
  if (kind !== 'switch' && kind !== 'rollback' && kind !== 'restore')
    throw new Error('route-arguments');
  // Proof: Task79 fault 23 bypassed request-parser; 'composed operation refuses request' failed; bytes restored.
  const checked = Request(requestWire);
  if (checked instanceof type.errors) throw new Error('route-request');
  const request = structuredClone(checked);
  const producer = options.producer ?? readRouteProducer();
  // Proof: Task79 fault 24 bypassed producer; 'composed operation refuses producer' failed; bytes restored.
  if (
    producer.revision !== request.adapterRevision ||
    producer.bundleSHA256 !== request.adapterBundleSHA256
  )
    throw new Error('route-producer-identity');
  const beforeUnit = renderRoutedObserverUnit(
    request.observer.sourceRevision,
    request.before,
    context.home,
  );
  const afterUnit = renderRoutedObserverUnit(
    request.observer.sourceRevision,
    request.after,
    context.home,
  );
  const beforeRoutes = observerRouteCommitment(resolveObserverRoutes(request.before, context));
  const afterRoutes = observerRouteCommitment(resolveObserverRoutes(request.after, context));
  if (
    beforeRoutes !== request.beforeSHA256 ||
    afterRoutes !== request.afterSHA256 ||
    (kind !== 'rollback' && request.after.kind !== 'authenticated')
  )
    throw new Error('route-request-binding');
  if (!equal(kind === 'rollback' ? request.after : request.before, request.history.routes))
    throw new Error('route-retained-history-binding');
  if (
    recovery !== undefined &&
    (![beforeUnit, afterUnit].includes(recovery.beforeUnit) ||
      ![beforeUnit, afterUnit].includes(recovery.afterUnit))
  )
    throw new Error('route-recovery-unit');
  const parent =
    recovery !== undefined || request.parent === undefined
      ? undefined
      : Completed(readJSON(request.parent));
  if (parent instanceof type.errors) throw new Error('route-parent-format');
  if (recovery === undefined) assertRouteTransition(kind, beforeRoutes, afterRoutes, parent);
  if (parent !== undefined) {
    const captured = Prepared(readJSON(parent.prepared));
    const root = join(
      context.home,
      '.local/state/puni-dev-observability',
      `route-${parent.operationId}`,
    );
    // Proof: the genuine forged completed-request component promoted rollback before this join (45-parent-join-red).
    if (
      captured instanceof type.errors ||
      request.parent?.path !== join(root, 'completed.json') ||
      parent.prepared.path !== join(root, 'prepared.json') ||
      captured.operationId !== parent.operationId ||
      captured.kind !== parent.kind ||
      !equal(captured.request, parent.request) ||
      captured.beforeUnit !==
        renderRoutedObserverUnit(
          parent.request.observer.sourceRevision,
          parent.request.before,
          context.home,
        ) ||
      captured.afterUnit !==
        renderRoutedObserverUnit(
          parent.request.observer.sourceRevision,
          parent.request.after,
          context.home,
        ) ||
      parent.before !== parent.request.beforeSHA256 ||
      parent.after !== parent.request.afterSHA256 ||
      parent.beforePID !== captured.snapshot.pid ||
      parent.startedAt !== captured.startedAt ||
      !Number.isFinite(parent.startedAt) ||
      !Number.isFinite(parent.completedAt) ||
      parent.startedAt < 0 ||
      parent.completedAt < parent.startedAt ||
      parent.beforePID === parent.afterPID ||
      parent.observations.length !== 2 ||
      parent.observations[0].observationId === parent.observations[1].observationId ||
      parent.observations.some(
        (observation) =>
          !Number.isFinite(observation.observedAt) ||
          observation.observedAt < parent.startedAt ||
          observation.observedAt > parent.completedAt,
      ) ||
      parent.observations[0].observedAt >= parent.observations[1].observedAt
    )
      throw new Error('route-parent-prepared-join');
    if (
      !equal(parent.request.observer, request.observer) ||
      !equal(parent.request.before, request.after) ||
      !equal(parent.request.after, request.before) ||
      !equal(parent.request.history, request.history) ||
      !equal(parent.request.grafana, request.grafana) ||
      (kind === 'rollback' && !equal(parent.request.preflight, request.preflight))
    )
      throw new Error('route-parent-binding');
  }
  const preflightRequest = decodeObservabilityPreflightRequest(readJSON(request.preflight));
  if (preflightRequest.phase !== 'cutover') throw new Error('route-preflight-phase');
  // Proof: Task79 fault 25 bypassed dev-only; 'composed operation refuses production' failed; bytes restored.
  if (
    preflightRequest.candidate.length === 0 ||
    preflightRequest.candidate.some(
      (candidate) => candidate.instance !== 'dev' || candidate.namespace !== 'observability-dev',
    )
  )
    throw new Error('route-dev-only');
  if (parent !== undefined) {
    const prior = decodeObservabilityPreflightRequest(readJSON(parent.request.preflight));
    const identity = (pin: typeof prior) => ({
      ...pin,
      rollbackPath: '',
      rollbackSHA256: '',
      rollbackOperationId: '',
    });
    if (!equal(identity(prior), identity(preflightRequest)))
      throw new Error('route-parent-preflight');
  }
  const transport = await readSshTransport(request.sshTransportPath, process.env, [
    request.clusterHost,
    preflightRequest.docker.host,
  ]);
  const run = createRouteDiscovery(transport, request.clusterHost, options.run);
  const operationId = randomUUID();
  const recoveryPolicy =
    recovery === undefined
      ? undefined
      : {
          units: [recovery.beforeUnit, recovery.afterUnit] as const,
          routes: [recovery.request.before, recovery.request.after] as const,
        };
  const recoveryReservation =
    recovery === undefined
      ? undefined
      : await reserveRouteRecovery(
          context,
          request.observer,
          {
            operationId: recovery.operationId,
            ownerPID: recovery.ownerPID,
            beforeUnit: recovery.beforeUnit,
            afterUnit: recovery.afterUnit,
            before: recovery.request.before,
            after: recovery.request.after,
          },
          operationId,
        );
  const reservation = recoveryReservation ?? reserveRouteOperation(context, operationId);
  const startedAt = Date.now();
  let prerequisiteObservedAt = startedAt;
  const progress = { mutationStarted: false, completed: false };
  let baseline: Awaited<ReturnType<typeof inspectObserver>> | undefined;
  let preparedReference: typeof EvidenceReference.infer | undefined;
  const persistenceFailures: PersistenceFailure[] = [];
  const failureCauses: unknown[] = [];
  const inspection = `systemctl --user show puni-dev-observability.service --property=FragmentPath,DropInPaths,NeedDaemonReload,ExecStart,ActiveState,SubState,MainPID`;
  const transferred = () => recoveryReservation?.transferred() === true;
  const uncertainMetadata = () => {
    const capture = recovery !== undefined && !transferred() ? recovery : undefined;
    const reference = capture === undefined ? preparedReference : recoveryReference;
    if (reference === undefined) throw new Error('route-prepared-reference-missing');
    const priorUnit = capture?.beforeUnit ?? beforeUnit,
      nextUnit = capture?.afterUnit ?? afterUnit;
    const retainedUnit = (capture?.kind ?? kind) === 'rollback' ? nextUnit : priorUnit;
    const sha = (bytes: string) => new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
    return {
      operationId: capture?.operationId ?? operationId,
      directory:
        capture === undefined
          ? reservation.directory
          : join(
              context.home,
              '.local/state/puni-dev-observability',
              `route-${capture.operationId}`,
            ),
      recoveryCommands: [...new Set([sha(priorUnit), sha(nextUnit)])].map((current) => [
        ...routeCommandPrefix(),
        'recover',
        reference.path,
        reference.sha256,
        current,
        sha(retainedUnit),
        String(capture?.ownerPID ?? process.pid),
        '--reconciled',
      ]),
    };
  };
  const recordOutcome = (
    path: string,
    wire: unknown,
    failure: Exclude<PersistenceFailure, 'ownership-release-failed'>,
  ) => {
    // Proof: occupied/file/directory uncertainty and compensation sync lost actionable CLI output (fix1/07b–07c).
    try {
      publish(path, wire);
      return true;
    } catch (error) {
      // Persistence is a modeled uncertain outcome: preserve private cause, expose only the closed diagnostic.
      failureCauses.push(error);
      persistenceFailures.push(failure);
      return false;
    }
  };
  const observeRetained = async () => {
    const command = buildObservabilityDockerCommand(
      transport,
      preflightRequest.docker.host,
      preflightRequest.timeoutMs,
      { path: '', claimPaths: [] },
    );
    const observed = await run(command);
    if (
      observed.exitCode !== 0 ||
      !Number.isFinite(Date.parse(observed.observedAt)) ||
      Date.parse(observed.observedAt) > Date.now() ||
      Date.now() - Date.parse(observed.observedAt) > preflightRequest.maxAgeMs
    )
      throw new Error('route-retained-observation');
    const docker = readObservabilityDocker(JSON.parse(observed.stdout));
    const node = preflightRequest.nodes.find(
      (entry) => entry.name === preflightRequest.docker.node,
    );
    if (docker.machineID !== node?.machineID) throw new Error('route-retained-machine');
    assertRetainedObservabilityDocker(preflightRequest, docker);
    if (
      docker.containers.some(
        (container) =>
          preflightRequest.docker.retainedContainers.includes(container.name) && !container.running,
      ) ||
      docker.containers.some(
        (container) =>
          !preflightRequest.docker.retainedContainers.includes(container.name) &&
          container.volumes.some((volume) =>
            preflightRequest.docker.retainedVolumes.includes(volume),
          ),
      )
    )
      throw new Error('route-retained-running-owner');
    return {
      identities: hashHistory({ pins: preflightRequest.docker, machineID: docker.machineID }),
      observedAt: Date.parse(observed.observedAt),
    };
  };
  const postcheck = async (
    route: typeof request.after,
    unit: string,
    commitment: string,
    priorPID: number,
    priorTime: number,
    windowMs: number,
  ) => {
    const observations: { observationId: string; observedAt: number; revision: string }[] = [];
    let afterPID = 0;
    for (let window = 0; window < 2; window++) {
      await (options.wait ?? Bun.sleep)(windowMs);
      const active = await inspectObserver(request.observer, route, unit, context);
      // Proof: restart-time trust drift was accepted in36; freezing the reviewed commitment made37 refuse it.
      if (active.pid === priorPID || active.routes !== commitment)
        throw new Error('route-restart-or-binding-not-observed');
      afterPID = active.pid;
      const health = await inspectRouteHealth(route, context, active.observation);
      if (
        health.observedAt <= priorTime ||
        (window > 0 &&
          (health.observationId === observations[0].observationId ||
            health.observedAt - observations[0].observedAt < windowMs))
      )
        throw new Error('route-freshness-windows');
      observations.push({
        observationId: health.observationId,
        observedAt: health.observedAt,
        revision: health.revision,
      });
    }
    await observeRetained();
    await inspectRouteHistory(request.history, context);
    parseGrafanaJournal(readJSON(request.grafana));
    return { afterPID, observations };
  };
  const performOperation = async () => {
    try {
      const snapshot = await inspectObserver(
        request.observer,
        request.before,
        beforeUnit,
        context,
        recoveryPolicy,
      );
      baseline = snapshot;
      if (recovery === undefined && snapshot.routes !== beforeRoutes)
        throw new Error('route-current-binding-drift');
      const grafanaSHA256 = request.grafana.sha256;
      parseGrafanaJournal(readJSON(request.grafana));
      const historyBefore = await inspectRouteHistory(request.history, context);
      let prerequisites: unknown;
      if (kind === 'rollback')
        prerequisites = { scope: 'retained-path-recovery', identities: await observeRetained() };
      else {
        if (request.acceptance === undefined) throw new Error('route-full-acceptance-required');
        const expected = request.acceptance;
        readRouteEvidence(expected.receipt, expected, Date.now());
        const target = hashHistory({
          fleetId: preflightRequest.fleetId,
          targetMarker: preflightRequest.targetMarker,
          identityUID: preflightRequest.identityUID,
          context: preflightRequest.context,
          controllerContext: preflightRequest.controllerContext,
        });
        const stores = hashHistory({
          claims: preflightRequest.claims,
          docker: preflightRequest.docker,
          candidateClaims: preflightRequest.candidate.map((candidate) => ({
            namespace: candidate.namespace,
            name: candidate.name,
            claims: candidate.claims,
          })),
        });
        const artifacts = hashHistory(
          preflightRequest.candidate.map((candidate) => ({
            path: candidate.artifactPath,
            sha256: candidate.artifactSHA256,
          })),
        );
        const source = hashHistory(request.observer);
        const selection = hashHistory({
          resources: preflightRequest.resources,
          // Proof: binding the fetched head rejected unchanged applied recipients (fix1/33); fresh preflight still checks the head.
          source: {
            kind: preflightRequest.source.kind,
            name: preflightRequest.source.name,
            namespace: preflightRequest.source.namespace,
            uid: preflightRequest.source.uid,
          },
          nodes: preflightRequest.nodes.map(({ name, uid, machineID }) => ({
            name,
            uid,
            machineID,
          })),
          workloads: preflightRequest.candidate.map(
            ({ kind, instance, namespace, name, node, replicaUIDs }) => ({
              kind,
              instance,
              namespace,
              name,
              node,
              replicaUIDs,
            }),
          ),
        });
        if (
          expected.rehearsal.sourceRevision !== preflightRequest.candidateRevision ||
          expected.rehearsal.candidateRevision !== preflightRequest.candidateRevision ||
          expected.staged.adapterRevision !== request.adapterRevision ||
          expected.rehearsal.adapterRevision !== request.adapterRevision ||
          expected.staged.target !== target ||
          expected.staged.stores !== stores ||
          expected.staged.routes !== afterRoutes ||
          expected.staged.source !== source ||
          // Proof: all four recreated live identities with matching fresh pins mutated the unit under the old cohort (fix1/01).
          expected.staged.selection !== selection ||
          expected.staged.artifactSHA256 !== artifacts ||
          expected.staged.candidateRevision !== preflightRequest.candidateRevision ||
          // Proof: Task79 fault 26 bypassed selection; 'composed operation refuses selection' failed; bytes restored.
          expected.staged.sourceRevision !== preflightRequest.candidateRevision
        )
          throw new Error('route-acceptance-selection');
        const preflight = await preflightObservability(preflightRequest, { transport, run });
        // Proof: Task79 fault 27 bypassed candidate-ready; 'composed operation refuses unready' failed; bytes restored.
        if (!preflight.migrationReady) throw new Error('route-candidate-unready');
        prerequisites = preflight;
        prerequisiteObservedAt = Date.parse(preflight.startedAt);
      }
      const healthBefore = await probeRouteHealth(
        request.after,
        context,
        request.observer,
        request.adapterRevision,
      );
      const retained = await observeRetained();
      prerequisiteObservedAt =
        kind === 'rollback'
          ? retained.observedAt
          : Math.min(prerequisiteObservedAt, retained.observedAt);
      const preparedPath = join(reservation.directory, 'prepared.json');
      publish(preparedPath, {
        version: 1,
        provider: 'dev-observer-local',
        operationId,
        ownerPID: process.pid,
        kind,
        mode: recovery === undefined ? 'normal' : 'recovery',
        phase: 'prepared',
        request,
        beforeUnit,
        afterUnit,
        snapshot: { unitSHA256: snapshot.unitSHA256, routes: snapshot.routes, pid: snapshot.pid },
        prerequisites,
        healthBefore,
        historyBefore,
        grafanaSHA256,
        startedAt,
      });
      const prepared = byteReference(preparedPath);
      // Proof: the old error-path reread lost recovery metadata on transient post-invocation denial (fix1/14).
      preparedReference = prepared;
      const current = await inspectObserver(
        request.observer,
        request.before,
        beforeUnit,
        context,
        recoveryPolicy,
      );
      if (
        current.pid !== snapshot.pid ||
        current.unitSHA256 !== snapshot.unitSHA256 ||
        current.loadedCommand !== snapshot.loadedCommand ||
        (recovery === undefined && current.routes !== beforeRoutes) ||
        observerRouteCommitment(resolveObserverRoutes(request.after, context)) !== afterRoutes ||
        // Proof: Task79 fault 28 bypassed inventory-expiry; 'candidate inventory expiry' failed; bytes restored.
        Date.now() - prerequisiteObservedAt > preflightRequest.maxAgeMs
      )
        throw new Error('route-preparation-expired-or-drifted');
      publish(join(reservation.directory, 'mutation-started.json'), {
        version: 1,
        operationId,
        prepared,
        startedAt: Date.now(),
      });
      if (recoveryReservation !== undefined) recoveryReservation.activate();
      progress.mutationStarted = true;
      await replaceObserverUnit(context, current.unit, afterUnit);
      // Proof: retained A/current B failed recovery under30s windows with actual2m exporter caching (75-progress-recovery-green).
      const windowMs = kind === 'rollback' ? 120000 : request.acceptance?.freshnessWindowMs;
      if (windowMs === undefined) throw new Error('route-full-acceptance-required');
      const { afterPID, observations } = await postcheck(
        request.after,
        afterUnit,
        afterRoutes,
        snapshot.pid,
        snapshot.observation.observedAt,
        // Proof: staged candidate A/current B failed forward under the reviewed30s minimum (86-forward-cache-red).
        Math.max(windowMs, 120000),
      );
      const receipt = join(reservation.directory, 'completed.json');
      publish(receipt, {
        version: 1,
        provider: 'dev-observer-local',
        operationId,
        kind,
        phase: 'completed',
        before: beforeRoutes,
        after: afterRoutes,
        request,
        prepared,
        startedAt,
        completedAt: Date.now(),
        beforePID: snapshot.pid,
        afterPID,
        observations,
        historySHA256: request.history.receipt.sha256,
      });
      progress.completed = true;
      return { operationId, receipt };
    } catch (error) {
      if (progress.mutationStarted && kind !== 'rollback' && baseline !== undefined) {
        let compensationDirectory: string | undefined;
        try {
          const active = await inspectObserver(request.observer, request.after, afterUnit, context);
          if (active.pid === baseline.pid || active.routes !== afterRoutes)
            throw new Error('route-compensation-ownership', { cause: error });
          await observeRetained();
          await inspectRouteHistory(request.history, context);
          const compensationId = randomUUID();
          compensationDirectory = reserveRouteCompensation(context, operationId, compensationId);
          const compensationStartedAt = Date.now();
          const recoveryHealth = await probeRouteHealth(
            request.before,
            context,
            request.observer,
            request.adapterRevision,
          );
          const compensationRequest = {
            ...request,
            before: request.after,
            after: request.before,
            beforeSHA256: afterRoutes,
            afterSHA256: beforeRoutes,
            parent: byteReference(join(reservation.directory, 'mutation-started.json')),
          };
          const preparedPath = join(compensationDirectory, 'prepared.json');
          publish(preparedPath, {
            version: 1,
            provider: 'dev-observer-local',
            operationId: compensationId,
            ownerPID: process.pid,
            kind: 'rollback',
            mode: 'compensation',
            phase: 'prepared',
            parentOperationId: operationId,
            request: compensationRequest,
            beforeUnit: afterUnit,
            afterUnit: beforeUnit,
            snapshot: { unitSHA256: active.unitSHA256, routes: active.routes, pid: active.pid },
            recoveryHealth,
            startedAt: compensationStartedAt,
          });
          const prepared = byteReference(preparedPath);
          publish(join(compensationDirectory, 'mutation-started.json'), {
            version: 1,
            operationId: compensationId,
            prepared,
            startedAt: Date.now(),
          });
          await replaceObserverUnit(context, afterUnit, beforeUnit);
          const { afterPID, observations } = await postcheck(
            request.before,
            beforeUnit,
            beforeRoutes,
            active.pid,
            active.observation.observedAt,
            120000,
          );
          const receipt = join(compensationDirectory, 'completed.json');
          publish(receipt, {
            version: 1,
            provider: 'dev-observer-local',
            operationId: compensationId,
            kind: 'rollback',
            phase: 'completed',
            before: afterRoutes,
            after: beforeRoutes,
            request: compensationRequest,
            prepared,
            startedAt: compensationStartedAt,
            completedAt: Date.now(),
            beforePID: active.pid,
            afterPID,
            observations,
            historySHA256: request.history.receipt.sha256,
          });
          const compensationRecorded = recordOutcome(
            join(reservation.directory, 'compensated.json'),
            {
              version: 1,
              operationId,
              phase: 'compensated',
              compensation: byteReference(receipt),
              observedAt: Date.now(),
            },
            'compensation-completion-write-failed',
          );
          if (!compensationRecorded)
            throw new Error('route-compensation-recording-failed', { cause: error });
          progress.completed = true;
        } catch (recoveryError) {
          if (compensationDirectory !== undefined)
            recordOutcome(
              join(compensationDirectory, 'uncertain.json'),
              {
                version: 1,
                phase: 'uncertain',
                parentOperationId: operationId,
                observedAt: Date.now(),
                inspection,
                recovery: `Inspect ${compensationDirectory}/prepared.json and the effective unit; retain the original ownership lock until reconciled.`,
              },
              'compensation-uncertainty-write-failed',
            );
          // Boundary: failed compensation is retained and the original mutation remains explicitly uncertain.
          failureCauses.push(recoveryError);
        }
        if (progress.completed) throw new Error('route-operation-compensated', { cause: error });
      }
      const uncertain = progress.mutationStarted || recovery !== undefined;
      const metadata = uncertain
        ? uncertainMetadata()
        : { operationId, directory: reservation.directory, recoveryCommands: [] };
      const recorded = recordOutcome(
        join(reservation.directory, uncertain ? 'uncertain.json' : 'refused.json'),
        {
          version: 1,
          provider: 'dev-observer-local',
          operationId,
          kind,
          phase: uncertain ? 'uncertain' : 'refused',
          observedAt: Date.now(),
          inspection,
          recoveryCommands: metadata.recoveryCommands,
        },
        'uncertainty-write-failed',
      );
      if (uncertain) {
        const uncertainty = new UncertainRouteOperation(
          metadata.operationId,
          metadata.directory,
          inspection.split(' '),
          metadata.recoveryCommands,
          failureCauses.length === 0
            ? error
            : new AggregateError([error, ...failureCauses], 'route-uncertainty-persistence'),
          persistenceFailures,
          recorded,
        );
        throw uncertainty;
      }
      throw new AggregateError([error, ...failureCauses], 'route-operation-refused', {
        cause: error,
      });
    }
  };
  let outcome:
    | { state: 'completed'; operation: { operationId: string; receipt: string } }
    | { state: 'failed'; cause: unknown };
  try {
    outcome = { state: 'completed', operation: await performOperation() };
  } catch (error) {
    outcome = { state: 'failed', cause: error };
  }
  if ((!progress.mutationStarted && !transferred()) || progress.completed) {
    try {
      reservation.release();
    } catch (error) {
      const uncertainty =
        outcome.state === 'failed' && outcome.cause instanceof UncertainRouteOperation
          ? outcome.cause
          : undefined;
      if (uncertainty !== undefined) {
        persistenceFailures.push('ownership-release-failed');
        throw new UncertainRouteOperation(
          uncertainty.operationId,
          uncertainty.directory,
          uncertainty.inspection,
          uncertainty.recoveryCommands,
          new AggregateError([uncertainty, error], 'route-ownership-release', { cause: error }),
          persistenceFailures,
          uncertainty.uncertaintyRecorded,
        );
      }
      if (progress.mutationStarted || recovery !== undefined) {
        const metadata = uncertainMetadata();
        throw new UncertainRouteOperation(
          metadata.operationId,
          metadata.directory,
          inspection.split(' '),
          metadata.recoveryCommands,
          error,
          ['ownership-release-failed'],
        );
      }
      throw new Error('route-ownership-release-failed', { cause: error });
    }
  }
  if (outcome.state === 'failed') throw outcome.cause;
  return outcome.operation;
}
