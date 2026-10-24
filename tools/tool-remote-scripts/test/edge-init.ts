import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  admitInvariantProfile,
  checkInert,
  checkProfileSource,
  compareCandidate,
  constructCandidate,
  CREATED_PROFILE,
  fingerprint,
  InitRefusal,
  type InvariantContext,
  type NativeContainer,
  type NetworkPin,
  parseNativeContainer,
  projectInvariant,
} from '../src/lib/edge-init';
import {
  EngineTransport,
  type HostObserver,
  observeNetworks,
  PrivateReceipts,
  readInitDiagnostic,
  runInitAdoption,
  type SelectedTarget,
  type TargetKind,
} from '../src/lib/edge-init-operation';
import { readFields, readIdentity, readString } from '../src/lib/managed-cohort';
import { observeSolverProcess, type SolverProcess } from '../src/lib/solver-host';

const LABEL = 'club.bulletpoints.edge-init-fixture';
const IMAGE = /^sha256:[a-f0-9]{64}$/;

type FixtureFailureStage =
  | 'networks'
  | 'volumes'
  | 'containers'
  | 'original-inspection'
  | 'baseline'
  | 'inert-candidate'
  | `fault-${FixtureFault}`
  | 'adoption'
  | 'stop-deadline'
  | 'report'
  | 'cleanup';
interface FixtureFailure {
  stage: FixtureFailureStage;
  reason: string;
  diagnosticSha256: string;
}
/**
 * Native fixture errors retain a finite stage and whitelisted code; arbitrary diagnostic bytes are represented only by SHA256.
 * Public summaries retain the sanitized phase; {@link publishFixtureFault} alone reads the inner operation diagnostic.
 * Proof: adding the inner lookup here changed public summaries and failed the private-record/public-summary regression.
 * Proof: accepting arbitrary refusal reasons or retaining raw diagnostics made the failure diagnostic regression fail.
 */
export function describeFixtureFailure(stage: FixtureFailureStage, cause: unknown): FixtureFailure {
  const controlled = new Set([
    'unsupported-native-shape',
    'invalid-ordered-env',
    'candidate-preservation-mismatch',
    'engine-status-refused',
    'engine-deadline-uncertain',
    'engine-transport-uncertain',
    'engine-response-truncated',
    'engine-read-failed',
    'engine-response-too-large',
    'engine-json-invalid',
    'create-acknowledgement-uncertain',
    'exec-deadline-uncertain',
    'exec-frame-invalid',
    'exec-output-refused',
    'exec-stream-invalid',
    'exec-terminal-unverified',
    'exec-utf8-invalid',
    'native-fixture-command-refused',
    'native-fixture-output-too-large',
    'native-fixture-ownership-refused',
    'native-fixture-caddy-config-changed',
    'native-fixture-required-shape-absent',
    'native-fixture-oom-representation-unproved',
    'invariant-profile-unavailable',
    'invariant-profile-source-invalid',
    'invariant-profile-value-invalid',
    'invariant-profile-invalid',
    'invariant-context-invalid',
    'invariant-phase-differs',
    'network-roster-invalid',
    'network-roster-differs',
    'network-mode-differs',
    'network-identity-differs',
    'network-pins-missing',
    'network-pin-differs',
    'network-observation-unstable',
    'candidate-network-active',
    'candidate-not-inert',
    'native-fixture-network-pin-invalid',
    'native-fixture-fault-record-invalid',
    'native-fixture-fault-record-publication-failed',
    'native-fixture-original-process-changed',
    'native-fixture-process-retained',
    'native-fixture-cgroup-retained',
    'native-fixture-public-health-refused',
    'native-fixture-health-did-not-converge',
    'native-fixture-fault-not-injected',
    'native-fixture-fault-stage-unproved',
    'native-fixture-fault-effects-unproved',
    'native-fixture-fault-state-unproved',
    'native-fixture-fault-native-state-unproved',
    'native-fixture-stop-deadline-unproved',
    'native-fixture-stop-process-changed',
    'before-create',
    'candidate-inert',
    'stop-uncertain',
    'original-stopped',
    'rename-uncertain',
    'start-uncertain',
    'candidate-running-unhealthy',
    'healthy-original-retained',
    'removal-uncertain',
  ]);
  const reason =
    cause instanceof InitRefusal
      ? controlled.has(cause.reason)
        ? cause.reason
        : 'unrecognized-refusal'
      : 'unexpected-failure';
  const diagnostic =
    cause instanceof Error
      ? `${cause.name}\0${cause.message}`
      : typeof cause === 'string'
        ? cause
        : typeof cause;
  return { stage, reason, diagnosticSha256: createHash('sha256').update(diagnostic).digest('hex') };
}

/**
 * Preserve the first proof failure before cleanup and publish cleanup failure separately without overwriting it.
 * Proof: omitting the nonempty guard, exclusive creation, separate cleanup path, private mode or exact byte hash each failed the private native records regression.
 */
export async function publishFixtureFailure(
  root: string,
  nonce: string,
  proof: FixtureFailure | null,
  cleanup: FixtureFailure | null,
): Promise<string> {
  if (proof === null && cleanup === null)
    throw new InitRefusal('native-fixture-failure-evidence-empty');
  const bytes = JSON.stringify({
    format: 'edge-init-native-failure',
    version: 1,
    nonce,
    proof,
    cleanup,
  });
  await writeFile(join(root, cleanup === null ? 'failure.json' : 'cleanup-failure.json'), bytes, {
    mode: 0o600,
    flag: 'wx',
  });
  return createHash('sha256').update(bytes).digest('hex');
}

/** Native acceptance requires the characterized raw values in addition to immutable comparison.
 * Proof: omitting raw-value comparison admitted the wrong native OOM regression.
 */
export function verifyFixtureOom(observed: NativeContainer, phase: 'created' | 'running'): void {
  if (
    !Object.hasOwn(observed.host, 'OomKillDisable') ||
    observed.host['OomKillDisable'] !== (phase === 'created' ? false : null)
  )
    throw new InitRefusal('native-fixture-oom-representation-unproved');
  if (phase === 'created') checkInert(observed);
  else if (
    observed.state['Status'] !== 'running' ||
    observed.state['Running'] !== true ||
    typeof observed.state['Pid'] !== 'number' ||
    observed.state['Pid'] <= 0
  )
    throw new InitRefusal('native-fixture-oom-representation-unproved');
}

/** Requires both raw phases for the fixed two-target report.
 * Proof: removing roster admission failed the missing target/phase report regression.
 */
export function requireFixtureOomRoster(
  created: ReadonlySet<TargetKind>,
  running: ReadonlySet<TargetKind>,
): void {
  if ((['registry', 'caddy'] as const).some((kind) => !created.has(kind) || !running.has(kind)))
    throw new InitRefusal('native-fixture-oom-representation-unproved');
}

