import { expect, test } from 'bun:test';

import { parseSolverContainer, parseSolverSnapshot, solverInspectArgs } from './solver-cohort';

const ID = 'a'.repeat(64);
const TOKEN = '018f3f08-2ef7-7d1c-b645-14f877575d66';
function observation() {
  return {
    id: ID,
    name: `/wbs-solver-${TOKEN}`,
    labels: {
      'wbs-managed-solver': 'true',
      'wbs-attempt-token': TOKEN,
      'wbs-caller-id': 'b'.repeat(64),
      'wbs-project-id': TOKEN,
      'wbs-objective': 'pri',
    },
    image: `sha256:${'c'.repeat(64)}`,
    imageRef: `registry/solver@sha256:${'c'.repeat(64)}`,
    restart: { Name: 'no', MaximumRetryCount: 0 },
    restartCount: 0,
    state: {
      Running: true,
      Restarting: false,
      Paused: false,
      Dead: false,
      Status: 'running',
      Pid: 123,
      ExitCode: 0,
      OOMKilled: false,
      Error: '',
      StartedAt: '2026-01-01T00:00:00Z',
      FinishedAt: '0001-01-01T00:00:00Z',
    },
  };
}
test('projects complete solver identity and distinguishes running terminal and inert', () => {
  expect(solverInspectArgs(ID).at(-1)).toBe(ID);
  expect(parseSolverContainer(JSON.stringify(observation()), ID).phase).toBe('running');
  const terminal = observation();
  Object.assign(terminal.state, {
    Running: false,
    Status: 'exited',
    Pid: 0,
    ExitCode: 137,
    FinishedAt: '2026-01-01T00:01:00Z',
  });
  expect(parseSolverContainer(JSON.stringify(terminal), ID).phase).toBe('terminal');
  Object.assign(terminal.state, {
    Status: 'created',
    StartedAt: '0001-01-01T00:00:00Z',
    FinishedAt: '0001-01-01T00:00:00Z',
    ExitCode: 0,
  });
  expect(parseSolverContainer(JSON.stringify(terminal), ID).phase).toBe('inert');
});
test('refuses unknown renamed relabeled restarting paused and ambiguous members', () => {
  const variants = [
    { id: 'd'.repeat(64) },
    { name: '/unknown' },
    { labels: {} },
    { restartCount: 1 },
    { restart: { Name: 'always', MaximumRetryCount: 0 } },
    { state: { ...observation().state, Paused: true } },
    { state: { ...observation().state, Running: false } },
  ];
  for (const variant of variants)
    expect(() =>
      parseSolverContainer(JSON.stringify({ ...observation(), ...variant }), ID),
    ).toThrow();
});

function nativeObservation() {
  const observed = observation();
  return {
    Id: observed.id,
    Name: observed.name,
    Image: observed.image,
    Path: 'bun',
    Args: ['worker'],
    Config: { Image: observed.imageRef, Labels: observed.labels, Env: [] },
    HostConfig: { RestartPolicy: observed.restart, PidMode: '', Privileged: false, CapAdd: null },
    RestartCount: observed.restartCount,
    State: {
      ...observed.state,
      Running: false,
      Status: 'exited',
      Pid: 0,
      FinishedAt: '2026-01-01T00:01:00Z',
    },
    Mounts: [
      {
        Type: 'volume',
        Source: '/scratch/cache',
        Destination: '/cache',
        RW: false,
        Mode: 'ro',
        Propagation: 'rprivate',
      },
      {
        Type: 'tmpfs',
        Source: '',
        Destination: '/attempts',
        RW: true,
        Mode: 'rw',
        Propagation: 'rprivate',
      },
    ],
    NetworkSettings: { Networks: {} },
  };
}
test('native multi-mount solver identity accepts permutations without changing raw snapshots or fields', () => {
  const native = nativeObservation();
  const before = structuredClone(native);
  const snapshot = parseSolverSnapshot(native, ID);
  expect(native).toEqual(before);
  expect(snapshot.mounts).not.toBe(native.Mounts);
  expect(snapshot.mounts).toContain(native.Mounts[0]);
  native.Mounts.reverse();
  expect(parseSolverSnapshot(native, ID)).toEqual(snapshot);
});
for (const fault of ['field', 'missing', 'additional', 'duplicate', 'identity'])
  test(`native multi-mount solver retains ${fault} binding`, () => {
    const native = nativeObservation();
    const baseline = parseSolverSnapshot(structuredClone(native), ID);
    if (fault === 'field') native.Mounts[0].Propagation = 'rshared';
    if (fault === 'missing') native.Mounts.pop();
    if (fault === 'additional') native.Mounts.push({ ...native.Mounts[0], Destination: '/extra' });
    if (fault === 'duplicate') native.Mounts.push(structuredClone(native.Mounts[0]));
    if (fault === 'identity') native.Id = 'f'.repeat(64);
    if (fault === 'duplicate' || fault === 'identity')
      expect(() => parseSolverSnapshot(native, ID)).toThrow();
    else expect(parseSolverSnapshot(native, ID)).not.toEqual(baseline);
  });
