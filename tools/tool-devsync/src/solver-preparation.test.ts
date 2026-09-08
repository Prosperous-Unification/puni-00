import { describe, expect, it } from 'bun:test';

import {
  decodeSolverPreparationState,
  runTargetPinnedSolverPreparation,
  SOLVER_COMPATIBILITY_PATHS,
  solverCompatibilityIdentityAt,
  type SolverPreparationState,
} from './solver-preparation';

const SOURCE_SHA = 'a'.repeat(40);
const OTHER_SOURCE_SHA = 'b'.repeat(40);
const IDENTITY = 'c'.repeat(64);
const IMAGE = `registry.example/wbs-be@sha256:${'d'.repeat(64)}`;

const STATE: SolverPreparationState = {
  schemaVersion: 1,
  compatibilityIdentity: IDENTITY,
  sourceSha: SOURCE_SHA,
  image: IMAGE,
  phase: 'published',
};

const stateBytes = (state: unknown = STATE): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(state));

describe('the solver compatibility identity', () => {
  it('moves for a solver byte and stays put for an unrelated source change', async () => {
    const solverTreeA = '1'.repeat(40);
    const solverTreeB = '2'.repeat(40);
    const dockerfile = '3'.repeat(40);
    const objects = new Map([
      [`${SOURCE_SHA}:libs/solver-py`, solverTreeA],
      [`${SOURCE_SHA}:apps/be-01/Dockerfile`, dockerfile],
      [`${OTHER_SOURCE_SHA}:libs/solver-py`, solverTreeA],
      [`${OTHER_SOURCE_SHA}:apps/be-01/Dockerfile`, dockerfile],
      [`${'e'.repeat(40)}:libs/solver-py`, solverTreeB],
      [`${'e'.repeat(40)}:apps/be-01/Dockerfile`, dockerfile],
    ]);
    const reads: string[] = [];
    const objectIdAt = (sourceSha: string, path: string): Promise<string> => {
      reads.push(`${sourceSha}:${path}`);
      const objectId = objects.get(`${sourceSha}:${path}`);
      if (objectId === undefined) throw new Error('fixture has no object id');
      return Promise.resolve(objectId);
    };

    const original = await solverCompatibilityIdentityAt(SOURCE_SHA, { objectIdAt });
    const unrelated = await solverCompatibilityIdentityAt(OTHER_SOURCE_SHA, { objectIdAt });
    const solverChanged = await solverCompatibilityIdentityAt('e'.repeat(40), { objectIdAt });

    expect(original).toBe(unrelated);
    expect(solverChanged).not.toBe(original);
    expect(reads.slice(0, 2)).toEqual(
      SOLVER_COMPATIBILITY_PATHS.map((path) => `${SOURCE_SHA}:${path}`),
    );
  });

  it('refuses an unreadable compatibility entry instead of hashing partial evidence', async () => {
    expect(
      await rejection(
        solverCompatibilityIdentityAt(SOURCE_SHA, {
          objectIdAt: (_sourceSha, path) =>
            path === 'libs/solver-py'
              ? Promise.resolve('1'.repeat(40))
              : Promise.resolve('(missing)'),
        }),
      ),
    ).toContain('invalid git object id');
  });
});

describe('durable solver preparation state', () => {
  it('decodes one complete published record', () => {
    expect(decodeSolverPreparationState(stateBytes())).toEqual(STATE);
  });

  it('refuses missing and partial state', () => {
    expect(() => decodeSolverPreparationState(undefined)).toThrow(/state is missing/);
    expect(() =>
      decodeSolverPreparationState(
        stateBytes({
          schemaVersion: 1,
          compatibilityIdentity: IDENTITY,
          sourceSha: SOURCE_SHA,
          phase: 'published',
        }),
      ),
    ).toThrow(/image/);
  });

  it('refuses a non-immutable image identity', () => {
    expect(() =>
      decodeSolverPreparationState(stateBytes({ ...STATE, image: 'registry.example/wbs-be:main' })),
    ).toThrow(/digest-pinned/);
  });
});