type FixtureDocker = (arguments_: readonly string[], timeout?: number) => Promise<string>;
const FIXTURE_FAULTS = [
  'alias-drift',
  'route-loss',
  'public-probe-failed',
  'restart-after-health',
  'create-ack-lost',
  'stop-ack-lost',
  'rename-ack-lost',
  'start-ack-lost',
] as const;
type FixtureFault = (typeof FIXTURE_FAULTS)[number];
interface FaultEvidence {
  injected: boolean;
  failure: unknown;
  effects: readonly string[];
  original: NativeContainer;
  candidate: NativeContainer;
  originalId: string;
  candidateId: string;
  nonce: string;
  network: string;
  beforeRestart?: string;
}

/** Refuse retained nonce resources before entering a scope whose teardown may remove that nonce's objects. */
export async function requireUnusedFixtureNamespace(
  nonce: string,
  run: FixtureDocker = docker,
): Promise<void> {
  const volumes = (await run(['volume', 'ls', '--quiet'])).split('\n');
  // Proof: omitted volume/retained-label admission separately made namespace collision negatives succeed in edge-init.test.ts.
  if (
    ['registry', 'caddy-data', 'caddy-config'].some((suffix) =>
      volumes.includes(`wbs-init-${nonce}-${suffix}`),
    )
  )
    throw new InitRefusal('native-fixture-volume-collision');
  for (const arguments_ of [
    ['ps', '--all', '--quiet', '--filter', `label=${LABEL}=${nonce}`],
    ['network', 'ls', '--quiet', '--filter', `label=${LABEL}=${nonce}`],
    ['volume', 'ls', '--quiet', '--filter', `label=${LABEL}=${nonce}`],
  ]) {
    // Proof: label-absence omission admitted the retained-label collision without a refusal.
    if ((await run(arguments_)) !== '') throw new InitRefusal('native-fixture-namespace-collision');
  }
}
function fixtureResourceIdentity(
  kind: 'network' | 'volume',
  value: unknown,
  nonce: string,
): string {
  // Proof: array-kind and record-count omissions separately admitted malformed native resource readbacks.
  if (!Array.isArray(value) || value.length !== 1)
    throw new InitRefusal('native-fixture-resource-inspection-refused');
  const fields = readFields(value[0]);
  const name = readString(fields['Name']);
  const suffixes =
    kind === 'network' ? ['net-0', 'net-1', 'net-2'] : ['registry', 'caddy-data', 'caddy-config'];
  // Proof: separate name/label omissions admitted foreign cleanup or seeding targets; their zero-write assertions failed.
  if (
    !suffixes.some((suffix) => name === `wbs-init-${nonce}-${suffix}`) ||
    readFields(fields['Labels'])[LABEL] !== nonce
  )
    throw new InitRefusal('native-fixture-resource-ownership-refused');
  // Proof: replacing full-ID admission with string admission made network cleanup delete an abbreviated ID; its test failed.
  return kind === 'network' ? readIdentity(fields['Id']) : name;
}

/** A previous owned attempt is still a collision; create's idempotent acknowledgement never grants permission to seed. */
export async function createFixtureVolume(
  name: string,
  nonce: string,
  image: string,
  run: FixtureDocker = docker,
): Promise<void> {
  // Proof: input admission omission issued Docker requests for a foreign volume and an unpinned image; both negatives failed.
  if (
    !['registry', 'caddy-data', 'caddy-config'].some(
      (suffix) => name === `wbs-init-${nonce}-${suffix}`,
    ) ||
    !IMAGE.test(image)
  )
    throw new InitRefusal('native-fixture-volume-input-refused');
  const existing = (await run(['volume', 'ls', '--quiet'])).split('\n');
  // Proof: absence omission seeded an existing correctly labelled volume; the collision zero-write negative failed.
  if (existing.includes(name)) throw new InitRefusal('native-fixture-volume-collision');
  const created = await run(['volume', 'create', '--label', `${LABEL}=${nonce}`, name]);
  // Proof: omitted create-name or post-inspect-name equality separately let their seed-write negatives succeed.
  if (created !== name) throw new InitRefusal('native-fixture-volume-create-unverified');
  const identity = fixtureResourceIdentity(
    'volume',
    JSON.parse(await run(['volume', 'inspect', name])),
    nonce,
  );
  if (identity !== name) throw new InitRefusal('native-fixture-volume-readback-unverified');
  await run([
    'run',
    '--rm',
    '--pull=never',
    '--network=none',
    '--name',
    `wbs-init-${nonce}-seed`,
    '--label',
    `${LABEL}=${nonce}`,
    '--entrypoint=/bin/sh',
    '--mount',
    `type=volume,source=${name},target=/seed`,
    image,
    '-c',
    'printf fixture-marker > /seed/fixture-marker',
  ]);
}

/** Resolve inventory abbreviations read-only, then bind the exact name, nonce label and full native identity before deletion. */
export async function removeFixtureResource(
  kind: 'network' | 'volume',
  reference: string,
  nonce: string,
  run: FixtureDocker = docker,
): Promise<void> {
  const identity = fixtureResourceIdentity(
    kind,
    JSON.parse(await run([kind, 'inspect', reference])),
    nonce,
  );
  await run([kind, 'rm', identity]);
}

/** Only the actual bounded client deadline, with unchanged PID/start/cgroup, proves stop did not escalate. */
export async function verifyFixtureStopDeadline(
  engine: Pick<EngineTransport, 'stop' | 'inspect'>,
  before: NativeContainer,
  nonce: string,
  ports = { now: () => performance.now(), observeProcess: observeSolverProcess },
): Promise<void> {
  verifyFixtureOwnership(before, nonce);
  const pid = before.state['Pid'];
  // Proof: positive-PID omission admitted a PID-zero deadline proof in edge-init.test.ts.
  if (typeof pid !== 'number' || pid < 1) throw new InitRefusal('native-fixture-stop-pid-invalid');
  const process = await ports.observeProcess(pid);
  const started = ports.now();
  const failure: unknown = await engine.stop(before.id, 250).then(
    () => null,
    (cause: unknown) => cause,
  );
  const elapsed = ports.now() - started;
  // Proof: reason, minimum-wait and maximum-wait omissions separately admitted status/early/late non-proofs.
  if (
    !(failure instanceof InitRefusal) ||
    failure.reason !== 'engine-deadline-uncertain' ||
    elapsed < 250 ||
    elapsed > 1250
  )
    throw new InitRefusal('native-fixture-stop-deadline-unproved');
  const retained = await engine.inspect(before.id, 10000);
  // Proof: full-ID, PID, StartedAt and kernel-identity omissions separately admitted their substituted-process negatives.
  if (
    retained.id !== before.id ||
    retained.state['Running'] !== true ||
    retained.state['Pid'] !== pid ||
    retained.state['StartedAt'] !== before.state['StartedAt'] ||
    fingerprint(await ports.observeProcess(pid)) !== fingerprint(process)
  )
    throw new InitRefusal('native-fixture-stop-process-changed');
}

