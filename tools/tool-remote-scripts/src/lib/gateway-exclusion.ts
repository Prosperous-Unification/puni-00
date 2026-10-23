import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';

import { assertDigestPinnedRef, containerName } from './docker';
import { type RunDocker, runDockerBefore } from './docker-deadline';
import type { EnvLayout } from './env';
import { assertNoGatewayFence } from './gateway-fence';
import { withLock } from './lock';
import { writeNewMigrationCapture } from './migration-capture-file';

const MARKER = '{"format":"dependency-gateway-fence","version":1}\n';
const INTENT = 'dependency-gateway-intent.json';
const COMPLETE = 'dependency-gateway-complete.json';
const COLORS = ['blue', 'green'] as const;
const ID = /^[a-f0-9]{64}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;

type Fields = Record<string, unknown>;
interface RestartPolicy {
  name: string;
  maximumRetryCount: number;
}
interface GatewayState {
  running: boolean;
  paused: boolean;
  restarting: boolean;
  dead: boolean;
  oomKilled: boolean;
  pid: number;
  status: string;
  startedAt: string;
  finishedAt: string;
  exitCode: number;
  error: string;
}
interface Gateway {
  id: string;
  name: string;
  image: string;
  imageRef: string;
  service: string;
  project: string;
  network: string;
  networkId: string;
  restartPolicy: RestartPolicy;
  restartCount: number;
  state: GatewayState;
}
interface Cohort {
  blue: Gateway | null;
  green: Gateway | null;
}
interface Intent {
  format: 'dependency-gateway-intent';
  version: 1;
  attempt: string;
  environment: string;
  root: string;
  network: string;
  sha: string;
  cohort: Cohort;
}
/** Historical receipt only. {@link inspectGatewayFence} must freshly prove physical exclusion. */
export interface GatewayCompletion {
  format: 'dependency-gateway-complete';
  version: 1;
  attempt: string;
  intentSha256: string;
  cohort: Cohort;
}

function readFields(value: unknown): Fields {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('gateway fence inspection contains a malformed object');
  // The object boundary above excludes null and arrays; property access remains unknown.
  return value as Fields;
}
// Proof: ignoring closed fields admitted extra-completion-field through real retained-record inspection.
function readClosed(value: unknown, keys: string[]): Fields {
  const record = readFields(value);
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key)))
    throw new Error('gateway fence record has unknown or missing fields');
  return record;
}
function readString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('gateway fence expected a string');
  return value;
}
// Proof: removing integer validation admitted negative RestartCount in the mounted pre-publication negative.
function readInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('gateway fence expected a nonnegative integer');
  return value;
}
// Proof: removing boolean validation admitted string Running in the boolean-type mounted negative.
function readBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('gateway fence expected a boolean');
  return value;
}
// Proof: accepting a missing network ID let the mounted network prerequisite negative publish and stop.
function readIdentity(value: unknown): string {
  const text = readString(value);
  if (!ID.test(text)) throw new Error('gateway fence requires full container/network identity');
  return text;
}
// Proof: accepting equal malformed inspect/resolution IDs admitted invalid-image-identity before publication.
function readDigest(value: unknown): string {
  const text = readString(value);
  if (!DIGEST.test(text)) throw new Error('gateway fence requires full image identity');
  return text;
}
// Proof: removing nonempty validation admitted an empty Compose project in the mounted boundary negative.
function readNonempty(value: unknown): string {
  const text = readString(value);
  if (text.trim() === '') throw new Error('gateway fence requires nonempty identity');
  return text;
}
// Proof: omitting comparisons let lying-update reach stop; the mounted negative observes the forbidden stop.
function assertSame(expected: unknown, observed: unknown, description: string): void {
  if (JSON.stringify(expected) !== JSON.stringify(observed))
    throw new Error(`gateway fence ${description} changed or was not excluded`);
}
function digestIntent(contents: string): string {
  return createHash('sha256').update(contents).digest('hex');
}

