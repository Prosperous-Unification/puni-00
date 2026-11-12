import {
  SUPERVISOR_PROTOCOL_VERSION,
  type SupervisorStartFrame,
} from '@wbs/contracts/solver/supervisor-protocol';
import { describe, expect, it } from 'bun:test';

import {
  buildManagedContainerArgs,
  buildPersistentDeadlineTimerCommands,
  exactManagedContainerArgs,
  inspectBackendContainerArgs,
  listManagedContainersArgs,
} from './solver-supervisor-command';
const CALLER_ID = 'a'.repeat(64);
const CONTAINER_ID = 'b'.repeat(64);
const ATTEMPT_TOKEN = '018f3f08-2ef7-7d1c-b645-14f877575d66';
const IMAGE = `registry.example/wbs-be-01@sha256:${'c'.repeat(64)}`;

const START: SupervisorStartFrame = {
  type: 'start',
  protocolVersion: SUPERVISOR_PROTOCOL_VERSION,
  callerId: CALLER_ID,
  projectId: '018f3f08-2ef7-7d1c-b645-14f877575d65',
  objective: 'pri',
  attemptToken: ATTEMPT_TOKEN,
  childDeadlineAt: 20_000,
  searchWorkers: 2,
  memoryLimitMb: 512,
  request: { wireVersion: 1, objective: 'pri' },
};

describe('the host-owned solver command builder', () => {
  it('builds one fixed, hardened, digest-pinned container command', () => {
    // Production break caught: deleting or reordering any hardening flag, or
    // taking an image/entrypoint option from the caller, changes this literal.
    // It is also the argv outside a Dash job: no `--cpus`, no `puni.job` label.
    // Proof: with hostJobAttributionFlags' outside-a-job branch removed (flags always built),
    // this literal failed on an inserted `--cpus 1 --label puni.job=…` (2026-11-12).
    expect(buildManagedContainerArgs(START, { image: IMAGE, pidsLimit: 128 }, {})).toEqual([
      'docker',
      'create',
      '--name',
      `wbs-solver-${ATTEMPT_TOKEN}`,
      '--label',
      'wbs-managed-solver=true',
      '--label',
      `wbs-attempt-token=${ATTEMPT_TOKEN}`,
      '--label',
      `wbs-caller-id=${CALLER_ID}`,
      '--label',
      `wbs-project-id=${START.projectId}`,
      '--label',
      'wbs-objective=pri',
      '--network',
      'none',
      '--read-only',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=64m',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--init',
      '--restart',
      'no',
      '--memory',
      '512m',
      '--memory-swap',
      '512m',
      '--pids-limit',
      '128',
      '--interactive',
      '--pull',
      'never',
      '--log-driver',
      'none',
      '--entrypoint',
      'wbs-solver-launcher',
      IMAGE,
      '--attempt-token',
      ATTEMPT_TOKEN,
      '--child-deadline-epoch-ms',
      '20000',
      '--search-workers',
      '2',
      '--memory-limit-mb',
      '512',
    ]);
  });

  // Proof: with the spread of hostJobAttributionFlags removed from buildManagedContainerArgs,
  // this test failed on a create argv without `--cpus` and the label (2026-11-12).
  it('bounds and labels the managed container inside a Dash job, keeping its own memory', () => {
    const argv = buildManagedContainerArgs(
      START,
      { image: IMAGE, pidsLimit: 128 },
      { DASH_JOB_ID: 'abc' },
    );
    const limits = argv.indexOf('--pids-limit');
    expect(argv.slice(limits, limits + 6)).toEqual([
      '--pids-limit',
      '128',
      '--cpus',
      '1',
      '--label',
      'puni.job=abc',
    ]);
    expect(argv.filter((flag) => flag === '--memory')).toHaveLength(1);
    expect(argv[argv.indexOf('--memory') + 1]).toBe('512m');
    expect(() =>
      buildManagedContainerArgs(
        { ...START, memoryLimitMb: 2048 },
        { image: IMAGE, pidsLimit: 128 },
        { DASH_JOB_ID: 'abc' },
      ),
    ).toThrow(/exceeds the 1 GiB containers bound/);
  });

  it('refuses movable images and invalid host PID limits', () => {
    expect(() =>
      buildManagedContainerArgs(START, { image: 'wbs-be-01:latest', pidsLimit: 128 }, {}),
    ).toThrow(/digest-pinned/);
    expect(() => buildManagedContainerArgs(START, { image: IMAGE, pidsLimit: 0 }, {})).toThrow(
      /pidsLimit/,
    );
  });

  it('builds the persistent deadline timer against one exact container id', () => {
    expect(buildPersistentDeadlineTimerCommands(START, CONTAINER_ID)).toEqual({
      arm: [
        'systemd-run',
        '--user',
        `--unit=wbs-solver-deadline-${ATTEMPT_TOKEN}`,
        '--on-calendar=1970-01-01 00:00:20.000 UTC',
        '--timer-property=AccuracySec=1ms',
        '--remain-after-exit',
        '/usr/bin/docker',
        'kill',
        CONTAINER_ID,
      ],
      inspect: [
        'systemctl',
        '--user',
        'show',
        `wbs-solver-deadline-${ATTEMPT_TOKEN}.service`,
        '--property=ActiveState',
        '--property=Result',
      ],
      cancel: [
        'systemctl',
        '--user',
        'stop',
        `wbs-solver-deadline-${ATTEMPT_TOKEN}.timer`,
        `wbs-solver-deadline-${ATTEMPT_TOKEN}.service`,
      ],
    });
  });

  it('lists by the managed label before allowing exact-id lifecycle commands', () => {
    expect(listManagedContainersArgs()).toEqual([
      'docker',
      'ps',
      '--all',
      '--no-trunc',
      '--filter',
      'label=wbs-managed-solver=true',
      '--format',
      '{{.ID}}',
    ]);
    expect(exactManagedContainerArgs('inspect', CONTAINER_ID)).toEqual([
      'docker',
      'inspect',
      CONTAINER_ID,
    ]);
    expect(() => exactManagedContainerArgs('rm', 'all')).toThrow(/container id/);
  });

  it('inspects only the peer-derived full backend id with a fixed narrow projection', () => {
    expect(inspectBackendContainerArgs(CALLER_ID)).toEqual([
      'docker',
      'inspect',
      '--format',
      '{"id":{{json .Id}},"name":{{json .Name}},"running":{{json .State.Running}},"image":{{json .Config.Image}}}',
      CALLER_ID,
    ]);
    expect(() => inspectBackendContainerArgs('wbs-dev-src')).toThrow(/container id/);
  });
});