/** A deliberate native fault earns its proof only at its exact stage, transcript and independently observed state. */
export function verifyFixtureFault(fault: FixtureFault, evidence: FaultEvidence): void {
  const phase =
    fault === 'alias-drift'
      ? 'candidate-inert'
      : fault === 'create-ack-lost'
        ? 'before-create'
        : fault === 'stop-ack-lost'
          ? 'stop-uncertain'
          : fault === 'rename-ack-lost'
            ? 'rename-uncertain'
            : fault === 'start-ack-lost'
              ? 'start-uncertain'
              : 'candidate-running-unhealthy';
  // Proof: injection and phase omissions separately admitted omitted-injection and wrong-phase fault proofs.
  if (!evidence.injected) throw new InitRefusal('native-fixture-fault-not-injected');
  if (!(evidence.failure instanceof InitRefusal) || evidence.failure.reason !== phase)
    throw new InitRefusal('native-fixture-fault-stage-unproved');
  const { originalId, candidateId, nonce } = evidence;
  readIdentity(originalId);
  readIdentity(candidateId);
  const originalName = `wbs-init-${nonce}-registry-fixture`;
  const retainedName = `wbs-init-${nonce}-registry-original`;
  const expected = ['create:registry'];
  const stopped = !['alias-drift', 'create-ack-lost'].includes(fault);
  const renamedOriginal = stopped && fault !== 'stop-ack-lost';
  const started = renamedOriginal && fault !== 'rename-ack-lost';
  if (stopped) expected.push(`stop:${originalId}`);
  if (renamedOriginal) expected.push(`rename:${originalId}:${retainedName}`);
  if (started) expected.push(`rename:${candidateId}:${originalName}`, `start:${candidateId}`);
  if (fault === 'route-loss') expected.push(`disconnect:${evidence.network}:${candidateId}`);
  if (fault === 'public-probe-failed') expected.push(`pause:${candidateId}`);
  if (fault === 'restart-after-health') expected.push(`restart:${candidateId}`);
  // Proof: transcript omission admitted the extra registry rename/start and unrelated Caddy-create transcript.
  if (fingerprint(evidence.effects) !== fingerprint(expected))
    throw new InitRefusal('native-fixture-fault-effects-unproved');
  const { original, candidate } = evidence;
  // Proof: independent name, Running and native Status omissions each admitted its wrong-state negative.
  if (
    original.id !== originalId ||
    candidate.id !== candidateId ||
    original.name !== `/${renamedOriginal ? retainedName : originalName}` ||
    original.state['Running'] !== !stopped ||
    (stopped && original.state['Pid'] !== 0) ||
    candidate.name !== `/${started ? originalName : `wbs-init-${nonce}-registry`}` ||
    candidate.state['Running'] !== started ||
    (!started && candidate.state['Pid'] !== 0) ||
    (started && (typeof candidate.state['Pid'] !== 'number' || candidate.state['Pid'] <= 0))
  )
    throw new InitRefusal('native-fixture-fault-state-unproved');
  if (
    original.state['Status'] !== (stopped ? 'exited' : 'running') ||
    original.state['Paused'] !== false ||
    original.state['Restarting'] !== false ||
    original.state['Dead'] !== false ||
    candidate.state['Status'] !==
      (!started ? 'created' : fault === 'public-probe-failed' ? 'paused' : 'running') ||
    candidate.state['Paused'] !== (fault === 'public-probe-failed') ||
    candidate.state['Restarting'] !== false ||
    candidate.state['Dead'] !== false
  )
    throw new InitRefusal('native-fixture-fault-native-state-unproved');
  // Proof: alias, route and restart readback omissions separately admitted their uninjected-state negatives.
  if (
    fault === 'alias-drift' &&
    !Object.values(candidate.networks)
      .map(readFields)
      .some(
        (endpoint) =>
          Array.isArray(endpoint['Aliases']) &&
          endpoint['Aliases'].includes('unexpected-fixture-alias'),
      )
  )
    throw new InitRefusal('native-fixture-alias-fault-unproved');
  if (fault === 'route-loss' && Object.hasOwn(candidate.networks, evidence.network))
    throw new InitRefusal('native-fixture-route-fault-unproved');
  if (
    fault === 'restart-after-health' &&
    (evidence.beforeRestart === undefined ||
      evidence.beforeRestart ===
        fingerprint({ pid: candidate.state['Pid'], startedAt: candidate.state['StartedAt'] }))
  )
    throw new InitRefusal('native-fixture-restart-fault-unproved');
}

type EffectObservation = string | { unrecognizedSha256: string };
// Proof: unknown-effect passthrough exposed the private argv sentinel in the record-redaction regression.
function describeFixtureEffect(effect: string, nonce: string): EffectObservation {
  const parts = effect.split(':');
  const id = (value: string | undefined) => value !== undefined && /^[a-f0-9]{64}$/.test(value);
  const names = ['registry', 'caddy'].flatMap((kind) =>
    ['', '-fixture', '-original'].map((suffix) => `wbs-init-${nonce}-${kind}${suffix}`),
  );
  const known =
    (parts.length === 2 && parts[0] === 'create' && ['registry', 'caddy'].includes(parts[1])) ||
    (parts.length === 2 &&
      ['stop', 'start', 'pause', 'restart', 'remove'].includes(parts[0]) &&
      id(parts[1])) ||
    (parts.length === 3 && parts[0] === 'rename' && id(parts[1]) && names.includes(parts[2])) ||
    (parts.length === 3 &&
      parts[0] === 'disconnect' &&
      [0, 1, 2].some((index) => parts[1] === `wbs-init-${nonce}-net-${String(index)}`) &&
      id(parts[2]));
  return known ? effect : { unrecognizedSha256: createHash('sha256').update(effect).digest('hex') };
}
/** Publishes a bounded private observation before the unchanged oracle can replace its failure.
 * Only fixed effect syntax and controlled refusal codes are retained; unknown strings and causes become hashes.
 * Proof: omission, overwrite, public mode, inner-read removal and each record-boundary guard failed selected private-file/native-oracle regressions.
 * Publication failure is a fixed refusal and leaves cleanup to the surrounding owned fixture scope.
 */
