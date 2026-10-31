import { rejects } from 'node:assert/strict';

import { describe, expect, it } from 'bun:test';

import {
  buildSolverSupervisorInstallPlan,
  installSolverSupervisor,
  parseSolverSupervisorInstallArgs,
  prepareSolverReaderInstallation,
  type SolverSupervisorInstallerDependencies,
} from './install-solver-supervisor';
import {
  SOLVER_SUPERVISOR_BUN_SOURCE,
  SOLVER_SUPERVISOR_BUN_VERSIONS,
} from './lib/solver-supervisor-install-contract';

const IMAGE = `registry.example/wbs-be@sha256:${'a'.repeat(64)}`;
const SOCKET = '/run/user/1000/wbs-solver/supervisor.sock';
const MEASURED_BUN_VERSIONS = ['1.4.2', '1.4.4'] as const;
const CONFIG = JSON.stringify({
  socketPath: SOCKET,
  maxSearchWorkers: 2,
  maxMemoryLimitMb: 512,
  pidsLimit: 128,
  maxManagedContainers: 16,
  devSourceSha: 'd'.repeat(40),
  images: [{ callerName: 'be-01-blue', callerImage: IMAGE, solverImage: IMAGE }],
});

describe('parseSolverSupervisorInstallArgs', () => {
  it('accepts explicit local inheritance and rejects host mixing', () => {
    expect(parseSolverSupervisorInstallArgs(['--local', '--config=/work/config.json']).local).toBe(
      true,
    );
    expect(() =>
      parseSolverSupervisorInstallArgs(['--local', '--host=h2puni', '--config=/work/config.json']),
    ).toThrow('cannot combine');
  });
  it('is dry-run by default and requires an explicit local config', () => {
    expect(parseSolverSupervisorInstallArgs(['--config=/work/config.json'])).toEqual({
      host: 'h2puni',
      execute: false,
      config: '/work/config.json',
    });
    expect(() => parseSolverSupervisorInstallArgs([])).toThrow('--config=');
    expect(() =>
      parseSolverSupervisorInstallArgs(['--config=/work/config.json', '--host=host;reboot']),
    ).toThrow('invalid SSH host');
  });
});

describe('buildSolverSupervisorInstallPlan', () => {
  it('uses unique private staging and a single admitted service interval', () => {
    const hashes = Array.from({ length: 4 }, () => 'a'.repeat(64));
    const plan = buildSolverSupervisorInstallPlan('h2puni', '/work/config.json', SOCKET, hashes);
    const other = buildSolverSupervisorInstallPlan('h2puni', '/work/config.json', SOCKET, hashes);
    expect(plan[0]?.argv).toEqual([SOLVER_SUPERVISOR_BUN_SOURCE, '--version']);
    expect(plan.filter((step) => step.argv[0] === 'scp')).toHaveLength(4);
    expect(plan[1]?.argv).not.toEqual(other[1]?.argv);
    expect(plan.filter((step) => step.phase === 'service')).toHaveLength(1);
    const operation = plan.at(-1)?.argv.at(-1) ?? '';
    expect(operation).toContain('flock -n 9');
    expect(operation).toContain('daemon-reload');
    expect(operation).toContain('sha256sum -c -');
  });
});

function dependencies(
  config: string,
  seen: string[],
  bunVersion = '1.4.2\n',
): SolverSupervisorInstallerDependencies {
  return {
    read: () => Promise.resolve(new TextEncoder().encode(config)),
    exists: () => Promise.resolve(true),
    hash: () => Promise.resolve('a'.repeat(64)),
    command: (argv) => {
      seen.push(argv.join(' '));
      return Promise.resolve({ code: 0, stdout: bunVersion, stderr: '' });
    },
  };
}

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error: unknown) {
    if (error instanceof Error) return error;
    throw new Error(`expected Error rejection, got ${String(error)}`, { cause: error });
  }
  throw new Error('expected rejection');
}

