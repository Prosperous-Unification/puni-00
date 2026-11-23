import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { closeSync, existsSync, writeFileSync } from 'node:fs';
import { Socket } from 'node:net';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';

import { isGatedPayloadCommand, parseDashCommand } from '../../cli-parser';
import { monotonicClock } from '../../clock';
import { encodeGatedEnvironment } from '../gated-payload-protocol';

const [role, root, scenario] = Array.from({ length: 3 }, (_, index) => process.argv.at(index + 2));
if (root === undefined || scenario === undefined)
  throw new Error('missing native observer operands');
if (role === 'payload') {
  if (scenario.startsWith('numeric-reject')) closeSync(2);
  writeFileSync(join(root, 'payload-ready'), String(process.pid));
  if (scenario.startsWith('numeric-reject'))
    while (!existsSync(join(root, 'release-payload'))) await Bun.sleep(1);
  process.exitCode = 37;
} else if (role === 'helper') {
  const nativeSpawn = Bun.spawn;
  const helperRoot = root,
    mode = scenario;
  // This external capability wrapper accepts the one actual production inherited-IO spawn;
  // it preserves the real child and actual callback fields, varying only the exposed boundary.
  function observedSpawn(
    argv: readonly string[],
    options: Bun.Spawn.SpawnOptions<'inherit', 'inherit', 'inherit'>,
  ) {
    const callback = options.onExit?.bind(options);
    const child = nativeSpawn([...argv], {
      ...options,
      onExit(child, code, signal, cause) {
        writeFileSync(
          join(helperRoot, 'actual-native-callback.json'),
          JSON.stringify({ code, signal, hadCause: cause !== undefined }),
        );
        if (mode === 'missing-callback') return;
        if (mode === 'callback-invalid') {
          void callback?.(child, -1, null, undefined);
          return;
        }
        if (mode === 'callback-error') {
          void callback?.(child, code, signal, new Error('controlled native callback error'));
          return;
        }
        if (mode === 'callback-after-numeric') {
          setTimeout(() => {
            void callback?.(child, code, signal, cause);
          }, 250);
          return;
        }
        void callback?.(child, code, signal, cause);
      },
    });
    if (
      mode.startsWith('numeric-reject') ||
      mode === 'numeric-mismatch' ||
      mode === 'numeric-pending'
    ) {
      const projected =
        mode === 'numeric-mismatch'
          ? child.exited.then((status) => status + 1)
          : mode === 'numeric-pending'
            ? new Promise<number>(() => undefined)
            : Promise.reject(new Error('private-native-' + randomBytes(32).toString('hex')));
      return new Proxy(child, {
        get(target, key) {
          if (key === 'exited') return projected;
          const value: unknown = Reflect.get(target, key, target);
          return value;
        },
      });
    }
    return child;
  }
  Object.defineProperty(Bun, 'spawn', { value: observedSpawn });
  const { runGatedPayload } = await import('../gated-payload');
  const request = parseDashCommand([
    'ops',
    'job',
    'payload-internal-v1',
    '--',
    process.execPath,
    '--no-env-file',
    '--config=/dev/null',
    import.meta.path,
    'payload',
    root,
    scenario,
  ]);
  if (!isGatedPayloadCommand(request)) throw new Error('invalid observer request');
  // No top-level await or fixture polling tail owns the operation's retained lifetime.
  void runGatedPayload(request, { callerDirectory: root, monotonic: monotonicClock() }).then(
    (status) => {
      writeFileSync(join(root, 'helper-completed.json'), JSON.stringify({ status }));
      process.exitCode = status;
    },
    () => {
      writeFileSync(join(root, 'helper-completed.json'), JSON.stringify({ failed: true }));
      process.exitCode = 1;
    },
  );
} else if (role === 'controller') {
  const launch = createLaunch(process.execPath, import.meta.path);
  const child = spawn(launch[0] ?? '', [...launch.slice(1), 'helper', root, scenario], {
    cwd: root,
    env: { PATH: process.env['PATH'] },
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe', 'pipe'],
  });
  const control = child.stdio.at(3),
    status = child.stdio.at(4),
    environment = child.stdio.at(5),
    stderr = child.stderr;
  if (
    !(control instanceof Socket) ||
    !(status instanceof Socket) ||
    !(environment instanceof Socket) ||
    stderr === null
  )
    throw new Error('native observer pipes absent');
  const nativeEnded = once(child, 'exit'),
    statusEnded = once(status, 'end');
  let diagnostics = '',
    statusText = '';
  stderr.on('data', (bytes: Buffer) => {
    diagnostics += bytes.toString('utf8');
  });
  status.on('data', (bytes: Buffer) => {
    statusText += bytes.toString('utf8');
  });
  const frame = encodeGatedEnvironment({
    PATH: process.env['PATH'],
    PRIVATE_CANARY: randomBytes(32).toString('hex'),
  });
  await new Promise<void>((resolve, reject) =>
    environment.end(frame, (cause?: Error | null) => {
      if (cause) reject(cause);
      else resolve();
    }),
  );
  await new Promise<void>((resolve, reject) =>
    control.write('start\n', (cause) => {
      if (cause) reject(cause);
      else resolve();
    }),
  );
  const readyDeadline = performance.now() + 4000;
  while (!existsSync(join(root, 'payload-ready'))) {
    if (performance.now() >= readyDeadline) throw new Error('actual native payload did not start');
    await Bun.sleep(1);
  }
  control.end();
  const expected = 'error: gated payload ownership or private protocol failed\n';
  let pending = false,
    nativeBefore = false,
    beforeDiagnosticCount = 0;
  if (!['callback-after-numeric', 'numeric-mismatch', 'numeric-pending'].includes(scenario)) {
    const diagnosticDeadline = performance.now() + 1700;
    while (diagnostics === '' && performance.now() < diagnosticDeadline) await Bun.sleep(5);
    await Bun.sleep(1100);
    beforeDiagnosticCount = diagnostics.split(expected).length - 1;
    pending = child.exitCode === null && !existsSync(join(root, 'helper-completed.json'));
    nativeBefore = existsSync(join(root, 'actual-native-callback.json'));
    if (scenario === 'numeric-reject-callback')
      writeFileSync(join(root, 'release-payload'), 'release');
    else child.kill('SIGKILL');
  }
  if (
    [
      'callback-after-numeric',
      'numeric-reject-callback',
      'numeric-mismatch',
      'numeric-pending',
    ].includes(scenario)
  )
    await statusEnded;
  const ending: unknown = await nativeEnded;
  if (!Array.isArray(ending)) throw new Error('invalid native observer exit');
  const code: unknown = ending[0],
    signal: unknown = ending[1];
  writeFileSync(
    join(root, 'native-observation.json'),
    JSON.stringify({
      scenario,
      pending,
      nativeBefore,
      beforeDiagnosticCount,
      code,
      signal,
      status: statusText,
      diagnosticCount: diagnostics.split(expected).length - 1,
      diagnosticCanonical: diagnostics === '' || diagnostics === expected,
      diagnosticHash: createHash('sha256').update(diagnostics).digest('hex'),
      frameHash: createHash('sha256').update(frame).digest('hex'),
      actualNativeCallback: existsSync(join(root, 'actual-native-callback.json')),
    }),
  );
} else throw new Error('unknown native observer role');