describe('the target-pinned solver preparation runner', () => {
  it('runs the target module from a separate target checkout', async () => {
    const invocations: { cwd: string; argv: readonly string[] }[] = [];

    await runTargetPinnedSolverPreparation(
      {
        root: '/home/puni1/wbs-dev/targets/solver-a',
        modulePath: '/home/puni1/wbs-dev/targets/solver-a/tools/tool-devsync/src/prepare-solver.ts',
        sourceSha: SOURCE_SHA,
        compatibilityIdentity: IDENTITY,
        statePath: '/home/puni1/wbs-dev/state/solver-preparation.json',
      },
      stateBytes(),
      {
        bunPath: '/home/puni1/wbs-dev/bin/bun',
        command: (invocation) => {
          invocations.push(invocation);
          return Promise.resolve({ exitCode: 0, stderr: '' });
        },
      },
    );

    expect(invocations).toEqual([
      {
        cwd: '/home/puni1/wbs-dev/targets/solver-a',
        argv: [
          '/home/puni1/wbs-dev/bin/bun',
          '/home/puni1/wbs-dev/targets/solver-a/tools/tool-devsync/src/prepare-solver.ts',
          `--source-sha=${SOURCE_SHA}`,
          `--compatibility-identity=${IDENTITY}`,
          '--state=/home/puni1/wbs-dev/state/solver-preparation.json',
        ],
      },
    ]);
  });

  it('refuses code imported from the old live checkout before host mutation', async () => {
    let commands = 0;

    expect(
      await rejection(
        runTargetPinnedSolverPreparation(
          {
            root: '/home/puni1/wbs-dev/src',
            modulePath: '/home/puni1/wbs-dev/src/tools/tool-devsync/src/prepare-solver.ts',
            sourceSha: SOURCE_SHA,
            compatibilityIdentity: IDENTITY,
            statePath: '/home/puni1/wbs-dev/state/solver-preparation.json',
          },
          stateBytes(),
          {
            bunPath: '/home/puni1/wbs-dev/bin/bun',
            command: () => {
              commands += 1;
              return Promise.resolve({ exitCode: 0, stderr: '' });
            },
          },
        ),
      ),
    ).toContain('old live checkout');
    expect(commands).toBe(0);
  });

  it('refuses missing, partial, and target-mismatched state before host mutation', async () => {
    let commands = 0;
    const target = {
      root: '/home/puni1/wbs-dev/targets/solver-a',
      modulePath: '/home/puni1/wbs-dev/targets/solver-a/prepare-solver.ts',
      sourceSha: SOURCE_SHA,
      compatibilityIdentity: IDENTITY,
      statePath: '/home/puni1/wbs-dev/state/solver-preparation.json',
    };
    const dependencies = {
      bunPath: '/home/puni1/wbs-dev/bin/bun',
      command: () => {
        commands += 1;
        return Promise.resolve({ exitCode: 0, stderr: '' });
      },
    };

    expect(
      await rejection(runTargetPinnedSolverPreparation(target, undefined, dependencies)),
    ).toContain('state is missing');
    expect(
      await rejection(
        runTargetPinnedSolverPreparation(
          target,
          stateBytes({ ...STATE, image: undefined }),
          dependencies,
        ),
      ),
    ).toContain('image');
    expect(
      await rejection(
        runTargetPinnedSolverPreparation(
          target,
          stateBytes({ ...STATE, sourceSha: OTHER_SOURCE_SHA }),
          dependencies,
        ),
      ),
    ).toContain('source SHA does not match target');
    expect(
      await rejection(
        runTargetPinnedSolverPreparation(
          target,
          stateBytes({ ...STATE, compatibilityIdentity: 'f'.repeat(64) }),
          dependencies,
        ),
      ),
    ).toContain('compatibility identity does not match target');
    expect(commands).toBe(0);
  });
});

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return '(resolved without throwing)';
  } catch (error) {
    return String(error);
  }
}