describe('installSolverSupervisor', () => {
  it('keeps every host version with recorded compatibility evidence', () => {
    expect(SOLVER_SUPERVISOR_BUN_VERSIONS).toEqual(MEASURED_BUN_VERSIONS);
  });

  it('rejects an invalid config before any remote command', async () => {
    const seen: string[] = [];
    const error = await rejectionOf(
      installSolverSupervisor(
        { host: 'h2puni', execute: true, config: '/work/config.json' },
        dependencies('{}', seen),
      ),
    );
    expect(error.message).toContain('missing key socketPath');
    expect(seen).toEqual([]);
  });

  it('rejects a different user runtime socket before any remote command', async () => {
    const seen: string[] = [];
    const config = JSON.stringify({
      ...JSON.parse(CONFIG),
      socketPath: '/run/user/1001/wbs-solver/supervisor.sock',
    });
    const error = await rejectionOf(
      installSolverSupervisor(
        { host: 'h2puni', execute: true, config: '/work/config.json' },
        dependencies(config, seen),
      ),
    );
    expect(error.message).toContain('/run/user/1000/wbs-solver/supervisor.sock');
    expect(seen).toEqual([]);
  });

  it('rejects the wrong Bun before any remote mutation', async () => {
    const seen: string[] = [];
    const error = await rejectionOf(
      installSolverSupervisor(
        { host: 'h2puni', execute: true, config: '/work/config.json' },
        dependencies(CONFIG, seen, '1.3.13\n'),
      ),
    );
    expect(error.message).toContain(`requires ${SOLVER_SUPERVISOR_BUN_SOURCE} at 1.4.2`);
    expect(seen).toEqual([`${SOLVER_SUPERVISOR_BUN_SOURCE} --version`]);
  });

  it('rejects Bun 1.2.20, whose shipped listener exposes no accepted socket fd', async () => {
    const seen: string[] = [];
    const error = await rejectionOf(
      installSolverSupervisor(
        { host: 'h2puni', execute: true, config: '/work/config.json' },
        dependencies(CONFIG, seen, '1.2.20\n'),
      ),
    );
    expect(error.message).toContain('got 1.2.20');
    expect(seen).toEqual([`${SOLVER_SUPERVISOR_BUN_SOURCE} --version`]);
  });

  it('retains attempt and expected hashes when a transport cannot spawn', async () => {
    const boundary = dependencies(CONFIG, []);
    let commands = 0;
    boundary.command = () => {
      commands++;
      if (commands > 1) return Promise.reject(new Error('ENOENT transport'));
      return Promise.resolve({ code: 0, stdout: '1.4.2', stderr: '' });
    };
    const failure = await rejectionOf(
      installSolverSupervisor(
        { host: 'h2puni', execute: true, config: '/work/config.json' },
        boundary,
      ),
    );
    expect(failure.message).toContain('ENOENT transport');
    expect(failure.message).toContain('partial or uncertain');
    expect(failure.message).toContain('attempt=');
    expect(failure.message).toContain('expected SHA-256:');
    expect(failure.message).toContain('a'.repeat(64));
  });

  it('runs one host publication operation after staging', async () => {
    const seen: string[] = [];
    await installSolverSupervisor(
      { host: 'h2puni', execute: true, config: '/work/config.json' },
      dependencies(CONFIG, seen),
    );
    expect(seen[0]).toBe(`${SOLVER_SUPERVISOR_BUN_SOURCE} --version`);
    expect(seen.filter((entry) => entry.startsWith('scp '))).toHaveLength(4);
    expect(seen.filter((entry) => entry.includes('daemon-reload'))).toHaveLength(1);
    expect(seen.at(-1)).toContain('flock -n 9');
  });
});

for (const version of ['1.4.3', '1.2.20', '', 'not-a-version', '1.4.4\\n1.4.2'])
  it(`rejects unmeasured or malformed Bun ${JSON.stringify(version)} before mutation`, async () => {
    const seen: string[] = [];
    const error = await rejectionOf(
      installSolverSupervisor(
        { host: 'h2puni', execute: true, config: '/work/config.json' },
        dependencies(CONFIG, seen, version),
      ),
    );
    expect(error.message).toContain('solver supervisor requires');
    expect(seen).toEqual([`${SOLVER_SUPERVISOR_BUN_SOURCE} --version`]);
  });
for (const version of ['1.4.2', '1.4.4'])
  it(`admits explicitly measured Bun ${version}`, async () => {
    const seen: string[] = [];
    await installSolverSupervisor(
      { host: 'h2puni', execute: true, config: '/work/config.json' },
      dependencies(CONFIG, seen, version),
    );
    expect(seen.length).toBeGreaterThan(1);
  });

it('first-reader installation requires independent selected target and never borrows the default host', async () => {
  await rejects(
    prepareSolverReaderInstallation({
      host: '',
      execute: false,
      selection: undefined,
    }),
    /selected/,
  );
});
