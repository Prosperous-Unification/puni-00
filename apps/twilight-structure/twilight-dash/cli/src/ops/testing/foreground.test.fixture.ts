import { appendFileSync } from 'node:fs';

import { runForeground } from '../foreground';
const args = process.argv.slice(2),
  path = args.at(0),
  directory = args.at(1),
  recordOperand = args.at(2),
  program = args.at(3),
  argv = args.slice(4);
if (
  path === undefined ||
  directory === undefined ||
  recordOperand === undefined ||
  program === undefined
)
  throw new Error('foreground fixture arguments missing');
const record = recordOperand;
const controller = new AbortController();
process.on('SIGTERM', () => {
  controller.abort();
});
process.on('SIGINT', () => {
  controller.abort();
});
const fault = process.env['PUNI_FOREGROUND_FAULT'];
if (fault !== undefined) {
  const nativeSpawn = Bun.spawn;
  const intercepted = (
    argv: string[],
    options: Bun.Spawn.SpawnOptions<'inherit', 'inherit', 'inherit'>,
  ) => {
    const observe = options.onExit?.bind(options);
    if (observe === undefined)
      throw new Error('foreground fixture requires native exit observation');
    const child = nativeSpawn(argv, {
      ...options,
      onExit(native, code, signal, cause) {
        if (fault === 'missing-callback') return;
        return observe(
          native,
          fault === 'missing-identity' ? null : code,
          fault === 'missing-identity' ? null : signal,
          fault === 'native-wait-error' ? new Error('controlled native wait failure') : cause,
        );
      },
    });
    if (fault === 'missing-callback') {
      // Model loss of ambient references independently: only runForeground may retain unknown native authority.
      child.unref();
      process.removeAllListeners('SIGINT');
      process.removeAllListeners('SIGTERM');
    }
    return new Proxy(child, {
      get(native, key) {
        if (key === 'exited') {
          if (fault === 'false-status') return Promise.resolve(0);
          if (fault === 'invalid-status') return Promise.resolve(Number.NaN);
          if (fault === 'reject-wait')
            return Promise.reject(new Error('controlled exited promise rejection'));
          if (fault === 'pending-status') return new Promise<number>(() => undefined);
        }
        const value: unknown = Reflect.get(native, key, native);
        return value;
      },
    });
  };
  // This owned test process uses only the exact argv/inherited-stdio overload; the proxy deliberately faults its exit observation.
  Bun.spawn = intercepted as typeof Bun.spawn;
}

const running = runForeground(
  { label: 'fixture', waitSeconds: 0, pollSeconds: 1, argv: [program, ...argv] },
  {
    path,
    directory,
    environment: { LOCK_FIXTURE_TOKEN: 'explicit value', PATH: process.env['PATH'] },
    signal: controller.signal,
    reportAdmission: async (admission) => {
      await Bun.sleep(20);
      appendFileSync(record, JSON.stringify(admission) + String.fromCharCode(10));
    },
    reportUnconfirmed: (observation) => {
      appendFileSync(record, 'unconfirmed ' + String(observation.pid) + String.fromCharCode(10));
      return Promise.resolve();
    },
  },
);
function recordCompletion(outcome: Awaited<ReturnType<typeof runForeground>>): void {
  appendFileSync(record + '.outcome', JSON.stringify(outcome));
  if (outcome.kind !== 'completed') throw new Error('unexpected foreground fixture outcome');
  if (outcome.value.kind === 'failed') process.exitCode = 70;
  else if (outcome.value.kind === 'exited' || outcome.value.kind === 'not-started')
    process.exitCode = outcome.value.status;
  else throw new Error('unexpected foreground fixture cancellation');
}
if (fault === 'missing-callback') {
  // Observe both tails without a top-level await: Bun1.4.4 keeps unresolved top-level awaits alive independently.
  void running.then(recordCompletion).catch((cause: unknown) => {
    console.error(cause);
    process.exit(70);
  });
} else recordCompletion(await running);