export async function publishFixtureFault(
  root: string,
  fault: FixtureFault,
  evidence: Pick<FaultEvidence, 'injected' | 'failure' | 'effects' | 'nonce'> & {
    outcome: 'returned' | 'refused';
  },
): Promise<void> {
  const sequence: unknown = evidence.effects;
  if (
    !FIXTURE_FAULTS.some((expected) => expected === fault) ||
    !/^[a-z0-9-]{1,64}$/.test(evidence.nonce) ||
    !Array.isArray(sequence) ||
    evidence.effects.length > 64 ||
    evidence.effects.some((effect) => typeof effect !== 'string') ||
    typeof evidence.injected !== 'boolean' ||
    !['returned', 'refused'].includes(evidence.outcome)
  )
    throw new InitRefusal('native-fixture-fault-record-invalid');
  const effects = evidence.effects.map((effect) => describeFixtureEffect(effect, evidence.nonce));
  const inner = readInitDiagnostic(evidence.failure);
  const publication = {
    format: 'edge-init-native-fault-observation',
    version: 1,
    nonce: evidence.nonce,
    stage: 'before-fault-oracle',
    fault,
    outcome: evidence.outcome,
    injected: evidence.injected,
    failure:
      evidence.outcome === 'refused'
        ? inner === undefined
          ? describeFixtureFailure(`fault-${fault}`, evidence.failure)
          : { stage: `fault-${fault}`, ...inner }
        : null,
    effects,
    effectCount: effects.length,
    lastEffect: effects.at(-1) ?? null,
    effectsSha256: fingerprint(evidence.effects),
  };
  try {
    await writeFile(join(root, `fault-${fault}.json`), JSON.stringify(publication), {
      mode: 0o600,
      flag: 'wx',
    });
  } catch {
    throw new InitRefusal('native-fixture-fault-record-publication-failed');
  }
}

/** Fixture effects and cleanup require both an invocation-owned name and its independent nonce label. */
export function verifyFixtureOwnership(container: NativeContainer, nonce: string): string {
  // Proof: separate label and name omissions each admitted a foreign fixture target; edge-init.test.ts failed.
  if (
    !/^[a-f0-9-]{8,64}$|^synthetic$/.test(nonce) ||
    readFields(container.config['Labels'])[LABEL] !== nonce ||
    ![
      'registry-fixture',
      'caddy-fixture',
      'registry',
      'caddy',
      'registry-original',
      'caddy-original',
      'seed',
      'term',
    ].some((suffix) => container.name === `/wbs-init-${nonce}-${suffix}`)
  )
    throw new InitRefusal('native-fixture-ownership-refused');
  return readIdentity(container.id);
}

async function docker(args: readonly string[], timeout = 30000): Promise<string> {
  const executable = Bun.which('docker');
  if (executable === null) throw new InitRefusal('native-fixture-docker-unavailable');
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'].includes(key),
    ),
  );
  environment['DOCKER_API_VERSION'] = '1.52';
  const child = Bun.spawn([executable, '--host=unix:///var/run/docker.sock', ...args], {
    env: environment,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
  }, timeout);
  async function drain(stream: ReadableStream<Uint8Array>, retain: boolean): Promise<Uint8Array[]> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) return chunks;
        length += next.value.length;
        if (length > 4 * 1048576) {
          child.kill('SIGKILL');
          throw new InitRefusal('native-fixture-output-too-large');
        }
        if (retain) chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  try {
    const [stdout, , status] = await Promise.all([
      drain(child.stdout, true),
      drain(child.stderr, false),
      child.exited,
    ]);
    if (status !== 0) throw new InitRefusal('native-fixture-command-refused');
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(stdout)).trim();
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) child.kill('SIGKILL');
    await child.exited;
  }
}

async function inspected(id: string): Promise<NativeContainer> {
  const raw: unknown = JSON.parse(await docker(['inspect', id]));
  if (!Array.isArray(raw) || raw.length !== 1)
    throw new InitRefusal('native-fixture-inspection-refused');
  return parseNativeContainer(raw[0]);
}

async function selectFixturePort(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => {
    server.close((cause) => {
      if (cause) reject(cause);
      else resolve();
    });
  });
  if (address === null || typeof address === 'string')
    throw new InitRefusal('native-fixture-port-selection-failed');
  return String(address.port);
}

async function requireGone(process: SolverProcess): Promise<void> {
  try {
    const current = await observeSolverProcess(process.pid);
    if (current.startTime === process.startTime)
      throw new InitRefusal('native-fixture-process-retained');
  } catch (cause) {
    if (!(
      cause instanceof Error &&
      'code' in cause &&
      ['ENOENT', 'ESRCH'].includes(String(cause.code))
    ))
      throw cause;
  }
  const path = `/sys/fs/cgroup${process.cgroup}`;
  try {
    const events = await readFile(join(path, 'cgroup.events'), 'utf8');
    const members = await readFile(join(path, 'cgroup.procs'), 'utf8');
    if (!/^populated 0$/m.test(events) || members.trim() !== '')
      throw new InitRefusal('native-fixture-cgroup-retained');
  } catch (cause) {
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
  }
}

function publishedPort(container: NativeContainer, kind: TargetKind): string {
  const bindings = readFields(container.ports)[kind === 'registry' ? '5000/tcp' : '8080/tcp'];
  if (!Array.isArray(bindings) || bindings.length !== 1)
    throw new InitRefusal('native-fixture-port-refused');
  const binding = readFields(bindings[0]);
  if (binding['HostIp'] !== '127.0.0.1' || !/^[0-9]+$/.test(readString(binding['HostPort'])))
    throw new InitRefusal('native-fixture-port-refused');
  return readString(binding['HostPort']);
}

async function routeNetwork(container: NativeContainer): Promise<string> {
  const route = await docker(['exec', container.id, 'cat', '/proc/net/route']);
  const defaults = route
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((fields) => fields[1] === '00000000' && fields[7] === '00000000');
  if (defaults.length !== 1) throw new InitRefusal('native-fixture-default-route-ambiguous');
  const gateway = defaults[0][2];
  if (!/^[a-fA-F0-9]{8}$/.test(gateway)) throw new InitRefusal('native-fixture-route-invalid');
  const address = [6, 4, 2, 0]
    .map((offset) => parseInt(gateway.slice(offset, offset + 2), 16))
    .join('.');
  const matches = Object.values(container.networks)
    .map(readFields)
    .filter((endpoint) => endpoint['Gateway'] === address);
  if (matches.length !== 1) throw new InitRefusal('native-fixture-default-route-ambiguous');
  return readIdentity(matches[0]['NetworkID']);
}

async function probe(port: string, kind: TargetKind): Promise<void> {
  const response = await fetch(
    `http://127.0.0.1:${port}${kind === 'registry' ? '/v2/' : '/health'}`,
    {
      redirect: 'error',
      signal: AbortSignal.timeout(2000),
      headers: { Connection: 'close', 'Accept-Encoding': 'identity' },
    },
  );
  if (
    response.status !== 200 ||
    (await response.text()) !== (kind === 'registry' ? '{}' : 'fixture-ready')
  )
    throw new InitRefusal('native-fixture-public-health-refused');
}

