import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { installSolverLauncher } from './check';
import { SOLVER_LAUNCHER_LABEL } from './contract';
import { solverLauncherModule } from './module';
import type {
  SolverLauncherProcess,
  SolverLauncherSpawnOptions,
  SolverVersionProbe,
} from './solver-launcher.repository';

/** A probe that answers one fixed version and records every command it was asked to run. */
function recordingProbe(version: string): { probe: SolverVersionProbe; commands: string[][] } {
  const commands: string[][] = [];
  return {
    commands,
    probe: (command) => {
      commands.push([...command]);
      return {
        exitCode: 0,
        stdout: new TextEncoder().encode(`${version}\n`),
        stderr: new Uint8Array(),
      };
    },
  };
}

const fakeProcess: SolverLauncherProcess = {
  pid: 42,
  stdin: { write: () => undefined, end: () => undefined },
  stdout: new ReadableStream<Uint8Array>(),
  stderr: new ReadableStream<Uint8Array>(),
  exited: Promise.resolve(0),
  kill: () => undefined,
};

const hostRequirements = () => ({
  probe: DiBag.createProvider(() => recordingProbe('9.9.9').probe, {
    factoryReturnKind: 'sync-value',
  }),
});

/**
 * A complete host graph.
 *
 * Written out rather than shared with the incomplete graph below: a helper
 * returning either registration object gives DI Bag's builder a union it
 * refuses at the type level, the same TS2345 every prior 040.6 module's own
 * `module.test.ts` records for its two graphs.
 */
const completeHost = () =>
  DiBag.createBuilder()
    .withInstalledModules([solverLauncherModule])
    .withServices({
      ...hostRequirements(),
      spawn: DiBag.createProvider(() => () => fakeProcess, { factoryReturnKind: 'sync-value' }),
    })
    .buildContainer();

describe('the Solver launcher module', () => {
  it('reads the installed version through the probe installSolverLauncher wires', () => {
    const { probe, commands } = recordingProbe('9.9.9');
    const { solverLauncher } = installSolverLauncher({ probe });

    expect(solverLauncher.readInstalledVersion()).toBe('9.9.9');
    expect(solverLauncher.readRuntimeVersion('production')).toBe('9.9.9');
    expect(commands).toEqual([
      ['wbs-solver-launcher', '--version'],
      ['wbs-solver-launcher', '--version'],
    ]);
  });

  /**
   * The moved file resolves the solver's source module relative to its own
   * location, so the move is exactly what could break this read. The probe
   * throws, so a version can only come from that source module; the expected
   * value is a shape rather than the literal, because a literal path read here
   * would be a second outside read `wbs-be-01:test` does not declare.
   *
   * Proof (2026-09-23): keeping the moved file's pre-move five-level
   * `new URL('../../../../../libs/…/__init__.py', import.meta.url)` failed this
   * test (6 pass, 1 fail) on `ENOENT: no such file or directory, open
   * '…/apps/libs/wbs/adapters/solver-py/src/wbs_solver/__init__.py'`.
   */
  it('reads the development version from the solver source module', () => {
    const { solverLauncher } = installSolverLauncher({
      probe: () => {
        throw new Error('the installed launcher must not run in source development');
      },
    });

    expect(solverLauncher.readRuntimeVersion('development')).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('spawns the launcher through the process seam installSolverLauncher wires', () => {
    const calls: SolverLauncherSpawnOptions[] = [];
    const { solverLauncher } = installSolverLauncher({
      spawn: (options) => {
        calls.push(options);
        return fakeProcess;
      },
    });

    const child = solverLauncher.spawn({
      attemptToken: 'attempt-1',
      childDeadlineAt: 12_345,
      searchWorkers: 2,
      memoryLimitMb: 512,
      request: { wireVersion: 1 },
    });

    expect(child.pid).toBe(42);
    expect(calls.map((options) => options.cmd[0])).toEqual(['wbs-solver-launcher']);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `SolverLauncherExports`, so
   * only enumerating the returned surface catches a leak the type checker
   * would not.
   */
  it('exposes only the contract exports from its installer', () => {
    const exposed: object = installSolverLauncher({});

    expect(Object.keys(exposed)).toEqual(['solverLauncher']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('launcherSeams'),
    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "launcherSeams" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.graphSnapshot().bindings.map((binding) => binding.bindingLabel)).toContain(
      `${SOLVER_LAUNCHER_LABEL}/launcherSeams`,
    );
  });

  /**
   * The label reaches a real DI failure message.
   *
   * A host that forgets a requirement is refused by the type checker, so the
   * cast reaches the runtime path an untyped or generated host reaches.
   */
  it('names itself when a host omits a requirement', () => {
    const partial = DiBag.createBuilder()
      .withInstalledModules([solverLauncherModule])
      .withServices(hostRequirements()) as unknown as {
      buildContainer: () => { resolve: (key: string) => unknown };
    };
    const host = partial.buildContainer();

    expect(() => host.resolve('solverLauncher')).toThrow(
      `Cannot resolve "${SOLVER_LAUNCHER_LABEL}/launcherSeams": dependency "spawn" is not registered. Resolution path: solverLauncher -> ${SOLVER_LAUNCHER_LABEL}/launcherSeams -> spawn.`,
    );
  });
});
