import { constants } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';

import { assertDigestPinnedRef, containerName } from './docker';
import { type RunDocker, runDockerBefore } from './docker-deadline';
import type { EnvLayout } from './env';
import { writeNewMigrationCapture } from './migration-capture-file';

const COLORS = ['blue', 'green'] as const;
const ID = /^[a-f0-9]{64}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

type Fields = Record<string, unknown>;
interface RestartPolicy {
  name: string;
  maximumRetryCount: number;
}
export interface ManagedState {
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
export interface ManagedContainer {
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
  state: ManagedState;
}
export interface ManagedCohort {
  blue: ManagedContainer | null;
  green: ManagedContainer | null;
}
export function readFields(value: unknown): Fields {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('managed cohort inspection contains a malformed object');
  // The object boundary above excludes null and arrays; property access remains unknown.
  return value as Fields;
}
// Proof: ignoring closed fields admitted extra-completion-field through real retained-record inspection.
export function readClosed(value: unknown, keys: string[]): Fields {
  const record = readFields(value);
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key)))
    throw new Error('managed cohort record has unknown or missing fields');
  return record;
}
export function readString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('managed cohort expected a string');
  return value;
}
// Proof: removing integer validation admitted negative RestartCount in the mounted pre-publication negative.
export function readInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('managed cohort expected a nonnegative integer');
  return value;
}
// Proof: removing boolean validation admitted string Running in the boolean-type mounted negative.
export function readBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('managed cohort expected a boolean');
  return value;
}
// Proof: accepting a missing network ID let the mounted network prerequisite negative publish and stop.
export function readIdentity(value: unknown): string {
  const text = readString(value);
  if (!ID.test(text)) throw new Error('managed cohort requires full container/network identity');
  return text;
}
// Proof: accepting equal malformed inspect/resolution IDs admitted invalid-image-identity before publication.
export function readDigest(value: unknown): string {
  const text = readString(value);
  if (!DIGEST.test(text)) throw new Error('managed cohort requires full image identity');
  return text;
}
// Proof: removing nonempty validation admitted an empty Compose project in the mounted boundary negative.
export function readNonempty(value: unknown): string {
  const text = readString(value);
  if (text.trim() === '') throw new Error('managed cohort requires nonempty identity');
  return text;
}
// Proof: omitting comparisons let lying-update reach stop; the mounted negative observes the forbidden stop.
export function assertSame(expected: unknown, observed: unknown, description: string): void {
  if (JSON.stringify(expected) !== JSON.stringify(observed))
    throw new Error(`managed cohort ${description} changed or was not excluded`);
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
    throw new Error('managed cohort restart policy is malformed');
  return { name, maximumRetryCount };
}
function parseState(value: unknown, docker: boolean): ManagedState {
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
  const readStateField = (key: keyof ManagedState): unknown => record[docker ? names[key] : key];
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
    throw new Error('managed cohort process timestamps are malformed');
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
    throw new Error('managed cohort unstable process cannot be excluded');
  return state;
}
function parseManagedContainer(value: unknown, tier: 'gw' | 'be'): ManagedContainer {
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
    imageRef: assertDigestPinnedRef(readString(record['imageRef']), tier),
    service: readNonempty(record['service']),
    project: readNonempty(record['project']),
    network: readNonempty(record['network']),
    networkId: readIdentity(record['networkId']),
    restartPolicy: parsePolicy(record['restartPolicy'], false),
    restartCount: readInteger(record['restartCount']),
    state: parseState(record['state'], false),
  };
}
export function parseManagedCohort(
  value: unknown,
  layout: EnvLayout,
  tier: 'gw' | 'be' = 'gw',
): ManagedCohort {
  const record = readClosed(value, ['blue', 'green']);
  const cohort: ManagedCohort = { blue: null, green: null };
  for (const color of COLORS) {
    const member = record[color] === null ? null : parseManagedContainer(record[color], tier);
    if (
      member !== null &&
      (member.name !== `/${containerName(tier, color, layout)}` ||
        // Proof: omitting service identity admitted the mounted label prerequisite negative.
        member.service !== containerName(tier, color, layout) ||
        member.network !== layout.network)
    )
      throw new Error('managed cohort cohort does not belong to this environment');
    cohort[color] = member;
  }
  if (
    cohort.blue !== null &&
    cohort.green !== null &&
    (cohort.blue.id === cohort.green.id ||
      // Proof: omitting project equality admitted project-mismatch with both managed colours.
      cohort.blue.project !== cohort.green.project ||
      cohort.blue.networkId !== cohort.green.networkId)
  )
    throw new Error('managed cohort cohort identities disagree');
  return cohort;
}

