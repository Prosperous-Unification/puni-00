import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { buildSolverRequestPair } from '../../service/solver-request-pair';
import type { ReservedSpawnRequest } from '../optimization/contract';
import { installSolverSupervisor } from './check';
import { SOLVER_SUPERVISOR_LABEL } from './contract';
import { solverSupervisorModule } from './module';
import type {
  SolverSupervisorAttempt,
  SolverSupervisorRequest,
} from './solver-supervisor.repository';

const INPUT: ScheduleInput = {
  rows: [{ id: 'w-1', parentId: null, position: 10, frozenNumber: null, priority: null }],
  edges: [],
  slices: [
    {
      workItemId: 'w-1',
      stepId: 's-1',
      days: 1,
      personId: null,
      width: 1,
      poolIds: [],
    },
  ],
  notBefore: new Map(),
  poolSizes: new Map(),
  reach: 'whole-item',
  deadlines: new Map(),
};

function reservedRequest(): ReservedSpawnRequest {
  const built = buildSolverRequestPair(INPUT, '0.1.0', 60_000).pri;
  if (!built.ok) throw new Error('fixture request did not pass preflight');
  return {
    key: {
      projectId: '11111111-1111-4111-8111-111111111111',
      inputHash: 'input-hash',
      contractVersion: '7+0.1.0',
      budgetMs: 60_000,
    },
    objective: 'pri',
    generation: 7,
    admission: {
      kind: 'reserved',
      attemptToken: '22222222-2222-4222-8222-222222222222',
      admittedCancelEpoch: 3,
      childDeadlineAt: 70_000,
      admittedDeadlineAt: 85_000,
    },
    request: { ...built.request },
    input: INPUT,
  };
}

/** A connector that records the one wire request it is handed and answers a started attempt. */
function recordingConnector(): {
  connect: (request: SolverSupervisorRequest) => Promise<SolverSupervisorAttempt>;
  requests: SolverSupervisorRequest[];
} {
  const requests: SolverSupervisorRequest[] = [];
  return {
    requests,
    connect: (request) => {
      requests.push(request);
      return Promise.resolve({
        pid: 4321,
        stdout: new ReadableStream<Uint8Array>(),
        stderr: new ReadableStream<Uint8Array>(),
        terminal: Promise.resolve({
          type: 'terminal' as const,
          exitCode: 0,
          deadlineKilled: false,
          oomKilled: false,
        }),
        verdict: () => Promise.resolve(),
        kill: () => Promise.resolve(),
      });
    },
  };
}

const hostRequirements = () => ({
  unix: DiBag.createProvider(() => '/run/wbs-solver/supervisor.sock', {
    factoryReturnKind: 'sync-value',
  }),
  callerId: DiBag.createProvider(() => 'a'.repeat(12), { factoryReturnKind: 'sync-value' }),
  searchWorkers: DiBag.createProvider(() => 2, { factoryReturnKind: 'sync-value' }),
  connect: DiBag.createProvider(() => recordingConnector().connect, {
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
    .withInstalledModules([solverSupervisorModule])
    .withServices({
      ...hostRequirements(),
      memoryLimitMb: DiBag.createProvider(() => 512, { factoryReturnKind: 'sync-value' }),
    })
    .buildContainer();

describe('the Solver supervisor module', () => {
  it('hands the reserved attempt to the connector installSolverSupervisor wires', async () => {
    const { connect, requests } = recordingConnector();
    const { spawner } = installSolverSupervisor({
      unix: '/run/wbs-solver/supervisor.sock',
      callerId: 'a'.repeat(12),
      searchWorkers: 2,
      memoryLimitMb: 512,
      connect,
    });
    const request = reservedRequest();

    const child = await spawner(request);

    expect(requests).toEqual([
      {
        unix: '/run/wbs-solver/supervisor.sock',
        callerId: 'aaaaaaaaaaaa',
        projectId: request.key.projectId,
        objective: 'pri',
        attemptToken: request.admission.attemptToken,
        childDeadlineAt: request.admission.childDeadlineAt,
        searchWorkers: 2,
        memoryLimitMb: 512,
        request: { ...request.request },
      },
    ]);
    expect(child.pid).toBe(4321);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `SolverSupervisorExports`, so
   * only enumerating the returned surface catches a leak the type checker
   * would not.
   */
  it('exposes only the contract exports from its installer', () => {
    const exposed: object = installSolverSupervisor({
      unix: '/run/wbs-solver/supervisor.sock',
      callerId: 'a'.repeat(12),
      searchWorkers: 2,
      memoryLimitMb: 512,
    });

    expect(Object.keys(exposed)).toEqual(['spawner']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('supervisorOptions'),
    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "supervisorOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.graphSnapshot().bindings.map((binding) => binding.bindingLabel)).toContain(
      `${SOLVER_SUPERVISOR_LABEL}/supervisorOptions`,
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
      .withInstalledModules([solverSupervisorModule])
      .withServices(hostRequirements()) as unknown as {
      buildContainer: () => { resolve: (key: string) => unknown };
    };
    const host = partial.buildContainer();

    expect(() => host.resolve('spawner')).toThrow(
      `Cannot resolve "${SOLVER_SUPERVISOR_LABEL}/supervisorOptions": dependency "memoryLimitMb" is not registered. Resolution path: spawner -> ${SOLVER_SUPERVISOR_LABEL}/supervisorOptions -> memoryLimitMb.`,
    );
  });
});
