import { parseDockerInspection } from './docker-inspection-json';
import {
  readBoolean,
  readClosed,
  readDigest,
  readFields,
  readIdentity,
  readInteger,
  readString,
} from './managed-cohort';
import { exactManagedContainerArgs } from './solver-supervisor-command';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZERO = '0001-01-01T00:00:00Z';
const LABEL_FIELDS = [
  'wbs-managed-solver',
  'wbs-attempt-token',
  'wbs-caller-id',
  'wbs-project-id',
  'wbs-objective',
];
const STATE_FIELDS = [
  'Running',
  'Restarting',
  'Paused',
  'Dead',
  'Status',
  'Pid',
  'ExitCode',
  'OOMKilled',
  'Error',
  'StartedAt',
  'FinishedAt',
];
const LABEL_FORMAT = LABEL_FIELDS.map(
  (key) => `"${key}":{{json (index .Config.Labels "${key}")}}`,
).join(',');
const STATE_FORMAT = STATE_FIELDS.map((key) => `"${key}":{{json .State.${key}}}`).join(',');
const FORMAT = `{"id":{{json .Id}},"name":{{json .Name}},"labels":{${LABEL_FORMAT}},"image":{{json .Image}},"imageRef":{{json .Config.Image}},"restart":{{json .HostConfig.RestartPolicy}},"restartCount":{{json .RestartCount}},"state":{${STATE_FORMAT}}}`;

export interface SolverContainer {
  readonly id: string;
  readonly name: string;
  readonly labels: Record<string, unknown>;
  readonly image: string;
  readonly imageRef: string;
  readonly phase: 'running' | 'terminal' | 'inert';
  readonly exitCode: number;
  readonly state: Record<string, unknown>;
}

/** Minimal projected inspection; never retains container environment or arbitrary host config. */
export function solverInspectArgs(id: string): string[] {
  const command = exactManagedContainerArgs('inspect', id);
  return [command[0], command[1], '--format', FORMAT, id];
}

/** Validates identity, restart authority and coherent native lifecycle before any kill or acceptance. */
export function parseSolverContainer(stdout: string, expectedId: string): SolverContainer {
  const record = readClosed(parseDockerInspection(stdout), [
    'id',
    'name',
    'labels',
    'image',
    'imageRef',
    'restart',
    'restartCount',
    'state',
  ]);
  const id = readIdentity(record['id']);
  const name = readString(record['name']);
  const labels = readClosed(record['labels'], LABEL_FIELDS);
  const token = readString(labels['wbs-attempt-token']);
  const caller = readString(labels['wbs-caller-id']);
  if (
    id !== expectedId ||
    !UUID.test(token) ||
    name !== `/wbs-solver-${token}` ||
    labels['wbs-managed-solver'] !== 'true' ||
    !/^(?:[a-f0-9]{12}|[a-f0-9]{64})$/.test(caller) ||
    !UUID.test(readString(labels['wbs-project-id'])) ||
    !['pri', 'time'].includes(readString(labels['wbs-objective']))
  )
    throw new Error('solver cohort identity is unknown or changed');
  const image = readDigest(record['image']);
  const imageRef = readString(record['imageRef']);
  if (!/^[^\s@]+@sha256:[a-f0-9]{64}$/.test(imageRef))
    throw new Error('solver image is not pinned');
  const restart = readClosed(record['restart'], ['Name', 'MaximumRetryCount']);
  if (
    restart['Name'] !== 'no' ||
    readInteger(restart['MaximumRetryCount']) !== 0 ||
    readInteger(record['restartCount']) !== 0
  )
    throw new Error('solver restart authority is unknown');
  const state = readClosed(record['state'], STATE_FIELDS);
  const running = readBoolean(state['Running']);
  const status = readString(state['Status']);
  const pid = readInteger(state['Pid']);
  const exitCode = readInteger(state['ExitCode']);
  readBoolean(state['OOMKilled']);
  if (
    readBoolean(state['Restarting']) ||
    readBoolean(state['Paused']) ||
    readBoolean(state['Dead']) ||
    readString(state['Error']) !== ''
  )
    throw new Error('solver state is uncertain');
  const started = readString(state['StartedAt']);
  const finished = readString(state['FinishedAt']);
  let phase: SolverContainer['phase'];
  if (
    running &&
    status === 'running' &&
    pid > 0 &&
    Number.isFinite(Date.parse(started)) &&
    started !== ZERO &&
    finished === ZERO
  )
    phase = 'running';
  else if (
    !running &&
    status === 'exited' &&
    pid === 0 &&
    started !== ZERO &&
    Number.isFinite(Date.parse(started)) &&
    finished !== ZERO &&
    Number.isFinite(Date.parse(finished))
  )
    phase = 'terminal';
  else if (
    !running &&
    status === 'created' &&
    pid === 0 &&
    exitCode === 0 &&
    started === ZERO &&
    finished === ZERO
  )
    phase = 'inert';
  else throw new Error('solver state is not running, terminal or never-started inert');
  return { id, name, labels, image, imageRef, phase, exitCode, state };
}

