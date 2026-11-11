import { existsSync, writeFileSync } from 'node:fs';

import { mock } from 'bun:test';
const args = process.argv.slice(2),
  tree = args.at(0),
  commit = args.at(1),
  path = args.at(2),
  record = args.at(3),
  mode = args.at(4),
  gitExecutable = args.at(5);
if (
  tree === undefined ||
  commit === undefined ||
  path === undefined ||
  record === undefined ||
  mode === undefined ||
  gitExecutable === undefined
)
  throw Error('checkout fixture arguments missing');
if (mode === 'unknown' || mode === 'missing-callback' || mode === 'unknown-identity') {
  const spawn = Bun.spawn;
  // The owned scope uses only the argv overload; no other spawn calls exist in this fixture.
  Bun.spawn = ((...args: Parameters<typeof Bun.spawn>) => {
    const [argv, options] = args;
    if (!Array.isArray(argv) || options === undefined)
      throw Error('fixture only accepts explicit child argv');
    const callback = options.onExit?.bind(options);
    return spawn(argv, {
      ...options,
      onExit(native, code, signal) {
        if (mode === 'unknown')
          void callback?.(native, code, signal, new Error('controlled unknown native termination'));
        if (mode === 'unknown-identity') void callback?.(native, Number.NaN, signal, undefined);
      },
    });
  }) as typeof Bun.spawn;
}
if (mode === 'observer-throw' || mode === 'false-status' || mode === 'false-failure') {
  const spawn = Bun.spawn;
  // The owned scope uses only the argv overload; no other spawn calls exist in this fixture.
  Bun.spawn = ((...args: Parameters<typeof Bun.spawn>) => {
    const child = spawn(...args);
    return new Proxy(child, {
      get(target, key): unknown {
        if (key === 'exited') {
          if (mode === 'observer-throw') throw Error('controlled postspawn observer failure');
          return child.exited.then(() => (mode === 'false-failure' ? 37 : 0));
        }
        return Reflect.get(target, key, target);
      },
    });
  }) as typeof Bun.spawn;
}

if (mode === 'pending-cleanup') {
  const fs = await import('node:fs'),
    open = fs.openSync,
    close = fs.closeSync;
  let selected: number | undefined;
  await mock.module('node:fs', () => ({
    ...fs,
    openSync(
      path: string,
      ...rest: Parameters<typeof open> extends [unknown, ...infer Tail] ? Tail : never
    ) {
      const descriptor = open(path, ...rest);
      if (path === args.at(2)) selected = descriptor;
      return descriptor;
    },
    closeSync(descriptor: number) {
      close(descriptor);
      if (descriptor === selected) throw Error('controlled admission close failure');
    },
  }));
}
if (mode === 'kind-change') {
  const fs = await import('node:fs'),
    inspect = fs.lstatSync;
  let changed = false;
  await mock.module('node:fs', () => ({
    ...fs,
    lstatSync(
      path: string,
      ...rest: Parameters<typeof inspect> extends [unknown, ...infer Tail] ? Tail : never
    ) {
      if (path === tree + '/tracked' && !changed) {
        changed = true;
        fs.renameSync(path, record + '.type-backup');
        fs.mkdirSync(path, { mode: 0o755 });
      }
      return inspect(path, ...rest);
    },
  }));
}
const settlement = Promise.withResolvers<undefined>();
process.on('SIGUSR2', () => {
  settlement.resolve(undefined);
});
const pendingFile = record + '.pending';
async function pause(stage: string): Promise<void> {
  if (mode === 'pending-' + stage) {
    writeFileSync(pendingFile, stage);
    await settlement.promise;
  }
}
if (mode === 'final-signal' || mode === 'final-error-signal') {
  const immediate = globalThis.setImmediate;
  let checkpoints = 0;
  Object.defineProperty(globalThis, 'setImmediate', {
    value(callback: () => void) {
      checkpoints++;
      if (checkpoints !== 3) return immediate(callback);
      writeFileSync(record + '.git-wait', 'final-admitted-checkpoint');
      return immediate(() => {
        void (async () => {
          while (!existsSync(record + '.release')) await Bun.sleep(10);
          callback();
        })();
      });
    },
  });
}
const { runCheckout } = await import('../gate-checkout');
const execution = runCheckout(
  {
    tree,
    commit,
    settle:
      mode === 'finish-signal' ||
      mode === 'final-signal' ||
      mode === 'final-error-signal' ||
      mode === 'pending-cleanup' ||
      mode === 'kind-change'
        ? 'keep'
        : 'restore',
    repairModes: false,
  },
  {
    path,
    label: 'native gate transaction',
    waitSeconds: 10,
    pollSeconds: 1,
    gitExecutable,
    lookupPath: '/usr/bin:/bin',
    signal: new AbortController().signal,
    reportAdmission: async () => {
      writeFileSync(record + '.admitted', 'admitted');
      await pause('admission');
    },
    reportHead: async (head) => {
      writeFileSync(record + '.head', head);
      await pause('head');
    },
    reportFailure: async (failure) => {
      writeFileSync(record + '.failure', failure.phase);
      await pause(failure.phase === 'cleanup' ? 'cleanup' : 'failure');
      if (mode === 'final-error-signal') throw Error('controlled final recovery report failure');
    },
    reportUnconfirmed: () => {
      writeFileSync(record + '.unconfirmed', 'unconfirmed');
      return Promise.resolve();
    },
    work: async (scope) => {
      writeFileSync(record + '.work', 'entered');
      await pause('work');
      if (mode === 'restore-error-signal' || mode === 'final-error-signal') {
        const moved = Bun.spawnSync(
          ['/usr/bin/git', '-C', tree, 'update-ref', 'refs/heads/original', commit],
          {
            env: {
              PATH: '/usr/bin:/bin',
              GIT_CONFIG_GLOBAL: '/dev/null',
              GIT_CONFIG_SYSTEM: '/dev/null',
            },
            stdout: 'pipe',
            stderr: 'pipe',
          },
        );
        if (moved.exitCode !== 0) throw Error('fixture branch movement failed');
      }
      const program =
        'import{writeFileSync}from"node:fs";writeFileSync(' +
        JSON.stringify(record + '.payload') +
        ',"started");await Bun.sleep(150);writeFileSync(' +
        JSON.stringify(record + '.child-end') +
        ',"ended");' +
        (mode === 'false-status' ||
        mode === 'nonzero-signal' ||
        mode === 'restore-error-signal' ||
        mode === 'pending-failure'
          ? 'process.exitCode=37;'
          : '');
      const child = scope.runChild([
        process.execPath,
        '--no-env-file',
        '--config=/dev/null',
        '--eval',
        program,
      ]);
      if (mode === 'return-early') return 0;
      const status = await child;
      if (
        mode === 'cleanup-signal' ||
        mode === 'term-signal' ||
        mode === 'nonzero-signal' ||
        mode === 'restore-error-signal'
      ) {
        writeFileSync(record + '.cleanup', 'owned');
        while (!existsSync(record + '.release')) await Bun.sleep(10);
      }
      return status;
    },
  },
);
const persist = (outcome: unknown): void => {
  writeFileSync(
    record + '.outcome',
    JSON.stringify(outcome, (_key, value: unknown) =>
      value instanceof Error ? { message: value.message } : value,
    ),
  );
};
if (mode.startsWith('pending-')) {
  // No top-level-await, poll timer, watcher or active child backs up operation retention here.
  void execution.then(persist, (cause: unknown) => {
    persist({ kind: 'threw', message: cause instanceof Error ? cause.message : String(cause) });
  });
} else {
  persist(await execution);
}