function parsePolicy(value: unknown, docker: boolean): RestartPolicy {
  const record = readClosed(
    value,
    docker ? ['Name', 'MaximumRetryCount'] : ['name', 'maximumRetryCount'],
  );
  const name = readString(record[docker ? 'Name' : 'name']);
  const maximumRetryCount = readInteger(record[docker ? 'MaximumRetryCount' : 'maximumRetryCount']);
  // Proof: independently accepting an unknown policy or nonzero non-on-failure retry count admitted both mounted policy negatives.
  if (
    !['no', 'always', 'unless-stopped', 'on-failure'].includes(name) ||
    (name !== 'on-failure' && maximumRetryCount !== 0)
  )
    throw new Error('gateway fence restart policy is malformed');
  return { name, maximumRetryCount };
}
function parseState(value: unknown, docker: boolean): GatewayState {
  const names = {
    running: 'Running',
    paused: 'Paused',
    restarting: 'Restarting',
    dead: 'Dead',
    oomKilled: 'OOMKilled',
    pid: 'Pid',
    status: 'Status',
    startedAt: 'StartedAt',
    finishedAt: 'FinishedAt',
    exitCode: 'ExitCode',
    error: 'Error',
  } as const;
  const record = docker ? readFields(value) : readClosed(value, Object.keys(names));
  const readStateField = (key: keyof GatewayState): unknown => record[docker ? names[key] : key];
  const state = {
    running: readBoolean(readStateField('running')),
    paused: readBoolean(readStateField('paused')),
    restarting: readBoolean(readStateField('restarting')),
    dead: readBoolean(readStateField('dead')),
    oomKilled: readBoolean(readStateField('oomKilled')),
    pid: readInteger(readStateField('pid')),
    status: readString(readStateField('status')),
    startedAt: readNonempty(readStateField('startedAt')),
    finishedAt: readNonempty(readStateField('finishedAt')),
    exitCode: readInteger(readStateField('exitCode')),
    error: readString(readStateField('error')),
  };
  // Proof: corrupting the process timestamp dependency made the mounted successful fence fail before publication.
  if (
    ![state.startedAt, state.finishedAt].every(
      (stamp) =>
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(stamp) &&
        Number.isFinite(Date.parse(stamp)),
    )
  )
    throw new Error('gateway fence process timestamps are malformed');
  if (
    state.paused ||
    state.restarting ||
    state.dead ||
    state.oomKilled ||
    state.error !== '' ||
    !['running', 'exited', 'created'].includes(state.status) ||
    (state.running
      ? state.status !== 'running' || state.pid === 0
      : state.pid !== 0 || state.status === 'running')
  )
    throw new Error('gateway fence unstable process cannot be excluded');
  return state;
}
function parseGateway(value: unknown): Gateway {
  const record = readClosed(value, [
    'id',
    'name',
    'image',
    'imageRef',
    'service',
    'project',
    'network',
    'networkId',
    'restartPolicy',
    'restartCount',
    'state',
  ]);
  return {
    id: readIdentity(record['id']),
    name: readNonempty(record['name']),
    image: readDigest(record['image']),
    imageRef: assertDigestPinnedRef(readString(record['imageRef']), 'gw'),
    service: readNonempty(record['service']),
    project: readNonempty(record['project']),
    network: readNonempty(record['network']),
    networkId: readIdentity(record['networkId']),
    restartPolicy: parsePolicy(record['restartPolicy'], false),
    restartCount: readInteger(record['restartCount']),
    state: parseState(record['state'], false),
  };
}
function parseCohort(value: unknown, layout: EnvLayout): Cohort {
  const record = readClosed(value, ['blue', 'green']);
  const cohort: Cohort = { blue: null, green: null };
  for (const color of COLORS) {
    const gateway = record[color] === null ? null : parseGateway(record[color]);
    if (
      gateway !== null &&
      (gateway.name !== `/${containerName('gw', color, layout)}` ||
        // Proof: omitting service identity admitted the mounted label prerequisite negative.
        gateway.service !== containerName('gw', color, layout) ||
        gateway.network !== layout.network)
    )
      throw new Error('gateway fence cohort does not belong to this environment');
    cohort[color] = gateway;
  }
  if (
    cohort.blue !== null &&
    cohort.green !== null &&
    (cohort.blue.id === cohort.green.id ||
      // Proof: omitting project equality admitted project-mismatch with both managed colours.
      cohort.blue.project !== cohort.green.project ||
      cohort.blue.networkId !== cohort.green.networkId)
  )
    throw new Error('gateway fence cohort identities disagree');
  return cohort;
}

