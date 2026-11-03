import { mock } from 'bun:test';

import { decodeSolverSupervisorConfig } from '../lib/solver-supervisor-config';

const decode = decodeSolverSupervisorConfig;
const unix = process.env['TEST_SOLVER_SOCKET'];
if (unix === undefined) throw new Error('missing fixture transport');
await mock.module('../lib/solver-supervisor-config', () => ({
  decodeSolverSupervisorConfig(value: unknown, now?: () => number) {
    const options = decode(value, now);
    return { ...options, connection: { ...options.connection, unix } };
  },
}));
