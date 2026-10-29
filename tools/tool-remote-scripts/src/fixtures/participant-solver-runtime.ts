import { createConnection, createServer } from 'node:net';
import { join } from 'node:path';

import { assertParticipantRestorationContext } from '../lib/complete-dependency-exclusion';
import type { FinalizedParticipantRestorationContext } from '../lib/dependency-participant-preparation';
import { SOLVER_EDGE_STATE, type SolverRestorePorts } from '../lib/solver-host';
import type { productProcessFixture } from './dependency-product-process';

/** Raw fixture service transition with a real owned socket; it returns no readiness or authority observation. */
export function createParticipantSolverRuntime(
  fixture: Pick<Awaited<ReturnType<typeof productProcessFixture>>, 'root' | 'ports'>,
) {
  const base = fixture.ports.solver;
  const runHost = base.runHost;
  const observeCgroup = base.observeCgroup;
  const socketPath = join(fixture.root, 'solver-backend-ready.sock');
  const server = createServer((connection) => connection.destroy());
  let originalUnit: string | undefined;
  let context: FinalizedParticipantRestorationContext | undefined;
  let starts = 0;
  let connections = 0;
  let isProcessDrifted = false;
  const events: string[] = [];
  const ports: SolverRestorePorts = {
    ...base,
    runHost: async (command, signal) => {
      signal?.throwIfAborted();
      if (command.kind === 'start') {
        if (context === undefined || originalUnit === undefined)
          throw new Error('solver start preceded original context or active unit capture');
        await assertParticipantRestorationContext(context);
        if (starts !== 0) throw new Error('fixture solver started twice');
        starts++;
        events.push('solver-start');
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject);
          server.listen(socketPath, () => {
            server.removeListener('error', reject);
            resolve();
          });
        });
        return '';
      }
      if (starts === 1 && command.kind === 'show') {
        if (originalUnit === undefined) throw new Error('original solver unit absent');
        return originalUnit;
      }
      const unit = await runHost(command, signal);
      if (command.kind === 'show' && unit.includes('ActiveState=active\n')) originalUnit = unit;
      return unit;
    },
    observeProcess: async (pid) => {
      const observed = await base.observeProcess(pid);
      return isProcessDrifted ? { ...observed, startTime: '12346' } : observed;
    },
    observeCgroup: async (...args) => {
      const observed = await observeCgroup(...args);
      return starts === 1 && observed !== null ? { ...observed, populated: true } : observed;
    },
    connectSocket: async (signal) => {
      if (starts !== 1) throw new Error('socket preceded fixed solver start');
      await new Promise<void>((resolve, reject) => {
        const connection = createConnection({ path: socketPath, signal });
        connection.once('connect', () => {
          connections++;
          connection.destroy();
          resolve();
        });
        connection.once('error', (cause) => {
          connection.destroy();
          reject(cause);
        });
      });
    },
  };
  Object.assign(fixture.ports, { solver: ports });
  Object.assign(fixture.ports.authorities, {
    solver: {
      ...ports,
      runHost: async (
        command: Parameters<SolverRestorePorts['runHost']>[0],
        signal?: AbortSignal,
      ) =>
        (await ports.runHost(command, signal)).replace(
          `WBS_EDGE_STATE=${fixture.root}`,
          `WBS_EDGE_STATE=${SOLVER_EDGE_STATE}`,
        ),
    },
  });
  return {
    ports,
    events,
    bindContext: (original: FinalizedParticipantRestorationContext) => {
      context = original;
    },
    setProcessDrift: (isDrifted: boolean) => {
      isProcessDrifted = isDrifted;
    },
    readSolverStarts: () => starts,
    readSocketConnections: () => connections,
    closeRuntime: async () => {
      if (server.listening)
        await new Promise<void>((resolve, reject) => {
          server.close((cause) => {
            if (cause === undefined) resolve();
            else reject(cause);
          });
        });
    },
  };
}