async function inspectCohort(
  layout: EnvLayout,
  runDocker: RunDocker,
  deadline: number,
): Promise<Cohort> {
  const listed = (
    await runDockerBefore(['ps', '-a', '--no-trunc', '--format', '{{.ID}}'], runDocker, deadline)
  ).trim();
  const identities = listed === '' ? [] : listed.split('\n');
  if (identities.some((entry) => !ID.test(entry)) || new Set(identities).size !== identities.length)
    throw new Error('gateway fence Docker inventory identities are malformed or duplicated');
  const cohort: Cohort = { blue: null, green: null };
  if (identities.length === 0) return cohort;
  const inspected: unknown = JSON.parse(
    await runDockerBefore(['inspect', ...identities], runDocker, deadline),
  );
  // Proof: omitting cardinality admitted a missing inspected member past publication; missing-inspect-entry failed.
  if (!Array.isArray(inspected) || inspected.length !== identities.length)
    throw new Error('gateway fence Docker inventory is incomplete');
  const observed = new Set<string>();
  for (const entry of inspected) {
    const container = readFields(entry);
    const id = readIdentity(container['Id']);
    const name = readString(container['Name']);
    // Proof: allowing a foreign full inspect ID violated the mounted foreign-inspect-id pre-publication negative.
    if (
      !identities.includes(id) ||
      observed.has(id) ||
      !/^\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)
    )
      throw new Error('gateway fence Docker inventory identity mismatch');
    observed.add(id);
    const config = readFields(container['Config']);
    const labels = config['Labels'] === null ? {} : readFields(config['Labels']);
    const networks = readFields(readFields(container['NetworkSettings'])['Networks']);
    const color = COLORS.find((candidate) => name === `/${containerName('gw', candidate, layout)}`);
    const service = labels['com.docker.compose.service'];
    const managed =
      color !== undefined ||
      name.startsWith(`/${layout.containerPrefix}gw-01`) ||
      (typeof service === 'string' && service.startsWith(`${layout.containerPrefix}gw-01`)) ||
      (Object.hasOwn(networks, layout.network) &&
        typeof config['Image'] === 'string' &&
        /\/wbs-gw-01(?:@|:)/.test(config['Image']));
    // Proof: ignoring unknown managed names admitted the detached unexpected gateway; even-when-detached failed.
    if (!managed) continue;
    if (color === undefined || cohort[color] !== null)
      throw new Error('gateway fence found unexpected or duplicate managed gateway');
    const host = readFields(container['HostConfig']);
    const caps = host['CapAdd'];
    // Proof: omitting Init admission published/stopped the unprepared container; the mounted init negative failed.
    if (
      host['Init'] !== true ||
      host['PidMode'] !== '' ||
      host['Privileged'] !== false ||
      !(caps === null || (Array.isArray(caps) && caps.length === 0)) ||
      host['NetworkMode'] !== layout.network ||
      Object.keys(networks).length !== 1
    )
      throw new Error(
        'gateway fence requires init, private PID, unprivileged, no added caps and exact network',
      );
    const imageRef = assertDigestPinnedRef(readString(config['Image']), 'gw');
    const installedImage = readDigest(container['Image']);
    const resolvedImage = (
      await runDockerBefore(
        ['image', 'inspect', '--format', '{{.Id}}', imageRef],
        runDocker,
        deadline,
      )
    ).trim();
    // Proof: skipping resolution equality admitted image-id-mismatch through the complete mounted operation.
    if (readDigest(resolvedImage) !== installedImage)
      throw new Error('gateway fence digest image resolution changed');
    cohort[color] = {
      id,
      name,
      image: installedImage,
      imageRef,
      service: readString(service),
      project: readNonempty(labels['com.docker.compose.project']),
      network: layout.network,
      networkId: readIdentity(readFields(networks[layout.network])['NetworkID']),
      restartPolicy: parsePolicy(host['RestartPolicy'], true),
      restartCount: readInteger(container['RestartCount']),
      state: parseState(container['State'], true),
    };
  }
  return parseCohort(cohort, layout);
}