async function ready(port: string, kind: TargetKind): Promise<void> {
  const expires = performance.now() + 10000;
  for (;;) {
    try {
      await probe(port, kind);
      return;
    } catch {
      if (performance.now() + 100 >= expires)
        throw new InitRefusal('native-fixture-health-did-not-converge');
      await Bun.sleep(100);
    }
  }
}

/** Cleanup deletes only the exact listed full ID after fresh native ownership and identity readback.
 * Proof: removing ID equality or ownership admission let its blank-network native cleanup negative delete the listed container.
 */
export async function removeFixtureContainer(
  id: string,
  nonce: string,
  run: FixtureDocker = docker,
): Promise<void> {
  readIdentity(id);
  const inspection: unknown = JSON.parse(await run(['inspect', id]));
  if (!Array.isArray(inspection) || inspection.length !== 1)
    throw new InitRefusal('native-fixture-cleanup-inspection-invalid');
  const container = parseNativeContainer(inspection[0]);
  if (container.id !== id) throw new InitRefusal('native-fixture-cleanup-id-mismatch');
  verifyFixtureOwnership(container, nonce);
  await run(['rm', '--force', '--volumes', id]);
}

async function cleanup(nonce: string): Promise<void> {
  const ids = (
    await docker(['ps', '--all', '--quiet', '--no-trunc', '--filter', `label=${LABEL}=${nonce}`])
  )
    .split('\n')
    .filter((id) => id !== '');
  for (const id of ids) {
    await removeFixtureContainer(readIdentity(id), nonce);
  }
  for (const kind of ['network', 'volume']) {
    const names = (await docker([kind, 'ls', '--quiet', '--filter', `label=${LABEL}=${nonce}`]))
      .split('\n')
      .filter((name) => name !== '');
    for (const name of names) {
      await removeFixtureResource(kind === 'network' ? 'network' : 'volume', name, nonce);
    }
    if ((await docker([kind, 'ls', '--quiet', '--filter', `label=${LABEL}=${nonce}`])) !== '')
      throw new InitRefusal('native-fixture-resource-cleanup-unverified');
  }
  if ((await docker(['ps', '--all', '--quiet', '--filter', `label=${LABEL}=${nonce}`])) !== '')
    throw new InitRefusal('native-fixture-container-cleanup-unverified');
}