export async function inspectManagedCohort(
  layout: EnvLayout,
  runDocker: RunDocker,
  deadline: number,
  tier: 'gw' | 'be' = 'gw',
  inspectInventory?: (containers: readonly unknown[], cohort: ManagedCohort) => Promise<void>,
): Promise<ManagedCohort> {
  const listed = (
    await runDockerBefore(['ps', '-a', '--no-trunc', '--format', '{{.ID}}'], runDocker, deadline)
  ).trim();
  const identities = listed === '' ? [] : listed.split('\n');
  if (identities.some((entry) => !ID.test(entry)) || new Set(identities).size !== identities.length)
    throw new Error('managed cohort Docker inventory identities are malformed or duplicated');
  const cohort: ManagedCohort = { blue: null, green: null };
  if (identities.length === 0) {
    await inspectInventory?.([], cohort);
    return cohort;
  }
  const inspected: unknown = JSON.parse(
    await runDockerBefore(['inspect', ...identities], runDocker, deadline),
  );
  // Proof: omitting cardinality admitted a missing inspected member past publication; missing-inspect-entry failed.
  if (!Array.isArray(inspected) || inspected.length !== identities.length)
    throw new Error('managed cohort Docker inventory is incomplete');
  return await inspectManagedInventory(
    layout,
    runDocker,
    deadline,
    identities,
    inspected,
    tier,
    inspectInventory,
  );
}

/** Validate a complete previously listed/inspected inventory; permits joint cohort verification. */
export async function inspectManagedInventory(
  layout: EnvLayout,
  runDocker: RunDocker,
  deadline: number,
  identities: readonly string[],
  inspected: readonly unknown[],
  tier: 'gw' | 'be',
  inspectInventory?: (containers: readonly unknown[], cohort: ManagedCohort) => Promise<void>,
): Promise<ManagedCohort> {
  const cohort: ManagedCohort = { blue: null, green: null };
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
      throw new Error('managed cohort Docker inventory identity mismatch');
    observed.add(id);
    const config = readFields(container['Config']);
    const labels = config['Labels'] === null ? {} : readFields(config['Labels']);
    const networks = readFields(readFields(container['NetworkSettings'])['Networks']);
    const color = COLORS.find((candidate) => name === `/${containerName(tier, candidate, layout)}`);
    const service = labels['com.docker.compose.service'];
    const managed =
      color !== undefined ||
      name.startsWith(`/${layout.containerPrefix}${tier}-01`) ||
      (typeof service === 'string' && service.startsWith(`${layout.containerPrefix}${tier}-01`)) ||
      (Object.hasOwn(networks, layout.network) &&
        typeof config['Image'] === 'string' &&
        new RegExp(`/wbs-${tier}-01(?:@|:)`).test(config['Image']));
    // Proof: ignoring unknown managed names admitted the detached unexpected member; even-when-detached failed.
    if (!managed) continue;
    if (color === undefined || cohort[color] !== null)
      throw new Error('managed cohort found unexpected or duplicate managed member');
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
        'managed cohort requires init, private PID, unprivileged, no added caps and exact network',
      );
    const imageRef = assertDigestPinnedRef(readString(config['Image']), tier);
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
      throw new Error('managed cohort digest image resolution changed');
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
  const checked = parseManagedCohort(cohort, layout, tier);
  await inspectInventory?.(inspected, checked);
  return checked;
}

export function projectIdentities(cohort: ManagedCohort): unknown {
  return COLORS.map((color) => {
    const member = cohort[color];
    if (member === null) return null;
    const { state, restartPolicy: _policy, ...identity } = member;
    return { ...identity, startedAt: state.startedAt };
  });
}
export function assertExcluded(cohort: ManagedCohort): void {
  for (const color of COLORS) {
    const member = cohort[color];
    if (
      member !== null &&
      (member.state.running ||
        member.state.pid !== 0 ||
        !['exited', 'created'].includes(member.state.status) ||
        member.restartPolicy.name !== 'no' ||
        member.restartPolicy.maximumRetryCount !== 0)
    )
      throw new Error('managed member is not physically excluded');
  }
}
export async function readRecord(path: string): Promise<string> {
  const identity = await lstat(path);
  if (!identity.isFile()) throw new Error(`managed cohort ${path} is not a regular file`);
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await file.stat();
    if (!opened.isFile() || opened.dev !== identity.dev || opened.ino !== identity.ino)
      throw new Error('managed cohort record changed while opening');
    return await file.readFile('utf8');
  } finally {
    await file.close();
  }
}
export async function assertRoot(layout: EnvLayout): Promise<void> {
  if (
    !(await lstat(layout.stateDir)).isDirectory() ||
    // Proof: omitting canonical-path validation admitted symlink-parent-root with a directory leaf.
    (await realpath(layout.stateDir)) !== layout.stateDir
  )
    throw new Error('managed cohort requires canonical existing state directory');
  const directory = await opendir(layout.stateDir);
  try {
    await directory.read();
  } finally {
    await directory.close();
  }
}
export async function publishRecord(path: string, contents: string): Promise<void> {
  // Exclusive/fsynced publication inherits writeNewMigrationCapture's link/directory-sync proofs.
  await writeNewMigrationCapture(path, contents);
  // Proof: injected corrupt persisted readback stopped the successful mounted operation before Docker updates.
  assertSame(contents, await readRecord(path), 'published record readback');
}