function projectIdentities(cohort: Cohort): unknown {
  return COLORS.map((color) => {
    const gateway = cohort[color];
    if (gateway === null) return null;
    const { state, restartPolicy: _policy, ...identity } = gateway;
    return { ...identity, startedAt: state.startedAt };
  });
}
function assertExcluded(cohort: Cohort): void {
  for (const color of COLORS) {
    const gateway = cohort[color];
    if (
      gateway !== null &&
      (gateway.state.running ||
        gateway.state.pid !== 0 ||
        !['exited', 'created'].includes(gateway.state.status) ||
        gateway.restartPolicy.name !== 'no' ||
        gateway.restartPolicy.maximumRetryCount !== 0)
    )
      throw new Error('managed gateway is not physically excluded');
  }
}
async function readRecord(path: string): Promise<string> {
  const identity = await lstat(path);
  if (!identity.isFile()) throw new Error(`gateway fence ${path} is not a regular file`);
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await file.stat();
    if (!opened.isFile() || opened.dev !== identity.dev || opened.ino !== identity.ino)
      throw new Error('gateway fence record changed while opening');
    return await file.readFile('utf8');
  } finally {
    await file.close();
  }
}
async function assertRoot(layout: EnvLayout): Promise<void> {
  if (
    !(await lstat(layout.stateDir)).isDirectory() ||
    // Proof: omitting canonical-path validation admitted symlink-parent-root with a directory leaf.
    (await realpath(layout.stateDir)) !== layout.stateDir
  )
    throw new Error('gateway fence requires canonical existing state directory');
  const directory = await opendir(layout.stateDir);
  try {
    await directory.read();
  } finally {
    await directory.close();
  }
}
async function publishRecord(path: string, contents: string): Promise<void> {
  // Exclusive/fsynced publication inherits writeNewMigrationCapture's link/directory-sync proofs.
  await writeNewMigrationCapture(path, contents);
  // Proof: injected corrupt persisted readback stopped the successful mounted operation before Docker updates.
  assertSame(contents, await readRecord(path), 'published record readback');
}
function serializeRecord(record: unknown): string {
  return `${JSON.stringify(record)}\n`;
}
function parseIntent(contents: string, layout: EnvLayout): Intent {
  const record = readClosed(JSON.parse(contents), [
    'format',
    'version',
    'attempt',
    'environment',
    'root',
    'network',
    'sha',
    'cohort',
  ]);
  if (
    record['format'] !== 'dependency-gateway-intent' ||
    // Proof: omitting intent version validation admitted wrong-intent-version even with a recomputed binding hash.
    record['version'] !== 1 ||
    record['environment'] !== layout.env ||
    record['root'] !== layout.root ||
    record['network'] !== layout.network ||
    !SHA.test(readString(record['sha'])) ||
    // Proof: the mounted wrong-intent-attempt negative admitted a non-UUID with matching completion/hash before this grammar.
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      readString(record['attempt']),
    )
  )
    throw new Error('gateway fence intent provenance is malformed or foreign');
  return {
    format: 'dependency-gateway-intent',
    version: 1,
    attempt: readString(record['attempt']),
    environment: layout.env,
    root: layout.root,
    network: layout.network,
    sha: readString(record['sha']),
    cohort: parseCohort(record['cohort'], layout),
  };
}
async function readRetainedRecord(path: string): Promise<string | null> {
  try {
    return await readRecord(path);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return null;
    throw cause;
  }
}
async function readCompletion(
  layout: EnvLayout,
): Promise<{ intent: Intent; completion: GatewayCompletion }> {
  const marker = await readRetainedRecord(`${layout.stateDir}/dependency-gateway-fence.json`);
  const contents = await readRetainedRecord(`${layout.stateDir}/${INTENT}`);
  const completed = await readRetainedRecord(`${layout.stateDir}/${COMPLETE}`);
  if (marker === null && contents === null && completed === null)
    throw new Error('gateway fence absent; no physical exclusion proof');
  if (completed !== null && (marker === null || contents === null))
    throw new Error(
      'gateway fence corrupt orphan completion; retain evidence; attended recovery required',
    );
  if (marker === null)
    throw new Error(
      'gateway fence corrupt orphan intent; retain evidence; attended recovery required',
    );
  assertSame(MARKER, marker, 'marker');
  if (contents === null)
    throw new Error(
      'gateway fence interrupted before durable intent; retain marker; attended recovery required',
    );
  const intent = parseIntent(contents, layout);
  if (completed === null)
    throw new Error(
      'gateway fence uncertain without completion; retain current Docker state; attended recovery required',
    );
  const record = readClosed(JSON.parse(completed), [
    'format',
    'version',
    'attempt',
    'intentSha256',
    'cohort',
  ]);
  if (
    record['format'] !== 'dependency-gateway-complete' ||
    record['version'] !== 1 ||
    record['attempt'] !== intent.attempt ||
    // Proof: omitting byte-hash binding accepted changed-intent whitespace during mounted inspection.
    record['intentSha256'] !== digestIntent(contents)
  )
    throw new Error('gateway fence completion is not bound to persisted intent');
  const completion: GatewayCompletion = {
    format: 'dependency-gateway-complete',
    version: 1,
    attempt: intent.attempt,
    intentSha256: digestIntent(contents),
    cohort: parseCohort(record['cohort'], layout),
  };
  assertSame(
    projectIdentities(intent.cohort),
    projectIdentities(completion.cohort),
    'completed identity',
  );
  assertExcluded(completion.cohort);
  return { intent, completion };
}

/**
 * Publish retained intent, disable restart and stop only the exact managed Compose blue/green IDs.
 * Owns deploy.lock; no caller can bypass ordinary admission. All Docker observations/effects share
 * one bounded budget. Any failure after publication retains evidence and current Docker state;
 * no cleanup, restart, activation, exposure or broad participant claim is authorized.
 * Existing gateways without init/private PID/strict image/labels need attended preparation.
 * See docs/runbook-prod-deploy.md#managed-compose-gateway-exclusion.
 */