/** Explicit disposable native acceptance. Missing local immutable images/daemon/tools refuse; this never pulls. */
export async function runNativeInitAcceptance(): Promise<void> {
  if (process.argv.slice(2).length !== 0 || process.platform !== 'linux' || Bun.version !== '1.4.4')
    throw new InitRefusal('native-fixture-runtime-refused');
  const registryImage = process.env['EDGE_INIT_FIXTURE_REGISTRY_IMAGE'];
  const caddyImage = process.env['EDGE_INIT_FIXTURE_CADDY_IMAGE'];
  if (
    registryImage === undefined ||
    caddyImage === undefined ||
    !IMAGE.test(registryImage) ||
    !IMAGE.test(caddyImage)
  )
    throw new InitRefusal('native-fixture-local-image-pins-required');
  if (
    (await docker(['version', '--format', '{{.Server.APIVersion}}'])) !== '1.52' ||
    (await docker(['info', '--format', '{{.OSType}}'])) !== 'linux'
  )
    throw new InitRefusal('native-fixture-engine-refused');
  const nativeVersion: unknown = JSON.parse(
    await docker(['version', '--format', '{{json .Server}}']),
  );
  const nativeInfo: unknown = JSON.parse(await docker(['info', '--format', '{{json .}}']));
  const profile = admitInvariantProfile(nativeVersion, nativeInfo);
  for (const image of [registryImage, caddyImage])
    if ((await docker(['image', 'inspect', '--format', '{{.Id}}', image])) !== image)
      throw new InitRefusal('native-fixture-image-not-present');
  const nonce = randomUUID().replaceAll('-', '');
  const prefix = `wbs-init-${nonce}`;
  const root = await mkdtemp(join(tmpdir(), `${prefix}-`));
  const caddyDirectory = join(root, 'caddy');
  await mkdir(caddyDirectory);
  const config = ':8080 {\n\trespond /health "fixture-ready" 200\n}\n';
  await Bun.write(join(caddyDirectory, 'Caddyfile'), config);
  const networks = [0, 1, 2].map((index) => `${prefix}-net-${String(index)}`);
  const registryPort = await selectFixturePort();
  const caddyPort = await selectFixturePort();
  const volumes = ['registry', 'caddy-data', 'caddy-config'].map((name) => `${prefix}-${name}`);
  let summary: { stage: string; receiptDirectory: string; sha256: string } | undefined;
  let failureCode: 'native-fixture-proof-failed' | 'native-fixture-receipt-failed' | undefined;
  const pinnedNetworks: NetworkPin[] = [];
  let stage: FixtureFailureStage = 'networks';
  let proofFailure: FixtureFailure | null = null;
  await requireUnusedFixtureNamespace(nonce);
  try {
    for (const network of networks) {
      const id = readIdentity(
        await docker(['network', 'create', '--label', `${LABEL}=${nonce}`, network]),
      );
      const raw: unknown = JSON.parse(await docker(['network', 'inspect', id]));
      const owner = fixtureResourceIdentity('network', raw, nonce);
      if (owner !== id || !Array.isArray(raw) || raw.length !== 1)
        throw new InitRefusal('native-fixture-network-pin-invalid');
      const { Containers: _members, ...configuration } = readFields(raw[0]);
      if (configuration['Name'] !== network)
        throw new InitRefusal('native-fixture-network-pin-invalid');
      pinnedNetworks.push({ name: network, id, sha256: fingerprint(configuration) });
    }
    stage = 'volumes';
    for (const volume of volumes) {
      await createFixtureVolume(volume, nonce, caddyImage);
    }
    stage = 'containers';
    const shared = [
      '--detach',
      '--pull=never',
      '--label',
      `${LABEL}=${nonce}`,
      '--hostname',
      'preserved-fixture-hostname',
      '--restart',
      'unless-stopped',
      '--memory',
      '96m',
      '--cpus',
      '0.25',
      '--security-opt',
      'no-new-privileges',
      '--log-driver',
      'json-file',
      '--log-opt',
      'max-size=1m',
      '--network',
      networks[0],
    ];
    const registry = readIdentity(
      await docker([
        'run',
        ...shared,
        '--name',
        `${prefix}-registry-fixture`,
        '--network-alias',
        'registry-fixture',
        '--label',
        'com.docker.compose.service=registry',
        '--env',
        'REGISTRY_HTTP_ADDR=0.0.0.0:5000',
        '--env',
        'REGISTRY_STORAGE_DELETE_ENABLED=true',
        '--env',
        'EMPTY=',
        '--publish',
        `127.0.0.1:${registryPort}:5000`,
        '--mount',
        `type=volume,source=${volumes[0]},target=/var/lib/registry`,
        registryImage,
      ]),
    );
    const caddy = readIdentity(
      await docker([
        'run',
        ...shared,
        '--name',
        `${prefix}-caddy-fixture`,
        '--network-alias',
        'caddy-fixture',
        '--label',
        'com.docker.compose.service=caddy',
        '--env',
        'ORDERED=nondefault',
        '--env',
        'EMPTY=',
        '--publish',
        `127.0.0.1:${caddyPort}:8080`,
        '--mount',
        `type=bind,source=${caddyDirectory},target=/etc/caddy,readonly`,
        '--mount',
        `type=volume,source=${volumes[1]},target=/data`,
        '--mount',
        `type=volume,source=${volumes[2]},target=/config`,
        '--entrypoint=',
        caddyImage,
        'caddy',
        'run',
        '--config',
        '/etc/caddy/Caddyfile',
        '--adapter',
        'caddyfile',
      ]),
    );
    for (const [index, network] of networks.slice(1).entries())
      await docker([
        'network',
        'connect',
        '--gw-priority',
        String(-index - 1),
        '--alias',
        `caddy-extra-${String(index)}`,
        network,
        caddy,
      ]);
    const engine = new EngineTransport(
      '/var/run/docker.sock',
      [registry, caddy],
      nonce,
      'owned-fixture',
    );
    stage = 'original-inspection';
    const targets: [SelectedTarget, SelectedTarget] = [
      {
        kind: 'registry',
        original: await engine.inspect(registry, 10000),
        networks: pinnedNetworks.slice(0, 1),
      },
      { kind: 'caddy', original: await engine.inspect(caddy, 10000), networks: pinnedNetworks },
    ];
    if (
      targets[1].original.config['Entrypoint'] !== null ||
      Object.keys(targets[1].original.networks).length !== 3
    )
      throw new InitRefusal('native-fixture-required-shape-absent');
    const contextFor = (
      target: SelectedTarget,
      observed: NativeContainer,
      phase: 'never-started' | 'running' | 'stopped',
    ): InvariantContext => {
      if (target.networks === undefined) throw new InitRefusal('network-pins-missing');
      return {
        profile,
        networks: target.networks,
        owner:
          observed.id === target.original.id
            ? {
                role: 'original',
                id: target.original.id,
                phase: phase === 'running' ? 'running' : 'stopped',
              }
            : { role: 'replacement', id: observed.id, originalId: target.original.id, phase },
      };
    };
    for (const target of targets) {
      checkProfileSource(target.original, profile);
      projectInvariant(target.original, contextFor(target, target.original, 'running'));
    }
    stage = 'baseline';
    const processes = new Map<string, SolverProcess>();
    const ports = new Map<TargetKind, string>();
    const routes = new Map<TargetKind, string>();
    let caddyHash: string | undefined;
    for (const target of targets) {
      verifyFixtureOwnership(target.original, nonce);
      const pid = target.original.state['Pid'];
      if (typeof pid !== 'number') throw new InitRefusal('native-fixture-pid-invalid');
      processes.set(target.original.id, await observeSolverProcess(pid));
      ports.set(target.kind, publishedPort(target.original, target.kind));
      routes.set(target.kind, await routeNetwork(target.original));
      await ready(publishedPort(target.original, target.kind), target.kind);
    }
    const checkCaddy = async (id: string) => {
      const adapted: unknown = JSON.parse(await engine.execCaddy(id, 'adapt', 10000));
      const live: unknown = JSON.parse(await engine.execCaddy(id, 'live', 10000));
      const hash = fingerprint(adapted);
      if (
        hash !== fingerprint(live) ||
        (caddyHash !== undefined && caddyHash !== hash) ||
        (await readFile(join(caddyDirectory, 'Caddyfile'), 'utf8')) !== config
      )
        throw new InitRefusal('native-fixture-caddy-config-changed');
      caddyHash = hash;
    };
    await checkCaddy(caddy);
    const networkPhases: {
      target: TargetKind;
      phase: 'never-started' | 'running';
      emptyIds: number;
      fullIds: number;
      sha256: string;
    }[] = [];
    const recordNetworkPhase = (
      target: TargetKind,
      phase: 'never-started' | 'running',
      observed: NativeContainer,
    ) => {
      const endpoints = Object.values(observed.networks).map(readFields);
      const emptyIds = endpoints.filter((endpoint) => endpoint['NetworkID'] === '').length;
      networkPhases.push({
        target,
        phase,
        emptyIds,
        fullIds: endpoints.length - emptyIds,
        sha256: fingerprint(observed.networks),
      });
    };
    const oomCreated = new Set<TargetKind>(),
      oomRunning = new Set<TargetKind>();
    const observer: HostObserver = {
      admit: async (deadline) => {
        deadline.allocate(1000);
        admitInvariantProfile(await engine.version(10000), await engine.info(10000));
        for (const raw of await engine.inventory(10000)) {
          const fields = readFields(raw);
          if (fields['Labels'] !== null && readFields(fields['Labels'])[LABEL] === nonce)
            verifyFixtureOwnership(
              await engine.inspectListed(readIdentity(fields['Id']), 10000),
              nonce,
            );
        }
      },
      original: async (_target, container) => {
        verifyFixtureOwnership(container, nonce);
        const pid = container.state['Pid'];
        if (
          typeof pid !== 'number' ||
          fingerprint(await observeSolverProcess(pid)) !== fingerprint(processes.get(container.id))
        )
          throw new InitRefusal('native-fixture-original-process-changed');
      },
      inert: async (target, container, deadline) => {
        verifyFixtureOom(container, 'created');
        oomCreated.add(target.kind);
        await observeNetworks(
          engine,
          container,
          contextFor(target, container, 'never-started'),
          deadline,
        );
        recordNetworkPhase(target.kind, 'never-started', container);
        verifyFixtureOwnership(container, nonce);
      },
      stopped: async (target, container, deadline) => {
        await observeNetworks(
          engine,
          container,
          contextFor(target, container, 'stopped'),
          deadline,
        );
        verifyFixtureOwnership(container, nonce);
        if (container.state['Pid'] !== 0 || container.state['Running'] !== false)
          throw new InitRefusal('native-fixture-original-not-stopped');
        const process = processes.get(target.original.id);
        if (process === undefined) throw new InitRefusal('native-fixture-process-pin-absent');
        await requireGone(process);
        for (const endpoint of Object.values(container.networks).map(readFields)) {
          if (endpoint['EndpointID'] !== '')
            throw new InitRefusal('native-fixture-original-endpoint-retained');
          const members = readFields(
            readFields(await engine.network(readIdentity(endpoint['NetworkID']), 10000))[
              'Containers'
            ],
          );
          if (Object.hasOwn(members, container.id))
            throw new InitRefusal('native-fixture-original-network-membership-retained');
        }
      },
      running: async (target, container, deadline) => {
        verifyFixtureOom(container, 'running');
        oomRunning.add(target.kind);
        await observeNetworks(
          engine,
          container,
          contextFor(target, container, 'running'),
          deadline,
        );
        recordNetworkPhase(target.kind, 'running', container);
        verifyFixtureOwnership(container, nonce);
        if (
          (await docker(['exec', container.id, 'cat', '/proc/1/comm'])) !== 'docker-init' ||
          (await routeNetwork(container)) !== routes.get(target.kind) ||
          publishedPort(container, target.kind) !== ports.get(target.kind)
        )
          throw new InitRefusal('native-fixture-running-identity-changed');
        const marker =
          target.kind === 'registry' ? '/var/lib/registry/fixture-marker' : '/data/fixture-marker';
        if ((await docker(['exec', container.id, 'cat', marker])) !== 'fixture-marker')
          throw new InitRefusal('native-fixture-persistent-marker-changed');
        if (target.kind === 'caddy') await checkCaddy(container.id);
      },
      health: async (kind) => {
        const port = ports.get(kind);
        if (port === undefined) throw new InitRefusal('native-fixture-health-pin-absent');
        await ready(port, kind);
      },
      combined: async (deadline) => {
        for (const target of targets) {
          const raw: unknown = JSON.parse(
            await docker(['inspect', `${prefix}-${target.kind}-fixture`]),
          );
          if (!Array.isArray(raw) || raw.length !== 1)
            throw new InitRefusal('native-fixture-final-target-absent');
          const container = parseNativeContainer(raw[0]);
          verifyFixtureOwnership(container, nonce);
          compareCandidate(target.original, container, contextFor(target, container, 'running'));
          await observer.running(target, container, deadline);
          await observer.health(target.kind, container.id, deadline);
        }
      },
      absent: async (id) => {
        if (!(await engine.inspectAbsent(id, 10000)))
          throw new InitRefusal('native-fixture-original-removal-unverified');
      },
    };
    // Deliberate native preservation mismatch proves an inert candidate cannot stop a serving original.
    stage = 'inert-candidate';
    const mismatch = constructCandidate(targets[0].original);
    mismatch.Config = { ...mismatch.Config, Env: ['MISMATCH=1'] };
    const mismatched = await engine.create('registry', mismatch, 20000);
    let refused = false;
    try {
      compareCandidate(targets[0].original, await engine.inspect(mismatched, 10000), {
        profile,
        networks: pinnedNetworks.slice(0, 1),
        owner: {
          role: 'replacement',
          id: mismatched,
          originalId: targets[0].original.id,
          phase: 'never-started',
        },
      });
    } catch (cause) {
      if (!(cause instanceof InitRefusal)) throw cause;
      refused = true;
    }
    if (
      !refused ||
      (await engine.inspect(registry, 10000)).state['Running'] !== true ||
      (await engine.inspect(mismatched, 10000)).state['Pid'] !== 0
    )
      throw new InitRefusal('native-fixture-inert-refusal-unproved');
    await probe(publishedPort(targets[0].original, 'registry'), 'registry');
    verifyFixtureOwnership(await engine.inspect(mismatched, 10000), nonce);
    await engine.remove(mismatched, 10000);
    const faults = FIXTURE_FAULTS;
    for (const fault of faults) {
      stage = `fault-${fault}`;
      const candidates: string[] = [];
      let candidateHealthRounds = 0;
      const transcript: string[] = [];
      const injection = { fired: false };
      let beforeRestart: string | undefined;
      const effects = {
        network: (id: string, timeout: number) => engine.network(id, timeout),
        networkByName: (name: string, timeout: number) => engine.networkByName(name, timeout),
        inspect: (id: string, timeout: number) => engine.inspect(id, timeout),
        create: async (
          kind: TargetKind,
          request: ReturnType<typeof constructCandidate>,
          timeout: number,
        ) => {
          transcript.push(`create:${kind}`);
          if (kind !== 'registry') throw new InitRefusal('native-fixture-fault-expanded-targets');
          const input = structuredClone(request);
          if (fault === 'alias-drift') {
            const [network] = Object.keys(input.NetworkingConfig.EndpointsConfig);
            const endpoint = readFields(input.NetworkingConfig.EndpointsConfig[network]);
            input.NetworkingConfig.EndpointsConfig[network] = {
              ...endpoint,
              Aliases: ['unexpected-fixture-alias'],
            };
            injection.fired = true;
          }
          const candidate = await engine.create(kind, input, timeout);
          candidates.push(candidate);
          if (fault === 'create-ack-lost') {
            injection.fired = true;
            throw new InitRefusal('native-fixture-acknowledgement-lost');
          }
          return candidate;
        },
        stop: async (id: string, timeout: number) => {
          transcript.push(`stop:${id}`);
          await engine.stop(id, timeout);
          if (fault === 'stop-ack-lost') {
            injection.fired = true;
            throw new InitRefusal('native-fixture-acknowledgement-lost');
          }
        },
        rename: async (id: string, name: string, timeout: number) => {
          transcript.push(`rename:${id}:${name}`);
          await engine.rename(id, name, timeout);
          if (fault === 'rename-ack-lost') {
            injection.fired = true;
            throw new InitRefusal('native-fixture-acknowledgement-lost');
          }
        },
        start: async (id: string, timeout: number) => {
          transcript.push(`start:${id}`);
          await engine.start(id, timeout);
          if (fault === 'route-loss') {
            transcript.push(`disconnect:${networks[0]}:${id}`);
            await docker(['network', 'disconnect', networks[0], id]);
            injection.fired = true;
          }
          if (fault === 'start-ack-lost') {
            injection.fired = true;
            throw new InitRefusal('native-fixture-acknowledgement-lost');
          }
        },
        remove: async (id: string, timeout: number) => {
          transcript.push(`remove:${id}`);
          await engine.remove(id, timeout);
        },
      };
      const faultObserver: HostObserver = {
        ...observer,
        health: async (kind, id, deadline) => {
          if (id === candidates.at(0) && fault === 'public-probe-failed') {
            transcript.push(`pause:${id}`);
            await docker(['pause', id]);
            injection.fired = true;
          }
          await observer.health(kind, id, deadline);
          if (
            id === candidates.at(0) &&
            fault === 'restart-after-health' &&
            ++candidateHealthRounds === 1
          ) {
            const before = await engine.inspect(id, 10000);
            beforeRestart = fingerprint({
              pid: before.state['Pid'],
              startedAt: before.state['StartedAt'],
            });
            transcript.push(`restart:${id}`);
            await docker(['restart', id]);
            injection.fired = true;
          }
        },
      };
      const faultReceipts = await PrivateReceipts.create(join(root, `receipts-${fault}`), nonce);
      let failure: unknown;
      let outcome: 'returned' | 'refused' = 'returned';
      try {
        await runInitAdoption(
          { nonce, targets, namespace: 'owned-fixture', invariantProfile: profile },
          effects,
          faultObserver,
          faultReceipts,
        );
      } catch (cause) {
        failure = cause;
        outcome = 'refused';
      }
      // The original refusal remains the oracle input; private evidence is written before candidate readback or oracle replacement.
      // Proof: modeled pre-injection evidence survived the later oracle and cleanup records without granting a fault proof.
      await publishFixtureFault(root, fault, {
        outcome,
        injected: injection.fired,
        failure,
        effects: transcript,
        nonce,
      });
      const candidate = candidates.at(0);
      if (candidate === undefined) throw new InitRefusal('native-fixture-fault-candidate-absent');
      verifyFixtureFault(fault, {
        injected: injection.fired,
        failure,
        effects: transcript,
        original: await engine.inspect(registry, 10000),
        candidate: await engine.inspect(candidate, 10000),
        originalId: registry,
        candidateId: candidate,
        nonce,
        network: networks[0],
        ...(beforeRestart === undefined ? {} : { beforeRestart }),
      });
      // Disposable fixture restoration is explicit test setup; production has no corresponding recovery effect.
      verifyFixtureOwnership(await engine.inspect(candidate, 10000), nonce);
      await docker(['rm', '--force', '--volumes', candidate]);
      const retained = await engine.inspect(registry, 10000);
      verifyFixtureOwnership(retained, nonce);
      if (retained.name !== `/${prefix}-registry-fixture`)
        await docker(['rename', registry, `${prefix}-registry-fixture`]);
      if (retained.state['Running'] === false) await docker(['start', registry]);
      targets[0].original = await engine.inspect(registry, 10000);
      const pid = targets[0].original.state['Pid'];
      if (typeof pid !== 'number') throw new InitRefusal('native-fixture-restored-pid-invalid');
      processes.set(registry, await observeSolverProcess(pid));
      ports.set('registry', publishedPort(targets[0].original, 'registry'));
      routes.set('registry', await routeNetwork(targets[0].original));
      await ready(publishedPort(targets[0].original, 'registry'), 'registry');
    }
    stage = 'adoption';
    const receipts = await PrivateReceipts.create(join(root, 'receipts'), nonce);
    await runInitAdoption(
      { nonce, targets, namespace: 'owned-fixture', invariantProfile: profile },
      engine,
      observer,
      receipts,
    );
    stage = 'stop-deadline';
    const term = readIdentity(
      await docker([
        'run',
        '--detach',
        '--pull=never',
        '--init',
        '--network=none',
        '--name',
        `${prefix}-term`,
        '--label',
        `${LABEL}=${nonce}`,
        '--entrypoint=/bin/sh',
        caddyImage,
        '-c',
        'trap "" TERM; while :; do sleep 1; done',
      ]),
    );
    const stubborn = await inspected(term);
    verifyFixtureOwnership(stubborn, nonce);
    await Bun.sleep(200);
    const stopEngine = new EngineTransport('/var/run/docker.sock', [term], nonce, 'owned-fixture');
    await verifyFixtureStopDeadline(stopEngine, stubborn, nonce);
    requireFixtureOomRoster(oomCreated, oomRunning);
    stage = 'report';
    const report = {
      version: 1,
      status: 'passed',
      invariantProfile: CREATED_PROFILE,
      images: { registry: registryImage, caddy: caddyImage },
      daemonVersionSha256: fingerprint(nativeVersion),
      daemonInfoSha256: fingerprint(nativeInfo),
      networkPhases,
      oomRepresentations: targets.map(({ kind }) => ({
        target: kind,
        original: null,
        request: null,
        created: false,
        running: null,
      })),
      nonce,
      checks: [
        'native-preservation',
        'three-network-default-route',
        'inert-candidate-refusal',
        'ordered-env',
        'null-entrypoint',
        'persistent-nonempty-storage',
        'caddy-adapt-live',
        'native-init',
        'full-health-before-removal',
        'stop-minus-one-client-uncertainty',
        ...faults,
      ],
      receiptDirectory: receipts.directory,
    };
    await writeFile(join(root, 'report.json'), JSON.stringify(report), { mode: 0o600, flag: 'wx' });
    summary = {
      stage: 'native-proof-passed',
      receiptDirectory: root,
      sha256: createHash('sha256').update(JSON.stringify(report)).digest('hex'),
    };
  } catch (cause) {
    failureCode = 'native-fixture-proof-failed';
    proofFailure = describeFixtureFailure(stage, cause);
    let receiptSha256: string | null = null;
    try {
      receiptSha256 = await publishFixtureFailure(root, nonce, proofFailure, null);
    } catch {
      failureCode = 'native-fixture-receipt-failed';
    }
    console.log(
      JSON.stringify({
        stage: 'native-proof-failed',
        failure: proofFailure,
        receiptDirectory: root,
        receiptSha256,
      }),
    );
  }
  try {
    await cleanup(nonce);
  } catch (cause) {
    const cleanupFailure = describeFixtureFailure('cleanup', cause);
    let receiptSha256: string | null = null;
    try {
      receiptSha256 = await publishFixtureFailure(root, nonce, proofFailure, cleanupFailure);
    } catch {
      failureCode = 'native-fixture-receipt-failed';
    }
    console.log(
      JSON.stringify({
        stage: 'native-cleanup-failed',
        proof: proofFailure,
        cleanup: cleanupFailure,
        receiptDirectory: root,
        receiptSha256,
        publication: failureCode === 'native-fixture-receipt-failed' ? 'failed' : 'written',
      }),
    );
    throw new InitRefusal('native-fixture-cleanup-failed');
  }
  if (failureCode !== undefined) throw new InitRefusal(failureCode);
  if (summary === undefined) throw new InitRefusal('native-fixture-summary-absent');
  console.log(JSON.stringify(summary));
}

if (import.meta.main) {
  try {
    await runNativeInitAcceptance();
  } catch (cause) {
    console.error(
      cause instanceof InitRefusal ? cause.message : 'edge Init native acceptance refused',
    );
    process.exitCode = 1;
  }
}
