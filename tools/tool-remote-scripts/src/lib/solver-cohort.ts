import {
  readBoolean,
  readClosed,
  readDigest,
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
  const record = readClosed(JSON.parse(stdout), [
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