export async function fenceGateways(
  layout: EnvLayout,
  sha: string,
  runDocker: RunDocker,
  totalMs = 60000,
): Promise<GatewayCompletion> {
  if (!SHA.test(sha) || !Number.isFinite(totalMs) || totalMs <= 0)
    throw new Error('gateway fence requires full git SHA and finite positive deadline');
  // Proof: bypassing lock acquisition let the mounted concurrent-operation negative execute under a held real flock.
  return await withLock(`${layout.stateDir}/deploy.lock`, async () => {
    const deadline = performance.now() + totalMs;
    await assertRoot(layout);
    await assertNoGatewayFence(layout.stateDir);
    const cohort = await inspectCohort(layout, runDocker, deadline);
    try {
      await publishRecord(`${layout.stateDir}/dependency-gateway-fence.json`, MARKER);
      const intent: Intent = {
        format: 'dependency-gateway-intent',
        version: 1,
        attempt: randomUUID(),
        environment: layout.env,
        root: layout.root,
        network: layout.network,
        sha,
        cohort,
      };
      const contents = serializeRecord(intent);
      await publishRecord(`${layout.stateDir}/${INTENT}`, contents);
      assertSame(cohort, await inspectCohort(layout, runDocker, deadline), 'pre-effect cohort');
      for (const color of COLORS) {
        const gateway = cohort[color];
        if (gateway === null) continue;
        // Proof: suppressing update made the mounted successful fence fail its policy readback; stalled update retains intent at its shared deadline.
        await runDockerBefore(['update', '--restart=no', gateway.id], runDocker, deadline);
        const observed = await inspectCohort(layout, runDocker, deadline);
        const expected: Cohort = structuredClone(cohort);
        const updated = expected[color];
        if (updated === null) throw new Error('gateway fence lost known cohort member');
        updated.restartPolicy = { name: 'no', maximumRetryCount: 0 };
        assertSame(expected, observed, 'restart update readback');
        cohort[color] = observed[color];
      }
      for (const color of COLORS) {
        const gateway = cohort[color];
        if (gateway === null) continue;
        // Proof: suppressing exact-ID stop made the mounted successful fence refuse running/PID state.
        await runDockerBefore(['stop', '--time', '10', gateway.id], runDocker, deadline);
        const observed = await inspectCohort(layout, runDocker, deadline);
        assertSame(
          projectIdentities(cohort),
          projectIdentities(observed),
          'stop identity readback',
        );
        const stopped = observed[color];
        if (stopped === null) throw new Error('gateway fence lost stopped member');
        assertExcluded({ blue: stopped, green: null });
        for (const other of COLORS)
          if (other !== color) assertSame(cohort[other], observed[other], 'unaffected member');
        cohort[color] = stopped;
      }
      const stopped = await inspectCohort(layout, runDocker, deadline);
      assertSame(cohort, stopped, 'fresh stopped cohort');
      assertExcluded(stopped);
      const completion: GatewayCompletion = {
        format: 'dependency-gateway-complete',
        version: 1,
        attempt: intent.attempt,
        intentSha256: digestIntent(contents),
        cohort: stopped,
      };
      await publishRecord(`${layout.stateDir}/${COMPLETE}`, serializeRecord(completion));
      const retained = await readCompletion(layout);
      assertSame(completion, retained.completion, 'completion readback');
      // Proof: reusing stopped observations admitted completion-drift; the mounted final-current-state negative failed.
      const final = await inspectCohort(layout, runDocker, deadline);
      assertSame(stopped, final, 'final current cohort');
      assertExcluded(final);
      return completion;
    } catch (cause) {
      throw new Error(
        `gateway fence failed after publication; retain all dependency-gateway records and current Docker state; explicit attended recovery required; no restart or automatic cleanup: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    }
  });
}

/** Read-only lock-owned proof; historical completion alone never establishes present exclusion. */
export async function inspectGatewayFence(
  layout: EnvLayout,
  runDocker: RunDocker,
): Promise<GatewayCompletion> {
  // Proof: bypassing lock acquisition let the mounted concurrent-operation negative execute under a held real flock.
  return await withLock(`${layout.stateDir}/deploy.lock`, async () => {
    await assertRoot(layout);
    const { completion } = await readCompletion(layout);
    // Proof: trusting historical completion let the mounted inspection accept a resumed gateway.
    const observed = await inspectCohort(layout, runDocker, performance.now() + 60000);
    assertSame(completion.cohort, observed, 'current completed cohort');
    assertExcluded(observed);
    return completion;
  });
}
