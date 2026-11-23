import { mock } from 'bun:test';

import { parseDashCommand } from '../../cli-parser';
import { monotonicClock, wallClock } from '../../clock';
import { ampleHost } from '../../resources/host-pool.test.fixture';
import { privateLegacyLock } from '../../resources/legacy-lock.test.fixture';
import type { OpsDependencies } from '../commands';
import * as nativeJob from '../job-run';
import { fakeScopeTelemetry } from '../ops.test.fixture';

const captured: unknown[] = [];
const original = { ...nativeJob };
await mock.module('../job-run', () => ({
  ...original,
  runHostJob: (
    request: Parameters<typeof nativeJob.runHostJob>[0],
    deps: Parameters<typeof nativeJob.runHostJob>[1],
  ) => {
    captured.push({
      argv: request.argv,
      helperPrefix: deps.helperPrefix,
      cwd: deps.cwd,
      environment: deps.environment,
    });
    return Promise.resolve(37);
  },
  calibrateHostJob: (
    request: Parameters<typeof nativeJob.calibrateHostJob>[0],
    deps: Parameters<typeof nativeJob.calibrateHostJob>[1],
  ) => {
    captured.push({
      argv: request.argv,
      helperPrefix: deps.helperPrefix,
      cwd: deps.cwd,
      environment: deps.environment,
    });
    return Promise.resolve(37);
  },
}));
const { opsHandlers } = await import('../commands');
for (const mode of ['run', 'calibrate']) {
  const parsed = parseDashCommand([
    'ops',
    'job',
    mode,
    '--config',
    '/original/config',
    '--type',
    'original-type',
    '--',
    'original-payload',
  ]);
  if (parsed.command !== 'ops' || (parsed.words !== 'job run' && parsed.words !== 'job calibrate'))
    throw new Error('unexpected grammar');
  const argv = [...parsed.argv],
    prefix = ['/selected/protected', 'dash'],
    environment = { PATH: '/original/path' },
    gate = Promise.withResolvers<undefined>();
  const deps: OpsDependencies = {
    helperPrefix: prefix,
    environment,
    cwd: '/original/cwd',
    clock: wallClock(),
    monotonic: monotonicClock(),
    stdout: () => undefined,
    stderr: () => undefined,
    telemetry: fakeScopeTelemetry('/unused'),
    host: ampleHost,
    user: 'fixture',
    connect: () => {
      throw new Error('unexpected connection');
    },
    legacyLock: async () => {
      await gate.promise;
      return privateLegacyLock('/unused');
    },
  };
  const request = { ...parsed, argv };
  const operation =
    request.words === 'job run'
      ? opsHandlers['job run'](request, deps)
      : opsHandlers['job calibrate'](request, deps);
  argv[0] = 'mutated-payload';
  prefix[0] = '/mutated/helper';
  environment.PATH = '/mutated/path';
  // This external caller owns mutable aliases; readonly API views do not freeze the objects.
  Object.defineProperty(deps, 'cwd', { value: '/mutated/cwd' });
  gate.resolve(undefined);
  await operation;
}
process.stdout.write(JSON.stringify(captured));