/** Lifecycle may change during drain; immutable identity must remain byte-for-byte equal. */
export function solverIdentity(container: SolverContainer): string {
  return JSON.stringify({
    id: container.id,
    name: container.name,
    labels: container.labels,
    image: container.image,
    imageRef: container.imageRef,
  });
}

/** Full stopped-container binding used only by the live owner namespace-audit capability. */
export interface SolverSnapshot {
  solver: SolverContainer;
  config: Record<string, unknown>;
  host: Record<string, unknown>;
  mounts: readonly unknown[];
  path: string;
  args: readonly string[];
  networks: Record<string, unknown>;
}

/** Reuse the strict solver lifecycle grammar while binding complete namespace/configuration identity. */
export function parseSolverSnapshot(raw: unknown, expectedId: string): SolverSnapshot {
  const container = readFields(raw);
  const config = readFields(container['Config']);
  const host = readFields(container['HostConfig']);
  const labels = readFields(config['Labels']);
  const projectedLabels = Object.fromEntries(LABEL_FIELDS.map((name) => [name, labels[name]]));
  const state = readFields(container['State']);
  const projectedState = Object.fromEntries(STATE_FIELDS.map((name) => [name, state[name]]));
  const solver = parseSolverContainer(
    JSON.stringify({
      id: container['Id'],
      name: container['Name'],
      labels: projectedLabels,
      image: container['Image'],
      imageRef: config['Image'],
      restart: host['RestartPolicy'],
      restartCount: container['RestartCount'],
      state: projectedState,
    }),
    expectedId,
  );
  if (solver.phase === 'running')
    throw new Error('solver full snapshot requires terminal or inert member');
  const caps = host['CapAdd'];
  // Proof: private-PID omission admitted shared native full inspection; solver full capture shared PID test failed.
  if (
    host['PidMode'] !== '' ||
    host['Privileged'] !== false ||
    !(caps === null || (Array.isArray(caps) && caps.length === 0))
  )
    throw new Error('solver full snapshot requires private PID and no elevated authority');
  const mounts: unknown = container['Mounts'];
  if (!Array.isArray(mounts)) throw new Error('solver full snapshot mounts missing');
  for (const rawMount of mounts) {
    const mount = readFields(rawMount);
    if (
      !['bind', 'volume', 'tmpfs'].includes(readString(mount['Type'])) ||
      !readString(mount['Destination']).startsWith('/')
    )
      throw new Error('solver full snapshot mount unsupported');
    readString(mount['Source']);
    readBoolean(mount['RW']);
  }
  const args: unknown = container['Args'];
  if (!Array.isArray(args) || args.some((argument: unknown) => typeof argument !== 'string'))
    throw new Error('solver full snapshot argv malformed');
  return {
    solver,
    config,
    host,
    mounts: mounts.map((mount: unknown) => mount),
    path: readString(container['Path']),
    args: args.map((argument: unknown) => readString(argument)),
    networks: readFields(readFields(container['NetworkSettings'])['Networks']),
  };
}
